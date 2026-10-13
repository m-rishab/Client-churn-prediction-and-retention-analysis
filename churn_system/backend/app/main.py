"""FastAPI app: Client Leaving Risk Checker backend.

Loads the finished model once at startup (via model_service -> predict_utils),
mounts all routes, adds CORS, request logging and a consistent error format.
Run:  uvicorn app.main:app --port 8000   (from churn_system/backend)
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db
from .routes import helpers
from .routes.helpers import ApiError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("churn_system")

_service = None


def get_model_service():
    global _service
    if _service is None:  # lazy singleton; created at startup by lifespan
        from .model_service import ModelService
        _service = ModelService()
    return _service


@asynccontextmanager
async def lifespan(app: FastAPI):
    svc = get_model_service()
    db.init_db()
    helpers.API_KEY = os.environ.get("CHURN_API_KEY") or None
    logger.info("model loaded: %s", svc.model_version)
    logger.info("quick-check fields: %s", ", ".join(svc.quick_check_fields))
    yield
    _service = None


app = FastAPI(title="Client Leaving Risk Checker", version="1.0.0",
              lifespan=lifespan, docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get(
        "CHURN_CORS_ORIGINS", "http://localhost:5173,http://localhost:4173").split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    """Turn pydantic errors into one plain-English, consistent error body."""
    friendly: list[str] = []
    for e in exc.errors():
        msg = e.get("msg", "")
        if msg.startswith("Value error, "):
            friendly.append(msg[len("Value error, "):])
        elif e.get("type") == "extra_forbidden":
            loc = str(e.get("loc", [""])[-1])
            friendly.append(f"We don't recognize the field \"{loc}\". Please remove it.")
        else:
            friendly.append("Please check the details you entered.")
    return JSONResponse(status_code=422, content={
        "error": friendly[0] if friendly else "Please check the details you entered.",
        "detail": friendly,
    })


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException):
    """Consistent error body for every HTTP error."""
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(status_code=exc.status_code,
                        content={"error": str(exc.detail)})


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except ApiError as exc:
        response = JSONResponse(status_code=exc.status_code, content=exc.detail)
    except Exception:
        logger.exception("unhandled error on %s", request.url.path)
        response = JSONResponse(status_code=500, content={
            "error": "Something went wrong on our side. Please try again."})
    ms = (time.perf_counter() - started) * 1000
    logger.info("%s %s -> %s (%.0f ms)", request.method, request.url.path,
                response.status_code, ms)
    return response


from .routes import meta, portfolio, predict  # noqa: E402

app.include_router(meta.router)
app.include_router(predict.router)
app.include_router(portfolio.router)


@app.get("/")
def root() -> dict:
    return {"name": "Client Leaving Risk Checker API", "docs": "/api/docs"}
