"""Backend tests. The model is never retrained; artifacts are read-only copies.

Run from churn_system/backend:  python -m pytest -q
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np
import pytest

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parents[1]
sys.path.insert(0, str(BACKEND))

# Import predict_utils from the repo root (read-only), pointing at the
# backend artifacts copies exactly as the app does.
_spec = importlib.util.spec_from_file_location(
    "predict_utils", ROOT / "predict_utils.py")
predict_utils = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(predict_utils)
predict_utils.MODEL_PATH = str(BACKEND / "artifacts" / "churn_model.joblib")
predict_utils.METADATA_PATH = str(BACKEND / "artifacts" / "model_metadata.json")


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c


SAMPLE_CLIENT = {
    "Client_Tenure_Months": 3, "Service_Type": "Fiber optic",
    "Support_Access": "No", "Engagement_Type": "Month-to-month",
    "Monthly_Client_Value": 95.0, "Cumulative_Client_Value": 285.0,
    "Engagement_Score": 35.0, "Compliance_Flags": 4,
    "Days_Since_Last_Engagement": 55,
}


# ---------------------------------------------------------------- parity --
def test_predict_matches_predict_utils(client):
    """POST /api/predict must equal predict_utils.score_client for 3 clients."""
    from app.main import get_model_service
    svc = get_model_service()
    samples = [
        SAMPLE_CLIENT,
        {"Client_Tenure_Months": 60, "Service_Type": "DSL", "Support_Access": "Yes",
         "Engagement_Type": "Two year", "Monthly_Client_Value": 45.5,
         "Cumulative_Client_Value": 2600, "Engagement_Score": 80,
         "Days_Since_Last_Engagement": 4},
        {"Client_Tenure_Months": 12, "Service_Type": "Fiber optic",
         "Support_Access": "No internet service", "Engagement_Type": "One year",
         "Monthly_Client_Value": 70.4, "Engagement_Score": 67.4,
         "Critical_Compliance_Issues": 2, "Report_Views": 1,
         "Content_Score_Trend_30D": -9},
    ]
    for sample in samples:
        r = client.post("/api/predict", json={**sample, "mode": "balanced"})
        assert r.status_code == 200, r.text
        got = r.json()
        expected = predict_utils.score_client(sample)
        assert np.allclose(got["risk_score"],
                           expected["churn_probability"] * 100, atol=0.05)
        assert got["segment"] == {"High risk + High value": "Save now",
                                  "High risk + Low value": "Automated nudge",
                                  "Low risk + High value": "Nurture",
                                  "Low risk + Low value": "Monitor"}[expected["segment"]]
        assert got["risk_band"] == ("High" if expected["risk_band"] == "High risk" else "Low")
        assert len(got["top_3_reasons"]) == 3
        assert {x["raw_reason"] for x in got["top_3_reasons"]} == \
            {x["feature"] for x in expected["top_reasons"]}


# ------------------------------------------------------------ validation --
def test_validation_bad_category_plain_english(client):
    r = client.post("/api/predict", json={"Service_Type": "Copper"})
    assert r.status_code == 422
    msg = r.json()["error"]
    assert "Plan must be one of" in msg and "Copper" in msg


def test_validation_out_of_range_plain_english(client):
    r = client.post("/api/predict", json={"Days_Since_Last_Engagement": 150})
    assert r.status_code == 422
    assert "between -51 and 102.2" in r.json()["error"]
    assert "150" in r.json()["error"]


def test_validation_missing_numeric_is_allowed(client):
    r = client.post("/api/predict", json={"Service_Type": "DSL",
                                          "Engagement_Type": "One year"})
    assert r.status_code == 200
    assert 0 <= r.json()["risk_score"] <= 100


def test_validation_unknown_field_rejected(client):
    r = client.post("/api/predict", json={"nonsense_field": 1})
    assert r.status_code == 422


# ----------------------------------------------------------------- save --
def test_save_false_writes_nothing_save_true_writes(client, tmp_path, monkeypatch):
    from app import db
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "test_history.db")
    before = db.count_predictions()
    r = client.post("/api/predict?save=false", json={**SAMPLE_CLIENT})
    assert r.status_code == 200
    assert db.count_predictions() == before
    r = client.post("/api/predict?save=true", json={**SAMPLE_CLIENT})
    assert r.status_code == 200
    assert db.count_predictions() == before + 1
    items = db.list_predictions(limit=1)
    assert items[0]["source"] == "single"
    assert items[0]["mode"] == "balanced"


# ---------------------------------------------------------------- batch --
def test_batch_mixed_valid_and_invalid(client, tmp_path, monkeypatch):
    from app import db
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "b.db")
    csv_bytes = (
        "Client_ID,Months with us,Plan,Contract length,Monthly payment\n"
        "A-001,10,Premium (Fiber),Month to month,80\n"
        "A-002,5,Copper,Month to month,80\n"          # bad category
        "A-003,-900,Standard (DSL),One year,50\n"     # out of range
    ).encode()
    r = client.post("/api/predict/batch",
                    files={"file": ("clients.csv", csv_bytes, "text/csv")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["count"] == 1
    assert body["rejected_count"] == 2
    reasons = " ".join(x["reason"] for x in body["rejected"])
    assert "Plan must be one of" in reasons
    assert "between" in reasons
    r2 = client.get("/api/predictions?source=batch&limit=1")
    assert r2.status_code == 200


def test_batch_rejects_over_5000_rows(client):
    rows = "Client_ID,Months with us\n" + "\n".join(
        f"X-{i},{i % 72}" for i in range(5001))
    r = client.post("/api/predict/batch",
                    files={"file": ("big.csv", rows.encode(), "text/csv")})
    assert r.status_code == 400


# --------------------------------------------------------------- what-if --
def test_what_if_direction_sign(client):
    base = {"Client_Tenure_Months": 12, "Service_Type": "Fiber optic",
            "Engagement_Type": "Month-to-month", "Engagement_Score": 40,
            "Days_Since_Last_Engagement": 45}
    r = client.post("/api/what-if", json={"client": base,
                                          "changes": {"Days_Since_Last_Engagement": 5}})
    assert r.status_code == 200
    body = r.json()
    assert body["delta"] < 0  # recent contact lowers the score
    assert "does not prove" in body["note"]


# ---------------------------------------------------------------- brief --
def _no_llm_keys(monkeypatch):
    for name in ("BRIEF_LLM_API_KEY", "OPENAI_API_KEY", "OPENLLM_API_KEY"):
        monkeypatch.delenv(name, raising=False)


def test_brief_template_when_no_key(client, monkeypatch):
    """No API key -> a deterministic template brief, never an error."""
    from app import brief_service
    _no_llm_keys(monkeypatch)
    brief_service._CACHE.clear()
    r = client.post("/api/brief", json={**SAMPLE_CLIENT, "mode": "balanced"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "template"
    assert body["model"] is None
    assert body["summary"]
    assert 1 <= len(body["next_steps"]) <= 3
    assert body["notice"]
    assert 0 <= body["risk_score"] <= 100


def test_brief_uses_llm_when_configured(client, monkeypatch):
    """With a key set, the model's JSON brief is returned and marked as 'llm'."""
    from app import brief_service
    _no_llm_keys(monkeypatch)
    monkeypatch.setenv("BRIEF_LLM_API_KEY", "test-key")
    monkeypatch.setenv("BRIEF_LLM_MODEL", "test-model")
    brief_service._CACHE.clear()

    def fake_call(ctx):
        return {"summary": "Model written summary.",
                "next_steps": ["Step one.", "Step two.", "Step three."]}
    monkeypatch.setattr(brief_service, "_call_llm", fake_call)

    r = client.post("/api/brief", json={**SAMPLE_CLIENT, "mode": "balanced"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "llm"
    assert body["model"] == "test-model"
    assert body["summary"] == "Model written summary."
    assert len(body["next_steps"]) == 3
    assert body["notice"] is None


def test_brief_falls_back_when_llm_errors(client, monkeypatch):
    """A failing AI call must fall back to the template, not raise."""
    from app import brief_service
    _no_llm_keys(monkeypatch)
    monkeypatch.setenv("BRIEF_LLM_API_KEY", "test-key")
    brief_service._CACHE.clear()

    def boom(ctx):
        raise RuntimeError("provider down")
    monkeypatch.setattr(brief_service, "_call_llm", boom)

    r = client.post("/api/brief", json={**SAMPLE_CLIENT})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "template"
    assert "built-in template" in body["notice"]


def test_brief_context_never_includes_client_id():
    from app.brief_service import build_context
    ctx = build_context({"top_3_reasons": []},
                        {"Client_ID": "SECRET-123", "Client_Tenure_Months": 5})
    assert "Client_ID" not in ctx["client_details"]
    assert "SECRET-123" not in __import__("json").dumps(ctx)


def test_brief_rejects_bad_category(client):
    r = client.post("/api/brief", json={"Service_Type": "Copper"})
    assert r.status_code == 422
    assert "Plan must be one of" in r.json()["error"]


# -------------------------------------------------------------- history --
def test_history_persists(client, tmp_path, monkeypatch):
    from app import db
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "h.db")
    client.post("/api/predict?save=true", json={**SAMPLE_CLIENT, "Client_ID": "H-1"})
    client.post("/api/predict?save=true", json={**SAMPLE_CLIENT, "Client_ID": "H-2"})
    r = client.get("/api/predictions")
    ids = [item["client_id"] for item in r.json()["items"]]
    assert {"H-1", "H-2"} <= set(ids)


# ----------------------------------------------------------------- meta --
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["model_loaded"] is True
    assert body["model_version"]


def test_model_info_shape(client):
    r = client.get("/api/model-info")
    assert r.status_code == 200
    body = r.json()
    assert body["synthetic_data"] is True
    assert len(body["quick_check_fields"]) == 6
    assert len(body["features"]) == 22
    assert body["test_metrics"]["roc_auc"] > 0.9


def test_glossary_endpoint(client):
    r = client.get("/api/glossary")
    assert r.status_code == 200
    g = r.json()
    assert set(g["fields"]) >= {"Client_Tenure_Months", "Service_Type"}


# ------------------------------------------------------ glossary coverage --
# Which fields come from the borrowed telecom practice set; the other 16 are
# simulated behavioural features. Required by the glossary data_origin check.
TELECOM_BASE_FIELDS = {
    "Client_Tenure_Months", "Engagement_Type", "Service_Type", "Support_Access",
    "Monthly_Client_Value", "Cumulative_Client_Value",
}


def test_glossary_coverage_complete():
    """FAIL if any feature, category option, segment or band has no glossary
    entry, or an entry lacks definition, example or data_origin."""
    gloss = __import__("json").load(open(BACKEND / "app" / "glossary.json"))
    meta = __import__("json").load(open(BACKEND / "artifacts" / "model_metadata.json"))
    problems = []
    for f in meta["features"]:
        entry = gloss["fields"].get(f)
        if entry is None:
            problems.append(f"missing glossary entry for feature {f}")
            continue
        if not entry.get("definition") or entry.get("example") is None:
            problems.append(f"glossary entry for {f} lacks definition or example")
        if not entry.get("label"):
            problems.append(f"glossary entry for {f} lacks a label")
        origin = entry.get("data_origin")
        if origin not in ("telecom_base", "simulated"):
            problems.append(f"glossary entry for {f} lacks valid data_origin (got {origin!r})")
        elif (origin == "telecom_base") != (f in TELECOM_BASE_FIELDS):
            problems.append(f"glossary data_origin for {f} is {origin}, "
                            f"contradicts the required mapping")
        allowed = meta["feature_schema"][f].get("allowed_categories", [])
        have = {o["value"] for o in entry.get("options", [])}
        if allowed and not have:
            problems.append(f"glossary for {f} lacks option entries")
        elif allowed and have != set(allowed):
            problems.append(f"glossary options for {f} {sorted(have)} != model {sorted(allowed)}")
    for seg in gloss["segments"]:
        if not gloss["segments"][seg].get("definition") or not gloss["segments"][seg].get("example"):
            problems.append(f"segment {seg} lacks definition or example")
    for band in ("Low", "Medium", "High"):
        if band not in gloss["risk_bands"]:
            problems.append(f"missing risk band {band}")
        elif not gloss["risk_bands"][band].get("definition") or not gloss["risk_bands"][band].get("example"):
            problems.append(f"band {band} lacks definition or example")
    # every raw segment value in metadata maps to a glossary segment
    mapped = {v for s in gloss["segments"].values() for v in s.get("api_values", [])}
    for raw in meta["business_rules"]["segments"]:
        if raw not in mapped:
            problems.append(f"raw segment {raw} has no glossary mapping")
    # direction hints must match the verified directions (no contradictions)
    directions = __import__("json").load(
        open(BACKEND / "app" / "quick_check_selection.json"))["directions"]
    for f, entry in gloss["fields"].items():
        hint = entry.get("direction_hint")
        if not hint:
            problems.append(f"{f} has no direction hint")
            continue
        verified = directions[f]
        says_higher = "HIGHER risk" in hint
        if verified["type"] == "numeric":
            expected_higher = verified["direction"] == "HIGHER"
            if verified["direction"] is not None and says_higher != expected_higher:
                problems.append(f"{f} hint contradicts the verified direction")
        else:
            # hints on categoricals must not claim a single numeric direction
            if says_higher and "usually" not in hint:
                problems.append(f"{f} categorical hint must be qualified")
    assert not problems, "Glossary problems:\n" + "\n".join(problems)
