from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC


MODEL_VERSION = "failure_classifier_real_v1_1_eval"
DATASET_VERSION = "human-dataset-v1"

DEFAULT_DATASET = "ml/data/human/prepared/human_labels_v1.csv"
DEFAULT_MODEL_OUTPUT = "ml/models/failure_classifier_real_v1_1_eval.joblib"
DEFAULT_METRICS_OUTPUT = "ml/models/failure_classifier_real_v1_1_metrics.json"
DEFAULT_SPLIT_OUTPUT = "ml/data/human/prepared/human_split_v1_1.csv"
DEFAULT_TEST_OUTPUT = "ml/data/human/prepared/human_test_predictions_v1_1.csv"
DEFAULT_VALIDATION_OUTPUT = (
    "ml/data/human/prepared/human_validation_predictions_v1_1.csv"
)

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

    if isinstance(
        value,
        float,
    ) and math.isnan(
        value,
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
            "O dataset não possui todas as colunas esperadas. "
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
    ] = df[
        "row_id"
    ].astype(
        int,
    )

    df.reset_index(
        drop=True,
        inplace=True,
    )

    return df


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
# SPLIT TRAIN / VALIDATION / TEST
#
# Uma mesma observation_norm nunca pode existir
# em mais de um conjunto.
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
    ] = groups[
        "observation_norm"
    ].map(
        stable_hash,
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
    """
    Retorna:
        validation_count,
        test_count

    Classes com 1 observação:
        somente TRAIN.

    Classes com 2 observações:
        tratadas separadamente.
    """

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
        ordered = class_groups.sort_values(
            [
                "hash",
                "observation_norm",
            ],
            ascending=[
                True,
                True,
            ],
        )

        count = len(
            ordered,
        )

        # ----------------------------------------------------
        # Apenas um grupo
        # ----------------------------------------------------

        if (
            count
            <= 1
        ):
            continue

        # ----------------------------------------------------
        # Exatamente dois grupos
        #
        # Um fica no TRAIN.
        #
        # O outro é distribuído deterministicamente entre
        # VALIDATION e TEST.
        #
        # Isso evita jogar todas as classes raras no TEST.
        # ----------------------------------------------------

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

        # ----------------------------------------------------
        # Classes com >= 3 grupos
        # ----------------------------------------------------

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
            start = (
                test_count
            )

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
    ] = result[
        "observation_norm"
    ].map(
        split_map,
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


# ============================================================
# FEATURES
#
# WORD TF-IDF
# +
# CHAR TF-IDF
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
        classifier
        .decision_function(
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
#
# Uma frase repetida conta apenas uma vez.
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
# margem =
#
# score_top1 - score_top2
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
# ESCOLHA DE THRESHOLD
#
# Escolhido SOMENTE na VALIDATION.
#
# Para cada meta:
#
# 90%
# 95%
# 97%
#
# buscamos a maior cobertura que ainda satisfaz
# a precisão desejada.
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
            "classification",
            "classification_norm",
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
            "Treina o modelo real v1.1 com "
            "TRAIN / VALIDATION / TEST e seleciona "
            "thresholds usando somente VALIDATION."
        )
    )

    parser.add_argument(
        "--dataset",
        default=DEFAULT_DATASET,
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

    model_path = Path(
        args.model_output,
    ).resolve()

    metrics_path = Path(
        args.metrics_output,
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
        "EASY MAINTENANCE - FAILURE CLASSIFIER REAL V1.1"
    )

    print(
        "="
        *
        72
    )

    print(
        f"Dataset: {dataset_path}"
    )

    print()

    # ========================================================
    # DATASET
    # ========================================================

    raw_dataset = load_dataset(
        dataset_path,
    )

    (
        usable_dataset,
        conflict_rows,
    ) = remove_conflicting_groups(
        raw_dataset,
    )

    display_label_map = build_display_label_map(
        usable_dataset,
    )

    # ========================================================
    # SPLIT
    # ========================================================

    groups = create_group_split(
        usable_dataset,
    )

    dataset = apply_split(
        usable_dataset,
        groups,
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

    dataset[
        [
            "row_id",
            "observation",
            "observation_norm",
            "classification",
            "classification_norm",
            "split",
        ]
    ].to_csv(
        split_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # TEXTOS
    # ========================================================

    train_texts = train[
        "observation"
    ].to_numpy(
        dtype=str,
    )

    validation_texts = validation[
        "observation"
    ].to_numpy(
        dtype=str,
    )

    test_texts = test[
        "observation"
    ].to_numpy(
        dtype=str,
    )

    train_labels = train[
        "classification_norm"
    ].to_numpy(
        dtype=str,
    )

    validation_labels = validation[
        "classification_norm"
    ].to_numpy(
        dtype=str,
    )

    test_labels = test[
        "classification_norm"
    ].to_numpy(
        dtype=str,
    )

    # ========================================================
    # VETORIZAÇÃO
    # ========================================================

    print(
        "Gerando TF-IDF..."
    )

    vectorizer = build_vectorizer()

    train_features = vectorizer.fit_transform(
        train_texts,
    )

    validation_features = vectorizer.transform(
        validation_texts,
    )

    test_features = vectorizer.transform(
        test_texts,
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

    validation_predictions = classifier.predict(
        validation_features,
    )

    validation_scores = decision_scores(
        classifier,
        validation_features,
    )

    validation_margins = prediction_margins(
        validation_scores,
    )

    validation_top3 = top_k_predictions(
        validation_scores,
        classifier.classes_,
        3,
    )

    validation_metrics = calculate_metrics(
        validation_labels,
        validation_predictions,
        validation_top3,
    )

    validation_group_metrics = calculate_group_metrics(
        validation,
        validation_predictions,
    )

    confidence_curve = build_confidence_curve(
        validation_labels,
        validation_predictions,
        validation_margins,
    )

    selected_thresholds = select_thresholds(
        confidence_curve,
    )

    # ========================================================
    # TEST
    # ========================================================

    test_predictions = classifier.predict(
        test_features,
    )

    test_scores = decision_scores(
        classifier,
        test_features,
    )

    test_margins = prediction_margins(
        test_scores,
    )

    test_top3 = top_k_predictions(
        test_scores,
        classifier.classes_,
        3,
    )

    test_metrics = calculate_metrics(
        test_labels,
        test_predictions,
        test_top3,
    )

    test_group_metrics = calculate_group_metrics(
        test,
        test_predictions,
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
        ] = evaluate_threshold_on_test(
            test_labels,
            test_predictions,
            test_margins,
            float(
                threshold_info[
                    "threshold"
                ]
            ),
        )

    # ========================================================
    # CSV VALIDATION
    # ========================================================

    validation_df = build_prediction_dataframe(
        validation,
        validation_predictions,
        validation_margins,
        validation_top3,
        display_label_map,
    )

    validation_df.to_csv(
        validation_output_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # CSV TEST
    # ========================================================

    test_df = build_prediction_dataframe(
        test,
        test_predictions,
        test_margins,
        test_top3,
        display_label_map,
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
    #
    # ESTE MODELO É DE AVALIAÇÃO.
    #
    # Ainda não substitui o modelo utilizado pela aplicação.
    # ========================================================

    artifact = {
        "model_version":
            MODEL_VERSION,

        "dataset_version":
            DATASET_VERSION,

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
            (
                "grouped_by_normalized_observation_"
                "train_validation_test"
            ),

        "random_seed":
            RANDOM_SEED,
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

        "algorithm":
            "TFIDF_WORD_CHAR_LINEAR_SVC",

        "confidence": {
            "type":
                "top1_minus_top2_decision_margin",

            "note":
                (
                    "Margem de decisão; "
                    "não é probabilidade calibrada."
                ),

            "minimum_validation_automations":
                MIN_VALIDATION_AUTOMATIONS,
        },

        "split": {
            "raw_rows":
                int(
                    len(
                        raw_dataset,
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
        "RESULTADOS V1.1"
    )

    print(
        "="
        *
        72
    )

    print()

    print(
        "Dataset:"
    )

    print(
        f"  Linhas originais:        {len(raw_dataset)}"
    )

    print(
        f"  Linhas conflitantes:     {len(conflict_rows)}"
    )

    print(
        f"  Linhas utilizáveis:      {len(dataset)}"
    )

    print(
        f"  TRAIN:                   {len(train)}"
    )

    print(
        f"  VALIDATION:              {len(validation)}"
    )

    print(
        f"  TEST:                    {len(test)}"
    )

    print(
        "  Grupos TRAIN:            "
        f"{train['observation_norm'].nunique()}"
    )

    print(
        "  Grupos VALIDATION:       "
        f"{validation['observation_norm'].nunique()}"
    )

    print(
        "  Grupos TEST:             "
        f"{test['observation_norm'].nunique()}"
    )

    print(
        "  Vazamento:               0"
    )

    print()

    print(
        "VALIDATION:"
    )

    print(
        "  Accuracy:                "
        f"{validation_metrics['accuracy']:.4f}"
    )

    print(
        "  Macro F1:                "
        f"{validation_metrics['macro_f1']:.4f}"
    )

    print(
        "  Weighted F1:             "
        f"{validation_metrics['weighted_f1']:.4f}"
    )

    print(
        "  Top-3 accuracy:          "
        f"{validation_metrics['top3_accuracy']:.4f}"
    )

    print()

    print(
        "TEST FINAL:"
    )

    print(
        "  Accuracy:                "
        f"{test_metrics['accuracy']:.4f}"
    )

    print(
        "  Macro F1:                "
        f"{test_metrics['macro_f1']:.4f}"
    )

    print(
        "  Weighted F1:             "
        f"{test_metrics['weighted_f1']:.4f}"
    )

    print(
        "  Top-3 accuracy:          "
        f"{test_metrics['top3_accuracy']:.4f}"
    )

    print()

    print(
        "AUTOMAÇÃO - threshold escolhido SOMENTE na VALIDATION:"
    )

    for target in TARGET_PRECISIONS:
        key = str(
            int(
                target
                *
                100
            )
        )

        validation_result = selected_thresholds[
            key
        ]

        test_result = automation_test[
            key
        ]

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

        test_precision = test_result[
            "precision"
        ]

        print(
            "    Threshold:             "
            f"{float(validation_result['threshold']):.6f}"
        )

        print(
            "    Validation precisão:   "
            f"{float(validation_result['precision']) * 100:.2f}%"
        )

        print(
            "    Validation cobertura:  "
            f"{float(validation_result['coverage']) * 100:.2f}%"
        )

        print(
            "    Test precisão:         "
            f"{(
                float(test_precision) * 100
                if test_precision is not None
                else 0.0
            ):.2f}%"
        )

        print(
            "    Test cobertura:        "
            f"{float(test_result['coverage']) * 100:.2f}%"
        )

        print(
            "    Automatizados:         "
            f"{int(test_result['automated'])}"
        )

        print(
            "    Revisão humana:        "
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
        "Este v1.1 é um artefato de avaliação. "
        "Não substitua ainda o modelo v1 da aplicação."
    )


if __name__ == "__main__":
    main()