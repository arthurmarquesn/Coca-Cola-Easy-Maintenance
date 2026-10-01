from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd


DEFAULT_PREDICTIONS = Path("ml/data/origin/origin_test_predictions_v1.csv")
DEFAULT_SPLIT = Path("ml/data/origin/origin_split_v1.csv")
DEFAULT_OUTPUT = Path("ml/reports/origin_v1_error_analysis.json")
TEXT_COLUMNS = ("observation", "stop_key_1", "stop_subkey", "failure_mode")
STRUCTURED_COLUMNS = ("equipment", "stop_key_1", "stop_subkey", "failed_component_code", "failure_mode")
STOPWORDS = {
    "a", "ao", "apos", "as", "com", "da", "de", "do", "durante", "e", "em",
    "foi", "na", "nao", "no", "o", "os", "para", "por", "um", "uma",
}


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def tokens(frame: pd.DataFrame) -> Counter[str]:
    counter: Counter[str] = Counter()
    for column in TEXT_COLUMNS:
        for value in frame[column].fillna(""):
            counter.update(token for token in normalize(value).split() if len(token) > 2 and token not in STOPWORDS)
    return counter


def majority_mapping_accuracy(train: pd.DataFrame, test: pd.DataFrame, column: str) -> dict[str, Any]:
    mapping = (
        train.groupby(column)["failure_origin"]
        .agg(lambda values: values.value_counts().index[0])
        .to_dict()
    )
    known = test[column].isin(mapping)
    predictions = test[column].map(mapping)
    accuracy = float((predictions[known] == test.loc[known, "failure_origin"]).mean()) if known.any() else None
    return {
        "known_test_coverage": round(float(known.mean()), 6),
        "majority_train_accuracy_on_known_test": None if accuracy is None else round(accuracy, 6),
        "train_value_label_dominance": {
            str(value): round(float(group["failure_origin"].value_counts(normalize=True).max()), 6)
            for value, group in train.groupby(column)
        },
    }


def jaccard(left: set[str], right: set[str]) -> float:
    union = left | right
    return len(left & right) / len(union) if union else 0.0


def analyze(predictions_path: Path, split_path: Path) -> dict[str, Any]:
    predictions = pd.read_csv(predictions_path)
    split = pd.read_csv(split_path)
    train = split.loc[split["split"] == "TRAIN"].copy()
    test = predictions.copy()

    train_scenarios: dict[str, set[str]] = {}
    for scenario_id, group in train.groupby("scenario_id"):
        train_scenarios[str(scenario_id)] = set(tokens(group))

    scenario_reports: list[dict[str, Any]] = []
    for scenario_id, group in test.groupby("scenario_id", sort=True):
        real = str(group["failure_origin"].iloc[0])
        predicted_counts = group["prediction"].value_counts()
        scenario_terms = tokens(group)
        scenario_set = set(scenario_terms)
        nearest = sorted(
            (
                {
                    "scenario_id": candidate,
                    "similarity": round(jaccard(scenario_set, candidate_terms), 6),
                    "origin": str(train.loc[train["scenario_id"] == candidate, "failure_origin"].iloc[0]),
                }
                for candidate, candidate_terms in train_scenarios.items()
            ),
            key=lambda item: (-item["similarity"], item["scenario_id"]),
        )[:3]
        opposite_terms = tokens(train.loc[train["failure_origin"] != real])
        inducing = [term for term, _ in scenario_terms.most_common() if opposite_terms[term] > 0][:12]
        scenario_reports.append(
            {
                "scenario_id": str(scenario_id),
                "real_origin": real,
                "majority_prediction": str(predicted_counts.index[0]),
                "prediction_counts": {str(k): int(v) for k, v in predicted_counts.items()},
                "accuracy": round(float(group["correct"].mean()), 6),
                "mean_confidence": round(float(group["confidence"].mean()), 6),
                "component": str(group["failed_component_code"].iloc[0]),
                "failure_mode": str(group["failure_mode"].iloc[0]),
                "top_context_terms": [term for term, _ in scenario_terms.most_common(15)],
                "terms_seen_in_opposite_class_train": inducing,
                "nearest_train_scenarios": nearest,
            }
        )

    train_by_origin = {origin: tokens(group) for origin, group in train.groupby("failure_origin")}
    test_by_origin = {origin: tokens(group) for origin, group in test.groupby("failure_origin")}
    missing: dict[str, list[str]] = {}
    for origin, test_terms in test_by_origin.items():
        unseen = [(term, count) for term, count in test_terms.items() if train_by_origin[origin][term] == 0]
        missing[origin] = [term for term, _ in sorted(unseen, key=lambda item: (-item[1], item[0]))[:30]]

    shared_terms = sorted(
        set(train_by_origin.get("MANUTENCAO", Counter())) & set(train_by_origin.get("OPERACAO", Counter())),
        key=lambda term: (
            -(train_by_origin["MANUTENCAO"][term] + train_by_origin["OPERACAO"][term]),
            term,
        ),
    )[:40]

    report = {
        "dataset": {
            "test_rows": int(len(test)),
            "test_scenarios": int(test["scenario_id"].nunique()),
            "train_rows": int(len(train)),
            "train_scenarios": int(train["scenario_id"].nunique()),
        },
        "test_scenarios": scenario_reports,
        "shortcut_checks": {
            column: majority_mapping_accuracy(train, test, column) for column in STRUCTURED_COLUMNS
        },
        "causal_terms_absent_from_same_class_train": missing,
        "semantic_conflicts_terms_shared_between_classes": shared_terms,
        "inferred_causal_gap_analysis": {
            "note": (
                "A V1 não possui causal_family; as famílias abaixo são inferidas das observações "
                "e devem ser tratadas como diagnóstico qualitativo."
            ),
            "maintenance_test_gaps": [
                "SIGNAL_FAILURE / cabo danificado no SENSOR aparece apenas no holdout avaliado.",
                "PNEUMATIC_FAILURE e SEAL_FAILURE do CILINDRO não transferiram de outros componentes.",
                "MECHANICAL_WEAR, RUPTURE e falha do tensionador da CORREIA não transferiram do treino.",
            ],
            "operation_transfer_gaps": [
                "BAD_ADJUSTMENT e BAD_SETUP existiam em outros componentes, mas não generalizaram para BOCAL.",
                "BAD_ADJUSTMENT, WRONG_PARAMETER e FORMAT_CHANGE_ERROR transferiram apenas parcialmente para VALVULA.",
                "WRONG_PARAMETER / WRONG_REFERENCE transferiram bem para SERVO, o único cenário perfeito.",
            ],
        },
        "semantic_conflict_analysis": [
            "Sintomas como fora de posição, sem atuação, sobrecarga e travamento podem pertencer às duas classes; a causa precisa estar explícita.",
            "Tokens genéricos como falha, parada, produção e o nome do componente aparecem nas duas classes e diluem a evidência causal.",
            "Cada failure_mode é essencialmente o nome do componente; no teste, o baseline por componente/failure_mode aprendido no treino acerta 0% dos casos conhecidos.",
        ],
        "conclusion": (
            "A V1 tem poucas unidades causais independentes. O holdout por scenario expõe forte "
            "dependência de contexto/componente: três cenários de MANUTENCAO têm accuracy zero. "
            "Campos estruturados repetidos e termos compartilhados entre classes podem superar a "
            "evidência causal da observação. A V2 deve cruzar cada família por vários componentes, "
            "balancear metadados e incluir pares mínimos com o mesmo sintoma e causas opostas."
        ),
    }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Diagnostica erros do classificador de origem V1.")
    parser.add_argument("--predictions", type=Path, default=DEFAULT_PREDICTIONS)
    parser.add_argument("--split", type=Path, default=DEFAULT_SPLIT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    report = analyze(args.predictions, args.split)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\nRelatório salvo em: {args.output}")


if __name__ == "__main__":
    main()
