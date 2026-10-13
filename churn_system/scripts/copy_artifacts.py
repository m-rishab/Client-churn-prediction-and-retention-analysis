"""Copy (never move) read-only model artifacts into the backend.

Run from the repo root:  python churn_system/scripts/copy_artifacts.py
Creates/refreshes churn_system/backend/artifacts/ from models/ and reports/.
The originals in models/ and reports/ are read-only for this system.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "models"
REPORTS = ROOT / "reports"
ARTIFACTS = Path(__file__).resolve().parents[1] / "backend" / "artifacts"

MODEL_FILES = ["churn_model.joblib", "model_metadata.json"]
REPORT_FILES = ["metrics.json", "segments.csv", "save_now_list.csv"]
FIGURES_DIR = REPORTS / "figures"

FIGURE_ALLOWLIST = [
    "roc_curves.png",
    "capacity_curve.png",
    "roi_scenarios.png",
    "shap_beeswarm.png",
    "shap_summary_bar.png",
    "confusion_matrices.png",
    "calibration_curves.png",
    "pr_curves.png",
    "shap_local_low_risk.png",
    "shap_local_medium_risk.png",
    "shap_local_high_risk.png",
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    (ARTIFACTS / "figures").mkdir(parents=True, exist_ok=True)
    hashes: dict[str, str] = {}

    for name in MODEL_FILES + REPORT_FILES:
        src = (MODELS / name) if name in MODEL_FILES else (REPORTS / name)
        shutil.copy2(src, ARTIFACTS / name)  # copy, never move
        hashes[name] = sha256(ARTIFACTS / name)

    for name in FIGURE_ALLOWLIST:
        src = FIGURES_DIR / name
        if src.exists():
            shutil.copy2(src, ARTIFACTS / "figures" / name)
            hashes[f"figures/{name}"] = sha256(ARTIFACTS / "figures" / name)

    manifest = {
        "purpose": "Read-only copies of model artifacts. Never edit these files.",
        "source_model": sha256(MODELS / "churn_model.joblib"),
        "copies": hashes,
    }
    with open(ARTIFACTS / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Copied artifacts to {ARTIFACTS}")
    print(f"model sha256: {manifest['source_model'][:16]}...")


if __name__ == "__main__":
    main()
