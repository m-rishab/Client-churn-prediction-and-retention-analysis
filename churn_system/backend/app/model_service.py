"""Loads the finished model ONCE at startup and wraps predict_utils.

predict_utils.py is reused as-is (read-only import from the repo root);
its module-level paths are pointed at the backend's artifacts COPIES so the
backend never depends on the user's working directory. No scoring logic is
rewritten here: everything goes through predict_utils.score_client().
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
APP_DIR = Path(__file__).resolve().parent
ARTIFACTS = BACKEND_DIR / "artifacts"
ROOT = BACKEND_DIR.parents[1]

# predict_utils.py lives at the repo root; import it read-only.
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Point predict_utils' module-level paths at our artifacts copies (no rewrite
# of its logic; we only change where it reads from).
import predict_utils  # noqa: E402

predict_utils.MODEL_PATH = str(ARTIFACTS / "churn_model.joblib")
predict_utils.METADATA_PATH = str(ARTIFACTS / "model_metadata.json")

SELECTION_PATH = APP_DIR / "quick_check_selection.json"
GLOSSARY_PATH = APP_DIR / "glossary.json"
SEGMENT_PLAIN = {
    "High risk + High value": "Save now",
    "High risk + Low value": "Automated nudge",
    "Low risk + High value": "Nurture",
    "Low risk + Low value": "Monitor",
}
FRIENDLY_FEATURES = {
    "client tenure with us": "Months with us",
    "monthly spend": "Monthly payment",
    "total revenue billed to date": "Total paid so far",
    "service type = Fiber optic": "Plan: Premium (Fiber)",
    "service type = DSL": "Plan: Standard (DSL)",
    "service type = No": "Plan: none",
    "engagement (contract) type = Month-to-month": "Contract: month to month",
    "engagement (contract) type = One year": "Contract: one year",
    "engagement (contract) type = Two year": "Contract: two years",
    "engagement (contract) type = One": "Contract: one year",
    "engagement (contract) type = Two": "Contract: two years",
    "engagement (contract) type = No": "Contract: none",
    "engagement (contract) type = No internet service": "Contract: not on a plan",
    "support access = Yes": "Extra support: Yes",
    "support access = No": "Extra support: No",
    "support access = No internet service": "Extra support: not on a plan",
    "number of compliance flags": "Guideline warnings",
    "days since last engagement": "Days since last contact",
    "content quality score": "Content quality",
    "engagement score": "Engagement",
}
CREDIT_TENURE_VALUES = ["One year", "Two year"]
CREDIT_MAP = {"One year": 12.0, "Two year": 24.0}


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class ModelService:
    """Loads model, metadata, glossary and SHAP explainer exactly once."""

    def __init__(self) -> None:
        with open(GLOSSARY_PATH) as f:
            self.glossary = json.load(f)
        with open(ARTIFACTS / "model_metadata.json") as f:
            self.meta = json.load(f)
        with open(ARTIFACTS / "metrics.json") as f:
            self.metrics = json.load(f)
        with open(SELECTION_PATH) as f:
            self.selection = json.load(f)

        # One-time load of model + explainer through predict_utils.
        self._model, self._meta = predict_utils._load()
        self.meta = self._meta
        self.FEATURES = predict_utils.FEATURES

        joblib_hash = _sha256(ARTIFACTS / "churn_model.joblib")[:12]
        train_date = str(self.meta.get("train_date_utc", "unknown"))[:10]
        self.model_version = f"joblib-{joblib_hash}-trained-{train_date}"

    # ------------------------------------------------------------------ #
    def friendly_reason(self, feature: str) -> str:
        return FRIENDLY_FEATURES.get(feature, feature)

    def risk_score_100(self, proba: float) -> float:
        return round(max(0.0, min(100.0, proba * 100.0)), 1)

    def band(self, proba: float, mode: str) -> str:
        thr = self.meta["thresholds"]["f1_optimal" if mode == "balanced" else "cost_optimal"]
        if proba >= thr:
            return "High"
        if proba >= 0.4:
            return "Medium"
        return "Low"

    def expected_loss(self, proba: float, client: dict) -> float:
        months_left = float(
            min(24.0, max(0.0, 72.0 - float(client.get("Client_Tenure_Months") or 0.0))))
        value = float(client.get("Monthly_Client_Value") or 0.0) * months_left
        return round(proba * value, 2)

    # ------------------------------------------------------------------ #
    def score_client(self, client: dict, mode: str = "balanced") -> dict:
        """Run one client through predict_utils.score_client (logic unchanged).

        predict_utils always bands at threshold_f1_optimal; for the
        "catch more" mode we only re-derive the band with cost_optimal.
        """
        result = predict_utils.score_client(client)
        proba = float(result["churn_probability"])
        score100 = self.risk_score_100(proba)
        segment_raw = result["segment"]
        segment_plain = SEGMENT_PLAIN.get(segment_raw, segment_raw)

        band = self.band(proba, mode)
        if band != ("High" if result["risk_band"] == "High risk" else "Low"):
            segment_raw = ("High risk" if band == "High" else "Low risk") + \
                (" + High value" if "High value" in segment_raw else " + Low value")
            segment_plain = SEGMENT_PLAIN.get(segment_raw, segment_raw)

        if band == "Medium":
            action = ("Worth a quick check-in. Look at the top reasons and "
                      "decide with your team.")
        else:
            action = result["recommended_action"]

        top_reasons = []
        for reason in result["top_reasons"]:
            direction = "up" if reason["direction"].startswith("pushes churn risk up") else "down"
            top_reasons.append({
                "label": self.friendly_reason(reason["feature"]),
                "raw_reason": reason["feature"],
                "direction": direction,
                "detail": ("This detail raised the score"
                           if direction == "up" else "This detail lowered the score"),
                "tooltip": ("This shows a pattern in practice data. It does not prove that "
                            "changing something will keep the client."),
            })

        return {
            "client_id": client.get("Client_ID") or "This check",
            "risk_score": score100,
            "risk_band": band,
            "segment": segment_plain,
            "segment_meaning": self.glossary["segments"][segment_plain]["definition"],
            "recommended_action": action,
            "top_3_reasons": top_reasons,
            "expected_loss": self.expected_loss(proba, client),
            "mode_used": mode,
            "model_version": self.model_version,
        }

    def score_many(self, rows: list[dict], mode: str = "balanced") -> list[dict]:
        return [self.score_client(row, mode) for row in rows]

    # ------------------------------------------------------------------ #
    @property
    def quick_check_fields(self) -> list[str]:
        return list(self.selection["quick_check_fields"])

    def field_glossary(self, field: str) -> dict:
        return self.glossary["fields"][field]

    def model_info(self) -> dict:
        g = self.glossary["fields"]
        fields = []
        for name in self.meta["features"]:
            spec = self.meta["feature_schema"][name]
            gl = g[name]
            fields.append({
                "name": name,
                "label": gl["label"],
                "dtype": spec["dtype"],
                "min": spec.get("observed_min"),
                "max": spec.get("observed_max"),
                "allowed_categories": spec.get("allowed_categories"),
                "typical": gl.get("typical"),
                "missing_allowed": bool(spec.get("missing_allowed", False)),
                "quick_check": name in self.selection["quick_check_fields"],
            })
        final = self.metrics["final_model"]
        noise_prune = self.metrics["noise_floor_pruning"]["test_after_full"]
        return {
            "model_version": self.model_version,
            "model_name": final["model_name"],
            "trained_on": "Practice data (made-up data, not real Highspring clients)",
            "synthetic_data": True,
            "disclaimer": ("Made-up practice data. Numbers show the tool works, "
                           "not real Highspring results."),
            "quick_check_fields": self.quick_check_fields,
            "features": fields,
            "thresholds": self.meta["thresholds"],
            "test_metrics": {
                "roc_auc": noise_prune["roc_auc"],
                "pr_auc": noise_prune["pr_auc"],
                "accuracy": noise_prune["accuracy"],
                "precision": noise_prune["precision"],
                "recall": noise_prune["recall"],
                "f1": noise_prune["f1"],
                "threshold": noise_prune["threshold"],
                "confusion_matrix": noise_prune["confusion_matrix"],
            },
            "segment_rules": self.meta["business_rules"]["segments"],
        }

    def glossary_payload(self) -> dict:
        return self.glossary
