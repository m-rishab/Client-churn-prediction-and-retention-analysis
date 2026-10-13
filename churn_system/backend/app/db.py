"""SQLite history. Only used for save=true checks and batch runs.

Stored per row: timestamp, input, output, model version, mode, Client_ID.
Nothing personal beyond Client_ID is kept.
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(os.environ.get("CHURN_DB_PATH", Path(__file__).resolve().parents[1] / "history.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL,             -- 'single' | 'batch'
    client_id TEXT,
    mode TEXT NOT NULL,
    model_version TEXT NOT NULL,
    input_json TEXT NOT NULL,
    output_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_predictions_created ON predictions (created_at DESC);
"""


def get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def save_prediction(source: str, client_id: str | None, mode: str,
                    model_version: str, client: dict, result: dict) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO predictions (created_at, source, client_id, mode, model_version,"
            " input_json, output_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(timespec="seconds"),
             source, client_id, mode, model_version,
             json.dumps(client), json.dumps(result)))
        return int(cur.lastrowid)


def list_predictions(limit: int = 200, source: str | None = None) -> list[dict]:
    init_db()
    q = "SELECT * FROM predictions"
    params: list = []
    if source:
        q += " WHERE source = ?"
        params.append(source)
    q += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    with get_conn() as conn:
        rows = conn.execute(q, params).fetchall()
    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "created_at": r["created_at"],
            "source": r["source"],
            "client_id": r["client_id"],
            "mode": r["mode"],
            "model_version": r["model_version"],
            "risk_score": json.loads(r["output_json"]).get("risk_score"),
            "risk_band": json.loads(r["output_json"]).get("risk_band"),
            "segment": json.loads(r["output_json"]).get("segment"),
            "recommended_action": json.loads(r["output_json"]).get("recommended_action"),
            "input": json.loads(r["input_json"]),
            "output": json.loads(r["output_json"]),
        })
    return out


def count_predictions() -> int:
    init_db()
    with get_conn() as conn:
        return int(conn.execute("SELECT COUNT(*) AS n FROM predictions").fetchone()["n"])
