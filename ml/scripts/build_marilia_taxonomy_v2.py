from __future__ import annotations

import argparse
import json
import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize


TAXONOMY_VERSION = "canonical-taxonomy-v2"
DEFAULT_DATASET = "ml/data/human/marilia/prepared/marilia_human_v1.csv"
DEFAULT_SPLIT = "ml/reports/failure_classifier_marilia_v1_3_split.csv"
DEFAULT_TAXONOMY_OUTPUT = (
    "ml/data/human/marilia/taxonomy/canonical_taxonomy_v2.csv"
)
DEFAULT_DATASET_OUTPUT = (
    "ml/data/human/marilia/prepared/marilia_human_v2_canonical.csv"
)
DEFAULT_CANDIDATES_OUTPUT = (
    "ml/reports/failure_classifier_marilia_v1_4_taxonomy_candidates.csv"
)
DEFAULT_AUDIT_OUTPUT = (
    "ml/reports/failure_classifier_marilia_v1_4_dataset_audit.json"
)


# Every automatic consolidation is explicit and reviewable. No fuzzy candidate
# outside this table changes ground truth.
SAFE_MAPPINGS: dict[str, tuple[str, str, str]] = {
    "ALIMENTACAO TAMPAS FALHA": (
        "FALHA DE ALIMENTACAO DE TAMPAS",
        "EXACT_VARIANT",
        "Same mechanism and object; only word order and prepositions differ.",
    ),
    "DEFORMACAO DO CABECOTE": (
        "DEFORMACAO DE CABECOTE",
        "EXACT_VARIANT",
        "Only the article/preposition differs.",
    ),
    "DESALINHAMENTO DO CENTRADOR": (
        "DESALINHAMENTO DE CENTRADOR",
        "EXACT_VARIANT",
        "Only the article/preposition differs.",
    ),
    "DESARME TRANSPORTE": (
        "DESARME DE TRANSPORTE",
        "EXACT_VARIANT",
        "Only a preposition is omitted.",
    ),
    "ESPUMAMENTO DA BEBIDA": (
        "ESPUMAMENTO DE BEBIDA",
        "EXACT_VARIANT",
        "Only the article/preposition differs.",
    ),
    "FALHA DA PINCA": (
        "FALHA DE PINCA",
        "EXACT_VARIANT",
        "Only the article/preposition differs.",
    ),
    "FALHA DE BOTAO DE RESET": (
        "FALHA NO BOTAO RESET",
        "EXACT_VARIANT",
        "Same button and reset failure; only function words differ.",
    ),
    "FALHA INVERSOR": (
        "FALHA DE INVERSOR",
        "EXACT_VARIANT",
        "Only a preposition is omitted.",
    ),
    "FALHA NA FORMACAO DE CAMADA": (
        "FALHA DE FORMACAO DE CAMADA",
        "EXACT_VARIANT",
        "Only the preposition differs.",
    ),
    "FALHA NA VALVULA": (
        "FALHA DE VALVULA",
        "EXACT_VARIANT",
        "Same generic valve failure; only the preposition differs.",
    ),
    "FALHA NO TROCADOR DE CALOR": (
        "FALHA TROCADOR DE CALOR",
        "EXACT_VARIANT",
        "Same heat-exchanger failure; only function words differ.",
    ),
    "FALHA VALVULA DE ENCHIMENTO": (
        "FALHA DE VALVULA DE ENCHIMENTO",
        "EXACT_VARIANT",
        "Only a preposition is omitted.",
    ),
    "QUEBRA DA ESTEIRA": (
        "QUEBRA DE ESTEIRA",
        "EXACT_VARIANT",
        "Same break mechanism and conveyor component.",
    ),
    "ROBO COM FALHA": (
        "FALHA DE ROBO",
        "EXACT_VARIANT",
        "Same generic robot failure with inverted word order.",
    ),
    "TRAVAMENTO ELEVADOR": (
        "TRAVAMENTO DE ELEVADOR",
        "EXACT_VARIANT",
        "Only a preposition is omitted.",
    ),
    "ENRROSCO DE GARRAFA": (
        "ENROSCO DE GARRAFAS",
        "ORTHOGRAPHIC_VARIANT",
        "Clear spelling error plus singular/plural variation of the same event.",
    ),
}

FUNCTION_WORDS = {
    "A", "AS", "O", "OS", "DE", "DA", "DAS", "DO", "DOS",
    "EM", "NA", "NAS", "NO", "NOS", "COM",
}
GENERIC_PREFIXES = {
    "FALHA DE COMPONENTE",
    "FALHA DE EQUIPAMENTO",
    "SEM MODO DE FALHA IDENTIFICADO",
}
FAMILY_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("INSPECAO", ("INSPECAO",)),
    ("REJEICAO", ("REJEICAO", "REJEITO")),
    ("ENVOLVIMENTO", ("ENVOLVIMENTO",)),
    ("SINCRONISMO", ("SINCRONISMO",)),
    ("SEGMENTO", ("SEGMENTO", "SEGMENTOS")),
    ("CAMADA", ("CAMADA",)),
    ("BARREIRA", ("BARREIRA",)),
    ("PEGADOR", ("PEGADOR", "PEGADA")),
    ("VENTOSA", ("VENTOSA",)),
    ("DESCAPSULAMENTO", ("DESCAPSUL",)),
    ("IHM", (" IHM ",)),
    ("AUTOMACAO", ("AUTOMACAO", " PLC ")),
    ("REDUTOR", ("REDUTOR",)),
    ("PATINS", ("PATINS",)),
    ("VIBRADOR", ("VIBRADOR",)),
    ("CABECOTE", ("CABECOTE",)),
    ("PRESSOSTATO", ("PRESSOSTATO",)),
    ("FLUXIMETRO", ("FLUXIMETRO",)),
    ("CAMERA", ("CAMERA",)),
    ("PERSIANA", ("PERSIANA",)),
    ("STOPPER", ("STOPPER",)),
    ("FILTRO", ("FILTRO",)),
    ("BOBINA", ("BOBINA",)),
    ("BANDEJA", ("BANDEJA",)),
    ("CARBONATACAO", ("CARBONAT",)),
    ("TEMPERATURA", ("TEMPERATURA", "TERMICO")),
    ("PROCESSO", ("PROCESSO",)),
    ("MESA", (" MESA ",)),
    ("SUPORTE", ("SUPORTE",)),
    ("CARTAO", ("CARTAO", "CHAPATEX")),
    ("VALVULA", ("VALVULA",)),
    ("SENSOR", ("SENSOR",)),
    ("ENCODER", ("ENCODER",)),
    ("SERVO_MOTOR", ("SERVO MOTOR",)),
    ("MOTOR", ("MOTOR",)),
    ("INVERSOR", ("INVERSOR",)),
    ("ESTEIRA", ("ESTEIRA", "LONA")),
    ("CORREIA", ("CORREIA",)),
    ("CORRENTE", ("CORRENTE",)),
    ("ROLETE", ("ROLETE", "ROLETES")),
    ("ROBO", ("ROBO",)),
    ("PINCA", ("PINCA",)),
    ("ELEVADOR", ("ELEVADOR",)),
    ("MAGAZINE", ("MAGAZINE",)),
    ("TAMPA", ("TAMPA", "TAMPAS", "TAMPAMENTO")),
    ("GARRAFA", ("GARRAFA", "GARRAFAS")),
    ("LATA", ("LATA", "LATAS")),
    ("PACOTE", ("PACOTE", "PACOTES")),
    ("PALETE", ("PALETE", "PALETES", "PALLET")),
    ("CAIXA", ("CAIXA", "CAIXAS")),
    ("ROTULO", ("ROTULO", "ROTULOS", "ROTULAGEM")),
    ("FILME", ("FILME",)),
    ("MANGUEIRA", ("MANGUEIRA",)),
    ("CILINDRO", ("CILINDRO",)),
    ("ENGRENAGEM", ("ENGRENAGEM",)),
    ("EIXO", ("EIXO",)),
    ("ROLAMENTO", ("ROLAMENTO",)),
    ("PNEUMATICO", ("PNEUMATIC",)),
    ("ELETRICO", ("ELETRIC", "FUSIVEL", "CONTATOR", "RELE")),
    ("COMUNICACAO", ("COMUNICACAO", "DEVICENET", "REDE")),
    ("SEGURANCA", ("SEGURANCA",)),
    ("RECRAVACAO", ("RECRAV",)),
    ("ENCHIMENTO", ("ENCHIMENTO", "ENCHEDORA")),
    ("TRANSPORTE", ("TRANSPORTE", "TRANSPORTADOR")),
    ("DOSAGEM", ("DOSAGEM", "DOSADOR")),
    ("BOMBA", ("BOMBA",)),
    ("TUBULACAO", ("TUBULACAO", "TUBO", "TUBEIRA")),
    ("ATUADOR", ("ATUADOR",)),
    ("GUIA", ("GUIA", "REGUA")),
    ("IMPRESSAO", ("IMPRESSAO", "CODIFICACAO", "CODIFICADOR")),
)


def content_tokens(label: str) -> tuple[str, ...]:
    return tuple(token for token in label.split() if token not in FUNCTION_WORDS)


def derive_family(label: str) -> str:
    normalized = f" {label.upper()} "
    for family, patterns in FAMILY_PATTERNS:
        if any(pattern in normalized for pattern in patterns):
            return family
    return "OTHER_UNKNOWN"


def relation_between(left: str, right: str) -> str:
    if left == right:
        return "UNIQUE"
    left_tokens = set(content_tokens(left))
    right_tokens = set(content_tokens(right))
    if left_tokens == right_tokens:
        return "EXACT_VARIANT"
    if left_tokens < right_tokens or right_tokens < left_tokens:
        return "GENERIC_SPECIFIC"
    if {"PATINAGEM", "PATINAMENTO"} <= (left_tokens | right_tokens):
        return "MORPHOLOGICAL_VARIANT"
    return "RELATED_NOT_EQUIVALENT"


def build_observation_centroids(
    train: pd.DataFrame,
) -> tuple[np.ndarray, dict[str, int]]:
    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=1,
        strip_accents="unicode",
        sublinear_tf=True,
    )
    features = vectorizer.fit_transform(train["observation"].astype(str))
    labels = sorted(train["classification_norm"].unique())
    centroids = []
    values = train["classification_norm"].to_numpy(dtype=str)
    for label in labels:
        centroids.append(np.asarray(features[values == label].mean(axis=0)))
    return normalize(np.vstack(centroids)), {
        label: index for index, label in enumerate(labels)
    }


def taxonomy_stats(labels: pd.Series) -> dict[str, Any]:
    counts = labels.value_counts()
    return {
        "classes": int(len(counts)),
        "singletons": int((counts == 1).sum()),
        "classes_le_3": int((counts <= 3).sum()),
        "classes_le_5": int((counts <= 5).sum()),
        "classes_le_10": int((counts <= 10).sum()),
        "mean_support": round(float(counts.mean()), 6),
        "median_support": round(float(counts.median()), 6),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a conservative, auditable Marilia taxonomy v2."
    )
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--reference-split", default=DEFAULT_SPLIT)
    parser.add_argument("--taxonomy-output", default=DEFAULT_TAXONOMY_OUTPUT)
    parser.add_argument("--dataset-output", default=DEFAULT_DATASET_OUTPUT)
    parser.add_argument("--candidates-output", default=DEFAULT_CANDIDATES_OUTPUT)
    parser.add_argument("--audit-output", default=DEFAULT_AUDIT_OUTPUT)
    args = parser.parse_args()

    dataset_path = Path(args.dataset).resolve()
    split_path = Path(args.reference_split).resolve()
    taxonomy_path = Path(args.taxonomy_output).resolve()
    output_path = Path(args.dataset_output).resolve()
    candidates_path = Path(args.candidates_output).resolve()
    audit_path = Path(args.audit_output).resolve()
    for path in (taxonomy_path, output_path, candidates_path, audit_path):
        path.parent.mkdir(parents=True, exist_ok=True)

    dataset = pd.read_csv(dataset_path, dtype=str).fillna("")
    reference = pd.read_csv(split_path, dtype=str).fillna("")
    if set(dataset["row_id"]) != set(reference["row_id"]):
        raise RuntimeError("Prepared dataset and v1.3 split have different rows.")
    split_map = reference.set_index("row_id")["split"]
    dataset["split"] = dataset["row_id"].map(split_map)
    if dataset["split"].isna().any():
        raise RuntimeError("Rows without a preserved v1.3 split.")
    reference_observation = reference.set_index("row_id")["observation_norm"]
    if not dataset.set_index("row_id")["observation_norm"].equals(
        reference_observation.loc[dataset["row_id"]]
    ):
        raise RuntimeError("observation_norm changed relative to v1.3 split.")

    train = dataset[dataset["split"] == "TRAIN"].copy()
    centroids, centroid_index = build_observation_centroids(train)
    frequency = dataset["classification_norm"].value_counts()
    labels = sorted(frequency.index.astype(str))

    def observation_similarity(left: str, right: str) -> float:
        return float(
            centroids[centroid_index[left]] @ centroids[centroid_index[right]]
        )

    primary_rows = []
    for label in labels:
        target, relation, reason = SAFE_MAPPINGS.get(
            label,
            (label, "UNIQUE", "No high-confidence equivalent was approved."),
        )
        similarity = 1.0 if label == target else SequenceMatcher(None, label, target).ratio()
        evidence = (
            "self mapping"
            if label == target
            else f"TRAIN observation centroid cosine={observation_similarity(label, target):.4f}"
        )
        primary_rows.append(
            {
                "original_label": label,
                "suggested_canonical_label": target,
                "relation_type": relation,
                "similarity_score": round(similarity, 6),
                "frequency_original": int(frequency[label]),
                "frequency_target": int(frequency[target]),
                "confidence": "HIGH" if label in SAFE_MAPPINGS else "N/A",
                "requires_human_review": False,
                "reason": f"{reason} {evidence}",
            }
        )

    review_rows = []
    primary_pairs = {
        (row["original_label"], row["suggested_canonical_label"])
        for row in primary_rows
        if row["original_label"] != row["suggested_canonical_label"]
    }
    for left_index, left in enumerate(labels):
        left_tokens = set(content_tokens(left))
        for right in labels[left_index + 1 :]:
            if (left, right) in primary_pairs or (right, left) in primary_pairs:
                continue
            right_tokens = set(content_tokens(right))
            union = left_tokens | right_tokens
            jaccard = len(left_tokens & right_tokens) / len(union) if union else 0.0
            lexical = SequenceMatcher(None, left, right).ratio()
            if lexical < 0.82 and jaccard < 0.6:
                continue
            relation = relation_between(left, right)
            obs_similarity = observation_similarity(left, right)
            likely = (
                relation == "MORPHOLOGICAL_VARIANT"
                or (lexical >= 0.9 and obs_similarity >= 0.15)
            )
            if likely and relation not in {"GENERIC_SPECIFIC"}:
                relation = "LIKELY_EQUIVALENT"
            review_rows.append(
                {
                    "original_label": left,
                    "suggested_canonical_label": right,
                    "relation_type": relation,
                    "similarity_score": round(max(lexical, jaccard), 6),
                    "frequency_original": int(frequency[left]),
                    "frequency_target": int(frequency[right]),
                    "confidence": "MEDIUM" if likely else "LOW",
                    "requires_human_review": True,
                    "reason": (
                        f"Not auto-merged. lexical={lexical:.4f}; "
                        f"token_jaccard={jaccard:.4f}; "
                        f"TRAIN observation centroid cosine={obs_similarity:.4f}."
                    ),
                }
            )

    candidates = pd.DataFrame(primary_rows + review_rows)
    candidates.to_csv(candidates_path, index=False, encoding="utf-8-sig")

    mapping = {
        label: SAFE_MAPPINGS.get(label, (label, "", ""))[0]
        for label in labels
    }
    taxonomy = pd.DataFrame(primary_rows)
    taxonomy["applied_automatically"] = (
        taxonomy["original_label"] != taxonomy["suggested_canonical_label"]
    )
    taxonomy["technical_family"] = taxonomy[
        "suggested_canonical_label"
    ].map(derive_family)
    taxonomy.to_csv(taxonomy_path, index=False, encoding="utf-8-sig")

    canonical = dataset.copy()
    canonical.rename(
        columns={"classification_norm": "classification_original_norm"},
        inplace=True,
    )
    canonical["classification_canonical"] = canonical[
        "classification_original_norm"
    ].map(mapping)
    canonical["technical_family"] = canonical[
        "classification_canonical"
    ].map(derive_family)
    canonical.to_csv(output_path, index=False, encoding="utf-8-sig")

    before = taxonomy_stats(canonical["classification_original_norm"])
    after = taxonomy_stats(canonical["classification_canonical"])
    split_groups = {
        split: set(
            canonical.loc[canonical["split"] == split, "observation_norm"]
        )
        for split in ("TRAIN", "VALIDATION", "TEST")
    }
    leakage = {
        "train_validation": len(split_groups["TRAIN"] & split_groups["VALIDATION"]),
        "train_test": len(split_groups["TRAIN"] & split_groups["TEST"]),
        "validation_test": len(split_groups["VALIDATION"] & split_groups["TEST"]),
    }
    if any(leakage.values()):
        raise RuntimeError(f"Leakage after taxonomy remap: {leakage}")
    missing_train = sorted(
        set(canonical["classification_canonical"])
        - set(
            canonical.loc[
                canonical["split"] == "TRAIN", "classification_canonical"
            ]
        )
    )
    if missing_train:
        raise RuntimeError(f"Canonical classes missing from TRAIN: {missing_train}")

    audit = {
        "taxonomy_version": TAXONOMY_VERSION,
        "source_dataset": str(dataset_path),
        "reference_split": str(split_path),
        "split_preserved_from_v1_3": True,
        "leakage": leakage,
        "rows": int(len(canonical)),
        "unique_observations": int(canonical["observation_norm"].nunique()),
        "automatic_mappings": int(len(SAFE_MAPPINGS)),
        "review_candidates": int(len(review_rows)),
        "before": before,
        "after": after,
        "delta": {
            key: round(float(after[key]) - float(before[key]), 6)
            for key in before
        },
        "families": int(canonical["technical_family"].nunique()),
        "other_unknown_classes": int(
            taxonomy.loc[
                taxonomy["technical_family"] == "OTHER_UNKNOWN",
                "suggested_canonical_label",
            ].nunique()
        ),
        "ambiguous_relations_not_applied": True,
    }
    audit_path.write_text(
        json.dumps(audit, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
