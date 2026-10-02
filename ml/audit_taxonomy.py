from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import joblib

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


# ============================================================
# CONFIGURAÇÃO
# ============================================================

DEFAULT_MODEL_PATH = Path(
    "ml/models/failure_classifier_real_v1_1_eval.joblib"
)

DEFAULT_OUTPUT_DIR = Path(
    "ml/reports/taxonomy_audit_v1"
)

REVIEW_MIN_SIMILARITY = 0.68


CONNECTORS = {
    "A",
    "AS",
    "DA",
    "DAS",
    "DE",
    "DO",
    "DOS",
    "E",
    "EM",
    "NA",
    "NAS",
    "NO",
    "NOS",
}


TOKEN_ALIASES = {
    "PATINAGEM": "PATINAMENTO",
}


# ============================================================
# TIPOS
# ============================================================

@dataclass(frozen=True)
class LabelInfo:
    label: str
    normalized: str
    signature: str


@dataclass(frozen=True)
class Candidate:
    label_a: str
    label_b: str
    similarity: float
    relation: str
    auto_merge: bool
    canonical_suggestion: str


# ============================================================
# NORMALIZAÇÃO
# ============================================================

def normalize_text(
    value: object,
) -> str:
    text = (
        ""
        if value is None
        else str(value)
    )

    text = unicodedata.normalize(
        "NFKD",
        text,
    )

    text = "".join(
        character
        for character in text
        if not unicodedata.combining(
            character,
        )
    )

    text = text.upper()

    text = re.sub(
        r"[^A-Z0-9]+",
        " ",
        text,
    )

    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


def build_signature(
    label: str,
) -> str:
    normalized = normalize_text(
        label,
    )

    tokens: list[str] = []

    for token in normalized.split():
        if token in CONNECTORS:
            continue

        token = TOKEN_ALIASES.get(
            token,
            token,
        )

        tokens.append(
            token,
        )

    return " ".join(
        tokens,
    )


# ============================================================
# ESCOLHA DO RÓTULO CANÔNICO
# ============================================================

def canonical_quality(
    label: str,
) -> tuple[
    int,
    int,
    int,
    str,
]:
    normalized = normalize_text(
        label,
    )

    connector_count = sum(
        1
        for token in normalized.split()
        if token in CONNECTORS
    )

    accented_characters = sum(
        1
        for character in label
        if ord(character) > 127
    )

    return (
        connector_count,
        accented_characters,
        len(label),
        label,
    )


def choose_canonical(
    labels: Iterable[str],
) -> str:
    unique_labels = sorted(
        set(
            labels,
        )
    )

    if not unique_labels:
        return ""

    return max(
        unique_labels,
        key=canonical_quality,
    )


# ============================================================
# MODELO
# ============================================================

def extract_labels(
    artifact: object,
) -> list[str]:
    if not isinstance(
        artifact,
        dict,
    ):
        raise RuntimeError(
            "O artefato do modelo não é um dicionário."
        )

    display_label_map = artifact.get(
        "display_label_map",
    )

    if not isinstance(
        display_label_map,
        dict,
    ):
        raise RuntimeError(
            "O artefato não possui 'display_label_map'."
        )

    labels = sorted(
        {
            str(value).strip()
            for value
            in display_label_map.values()
            if str(value).strip()
        }
    )

    if not labels:
        raise RuntimeError(
            "Nenhum rótulo encontrado em display_label_map."
        )

    return labels


# ============================================================
# INFORMAÇÕES DOS RÓTULOS
# ============================================================

def build_label_infos(
    labels: list[str],
) -> list[LabelInfo]:
    return [
        LabelInfo(
            label=label,
            normalized=normalize_text(
                label,
            ),
            signature=build_signature(
                label,
            ),
        )
        for label in labels
    ]


# ============================================================
# DUPLICATAS SEGURAS
# ============================================================

def find_auto_merge_groups(
    infos: list[LabelInfo],
) -> dict[
    str,
    list[str],
]:
    grouped: dict[
        str,
        list[str],
    ] = defaultdict(
        list,
    )

    for info in infos:
        if not info.signature:
            continue

        grouped[
            info.signature
        ].append(
            info.label,
        )

    return {
        signature: sorted(
            set(
                labels,
            )
        )
        for signature, labels
        in grouped.items()
        if len(
            set(
                labels,
            )
        ) > 1
    }


# ============================================================
# SIMILARIDADE
# ============================================================

def calculate_similarity_matrix(
    infos: list[LabelInfo],
):
    vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(
            3,
            5,
        ),
        lowercase=False,
        min_df=1,
        norm="l2",
    )

    matrix = vectorizer.fit_transform(
        [
            info.normalized
            for info in infos
        ]
    )

    return cosine_similarity(
        matrix,
    )


def find_candidates(
    infos: list[LabelInfo],
) -> list[Candidate]:
    similarity_matrix = (
        calculate_similarity_matrix(
            infos,
        )
    )

    candidates: list[
        Candidate
    ] = []

    for i in range(
        len(
            infos,
        )
    ):
        for j in range(
            i + 1,
            len(
                infos,
            ),
        ):
            first = infos[
                i
            ]

            second = infos[
                j
            ]

            similarity = float(
                similarity_matrix[
                    i,
                    j,
                ]
            )

            same_signature = (
                bool(
                    first.signature,
                )
                and
                first.signature
                ==
                second.signature
            )

            if same_signature:
                candidates.append(
                    Candidate(
                        label_a=first.label,
                        label_b=second.label,
                        similarity=similarity,
                        relation="AUTO_MERGE_SIGNATURE",
                        auto_merge=True,
                        canonical_suggestion=choose_canonical(
                            [
                                first.label,
                                second.label,
                            ]
                        ),
                    )
                )

                continue

            if (
                similarity
                >=
                REVIEW_MIN_SIMILARITY
            ):
                candidates.append(
                    Candidate(
                        label_a=first.label,
                        label_b=second.label,
                        similarity=similarity,
                        relation="REVIEW_SIMILARITY",
                        auto_merge=False,
                        canonical_suggestion="",
                    )
                )

    candidates.sort(
        key=lambda candidate: (
            not candidate.auto_merge,
            -candidate.similarity,
            candidate.label_a,
            candidate.label_b,
        )
    )

    return candidates


# ============================================================
# MAPA CANÔNICO
# ============================================================

def build_canonical_map(
    groups: dict[
        str,
        list[str],
    ],
) -> dict[
    str,
    str,
]:
    canonical_map: dict[
        str,
        str,
    ] = {}

    for labels in groups.values():
        canonical = choose_canonical(
            labels,
        )

        for label in labels:
            if label == canonical:
                continue

            canonical_map[
                label
            ] = canonical

    return dict(
        sorted(
            canonical_map.items(),
        )
    )


# ============================================================
# ARQUIVOS
# ============================================================

def write_csv(
    path: Path,
    header: list[str],
    rows: Iterable[
        Iterable[object]
    ],
) -> None:
    with path.open(
        "w",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        writer = csv.writer(
            file,
        )

        writer.writerow(
            header,
        )

        writer.writerows(
            rows,
        )


def write_json(
    path: Path,
    value: object,
) -> None:
    with path.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            value,
            file,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )

        file.write(
            "\n",
        )


# ============================================================
# ARGUMENTOS
# ============================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Auditoria da taxonomia humana "
            "do modelo de modos de falha."
        )
    )

    parser.add_argument(
        "--model",
        type=Path,
        default=DEFAULT_MODEL_PATH,
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
    )

    return parser.parse_args()


# ============================================================
# MAIN
# ============================================================

def main() -> int:
    try:
        sys.stdout.reconfigure(
            encoding="utf-8",
        )
    except Exception:
        pass

    args = parse_args()

    model_path: Path = args.model
    output_dir: Path = args.output

    if not model_path.exists():
        print(
            "ERRO: modelo não encontrado:",
            model_path,
        )

        return 1

    print()
    print(
        "Carregando modelo..."
    )

    artifact = joblib.load(
        model_path,
    )

    labels = extract_labels(
        artifact,
    )

    infos = build_label_infos(
        labels,
    )

    print(
        "Analisando taxonomia..."
    )

    auto_merge_groups = (
        find_auto_merge_groups(
            infos,
        )
    )

    candidates = (
        find_candidates(
            infos,
        )
    )

    canonical_map = (
        build_canonical_map(
            auto_merge_groups,
        )
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    # ========================================================
    # LABELS
    # ========================================================

    write_csv(
        output_dir
        / "labels.csv",

        [
            "label",
            "normalized",
            "signature",
        ],

        (
            [
                info.label,
                info.normalized,
                info.signature,
            ]
            for info in infos
        ),
    )

    # ========================================================
    # CANDIDATOS
    # ========================================================

    write_csv(
        output_dir
        / "duplicate_candidates.csv",

        [
            "label_a",
            "label_b",
            "similarity",
            "relation",
            "auto_merge",
            "canonical_suggestion",
        ],

        (
            [
                candidate.label_a,
                candidate.label_b,
                f"{candidate.similarity:.6f}",
                candidate.relation,
                (
                    "YES"
                    if candidate.auto_merge
                    else "NO"
                ),
                candidate.canonical_suggestion,
            ]
            for candidate
            in candidates
        ),
    )

    # ========================================================
    # GRUPOS AUTOMÁTICOS
    # ========================================================

    write_csv(
        output_dir
        / "auto_merge_groups.csv",

        [
            "signature",
            "canonical",
            "labels",
        ],

        (
            [
                signature,
                choose_canonical(
                    group_labels,
                ),
                " | ".join(
                    group_labels,
                ),
            ]
            for (
                signature,
                group_labels,
            )
            in sorted(
                auto_merge_groups.items(),
            )
        ),
    )

    # ========================================================
    # MAPA PRELIMINAR
    # ========================================================

    write_json(
        output_dir
        / "canonical_label_map_draft.json",

        canonical_map,
    )

    # ========================================================
    # RESUMO
    # ========================================================

    auto_merge_candidates = [
        candidate
        for candidate
        in candidates
        if candidate.auto_merge
    ]

    review_candidates = [
        candidate
        for candidate
        in candidates
        if not candidate.auto_merge
    ]

    print()
    print(
        "========================================"
    )

    print(
        "AUDITORIA DE TAXONOMIA CONCLUÍDA"
    )

    print(
        "========================================"
    )

    print(
        f"Rótulos analisados: {len(labels)}"
    )

    print(
        "Grupos de auto-merge:",
        len(
            auto_merge_groups,
        ),
    )

    print(
        "Pares auto-merge:",
        len(
            auto_merge_candidates,
        ),
    )

    print(
        "Pares para revisão:",
        len(
            review_candidates,
        ),
    )

    print(
        "Aliases no mapa preliminar:",
        len(
            canonical_map,
        ),
    )

    # ========================================================
    # AUTO MERGE
    # ========================================================

    print()
    print(
        "========================================"
    )

    print(
        "AUTO-MERGES PROPOSTOS"
    )

    print(
        "========================================"
    )

    if not canonical_map:
        print(
            "Nenhum."
        )
    else:
        for (
            source,
            target,
        ) in canonical_map.items():
            print(
                f"{source} -> {target}"
            )

    # ========================================================
    # TOP CANDIDATOS
    # ========================================================

    print()
    print(
        "========================================"
    )

    print(
        "TOP 30 CANDIDATOS PARA REVISÃO"
    )

    print(
        "========================================"
    )

    if not review_candidates:
        print(
            "Nenhum."
        )
    else:
        for candidate in (
            review_candidates[
                :30
            ]
        ):
            print(
                f"{candidate.similarity:.3f}"
                " | "
                f"{candidate.label_a}"
                " <-> "
                f"{candidate.label_b}"
            )

    # ========================================================
    # ARQUIVOS
    # ========================================================

    print()
    print(
        "Arquivos gerados:"
    )

    print(
        output_dir
        / "labels.csv"
    )

    print(
        output_dir
        / "duplicate_candidates.csv"
    )

    print(
        output_dir
        / "auto_merge_groups.csv"
    )

    print(
        output_dir
        / "canonical_label_map_draft.json"
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(
        main()
    )