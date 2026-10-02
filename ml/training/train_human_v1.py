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
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    top_k_accuracy_score,
)
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC


# ============================================================
# CONFIGURAÇÃO
# ============================================================

MODEL_VERSION = "failure_classifier_real_v1"
DATASET_VERSION = "human-dataset-v1"

DEFAULT_DATASET = (
    "ml/data/human/prepared/human_labels_v1.csv"
)

DEFAULT_MODEL_OUTPUT = (
    "ml/models/failure_classifier_real_v1.joblib"
)

DEFAULT_METRICS_OUTPUT = (
    "ml/models/failure_classifier_real_v1_metrics.json"
)

DEFAULT_SPLIT_OUTPUT = (
    "ml/data/human/prepared/human_split_v1.csv"
)

DEFAULT_PREDICTIONS_OUTPUT = (
    "ml/data/human/prepared/human_test_predictions_v1.csv"
)

TEST_RATIO = 0.20
RANDOM_SEED = 42


# ============================================================
# NORMALIZAÇÃO
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


# ============================================================
# HASH DETERMINÍSTICO
#
# Usado para escolher grupos de observações para teste.
# Assim o split é reproduzível.
# ============================================================

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


# ============================================================
# CARREGAMENTO
# ============================================================

def load_dataset(
    path: Path,
) -> pd.DataFrame:
    dataframe = pd.read_csv(
        path,
        dtype=str,
    )

    required_columns = {
        "row_id",
        "observation",
        "observation_norm",
        "classification",
        "classification_norm",
    }

    missing = (
        required_columns
        -
        set(
            dataframe.columns,
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
        dataframe[
            column
        ] = (
            dataframe[
                column
            ]
            .fillna(
                "",
            )
            .map(
                clean_string,
            )
        )

    dataframe = dataframe[
        (
            dataframe[
                "observation_norm"
            ]
            != ""
        )
        &
        (
            dataframe[
                "classification_norm"
            ]
            != ""
        )
    ].copy()

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

    dataframe.reset_index(
        drop=True,
        inplace=True,
    )

    return dataframe


# ============================================================
# REMOVER GRUPOS CONFLITANTES
#
# Uma mesma observação normalizada com mais de um rótulo
# não deve entrar no treino enquanto não houver decisão humana.
# ============================================================

def remove_conflicting_groups(
    dataframe: pd.DataFrame,
) -> tuple[
    pd.DataFrame,
    pd.DataFrame,
]:
    labels_per_observation = (
        dataframe.groupby(
            "observation_norm",
        )[
            "classification_norm"
        ]
        .nunique()
    )

    conflict_observations = set(
        labels_per_observation[
            labels_per_observation
            > 1
        ].index
    )

    conflicts = dataframe[
        dataframe[
            "observation_norm"
        ].isin(
            conflict_observations,
        )
    ].copy()

    clean = dataframe[
        ~dataframe[
            "observation_norm"
        ].isin(
            conflict_observations,
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
# TABELA DE GRUPOS
#
# Depois da remoção dos conflitos, cada observation_norm
# possui exatamente uma classification_norm.
# ============================================================

def build_group_table(
    dataframe: pd.DataFrame,
) -> pd.DataFrame:
    grouped = (
        dataframe.groupby(
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

    grouped[
        "hash"
    ] = grouped[
        "observation_norm"
    ].map(
        stable_hash,
    )

    return grouped


# ============================================================
# SPLIT POR OBSERVAÇÃO
#
# Regras:
#
# 1. Uma observação nunca aparece simultaneamente em treino/teste.
# 2. Classes com apenas um grupo de observação ficam somente no treino.
# 3. Para classes com >= 2 grupos, reservamos aproximadamente 20%
#    para teste.
# 4. Sempre deixamos pelo menos um grupo no treino.
# ============================================================

def create_group_split(
    dataframe: pd.DataFrame,
) -> pd.DataFrame:
    groups = build_group_table(
        dataframe,
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
        ordered = class_groups.sort_values(
            "hash",
            ascending=True,
        )

        group_count = len(
            ordered,
        )

        if (
            group_count
            < 2
        ):
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
            group_count
            - 1,
        )

        test_indices = (
            ordered
            .head(
                test_count,
            )
            .index
        )

        groups.loc[
            test_indices,
            "split",
        ] = "TEST"

    return groups


# ============================================================
# APLICAR SPLIT ÀS LINHAS
# ============================================================

def apply_split(
    dataframe: pd.DataFrame,
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

    result = dataframe.copy()

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


# ============================================================
# PIPELINE DE FEATURES
#
# Usaremos dois espaços TF-IDF:
#
# WORD:
# aprende palavras e combinações de palavras.
#
# CHAR:
# aprende padrões de caracteres, útil para:
# - erros de digitação;
# - abreviações;
# - variações ortográficas;
# - nomes técnicos.
# ============================================================

def build_vectorizer() -> FeatureUnion:
    word_vectorizer = TfidfVectorizer(
        analyzer="word",
        ngram_range=(
            1,
            2,
        ),
        min_df=1,
        max_df=1.0,
        sublinear_tf=True,
        strip_accents="unicode",
        lowercase=True,
        max_features=50000,
    )

    char_vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(
            3,
            5,
        ),
        min_df=1,
        max_df=1.0,
        sublinear_tf=True,
        strip_accents="unicode",
        lowercase=True,
        max_features=75000,
    )

    return FeatureUnion(
        [
            (
                "word",
                word_vectorizer,
            ),
            (
                "char",
                char_vectorizer,
            ),
        ]
    )


# ============================================================
# TOP-K PARA LINEARSVC
# ============================================================

def decision_scores(
    model: LinearSVC,
    features,
) -> np.ndarray:
    scores = model.decision_function(
        features,
    )

    scores = np.asarray(
        scores,
    )

    if (
        scores.ndim
        == 1
    ):
        scores = np.column_stack(
            [
                -scores,
                scores,
            ]
        )

    return scores


def top_k_predictions(
    scores: np.ndarray,
    classes: np.ndarray,
    k: int,
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
# MARGEM DE CONFIANÇA
#
# LinearSVC não fornece probabilidade calibrada.
#
# Por enquanto utilizamos:
#
# score_top1 - score_top2
#
# como indicador de separação.
#
# NÃO deve ser interpretado como probabilidade.
# ============================================================

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
        < 2
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


# ============================================================
# RETRIEVAL
#
# Usa o mesmo espaço vetorial TF-IDF.
#
# Para cada apontamento do teste, procura a observação
# de treino com maior similaridade cosseno.
# ============================================================

def evaluate_retrieval(
    train_features,
    test_features,
    train_labels: np.ndarray,
) -> tuple[
    np.ndarray,
    np.ndarray,
]:
    predicted_labels = []
    similarities = []

    batch_size = 128

    for start in range(
        0,
        test_features.shape[
            0
        ],
        batch_size,
    ):
        end = min(
            start
            +
            batch_size,
            test_features.shape[
                0
            ],
        )

        similarity_matrix = (
            cosine_similarity(
                test_features[
                    start:end
                ],
                train_features,
            )
        )

        best_indices = np.argmax(
            similarity_matrix,
            axis=1,
        )

        best_scores = np.max(
            similarity_matrix,
            axis=1,
        )

        predicted_labels.extend(
            train_labels[
                best_indices
            ].tolist()
        )

        similarities.extend(
            best_scores.tolist()
        )

    return (
        np.asarray(
            predicted_labels,
        ),
        np.asarray(
            similarities,
            dtype=float,
        ),
    )


# ============================================================
# MÉTRICAS DE COBERTURA
#
# Para o SVM usamos margem.
# Para retrieval usamos similaridade cosseno.
# ============================================================

def threshold_metrics(
    true_labels: np.ndarray,
    predicted_labels: np.ndarray,
    confidence: np.ndarray,
    thresholds: list[
        float
    ],
) -> list[
    dict[
        str,
        object,
    ]
]:
    rows = []

    total = len(
        true_labels,
    )

    for threshold in thresholds:
        mask = (
            confidence
            >=
            threshold
        )

        selected = int(
            mask.sum()
        )

        if (
            selected
            == 0
        ):
            accuracy = None
        else:
            accuracy = float(
                accuracy_score(
                    true_labels[
                        mask
                    ],
                    predicted_labels[
                        mask
                    ],
                )
            )

        coverage = (
            selected
            /
            total
            if total
            else 0.0
        )

        rows.append(
            {
                "threshold":
                    threshold,

                "selected":
                    selected,

                "total":
                    total,

                "coverage":
                    round(
                        coverage,
                        6,
                    ),

                "accuracy":
                    (
                        round(
                            accuracy,
                            6,
                        )
                        if accuracy
                        is not None
                        else None
                    ),
            }
        )

    return rows


# ============================================================
# MAIN
# ============================================================

def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Treina e avalia o primeiro "
            "classificador real de modos de falha."
        )
    )

    parser.add_argument(
        "--dataset",
        default=DEFAULT_DATASET,
        help="CSV preparado pelo prepare_human_taxonomy.py",
    )

    parser.add_argument(
        "--model-output",
        default=DEFAULT_MODEL_OUTPUT,
        help="Arquivo .joblib do modelo.",
    )

    parser.add_argument(
        "--metrics-output",
        default=DEFAULT_METRICS_OUTPUT,
        help="Arquivo JSON com métricas.",
    )

    parser.add_argument(
        "--split-output",
        default=DEFAULT_SPLIT_OUTPUT,
        help="CSV indicando TRAIN/TEST.",
    )

    parser.add_argument(
        "--predictions-output",
        default=DEFAULT_PREDICTIONS_OUTPUT,
        help="CSV com previsões do teste.",
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

    predictions_path = Path(
        args.predictions_output,
    ).resolve()

    if (
        not dataset_path.exists()
    ):
        raise FileNotFoundError(
            f"Dataset não encontrado: {dataset_path}"
        )

    model_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    metrics_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    split_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    predictions_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    print(
        "=" * 72
    )

    print(
        "EASY MAINTENANCE - FAILURE CLASSIFIER REAL V1"
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

    raw_dataset = load_dataset(
        dataset_path,
    )

    (
        dataset,
        conflict_rows,
    ) = remove_conflicting_groups(
        raw_dataset,
    )

    groups = create_group_split(
        dataset,
    )

    dataset = apply_split(
        dataset,
        groups,
    )

    train = dataset[
        dataset[
            "split"
        ]
        ==
        "TRAIN"
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
        test.empty
    ):
        raise RuntimeError(
            "O split gerou treino ou teste vazio."
        )

    # ========================================================
    # VERIFICAÇÃO DE VAZAMENTO
    # ========================================================

    train_observations = set(
        train[
            "observation_norm"
        ]
    )

    test_observations = set(
        test[
            "observation_norm"
        ]
    )

    leakage = (
        train_observations
        &
        test_observations
    )

    if leakage:
        raise RuntimeError(
            "Foi detectado vazamento de observações "
            "entre treino e teste."
        )

    # ========================================================
    # TEXTOS
    # ========================================================

    train_texts = train[
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

    test_labels = test[
        "classification_norm"
    ].to_numpy(
        dtype=str,
    )

    # ========================================================
    # TF-IDF
    # ========================================================

    print(
        "Gerando TF-IDF..."
    )

    vectorizer = build_vectorizer()

    train_features = vectorizer.fit_transform(
        train_texts,
    )

    test_features = vectorizer.transform(
        test_texts,
    )

    print(
        f"Features: {train_features.shape[1]}"
    )

    # ========================================================
    # MODELO ML
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

    ml_predictions = classifier.predict(
        test_features,
    )

    scores = decision_scores(
        classifier,
        test_features,
    )

    margins = prediction_margins(
        scores,
    )

    top3_predictions = top_k_predictions(
        scores,
        classifier.classes_,
        3,
    )

    # ========================================================
    # MÉTRICAS ML
    # ========================================================

    ml_accuracy = float(
        accuracy_score(
            test_labels,
            ml_predictions,
        )
    )

    ml_macro_f1 = float(
        f1_score(
            test_labels,
            ml_predictions,
            average="macro",
            zero_division=0,
        )
    )

    ml_weighted_f1 = float(
        f1_score(
            test_labels,
            ml_predictions,
            average="weighted",
            zero_division=0,
        )
    )

    ml_top3_accuracy = float(
        np.mean(
            [
                true_label
                in predictions
                for (
                    true_label,
                    predictions,
                )
                in zip(
                    test_labels,
                    top3_predictions,
                )
            ]
        )
    )

    # ========================================================
    # RETRIEVAL
    # ========================================================

    print()
    print(
        "Avaliando retrieval por similaridade..."
    )

    (
        retrieval_predictions,
        retrieval_similarity,
    ) = evaluate_retrieval(
        train_features,
        test_features,
        train_labels,
    )

    retrieval_accuracy = float(
        accuracy_score(
            test_labels,
            retrieval_predictions,
        )
    )

    retrieval_macro_f1 = float(
        f1_score(
            test_labels,
            retrieval_predictions,
            average="macro",
            zero_division=0,
        )
    )

    retrieval_weighted_f1 = float(
        f1_score(
            test_labels,
            retrieval_predictions,
            average="weighted",
            zero_division=0,
        )
    )

    # ========================================================
    # COVERAGE / HIGH CONFIDENCE
    # ========================================================

    ml_thresholds = threshold_metrics(
        true_labels=test_labels,
        predicted_labels=ml_predictions,
        confidence=margins,
        thresholds=[
            0.10,
            0.20,
            0.30,
            0.40,
            0.50,
            0.75,
            1.00,
        ],
    )

    retrieval_thresholds = threshold_metrics(
        true_labels=test_labels,
        predicted_labels=retrieval_predictions,
        confidence=retrieval_similarity,
        thresholds=[
            0.30,
            0.40,
            0.50,
            0.60,
            0.70,
            0.80,
            0.90,
        ],
    )

    # ========================================================
    # CLASSIFICATION REPORT
    # ========================================================

    report = classification_report(
        test_labels,
        ml_predictions,
        output_dict=True,
        zero_division=0,
    )

    # ========================================================
    # SALVAR SPLIT
    # ========================================================

    split_columns = [
        "row_id",
        "observation",
        "observation_norm",
        "classification",
        "classification_norm",
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
    # PREVISÕES
    # ========================================================

    predictions_dataframe = test[
        [
            "row_id",
            "observation",
            "observation_norm",
            "classification",
            "classification_norm",
        ]
    ].copy()

    predictions_dataframe[
        "ml_prediction"
    ] = ml_predictions

    predictions_dataframe[
        "ml_correct"
    ] = (
        predictions_dataframe[
            "classification_norm"
        ].to_numpy()
        ==
        ml_predictions
    )

    predictions_dataframe[
        "ml_margin"
    ] = margins

    predictions_dataframe[
        "ml_top3"
    ] = [
        " | ".join(
            predictions,
        )
        for predictions
        in top3_predictions
    ]

    predictions_dataframe[
        "retrieval_prediction"
    ] = retrieval_predictions

    predictions_dataframe[
        "retrieval_correct"
    ] = (
        predictions_dataframe[
            "classification_norm"
        ].to_numpy()
        ==
        retrieval_predictions
    )

    predictions_dataframe[
        "retrieval_similarity"
    ] = retrieval_similarity

    predictions_dataframe.to_csv(
        predictions_path,
        index=False,
        encoding="utf-8-sig",
    )

    # ========================================================
    # SALVAR MODELO
    # ========================================================

    artifact = {
        "model_version":
            MODEL_VERSION,

        "dataset_version":
            DATASET_VERSION,

        "text_fields": [
            "observation",
        ],

        "vectorizer":
            vectorizer,

        "classifier":
            classifier,

        "classes":
            classifier.classes_,

        "split_strategy":
            (
                "grouped_by_normalized_observation"
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

    train_group_count = int(
        train[
            "observation_norm"
        ].nunique()
    )

    test_group_count = int(
        test[
            "observation_norm"
        ].nunique()
    )

    metrics = {
        "model_version":
            MODEL_VERSION,

        "dataset_version":
            DATASET_VERSION,

        "split_strategy":
            (
                "grouped_by_normalized_observation"
            ),

        "random_seed":
            RANDOM_SEED,

        "dataset": {
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

            "test_rows":
                int(
                    len(
                        test,
                    )
                ),

            "train_observation_groups":
                train_group_count,

            "test_observation_groups":
                test_group_count,

            "train_classes":
                int(
                    train[
                        "classification_norm"
                    ].nunique()
                ),

            "test_classes":
                int(
                    test[
                        "classification_norm"
                    ].nunique()
                ),

            "feature_count":
                int(
                    train_features.shape[
                        1
                    ]
                ),

            "observation_leakage_groups":
                int(
                    len(
                        leakage,
                    )
                ),
        },

        "ml": {
            "algorithm":
                "TFIDF_WORD_CHAR_LINEAR_SVC",

            "accuracy":
                round(
                    ml_accuracy,
                    6,
                ),

            "macro_f1":
                round(
                    ml_macro_f1,
                    6,
                ),

            "weighted_f1":
                round(
                    ml_weighted_f1,
                    6,
                ),

            "top3_accuracy":
                round(
                    ml_top3_accuracy,
                    6,
                ),

            "margin_thresholds":
                ml_thresholds,
        },

        "retrieval": {
            "algorithm":
                "TFIDF_COSINE_NEAREST_EXAMPLE",

            "accuracy":
                round(
                    retrieval_accuracy,
                    6,
                ),

            "macro_f1":
                round(
                    retrieval_macro_f1,
                    6,
                ),

            "weighted_f1":
                round(
                    retrieval_weighted_f1,
                    6,
                ),

            "similarity_thresholds":
                retrieval_thresholds,
        },

        "classification_report":
            report,
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
        "=" * 72
    )

    print(
        "RESULTADOS"
    )

    print(
        "=" * 72
    )

    print()
    print(
        "Dataset:"
    )

    print(
        f"  Linhas originais:        "
        f"{len(raw_dataset)}"
    )

    print(
        f"  Linhas conflitantes:     "
        f"{len(conflict_rows)}"
    )

    print(
        f"  Linhas utilizáveis:      "
        f"{len(dataset)}"
    )

    print(
        f"  Treino:                  "
        f"{len(train)}"
    )

    print(
        f"  Teste:                   "
        f"{len(test)}"
    )

    print(
        f"  Grupos treino:           "
        f"{train_group_count}"
    )

    print(
        f"  Grupos teste:            "
        f"{test_group_count}"
    )

    print(
        f"  Vazamento treino/teste:  "
        f"{len(leakage)}"
    )

    print()
    print(
        "Modelo supervisionado:"
    )

    print(
        f"  Accuracy:                "
        f"{ml_accuracy:.4f}"
    )

    print(
        f"  Macro F1:                "
        f"{ml_macro_f1:.4f}"
    )

    print(
        f"  Weighted F1:             "
        f"{ml_weighted_f1:.4f}"
    )

    print(
        f"  Top-3 accuracy:          "
        f"{ml_top3_accuracy:.4f}"
    )

    print()
    print(
        "Retrieval:"
    )

    print(
        f"  Accuracy:                "
        f"{retrieval_accuracy:.4f}"
    )

    print(
        f"  Macro F1:                "
        f"{retrieval_macro_f1:.4f}"
    )

    print(
        f"  Weighted F1:             "
        f"{retrieval_weighted_f1:.4f}"
    )

    print()
    print(
        "Modelo salvo em:"
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
        "Previsões de teste:"
    )

    print(
        f"  {predictions_path}"
    )


if __name__ == "__main__":
    main()