from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
)
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC

try:
    from ml.canonical_taxonomy import (
        CANONICAL_LABEL_MAP,
        CANONICAL_TAXONOMY_VERSION,
        canonicalize_failure_mode,
        normalize_taxonomy_key,
    )
except ModuleNotFoundError:
    from canonical_taxonomy import (
        CANONICAL_LABEL_MAP,
        CANONICAL_TAXONOMY_VERSION,
        canonicalize_failure_mode,
        normalize_taxonomy_key,
    )


# ============================================================
# VERSÕES
# ============================================================

MODEL_VERSION = (
    "failure_classifier_real_v1_2_eval"
)

DATASET_VERSION = (
    "human-dataset-v1-canonical-taxonomy-v1"
)


# ============================================================
# CAMINHOS
# ============================================================

DEFAULT_DATASET = (
    "ml/data/human/prepared/human_labels_v1.csv"
)

DEFAULT_REFERENCE_SPLIT = (
    "ml/data/human/prepared/human_split_v1_1.csv"
)

DEFAULT_MODEL_OUTPUT = (
    "ml/models/"
    "failure_classifier_real_v1_2_eval.joblib"
)

DEFAULT_METRICS_OUTPUT = (
    "ml/models/"
    "failure_classifier_real_v1_2_metrics.json"
)

DEFAULT_CANONICAL_DATASET_OUTPUT = (
    "ml/data/human/prepared/"
    "human_labels_v1_2_canonical.csv"
)

DEFAULT_SPLIT_OUTPUT = (
    "ml/data/human/prepared/"
    "human_split_v1_2.csv"
)

DEFAULT_TEST_OUTPUT = (
    "ml/data/human/prepared/"
    "human_test_predictions_v1_2.csv"
)

DEFAULT_VALIDATION_OUTPUT = (
    "ml/data/human/prepared/"
    "human_validation_predictions_v1_2.csv"
)


# ============================================================
# CONFIGURAÇÃO DE AVALIAÇÃO
# ============================================================

VALIDATION_RATIO = 0.15
TEST_RATIO = 0.15

RANDOM_SEED = 42

TARGET_PRECISIONS = [
    0.90,
    0.95,
    0.97,
]

MIN_VALIDATION_AUTOMATIONS = 30


# ============================================================
# HELPERS
# ============================================================

def clean_string(
    value: object,
) -> str:
    if value is None:
        return ""

    if (
        isinstance(
            value,
            float,
        )
        and math.isnan(
            value,
        )
    ):
        return ""

    return str(
        value,
    ).strip()


def stable_hash(
    value: str,
) -> int:
    digest = hashlib.sha256(
        f"{RANDOM_SEED}|{value}".encode(
            "utf-8",
        )
    ).hexdigest()

    return int(
        digest[:16],
        16,
    )


def rounded(
    value: float,
    digits: int = 6,
) -> float:
    return round(
        float(
            value,
        ),
        digits,
    )


# ============================================================
# DATASET
# ============================================================

def load_dataset(
    path: Path,
) -> pd.DataFrame:
    df = pd.read_csv(
        path,
        dtype=str,
    )

    required = {
        "row_id",
        "observation",
        "observation_norm",
        "classification",
        "classification_norm",
    }

    missing = (
        required
        -
        set(
            df.columns,
        )
    )

    if missing:
        raise ValueError(
            "O dataset não possui todas as colunas "
            "esperadas. "
            f"Ausentes: {sorted(missing)}"
        )

    for column in [
        "observation",
        "observation_norm",
        "classification",
        "classification_norm",
    ]:
        df[
            column
        ] = (
            df[
                column
            ]
            .fillna(
                "",
            )
            .map(
                clean_string,
            )
        )

    df[
        "row_id"
    ] = pd.to_numeric(
        df[
            "row_id"
        ],
        errors="coerce",
    )

    df = df[
        df[
            "row_id"
        ].notna()
        &
        (
            df[
                "observation_norm"
            ]
            != ""
        )
        &
        (
            df[
                "classification_norm"
            ]
            != ""
        )
    ].copy()

    df[
        "row_id"
    ] = (
        df[
            "row_id"
        ]
        .astype(
            int,
        )
    )

    df.reset_index(
        drop=True,
        inplace=True,
    )

    return df


# ============================================================
# TAXONOMIA CANÔNICA
# ============================================================

def apply_canonical_taxonomy(
    df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Preserva a classificação humana original e cria
    a classificação canônica usada pelo treinamento.

    IMPORTANTE:
    esta etapa acontece ANTES da análise de conflitos.
    """

    result = df.copy()

    # --------------------------------------------------------
    # Preserva o rótulo humano bruto.
    # --------------------------------------------------------

    result[
        "raw_classification"
    ] = result[
        "classification"
    ]

    result[
        "raw_classification_norm"
    ] = result[
        "classification_norm"
    ]

    # --------------------------------------------------------
    # Rótulo canônico para exibição.
    # --------------------------------------------------------

    result[
        "classification"
    ] = (
        result[
            "raw_classification"
        ]
        .map(
            canonicalize_failure_mode,
        )
    )

    # --------------------------------------------------------
    # Rótulo canônico normalizado para ML.
    # --------------------------------------------------------

    result[
        "classification_norm"
    ] = (
        result[
            "classification"
        ]
        .map(
            normalize_taxonomy_key,
        )
    )

    # --------------------------------------------------------
    # Auditoria.
    # --------------------------------------------------------

    result[
        "taxonomy_changed"
    ] = (
        result[
            "raw_classification_norm"
        ]
        .map(
            normalize_taxonomy_key,
        )
        !=
        result[
            "classification_norm"
        ]
    )

    return result


def build_taxonomy_stats(
    raw_dataset: pd.DataFrame,
    canonical_dataset: pd.DataFrame,
    raw_conflict_rows: pd.DataFrame,
    canonical_conflict_rows: pd.DataFrame,
) -> dict[str, Any]:
    changed = canonical_dataset[
        canonical_dataset[
            "taxonomy_changed"
        ]
    ].copy()

    alias_usage: dict[
        str,
        dict[
            str,
            int | str,
        ],
    ] = {}

    if not changed.empty:
        grouped = (
            changed.groupby(
                [
                    "raw_classification",
                    "classification",
                ],
                dropna=False,
            )
            .size()
            .reset_index(
                name="rows",
            )
            .sort_values(
                [
                    "rows",
                    "raw_classification",
                ],
                ascending=[
                    False,
                    True,
                ],
            )
        )

        for row in grouped.itertuples(
            index=False,
        ):
            source = str(
                row.raw_classification
            )

            alias_usage[
                source
            ] = {
                "canonical":
                    str(
                        row.classification
                    ),

                "rows":
                    int(
                        row.rows
                    ),
            }

    raw_classes = int(
        raw_dataset[
            "classification_norm"
        ].nunique()
    )

    canonical_classes = int(
        canonical_dataset[
            "classification_norm"
        ].nunique()
    )

    conflicts_before = int(
        len(
            raw_conflict_rows,
        )
    )

    conflicts_after = int(
        len(
            canonical_conflict_rows,
        )
    )

    return {
        "taxonomy_version":
            CANONICAL_TAXONOMY_VERSION,

        "configured_aliases":
            int(
                len(
                    CANONICAL_LABEL_MAP,
                )
            ),

        "rows_changed":
            int(
                canonical_dataset[
                    "taxonomy_changed"
                ].sum()
            ),

        "raw_unique_classes":
            raw_classes,

        "canonical_unique_classes":
            canonical_classes,

        "classes_reduced":
            (
                raw_classes
                -
                canonical_classes
            ),

        "conflict_rows_before_canonicalization":
            conflicts_before,

        "conflict_rows_after_canonicalization":
            conflicts_after,

        "conflict_rows_recovered":
            max(
                conflicts_before
                -
                conflicts_after,
                0,
            ),

        "alias_usage":
            alias_usage,
    }


# ============================================================
# CONFLITOS
# ============================================================

def remove_conflicting_groups(
    df: pd.DataFrame,
) -> tuple[
    pd.DataFrame,
    pd.DataFrame,
]:
    labels_per_observation = (
        df.groupby(
            "observation_norm",
        )[
            "classification_norm"
        ]
        .nunique()
    )

    conflict_keys = set(
        labels_per_observation[
            labels_per_observation
            > 1
        ].index
    )

    conflicts = df[
        df[
            "observation_norm"
        ].isin(
            conflict_keys,
        )
    ].copy()

    clean = df[
        ~df[
            "observation_norm"
        ].isin(
            conflict_keys,
        )
    ].copy()

    clean.reset_index(
        drop=True,
        inplace=True,
    )

    conflicts.reset_index(
        drop=True,
        inplace=True,
    )

    return (
        clean,
        conflicts,
    )


# ============================================================
# LABELS DE EXIBIÇÃO
# ============================================================

def build_display_label_map(
    df: pd.DataFrame,
) -> dict[
    str,
    str,
]:
    """
    classification já contém o rótulo canônico
    de apresentação.
    """

    result: dict[
        str,
        str,
    ] = {}

    for (
        normalized_label,
        group,
    ) in df.groupby(
        "classification_norm",
    ):
        result[
            str(
                normalized_label,
            )
        ] = str(
            group[
                "classification"
            ]
            .value_counts()
            .index[
                0
            ]
        )

    return result


# ============================================================
# SPLIT DE REFERÊNCIA
#
# Para permitir comparação direta v1.1 x v1.2:
#
# - mantém o mesmo TRAIN / VALIDATION / TEST do v1.1;
# - grupos recuperados pela canonicalização entram em TRAIN;
# - não introduz novos dados em VALIDATION ou TEST.
# ============================================================

def load_reference_split(
    path: Path,
) -> dict[
    str,
    str,
]:
    if not path.exists():
        return {}

    reference = pd.read_csv(
        path,
        dtype=str,
    )

    required = {
        "observation_norm",
        "split",
    }

    missing = (
        required
        -
        set(
            reference.columns,
        )
    )

    if missing:
        raise ValueError(
            "Split de referência inválido. "
            f"Colunas ausentes: {sorted(missing)}"
        )

    reference[
        "observation_norm"
    ] = (
        reference[
            "observation_norm"
        ]
        .fillna(
            "",
        )
        .map(
            clean_string,
        )
    )

    reference[
        "split"
    ] = (
        reference[
            "split"
        ]
        .fillna(
            "",
        )
        .map(
            clean_string,
        )
        .str.upper()
    )

    reference = reference[
        reference[
            "observation_norm"
        ]
        != ""
    ].copy()

    invalid_splits = sorted(
        set(
            reference[
                "split"
            ]
        )
        -
        {
            "TRAIN",
            "VALIDATION",
            "TEST",
        }
    )

    if invalid_splits:
        raise ValueError(
            "Split de referência possui valores "
            "inválidos: "
            f"{invalid_splits}"
        )

    split_counts = (
        reference.groupby(
            "observation_norm",
        )[
            "split"
        ]
        .nunique()
    )

    inconsistent = split_counts[
        split_counts
        > 1
    ]

    if not inconsistent.empty:
        raise RuntimeError(
            "O split de referência possui a mesma "
            "observação em mais de um conjunto."
        )

    grouped = (
        reference.groupby(
            "observation_norm",
            as_index=False,
        )[
            "split"
        ]
        .first()
    )

    return dict(
        zip(
            grouped[
                "observation_norm"
            ],
            grouped[
                "split"
            ],
        )
    )


def apply_reference_split(
    df: pd.DataFrame,
    split_map: dict[
        str,
        str,
    ],
) -> tuple[
    pd.DataFrame,
    dict[
        str,
        int,
    ],
]:
    result = df.copy()

    mapped = (
        result[
            "observation_norm"
        ]
        .map(
            split_map,
        )
    )

    new_group_mask = (
        mapped.isna()
    )

    result[
        "split"
    ] = mapped.fillna(
        "TRAIN",
    )

    new_groups = int(
        result.loc[
            new_group_mask,
            "observation_norm",
        ].nunique()
    )

    new_rows = int(
        new_group_mask.sum()
    )

    return (
        result,
        {
            "reference_groups":
                int(
                    len(
                        split_map,
                    )
                ),

            "new_groups_assigned_to_train":
                new_groups,

            "new_rows_assigned_to_train":
                new_rows,
        },
    )


# ============================================================
# SPLIT GROUPED DE FALLBACK
#
# Usado apenas se human_split_v1_1.csv não existir.
# ============================================================

def build_group_table(
    df: pd.DataFrame,
) -> pd.DataFrame:
    groups = (
        df.groupby(
            "observation_norm",
            as_index=False,
        )
        .agg(
            classification_norm=(
                "classification_norm",
                "first",
            ),

            classification=(
                "classification",
                "first",
            ),

            row_count=(
                "row_id",
                "count",
            ),
        )
    )

    groups[
        "hash"
    ] = (
        groups[
            "observation_norm"
        ]
        .map(
            stable_hash,
        )
    )

    groups[
        "split"
    ] = "TRAIN"

    return groups


def split_counts_for_class(
    group_count: int,
) -> tuple[
    int,
    int,
]:
    if (
        group_count
        <= 2
    ):
        return (
            0,
            0,
        )

    validation_count = max(
        1,
        int(
            round(
                group_count
                *
                VALIDATION_RATIO
            )
        ),
    )

    test_count = max(
        1,
        int(
            round(
                group_count
                *
                TEST_RATIO
            )
        ),
    )

    while (
        validation_count
        +
        test_count
        >=
        group_count
    ):
        if (
            validation_count
            >=
            test_count
            and
            validation_count
            > 1
        ):
            validation_count -= 1

        elif (
            test_count
            > 1
        ):
            test_count -= 1

        else:
            break

    return (
        validation_count,
        test_count,
    )


def create_group_split(
    df: pd.DataFrame,
) -> pd.DataFrame:
    groups = build_group_table(
        df,
    )

    for (
        classification,
        class_groups,
    ) in groups.groupby(
        "classification_norm",
    ):
        ordered = (
            class_groups
            .sort_values(
                [
                    "hash",
                    "observation_norm",
                ],
                ascending=[
                    True,
                    True,
                ],
            )
        )

        count = len(
            ordered,
        )

        if (
            count
            <= 1
        ):
            continue

        if (
            count
            == 2
        ):
            holdout_index = (
                ordered
                .iloc[
                    0:1
                ]
                .index
            )

            holdout_hash = stable_hash(
                f"HOLDOUT|{classification}"
            )

            holdout_split = (
                "VALIDATION"
                if (
                    holdout_hash
                    %
                    2
                    ==
                    0
                )
                else
                "TEST"
            )

            groups.loc[
                holdout_index,
                "split",
            ] = holdout_split

            continue

        (
            validation_count,
            test_count,
        ) = split_counts_for_class(
            count,
        )

        if (
            test_count
            > 0
        ):
            test_indices = (
                ordered
                .iloc[
                    :test_count
                ]
                .index
            )

            groups.loc[
                test_indices,
                "split",
            ] = "TEST"

        if (
            validation_count
            > 0
        ):
            start = test_count

            end = (
                test_count
                +
                validation_count
            )

            validation_indices = (
                ordered
                .iloc[
                    start:end
                ]
                .index
            )

            groups.loc[
                validation_indices,
                "split",
            ] = "VALIDATION"

    return groups


def apply_split(
    df: pd.DataFrame,
    groups: pd.DataFrame,
) -> pd.DataFrame:
    split_map = dict(
        zip(
            groups[
                "observation_norm"
            ],
            groups[
                "split"
            ],
        )
    )

    result = df.copy()

    result[
        "split"
    ] = (
        result[
            "observation_norm"
        ]
        .map(
            split_map,
        )
    )

    if (
        result[
            "split"
        ].isna().any()
    ):
        raise RuntimeError(
            "Existem linhas sem definição de split."
        )

    return result


# ============================================================
# VALIDAÇÃO DE SPLIT
# ============================================================

def check_leakage(
    df: pd.DataFrame,
) -> dict[
    str,
    int,
]:
    train = set(
        df.loc[
            df[
                "split"
            ]
            ==
            "TRAIN",
            "observation_norm",
        ]
    )

    validation = set(
        df.loc[
            df[
                "split"
            ]
            ==
            "VALIDATION",
            "observation_norm",
        ]
    )

    test = set(
        df.loc[
            df[
                "split"
            ]
            ==
            "TEST",
            "observation_norm",
        ]
    )

    return {
        "train_validation":
            len(
                train
                &
                validation
            ),

        "train_test":
            len(
                train
                &
                test
            ),

        "validation_test":
            len(
                validation
                &
                test
            ),
    }


def check_holdout_labels_exist_in_train(
    train: pd.DataFrame,
    validation: pd.DataFrame,
    test: pd.DataFrame,
) -> None:
    train_classes = set(
        train[
            "classification_norm"
        ]
    )

    validation_missing = sorted(
        set(
            validation[
                "classification_norm"
            ]
        )
        -
        train_classes
    )

    test_missing = sorted(
        set(
            test[
                "classification_norm"
            ]
        )
        -
        train_classes
    )

    if (
        validation_missing
        or
        test_missing
    ):
        raise RuntimeError(
            "Existem classes em VALIDATION/TEST "
            "sem exemplos em TRAIN. "
            f"VALIDATION: {validation_missing}; "
            f"TEST: {test_missing}"
        )


# ============================================================
# FEATURES
# ============================================================

def build_vectorizer() -> FeatureUnion:
    word = TfidfVectorizer(
        analyzer="word",

        ngram_range=(
            1,
            2,
        ),

        min_df=1,

        sublinear_tf=True,

        strip_accents="unicode",

        lowercase=True,

        max_features=50000,
    )

    char = TfidfVectorizer(
        analyzer="char_wb",

        ngram_range=(
            3,
            5,
        ),

        min_df=1,

        sublinear_tf=True,

        strip_accents="unicode",

        lowercase=True,

        max_features=75000,
    )

    return FeatureUnion(
        [
            (
                "word",
                word,
            ),

            (
                "char",
                char,
            ),
        ]
    )


# ============================================================
# SCORES
# ============================================================

def decision_scores(
    classifier: LinearSVC,
    features,
) -> np.ndarray:
    scores = np.asarray(
        classifier.decision_function(
            features,
        )
    )

    if (
        scores.ndim
        ==
        1
    ):
        scores = np.column_stack(
            [
                -scores,
                scores,
            ]
        )

    return scores


def prediction_margins(
    scores: np.ndarray,
) -> np.ndarray:
    sorted_scores = np.sort(
        scores,
        axis=1,
    )

    if (
        sorted_scores.shape[
            1
        ]
        <
        2
    ):
        return np.full(
            sorted_scores.shape[
                0
            ],
            np.inf,
        )

    return (
        sorted_scores[
            :,
            -1
        ]
        -
        sorted_scores[
            :,
            -2
        ]
    )


def top_k_predictions(
    scores: np.ndarray,
    classes: np.ndarray,
    k: int = 3,
) -> list[
    list[str]
]:
    k = min(
        k,
        len(
            classes,
        ),
    )

    indices = np.argsort(
        scores,
        axis=1,
    )[
        :,
        -k:
    ][
        :,
        ::-1
    ]

    return [
        [
            str(
                classes[
                    index
                ]
            )

            for index
            in row
        ]

        for row
        in indices
    ]


# ============================================================
# MÉTRICAS
# ============================================================

def calculate_metrics(
    true_labels: np.ndarray,
    predictions: np.ndarray,
    top3: list[
        list[str]
    ],
) -> dict[
    str,
    float,
]:
    return {
        "accuracy":
            rounded(
                accuracy_score(
                    true_labels,
                    predictions,
                )
            ),

        "macro_f1":
            rounded(
                f1_score(
                    true_labels,
                    predictions,
                    average="macro",
                    zero_division=0,
                )
            ),

        "weighted_f1":
            rounded(
                f1_score(
                    true_labels,
                    predictions,
                    average="weighted",
                    zero_division=0,
                )
            ),

        "top3_accuracy":
            rounded(
                np.mean(
                    [
                        true_label
                        in
                        candidates

                        for (
                            true_label,
                            candidates,
                        )
                        in zip(
                            true_labels,
                            top3,
                        )
                    ]
                )
            ),
    }


# ============================================================
# MÉTRICAS POR OBSERVAÇÃO ÚNICA
# ============================================================

def calculate_group_metrics(
    df: pd.DataFrame,
    predictions: np.ndarray,
) -> dict[
    str,
    float | int,
]:
    frame = df[
        [
            "observation_norm",
            "classification_norm",
        ]
    ].copy()

    frame[
        "prediction"
    ] = predictions

    grouped = (
        frame.groupby(
            "observation_norm",
            as_index=False,
        )
        .agg(
            classification_norm=(
                "classification_norm",
                "first",
            ),

            prediction=(
                "prediction",
                "first",
            ),
        )
    )

    return {
        "groups":
            int(
                len(
                    grouped,
                )
            ),

        "accuracy":
            rounded(
                accuracy_score(
                    grouped[
                        "classification_norm"
                    ],
                    grouped[
                        "prediction"
                    ],
                )
            ),

        "macro_f1":
            rounded(
                f1_score(
                    grouped[
                        "classification_norm"
                    ],
                    grouped[
                        "prediction"
                    ],
                    average="macro",
                    zero_division=0,
                )
            ),

        "weighted_f1":
            rounded(
                f1_score(
                    grouped[
                        "classification_norm"
                    ],
                    grouped[
                        "prediction"
                    ],
                    average="weighted",
                    zero_division=0,
                )
            ),
    }


# ============================================================
# CURVA DE CONFIANÇA
#
# margem = top1 - top2
#
# IMPORTANTE:
# margem NÃO é probabilidade.
# ============================================================

def build_confidence_curve(
    true_labels: np.ndarray,
    predictions: np.ndarray,
    margins: np.ndarray,
) -> list[
    dict[
        str,
        float | int,
    ]
]:
    rows: list[
        dict[
            str,
            float | int,
        ]
    ] = []

    total = len(
        true_labels,
    )

    thresholds = np.sort(
        np.unique(
            margins,
        )
    )[
        ::-1
    ]

    for threshold in thresholds:
        mask = (
            margins
            >=
            threshold
        )

        selected = int(
            mask.sum()
        )

        if (
            selected
            <
            MIN_VALIDATION_AUTOMATIONS
        ):
            continue

        precision = float(
            accuracy_score(
                true_labels[
                    mask
                ],
                predictions[
                    mask
                ],
            )
        )

        rows.append(
            {
                "threshold":
                    rounded(
                        float(
                            threshold,
                        ),
                        8,
                    ),

                "selected":
                    selected,

                "total":
                    total,

                "coverage":
                    rounded(
                        selected
                        /
                        total
                    ),

                "precision":
                    rounded(
                        precision,
                    ),
            }
        )

    return rows


# ============================================================
# ESCOLHA DO THRESHOLD
#
# O threshold é escolhido SOMENTE na VALIDATION.
# ============================================================

def select_thresholds(
    confidence_curve: list[
        dict[
            str,
            float | int,
        ]
    ],
) -> dict[
    str,
    dict[
        str,
        float | int,
    ]
    | None,
]:
    selected: dict[
        str,
        dict[
            str,
            float | int,
        ]
        | None,
    ] = {}

    for target in TARGET_PRECISIONS:
        candidates = [
            row

            for row
            in confidence_curve

            if (
                float(
                    row[
                        "precision"
                    ]
                )
                >=
                target
            )
        ]

        key = str(
            int(
                target
                *
                100
            )
        )

        if (
            not candidates
        ):
            selected[
                key
            ] = None

            continue

        selected[
            key
        ] = dict(
            max(
                candidates,

                key=lambda row: (
                    int(
                        row[
                            "selected"
                        ]
                    ),

                    float(
                        row[
                            "precision"
                        ]
                    ),
                ),
            )
        )

    return selected


# ============================================================
# TESTE DO THRESHOLD
# ============================================================

def evaluate_threshold_on_test(
    true_labels: np.ndarray,
    predictions: np.ndarray,
    margins: np.ndarray,
    threshold: float,
) -> dict[
    str,
    float | int | None,
]:
    mask = (
        margins
        >=
        threshold
    )

    automated = int(
        mask.sum()
    )

    total = len(
        true_labels,
    )

    review = (
        total
        -
        automated
    )

    precision = (
        float(
            accuracy_score(
                true_labels[
                    mask
                ],
                predictions[
                    mask
                ],
            )
        )

        if (
            automated
            >
            0
        )

        else None
    )

    return {
        "threshold":
            rounded(
                threshold,
                8,
            ),

        "automated":
            automated,

        "review":
            review,

        "total":
            total,

        "coverage":
            rounded(
                automated
                /
                total

                if (
                    total
                    >
                    0
                )

                else
                0.0
            ),

        "precision":
            (
                rounded(
                    precision,
                )

                if (
                    precision
                    is not None
                )

                else
                None
            ),
    }


# ============================================================
# CSV DE PREVISÕES
# ============================================================

def build_prediction_dataframe(
    df: pd.DataFrame,
    predictions: np.ndarray,
    margins: np.ndarray,
    top3: list[
        list[str]
    ],
    display_label_map: dict[
        str,
        str,
    ],
) -> pd.DataFrame:
    result = df[
        [
            "row_id",
            "observation",
            "observation_norm",
            "raw_classification",
            "raw_classification_norm",
            "classification",
            "classification_norm",
            "taxonomy_changed",
            "split",
        ]
    ].copy()

    result[
        "prediction_norm"
    ] = predictions

    result[
        "prediction"
    ] = [
        display_label_map.get(
            str(
                prediction,
            ),
            str(
                prediction,
            ),
        )

        for prediction
        in predictions
    ]

    result[
        "correct"
    ] = (
        result[
            "classification_norm"
        ]
        .to_numpy(
            dtype=str,
        )
        ==
        predictions
    )

    result[
        "margin"
    ] = margins

    result[
        "top3_norm"
    ] = [
        " | ".join(
            candidates,
        )

        for candidates
        in top3
    ]

    result[
        "top3"
    ] = [
        " | ".join(
            display_label_map.get(
                candidate,
                candidate,
            )

            for candidate
            in candidates
        )

        for candidates
        in top3
    ]

    return result


# ============================================================
# MAIN
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Treina o modelo real v1.2 com taxonomia "
            "canônica, TRAIN / VALIDATION / TEST e "
            "thresholds selecionados somente em VALIDATION."
        )
    )

    parser.add_argument(
        "--dataset",
        default=DEFAULT_DATASET,
    )

    parser.add_argument(
        "--reference-split",
        default=DEFAULT_REFERENCE_SPLIT,
    )

    parser.add_argument(
        "--model-output",
        default=DEFAULT_MODEL_OUTPUT,
    )

    parser.add_argument(
        "--metrics-output",
        default=DEFAULT_METRICS_OUTPUT,
    )

    parser.add_argument(
        "--canonical-dataset-output",
        default=DEFAULT_CANONICAL_DATASET_OUTPUT,
    )

    parser.add_argument(
        "--split-output",
        default=DEFAULT_SPLIT_OUTPUT,
    )

    parser.add_argument(
        "--predictions-output",
        default=DEFAULT_TEST_OUTPUT,
    )

    parser.add_argument(
        "--validation-output",
        default=DEFAULT_VALIDATION_OUTPUT,
    )

    args = parser.parse_args()

    dataset_path = Path(
        args.dataset,
    ).resolve()

    reference_split_path = Path(
        args.reference_split,
    ).resolve()

    model_path = Path(
        args.model_output,
    ).resolve()

    metrics_path = Path(
        args.metrics_output,
    ).resolve()

    canonical_dataset_path = Path(
        args.canonical_dataset_output,
    ).resolve()

    split_path = Path(
        args.split_output,
    ).resolve()

    test_output_path = Path(
        args.predictions_output,
    ).resolve()

    validation_output_path = Path(
        args.validation_output,
    ).resolve()

    if (
        not dataset_path.exists()
    ):
        raise FileNotFoundError(
            f"Dataset não encontrado: {dataset_path}"
        )

    for path in [
        model_path,
        metrics_path,
        canonical_dataset_path,
        split_path,
        test_output_path,
        validation_output_path,
    ]:
        path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

    print(
        "="
        *
        72
    )

    print(
        "EASY MAINTENANCE - FAILURE CLASSIFIER REAL V1.2"
    )

    print(
        "="
        *
        72
    )

    print(
        f"Dataset:            {dataset_path}"
    )

    print(
        f"Taxonomia:          {CANONICAL_TAXONOMY_VERSION}"
    )

    print(
        "Split referência:   "
        f"{reference_split_path}"
    )

    print()

    # ========================================================
    # DATASET BRUTO
    # ========================================================

    raw_dataset = load_dataset(
        dataset_path,
    )

    (
        _raw_usable_preview,
        raw_conflict_rows,
    ) = remove_conflicting_groups(
        raw_dataset,
    )

    # ========================================================
    # CANONICALIZAÇÃO
    # ========================================================

    canonical_dataset = (
        apply_canonical_taxonomy(
            raw_dataset,
        )
    )

    (
        usable_dataset,
        conflict_rows,
    ) = remove_conflicting_groups(
        canonical_dataset,
    )

    taxonomy_stats = (
        build_taxonomy_stats(
            raw_dataset,
            canonical_dataset,
            raw_conflict_rows,
            conflict_rows,
        )
    )

    canonical_dataset.to_csv(
        canonical_dataset_path,
        index=False,
        encoding="utf-8-sig",
    )

    display_label_map = (
        build_display_label_map(
            usable_dataset,
        )
    )

    # ========================================================
    # SPLIT
    # ========================================================

    reference_split_map = (
        load_reference_split(
            reference_split_path,
        )
    )

    if reference_split_map:
        (
            dataset,
            reference_split_stats,
        ) = apply_reference_split(
            usable_dataset,
            reference_split_map,
        )

        split_strategy = (
            "reuse_v1_1_grouped_split_by_observation_"
            "plus_recovered_groups_in_train"
        )

    else:
        groups = create_group_split(
            usable_dataset,
        )

        dataset = apply_split(
            usable_dataset,
            groups,
        )

        reference_split_stats = {
            "reference_groups":
                0,

            "new_groups_assigned_to_train":
                0,

            "new_rows_assigned_to_train":
                0,
        }

        split_strategy = (
            "grouped_by_normalized_observation_"
            "train_validation_test"
        )

    leakage = check_leakage(
        dataset,
    )

    if any(
        value
        >
        0

        for value
        in leakage.values()
    ):
        raise RuntimeError(
            f"Foi detectado vazamento: {leakage}"
        )

    train = dataset[
        dataset[
            "split"
        ]
        ==
        "TRAIN"
    ].copy()

    validation = dataset[
        dataset[
            "split"
        ]
        ==
        "VALIDATION"
    ].copy()

    test = dataset[
        dataset[
            "split"
        ]
        ==
        "TEST"
    ].copy()

    if (
        train.empty
        or
        validation.empty
        or
        test.empty
    ):
        raise RuntimeError(
            "TRAIN, VALIDATION ou TEST ficou vazio."
        )

    check_holdout_labels_exist_in_train(
        train,
        validation,
        test,
    )

    split_columns = [
        "row_id",
        "observation",
        "observation_norm",
        "raw_classification",
        "raw_classification_norm",
        "classification",
        "classification_norm",
        "taxonomy_changed",
        "split",
    ]

    dataset[
        split_columns
    ].to_csv(
        split_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # TEXTOS / LABELS
    # ========================================================

    train_texts = (
        train[
            "observation"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    validation_texts = (
        validation[
            "observation"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    test_texts = (
        test[
            "observation"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    train_labels = (
        train[
            "classification_norm"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    validation_labels = (
        validation[
            "classification_norm"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    test_labels = (
        test[
            "classification_norm"
        ]
        .to_numpy(
            dtype=str,
        )
    )

    # ========================================================
    # VETORIZAÇÃO
    # ========================================================

    print(
        "Gerando TF-IDF..."
    )

    vectorizer = build_vectorizer()

    train_features = (
        vectorizer.fit_transform(
            train_texts,
        )
    )

    validation_features = (
        vectorizer.transform(
            validation_texts,
        )
    )

    test_features = (
        vectorizer.transform(
            test_texts,
        )
    )

    print(
        f"Features: {train_features.shape[1]}"
    )

    # ========================================================
    # TREINO
    # ========================================================

    print()

    print(
        "Treinando LinearSVC..."
    )

    classifier = LinearSVC(
        C=1.5,
        class_weight="balanced",
        max_iter=10000,
        random_state=RANDOM_SEED,
    )

    classifier.fit(
        train_features,
        train_labels,
    )

    # ========================================================
    # VALIDATION
    # ========================================================

    validation_predictions = (
        classifier.predict(
            validation_features,
        )
    )

    validation_scores = (
        decision_scores(
            classifier,
            validation_features,
        )
    )

    validation_margins = (
        prediction_margins(
            validation_scores,
        )
    )

    validation_top3 = (
        top_k_predictions(
            validation_scores,
            classifier.classes_,
            3,
        )
    )

    validation_metrics = (
        calculate_metrics(
            validation_labels,
            validation_predictions,
            validation_top3,
        )
    )

    validation_group_metrics = (
        calculate_group_metrics(
            validation,
            validation_predictions,
        )
    )

    confidence_curve = (
        build_confidence_curve(
            validation_labels,
            validation_predictions,
            validation_margins,
        )
    )

    selected_thresholds = (
        select_thresholds(
            confidence_curve,
        )
    )

    # ========================================================
    # TEST
    # ========================================================

    test_predictions = (
        classifier.predict(
            test_features,
        )
    )

    test_scores = (
        decision_scores(
            classifier,
            test_features,
        )
    )

    test_margins = (
        prediction_margins(
            test_scores,
        )
    )

    test_top3 = (
        top_k_predictions(
            test_scores,
            classifier.classes_,
            3,
        )
    )

    test_metrics = (
        calculate_metrics(
            test_labels,
            test_predictions,
            test_top3,
        )
    )

    test_group_metrics = (
        calculate_group_metrics(
            test,
            test_predictions,
        )
    )

    automation_test: dict[
        str,
        dict[
            str,
            float | int | None,
        ]
        | None,
    ] = {}

    for (
        key,
        threshold_info,
    ) in selected_thresholds.items():
        if (
            threshold_info
            is None
        ):
            automation_test[
                key
            ] = None

            continue

        automation_test[
            key
        ] = (
            evaluate_threshold_on_test(
                test_labels,
                test_predictions,
                test_margins,
                float(
                    threshold_info[
                        "threshold"
                    ]
                ),
            )
        )

    # ========================================================
    # CSV VALIDATION
    # ========================================================

    validation_df = (
        build_prediction_dataframe(
            validation,
            validation_predictions,
            validation_margins,
            validation_top3,
            display_label_map,
        )
    )

    validation_df.to_csv(
        validation_output_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # CSV TEST
    # ========================================================

    test_df = (
        build_prediction_dataframe(
            test,
            test_predictions,
            test_margins,
            test_top3,
            display_label_map,
        )
    )

    for (
        key,
        threshold_info,
    ) in selected_thresholds.items():
        column = (
            f"auto_at_{key}"
        )

        if (
            threshold_info
            is None
        ):
            test_df[
                column
            ] = False

            continue

        threshold = float(
            threshold_info[
                "threshold"
            ]
        )

        test_df[
            column
        ] = (
            test_margins
            >=
            threshold
        )

    test_df.to_csv(
        test_output_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # ARTEFATO
    # ========================================================

    artifact = {
        "model_version":
            MODEL_VERSION,

        "dataset_version":
            DATASET_VERSION,

        "canonical_taxonomy_version":
            CANONICAL_TAXONOMY_VERSION,

        "canonical_label_map":
            dict(
                CANONICAL_LABEL_MAP,
            ),

        "purpose":
            "evaluation",

        "text_fields": [
            "observation",
        ],

        "vectorizer":
            vectorizer,

        "classifier":
            classifier,

        "classes":
            classifier.classes_,

        "display_label_map":
            display_label_map,

        "confidence_type":
            (
                "linear_svc_"
                "top1_minus_top2_margin"
            ),

        "automation_thresholds":
            selected_thresholds,

        "split_strategy":
            split_strategy,

        "random_seed":
            RANDOM_SEED,

        "taxonomy_stats":
            taxonomy_stats,
    }

    joblib.dump(
        artifact,
        model_path,
    )

    # ========================================================
    # MÉTRICAS JSON
    # ========================================================

    metrics = {
        "model_version":
            MODEL_VERSION,

        "dataset_version":
            DATASET_VERSION,

        "canonical_taxonomy_version":
            CANONICAL_TAXONOMY_VERSION,

        "algorithm":
            "TFIDF_WORD_CHAR_LINEAR_SVC",

        "taxonomy":
            taxonomy_stats,

        "confidence": {
            "type":
                (
                    "top1_minus_top2_"
                    "decision_margin"
                ),

            "note":
                (
                    "Margem de decisão; "
                    "não é probabilidade calibrada."
                ),

            "minimum_validation_automations":
                MIN_VALIDATION_AUTOMATIONS,
        },

        "split": {
            "strategy":
                split_strategy,

            "reference_split":
                (
                    str(
                        reference_split_path
                    )
                    if reference_split_map
                    else None
                ),

            **reference_split_stats,

            "raw_rows":
                int(
                    len(
                        raw_dataset,
                    )
                ),

            "canonical_rows":
                int(
                    len(
                        canonical_dataset,
                    )
                ),

            "conflict_rows_excluded":
                int(
                    len(
                        conflict_rows,
                    )
                ),

            "usable_rows":
                int(
                    len(
                        dataset,
                    )
                ),

            "train_rows":
                int(
                    len(
                        train,
                    )
                ),

            "validation_rows":
                int(
                    len(
                        validation,
                    )
                ),

            "test_rows":
                int(
                    len(
                        test,
                    )
                ),

            "train_groups":
                int(
                    train[
                        "observation_norm"
                    ].nunique()
                ),

            "validation_groups":
                int(
                    validation[
                        "observation_norm"
                    ].nunique()
                ),

            "test_groups":
                int(
                    test[
                        "observation_norm"
                    ].nunique()
                ),

            "train_classes":
                int(
                    train[
                        "classification_norm"
                    ].nunique()
                ),

            "validation_classes":
                int(
                    validation[
                        "classification_norm"
                    ].nunique()
                ),

            "test_classes":
                int(
                    test[
                        "classification_norm"
                    ].nunique()
                ),

            "features":
                int(
                    train_features.shape[
                        1
                    ]
                ),

            "leakage":
                leakage,
        },

        "validation": {
            "row_level":
                validation_metrics,

            "observation_group_level":
                validation_group_metrics,
        },

        "threshold_selection_on_validation":
            selected_thresholds,

        "test": {
            "row_level":
                test_metrics,

            "observation_group_level":
                test_group_metrics,

            "automation":
                automation_test,
        },

        "classification_report_test":
            classification_report(
                test_labels,
                test_predictions,
                output_dict=True,
                zero_division=0,
            ),
    }

    with metrics_path.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            metrics,
            file,
            ensure_ascii=False,
            indent=2,
        )

    # ========================================================
    # TERMINAL
    # ========================================================

    print()

    print(
        "="
        *
        72
    )

    print(
        "RESULTADOS V1.2"
    )

    print(
        "="
        *
        72
    )

    print()

    print(
        "Taxonomia:"
    )

    print(
        "  Versão:                   "
        f"{CANONICAL_TAXONOMY_VERSION}"
    )

    print(
        "  Classes humanas brutas:   "
        f"{taxonomy_stats['raw_unique_classes']}"
    )

    print(
        "  Classes canônicas:        "
        f"{taxonomy_stats['canonical_unique_classes']}"
    )

    print(
        "  Classes consolidadas:     "
        f"{taxonomy_stats['classes_reduced']}"
    )

    print(
        "  Linhas canonicalizadas:   "
        f"{taxonomy_stats['rows_changed']}"
    )

    print(
        "  Conflitos antes:          "
        f"{taxonomy_stats['conflict_rows_before_canonicalization']}"
    )

    print(
        "  Conflitos depois:         "
        f"{taxonomy_stats['conflict_rows_after_canonicalization']}"
    )

    print(
        "  Linhas recuperadas:       "
        f"{taxonomy_stats['conflict_rows_recovered']}"
    )

    print()

    print(
        "Dataset:"
    )

    print(
        f"  Linhas originais:         {len(raw_dataset)}"
    )

    print(
        f"  Linhas utilizáveis:       {len(dataset)}"
    )

    print(
        f"  TRAIN:                    {len(train)}"
    )

    print(
        f"  VALIDATION:               {len(validation)}"
    )

    print(
        f"  TEST:                     {len(test)}"
    )

    print(
        "  Grupos TRAIN:             "
        f"{train['observation_norm'].nunique()}"
    )

    print(
        "  Grupos VALIDATION:        "
        f"{validation['observation_norm'].nunique()}"
    )

    print(
        "  Grupos TEST:              "
        f"{test['observation_norm'].nunique()}"
    )

    print(
        "  Vazamento:                "
        f"{sum(leakage.values())}"
    )

    print(
        "  Split:                    "
        f"{split_strategy}"
    )

    if reference_split_map:
        print(
            "  Novos grupos -> TRAIN:    "
            f"{reference_split_stats['new_groups_assigned_to_train']}"
        )

    print()

    print(
        "VALIDATION:"
    )

    print(
        "  Accuracy:                 "
        f"{validation_metrics['accuracy']:.4f}"
    )

    print(
        "  Macro F1:                 "
        f"{validation_metrics['macro_f1']:.4f}"
    )

    print(
        "  Weighted F1:              "
        f"{validation_metrics['weighted_f1']:.4f}"
    )

    print(
        "  Top-3 accuracy:           "
        f"{validation_metrics['top3_accuracy']:.4f}"
    )

    print()

    print(
        "TEST FINAL:"
    )

    print(
        "  Accuracy:                 "
        f"{test_metrics['accuracy']:.4f}"
    )

    print(
        "  Macro F1:                 "
        f"{test_metrics['macro_f1']:.4f}"
    )

    print(
        "  Weighted F1:              "
        f"{test_metrics['weighted_f1']:.4f}"
    )

    print(
        "  Top-3 accuracy:           "
        f"{test_metrics['top3_accuracy']:.4f}"
    )

    print()

    print(
        "AUTOMAÇÃO - threshold escolhido "
        "SOMENTE na VALIDATION:"
    )

    for target in TARGET_PRECISIONS:
        key = str(
            int(
                target
                *
                100
            )
        )

        validation_result = (
            selected_thresholds[
                key
            ]
        )

        test_result = (
            automation_test[
                key
            ]
        )

        print()

        print(
            f"  Meta {key}%:"
        )

        if (
            validation_result
            is None
            or
            test_result
            is None
        ):
            print(
                "    Não foi possível atingir a meta "
                f"com pelo menos {MIN_VALIDATION_AUTOMATIONS} "
                "casos na validação."
            )

            continue

        test_precision = (
            test_result[
                "precision"
            ]
        )

        print(
            "    Threshold:              "
            f"{float(validation_result['threshold']):.6f}"
        )

        print(
            "    Validation precisão:    "
            f"{float(validation_result['precision']) * 100:.2f}%"
        )

        print(
            "    Validation cobertura:   "
            f"{float(validation_result['coverage']) * 100:.2f}%"
        )

        print(
            "    Test precisão:          "
            f"{(
                float(test_precision) * 100
                if test_precision is not None
                else 0.0
            ):.2f}%"
        )

        print(
            "    Test cobertura:         "
            f"{float(test_result['coverage']) * 100:.2f}%"
        )

        print(
            "    Automatizados:          "
            f"{int(test_result['automated'])}"
        )

        print(
            "    Revisão humana:         "
            f"{int(test_result['review'])}"
        )

    print()

    print(
        "Artefato de avaliação:"
    )

    print(
        f"  {model_path}"
    )

    print()

    print(
        "Dataset canonicalizado:"
    )

    print(
        f"  {canonical_dataset_path}"
    )

    print()

    print(
        "Métricas:"
    )

    print(
        f"  {metrics_path}"
    )

    print()

    print(
        "IMPORTANTE:"
    )

    print(
        "Este v1.2 continua sendo um artefato "
        "de avaliação. Não altere o FastAPI ainda."
    )


if __name__ == "__main__":
    main()