"""Pydantic v2 schemas built from models/model_metadata.json (read-only).

Validation errors are plain English ("Days since last contact must be between
-51 and 102.2. You entered 150."). Missing numeric values are allowed: the
model fills them in.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, create_model, model_validator

APP_DIR = Path(__file__).resolve().parent
ARTIFACTS = APP_DIR.parent / "artifacts"

META = json.load(open(ARTIFACTS / "model_metadata.json"))
GLOSSARY = json.load(open(APP_DIR / "glossary.json"))
FEATURES = META["features"]
SCHEMA_SPEC = META["feature_schema"]

MODE = Literal["balanced", "catch_more"]


def _plain_name(field: str) -> str:
    return GLOSSARY["fields"][field]["label"]


def _nice_options(field: str) -> str:
    options = GLOSSARY["fields"][field].get("options")
    if options:
        return ", ".join(o["label"] for o in options)
    return ", ".join(SCHEMA_SPEC[field]["allowed_categories"])


# Friendly display label -> raw model value (e.g. "Premium (Fiber)" -> "Fiber optic",
# "Month to month" -> "Month-to-month"). Built from the glossary, so the API keeps
# the real category values while users may type the friendly ones.
VALUE_ALIASES: dict[str, dict[str, str]] = {}
for _field, _entry in GLOSSARY["fields"].items():
    _opts = _entry.get("options")
    if _opts:
        _m: dict[str, str] = {}
        for _o in _opts:
            _m[_o["label"].lower()] = _o["value"]
            _m[_o["value"].lower()] = _o["value"]
        VALUE_ALIASES[_field] = _m


def _fmt(value: Any) -> str:
    s = str(value).strip()
    try:
        f = float(s)
        return str(int(f)) if f == int(f) else s
    except (TypeError, ValueError):
        return s


def _make_field(field: str):
    spec = SCHEMA_SPEC[field]
    if spec["dtype"] == "numeric":
        return (Optional[float], None)
    return (Optional[str], None)


_ClientInputDynamic = create_model(
    "ClientInputDynamic",
    **{f: _make_field(f) for f in FEATURES},
)


class ClientInput(_ClientInputDynamic):
    """One client. All fields optional; blanks are filled with typical values."""

    Client_ID: Optional[str] = None

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True,
                              protected_namespaces=())

    @model_validator(mode="before")
    @classmethod
    def _plain_english_checks(cls, data: Any):
        """Friendly checks with plain-English messages, in one place."""
        if not isinstance(data, dict):
            return data
        for field, spec in SCHEMA_SPEC.items():
            value = data.get(field)
            if value is None or (isinstance(value, str) and not value.strip()):
                continue
            name = _plain_name(field)
            if spec["dtype"] == "numeric":
                try:
                    num = float(str(value).strip())
                except (TypeError, ValueError):
                    raise ValueError(
                        f"{name} must be a number. You entered \"{value}\".") from None
                lo = spec.get("observed_min")
                hi = spec.get("observed_max")
                if (lo is not None and num < lo) or (hi is not None and num > hi):
                    raise ValueError(
                        f"{name} must be between {_fmt(lo)} and {_fmt(hi)}. "
                        f"You entered {_fmt(value)}.")
                data[field] = num
            else:
                value = str(value).strip()
                allowed = spec["allowed_categories"]
                if value not in allowed:
                    alias = VALUE_ALIASES.get(field, {}).get(value.lower())
                    if alias is None:
                        raise ValueError(
                            f"{name} must be one of: {_nice_options(field)}. "
                            f"You entered \"{value}\".")
                    value = alias
                data[field] = value
        return data

    def to_model_dict(self) -> dict:
        out = {f: getattr(self, f) for f in FEATURES if getattr(self, f) is not None}
        if self.Client_ID:
            out["Client_ID"] = self.Client_ID
        return out


class ClientIDMixin(BaseModel):
    Client_ID: Optional[str] = None


class BatchRow(ClientInput):
    Client_ID: Optional[str] = None


class PredictRequest(ClientInput):
    mode: MODE = "balanced"


class BriefRequest(ClientInput):
    mode: MODE = "balanced"


class BatchRequest(BaseModel):
    rows: list[BatchRow]
    mode: MODE = "balanced"


class WhatIfRequest(BaseModel):
    client: ClientInput
    changes: dict[str, Any]
    mode: MODE = "balanced"


class SaveRequest(BaseModel):
    client_id: Optional[str] = None


class Error(BaseModel):
    error: str
    detail: Optional[str] = None
