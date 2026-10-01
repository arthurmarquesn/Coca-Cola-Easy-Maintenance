from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, f1_score
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC


# ============================================================
# CONFIGURAÇÃO
# ============================================================

RANDOM_SEED = 42

VALIDATION_RATIO = 0.15
TEST_RATIO = 0.15

TARGET_PRECISIONS = [
    0.90,
    0.95,
    0.97,
]

MIN_VALIDATION_AUTOMATIONS = 20

DEFAULT_DATASET = (
    "ml/data/human/context_v2/"
    "human_context_v2_trainable.csv"
)

DEFAULT_OUTPUT_DIR = (
    "ml/data/human/context_v2/eval"
)

DEFAULT_MODEL_DIR = (
    "ml/models/context_v2_eval"
)


# ============================================================
# HELPERS
# ============================================================

def clean(
    value: object,
) -> str:
    if value is None:
        return ""

    return " ".join(
        str(
            value,
        )
        .strip()
        .split()
    )


def stable_hash(
    value: str,
) -> int:
    digest = hashlib.sha256(
        f"{RANDOM_SEED}|{value}".encode(
            "utf-8",
        )
    ).hexdigest()

    return int(
        digest[
            :16
        ],
        16,
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
        "source_equipment_name",
        "source_stop_key_1",
        "source_stop_type",
        "source_line_name",
        "match_status",
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
            "Colunas ausentes: "
            f"{sorted(missing)}"
        )

    for column in required:
        if (
            column
            ==
            "row_id"
        ):
            continue

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
                clean,
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
    ].copy()

    df[
        "row_id"
    ] = df[
        "row_id"
    ].astype(
        int,
    )

    df = df[
        (
            df[
                "match_status"
            ]
            ==
            "EXACT_SAFE"
        )
        &
        (
            df[
                "observation_norm"
            ]
            !=
            ""
        )
        &
        (
            df[
                "classification_norm"
            ]
            !=
            ""
        )
    ].copy()

    # --------------------------------------------------------
    # Validação defensiva de conflitos
    # --------------------------------------------------------

    label_counts = (
        df.groupby(
            "observation_norm",
        )[
            "classification_norm"
        ]
        .nunique()
    )

    conflict_keys = set(
        label_counts[
            label_counts
            >
            1
        ].index
    )

    if conflict_keys:
        df = df[
            ~df[
                "observation_norm"
            ].isin(
                conflict_keys,
            )
        ].copy()

    # ========================================================
    # TEXTO BASELINE
    # ========================================================

    df[
        "text_observation"
    ] = df[
        "observation"
    ]

    # ========================================================
    # TEXTO CONTEXTUAL
    #
    # Subchave ficou fora desta primeira versão porque
    # possui apenas 12,72% de cobertura.
    # ========================================================

    df[
        "text_context"
    ] = (
        "OBSERVACAO: "
        +
        df[
            "observation"
        ]
        +
        " | EQUIPAMENTO: "
        +
        df[
            "source_equipment_name"
        ]
        +
        " | CHAVE_1: "
        +
        df[
            "source_stop_key_1"
        ]
        +
        " | TIPO_PARADA: "
        +
        df[
            "source_stop_type"
        ]
        +
        " | LINHA: "
        +
        df[
            "source_line_name"
        ]
    )

    df.reset_index(
        drop=True,
        inplace=True,
    )

    return df


# ============================================================
# SPLIT
# ============================================================

def build_group_split(
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
                ]
            )
        )

        count = len(
            ordered,
        )

        # ----------------------------------------------------
        # Apenas um grupo:
        # permanece no treino.
        # ----------------------------------------------------

        if (
            count
            <=
            1
        ):
            continue

        # ----------------------------------------------------
        # Duas observações:
        # uma fica no treino e outra vai deterministicamente
        # para validation ou test.
        # ----------------------------------------------------

        if (
            count
            ==
            2
        ):
            holdout_index = (
                ordered
                .iloc[
                    0:1
                ]
                .index
            )

            destination = (
                "VALIDATION"
                if (
                    stable_hash(
                        f"HOLDOUT|{classification}"
                    )
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
            ] = destination

            continue

        # ----------------------------------------------------
        # Classes com >= 3 observações
        # ----------------------------------------------------

        validation_count = max(
            1,
            int(
                round(
                    count
                    *
                    VALIDATION_RATIO
                )
            ),
        )

        test_count = max(
            1,
            int(
                round(
                    count
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
            count
        ):
            if (
                validation_count
                >=
                test_count
                and
                validation_count
                >
                1
            ):
                validation_count -= 1

            elif (
                test_count
                >
                1
            ):
                test_count -= 1

            else:
                break

        test_indices = (
            ordered
            .iloc[
                :test_count
            ]
            .index
        )

        validation_indices = (
            ordered
            .iloc[
                test_count:
                test_count
                +
                validation_count
            ]
            .index
        )

        groups.loc[
            test_indices,
            "split",
        ] = "TEST"

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
            "Há linhas sem split."
        )

    train = set(
        result.loc[
            result[
                "split"
            ]
            ==
            "TRAIN",
            "observation_norm",
        ]
    )

    validation = set(
        result.loc[
            result[
                "split"
            ]
            ==
            "VALIDATION",
            "observation_norm",
        ]
    )

    test = set(
        result.loc[
            result[
                "split"
            ]
            ==
            "TEST",
            "observation_norm",
        ]
    )

    leakage = (
        (
            train
            &
            validation
        )
        |
        (
            train
            &
            test
        )
        |
        (
            validation
            &
            test
        )
    )

    if leakage:
        raise RuntimeError(
            "Vazamento detectado: "
            f"{len(leakage)} grupos."
        )

    return result


# ============================================================
# VETORIZAÇÃO
# ============================================================

def build_vectorizer() -> FeatureUnion:
    return FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
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
                ),
            ),

            (
                "char",
                TfidfVectorizer(
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
                ),
            ),
        ]
    )


# ============================================================
# SCORES
# ============================================================

def decision_scores(
    classifier:
        LinearSVC,

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
    scores:
        np.ndarray,
) -> np.ndarray:
    ordered = np.sort(
        scores,
        axis=1,
    )

    if (
        ordered.shape[
            1
        ]
        <
        2
    ):
        return np.full(
            ordered.shape[
                0
            ],
            np.inf,
        )

    return (
        ordered[
            :,
            -1
        ]
        -
        ordered[
            :,
            -2
        ]
    )


def top3_predictions(
    scores:
        np.ndarray,

    classes:
        np.ndarray,
) -> list[
    list[str]
]:
    k = min(
        3,
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

def basic_metrics(
    true_labels:
        np.ndarray,

    predictions:
        np.ndarray,

    top3:
        list[
            list[str]
        ],
) -> dict[
    str,
    float,
]:
    return {
        "accuracy":
            round(
                float(
                    accuracy_score(
                        true_labels,
                        predictions,
                    )
                ),
                6,
            ),

        "macro_f1":
            round(
                float(
                    f1_score(
                        true_labels,
                        predictions,
                        average="macro",
                        zero_division=0,
                    )
                ),
                6,
            ),

        "weighted_f1":
            round(
                float(
                    f1_score(
                        true_labels,
                        predictions,
                        average="weighted",
                        zero_division=0,
                    )
                ),
                6,
            ),

        "top3_accuracy":
            round(
                float(
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
                6,
            ),
    }


# ============================================================
# CURVA DE CONFIANÇA
# ============================================================

def build_confidence_curve(
    true_labels:
        np.ndarray,

    predictions:
        np.ndarray,

    margins:
        np.ndarray,
) -> list[
    dict[
        str,
        float | int,
    ]
]:
    rows = []

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
                    round(
                        float(
                            threshold,
                        ),
                        8,
                    ),

                "selected":
                    selected,

                "coverage":
                    round(
                        selected
                        /
                        total,
                        6,
                    ),

                "precision":
                    round(
                        precision,
                        6,
                    ),
            }
        )

    return rows


def select_thresholds(
    curve:
        list[
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
    result = {}

    for target in TARGET_PRECISIONS:
        key = str(
            int(
                target
                *
                100
            )
        )

        candidates = [
            row

            for row
            in curve

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

        if not candidates:
            result[
                key
            ] = None

            continue

        result[
            key
        ] = max(
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

    return result


def evaluate_thresholds(
    true_labels:
        np.ndarray,

    predictions:
        np.ndarray,

    margins:
        np.ndarray,

    thresholds:
        dict[
            str,
            dict[
                str,
                float | int,
            ]
            | None,
        ],
) -> dict[
    str,
    dict[
        str,
        float | int | None,
    ]
    | None,
]:
    result = {}

    total = len(
        true_labels,
    )

    for (
        key,
        info,
    ) in thresholds.items():
        if (
            info
            is None
        ):
            result[
                key
            ] = None

            continue

        threshold = float(
            info[
                "threshold"
            ]
        )

        mask = (
            margins
            >=
            threshold
        )

        automated = int(
            mask.sum()
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

        result[
            key
        ] = {
            "threshold":
                round(
                    threshold,
                    8,
                ),

            "automated":
                automated,

            "review":
                total
                -
                automated,

            "coverage":
                round(
                    automated
                    /
                    total,
                    6,
                ),

            "precision":
                (
                    round(
                        precision,
                        6,
                    )
                    if (
                        precision
                        is not None
                    )
                    else None
                ),
        }

    return result


# ============================================================
# TREINAMENTO DE UM MODELO
# ============================================================

def train_model(
    train:
        pd.DataFrame,

    validation:
        pd.DataFrame,

    test:
        pd.DataFrame,

    text_column:
        str,
) -> dict[
    str,
    Any,
]:
    vectorizer = build_vectorizer()

    train_features = vectorizer.fit_transform(
        train[
            text_column
        ].to_numpy(
            dtype=str,
        )
    )

    validation_features = vectorizer.transform(
        validation[
            text_column
        ].to_numpy(
            dtype=str,
        )
    )

    test_features = vectorizer.transform(
        test[
            text_column
        ].to_numpy(
            dtype=str,
        )
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

    validation_scores = decision_scores(
        classifier,
        validation_features,
    )

    validation_margins = prediction_margins(
        validation_scores,
    )

    validation_top3 = top3_predictions(
        validation_scores,
        classifier.classes_,
    )

    validation_metrics = basic_metrics(
        validation_labels,
        validation_predictions,
        validation_top3,
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

    test_top3 = top3_predictions(
        test_scores,
        classifier.classes_,
    )

    test_metrics = basic_metrics(
        test_labels,
        test_predictions,
        test_top3,
    )

    # ========================================================
    # THRESHOLDS
    # ========================================================

    curve = build_confidence_curve(
        validation_labels,
        validation_predictions,
        validation_margins,
    )

    thresholds = select_thresholds(
        curve,
    )

    test_automation = evaluate_thresholds(
        test_labels,
        test_predictions,
        test_margins,
        thresholds,
    )

    return {
        "text_column":
            text_column,

        "vectorizer":
            vectorizer,

        "classifier":
            classifier,

        "feature_count":
            int(
                train_features.shape[
                    1
                ]
            ),

        "validation_metrics":
            validation_metrics,

        "test_metrics":
            test_metrics,

        "thresholds":
            thresholds,

        "test_automation":
            test_automation,

        "validation_predictions":
            validation_predictions,

        "test_predictions":
            test_predictions,

        "validation_margins":
            validation_margins,

        "test_margins":
            test_margins,

        "validation_top3":
            validation_top3,

        "test_top3":
            test_top3,
    }


# ============================================================
# LIMPEZA DO RESULTADO PARA JSON
# ============================================================

def compact_result(
    result:
        dict[
            str,
            Any,
        ],
) -> dict[
    str,
    Any,
]:
    return {
        "text_column":
            result[
                "text_column"
            ],

        "feature_count":
            result[
                "feature_count"
            ],

        "validation_metrics":
            result[
                "validation_metrics"
            ],

        "test_metrics":
            result[
                "test_metrics"
            ],

        "thresholds":
            result[
                "thresholds"
            ],

        "test_automation":
            result[
                "test_automation"
            ],
    }


# ============================================================
# MAIN
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Compara observation-only com contexto v2 "
            "no mesmo subconjunto e mesmo split."
        )
    )

    parser.add_argument(
        "--dataset",
        default=DEFAULT_DATASET,
    )

    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
    )

    parser.add_argument(
        "--model-dir",
        default=DEFAULT_MODEL_DIR,
    )

    args = parser.parse_args()

    dataset_path = Path(
        args.dataset,
    ).resolve()

    output_dir = Path(
        args.output_dir,
    ).resolve()

    model_dir = Path(
        args.model_dir,
    ).resolve()

    if (
        not dataset_path.exists()
    ):
        raise FileNotFoundError(
            "Dataset contextual não encontrado: "
            f"{dataset_path}"
        )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    model_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    print(
        "=" * 72
    )

    print(
        "EASY MAINTENANCE - A/B TEST CONTEXTUAL V2"
    )

    print(
        "=" * 72
    )

    print(
        f"Dataset: {dataset_path}"
    )

    print()

    # ========================================================
    # DATASET
    # ========================================================

    df = load_dataset(
        dataset_path,
    )

    groups = build_group_split(
        df,
    )

    df = apply_split(
        df,
        groups,
    )

    train = df[
        df[
            "split"
        ]
        ==
        "TRAIN"
    ].copy()

    validation = df[
        df[
            "split"
        ]
        ==
        "VALIDATION"
    ].copy()

    test = df[
        df[
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

    print(
        "Split:"
    )

    print(
        f"  TRAIN:      {len(train)} linhas"
    )

    print(
        f"  VALIDATION: {len(validation)} linhas"
    )

    print(
        f"  TEST:       {len(test)} linhas"
    )

    print(
        "  Grupos:     "
        f"{train['observation_norm'].nunique()} / "
        f"{validation['observation_norm'].nunique()} / "
        f"{test['observation_norm'].nunique()}"
    )

    print()

    # ========================================================
    # BASELINE
    # ========================================================

    print(
        "[1/2] Treinando baseline somente com observação..."
    )

    baseline = train_model(
        train,
        validation,
        test,
        "text_observation",
    )

    # ========================================================
    # CONTEXTO
    # ========================================================

    print(
        "[2/2] Treinando modelo contextual..."
    )

    contextual = train_model(
        train,
        validation,
        test,
        "text_context",
    )

    # ========================================================
    # DELTA
    # ========================================================

    delta = {
        metric:
            round(
                contextual[
                    "test_metrics"
                ][
                    metric
                ]
                -
                baseline[
                    "test_metrics"
                ][
                    metric
                ],
                6,
            )

        for metric
        in [
            "accuracy",
            "macro_f1",
            "weighted_f1",
            "top3_accuracy",
        ]
    }

    # ========================================================
    # MÉTRICAS JSON
    # ========================================================

    metrics = {
        "dataset_rows":
            int(
                len(
                    df,
                )
            ),

        "unique_observations":
            int(
                df[
                    "observation_norm"
                ].nunique()
            ),

        "classes":
            int(
                df[
                    "classification_norm"
                ].nunique()
            ),

        "split": {
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
        },

        "baseline":
            compact_result(
                baseline,
            ),

        "contextual":
            compact_result(
                contextual,
            ),

        "test_delta_context_minus_baseline":
            delta,
    }

    metrics_path = (
        output_dir
        /
        "context_v2_ab_metrics.json"
    )

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
    # SPLIT
    # ========================================================

    split_path = (
        output_dir
        /
        "context_v2_split.csv"
    )

    df.to_csv(
        split_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # PREVISÕES
    # ========================================================

    predictions = test[
        [
            "row_id",
            "observation",
            "observation_norm",
            "classification",
            "classification_norm",
            "source_equipment_name",
            "source_stop_key_1",
            "source_stop_type",
            "source_line_name",
        ]
    ].copy()

    predictions[
        "baseline_prediction"
    ] = baseline[
        "test_predictions"
    ]

    predictions[
        "baseline_correct"
    ] = (
        predictions[
            "classification_norm"
        ]
        .to_numpy(
            dtype=str,
        )
        ==
        baseline[
            "test_predictions"
        ]
    )

    predictions[
        "baseline_margin"
    ] = baseline[
        "test_margins"
    ]

    predictions[
        "baseline_top3"
    ] = [
        " | ".join(
            values,
        )

        for values
        in baseline[
            "test_top3"
        ]
    ]

    predictions[
        "context_prediction"
    ] = contextual[
        "test_predictions"
    ]

    predictions[
        "context_correct"
    ] = (
        predictions[
            "classification_norm"
        ]
        .to_numpy(
            dtype=str,
        )
        ==
        contextual[
            "test_predictions"
        ]
    )

    predictions[
        "context_margin"
    ] = contextual[
        "test_margins"
    ]

    predictions[
        "context_top3"
    ] = [
        " | ".join(
            values,
        )

        for values
        in contextual[
            "test_top3"
        ]
    ]

    predictions_path = (
        output_dir
        /
        "context_v2_test_predictions.csv"
    )

    predictions.to_csv(
        predictions_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # ARTEFATOS DE AVALIAÇÃO
    # ========================================================

    joblib.dump(
        {
            "purpose":
                "evaluation",

            "type":
                "observation_only",

            "vectorizer":
                baseline[
                    "vectorizer"
                ],

            "classifier":
                baseline[
                    "classifier"
                ],

            "automation_thresholds":
                baseline[
                    "thresholds"
                ],
        },

        model_dir
        /
        "baseline_same_subset_eval.joblib",
    )

    joblib.dump(
        {
            "purpose":
                "evaluation",

            "type":
                "contextual_v2",

            "context_fields": [
                "observation",
                "source_equipment_name",
                "source_stop_key_1",
                "source_stop_type",
                "source_line_name",
            ],

            "vectorizer":
                contextual[
                    "vectorizer"
                ],

            "classifier":
                contextual[
                    "classifier"
                ],

            "automation_thresholds":
                contextual[
                    "thresholds"
                ],
        },

        model_dir
        /
        "failure_classifier_context_v2_eval.joblib",
    )

    # ========================================================
    # TERMINAL
    # ========================================================

    print()

    print(
        "=" * 72
    )

    print(
        "RESULTADOS A/B - MESMO SUBCONJUNTO"
    )

    print(
        "=" * 72
    )

    print()

    print(
        "BASELINE - SOMENTE OBSERVAÇÃO"
    )

    for (
        key,
        value,
    ) in baseline[
        "test_metrics"
    ].items():
        print(
            f"  {key:20} {value:.4f}"
        )

    print()

    print(
        "CONTEXTUAL V2"
    )

    for (
        key,
        value,
    ) in contextual[
        "test_metrics"
    ].items():
        print(
            f"  {key:20} {value:.4f}"
        )

    print()

    print(
        "DELTA CONTEXTO - BASELINE"
    )

    for (
        key,
        value,
    ) in delta.items():
        sign = (
            "+"
            if value
            >=
            0
            else
            ""
        )

        print(
            f"  {key:20} "
            f"{sign}{value:.4f}"
        )

    print()

    print(
        "AUTOMAÇÃO NO TESTE - BASELINE"
    )

    for target in [
        "90",
        "95",
        "97",
    ]:
        result = baseline[
            "test_automation"
        ][
            target
        ]

        if (
            result
            is None
        ):
            print(
                f"  Meta {target}%: indisponível"
            )

            continue

        precision = result[
            "precision"
        ]

        precision_text = (
            f"{float(precision) * 100:.2f}%"
            if (
                precision
                is not None
            )
            else
            "n/a"
        )

        print(
            f"  Meta {target}%: "
            f"precisão={precision_text} | "
            "cobertura="
            f"{float(result['coverage']) * 100:.2f}%"
        )

    print()

    print(
        "AUTOMAÇÃO NO TESTE - CONTEXTUAL V2"
    )

    for target in [
        "90",
        "95",
        "97",
    ]:
        result = contextual[
            "test_automation"
        ][
            target
        ]

        if (
            result
            is None
        ):
            print(
                f"  Meta {target}%: indisponível"
            )

            continue

        precision = result[
            "precision"
        ]

        precision_text = (
            f"{float(precision) * 100:.2f}%"
            if (
                precision
                is not None
            )
            else
            "n/a"
        )

        print(
            f"  Meta {target}%: "
            f"precisão={precision_text} | "
            "cobertura="
            f"{float(result['coverage']) * 100:.2f}%"
        )

    print()

    print(
        f"Métricas:  {metrics_path}"
    )

    print(
        f"Previsões: {predictions_path}"
    )

    print()

    print(
        "Os dois modelos foram avaliados "
        "nas mesmas linhas e no mesmo split."
    )


if __name__ == "__main__":
    main()