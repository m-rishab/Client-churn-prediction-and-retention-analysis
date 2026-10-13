"""Shared route helpers: consistent error format, API key, rate limit, CSV."""
from __future__ import annotations

import csv
import io
import time
from typing import Any

from fastapi import HTTPException, Request

API_KEY: str | None = None  # set from env in main.py; None disables the check
RATE_LIMIT_REQUESTS = 60
RATE_LIMIT_WINDOW_S = 60.0
_rate_bucket: dict[str, list[float]] = {}

FRIENDLY_TO_FIELD = {
    "client id": "Client_ID",
    "months with us": "Client_Tenure_Months",
    "plan": "Service_Type",
    "extra support": "Support_Access",
    "contract length": "Engagement_Type",
    "monthly payment": "Monthly_Client_Value",
    "total paid so far": "Cumulative_Client_Value",
    "content quality (0 to 100)": "Content_Quality_Score",
    "content quality": "Content_Quality_Score",
    "content score change, last 30 days": "Content_Score_Trend_30D",
    "content score change": "Content_Score_Trend_30D",
    "guideline score (0 to 100)": "Guideline_Compliance_Score",
    "guideline score": "Guideline_Compliance_Score",
    "guideline warnings": "Compliance_Flags",
    "serious guideline issues": "Critical_Compliance_Issues",
    "engagement (0 to 100)": "Engagement_Score",
    "engagement": "Engagement_Score",
    "contacts per month": "Monthly_Engagements",
    "meetings per month": "Client_Meetings",
    "reports opened": "Report_Views",
    "reply rate (%)": "Response_Rate",
    "help requests": "Support_Tickets",
    "open help requests": "Unresolved_Support_Tickets",
    "hours to solve a request": "Avg_Resolution_Time",
    "days since last contact": "Days_Since_Last_Engagement",
    "google visibility change (%)": "Search_Visibility_Change",
    "google visibility change": "Search_Visibility_Change",
    "website visitors change (%)": "Traffic_Change",
    "website visitors change": "Traffic_Change",
}
FRIENDLY_HEADER = [
    "Client_ID", "Months with us", "Plan", "Extra support", "Contract length",
    "Monthly payment", "Total paid so far", "Content quality (0 to 100)",
    "Content score change, last 30 days", "Guideline score (0 to 100)",
    "Guideline warnings", "Serious guideline issues", "Engagement (0 to 100)",
    "Contacts per month", "Meetings per month", "Reports opened", "Reply rate (%)",
    "Help requests", "Open help requests", "Hours to solve a request",
    "Days since last contact", "Google visibility change (%)",
    "Website visitors change (%)",
]


class ApiError(HTTPException):
    def __init__(self, status: int, message: str, detail: Any = None):
        super().__init__(status_code=status,
                         detail={"error": message, "detail": detail})


def check_api_key(request: Request) -> None:
    if API_KEY and request.headers.get("X-API-Key") != API_KEY:
        raise ApiError(401, "Wrong or missing API key.",
                       "Pass the key in the X-API-Key header.")


def check_rate_limit(request: Request) -> None:
    client = request.client.host if request.client else "local"
    now = time.monotonic()
    hits = [t for t in _rate_bucket.get(client, []) if now - t < RATE_LIMIT_WINDOW_S]
    if len(hits) >= RATE_LIMIT_REQUESTS:
        raise ApiError(429, "Too many requests. Please wait a minute and try again.")
    hits.append(now)
    _rate_bucket[client] = hits


def parse_csv_bytes(raw: bytes) -> list[dict]:
    """Parse an uploaded CSV into dicts. Accepts friendly or raw column names."""
    text = raw.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ApiError(400, "The file has no header row.")
    rows: list[dict] = []
    for i, raw_row in enumerate(reader, start=2):  # data starts on line 2
        row: dict[str, Any] = {}
        for key, val in raw_row.items():
            if key is None:
                continue
            norm = key.strip()
            field = FRIENDLY_TO_FIELD.get(norm.lower())
            if field is None and norm in FRIENDLY_TO_FIELD.values():
                field = norm
            if field is not None and val is not None and str(val).strip() != "":
                row[field] = str(val).strip()
        if row:
            row["_line"] = i
        rows.append(row)
    return rows


def results_csv(results: list[dict]) -> str:
    out = io.StringIO()
    cols = ["client_id", "risk_score", "risk_band", "segment", "recommended_action",
            "top_3_reasons", "expected_loss", "mode_used", "model_version"]
    writer = csv.writer(out)
    writer.writerow(["Client", "Score", "Level", "Segment", "Next action",
                     "Top reasons", "Expected loss", "Mode", "Model version"])
    for r in results:
        reasons = "; ".join(f"{x['label']} ({x['direction']})" for x in r["top_3_reasons"])
        writer.writerow([r["client_id"], r["risk_score"], r["risk_band"], r["segment"],
                         r["recommended_action"], reasons, r["expected_loss"],
                         r["mode_used"], r["model_version"]])
    return out.getvalue()


def template_csv() -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(FRIENDLY_HEADER)
    writer.writerow(["SAMPLE-001", 18, "Premium (Fiber)", "No", "Month to month",
                     70, 1500, 75, -4, 85, 2, 0, 72, 8, 2, 15, 80, 3, 1, 30, 12, -5, -8])
    writer.writerow(["Note: leave cells blank if you are not sure. Blank cells use a typical value."
                     " Plan: Standard (DSL) / Premium (Fiber) / No plan."
                     " Extra support: Yes / No. Contract length: Month to month / One year / Two years."])
    return out.getvalue()
