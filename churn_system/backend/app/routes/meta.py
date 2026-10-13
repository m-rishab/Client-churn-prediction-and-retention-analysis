"""Health, model info and glossary routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from ..model_service import ModelService
from ..schemas import Error
from .helpers import check_api_key

router = APIRouter(tags=["meta"])


def get_service() -> ModelService:
    from ..main import get_model_service
    return get_model_service()


@router.get("/api/health")
def health(svc: ModelService = Depends(get_service)) -> dict:
    return {
        "status": "ok",
        "model_loaded": True,
        "model_version": svc.model_version,
    }


@router.get("/api/model-info")
def model_info(svc: ModelService = Depends(get_service)) -> dict:
    return svc.model_info()


@router.get("/api/glossary", responses={200: {"model": dict}})
def glossary(svc: ModelService = Depends(get_service), _=Depends(check_api_key)) -> dict:
    return svc.glossary_payload()
