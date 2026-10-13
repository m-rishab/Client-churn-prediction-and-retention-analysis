FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Artifacts are read-only copies of the trained model (see scripts/copy_artifacts.py).
COPY app ./app
COPY artifacts ./artifacts
COPY tests ./tests

# History database lives in /data so it can be a mounted volume.
ENV CHURN_DB_PATH=/data/history.db
VOLUME /data

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
