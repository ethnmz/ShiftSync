"""Static configuration: env settings and the YAML files in `config/`.

Everything deterministic (slots, rules, roster, assets) is read from here so code
never hard-codes product rules. Files are cached; call `reload()` in tests that
point CONFIG_DIR somewhere else.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent


def _path_from_env(var: str, default: Path) -> Path:
    raw = os.environ.get(var)
    if not raw:
        return default
    p = Path(raw)
    # Relative paths in .env.example are relative to backend/.
    return p if p.is_absolute() else (BACKEND_DIR / p).resolve()


def config_dir() -> Path:
    return _path_from_env("CONFIG_DIR", REPO_ROOT / "config")


def data_dir() -> Path:
    return _path_from_env("DATA_DIR", BACKEND_DIR / "data")


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        if url.startswith("sqlite:///./"):
            # Resolve "./data/..." against backend/, not the caller's cwd.
            return "sqlite:///" + str((BACKEND_DIR / url[len("sqlite:///./"):]).resolve())
        return url
    return "sqlite:///" + str(data_dir() / "shiftsync.db")


def scenario_path() -> Path:
    return _path_from_env("SCENARIO_PATH", REPO_ROOT / "demo" / "scenario.json")


def eval_dir() -> Path:
    return _path_from_env("EVAL_DIR", REPO_ROOT / "eval" / "scenarios")


@lru_cache(maxsize=None)
def load_yaml(name: str) -> dict[str, Any]:
    """Load `config/<name>.yaml` (name with or without the extension)."""
    fname = name if name.endswith((".yaml", ".yml")) else f"{name}.yaml"
    with open(config_dir() / fname, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def reload() -> None:
    load_yaml.cache_clear()


# ---------- Convenience accessors ----------

def slots() -> dict[str, Any]:
    return load_yaml("slots")


def rules() -> dict[str, Any]:
    return load_yaml("rules")


def budgets() -> dict[str, int]:
    return slots()["budgets"]


def language() -> dict[str, list[str]]:
    return slots()["language"]


def kind_slots(kind: str) -> dict[str, dict[str, Any]]:
    """Slot catalog for an item kind; empty for kinds without required facts."""
    return (slots()["kinds"].get(kind) or {}).get("slots", {}) or {}


def is_safety_slot(kind: str, slot: str) -> bool:
    return bool(kind_slots(kind).get(slot, {}).get("safety"))


def people() -> dict[str, dict[str, Any]]:
    return {p["id"]: p for p in load_yaml("roster")["people"]}


def person(person_id: str) -> dict[str, Any] | None:
    return people().get(person_id)


def assets() -> dict[str, dict[str, Any]]:
    return {a["id"]: a for a in load_yaml("assets")["assets"]}


def asset_category(asset_id: str) -> str | None:
    """`power` / `cooling` from assets.yaml critical_types, else None."""
    a = assets().get(asset_id)
    if not a:
        return None
    for category, types in load_yaml("assets").get("critical_types", {}).items():
        if a["type"] in types:
            return category
    return None
