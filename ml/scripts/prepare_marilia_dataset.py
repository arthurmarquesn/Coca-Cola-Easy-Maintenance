from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable

import pandas as pd


DATASET_VERSION = "marilia-human-v1"
DEFAULT_INPUT = "ml/data/human/APONTAMENTOS MARILIA.xlsx"
DEFAULT_OUTPUT = (
    "ml/data/human/marilia/prepared/marilia_human_v1.csv"
)
DEFAULT_REPORT_DIR = "ml/reports"

OBSERVATION_CANDIDATES = {
    "OBSERVACAO",
    "OBSERVACOES",
    "OCORRENCIA",
    "OCORRENCIAS",
}
CLASSIFICATION_CANDIDATES = {
    "CLASSIFICACAO",
    "MODO DE FALHA",
    "MODO FALHA",
}
OPTIONAL_COLUMN_CANDIDATES = {
    "equipment": {
        "EQUIPAMENTO",
        "NOME DO EQUIPAMENTO",
        "NOME EQUIPAMENTO",
    },
    "line": {"LINHA", "NOME DA LINHA", "NOME LINHA"},
    "stop_type": {
        "TIPO DE PARADA",
        "TIPO PARADA",
        "TIPO DA PARADA",
    },
    "stop_key_1": {
        "CHAVE 1",
        "CHAVE DE PARADA 1",
        "CHAVE PARADA 1",
        "STOP KEY 1",
    },
    "stop_subkey": {
        "SUBCHAVE",
        "SUB CHAVE",
        "SUBCHAVE DE PARADA",
        "STOP SUBKEY",
    },
}


def clean_display(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(
        character
        for character in normalized
        if not unicodedata.combining(character)
    )


def normalize_observation(value: object) -> str:
    text = strip_accents(clean_display(value)).lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_classification(value: object) -> str:
    text = strip_accents(clean_display(value)).upper()
    text = re.sub(r"[^A-Z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalized_header(value: object) -> str:
    return normalize_classification(value)


def find_column(
    columns: Iterable[object],
    candidates: set[str],
    *,
    required: bool = True,
) -> object | None:
    by_normalized = {normalized_header(column): column for column in columns}
    for candidate in sorted(candidates):
        if candidate in by_normalized:
            return by_normalized[candidate]
    if required:
        raise ValueError(
            "Coluna obrigatoria nao encontrada. "
            f"Esperado: {sorted(candidates)}; encontrado: "
            f"{[str(column) for column in columns]}"
        )
    return None


def read_table(path: Path, sheet_name: str | int = 0) -> pd.DataFrame:
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path, sheet_name=sheet_name, dtype=object)
    if suffix == ".csv":
        return pd.read_csv(path, dtype=object)
    if suffix == ".tsv":
        return pd.read_csv(path, sep="\t", dtype=object)
    raise ValueError(f"Formato de arquivo nao suportado: {path.suffix}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_source(
    input_path: Path,
    sheet_name: str | int = 0,
) -> tuple[pd.DataFrame, dict[str, str]]:
    source = read_table(input_path, sheet_name)
    observation_column = find_column(
        source.columns, OBSERVATION_CANDIDATES
    )
    classification_column = find_column(
        source.columns, CLASSIFICATION_CANDIDATES
    )

    mappings: dict[str, object] = {
        "observation": observation_column,
        "classification_original": classification_column,
    }
    for output_name, candidates in OPTIONAL_COLUMN_CANDIDATES.items():
        column = find_column(source.columns, candidates, required=False)
        if column is not None:
            mappings[output_name] = column

    result = pd.DataFrame(index=source.index)
    # Excel row numbers include the one-based header row.
    result["row_id"] = source.index.to_series().astype(int) + 2
    for output_name, source_name in mappings.items():
        result[output_name] = source[source_name].map(clean_display)

    result["observation_norm"] = result["observation"].map(
        normalize_observation
    )
    result["classification_norm"] = result[
        "classification_original"
    ].map(normalize_classification)

    ordered = [
        "row_id",
        "observation",
        "observation_norm",
        "classification_original",
        "classification_norm",
    ]
    ordered.extend(
        field for field in OPTIONAL_COLUMN_CANDIDATES if field in result
    )
    return result[ordered], {
        str(output_name): str(source_name)
        for output_name, source_name in mappings.items()
    }


def build_conflicts(dataset: pd.DataFrame) -> tuple[pd.DataFrame, set[str]]:
    counts = (
        dataset.groupby(["observation_norm", "classification_norm"])
        .size()
        .rename("count")
        .reset_index()
    )
    label_counts = counts.groupby("observation_norm").size()
    conflict_keys = set(label_counts[label_counts > 1].index.astype(str))
    rows: list[dict[str, object]] = []
    for observation_norm in sorted(conflict_keys):
        group = dataset[dataset["observation_norm"] == observation_norm]
        per_label = (
            group.groupby("classification_norm")
            .size()
            .sort_values(ascending=False)
        )
        rows.append(
            {
                "observation": group["observation"].value_counts().index[0],
                "observation_norm": observation_norm,
                "classifications_found": " | ".join(per_label.index),
                "counts_by_classification": " | ".join(
                    f"{label}:{int(count)}"
                    for label, count in per_label.items()
                ),
                "row_ids": " | ".join(
                    str(value) for value in sorted(group["row_id"].astype(int))
                ),
                "rows": int(len(group)),
            }
        )
    columns = [
        "observation",
        "observation_norm",
        "classifications_found",
        "counts_by_classification",
        "row_ids",
        "rows",
    ]
    return pd.DataFrame(rows, columns=columns), conflict_keys


def load_external_observations(path: Path) -> set[str]:
    external = read_table(path)
    observation_column = find_column(
        external.columns, OBSERVATION_CANDIDATES
    )
    return {
        normalized
        for normalized in external[observation_column].map(
            normalize_observation
        )
        if normalized
    }


def class_bucket(rows: int) -> str:
    if rows == 1:
        return "1"
    if rows == 2:
        return "2"
    if rows <= 5:
        return "3_to_5"
    if rows <= 10:
        return "6_to_10"
    return "over_10"


def build_distribution(dataset: pd.DataFrame) -> pd.DataFrame:
    result = (
        dataset.groupby("classification_norm", as_index=False)
        .agg(
            rows=("row_id", "size"),
            unique_observations=("observation_norm", "nunique"),
            display_label=("classification_original", lambda s: s.value_counts().index[0]),
        )
        .sort_values(["rows", "classification_norm"], ascending=[False, True])
        .reset_index(drop=True)
    )
    result["percentage"] = (result["rows"] / len(dataset)).round(8)
    result["rarity_bucket"] = result["rows"].map(class_bucket)
    result["is_rare"] = result["rows"] <= 10
    result.insert(0, "rank", range(1, len(result) + 1))
    return result


def build_taxonomy_review(distribution: pd.DataFrame) -> pd.DataFrame:
    labels = sorted(distribution["classification_norm"].astype(str))
    rows: list[dict[str, object]] = []
    for index, left in enumerate(labels):
        left_tokens = set(left.split())
        for right in labels[index + 1 :]:
            right_tokens = set(right.split())
            union = left_tokens | right_tokens
            token_similarity = (
                len(left_tokens & right_tokens) / len(union) if union else 0.0
            )
            text_similarity = SequenceMatcher(None, left, right).ratio()
            if text_similarity >= 0.9 or token_similarity >= 0.8:
                rows.append(
                    {
                        "classification_a": left,
                        "classification_b": right,
                        "text_similarity": round(text_similarity, 6),
                        "token_jaccard": round(token_similarity, 6),
                        "action": "HUMAN_REVIEW_REQUIRED",
                    }
                )
    columns = [
        "classification_a",
        "classification_b",
        "text_similarity",
        "token_jaccard",
        "action",
    ]
    return pd.DataFrame(rows, columns=columns).sort_values(
        ["text_similarity", "token_jaccard"], ascending=False
    ) if rows else pd.DataFrame(columns=columns)


def parse_sheet(value: str) -> str | int:
    return int(value) if value.isdigit() else value


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Prepara exclusivamente os apontamentos humanos de Marilia, "
            "sem alterar rotulos nem resolver conflitos arbitrariamente."
        )
    )
    parser.add_argument("--input", default=DEFAULT_INPUT)
    parser.add_argument("--sheet", default="0")
    parser.add_argument("--output", default=DEFAULT_OUTPUT)
    parser.add_argument("--report-dir", default=DEFAULT_REPORT_DIR)
    parser.add_argument("--external-holdout")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    report_dir = Path(args.report_dir).resolve()
    if not input_path.exists():
        raise FileNotFoundError(f"Planilha de Marilia nao encontrada: {input_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    raw, column_mapping = load_source(input_path, parse_sheet(args.sheet))
    raw_rows = int(len(raw))
    missing_observation_rows = int((raw["observation_norm"] == "").sum())
    missing_classification_rows = int(
        (raw["classification_norm"] == "").sum()
    )
    eligible = raw[
        (raw["observation_norm"] != "")
        & (raw["classification_norm"] != "")
    ].copy()

    conflicts, conflict_keys = build_conflicts(eligible)
    conflict_rows = int(
        eligible["observation_norm"].isin(conflict_keys).sum()
    )
    clean = eligible[~eligible["observation_norm"].isin(conflict_keys)].copy()

    overlap = pd.DataFrame(columns=clean.columns)
    external_path: Path | None = None
    external_observations: set[str] = set()
    if args.external_holdout:
        external_path = Path(args.external_holdout).resolve()
        if not external_path.exists():
            raise FileNotFoundError(
                f"Holdout externo nao encontrado: {external_path}"
            )
        external_observations = load_external_observations(external_path)
        overlap = clean[
            clean["observation_norm"].isin(external_observations)
        ].copy()
        clean = clean[
            ~clean["observation_norm"].isin(external_observations)
        ].copy()

    clean = clean.sort_values("row_id").reset_index(drop=True)
    distribution = build_distribution(clean)
    taxonomy_review = build_taxonomy_review(distribution)

    conflicts_path = report_dir / "failure_classifier_marilia_v1_3_conflicts.csv"
    distribution_path = (
        report_dir / "failure_classifier_marilia_v1_3_taxonomy_distribution.csv"
    )
    taxonomy_review_path = (
        report_dir / "failure_classifier_marilia_v1_3_taxonomy_review.csv"
    )
    overlap_path = (
        report_dir / "failure_classifier_marilia_v1_3_external_overlap.csv"
    )
    audit_path = report_dir / "failure_classifier_marilia_v1_3_dataset_audit.json"

    clean.to_csv(output_path, index=False, encoding="utf-8-sig")
    conflicts.to_csv(conflicts_path, index=False, encoding="utf-8-sig")
    distribution.to_csv(distribution_path, index=False, encoding="utf-8-sig")
    taxonomy_review.to_csv(
        taxonomy_review_path, index=False, encoding="utf-8-sig"
    )
    overlap.to_csv(overlap_path, index=False, encoding="utf-8-sig")

    bucket_counts = {
        bucket: int(count)
        for bucket, count in distribution["rarity_bucket"].value_counts().items()
    }
    audit = {
        "dataset_version": DATASET_VERSION,
        "source": str(input_path),
        "source_sha256": sha256_file(input_path),
        "source_sheet": args.sheet,
        "column_mapping": column_mapping,
        "context_fields_found": [
            field for field in OPTIONAL_COLUMN_CANDIDATES if field in clean.columns
        ],
        "raw_rows": raw_rows,
        "rows_missing_observation": missing_observation_rows,
        "rows_missing_classification": missing_classification_rows,
        "eligible_rows_before_conflicts": int(len(eligible)),
        "conflict_observations": int(len(conflict_keys)),
        "conflict_rows_removed": conflict_rows,
        "external_holdout": str(external_path) if external_path else None,
        "external_holdout_unique_observations": int(len(external_observations)),
        "external_overlap_rows_removed": int(len(overlap)),
        "external_overlap_unique_observations": int(
            overlap["observation_norm"].nunique() if not overlap.empty else 0
        ),
        "usable_rows": int(len(clean)),
        "unique_observations": int(clean["observation_norm"].nunique()),
        "classes": int(clean["classification_norm"].nunique()),
        "class_buckets": {
            "classes_with_1_example": bucket_counts.get("1", 0),
            "classes_with_2_examples": bucket_counts.get("2", 0),
            "classes_with_3_to_5_examples": bucket_counts.get("3_to_5", 0),
            "classes_with_6_to_10_examples": bucket_counts.get("6_to_10", 0),
            "classes_with_over_10_examples": bucket_counts.get("over_10", 0),
        },
        "rare_classes_le_10_rows": int((distribution["rows"] <= 10).sum()),
        "top_30_classes": distribution.head(30)[
            ["classification_norm", "rows", "percentage"]
        ].to_dict(orient="records"),
        "possible_equivalent_class_pairs_for_review": int(len(taxonomy_review)),
        "prepared_dataset": str(output_path),
    }
    audit_path.write_text(
        json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
