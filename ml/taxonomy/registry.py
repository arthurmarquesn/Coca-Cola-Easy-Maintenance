"""Read-only compatibility layer over the official taxonomy CSV files.

Unknown labels are deliberately returned unchanged. This preserves the
conservative behavior used by the legacy training pipelines: only explicit,
approved aliases are canonicalized.
"""

from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path
from typing import Any

from ml.scripts.prepare_marilia_dataset import normalize_classification


DEFAULT_TAXONOMY_DIR = Path(__file__).resolve().parent


def _normalization_key(value: object) -> str:
    return normalize_classification("" if value is None else str(value))


@lru_cache(maxsize=None)
def _load_registry(taxonomy_dir: str) -> dict[str, Any]:
    directory = Path(taxonomy_dir)
    canonical_path = directory / "canonical_failure_modes.csv"
    aliases_path = directory / "failure_mode_aliases.csv"

    with canonical_path.open("r", encoding="utf-8-sig", newline="") as source:
        canonical_rows = list(csv.DictReader(source))
    with aliases_path.open("r", encoding="utf-8-sig", newline="") as source:
        alias_rows = list(csv.DictReader(source))

    by_id = {row["canonical_id"]: row for row in canonical_rows}
    by_label = {
        _normalization_key(row["canonical_label"]): row
        for row in canonical_rows
    }
    alias_to_id = {
        _normalization_key(row["alias"]): row["canonical_id"]
        for row in alias_rows
    }
    return {
        "by_id": by_id,
        "by_label": by_label,
        "alias_to_id": alias_to_id,
    }


def clear_taxonomy_cache() -> None:
    """Clear cached CSV content, primarily for controlled rebuilds and tests."""

    _load_registry.cache_clear()


def _registry(taxonomy_dir: str | Path | None = None) -> dict[str, Any]:
    directory = Path(taxonomy_dir or DEFAULT_TAXONOMY_DIR).resolve()
    return _load_registry(str(directory))


def get_taxonomy_entry(
    label: object,
    taxonomy_dir: str | Path | None = None,
) -> dict[str, str] | None:
    """Return the governed entry for a canonical label or approved alias."""

    registry = _registry(taxonomy_dir)
    key = _normalization_key(label)
    if not key:
        return None
    entry = registry["by_label"].get(key)
    if entry is not None:
        return dict(entry)
    canonical_id = registry["alias_to_id"].get(key)
    if canonical_id is None:
        return None
    target = registry["by_id"].get(canonical_id)
    return dict(target) if target is not None else None


def canonicalize_failure_mode(
    label: object,
    taxonomy_dir: str | Path | None = None,
) -> object:
    """Canonicalize only a known label or explicit alias; preserve unknown input."""

    entry = get_taxonomy_entry(label, taxonomy_dir)
    return entry["canonical_label"] if entry is not None else label


def get_family(label: object, taxonomy_dir: str | Path | None = None) -> str:
    """Return the governed family, or OTHER_UNKNOWN for an unknown label."""

    entry = get_taxonomy_entry(label, taxonomy_dir)
    return entry["family"] if entry is not None else "OTHER_UNKNOWN"


def get_component(label: object, taxonomy_dir: str | Path | None = None) -> str:
    """Return the explicitly supported component, otherwise an empty string."""

    entry = get_taxonomy_entry(label, taxonomy_dir)
    return entry["component"] if entry is not None else ""


def get_mechanism(label: object, taxonomy_dir: str | Path | None = None) -> str:
    """Return the explicitly supported mechanism, otherwise an empty string."""

    entry = get_taxonomy_entry(label, taxonomy_dir)
    return entry["mechanism"] if entry is not None else ""
