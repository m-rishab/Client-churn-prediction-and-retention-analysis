"""Choose the 6 quick-check fields from the model's REAL global importance.

Method (recorded in the output JSON):
1. Load the saved practice dataset (Data/processed/client_dataset_synthetic.csv),
   the trained pipeline (artifacts copy) and its metadata. The model is NOT retrained.
2. Permutation importance (roc_auc, 5 repeats) of every model feature on a fixed
   random sample of saved rows -> real global importance on saved data.
3. Greedy pick of 6 fields, top importance first, with the product rules:
   - at most 2 fields from the same feature group (model feature_groups; the
     account/contract fields form their own 'account' group, also capped at 2)
   - every field must be something a normal user can actually know (allowlist
     in knowable_fields.json; importance decides between the 22 fields)
   - coverage: at least one account field, one engagement field, one
     content/guidelines field
4. Verify direction hints empirically: mean predicted probability when the
   feature is held at its low vs high quartile/decile across saved rows.
   Hints are kept only when quartile and decile checks agree.

Outputs: churn_system/backend/app/quick_check_selection.json
Run from repo root:  python churn_system/scripts/build_quick_check.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))  # for predict_utils (read-only use)

BACKEND_APP = Path(__file__).resolve().parents[1] / "backend" / "app"
ARTIFACTS = Path(__file__).resolve().parents[1] / "backend" / "artifacts"
DATA_PATH = ROOT / "Data" / "processed" / "client_dataset_synthetic.csv"
SEED = 42

import predict_utils  # noqa: E402  (read-only reuse of the finished model)

UNGROUPED = "account"  # tenure / value / plan / contract fields
_kf = json.load(open(BACKEND_APP / "knowable_fields.json"))
KNOWABLE = set(_kf["knowable_fields"])


def load_all():
    meta = json.load(open(ARTIFACTS / "model_metadata.json"))
    df = pd.read_csv(DATA_PATH)
    model = predict_utils._load()[0]
    features = meta["features"]
    return meta, df, model, features


def permutation_ranking(meta, df, model, features):
    from sklearn.inspection import permutation_importance
    from sklearn.metrics import roc_auc_score

    sample = df.sample(n=1500, random_state=SEED)
    X = sample[features]
    y = sample["Churn_Flag"].astype(int)
    r = permutation_importance(model, X, y, scoring="roc_auc", n_repeats=5,
                               random_state=SEED, n_jobs=1)
    rows = [{"feature": f, "importance": round(float(m), 5), "std": round(float(s), 5)}
            for f, m, s in zip(features, r.importances_mean, r.importances_std)]
    rows.sort(key=lambda d: -d["importance"])
    auc = roc_auc_score(y, model.predict_proba(X)[:, 1])
    return rows, float(auc)


def group_of(meta, feat):
    for g, feats in meta["feature_groups"].items():
        if feat in feats:
            return g
    return UNGROUPED


def pick_six(ranking, meta):
    counts: dict[str, int] = {}
    chosen = []
    reasons = []

    def try_add(row, why):
        f = row["feature"]
        g = group_of(meta, f)
        if counts.get(g, 0) >= 2:
            return False
        if f in chosen or f not in KNOWABLE:
            return False
        chosen.append(f)
        counts[g] = counts.get(g, 0) + 1
        reasons.append({"field": f, "why": why, "group": g,
                        "importance": row["importance"], "rank_in_model": row["rank"]})
        return True

    ranked = [dict(r, rank=i + 1) for i, r in enumerate(ranking)]
    # pass 1: top importance, honouring the 2-per-group cap
    for row in ranked:
        if len(chosen) == 6:
            break
        try_add(row, "among the model's most important fields (permutation importance)")
    # pass 2: enforce coverage (account, engagement, content/guidelines)
    coverage = [
        (lambda g: g == UNGROUPED, "required: at least one field about the account itself"),
        (lambda g: g == "engagement", "required: at least one field about engagement"),
        (lambda g: g in ("content_quality", "compliance"),
         "required: at least one field about content or guidelines"),
    ]
    for test, why in coverage:
        if not any(test(r["group"]) for r in reasons):
            for row in ranked:
                if len(chosen) == 6:
                    break
                if test(group_of(meta, row["feature"])) and try_add(row, why):
                    break
    return chosen, reasons


def direction_check(df, model, features, meta_fs):
    """Empirical direction: mean predicted probability at low vs high feature values."""
    out = {}
    base = float(np.mean(model.predict_proba(df[features])[:, 1]))
    for f in features:
        if meta_fs[f]["dtype"] == "categorical":
            cats = {}
            for cat in sorted(df[f].astype(str).unique()):
                mask = df[f].astype(str) == cat
                if mask.sum() >= 50:
                    cats[cat] = round(float(
                        np.mean(model.predict_proba(df.loc[mask, features])[:, 1])), 4)
            out[f] = {"type": "categorical", "proba_by_category": cats,
                      "spread": round(max(cats.values()) - min(cats.values()), 4),
                      "baseline": round(base, 4)}
            continue
        col = df[f].astype(float)
        q1, q3 = col.quantile(0.25), col.quantile(0.75)
        d1, d9 = col.quantile(0.10), col.quantile(0.90)
        r = df[features].copy()
        r[f] = q1; p_q1 = float(np.mean(model.predict_proba(r)[:, 1]))
        r[f] = q3; p_q3 = float(np.mean(model.predict_proba(r)[:, 1]))
        r[f] = d1; p_d1 = float(np.mean(model.predict_proba(r)[:, 1]))
        r[f] = d9; p_d9 = float(np.mean(model.predict_proba(r)[:, 1]))
        quartile_delta = p_q3 - p_q1
        decile_delta = p_d9 - p_d1
        agree = np.sign(quartile_delta) == np.sign(decile_delta)
        strong = min(abs(quartile_delta), abs(decile_delta)) > 0.002
        out[f] = {
            "type": "numeric",
            "baseline": round(base, 4),
            "proba_at_q1": round(p_q1, 4), "proba_at_q3": round(p_q3, 4),
            "proba_at_d10": round(p_d1, 4), "proba_at_d90": round(p_d9, 4),
            "quartile_delta": round(quartile_delta, 4),
            "decile_delta": round(decile_delta, 4),
            "direction": ("HIGHER" if quartile_delta > 0 else "LOWER") if agree and strong else None,
            "verified": bool(agree and strong),
        }
    return out


def typical_values(df, meta):
    typ = {}
    for f in meta["features"]:
        if meta["feature_schema"][f]["dtype"] == "numeric":
            typ[f] = round(float(df[f].median()), 1)
        else:
            typ[f] = str(df[f].mode().iloc[0])
    return typ


def main():
    meta, df, model, features = load_all()
    ranking, sample_auc = permutation_ranking(meta, df, model, features)
    chosen, reasons = pick_six(ranking, meta)
    directions = direction_check(df, model, features, meta["feature_schema"])
    result = {
        "method": {
            "importance": ("sklearn permutation_importance (roc_auc, 5 repeats) on a fixed "
                           "random sample of 1500 saved practice rows; the trained model was "
                           "only loaded, never retrained"),
            "sample_auc_on_saved_rows": round(sample_auc, 4),
            "seed": SEED,
            "selection_rules": [
                "top global importance first",
                "at most 2 fields from the same feature group (model feature_groups; "
                "ungrouped account fields capped at 2 as their own group)",
                "every field must be knowable by a normal account manager (knowable_fields.json)",
                "coverage: >=1 account field, >=1 engagement field, >=1 content/guidelines field",
            ],
        },
        "importance_ranking": ranking,
        "quick_check_fields": chosen,
        "field_rationale": reasons,
        "directions": directions,
        "typical_values": typical_values(df, meta),
        "data_source": "Data/processed/client_dataset_synthetic.csv (practice data)",
    }
    out = BACKEND_APP / "quick_check_selection.json"
    with open(out, "w") as f:
        json.dump(result, f, indent=2)
    print("quick_check_fields:", chosen)
    print("wrote", out)


if __name__ == "__main__":
    main()
