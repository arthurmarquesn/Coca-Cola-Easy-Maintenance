from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd

from ml.scripts.prepare_marilia_dataset import normalize_classification, normalize_observation


TAXONOMY_VERSION = "canonical-taxonomy-v3-candidate"
SOURCE_VERSION = "canonical-taxonomy-v2"
CREATED_AT = "2026-10-04T00:00:00-03:00"
DEFAULT_DATASET = "ml/data/human/marilia/prepared/marilia_human_v2_canonical.csv"
DEFAULT_TAXONOMY_V2 = "ml/data/human/marilia/taxonomy/canonical_taxonomy_v2.csv"
DEFAULT_REVIEW_QUEUE = "ml/reports/ursus_v1_6_taxonomy_review_queue.csv"
DEFAULT_TOP250 = "ml/reports/ursus_v1_6_human_review_top250.csv"
DEFAULT_OUTPUT_DIR = "ml/taxonomy"
DEFAULT_MODELS = (
    "ml/models/failure_classifier_real_v1_2_eval.joblib",
    "ml/models/failure_classifier_marilia_v1_3_candidate.joblib",
    "ml/models/failure_classifier_marilia_v1_3_candidate_eval.joblib",
    "ml/models/failure_classifier_marilia_v1_4_candidate.joblib",
    "ml/models/failure_classifier_marilia_v1_4_candidate_eval.joblib",
    "ml/models/failure_classifier_marilia_v1_5_candidate.joblib",
    "ml/models/failure_classifier_marilia_v1_5_candidate_eval.joblib",
)
REVIEW_TYPES = {
    "LABEL_CORRECT", "WRONG_LABEL", "ALIAS_ONLY", "TAXONOMY_OVERLAP",
    "GENERIC_SPECIFIC", "CAUSE_EFFECT", "INSUFFICIENT_CONTEXT", "NEW_CLASS_REQUIRED",
}
HUMAN_DECISIONS = {"KEEP", "RELABEL", "MERGE_CANDIDATE", "REVIEW_TAXONOMY", "UNDECIDED"}
TAXONOMY_DECISIONS = {
    "KEEP_SEPARATE", "MERGE_APPROVED", "ALIAS_APPROVED", "GENERIC_SPECIFIC",
    "CAUSE_EFFECT", "INSUFFICIENT_CONTEXT", "PENDING",
}
EXPLICIT_MECHANISMS = (
    "SEM MODO DE FALHA IDENTIFICADO",
    "DESALINHAMENTO", "DESLIGAMENTO", "DESNIVELAMENTO", "DESPRENDIMENTO",
    "SOBREAQUECIMENTO", "TRANSBORDAMENTO", "PATINAMENTO", "PATINAGEM",
    "ROMPIMENTO", "TRAVAMENTO", "AMASSAMENTO", "ENTUPIMENTO", "OBSTRUCAO",
    "DEFORMACAO", "DANIFICACAO", "DESGASTE", "INTERFERENCIA", "TOMBAMENTO",
    "FALHA", "QUEBRA", "ENROSCO", "DESARME", "VAZAMENTO", "QUEDA", "ESCAPE",
    "QUEIMA", "COLAPSO", "COLISAO", "VIBRACAO", "TREPIDACAO", "SOBRECORRENTE",
    "CURTO CIRCUITO", "ERRO", "PERDA", "AUSENCIA", "AFROUXAMENTO",
)
EXPLICIT_COMPONENT_FAMILIES = {
    "ATUADOR", "BANDEJA", "BARREIRA", "BOMBA", "CABECOTE", "CAMERA",
    "CILINDRO", "CORREIA", "CORRENTE", "EIXO", "ELEVADOR", "ENCODER",
    "ENGRENAGEM", "ESTEIRA", "FILTRO", "FLUXIMETRO", "GUIA", "IHM",
    "INVERSOR", "MAGAZINE", "MANGUEIRA", "MESA", "MOTOR", "PATINS",
    "PEGADOR", "PERSIANA", "PINCA", "PRESSOSTATO", "REDUTOR", "ROBO",
    "ROLAMENTO", "ROLETE", "SENSOR", "SERVO_MOTOR", "STOPPER", "SUPORTE",
    "TUBULACAO", "VALVULA", "VENTOSA", "VIBRADOR",
}
DEFINITION_STOPWORDS = {
    "PARA", "COM", "SEM", "UMA", "ESTAVA", "FORAM", "PELO", "PELA", "APOS",
    "DEVIDO", "ONDE", "QUANDO", "QUE", "NAO", "FOI", "DOS", "DAS", "NAS",
    "NOS", "ENTRE", "ORDEM", "NOTA", "AJUSTE", "AJUSTES", "REALIZADO",
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_csv(frame: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False, encoding="utf-8-sig")


def canonical_ids(labels: list[str]) -> dict[str, str]:
    return {label: f"FM{index:06d}" for index, label in enumerate(sorted(set(labels)), start=1)}


def explicit_mechanism(label: str) -> str:
    normalized = normalize_classification(label)
    for mechanism in EXPLICIT_MECHANISMS:
        if normalized == mechanism or normalized.startswith(f"{mechanism} "):
            return mechanism
    return ""


def explicit_component(label: str, family: str) -> str:
    if family not in EXPLICIT_COMPONENT_FAMILIES:
        return ""
    family_text = family.replace("_", " ")
    normalized = normalize_classification(label)
    if re.search(rf"\b{re.escape(family_text)}(?:S)?\b", normalized):
        return family_text
    return ""


def evidence_definition(observations: pd.Series) -> str:
    unique = observations.astype(str).drop_duplicates().tolist()
    if len(unique) < 5:
        return ""
    document_frequency: Counter[str] = Counter()
    for observation in unique:
        tokens = {
            token for token in normalize_observation(observation).upper().split()
            if len(token) >= 4 and token not in DEFINITION_STOPWORDS and not token.isdigit()
        }
        document_frequency.update(tokens)
    minimum = max(2, math.ceil(len(unique) * 0.30))
    terms = [
        token for token, count in sorted(document_frequency.items(), key=lambda item: (-item[1], item[0]))
        if count >= minimum
    ][:6]
    if not terms:
        return ""
    return (
        "Nos apontamentos existentes, este rótulo aparece em observações que "
        f"mencionam frequentemente: {', '.join(terms)}. Requer validação de especialista."
    )


def build_canonical_modes(
    dataset: pd.DataFrame,
    review_queue: pd.DataFrame,
) -> pd.DataFrame:
    labels = sorted(dataset["classification_canonical"].astype(str).unique())
    ids = canonical_ids(labels)
    pending_labels = set(review_queue["label_a"].astype(str)) | set(review_queue["label_b"].astype(str))
    family_by_label = (
        dataset.groupby("classification_canonical")["technical_family"]
        .agg(lambda values: values.value_counts().index[0])
        .to_dict()
    )
    rows = []
    for label in labels:
        family = str(family_by_label.get(label, "OTHER_UNKNOWN")) or "OTHER_UNKNOWN"
        observations = dataset.loc[dataset["classification_canonical"] == label, "observation"]
        rows.append({
            "canonical_id": ids[label], "canonical_label": label, "family": family,
            "component": explicit_component(label, family),
            "mechanism": explicit_mechanism(label),
            "definition": evidence_definition(observations),
            "status": "REVIEW" if label in pending_labels else "ACTIVE",
            "taxonomy_version": TAXONOMY_VERSION,
        })
    return pd.DataFrame(rows)


def build_aliases(taxonomy_v2: pd.DataFrame, canonical: pd.DataFrame) -> pd.DataFrame:
    ids = canonical.set_index("canonical_label")["canonical_id"].to_dict()
    applied = taxonomy_v2[
        taxonomy_v2["applied_automatically"].astype(str).str.lower().eq("true")
        & taxonomy_v2["original_label"].ne(taxonomy_v2["suggested_canonical_label"])
    ]
    rows = []
    for row in applied.itertuples(index=False):
        target = str(row.suggested_canonical_label)
        rows.append({
            "alias": str(row.original_label), "canonical_id": ids[target],
            "reason": str(row.reason), "approved_by": "legacy_safe_mapping_v2",
            "approved_at": "", "taxonomy_version": TAXONOMY_VERSION,
        })
    return pd.DataFrame(rows).sort_values("alias").reset_index(drop=True)


def preserve_existing_decisions(path: Path) -> dict[tuple[str, str], dict[str, str]]:
    if not path.exists():
        return {}
    existing = pd.read_csv(path, dtype=str, keep_default_na=False)
    result = {}
    for row in existing.to_dict(orient="records"):
        if row.get("decision") not in {"", "PENDING"} or row.get("reviewed_by") or row.get("reviewed_at"):
            result[(row["label_a"], row["label_b"])] = row
    return result


def build_review_decisions(
    review_queue: pd.DataFrame,
    taxonomy_v2: pd.DataFrame,
    output_path: Path,
) -> pd.DataFrame:
    preserved = preserve_existing_decisions(output_path)
    rows: dict[tuple[str, str], dict[str, str]] = {}
    for row in review_queue.itertuples(index=False):
        key = (str(row.label_a), str(row.label_b))
        rows[key] = {
            "label_a": key[0], "label_b": key[1], "decision": "PENDING",
            "reason": (
                f"Analytical candidate: relation={row.relation}; "
                f"recommended_action={row.recommended_action}; confidence={row.confidence}. "
                "No human decision recorded."
            ),
            "reviewed_by": "", "reviewed_at": "", "taxonomy_version": TAXONOMY_VERSION,
        }
    aliases = taxonomy_v2[
        taxonomy_v2["applied_automatically"].astype(str).str.lower().eq("true")
        & taxonomy_v2["original_label"].ne(taxonomy_v2["suggested_canonical_label"])
    ]
    for row in aliases.itertuples(index=False):
        key = (str(row.original_label), str(row.suggested_canonical_label))
        rows[key] = {
            "label_a": key[0], "label_b": key[1], "decision": "ALIAS_APPROVED",
            "reason": f"Migrated approved conservative v2 alias. {row.reason}",
            "reviewed_by": "legacy_safe_mapping_v2", "reviewed_at": "",
            "taxonomy_version": TAXONOMY_VERSION,
        }
    rows.update(preserved)
    frame = pd.DataFrame(rows.values())
    frame["taxonomy_version"] = TAXONOMY_VERSION
    return frame.sort_values(["label_a", "label_b"]).reset_index(drop=True)


def governed_top250(source_path: Path, output_path: Path) -> pd.DataFrame:
    source = pd.read_csv(source_path, dtype=str, keep_default_na=False)
    existing_by_observation: dict[str, dict[str, str]] = {}
    if output_path.exists():
        existing = pd.read_csv(output_path, dtype=str, keep_default_na=False)
        existing_by_observation = {
            normalize_observation(row["observation"]): row
            for row in existing.to_dict(orient="records")
        }
    if "review_type" not in source.columns:
        insert_at = source.columns.get_loc("human_decision") if "human_decision" in source.columns else len(source.columns)
        source.insert(insert_at, "review_type", "")
    for field in ("human_decision", "human_label", "human_comment", "reviewed_by", "reviewed_at"):
        if field not in source.columns:
            source[field] = ""
    human_fields = ["review_type", "human_decision", "human_label", "human_comment", "reviewed_by", "reviewed_at"]
    for index, row in source.iterrows():
        existing = existing_by_observation.get(normalize_observation(str(row["observation"])))
        for field in human_fields:
            source.at[index, field] = str(existing.get(field, "")) if existing else ""
    return source


def protected_source_hashes(dataset_path: Path, taxonomy_path: Path) -> dict[str, str]:
    paths = [dataset_path, taxonomy_path]
    paths.extend(Path(path).resolve() for path in DEFAULT_MODELS if Path(path).exists())
    return {str(path): sha256_file(path) for path in paths}


def build_outputs(
    dataset_path: Path,
    taxonomy_v2_path: Path,
    review_queue_path: Path,
    top250_path: Path,
    output_dir: Path,
    created_at: str = CREATED_AT,
) -> dict[str, Path]:
    dataset = pd.read_csv(dataset_path, dtype=str, keep_default_na=False)
    taxonomy_v2 = pd.read_csv(taxonomy_v2_path, dtype=str, keep_default_na=False)
    review_queue = pd.read_csv(review_queue_path, dtype=str, keep_default_na=False)
    output_dir.mkdir(parents=True, exist_ok=True)
    canonical_path = output_dir / "canonical_failure_modes.csv"
    aliases_path = output_dir / "failure_mode_aliases.csv"
    decisions_path = output_dir / "taxonomy_review_decisions.csv"
    review_path = output_dir / "ursus_v1_6_human_review_top250.csv"
    version_path = output_dir / "version.json"

    canonical = build_canonical_modes(dataset, review_queue)
    aliases = build_aliases(taxonomy_v2, canonical)
    decisions = build_review_decisions(review_queue, taxonomy_v2, decisions_path)
    review = governed_top250(top250_path, review_path)
    write_csv(canonical, canonical_path)
    write_csv(aliases, aliases_path)
    write_csv(decisions, decisions_path)
    write_csv(review, review_path)
    version = {
        "version": TAXONOMY_VERSION,
        "status": "candidate",
        "source_version": SOURCE_VERSION,
        "created_at": created_at,
        "notes": (
            "Governance candidate built from canonical taxonomy v2 and frozen v1.6 diagnostics. "
            "Not active; no automatic taxonomy merge or human relabeling was applied."
        ),
        "source_hashes": protected_source_hashes(dataset_path, taxonomy_v2_path),
    }
    version_path.write_text(json.dumps(version, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "canonical": canonical_path, "aliases": aliases_path, "decisions": decisions_path,
        "review": review_path, "version": version_path,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the non-active canonical taxonomy v3 governance candidate.")
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--taxonomy-v2", default=DEFAULT_TAXONOMY_V2)
    parser.add_argument("--review-queue", default=DEFAULT_REVIEW_QUEUE)
    parser.add_argument("--top250", default=DEFAULT_TOP250)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--created-at", default=CREATED_AT)
    args = parser.parse_args()
    outputs = build_outputs(
        Path(args.dataset).resolve(), Path(args.taxonomy_v2).resolve(),
        Path(args.review_queue).resolve(), Path(args.top250).resolve(),
        Path(args.output_dir).resolve(), args.created_at,
    )
    print(json.dumps({key: str(value) for key, value in outputs.items()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
