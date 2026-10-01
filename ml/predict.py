from __future__ import annotations

import argparse
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

import joblib

from ml.hybrid_classifier import classify_event


# ============================================================
# PATHS
# ============================================================

CURRENT_FILE = Path(
    __file__
).resolve()

ML_DIR = (
    CURRENT_FILE.parent
)

MODEL_PATH = (
    ML_DIR
    / "models"
    / "failure_classifier_v0.joblib"
)


# ============================================================
# NORMALIZAÇÃO
# ============================================================

def normalize(
    value: str,
) -> str:
    """
    Normalização usada pelo modelo ML v0.

    IMPORTANTE:
    esta função deve permanecer compatível com o tratamento
    usado durante o treinamento do modelo.
    """

    text = (
        value
        .strip()
        .lower()
    )

    text = unicodedata.normalize(
        "NFKD",
        text,
    )

    text = "".join(
        character
        for character in text
        if not unicodedata.combining(
            character
        )
    )

    text = re.sub(
        r"[^a-z0-9\s]",
        " ",
        text,
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


# ============================================================
# INPUT DO MODELO
# ============================================================

def build_text(
    observation: str,
    equipment: str = "",
    stop_key_1: str = "",
    stop_subkey: str = "",
    stop_type: str = "",
) -> str:
    """
    Constrói exatamente o texto que será entregue ao pipeline ML.

    Os prefixos ajudam o modelo a diferenciar a origem de cada
    informação.
    """

    fields = [
        (
            "obs",
            observation,
        ),
        (
            "eq",
            equipment,
        ),
        (
            "k1",
            stop_key_1,
        ),
        (
            "sk",
            stop_subkey,
        ),
        (
            "st",
            stop_type,
        ),
    ]

    parts: list[str] = []

    for prefix, value in fields:
        normalized = normalize(
            value
        )

        if normalized:
            parts.append(
                f"{prefix} "
                f"{normalized}"
            )

    return " ".join(
        parts
    )


# ============================================================
# CARREGAMENTO DO MODELO
# ============================================================

@lru_cache(
    maxsize=1,
)
def load_model_package() -> dict[str, Any]:
    """
    Carrega o modelo apenas uma vez por processo.

    Isso evita executar joblib.load() em toda classificação.
    """

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            "Modelo não encontrado. "
            "Execute primeiro:\n"
            "python "
            ".\\ml\\training\\train.py"
        )

    package = joblib.load(
        MODEL_PATH
    )

    if (
        "model"
        not in package
    ):
        raise ValueError(
            "O arquivo do modelo não possui a chave 'model'."
        )

    if (
        "failure_mode_labels"
        not in package
    ):
        raise ValueError(
            "O arquivo do modelo não possui "
            "a chave 'failure_mode_labels'."
        )

    return package


# ============================================================
# AUXILIARES
# ============================================================

def first_text(
    event: Mapping[str, Any],
    *keys: str,
) -> str:
    """
    Busca a primeira representação textual válida dentre
    diferentes nomes possíveis do mesmo campo.
    """

    for key in keys:
        value = event.get(
            key
        )

        if value is None:
            continue

        text = str(
            value
        ).strip()

        if text:
            return text

    return ""


# ============================================================
# MODELO ML PURO
# ============================================================

def predict_with_current_model(
    event: Mapping[str, Any],
) -> dict[str, Any]:
    """
    Executa SOMENTE o modelo ML v0.

    Esta função é usada como fallback pelo classificador híbrido.

    Não aplica regras semânticas.
    """

    package = (
        load_model_package()
    )

    model = (
        package["model"]
    )

    labels = (
        package[
            "failure_mode_labels"
        ]
    )

    observation = first_text(
        event,
        "observation",
        "occurrence",
        "ocorrencia",
        "description",
        "descricao",
    )

    equipment = first_text(
        event,
        "equipment",
        "source_equipment_name",
        "equipment_name",
        "equipamento",
    )

    stop_key_1 = first_text(
        event,
        "stop_key_1",
        "source_stop_key_1",
        "chave_1",
    )

    stop_subkey = first_text(
        event,
        "stop_subkey",
        "source_stop_subkey",
        "subchave",
    )

    stop_type = first_text(
        event,
        "stop_type",
        "source_stop_type",
        "tipo_parada",
    )

    if not observation:
        raise ValueError(
            "Informe uma ocorrência para realizar a classificação."
        )

    text = build_text(
        observation=observation,
        equipment=equipment,
        stop_key_1=stop_key_1,
        stop_subkey=stop_subkey,
        stop_type=stop_type,
    )

    prediction = (
        model.predict(
            [
                text
            ]
        )[0]
    )

    probabilities = (
        model.predict_proba(
            [
                text
            ]
        )[0]
    )

    classes = (
        model
        .named_steps[
            "classifier"
        ]
        .classes_
    )

    ranked = sorted(
        zip(
            classes,
            probabilities,
        ),
        key=lambda item:
            item[1],
        reverse=True,
    )

    confidence = float(
        ranked[0][1]
    )

    failure_mode = (
        labels[
            prediction
        ]
    )

    top_predictions: list[
        dict[str, Any]
    ] = []

    for (
        component,
        probability,
    ) in ranked[:5]:
        top_predictions.append(
            {
                "failed_component_code":
                    str(
                        component
                    ),

                "failure_mode":
                    str(
                        labels[
                            component
                        ]
                    ),

                "confidence":
                    float(
                        probability
                    ),
            }
        )

    return {
        "failed_component_code":
            str(
                prediction
            ),

        "failure_mode":
            str(
                failure_mode
            ),

        "confidence":
            confidence,

        "top_predictions":
            top_predictions,

        "decision_source":
            "ML",
    }


# ============================================================
# CLASSIFICADOR HÍBRIDO
# ============================================================

def predict_event(
    observation: str,
    equipment: str = "",
    stop_key_1: str = "",
    stop_subkey: str = "",
    stop_type: str = "",
    line: str = "",
) -> dict[str, Any]:
    """
    Classificação oficial do pipeline.

    Primeiro tenta uma regra semântica inequívoca.
    Caso nenhuma regra seja aplicável, utiliza o modelo ML v0.
    """

    event = {
        "observation":
            observation,

        "equipment":
            equipment,

        "stop_key_1":
            stop_key_1,

        "stop_subkey":
            stop_subkey,

        "stop_type":
            stop_type,

        "line":
            line,
    }

    return classify_event(
        event=event,
        ml_predictor=
            predict_with_current_model,
    )


# ============================================================
# SAÍDA DE CONSOLE
# ============================================================

def print_prediction(
    result: Mapping[str, Any],
    observation: str,
    equipment: str = "",
) -> None:
    """
    Exibição utilizada somente pelo CLI de desenvolvimento.
    """

    failure_mode = str(
        result.get(
            "failure_mode",
            "Não classificado",
        )
    )

    failed_component_code = str(
        result.get(
            "failed_component_code",
            "-",
        )
    )

    confidence = float(
        result.get(
            "confidence",
            0,
        )
        or 0
    )

    decision_source = str(
        result.get(
            "decision_source",
            "ML",
        )
    )

    print()

    print(
        "=" * 70
    )

    print(
        "EASY MAINTENANCE - CLASSIFICAÇÃO"
    )

    print(
        "=" * 70
    )

    print(
        "Ocorrência:"
    )

    print(
        observation
    )

    if equipment:
        print()

        print(
            "Equipamento:"
        )

        print(
            equipment
        )

    print()

    print(
        "Resultado:"
    )

    print(
        failure_mode
    )

    print()

    print(
        "Componente:"
    )

    print(
        failed_component_code
    )

    print()

    print(
        f"Confiança: "
        f"{confidence * 100:.2f}%"
    )

    print()

    if (
        decision_source
        == "RULE"
    ):
        print(
            "Decisão:"
        )

        print(
            "Regra semântica de alta confiança"
        )

        rule_id = (
            result.get(
                "rule_id"
            )
        )

        if rule_id:
            print(
                f"Regra: "
                f"{rule_id}"
            )

    else:
        print(
            "Decisão:"
        )

        print(
            "Modelo ML"
        )

        top_predictions = (
            result.get(
                "top_predictions"
            )
        )

        if isinstance(
            top_predictions,
            list,
        ):
            print()

            print(
                "Top 5:"
            )

            for item in (
                top_predictions[:5]
            ):
                if not isinstance(
                    item,
                    Mapping,
                ):
                    continue

                label = str(
                    item.get(
                        "failure_mode",
                        "-",
                    )
                )

                probability = float(
                    item.get(
                        "confidence",
                        0,
                    )
                    or 0
                )

                print(
                    f"  "
                    f"{label:<38} "
                    f"{probability * 100:>6.2f}%"
                )

    print()

    print(
        "Status: classificação automática."
    )

    print(
        "=" * 70
    )


# ============================================================
# FUNÇÃO COMPATÍVEL COM O CLI ANTIGO
# ============================================================

def predict(
    observation: str,
    equipment: str = "",
    stop_key_1: str = "",
    stop_subkey: str = "",
    stop_type: str = "",
    line: str = "",
) -> dict[str, Any]:
    """
    Mantém uma função `predict()` pública como existia anteriormente.

    Agora ela utiliza o pipeline híbrido.
    """

    result = predict_event(
        observation=observation,
        equipment=equipment,
        stop_key_1=stop_key_1,
        stop_subkey=stop_subkey,
        stop_type=stop_type,
        line=line,
    )

    print_prediction(
        result=result,
        observation=observation,
        equipment=equipment,
    )

    return result


# ============================================================
# CLI
# ============================================================

def main() -> None:
    parser = (
        argparse.ArgumentParser(
            description=(
                "Classificador de modos de falha "
                "do Easy Maintenance."
            )
        )
    )

    parser.add_argument(
        "observation",
        nargs="?",
        help=(
            "Descrição da ocorrência."
        ),
    )

    parser.add_argument(
        "--equipment",
        default="",
        help=(
            "Nome do equipamento."
        ),
    )

    parser.add_argument(
        "--stop-key-1",
        default="",
        help=(
            "Chave 1 da parada."
        ),
    )

    parser.add_argument(
        "--stop-subkey",
        default="",
        help=(
            "Subchave da parada."
        ),
    )

    parser.add_argument(
        "--stop-type",
        default="",
        help=(
            "Tipo de parada."
        ),
    )

    parser.add_argument(
        "--line",
        default="",
        help=(
            "Linha de produção."
        ),
    )

    args = (
        parser.parse_args()
    )

    observation = (
        args.observation
    )

    if not observation:
        observation = input(
            "Ocorrência: "
        ).strip()

    if not observation:
        raise ValueError(
            "Informe uma ocorrência."
        )

    predict(
        observation=
            observation,

        equipment=
            args.equipment,

        stop_key_1=
            args.stop_key_1,

        stop_subkey=
            args.stop_subkey,

        stop_type=
            args.stop_type,

        line=
            args.line,
    )


if __name__ == "__main__":
    main()