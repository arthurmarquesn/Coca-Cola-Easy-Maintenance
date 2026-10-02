from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from scipy.sparse import hstack

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import (
    accuracy_score,
    f1_score,
)
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC


# ============================================================
# CONFIGURAÇÃO
# ============================================================

MODEL_VERSION = "failure_classifier_context_v2_1_ablation"

# Novo seed para não continuarmos ajustando diretamente
# sobre o mesmo holdout observado anteriormente.
RANDOM_SEED = 20260917

VALIDATION_RATIO = 0.15
TEST_RATIO = 0.15

DEFAULT_DATASET = (
    "ml/data/human/context_v2/"
    "human_context_v2_trainable.csv"
)

DEFAULT_OUTPUT_DIR = (
    "ml/data/human/context_v2/ablation_v2_1"
)

DEFAULT_MODEL_DIR = (
    "ml/models/context_v2_1"
)


# ============================================================
# CAMPOS
# ============================================================

FIELD_OBSERVATION = "observation"
FIELD_EQUIPMENT = "source_equipment_name"
FIELD_KEY1 = "source_stop_key_1"
FIELD_STOP_TYPE = "source_stop_type"
FIELD_LINE = "source_line_name"

ALL_FIELDS = [
    FIELD_OBSERVATION,
    FIELD_EQUIPMENT,
    FIELD_KEY1,
    FIELD_STOP_TYPE,
    FIELD_LINE,
]


# ============================================================
# EXPERIMENTOS
#
# A observação sempre possui peso 1.0.
#
# Os campos contextuais recebem pesos menores.
# ============================================================

EXPERIMENTS: dict[
    str,
    dict[
        str,
        float,
    ],
] = {
    "baseline_observation": {
        FIELD_OBSERVATION:
            1.00,
    },

    "observation_equipment_025": {
        FIELD_OBSERVATION:
            1.00,

        FIELD_EQUIPMENT:
            0.25,
    },

    "observation_equipment_050": {
        FIELD_OBSERVATION:
            1.00,

        FIELD_EQUIPMENT:
            0.50,
    },

    "observation_key1_025": {
        FIELD_OBSERVATION:
            1.00,

        FIELD_KEY1:
            0.25,
    },

    "observation_key1_050": {
        FIELD_OBSERVATION:
            1.00,

        FIELD_KEY1:
            0.50,
    },

    "observation_equipment_key1_025": {
        FIELD_OBSERVATION:
            1.00,

        FIELD_EQUIPMENT:
            0.25,

        FIELD_KEY1:
            0.25,
    },

    "observation_equipment_key1_050": {
        FIELD_OBSERVATION:
            1.00,

        FIELD_EQUIPMENT:
            0.50,

        FIELD_KEY1:
            0.50,
    },

    "observation_stop_type_025": {
        FIELD_OBSERVATION:
            1.00,

        FIELD_STOP_TYPE:
            0.25,
    },

    "observation_line_025": {
        FIELD_OBSERVATION:
            1.00,

        FIELD_LINE:
            0.25,
    },

    "observation_context_light": {
        FIELD_OBSERVATION:
            1.00,

        FIELD_EQUIPMENT:
            0.25,

        FIELD_KEY1:
            0.25,

        FIELD_STOP_TYPE:
            0.15,

        FIELD_LINE:
            0.10,
    },
}


# ============================================================
# HELPERS
# ============================================================

def clean_text(
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
        (
            f"{RANDOM_SEED}|{value}"
        ).encode(
            "utf-8",
        )
    ).hexdigest()

    return int(
        digest[
            :16
        ],
        16,
    )


def rounded(
    value: float,
) -> float:
    return round(
        float(
            value,
        ),
        6,
    )


# ============================================================
# DATASET
# ============================================================

def load_dataset(
    path: Path,
) -> pd.DataFrame:
    dataframe = pd.read_csv(
        path,
        dtype=str,
    )

    required = {
        "row_id",
        "observation",
        "observation_norm",
        "classification",
        "classification_norm",
        "match_status",
        FIELD_EQUIPMENT,
        FIELD_KEY1,
        FIELD_STOP_TYPE,
        FIELD_LINE,
    }

    missing = (
        required
        -
        set(
            dataframe.columns,
        )
    )

    if missing:
        raise ValueError(
            "Colunas ausentes no dataset: "
            f"{sorted(missing)}"
        )

    for field in [
        "observation",
        "observation_norm",
        "classification",
        "classification_norm",
        "match_status",
        FIELD_EQUIPMENT,
        FIELD_KEY1,
        FIELD_STOP_TYPE,
        FIELD_LINE,
    ]:
        dataframe[
            field
        ] = (
            dataframe[
                field
            ]
            .fillna(
                "",
            )
            .map(
                clean_text,
            )
        )

    dataframe[
        "row_id"
    ] = pd.to_numeric(
        dataframe[
            "row_id"
        ],
        errors="coerce",
    )

    dataframe = dataframe[
        dataframe[
            "row_id"
        ].notna()
    ].copy()

    dataframe[
        "row_id"
    ] = dataframe[
        "row_id"
    ].astype(
        int,
    )

    dataframe = dataframe[
        (
            dataframe[
                "match_status"
            ]
            ==
            "EXACT_SAFE"
        )
        &
        (
            dataframe[
                "observation_norm"
            ]
            !=
            ""
        )
        &
        (
            dataframe[
                "classification_norm"
            ]
            !=
            ""
        )
    ].copy()

    # --------------------------------------------------------
    # Defesa contra qualquer conflito residual
    # --------------------------------------------------------

    counts = (
        dataframe
        .groupby(
            "observation_norm",
        )[
            "classification_norm"
        ]
        .nunique()
    )

    conflicts = set(
        counts[
            counts
            >
            1
        ].index
    )

    if conflicts:
        dataframe = dataframe[
            ~dataframe[
                "observation_norm"
            ].isin(
                conflicts,
            )
        ].copy()

    dataframe.reset_index(
        drop=True,
        inplace=True,
    )

    return dataframe


# ============================================================
# SPLIT AGRUPADO
# ============================================================

def create_split(
    dataframe: pd.DataFrame,
) -> pd.DataFrame:
    groups = (
        dataframe
        .groupby(
            "observation_norm",
            as_index=False,
        )
        .agg(
            classification_norm=(
                "classification_norm",
                "first",
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

        # ----------------------------------------------------
        # Uma observação:
        # fica somente no treino.
        # ----------------------------------------------------

        if (
            count
            <=
            1
        ):
            continue

        # ----------------------------------------------------
        # Duas observações:
        # uma treino e outra holdout.
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

            target_split = (
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
            ] = target_split

            continue

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

    result = dataframe.copy()

    result[
        "split"
    ] = result[
        "observation_norm"
    ].map(
        split_map,
    )

    return result


def verify_no_leakage(
    dataframe: pd.DataFrame,
) -> None:
    train = set(
        dataframe.loc[
            dataframe[
                "split"
            ]
            ==
            "TRAIN",
            "observation_norm",
        ]
    )

    validation = set(
        dataframe.loc[
            dataframe[
                "split"
            ]
            ==
            "VALIDATION",
            "observation_norm",
        ]
    )

    test = set(
        dataframe.loc[
            dataframe[
                "split"
            ]
            ==
            "TEST",
            "observation_norm",
        ]
    )

    overlap = (
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

    if overlap:
        raise RuntimeError(
            "Vazamento de observações detectado: "
            f"{len(overlap)} grupos."
        )


# ============================================================
# VETORIZADOR DE UM CAMPO
# ============================================================

def build_field_vectorizer() -> FeatureUnion:
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

                    max_features=30000,
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

                    max_features=40000,
                ),
            ),
        ]
    )


# ============================================================
# CACHE DE FEATURES
#
# Cada campo recebe seu próprio espaço TF-IDF.
#
# Isso é diferente do v2 anterior, onde tudo foi colocado
# dentro da mesma frase.
# ============================================================

def build_feature_cache(
    train: pd.DataFrame,
    validation: pd.DataFrame,
    test: pd.DataFrame,
) -> tuple[
    dict[
        str,
        FeatureUnion,
    ],
    dict[
        str,
        dict[
            str,
            Any,
        ],
    ],
]:
    vectorizers: dict[
        str,
        FeatureUnion,
    ] = {}

    cache: dict[
        str,
        dict[
            str,
            Any,
        ],
    ] = {}

    for field in ALL_FIELDS:
        print(
            f"  Vetorizando {field}..."
        )

        vectorizer = (
            build_field_vectorizer()
        )

        train_matrix = (
            vectorizer
            .fit_transform(
                train[
                    field
                ].to_numpy(
                    dtype=str,
                )
            )
        )

        validation_matrix = (
            vectorizer
            .transform(
                validation[
                    field
                ].to_numpy(
                    dtype=str,
                )
            )
        )

        test_matrix = (
            vectorizer
            .transform(
                test[
                    field
                ].to_numpy(
                    dtype=str,
                )
            )
        )

        vectorizers[
            field
        ] = vectorizer

        cache[
            field
        ] = {
            "TRAIN":
                train_matrix,

            "VALIDATION":
                validation_matrix,

            "TEST":
                test_matrix,
        }

    return (
        vectorizers,
        cache,
    )


# ============================================================
# COMBINAR CAMPOS COM PESOS
# ============================================================

def combine_features(
    cache: dict[
        str,
        dict[
            str,
            Any,
        ],
    ],

    split: str,

    weights: dict[
        str,
        float,
    ],
):
    matrices = []

    for (
        field,
        weight,
    ) in weights.items():
        matrix = (
            cache[
                field
            ][
                split
            ]
        )

        if (
            weight
            !=
            1.0
        ):
            matrix = (
                matrix
                *
                float(
                    weight,
                )
            )

        matrices.append(
            matrix,
        )

    if (
        not matrices
    ):
        raise RuntimeError(
            "Nenhuma feature foi selecionada."
        )

    if (
        len(
            matrices,
        )
        ==
        1
    ):
        return matrices[
            0
        ]

    return hstack(
        matrices,
        format="csr",
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


def margins_from_scores(
    scores: np.ndarray,
) -> np.ndarray:
    ordered = np.sort(
        scores,
        axis=1,
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


def top3_from_scores(
    scores: np.ndarray,
    classes: np.ndarray,
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

def calculate_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
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
                    y_true,
                    y_pred,
                )
            ),

        "macro_f1":
            rounded(
                f1_score(
                    y_true,
                    y_pred,
                    average="macro",
                    zero_division=0,
                )
            ),

        "weighted_f1":
            rounded(
                f1_score(
                    y_true,
                    y_pred,
                    average="weighted",
                    zero_division=0,
                )
            ),

        "top3_accuracy":
            rounded(
                np.mean(
                    [
                        true_label
                        in candidates

                        for (
                            true_label,
                            candidates,
                        )
                        in zip(
                            y_true,
                            top3,
                        )
                    ]
                )
            ),
    }


# ============================================================
# TREINAR CANDIDATO
# ============================================================

def train_candidate(
    name: str,

    weights: dict[
        str,
        float,
    ],

    cache: dict[
        str,
        dict[
            str,
            Any,
        ],
    ],

    train_labels: np.ndarray,

    validation_labels:
        np.ndarray,

    test_labels:
        np.ndarray,

    evaluate_test:
        bool = False,
) -> dict[
    str,
    Any,
]:
    train_features = combine_features(
        cache,
        "TRAIN",
        weights,
    )

    validation_features = combine_features(
        cache,
        "VALIDATION",
        weights,
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

    validation_prediction = (
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

    validation_top3 = (
        top3_from_scores(
            validation_scores,
            classifier.classes_,
        )
    )

    result: dict[
        str,
        Any,
    ] = {
        "name":
            name,

        "weights":
            weights,

        "classifier":
            classifier,

        "validation":
            calculate_metrics(
                validation_labels,
                validation_prediction,
                validation_top3,
            ),

        "feature_count":
            int(
                train_features.shape[
                    1
                ]
            ),
    }

    if (
        evaluate_test
    ):
        test_features = (
            combine_features(
                cache,
                "TEST",
                weights,
            )
        )

        test_prediction = (
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

        test_top3 = top3_from_scores(
            test_scores,
            classifier.classes_,
        )

        test_margins = margins_from_scores(
            test_scores,
        )

        result[
            "test"
        ] = calculate_metrics(
            test_labels,
            test_prediction,
            test_top3,
        )

        result[
            "test_predictions"
        ] = test_prediction

        result[
            "test_top3"
        ] = test_top3

        result[
            "test_margins"
        ] = test_margins

    return result


# ============================================================
# SELEÇÃO
#
# O TEST não participa da seleção.
#
# Primeiro:
# accuracy validation
#
# Desempate:
# macro F1
# weighted F1
# ============================================================

def candidate_sort_key(
    result: dict[
        str,
        Any,
    ],
) -> tuple[
    float,
    float,
    float,
]:
    metrics = result[
        "validation"
    ]

    return (
        float(
            metrics[
                "accuracy"
            ]
        ),

        float(
            metrics[
                "macro_f1"
            ]
        ),

        float(
            metrics[
                "weighted_f1"
            ]
        ),
    )


# ============================================================
# MAIN
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Executa ablação de campos contextuais usando "
            "TF-IDF independente por campo."
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
            "Dataset não encontrado: "
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
        "EASY MAINTENANCE - CONTEXT V2.1 ABLATION"
    )

    print(
        "=" * 72
    )

    print()

    # ========================================================
    # DATASET
    # ========================================================

    dataframe = load_dataset(
        dataset_path,
    )

    dataframe = create_split(
        dataframe,
    )

    verify_no_leakage(
        dataframe,
    )

    train = dataframe[
        dataframe[
            "split"
        ]
        ==
        "TRAIN"
    ].copy()

    validation = dataframe[
        dataframe[
            "split"
        ]
        ==
        "VALIDATION"
    ].copy()

    test = dataframe[
        dataframe[
            "split"
        ]
        ==
        "TEST"
    ].copy()

    print(
        "Split:"
    )

    print(
        f"  TRAIN:       {len(train)}"
    )

    print(
        f"  VALIDATION:  {len(validation)}"
    )

    print(
        f"  TEST:        {len(test)}"
    )

    print(
        "  Grupos:      "
        f"{train['observation_norm'].nunique()} / "
        f"{validation['observation_norm'].nunique()} / "
        f"{test['observation_norm'].nunique()}"
    )

    print(
        "  Vazamento:   0"
    )

    print()

    # ========================================================
    # CACHE
    # ========================================================

    print(
        "Construindo espaços TF-IDF independentes..."
    )

    (
        vectorizers,
        cache,
    ) = build_feature_cache(
        train,
        validation,
        test,
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
    # ABLATION
    #
    # Só olhamos VALIDATION aqui.
    # ========================================================

    results = []

    print()

    print(
        "Avaliando candidatos somente na VALIDATION..."
    )

    for (
        name,
        weights,
    ) in EXPERIMENTS.items():
        result = train_candidate(
            name=name,

            weights=weights,

            cache=cache,

            train_labels=train_labels,

            validation_labels=validation_labels,

            test_labels=test_labels,

            evaluate_test=False,
        )

        results.append(
            result,
        )

        metrics = result[
            "validation"
        ]

        print(
            f"  {name:38} "
            f"ACC={metrics['accuracy']:.4f} | "
            f"MacroF1={metrics['macro_f1']:.4f} | "
            f"Top3={metrics['top3_accuracy']:.4f}"
        )

    # ========================================================
    # ESCOLHER MELHOR USANDO SOMENTE VALIDATION
    # ========================================================

    selected = max(
        results,
        key=candidate_sort_key,
    )

    selected_name = str(
        selected[
            "name"
        ]
    )

    selected_weights = dict(
        selected[
            "weights"
        ]
    )

    print()

    print(
        "Selecionado pela VALIDATION:"
    )

    print(
        f"  {selected_name}"
    )

    print(
        f"  Pesos: {selected_weights}"
    )

    # ========================================================
    # TESTE FINAL
    #
    # Agora avaliamos somente:
    #
    # - baseline
    # - candidato selecionado
    #
    # Ambos no TEST.
    # ========================================================

    print()

    print(
        "Avaliando TEST..."
    )

    baseline_result = train_candidate(
        name="baseline_observation",

        weights=EXPERIMENTS[
            "baseline_observation"
        ],

        cache=cache,

        train_labels=train_labels,

        validation_labels=validation_labels,

        test_labels=test_labels,

        evaluate_test=True,
    )

    if (
        selected_name
        ==
        "baseline_observation"
    ):
        selected_result = (
            baseline_result
        )

    else:
        selected_result = train_candidate(
            name=selected_name,

            weights=selected_weights,

            cache=cache,

            train_labels=train_labels,

            validation_labels=validation_labels,

            test_labels=test_labels,

            evaluate_test=True,
        )

    baseline_test = baseline_result[
        "test"
    ]

    selected_test = selected_result[
        "test"
    ]

    delta = {
        metric:
            rounded(
                float(
                    selected_test[
                        metric
                    ]
                )
                -
                float(
                    baseline_test[
                        metric
                    ]
                )
            )

        for metric in [
            "accuracy",
            "macro_f1",
            "weighted_f1",
            "top3_accuracy",
        ]
    }

    # ========================================================
    # SALVAR RESULTADOS
    # ========================================================

    validation_results_json = []

    for result in results:
        validation_results_json.append(
            {
                "name":
                    result[
                        "name"
                    ],

                "weights":
                    result[
                        "weights"
                    ],

                "feature_count":
                    result[
                        "feature_count"
                    ],

                "validation":
                    result[
                        "validation"
                    ],
            }
        )

    metrics_output = {
        "model_version":
            MODEL_VERSION,

        "random_seed":
            RANDOM_SEED,

        "dataset": {
            "rows":
                int(
                    len(
                        dataframe,
                    )
                ),

            "unique_observations":
                int(
                    dataframe[
                        "observation_norm"
                    ].nunique()
                ),

            "classes":
                int(
                    dataframe[
                        "classification_norm"
                    ].nunique()
                ),
        },

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
        },

        "validation_candidates":
            validation_results_json,

        "selected_by_validation":
            selected_name,

        "selected_weights":
            selected_weights,

        "baseline_test":
            baseline_test,

        "selected_test":
            selected_test,

        "delta_selected_minus_baseline":
            delta,
    }

    metrics_path = (
        output_dir
        /
        "context_v2_1_ablation_metrics.json"
    )

    with metrics_path.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            metrics_output,
            file,
            ensure_ascii=False,
            indent=2,
        )

    # ========================================================
    # TEST PREDICTIONS
    # ========================================================

    predictions = test[
        [
            "row_id",
            "observation",
            "classification",
            "classification_norm",
            FIELD_EQUIPMENT,
            FIELD_KEY1,
            FIELD_STOP_TYPE,
            FIELD_LINE,
        ]
    ].copy()

    predictions[
        "baseline_prediction"
    ] = baseline_result[
        "test_predictions"
    ]

    predictions[
        "baseline_correct"
    ] = (
        predictions[
            "classification_norm"
        ].to_numpy(
            dtype=str,
        )
        ==
        baseline_result[
            "test_predictions"
        ]
    )

    predictions[
        "selected_model"
    ] = selected_name

    predictions[
        "selected_prediction"
    ] = selected_result[
        "test_predictions"
    ]

    predictions[
        "selected_correct"
    ] = (
        predictions[
            "classification_norm"
        ].to_numpy(
            dtype=str,
        )
        ==
        selected_result[
            "test_predictions"
        ]
    )

    predictions[
        "baseline_margin"
    ] = baseline_result[
        "test_margins"
    ]

    predictions[
        "selected_margin"
    ] = selected_result[
        "test_margins"
    ]

    predictions[
        "baseline_top3"
    ] = [
        " | ".join(
            values,
        )
        for values
        in baseline_result[
            "test_top3"
        ]
    ]

    predictions[
        "selected_top3"
    ] = [
        " | ".join(
            values,
        )
        for values
        in selected_result[
            "test_top3"
        ]
    ]

    predictions_path = (
        output_dir
        /
        "context_v2_1_test_predictions.csv"
    )

    predictions.to_csv(
        predictions_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # MODELO DE AVALIAÇÃO
    # ========================================================

    model_path = (
        model_dir
        /
        "failure_classifier_context_v2_1_eval.joblib"
    )

    joblib.dump(
        {
            "purpose":
                "evaluation",

            "model_version":
                MODEL_VERSION,

            "selected_experiment":
                selected_name,

            "field_weights":
                selected_weights,

            "vectorizers":
                vectorizers,

            "classifier":
                selected_result[
                    "classifier"
                ],

            "classes":
                selected_result[
                    "classifier"
                ].classes_,

            "random_seed":
                RANDOM_SEED,
        },

        model_path,
    )

    # ========================================================
    # TERMINAL
    # ========================================================

    print()

    print(
        "=" * 72
    )

    print(
        "RESULTADO FINAL V2.1"
    )

    print(
        "=" * 72
    )

    print()

    print(
        "Modelo selecionado:"
    )

    print(
        f"  {selected_name}"
    )

    print(
        f"  {selected_weights}"
    )

    print()

    print(
        "BASELINE TEST:"
    )

    print(
        f"  Accuracy:       "
        f"{baseline_test['accuracy']:.4f}"
    )

    print(
        f"  Macro F1:       "
        f"{baseline_test['macro_f1']:.4f}"
    )

    print(
        f"  Weighted F1:    "
        f"{baseline_test['weighted_f1']:.4f}"
    )

    print(
        f"  Top-3:          "
        f"{baseline_test['top3_accuracy']:.4f}"
    )

    print()

    print(
        "SELECIONADO TEST:"
    )

    print(
        f"  Accuracy:       "
        f"{selected_test['accuracy']:.4f}"
    )

    print(
        f"  Macro F1:       "
        f"{selected_test['macro_f1']:.4f}"
    )

    print(
        f"  Weighted F1:    "
        f"{selected_test['weighted_f1']:.4f}"
    )

    print(
        f"  Top-3:          "
        f"{selected_test['top3_accuracy']:.4f}"
    )

    print()

    print(
        "DELTA:"
    )

    for (
        metric,
        value,
    ) in delta.items():
        prefix = (
            "+"
            if value
            >=
            0
            else
            ""
        )

        print(
            f"  {metric:20} "
            f"{prefix}{value:.4f}"
        )

    print()

    print(
        f"Métricas:  {metrics_path}"
    )

    print(
        f"Previsões: {predictions_path}"
    )

    print(
        f"Modelo:    {model_path}"
    )


if __name__ == "__main__":
    main()