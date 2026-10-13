"""Readability check (textstat Flesch-Kincaid grade) on all UI text.

Grabs the real rendered text from the running app (header, main, footer, plus
tooltip texts from the glossary since tooltips are closed by default) and
prints the reading grade per page. Flags anything above grade 8.

Needs python-playwright for the live probe. If that package is missing here,
extract the texts with node first and pass the JSON file:

  cd churn_system/frontend && node e2e/extract_readability_texts.mjs
  python churn_system/scripts/check_readability.py --texts /tmp/readability_texts.json

Run (full):  bash churn_system/scripts/run_probe.sh   (backend+preview must be up)
             python churn_system/scripts/check_readability.py
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import textstat

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
GLOSSARY = Path(__file__).resolve().parents[1] / "backend" / "app" / "glossary.json"

# Mirrors frontend/src/lib/demo.ts. These exact strings are required by the
# spec, so they are graded and reported, not rewritten.
DEMO_NOTE = {
    "telecom_base": (
        "Demo value: this comes from a telecom practice dataset. "
        "Real Highspring data will replace it."
    ),
    "simulated": "Demo value: this is simulated practice data.",
}
DEMO_PILL_TOOLTIP = (
    "This value is a demo stand-in for now. "
    "Real Highspring client data will replace it later."
)

PAGES = {
    "check (empty)": "/",
    "check (result)": "RESULT",
    "portfolio": "/portfolio",
    "learn": "/learn",
}


def extract_via_playwright() -> dict[str, str]:
    from playwright.sync_api import sync_playwright

    out: dict[str, str] = {}
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.goto("http://localhost:4173/")
        page.wait_for_selector("text=Months with us")
        page.wait_for_timeout(400)
        out["check (empty)"] = page.inner_text("body")

        page.get_by_text("Load a sample client").click()
        page.wait_for_selector("text=Top reasons", timeout=20000)
        page.wait_for_timeout(400)
        out["check (result)"] = page.inner_text("body")

        page.goto("http://localhost:4173/portfolio")
        page.wait_for_timeout(1200)
        out["portfolio"] = page.inner_text("body")

        page.goto("http://localhost:4173/learn")
        page.wait_for_timeout(1200)
        out["learn"] = page.inner_text("body")
        browser.close()
    return out


def main(argv: list[str] | None = None) -> None:
    args = argparse.ArgumentParser()
    args.add_argument(
        "--texts",
        help="JSON file with page-name -> innerText, instead of the live probe",
    )
    parsed, _ = args.parse_known_args(argv)

    texts = extract_via_playwright() if not parsed.texts else json.load(open(parsed.texts))
    glossary = json.load(open(GLOSSARY))

    tip_texts = []
    for f in glossary["fields"].values():
        tip_texts.append(f["definition"])
        tip_texts.append(f.get("direction_hint") or "")
        tip_texts.append(DEMO_NOTE.get(f.get("data_origin") or "", ""))
    for s in glossary["segments"].values():
        tip_texts.append(s["definition"])
    for b in glossary["risk_bands"].values():
        tip_texts.append(b["definition"])
    for m in glossary["metrics"].values():
        tip_texts.append(m["definition"])
    tip_text = " ".join(t for t in tip_texts if t)

    # The strings introduced by the "marketed data" update, kept verbatim
    # from the spec. Aggregate grades must stay <= 8 even though a couple of
    # individual snippets grade higher on their own.
    ABOUT_STRINGS = [
        "Highspring helps clients with their Google Search content strategy. "
        "Some clients slowly go quiet and then leave, often after a drop in "
        "Search visibility, a poor content rating, or a guideline problem that "
        "stays open. Today the team often finds out only after it happens. "
        "This tool helps spot the risk early.",
        "The Content Strategy and Client Advisory team, and the Client Success team.",
        "Gives each client a risk score from 0 to 100. "
        "Shows the top reasons behind the score. "
        "Suggests what to do next, and who to call first.",
        "Method checked on practice data. Ready to plug in real Highspring data.",
        "Academic project by Nishita Chauhan, BITS Pilani WILP.",
    ]
    NEW_STRINGS = [
        "Built for Highspring's Content Strategy and Client Advisory team.",
        "Demo data. Built for Highspring's Content Strategy and Client Advisory team.",
        "About this project",
        DEMO_PILL_TOOLTIP,
        DEMO_NOTE["telecom_base"],
        DEMO_NOTE["simulated"],
    ] + ABOUT_STRINGS

    print("Readability (Flesch-Kincaid grade; target <= 8):")
    worst = []
    for name, text in texts.items():
        grade = textstat.flesch_kincaid_grade(text)
        print(f"  {name:16s} grade {grade}")
        if grade > 8:
            worst.append((name, grade))
    for label, pool in [
        ("tooltips", tip_text),
        ("about (aggregate)", " ".join(ABOUT_STRINGS)),
        ("new strings (aggregate)", " ".join(NEW_STRINGS)),
    ]:
        g = textstat.flesch_kincaid_grade(pool)
        print(f"  {label:16s} grade {g}")
        if g > 8:
            worst.append((label, g))

    if worst:
        print("NEEDS REWRITE (above grade 8):", worst)
        sys.exit(1)
    print("All pages at or below grade 8.")


if __name__ == "__main__":
    main()
