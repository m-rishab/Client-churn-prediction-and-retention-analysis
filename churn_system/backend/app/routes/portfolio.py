"""Portfolio routes: segments, call-first list and capacity curve data.

Data comes from reports/segments.csv and reports/save_now_list.csv (read-only
copies in artifacts/). Segment tiles counts/expected loss are recomputed from
segments.csv; the single-client API's value reference (median x 24) is used
only in predict, matching predict_utils.
"""
from __future__ import annotations

import csv
import json

from fastapi import APIRouter, Depends, Query
from pathlib import Path

from ..model_service import ModelService, SEGMENT_PLAIN
from .helpers import check_api_key

router = APIRouter(tags=["portfolio"])
# routes/portfolio.py -> app -> backend -> artifacts
ARTIFACTS = Path(__file__).resolve().parents[2] / "artifacts"


def _load_json(path):
    with open(path) as f:
        return json.load(f)


def _csv_rows(name: str):
    with open(ARTIFACTS / name, newline="") as f:
        return list(csv.DictReader(f))

SEGMENT_ORDER = ["Save now", "Automated nudge", "Nurture", "Monitor"]


def get_service() -> ModelService:
    from ..main import get_model_service
    return get_model_service()


def _segments_summary() -> list[dict]:
    counts: dict[str, int] = {}
    loss: dict[str, float] = {}
    for row in _csv_rows("segments.csv"):
        seg = SEGMENT_PLAIN.get(row["segment"], row["segment"])
        counts[seg] = counts.get(seg, 0) + 1
        loss[seg] = loss.get(seg, 0.0) + float(row["expected_value_remaining"])
    glossary = _load_json(Path(__file__).resolve().parents[1] / "glossary.json")
    out = []
    for seg in SEGMENT_ORDER:
        high = seg in ("Save now", "Automated nudge")
        out.append({
            "segment": seg,
            "clients": counts.get(seg, 0),
            # Rough demo money at risk from the saved roster scores:
            # sum of remaining value x the band's risk proxy (0.8 high / 0.2 low).
            "expected_loss": round(loss.get(seg, 0.0) * (0.8 if high else 0.2), 0),
            "meaning": glossary["segments"][seg]["definition"],
        })
    return out


@router.get("/api/segments")
def segments(_key: None = Depends(check_api_key)) -> dict:
    return {"segments": _segments_summary()}


@router.get("/api/save-now")
def save_now(limit: int = Query(50, ge=1, le=500)) -> dict:
    rows = []
    for row in _csv_rows("save_now_list.csv"):
        rows.append({
            "client_id": row["Client_ID"],
            "risk_score": round(float(row["churn_probability"]) * 100, 1),
            "segment": SEGMENT_PLAIN.get(row["segment"], row["segment"]),
            "next_action": row["recommended_action"],
            "expected_loss": round(float(row["expected_value_remaining"]), 0),
        })
        if len(rows) >= limit:
            break
    return {"count": len(rows), "items": rows}


@router.get("/api/capacity-curve")
def capacity_curve(_key: None = Depends(check_api_key)) -> dict:
    """Client-count vs covered money-at-risk, from the saved roster scores."""
    rows = [(float(r["priority_score"]), float(r["expected_value_remaining"]))
            for r in _csv_rows("segments.csv")]
    rows.sort(key=lambda t: -t[0])
    total = sum(v for _, v in rows)
    covered = 0.0
    points = []
    for i, (_, v) in enumerate(rows, start=1):
        covered += v
        if i in (1, 10, 25, 50, 100, 250, 500, 1000, 2000, len(rows)):
            points.append({"clients_contacted": i,
                           "covered_share": round(covered / total, 4)})
    return {
        "points": points,
        "caption": ("Each extra call covers less and less of the money at risk. "
                    "Pick the point where the curve starts to flatten."),
        "note": ("Value comes from practice data. Risk is not the same as \"will respond "
                 "to our help\". A small pilot with a control group is needed to measure "
                 "real impact."),
    }
