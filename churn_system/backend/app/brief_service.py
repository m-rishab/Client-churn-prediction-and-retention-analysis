"""Turns a scored client into a short plain-English retention brief.

Two paths, chosen automatically:

* **LLM path** - if an API key is configured, one call is made to an
  OpenAI-compatible ``/chat/completions`` endpoint (OpenAI, OpenLLM gateway,
  Groq, or any compatible host). The model only sees the anonymised scoring
  facts, never the Client_ID.
* **Template path** - if no key is set, or the call fails, a deterministic
  brief is built locally from the same facts. The app therefore always works,
  and every brief says which path produced it.

Configuration (all optional):

* ``BRIEF_LLM_API_KEY`` (falls back to ``OPENAI_API_KEY`` / ``OPENLLM_API_KEY``)
* ``BRIEF_LLM_BASE_URL`` (falls back to ``OPENLLM_ENDPOINT``; default OpenAI)
* ``BRIEF_LLM_MODEL``   (default ``gpt-4o-mini``)
"""
from __future__ import annotations

import hashlib
import json
import os
import re

import httpx

PROMPT_VERSION = "brief-v1"
DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o-mini"
TIMEOUT_S = float(os.environ.get("BRIEF_LLM_TIMEOUT_S", "20"))

_CACHE: dict[str, dict] = {}
_CACHE_MAX = 512

SYSTEM_PROMPT = (
    "You help a client-success team at an advisory firm. You write short, "
    "plain-English retention briefs from a churn-risk score.\n"
    "Rules:\n"
    "- Use ONLY the facts given. Never invent names, numbers or events.\n"
    "- Plain words, short sentences. Aim for a reading level a busy manager "
    "understands at a glance.\n"
    "- Never promise the client will stay. Describe patterns, not guarantees.\n"
    "- Do not give legal, financial or medical advice.\n"
    "Reply with JSON only, no markdown:\n"
    '{"summary": "<2 to 3 sentences>", '
    '"next_steps": ["<step>", "<step>", "<step>"]}'
)


def _api_key() -> str | None:
    for name in ("BRIEF_LLM_API_KEY", "OPENAI_API_KEY", "OPENLLM_API_KEY"):
        value = os.environ.get(name)
        if value and value.strip():
            return value.strip()
    return None


def _base_url() -> str:
    base = os.environ.get("BRIEF_LLM_BASE_URL") or os.environ.get("OPENLLM_ENDPOINT")
    if not base or not base.strip():
        base = DEFAULT_BASE_URL
    return base.strip().rstrip("/")


def _model() -> str:
    return (os.environ.get("BRIEF_LLM_MODEL") or DEFAULT_MODEL).strip()


def llm_configured() -> bool:
    return _api_key() is not None


# --------------------------------------------------------------------------- #
def build_context(result: dict, client: dict | None = None) -> dict:
    """Anonymised facts for one scored client. No Client_ID ever leaves here."""
    facts = {}
    for key, value in (client or {}).items():
        if key == "Client_ID" or value in (None, ""):
            continue
        facts[key] = value
    reasons = [
        {"detail": r.get("label"), "direction": r.get("direction")}
        for r in result.get("top_3_reasons", [])
    ]
    return {
        "risk_score": result.get("risk_score"),
        "risk_band": result.get("risk_band"),
        "segment": result.get("segment"),
        "recommended_action": result.get("recommended_action"),
        "expected_loss": result.get("expected_loss"),
        "top_reasons": reasons,
        "client_details": facts,
    }


def _template_brief(ctx: dict) -> dict:
    """Deterministic offline brief. Simple words only (reading grade <= 8)."""
    band = str(ctx.get("risk_band") or "Low")
    score = ctx.get("risk_score")
    segment = ctx.get("segment") or "Monitor"
    action = ctx.get("recommended_action") or "Review this client with your team."

    ups = [r["detail"] for r in ctx.get("top_reasons", [])
           if r.get("direction") == "up" and r.get("detail")]
    downs = [r["detail"] for r in ctx.get("top_reasons", [])
             if r.get("direction") == "down" and r.get("detail")]

    if band == "High":
        summary = (f"This client scores {score} out of 100, so the risk is high. "
                   f"The score sits in the {segment} group. Act soon.")
    elif band == "Medium":
        summary = (f"This client scores {score} out of 100, so the risk is medium. "
                   f"The score sits in the {segment} group. Keep an eye on it.")
    else:
        summary = (f"This client scores {score} out of 100, so the risk is low. "
                   f"The score sits in the {segment} group. No rush.")

    if ups:
        summary += " The main things that pushed the score up were: " + ", ".join(ups) + "."
    if downs:
        summary += " Things that helped were: " + ", ".join(downs) + "."

    steps = []
    if band == "High":
        steps.append(f"Follow the group plan: {action}")
        steps.append("Look at the top reasons and pick the one you can fix this week.")
        if ups and {"Days since last contact", "Engagement"} & set(ups):
            steps.append("Get in touch soon. Ask how the work is going.")
        else:
            steps.append("Write down what you plan to do, and when.")
    elif band == "Medium":
        steps.append("Book a short check-in to hear what the client needs.")
        steps.append("Watch the top reasons over the next few weeks.")
        steps.append("Bring it to your team if the score goes up.")
    else:
        steps.append("Keep the normal check-in routine.")
        steps.append("Give the client useful, helpful content.")
        steps.append("Re-check the score if their activity drops.")

    return {"summary": summary, "next_steps": steps[:3]}


# --------------------------------------------------------------------------- #
def _call_llm(ctx: dict) -> dict:
    """One OpenAI-compatible chat completion. Raises on any failure."""
    user = ("Here are the facts for one client:\n"
            + json.dumps(ctx, ensure_ascii=False)
            + "\nWrite the brief now.")
    response = httpx.post(
        f"{_base_url()}/chat/completions",
        headers={"Authorization": f"Bearer {_api_key()}",
                 "Content-Type": "application/json"},
        json={
            "model": _model(),
            "temperature": 0.3,
            "max_tokens": 400,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user},
            ],
        },
        timeout=TIMEOUT_S,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    return _parse_json(content)


def _parse_json(content: str) -> dict:
    """Accept a strict JSON object, or recover the first {...} block."""
    text = (content or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", text).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError("brief model did not return JSON")
        data = json.loads(match.group(0))
    summary = str(data.get("summary", "")).strip()
    steps = [str(s).strip() for s in (data.get("next_steps") or []) if str(s).strip()]
    if not summary or not steps:
        raise ValueError("brief model returned an incomplete brief")
    return {"summary": summary, "next_steps": steps[:3]}


def _cache_key(ctx: dict) -> str:
    blob = json.dumps([PROMPT_VERSION, _model(), ctx], sort_keys=True, default=str)
    return hashlib.sha256(blob.encode()).hexdigest()


def generate_brief(result: dict, client: dict | None = None) -> dict:
    """Return {summary, next_steps, source, model, cached, notice}."""
    ctx = build_context(result, client)
    model = _model() if llm_configured() else None
    key = _cache_key(ctx) if model else None

    if key and key in _CACHE:
        return {**_CACHE[key], "cached": True}

    if model is None:
        brief = _template_brief(ctx)
        return {**brief, "source": "template", "model": None, "cached": False,
                "notice": ("No AI key is set, so this brief was written by the built-in "
                           "template, not by an AI model.")}

    try:
        brief = _call_llm(ctx)
        out = {**brief, "source": "llm", "model": model, "cached": False, "notice": None}
    except Exception:  # noqa: BLE001 - always fall back, never break the page
        brief = _template_brief(ctx)
        out = {**brief, "source": "template", "model": None, "cached": False,
               "notice": ("The AI service could not be reached, so this brief was written "
                          "by the built-in template.")}

    if key:
        if len(_CACHE) >= _CACHE_MAX:
            _CACHE.clear()
        _CACHE[key] = out
    return out
