from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd

from ml.scripts.build_taxonomy_v3_candidate import (
    HUMAN_DECISIONS,
    REVIEW_TYPES,
    TAXONOMY_DECISIONS,
    TAXONOMY_VERSION,
    sha256_file,
)
from ml.scripts.prepare_marilia_dataset import normalize_classification


DEFAULT_TAXONOMY_DIR = "ml/taxonomy"
DEFAULT_DATASET = "ml/data/human/marilia/prepared/marilia_human_v2_canonical.csv"
DEFAULT_REPORT = "ml/reports/taxonomy_v3_candidate_audit.json"
CANONICAL_COLUMNS = [
    "canonical_id", "canonical_label", "family", "component", "mechanism",
    "definition", "status", "taxonomy_version",
]
ALIAS_COLUMNS = [
    "alias", "canonical_id", "reason", "approved_by", "approved_at",
    "taxonomy_version",
]
DECISION_COLUMNS = [
    "label_a", "label_b", "decision", "reason", "reviewed_by", "reviewed_at",
    "taxonomy_version",
]
HUMAN_FIELDS = [
    "review_type", "human_decision", "human_label", "human_comment",
    "reviewed_by", "reviewed_at",
]


def _read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str, keep_default_na=False)


def _require_columns(
    frame: pd.DataFrame,
    expected: list[str],
    name: str,
    errors: list[str],
) -> None:
    missing = [column for column in expected if column not in frame.columns]
    if missing:
        errors.append(f"{name}: missing columns: {', '.join(missing)}")


def audit_candidate(
    taxonomy_dir: Path,
    dataset_path: Path,
) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    canonical = _read_csv(taxonomy_dir / "canonical_failure_modes.csv")
    aliases = _read_csv(taxonomy_dir / "failure_mode_aliases.csv")
    decisions = _read_csv(taxonomy_dir / "taxonomy_review_decisions.csv")
    top250 = _read_csv(taxonomy_dir / "ursus_v1_6_human_review_top250.csv")
    version_path = taxonomy_dir / "version.json"
    version = json.loads(version_path.read_text(encoding="utf-8"))
    dataset = _read_csv(dataset_path)

    _require_columns(canonical, CANONICAL_COLUMNS, "canonical", errors)
    _require_columns(aliases, ALIAS_COLUMNS, "aliases", errors)
    _require_columns(decisions, DECISION_COLUMNS, "decisions", errors)
    _require_columns(top250, HUMAN_FIELDS, "top250", errors)

    if canonical["canonical_id"].duplicated().any():
        errors.append("canonical_id is not unique")
    if canonical["canonical_label"].duplicated().any():
        errors.append("canonical_label is not unique")
    if not canonical["canonical_id"].map(lambda value: bool(re.fullmatch(r"FM\d{6}", value))).all():
        errors.append("one or more canonical_id values have an invalid format")

    expected_ids = [f"FM{index:06d}" for index in range(1, len(canonical) + 1)]
    ordered = canonical.sort_values("canonical_label").reset_index(drop=True)
    if ordered["canonical_id"].tolist() != expected_ids:
        errors.append("canonical_id values are not deterministic by canonical_label")

    if not canonical["status"].isin({"ACTIVE", "REVIEW", "DEPRECATED"}).all():
        errors.append("canonical contains an invalid status")
    if not canonical["taxonomy_version"].eq(TAXONOMY_VERSION).all():
        errors.append("canonical contains an unexpected taxonomy_version")

    normalized_aliases = aliases["alias"].map(normalize_classification)
    if normalized_aliases.duplicated().any():
        errors.append("alias is duplicated after normalization")
    valid_ids = set(canonical["canonical_id"])
    invalid_targets = sorted(set(aliases["canonical_id"]) - valid_ids)
    if invalid_targets:
        errors.append(f"aliases point to invalid IDs: {invalid_targets}")
    if not aliases["taxonomy_version"].eq(TAXONOMY_VERSION).all():
        errors.append("aliases contain an unexpected taxonomy_version")

    canonical_by_key = {
        normalize_classification(row.canonical_label): row.canonical_id
        for row in canonical.itertuples(index=False)
    }
    for row in aliases.itertuples(index=False):
        alias_key = normalize_classification(row.alias)
        if alias_key in canonical_by_key and canonical_by_key[alias_key] != row.canonical_id:
            errors.append(f"circular/conflicting alias reference: {row.alias}")
        if canonical_by_key.get(alias_key) == row.canonical_id:
            errors.append(f"self alias is unnecessary: {row.alias}")

    source_labels = set(dataset["classification_canonical"])
    candidate_labels = set(canonical["canonical_label"])
    disappeared = sorted(source_labels - candidate_labels)
    unexpected = sorted(candidate_labels - source_labels)
    if disappeared:
        errors.append(f"classes disappeared without a decision: {disappeared}")
    if unexpected:
        errors.append(f"candidate introduced classes absent from source: {unexpected}")

    if not decisions["decision"].isin(TAXONOMY_DECISIONS).all():
        errors.append("taxonomy_review_decisions contains an invalid decision")
    if not decisions["taxonomy_version"].eq(TAXONOMY_VERSION).all():
        errors.append("decisions contain an unexpected taxonomy_version")
    if decisions[["label_a", "label_b"]].duplicated().any():
        errors.append("taxonomy_review_decisions contains a duplicate pair")

    nonblank_review_types = top250.loc[top250["review_type"].ne(""), "review_type"]
    if not nonblank_review_types.isin(REVIEW_TYPES).all():
        errors.append("top250 contains an invalid review_type")
    nonblank_human_decisions = top250.loc[top250["human_decision"].ne(""), "human_decision"]
    if not nonblank_human_decisions.isin(HUMAN_DECISIONS).all():
        errors.append("top250 contains an invalid human_decision")

    if version.get("version") != TAXONOMY_VERSION or version.get("status") != "candidate":
        errors.append("version.json does not identify the non-active candidate")
    hash_mismatches = []
    for source_name, expected_hash in version.get("source_hashes", {}).items():
        source = Path(source_name)
        if not source.exists():
            hash_mismatches.append(f"missing: {source_name}")
        elif sha256_file(source) != expected_hash:
            hash_mismatches.append(f"changed: {source_name}")
    if hash_mismatches:
        errors.append(f"protected source mutation detected: {hash_mismatches}")

    family_counts = Counter(canonical["family"])
    blank_human_cells = int((top250[HUMAN_FIELDS] == "").sum().sum())
    if blank_human_cells != len(top250) * len(HUMAN_FIELDS):
        warnings.append("top250 contains preserved human-entered fields; review provenance")

    metrics = {
        "total_classes": int(len(canonical)),
        "aliases_migrated": int(len(aliases)),
        "classes_by_family": dict(sorted(family_counts.items())),
        "other_unknown": int((canonical["family"] == "OTHER_UNKNOWN").sum()),
        "missing_component": int(canonical["component"].eq("").sum()),
        "missing_mechanism": int(canonical["mechanism"].eq("").sum()),
        "missing_definition": int(canonical["definition"].eq("").sum()),
        "deprecated": int(canonical["status"].eq("DEPRECATED").sum()),
        "pending_review": int(decisions["decision"].eq("PENDING").sum()),
        "canonical_statuses": {
            key: int(value) for key, value in sorted(Counter(canonical["status"]).items())
        },
        "decision_rows": int(len(decisions)),
        "top250_rows": int(len(top250)),
        "top250_human_fields_blank": blank_human_cells == len(top250) * len(HUMAN_FIELDS),
    }
    return {
        "result": "PASS" if not errors else "FAIL",
        "taxonomy_version": TAXONOMY_VERSION,
        "errors": errors,
        "warnings": warnings,
        "metrics": metrics,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit the non-active taxonomy v3 candidate.")
    parser.add_argument("--taxonomy-dir", default=DEFAULT_TAXONOMY_DIR)
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--report", default=DEFAULT_REPORT)
    args = parser.parse_args()

    result = audit_candidate(Path(args.taxonomy_dir).resolve(), Path(args.dataset).resolve())
    report = Path(args.report).resolve()
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
