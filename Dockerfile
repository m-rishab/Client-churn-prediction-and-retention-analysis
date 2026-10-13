# Single-service deploy: build the Vite frontend, then run FastAPI which
# serves that build and the API from the same origin.
#
#   Stage 1: Node builds churn_system/frontend -> /frontend/dist
#   Stage 2: Python runs FastAPI from churn_system/backend, serving dist/

# ---------------------------------------------------------------- frontend --
FROM node:22-alpine AS frontend-build

WORKDIR /frontend

COPY churn_system/frontend/package.json churn_system/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY churn_system/frontend/ ./
RUN npm run build

# ----------------------------------------------------------------- backend --
FROM python:3.12-slim AS backend

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CHURN_DB_PATH=/tmp/history.db

WORKDIR /workspace

# Install dependencies first so code changes do not bust the pip layer.
COPY churn_system/backend/requirements.txt ./churn_system/backend/requirements.txt
RUN pip install --no-cache-dir -r churn_system/backend/requirements.txt

# Preserve the repository layout model_service.py depends on:
#   - it imports predict_utils.py from the repo root
#   - it loads the trained model from churn_system/backend/artifacts
COPY churn_system/backend/ ./churn_system/backend/
COPY predict_utils.py ./predict_utils.py

# Put the compiled frontend where FastAPI serves it from.
COPY --from=frontend-build /frontend/dist/ ./churn_system/frontend/dist/

WORKDIR /workspace/churn_system/backend

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
