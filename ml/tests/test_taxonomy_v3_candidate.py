from __future__ import annotations

import ast
import json
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from ml.scripts.audit_taxonomy_v3_candidate import HUMAN_FIELDS, audit_candidate
from ml.scripts.build_taxonomy_v3_candidate import (
    DEFAULT_DATASET,
    DEFAULT_REVIEW_QUEUE,
    DEFAULT_TAXONOMY_V2,
    DEFAULT_TOP250,
    TAXONOMY_VERSION,
    build_outputs,
    sha256_file,
)
from ml.taxonomy import (
    canonicalize_failure_mode,
    clear_taxonomy_cache,
    get_component,
    get_family,
    get_mechanism,
    get_taxonomy_entry,
)


ROOT = Path(__file__).resolve().parents[2]
TAXONOMY_DIR = ROOT / "ml" / "taxonomy"
DATASET_PATH = ROOT / DEFAULT_DATASET
TAXONOMY_V2_PATH = ROOT / DEFAULT_TAXONOMY_V2
REVIEW_QUEUE_PATH = ROOT / DEFAULT_REVIEW_QUEUE
TOP250_PATH = ROOT / DEFAULT_TOP250
MODEL_PATHS = sorted((ROOT / "ml" / "models").glob("*v1_[2-5]*.joblib"))


def _read(name: str) -> pd.DataFrame:
    return pd.read_csv(TAXONOMY_DIR / name, dtype=str, keep_default_na=False)


def _safe_mapping_keys() -> set[str]:
    source = (ROOT / "ml" / "scripts" / "build_marilia_taxonomy_v2.py").read_text(
        encoding="utf-8"
    )
    tree = ast.parse(source)
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.target.id == "SAFE_MAPPINGS":
                mappings = ast.literal_eval(node.value)
                return set(mappings)
    raise AssertionError("SAFE_MAPPINGS was not found")


def test_safe_alias_and_legacy_compatibility() -> None:
    assert canonicalize_failure_mode("QUEBRA DA ESTEIRA") == "QUEBRA DE ESTEIRA"
    assert canonicalize_failure_mode("  quebra da esteira  ") == "QUEBRA DE ESTEIRA"
    assert canonicalize_failure_mode("ENRROSCO DE GARRAFA") == "ENROSCO DE GARRAFAS"

    aliases = _read("failure_mode_aliases.csv")
    safe_mapping_keys = _safe_mapping_keys()
    assert set(aliases["alias"]) == safe_mapping_keys
    assert len(aliases) == len(safe_mapping_keys) == 16


def test_unknown_label_is_preserved_without_semantic_merge() -> None:
    unknown = "MODO INDUSTRIAL AINDA NAO GOVERNADO"
    assert canonicalize_failure_mode(unknown) == unknown
    assert get_taxonomy_entry(unknown) is None
    assert get_family(unknown) == "OTHER_UNKNOWN"
    assert get_component(unknown) == ""
    assert get_mechanism(unknown) == ""

    assert canonicalize_failure_mode("FALHA DE SENSOR") == "FALHA DE SENSOR"
    assert canonicalize_failure_mode("FALHA DE INSPECAO") == "FALHA DE INSPECAO"
    assert canonicalize_failure_mode("QUEBRA DE ESTEIRA") == "QUEBRA DE ESTEIRA"
    assert canonicalize_failure_mode("FALHA DE ESTEIRA") == "FALHA DE ESTEIRA"


def test_official_csv_read_layer() -> None:
    entry = get_taxonomy_entry("QUEBRA DA ESTEIRA")
    assert entry is not None
    assert entry["canonical_label"] == "QUEBRA DE ESTEIRA"
    assert entry["taxonomy_version"] == TAXONOMY_VERSION
    assert get_family("QUEBRA DA ESTEIRA") == entry["family"]
    assert get_component("QUEBRA DA ESTEIRA") == entry["component"]
    assert get_mechanism("QUEBRA DA ESTEIRA") == "QUEBRA"


def test_canonical_ids_are_stable_and_sorted() -> None:
    canonical = _read("canonical_failure_modes.csv")
    ordered = canonical.sort_values("canonical_label").reset_index(drop=True)
    assert canonical["canonical_label"].tolist() == ordered["canonical_label"].tolist()
    assert canonical["canonical_id"].tolist() == [
        f"FM{index:06d}" for index in range(1, len(canonical) + 1)
    ]
    assert canonical["canonical_id"].is_unique
    assert canonical["canonical_label"].is_unique


def test_candidate_is_non_active_and_top250_has_no_fabricated_review() -> None:
    version = json.loads((TAXONOMY_DIR / "version.json").read_text(encoding="utf-8"))
    assert version["version"] == TAXONOMY_VERSION
    assert version["status"] == "candidate"

    top250 = _read("ursus_v1_6_human_review_top250.csv")
    assert len(top250) == 250
    assert set(HUMAN_FIELDS).issubset(top250.columns)
    assert top250[HUMAN_FIELDS].eq("").all().all()
    assert not (ROOT / "ml" / "models" / "failure_classifier_marilia_v1_6_candidate.joblib").exists()


def test_governance_scripts_do_not_train_a_model() -> None:
    for name in (
        "build_taxonomy_v3_candidate.py",
        "audit_taxonomy_v3_candidate.py",
    ):
        source = (ROOT / "ml" / "scripts" / name).read_text(encoding="utf-8")
        assert ".fit(" not in source
        assert ".fit_transform(" not in source


def test_audit_passes() -> None:
    result = audit_candidate(TAXONOMY_DIR, DATASET_PATH)
    assert result["result"] == "PASS"
    assert result["errors"] == []
    assert result["metrics"]["total_classes"] == 421
    assert result["metrics"]["aliases_migrated"] == 16


def test_build_is_deterministic_and_does_not_mutate_sources(tmp_path: Path) -> None:
    protected = [DATASET_PATH, TAXONOMY_V2_PATH, TOP250_PATH, *MODEL_PATHS]
    before = {path: (path.stat().st_size, path.stat().st_mtime_ns) for path in protected}
    first = tmp_path / "first"
    second = tmp_path / "second"

    # Model hashes are already captured in the official version.json. Omitting
    # them here keeps this isolated reproducibility test fast; the builder never
    # opens a model for writing.
    with patch("ml.scripts.build_taxonomy_v3_candidate.DEFAULT_MODELS", ()):
        build_outputs(
            DATASET_PATH, TAXONOMY_V2_PATH, REVIEW_QUEUE_PATH, TOP250_PATH, first
        )
        build_outputs(
            DATASET_PATH, TAXONOMY_V2_PATH, REVIEW_QUEUE_PATH, TOP250_PATH, second
        )

    for filename in (
        "canonical_failure_modes.csv",
        "failure_mode_aliases.csv",
        "taxonomy_review_decisions.csv",
        "ursus_v1_6_human_review_top250.csv",
        "version.json",
    ):
        assert sha256_file(first / filename) == sha256_file(second / filename)

    after = {path: (path.stat().st_size, path.stat().st_mtime_ns) for path in protected}
    assert after == before
    clear_taxonomy_cache()
