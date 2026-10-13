"""Predict routes: single, batch, what-if, history and figures."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import PlainTextResponse

from .. import brief_service, db
from ..model_service import ModelService
from ..schemas import BatchRow, BriefRequest, PredictRequest, WhatIfRequest
from .helpers import (ApiError, check_api_key, check_rate_limit, parse_csv_bytes,
                      results_csv, template_csv)

router = APIRouter(tags=["predict"])


def get_service() -> ModelService:
    from ..main import get_model_service
    return get_model_service()


def _do_single(svc: ModelService, payload: dict, mode: str) -> dict:
    row = BatchRow(**payload)
    return svc.score_client(row.to_model_dict(), mode=mode)


@router.post("/api/predict")
def predict(req: PredictRequest, save: bool = False,
            svc: ModelService = Depends(get_service),
            _rl: None = Depends(check_rate_limit),
            _key: None = Depends(check_api_key)) -> dict:
    result = _do_single(svc, req.to_model_dict(), req.mode)
    if save:
        db.init_db()
        db.save_prediction("single", str(result.get("client_id")), req.mode,
                           svc.model_version, req.to_model_dict(), result)
    return result


@router.post("/api/predict/batch")
async def predict_batch(file: UploadFile = File(...), mode: str = "balanced",
                        svc: ModelService = Depends(get_service),
                        _key: None = Depends(check_api_key)) -> dict:
    if mode not in ("balanced", "catch_more"):
        raise ApiError(400, "Mode must be \"balanced\" or \"catch_more\".")
    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise ApiError(400, "That file is too large. Please keep it under 10 MB.")
    rows = parse_csv_bytes(raw)
    if not rows:
        raise ApiError(400, "We could not find any client rows in that file.")
    if len(rows) > 5000:
        raise ApiError(400, "That file has more than 5,000 rows. Please split it.")

    results, rejected = [], []
    for row in rows:
        line = row.pop("_line", None)
        client_id = row.pop("Client_ID", None)
        try:
            payload = {k: v for k, v in row.items() if k != "Client_ID"}
            parsed = BatchRow(**{
                **{k: v for k, v in payload.items()},
                "Client_ID": client_id,
            })
            res = svc.score_client(parsed.to_model_dict(), mode=mode)
            res["client_id"] = client_id or "This check"
            results.append(res)
        except Exception as exc:  # noqa: BLE001 - surface as one friendly message
            msg = getattr(exc, "errors", lambda: None)()
            if msg and isinstance(msg, list):
                first = msg[0].get("msg", "Please check this row.")
                msg = first.split("Value error, ")[-1].strip()
            else:
                msg = "Please check this row."
            rejected.append({
                "row": line,
                "client_id": client_id,
                "reason": msg,
            })

    db.init_db()
    db.save_prediction("batch", None, mode, svc.model_version,
                       {"rows": len(results), "filename": file.filename},
                       {"results": results, "rejected": rejected})

    return {
        "count": len(results),
        "rejected_count": len(rejected),
        "results": results,
        "rejected": rejected,
        "download_available": bool(results),
        "mode_used": mode,
        "model_version": svc.model_version,
    }


@router.get("/api/predict/batch/template",
            response_class=PlainTextResponse,
            responses={200: {"content": {"text/csv": {}}}})
def batch_template() -> str:
    return template_csv()


@router.get("/api/predict/batch/sample-results.csv",
            response_class=PlainTextResponse,
            responses={200: {"content": {"text/csv": {}}}})
def batch_sample_results() -> str:
    return results_csv([])


@router.post("/api/predict/batch/results.csv",
             response_class=PlainTextResponse,
             responses={200: {"content": {"text/csv": {}}}})
async def batch_results_csv(file: UploadFile = File(...), mode: str = "balanced",
                            svc: ModelService = Depends(get_service)) -> str:
    """Re-score the uploaded file and return the results as a CSV download."""
    rows = parse_csv_bytes(await file.read())
    results, rejected = [], []
    for row in rows:
        line = row.pop("_line", None)
        client_id = row.pop("Client_ID", None)
        try:
            parsed = BatchRow(**row, Client_ID=client_id)
            res = svc.score_client(parsed.to_model_dict(), mode=mode)
            res["client_id"] = client_id or "This check"
            results.append(res)
        except Exception:
            rejected.append({"row": line, "client_id": client_id, "reason": "See errors above."})
    return results_csv(results)


@router.post("/api/what-if")
def what_if(req: WhatIfRequest, svc: ModelService = Depends(get_service),
            _rl: None = Depends(check_rate_limit),
            _key: None = Depends(check_api_key)) -> dict:
    base_payload = req.client.model_dump()
    before = _do_single(svc, base_payload, req.mode)
    changed = dict(base_payload)
    for key, value in req.changes.items():
        if key in svc.meta["feature_schema"]:
            changed[key] = value
    after = _do_single(svc, changed, req.mode)
    delta = round(after["risk_score"] - before["risk_score"], 1)
    return {
        "before": before,
        "after": after,
        "delta": delta,
        "note": ("This shows a pattern in practice data. It does not prove that making this "
                 "change will keep the client."),
        "model_version": svc.model_version,
    }


@router.post("/api/brief")
def brief(req: BriefRequest, svc: ModelService = Depends(get_service),
          _rl: None = Depends(check_rate_limit),
          _key: None = Depends(check_api_key)) -> dict:
    """Score the client, then write a short plain-English retention brief.

    Uses the AI model when a key is configured; otherwise a built-in template
    keeps the page working. The reply says which path produced it.
    """
    model_dict = req.to_model_dict()
    result = svc.score_client(model_dict, mode=req.mode)
    brief_body = brief_service.generate_brief(result, model_dict)
    return {
        **brief_body,
        "risk_score": result["risk_score"],
        "risk_band": result["risk_band"],
        "segment": result["segment"],
        "mode_used": req.mode,
        "model_version": svc.model_version,
        "disclaimer": ("Draft only. Made-up practice data. A guide, not a promise."),
    }


@router.get("/api/predictions")
def history(limit: int = Query(200, ge=1, le=1000), source: str | None = None,
            _key: None = Depends(check_api_key)) -> dict:
    items = db.list_predictions(limit=limit, source=source)
    return {"count": len(items), "items": items}


@router.get("/api/figures/{name}")
def figure(name: str):
    from pathlib import Path
    from fastapi.responses import FileResponse
    allowed = {
        "roc_curves.png", "capacity_curve.png", "roi_scenarios.png",
        "shap_beeswarm.png", "shap_summary_bar.png", "confusion_matrices.png",
        "calibration_curves.png", "pr_curves.png", "shap_local_low_risk.png",
        "shap_local_medium_risk.png", "shap_local_high_risk.png",
    }
    if name not in allowed:
        raise ApiError(404, "That figure does not exist.")
    fig = Path(__file__).resolve().parents[2] / "artifacts" / "figures" / name
    if not fig.exists():
        raise ApiError(404, "That figure does not exist.")
    return FileResponse(fig, media_type="image/png")
