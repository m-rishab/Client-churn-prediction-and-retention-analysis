
import json
import numpy as np
import pandas as pd
import joblib
import shap

MODEL_PATH = "models/churn_model.joblib"
METADATA_PATH = "models/model_metadata.json"

_model = None
_meta = None
_explainer = None
FEATURES = None


def _load():
    global _model, _meta, _explainer, FEATURES
    if _model is None:
        with open(METADATA_PATH) as f:
            _meta = json.load(f)
        _model = joblib.load(MODEL_PATH)
        FEATURES = _meta["features"]
        _explainer = shap.TreeExplainer(_model.named_steps["model"])
    return _model, _meta


_PLAIN = {
    "Client_Tenure_Months": "client tenure with us",
    "Monthly_Client_Value": "monthly spend",
    "Cumulative_Client_Value": "total revenue billed to date",
    "Service_Type": "service type",
    "Support_Access": "support access",
    "Engagement_Type": "engagement (contract) type",
    "Engagement_Score": "engagement score",
    "Compliance_Flags": "number of compliance flags",
    "Days_Since_Last_Engagement": "days since last engagement",
    "Content_Quality_Score": "content quality score",
}


def _humanize(feature_name):
    if feature_name.startswith("num__"):
        return _PLAIN.get(feature_name[5:], feature_name[5:])
    if feature_name.startswith("cat__"):
        rest = feature_name[5:]
        for col in FEATURES:
            if col in _meta.get("feature_schema", {}) and rest.startswith(col + "_"):
                return _PLAIN.get(col, col) + " = " + rest[len(col) + 1:]
        return rest
    return feature_name


def score_client(client, top_k=3):
    # Score one client dict -> probability, risk band, segment, action, top SHAP reasons.
    model, meta = _load()
    row = pd.DataFrame([{c: client.get(c, np.nan) for c in FEATURES}])
    proba = float(model.predict_proba(row)[:, 1][0])

    thr = meta["thresholds"]["f1_optimal"]
    risk = "High risk" if proba >= thr else "Low risk"

    rules = meta["business_rules"]
    months_left = float(np.clip(72.0 - float(client.get("Client_Tenure_Months", 0)), 0, 24))
    value = float(client.get("Monthly_Client_Value", 0.0)) * months_left
    value_tier = "High value" if value >= rules["monthly_client_value_median_train"] * 24 \
        else "Low value"
    segment = risk + " + " + value_tier
    action = rules["segments"].get(segment, "Review manually")

    Xt = pd.DataFrame(model.named_steps["preprocessor"].transform(row),
                      columns=model.named_steps["preprocessor"].get_feature_names_out())
    sv = _explainer.shap_values(Xt)[0]
    order = np.argsort(-np.abs(sv))[:top_k]
    reasons = [
        {"feature": _humanize(Xt.columns[i]),
         "shap_value": round(float(sv[i]), 4),
         "direction": "pushes churn risk up" if sv[i] > 0 else "pushes churn risk down"}
        for i in order
    ]
    return {
        "churn_probability": round(proba, 4),
        "risk_band": risk,
        "expected_value_remaining": round(value, 2),
        "segment": segment,
        "recommended_action": action,
        "top_reasons": reasons,
    }


if __name__ == "__main__":
    demo = {
        "Client_Tenure_Months": 3, "Service_Type": "Fiber optic",
        "Support_Access": "No", "Engagement_Type": "Month-to-month",
        "Monthly_Client_Value": 95.0, "Cumulative_Client_Value": 285.0,
        "Engagement_Score": 35.0, "Compliance_Flags": 4,
        "Days_Since_Last_Engagement": 55,
    }
    print(json.dumps(score_client(demo), indent=2))
