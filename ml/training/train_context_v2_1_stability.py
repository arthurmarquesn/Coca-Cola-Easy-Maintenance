from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

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

SCRIPT_VERSION = "context-v2.1-stability"

DEFAULT_DATASET = (
    "ml/data/human/context_v2/"
    "human_context_v2_trainable.csv"
)

DEFAULT_OUTPUT_DIR = (
    "ml/data/human/context_v2/stability_v2_1"
)

DEFAULT_RUNS = 20

BASE_SEED = 20260917

TEST_RATIO = 0.20

EQUIPMENT_WEIGHT = 0.25

C_VALUE = 1.5


# ============================================================
# CAMPOS
# ============================================================

OBSERVATION_FIELD = "observation"
EQUIPMENT_FIELD = "source_equipment_name"


# ============================================================
# HELPERS
# ============================================================

def clean_text(
    value: object,
) -> str:
    if value is None:
        return ""

    return " ".join(
        str(value)
        .strip()
        .split()
    )


def rounded(
    value: float,
    digits: int = 6,
) -> float:
    return round(
        float(value),
        digits,
    )


def stable_hash(
    value: str,
    seed: int,
) -> int:
    digest = hashlib.sha256(
        f"{seed}|{value}".encode(
            "utf-8",
        )
    ).hexdigest()

    return int(
        digest[:16],
        16,
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
        EQUIPMENT_FIELD,
    }

    missing = (
        required
        -
        set(dataframe.columns)
    )

    if missing:
        raise ValueError(
            "Colunas ausentes no dataset: "
            f"{sorted(missing)}"
        )

    for column in [
        "observation",
        "observation_norm",
        "classification",
        "classification_norm",
        "match_status",
        EQUIPMENT_FIELD,
    ]:
        dataframe[column] = (
            dataframe[column]
            .fillna("")
            .map(clean_text)
        )

    dataframe["row_id"] = pd.to_numeric(
        dataframe["row_id"],
        errors="coerce",
    )

    dataframe = dataframe[
        dataframe["row_id"].notna()
    ].copy()

    dataframe["row_id"] = (
        dataframe["row_id"]
        .astype(int)
    )

    dataframe = dataframe[
        (
            dataframe["match_status"]
            ==
            "EXACT_SAFE"
        )
        &
        (
            dataframe["observation_norm"]
            !=
            ""
        )
        &
        (
            dataframe["classification_norm"]
            !=
            ""
        )
    ].copy()

    # --------------------------------------------------------
    # Defesa contra conflitos residuais
    # --------------------------------------------------------

    label_counts = (
        dataframe
        .groupby("observation_norm")[
            "classification_norm"
        ]
        .nunique()
    )

    conflicts = set(
        label_counts[
            label_counts > 1
        ].index
    )

    if conflicts:
        dataframe = dataframe[
            ~dataframe[
                "observation_norm"
            ].isin(conflicts)
        ].copy()

    dataframe.reset_index(
        drop=True,
        inplace=True,
    )

    return dataframe


# ============================================================
# SPLIT AGRUPADO
#
# A mesma observation_norm nunca aparece simultaneamente
# em treino e teste.
#
# Classes com somente 1 grupo ficam apenas no treino.
#
# Classes com >= 2 grupos possuem pelo menos 1 grupo
# reservado para teste.
# ============================================================

def create_split(
    dataframe: pd.DataFrame,
    seed: int,
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

    groups["hash"] = groups[
        "observation_norm"
    ].map(
        lambda value:
            stable_hash(
                value,
                seed,
            )
    )

    groups["split"] = "TRAIN"

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

        group_count = len(
            ordered,
        )

        if group_count <= 1:
            continue

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

        test_count = min(
            test_count,
            group_count - 1,
        )

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

    split_map = dict(
        zip(
            groups["observation_norm"],
            groups["split"],
        )
    )

    result = dataframe.copy()

    result["split"] = (
        result["observation_norm"]
        .map(split_map)
    )

    if result["split"].isna().any():
        raise RuntimeError(
            "Existem linhas sem definição de split."
        )

    return result


# ============================================================
# VERIFICAÇÃO DE VAZAMENTO
# ============================================================

def verify_no_leakage(
    dataframe: pd.DataFrame,
) -> None:
    train = set(
        dataframe.loc[
            dataframe["split"]
            ==
            "TRAIN",
            "observation_norm",
        ]
    )

    test = set(
        dataframe.loc[
            dataframe["split"]
            ==
            "TEST",
            "observation_norm",
        ]
    )

    leakage = train & test

    if leakage:
        raise RuntimeError(
            "Vazamento detectado entre treino e teste: "
            f"{len(leakage)} grupos."
        )


# ============================================================
# VETORIZADORES
# ============================================================

def build_field_vectorizer() -> FeatureUnion:
    return FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 2),
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
                    ngram_range=(3, 5),
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

    if scores.ndim == 1:
        scores = np.column_stack(
            [
                -scores,
                scores,
            ]
        )

    return scores


def top3_predictions(
    scores: np.ndarray,
    classes: np.ndarray,
) -> list[list[str]]:
    k = min(
        3,
        len(classes),
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
                classes[index]
            )
            for index in row
        ]
        for row in indices
    ]


# ============================================================
# MÉTRICAS
# ============================================================

def calculate_metrics(
    true_labels: np.ndarray,
    predictions: np.ndarray,
    top3: list[list[str]],
) -> dict[str, float]:
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
                        in candidates

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
# Evita que uma frase repetida tenha peso maior
# apenas porque aparece várias vezes.
# ============================================================

def calculate_group_metrics(
    test: pd.DataFrame,
    predictions: np.ndarray,
) -> dict[str, float | int]:
    frame = test[
        [
            "observation_norm",
            "classification_norm",
        ]
    ].copy()

    frame["prediction"] = predictions

    grouped = (
        frame
        .groupby(
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
                len(grouped)
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
# UMA EXECUÇÃO
# ============================================================

def run_experiment(
    dataframe: pd.DataFrame,
    seed: int,
    run_number: int,
) -> dict[str, Any]:
    split_dataframe = create_split(
        dataframe,
        seed,
    )

    verify_no_leakage(
        split_dataframe,
    )

    train = split_dataframe[
        split_dataframe["split"]
        ==
        "TRAIN"
    ].copy()

    test = split_dataframe[
        split_dataframe["split"]
        ==
        "TEST"
    ].copy()

    if (
        train.empty
        or
        test.empty
    ):
        raise RuntimeError(
            f"Split vazio na execução {run_number}."
        )

    train_labels = train[
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
    # OBSERVAÇÃO
    # ========================================================

    observation_vectorizer = (
        build_field_vectorizer()
    )

    train_observation = (
        observation_vectorizer
        .fit_transform(
            train[
                OBSERVATION_FIELD
            ].to_numpy(
                dtype=str,
            )
        )
    )

    test_observation = (
        observation_vectorizer
        .transform(
            test[
                OBSERVATION_FIELD
            ].to_numpy(
                dtype=str,
            )
        )
    )

    # ========================================================
    # EQUIPAMENTO
    # ========================================================

    equipment_vectorizer = (
        build_field_vectorizer()
    )

    train_equipment = (
        equipment_vectorizer
        .fit_transform(
            train[
                EQUIPMENT_FIELD
            ].to_numpy(
                dtype=str,
            )
        )
    )

    test_equipment = (
        equipment_vectorizer
        .transform(
            test[
                EQUIPMENT_FIELD
            ].to_numpy(
                dtype=str,
            )
        )
    )

    # ========================================================
    # BASELINE
    # ========================================================

    baseline_classifier = LinearSVC(
        C=C_VALUE,
        class_weight="balanced",
        max_iter=10000,
        random_state=seed,
    )

    baseline_classifier.fit(
        train_observation,
        train_labels,
    )

    baseline_predictions = (
        baseline_classifier.predict(
            test_observation,
        )
    )

    baseline_scores = decision_scores(
        baseline_classifier,
        test_observation,
    )

    baseline_top3 = top3_predictions(
        baseline_scores,
        baseline_classifier.classes_,
    )

    baseline_metrics = calculate_metrics(
        test_labels,
        baseline_predictions,
        baseline_top3,
    )

    baseline_group_metrics = (
        calculate_group_metrics(
            test,
            baseline_predictions,
        )
    )

    # ========================================================
    # CONTEXTUAL
    #
    # observation = 1.00
    # equipment   = 0.25
    # ========================================================

    train_context = hstack(
        [
            train_observation,
            train_equipment
            *
            EQUIPMENT_WEIGHT,
        ],
        format="csr",
    )

    test_context = hstack(
        [
            test_observation,
            test_equipment
            *
            EQUIPMENT_WEIGHT,
        ],
        format="csr",
    )

    contextual_classifier = LinearSVC(
        C=C_VALUE,
        class_weight="balanced",
        max_iter=10000,
        random_state=seed,
    )

    contextual_classifier.fit(
        train_context,
        train_labels,
    )

    contextual_predictions = (
        contextual_classifier.predict(
            test_context,
        )
    )

    contextual_scores = decision_scores(
        contextual_classifier,
        test_context,
    )

    contextual_top3 = top3_predictions(
        contextual_scores,
        contextual_classifier.classes_,
    )

    contextual_metrics = calculate_metrics(
        test_labels,
        contextual_predictions,
        contextual_top3,
    )

    contextual_group_metrics = (
        calculate_group_metrics(
            test,
            contextual_predictions,
        )
    )

    # ========================================================
    # DELTAS
    # ========================================================

    row_delta = {
        metric:
            rounded(
                contextual_metrics[
                    metric
                ]
                -
                baseline_metrics[
                    metric
                ]
            )

        for metric in [
            "accuracy",
            "macro_f1",
            "weighted_f1",
            "top3_accuracy",
        ]
    }

    group_delta = {
        metric:
            rounded(
                float(
                    contextual_group_metrics[
                        metric
                    ]
                )
                -
                float(
                    baseline_group_metrics[
                        metric
                    ]
                )
            )

        for metric in [
            "accuracy",
            "macro_f1",
            "weighted_f1",
        ]
    }

    return {
        "run":
            run_number,

        "seed":
            seed,

        "train_rows":
            int(
                len(train)
            ),

        "test_rows":
            int(
                len(test)
            ),

        "train_groups":
            int(
                train[
                    "observation_norm"
                ].nunique()
            ),

        "test_groups":
            int(
                test[
                    "observation_norm"
                ].nunique()
            ),

        "baseline":
            baseline_metrics,

        "contextual":
            contextual_metrics,

        "row_delta":
            row_delta,

        "baseline_group":
            baseline_group_metrics,

        "contextual_group":
            contextual_group_metrics,

        "group_delta":
            group_delta,
    }


# ============================================================
# SIGN TEST EXATO
#
# Teste simples da consistência da direção do ganho.
#
# Empates são ignorados.
#
# Não substitui uma validação externa, mas ajuda a saber
# se os ganhos positivos estão acontecendo repetidamente.
# ============================================================

def exact_two_sided_sign_test(
    wins: int,
    losses: int,
) -> float | None:
    n = (
        wins
        +
        losses
    )

    if n == 0:
        return None

    smaller = min(
        wins,
        losses,
    )

    probability = sum(
        math.comb(
            n,
            k,
        )
        for k in range(
            smaller + 1
        )
    )

    probability /= (
        2 ** n
    )

    probability *= 2

    return min(
        1.0,
        float(
            probability,
        ),
    )


# ============================================================
# RESUMO DE UM DELTA
# ============================================================

def summarize_delta(
    values: list[float],
) -> dict[str, Any]:
    array = np.asarray(
        values,
        dtype=float,
    )

    wins = int(
        np.sum(
            array > 0
        )
    )

    ties = int(
        np.sum(
            array == 0
        )
    )

    losses = int(
        np.sum(
            array < 0
        )
    )

    sign_test = (
        exact_two_sided_sign_test(
            wins,
            losses,
        )
    )

    return {
        "runs":
            int(
                len(array)
            ),

        "mean":
            rounded(
                np.mean(array)
            ),

        "median":
            rounded(
                np.median(array)
            ),

        "std":
            rounded(
                np.std(
                    array,
                    ddof=1,
                )
                if len(array) > 1
                else 0.0
            ),

        "minimum":
            rounded(
                np.min(array)
            ),

        "maximum":
            rounded(
                np.max(array)
            ),

        "wins":
            wins,

        "ties":
            ties,

        "losses":
            losses,

        "win_rate_excluding_ties":
            rounded(
                wins
                /
                (
                    wins
                    +
                    losses
                )
                if (
                    wins
                    +
                    losses
                )
                >
                0
                else 0.0
            ),

        "sign_test_p_value":
            (
                rounded(
                    sign_test,
                    8,
                )
                if (
                    sign_test
                    is not None
                )
                else None
            ),
    }


# ============================================================
# RESUMO GERAL
# ============================================================

def build_summary(
    results: list[
        dict[str, Any]
    ],
) -> dict[str, Any]:
    row_metrics = [
        "accuracy",
        "macro_f1",
        "weighted_f1",
        "top3_accuracy",
    ]

    group_metrics = [
        "accuracy",
        "macro_f1",
        "weighted_f1",
    ]

    row_summary = {}

    for metric in row_metrics:
        values = [
            float(
                result[
                    "row_delta"
                ][
                    metric
                ]
            )
            for result in results
        ]

        row_summary[
            metric
        ] = summarize_delta(
            values,
        )

    group_summary = {}

    for metric in group_metrics:
        values = [
            float(
                result[
                    "group_delta"
                ][
                    metric
                ]
            )
            for result in results
        ]

        group_summary[
            metric
        ] = summarize_delta(
            values,
        )

    baseline_accuracy = [
        float(
            result[
                "baseline"
            ][
                "accuracy"
            ]
        )
        for result in results
    ]

    contextual_accuracy = [
        float(
            result[
                "contextual"
            ][
                "accuracy"
            ]
        )
        for result in results
    ]

    return {
        "script_version":
            SCRIPT_VERSION,

        "runs":
            len(results),

        "test_ratio":
            TEST_RATIO,

        "equipment_weight":
            EQUIPMENT_WEIGHT,

        "baseline_accuracy_mean":
            rounded(
                np.mean(
                    baseline_accuracy,
                )
            ),

        "contextual_accuracy_mean":
            rounded(
                np.mean(
                    contextual_accuracy,
                )
            ),

        "row_level_delta":
            row_summary,

        "unique_observation_delta":
            group_summary,
    }


# ============================================================
# CSV DE EXECUÇÕES
# ============================================================

def build_runs_dataframe(
    results: list[
        dict[str, Any]
    ],
) -> pd.DataFrame:
    rows = []

    for result in results:
        rows.append(
            {
                "run":
                    result[
                        "run"
                    ],

                "seed":
                    result[
                        "seed"
                    ],

                "train_rows":
                    result[
                        "train_rows"
                    ],

                "test_rows":
                    result[
                        "test_rows"
                    ],

                "train_groups":
                    result[
                        "train_groups"
                    ],

                "test_groups":
                    result[
                        "test_groups"
                    ],

                "baseline_accuracy":
                    result[
                        "baseline"
                    ][
                        "accuracy"
                    ],

                "context_accuracy":
                    result[
                        "contextual"
                    ][
                        "accuracy"
                    ],

                "delta_accuracy":
                    result[
                        "row_delta"
                    ][
                        "accuracy"
                    ],

                "baseline_macro_f1":
                    result[
                        "baseline"
                    ][
                        "macro_f1"
                    ],

                "context_macro_f1":
                    result[
                        "contextual"
                    ][
                        "macro_f1"
                    ],

                "delta_macro_f1":
                    result[
                        "row_delta"
                    ][
                        "macro_f1"
                    ],

                "baseline_weighted_f1":
                    result[
                        "baseline"
                    ][
                        "weighted_f1"
                    ],

                "context_weighted_f1":
                    result[
                        "contextual"
                    ][
                        "weighted_f1"
                    ],

                "delta_weighted_f1":
                    result[
                        "row_delta"
                    ][
                        "weighted_f1"
                    ],

                "baseline_top3":
                    result[
                        "baseline"
                    ][
                        "top3_accuracy"
                    ],

                "context_top3":
                    result[
                        "contextual"
                    ][
                        "top3_accuracy"
                    ],

                "delta_top3":
                    result[
                        "row_delta"
                    ][
                        "top3_accuracy"
                    ],

                "baseline_group_accuracy":
                    result[
                        "baseline_group"
                    ][
                        "accuracy"
                    ],

                "context_group_accuracy":
                    result[
                        "contextual_group"
                    ][
                        "accuracy"
                    ],

                "delta_group_accuracy":
                    result[
                        "group_delta"
                    ][
                        "accuracy"
                    ],
            }
        )

    return pd.DataFrame(
        rows,
    )


# ============================================================
# MAIN
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Avalia estabilidade do ganho obtido por "
            "observation + equipment com peso 0.25."
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
        "--runs",
        type=int,
        default=DEFAULT_RUNS,
    )

    args = parser.parse_args()

    dataset_path = Path(
        args.dataset,
    ).resolve()

    output_dir = Path(
        args.output_dir,
    ).resolve()

    runs = int(
        args.runs,
    )

    if runs < 2:
        raise ValueError(
            "--runs deve ser pelo menos 2."
        )

    if not dataset_path.exists():
        raise FileNotFoundError(
            "Dataset não encontrado: "
            f"{dataset_path}"
        )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    print(
        "=" * 72
    )

    print(
        "EASY MAINTENANCE - CONTEXT V2.1 STABILITY TEST"
    )

    print(
        "=" * 72
    )

    print(
        f"Dataset: {dataset_path}"
    )

    print(
        f"Execuções: {runs}"
    )

    print(
        f"Peso equipamento: {EQUIPMENT_WEIGHT}"
    )

    print()

    dataframe = load_dataset(
        dataset_path,
    )

    print(
        f"Linhas: {len(dataframe)}"
    )

    print(
        "Observações únicas: "
        f"{dataframe['observation_norm'].nunique()}"
    )

    print(
        "Modos de falha: "
        f"{dataframe['classification_norm'].nunique()}"
    )

    print()

    # ========================================================
    # EXECUÇÕES
    # ========================================================

    results: list[
        dict[str, Any]
    ] = []

    for index in range(
        runs
    ):
        run_number = (
            index + 1
        )

        seed = (
            BASE_SEED
            +
            index
        )

        print(
            f"[{run_number:02}/{runs:02}] "
            f"seed={seed} ...",
            end=" ",
            flush=True,
        )

        result = run_experiment(
            dataframe=dataframe,
            seed=seed,
            run_number=run_number,
        )

        results.append(
            result,
        )

        baseline_accuracy = (
            result[
                "baseline"
            ][
                "accuracy"
            ]
        )

        contextual_accuracy = (
            result[
                "contextual"
            ][
                "accuracy"
            ]
        )

        delta = (
            result[
                "row_delta"
            ][
                "accuracy"
            ]
        )

        prefix = (
            "+"
            if delta >= 0
            else
            ""
        )

        print(
            "baseline="
            f"{baseline_accuracy:.4f} | "
            "context="
            f"{contextual_accuracy:.4f} | "
            "delta="
            f"{prefix}{delta:.4f}"
        )

    # ========================================================
    # RESUMO
    # ========================================================

    summary = build_summary(
        results,
    )

    runs_dataframe = build_runs_dataframe(
        results,
    )

    runs_path = (
        output_dir
        /
        "context_v2_1_stability_runs.csv"
    )

    summary_path = (
        output_dir
        /
        "context_v2_1_stability_summary.json"
    )

    runs_dataframe.to_csv(
        runs_path,
        index=False,
        encoding="utf-8-sig",
    )

    with summary_path.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            summary,
            file,
            ensure_ascii=False,
            indent=2,
        )

    # ========================================================
    # TERMINAL
    # ========================================================

    print()

    print(
        "=" * 72
    )

    print(
        "RESULTADO DE ESTABILIDADE V2.1"
    )

    print(
        "=" * 72
    )

    print()

    print(
        "Accuracy média:"
    )

    print(
        "  Baseline:   "
        f"{summary['baseline_accuracy_mean']:.4f}"
    )

    print(
        "  Contextual: "
        f"{summary['contextual_accuracy_mean']:.4f}"
    )

    print()

    print(
        "DELTA - NÍVEL DE LINHA"
    )

    for metric in [
        "accuracy",
        "macro_f1",
        "weighted_f1",
        "top3_accuracy",
    ]:
        info = (
            summary[
                "row_level_delta"
            ][
                metric
            ]
        )

        mean = float(
            info[
                "mean"
            ]
        )

        prefix = (
            "+"
            if mean >= 0
            else
            ""
        )

        print()

        print(
            f"  {metric}:"
        )

        print(
            "    Delta médio:        "
            f"{prefix}{mean:.4f}"
        )

        print(
            "    Mediana:            "
            f"{float(info['median']):+.4f}"
        )

        print(
            "    Desvio padrão:      "
            f"{float(info['std']):.4f}"
        )

        print(
            "    Mínimo:             "
            f"{float(info['minimum']):+.4f}"
        )

        print(
            "    Máximo:             "
            f"{float(info['maximum']):+.4f}"
        )

        print(
            "    Vitórias / empates / derrotas: "
            f"{info['wins']} / "
            f"{info['ties']} / "
            f"{info['losses']}"
        )

        print(
            "    Taxa de vitória:    "
            f"{float(info['win_rate_excluding_ties']) * 100:.1f}%"
        )

        p_value = info[
            "sign_test_p_value"
        ]

        print(
            "    Sign test p-value:  "
            f"{p_value}"
        )

    print()

    print(
        "DELTA - OBSERVAÇÕES ÚNICAS"
    )

    for metric in [
        "accuracy",
        "macro_f1",
        "weighted_f1",
    ]:
        info = (
            summary[
                "unique_observation_delta"
            ][
                metric
            ]
        )

        mean = float(
            info[
                "mean"
            ]
        )

        print(
            f"  {metric:18} "
            f"{mean:+.4f} | "
            f"wins={info['wins']} | "
            f"ties={info['ties']} | "
            f"losses={info['losses']}"
        )

    print()

    print(
        "Arquivos:"
    )

    print(
        f"  {runs_path}"
    )

    print(
        f"  {summary_path}"
    )

    print()

    print(
        "Observação: este é um repeated holdout no mesmo "
        "dataset histórico. Ele mede estabilidade interna, "
        "não substitui validação futura com novos apontamentos."
    )


if __name__ == "__main__":
    main()