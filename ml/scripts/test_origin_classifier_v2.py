from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np


# ============================================================
# CONFIGURAÇÃO
# ============================================================

MODEL_PATH = Path(
    "ml/models/failure_origin_classifier_v2_eval.joblib"
)

DEFAULT_HIGH_CONFIDENCE_THRESHOLD = 0.75


# ============================================================
# TEST CASE
# ============================================================

@dataclass(frozen=True)
class TestCase:
    text: str
    expected: str | None
    group: str


# ============================================================
# CASOS
#
# expected=None significa:
# caso propositalmente ambíguo.
#
# Não entra no cálculo de accuracy.
# ============================================================

TEST_CASES = [

    # --------------------------------------------------------
    # MANUTENÇÃO — EXPLÍCITOS
    # --------------------------------------------------------

    TestCase(
        text="motor queimado durante produção",
        expected="MANUTENCAO",
        group="explicit",
    ),

    TestCase(
        text="rolamento travado no eixo do motor",
        expected="MANUTENCAO",
        group="explicit",
    ),

    TestCase(
        text="correia rompeu durante funcionamento",
        expected="MANUTENCAO",
        group="explicit",
    ),

    TestCase(
        text="válvula não atuou por bobina queimada",
        expected="MANUTENCAO",
        group="explicit",
    ),

    TestCase(
        text="sensor sem sinal devido cabo rompido",
        expected="MANUTENCAO",
        group="explicit",
    ),

    TestCase(
        text="cilindro pneumático com vazamento na vedação",
        expected="MANUTENCAO",
        group="explicit",
    ),

    TestCase(
        text="estrela fora de posição devido folga no eixo",
        expected="MANUTENCAO",
        group="hard_negative",
    ),

    TestCase(
        text="motor em sobrecarga devido rolamento travado",
        expected="MANUTENCAO",
        group="hard_negative",
    ),

    TestCase(
        text="garrafa presa porque a guia quebrou",
        expected="MANUTENCAO",
        group="hard_negative",
    ),

    TestCase(
        text="sensor desalinhado devido suporte com folga",
        expected="MANUTENCAO",
        group="hard_negative",
    ),

    # --------------------------------------------------------
    # OPERAÇÃO — EXPLÍCITOS
    # --------------------------------------------------------

    TestCase(
        text="setup incorreto após troca de formato",
        expected="OPERACAO",
        group="explicit",
    ),

    TestCase(
        text="produto fora de posição na entrada da máquina",
        expected="OPERACAO",
        group="explicit",
    ),

    TestCase(
        text="parâmetro incorreto carregado na receita",
        expected="OPERACAO",
        group="explicit",
    ),

    TestCase(
        text="excesso de produto provocou acúmulo na esteira",
        expected="OPERACAO",
        group="explicit",
    ),

    TestCase(
        text="guia regulada muito fechada para o formato",
        expected="OPERACAO",
        group="explicit",
    ),

    TestCase(
        text="estrela fora de posição após troca de formato",
        expected="OPERACAO",
        group="hard_negative",
    ),

    TestCase(
        text="motor em sobrecarga devido excesso de produto",
        expected="OPERACAO",
        group="hard_negative",
    ),

    TestCase(
        text="garrafa presa devido regulagem incorreta da guia",
        expected="OPERACAO",
        group="hard_negative",
    ),

    TestCase(
        text="sensor desalinhado após ajuste no setup",
        expected="OPERACAO",
        group="hard_negative",
    ),

    TestCase(
        text="válvula não atuou devido parâmetro incorreto da receita",
        expected="OPERACAO",
        group="hard_negative",
    ),

    # --------------------------------------------------------
    # ESCRITA REALISTA / ABREVIADA
    # --------------------------------------------------------

    TestCase(
        text="sens s sinal cabo rompido",
        expected="MANUTENCAO",
        group="noisy",
    ),

    TestCase(
        text="mot queimou maq parada",
        expected="MANUTENCAO",
        group="noisy",
    ),

    TestCase(
        text="corr rompida transp parado",
        expected="MANUTENCAO",
        group="noisy",
    ),

    TestCase(
        text="reg guia fora p formato",
        expected="OPERACAO",
        group="noisy",
    ),

    TestCase(
        text="prod acum entrada maq",
        expected="OPERACAO",
        group="noisy",
    ),

    TestCase(
        text="param receita errado apos setup",
        expected="OPERACAO",
        group="noisy",
    ),

    # --------------------------------------------------------
    # SINÔNIMOS / FRASES MENOS PARECIDAS COM O SINTÉTICO
    # --------------------------------------------------------

    TestCase(
        text="conector oxidado provocando intermitência no sensor",
        expected="MANUTENCAO",
        group="novel_vocabulary",
    ),

    TestCase(
        text="fadiga mecânica provocou ruptura do suporte",
        expected="MANUTENCAO",
        group="novel_vocabulary",
    ),

    TestCase(
        text="sequenciamento inadequado provocou parada da linha",
        expected="OPERACAO",
        group="novel_vocabulary",
    ),

    TestCase(
        text="produto represado na alimentação da máquina",
        expected="OPERACAO",
        group="novel_vocabulary",
    ),

    # --------------------------------------------------------
    # AMBÍGUOS
    #
    # Aqui NÃO exigimos classe específica.
    # Queremos observar confiança.
    # --------------------------------------------------------

    TestCase(
        text="sensor fora de posição",
        expected=None,
        group="ambiguous",
    ),

    TestCase(
        text="válvula não atuou",
        expected=None,
        group="ambiguous",
    ),

    TestCase(
        text="motor em sobrecarga",
        expected=None,
        group="ambiguous",
    ),

    TestCase(
        text="estrela fora de posição",
        expected=None,
        group="ambiguous",
    ),

    TestCase(
        text="máquina parou durante produção",
        expected=None,
        group="ambiguous",
    ),
]


# ============================================================
# CARREGAMENTO
# ============================================================

def load_artifact():

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Modelo não encontrado: {MODEL_PATH.resolve()}"
        )

    artifact = joblib.load(
        MODEL_PATH
    )

    if isinstance(
        artifact,
        dict,
    ):

        model = (
            artifact.get(
                "model"
            )
            or
            artifact.get(
                "classifier"
            )
        )

        threshold = float(
            artifact.get(
                "high_confidence_threshold",
                DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
            )
        )

        model_version = str(
            artifact.get(
                "model_version",
                "unknown",
            )
        )

    else:

        model = artifact

        threshold = (
            DEFAULT_HIGH_CONFIDENCE_THRESHOLD
        )

        model_version = (
            "unknown"
        )

    if model is None:
        raise RuntimeError(
            "O artefato foi carregado, "
            "mas nenhum modelo foi encontrado."
        )

    if not hasattr(
        model,
        "predict",
    ):
        raise RuntimeError(
            "O objeto carregado não possui predict()."
        )

    if not hasattr(
        model,
        "predict_proba",
    ):
        raise RuntimeError(
            "O modelo não possui predict_proba(). "
            "Era esperado um classificador calibrado."
        )

    return (
        artifact,
        model,
        threshold,
        model_version,
    )


# ============================================================
# MAIN
# ============================================================

def main() -> None:

    (
        artifact,
        model,
        threshold,
        model_version,
    ) = load_artifact()

    print(
        "=" * 78
    )

    print(
        "EASY MAINTENANCE - TESTE RUNTIME ORIGIN CLASSIFIER V2"
    )

    print(
        "=" * 78
    )

    print()

    print(
        f"Modelo: {MODEL_PATH.resolve()}"
    )

    print(
        f"Versão: {model_version}"
    )

    print(
        f"Threshold alta confiança: {threshold:.4f}"
    )

    if isinstance(
        artifact,
        dict,
    ):

        print()

        print(
            "Chaves do artefato:"
        )

        for key in sorted(
            artifact.keys()
        ):
            print(
                f"  - {key}"
            )

    print()

    texts = [
        case.text
        for case
        in TEST_CASES
    ]

    predictions = (
        model.predict(
            texts
        )
    )

    probabilities = (
        model.predict_proba(
            texts
        )
    )

    classes = [
        str(
            value
        )
        for value
        in model.classes_
    ]

    print(
        "Classes:"
    )

    for class_name in classes:
        print(
            f"  - {class_name}"
        )

    print()

    if set(
        classes
    ) != {
        "MANUTENCAO",
        "OPERACAO",
    }:
        raise RuntimeError(
            "Classes inesperadas no modelo: "
            f"{classes}"
        )

    # --------------------------------------------------------
    # RESULTADOS
    # --------------------------------------------------------

    correct = 0
    evaluated = 0

    group_stats: dict[
        str,
        dict[
            str,
            list[float] | int
        ],
    ] = {}

    print(
        "=" * 78
    )

    print(
        "PREDIÇÕES"
    )

    print(
        "=" * 78
    )

    for (
        index,
        case,
    ) in enumerate(
        TEST_CASES
    ):

        prediction = str(
            predictions[
                index
            ]
        )

        row_probabilities = (
            probabilities[
                index
            ]
        )

        confidence = float(
            np.max(
                row_probabilities
            )
        )

        probability_map = {
            classes[
                class_index
            ]:
                float(
                    probability
                )

            for (
                class_index,
                probability,
            ) in enumerate(
                row_probabilities
            )
        }

        high_confidence = (
            confidence
            >=
            threshold
        )

        if (
            case.expected
            is None
        ):
            result_text = (
                "AMBÍGUO"
            )

        else:

            evaluated += 1

            is_correct = (
                prediction
                ==
                case.expected
            )

            if is_correct:
                correct += 1

            result_text = (
                "OK"
                if is_correct
                else
                "ERRO"
            )

        stats = (
            group_stats.setdefault(
                case.group,
                {
                    "total": 0,
                    "correct": 0,
                    "evaluated": 0,
                    "confidence": [],
                },
            )
        )

        stats[
            "total"
        ] = int(
            stats[
                "total"
            ]
        ) + 1

        confidence_values = (
            stats[
                "confidence"
            ]
        )

        assert isinstance(
            confidence_values,
            list,
        )

        confidence_values.append(
            confidence
        )

        if (
            case.expected
            is not None
        ):

            stats[
                "evaluated"
            ] = int(
                stats[
                    "evaluated"
                ]
            ) + 1

            if (
                prediction
                ==
                case.expected
            ):

                stats[
                    "correct"
                ] = int(
                    stats[
                        "correct"
                    ]
                ) + 1

        print()

        print(
            f"[{result_text}] "
            f"{case.group}"
        )

        print(
            f"Texto:     {case.text}"
        )

        print(
            f"Esperado:  {case.expected or 'INDEFINIDO'}"
        )

        print(
            f"Predição:  {prediction}"
        )

        print(
            "Confiança: "
            f"{confidence:.4f} "
            f"({'HIGH' if high_confidence else 'NORMAL'})"
        )

        print(
            "P(MANUT):  "
            f"{probability_map['MANUTENCAO']:.4f}"
        )

        print(
            "P(OPER):   "
            f"{probability_map['OPERACAO']:.4f}"
        )

    # --------------------------------------------------------
    # RESUMO
    # --------------------------------------------------------

    print()

    print(
        "=" * 78
    )

    print(
        "RESUMO"
    )

    print(
        "=" * 78
    )

    accuracy = (
        correct
        /
        evaluated
        if evaluated
        else
        0.0
    )

    print()

    print(
        f"Casos avaliados: {evaluated}"
    )

    print(
        f"Corretos:        {correct}"
    )

    print(
        f"Accuracy manual: {accuracy:.4f}"
    )

    print()

    print(
        "POR GRUPO:"
    )

    for (
        group,
        stats,
    ) in group_stats.items():

        group_total = int(
            stats[
                "total"
            ]
        )

        group_evaluated = int(
            stats[
                "evaluated"
            ]
        )

        group_correct = int(
            stats[
                "correct"
            ]
        )

        confidence_values = (
            stats[
                "confidence"
            ]
        )

        assert isinstance(
            confidence_values,
            list,
        )

        mean_confidence = (
            float(
                np.mean(
                    confidence_values
                )
            )
            if confidence_values
            else
            0.0
        )

        group_accuracy = (
            group_correct
            /
            group_evaluated

            if group_evaluated
            else
            None
        )

        if (
            group_accuracy
            is None
        ):

            accuracy_text = (
                "N/A"
            )

        else:

            accuracy_text = (
                f"{group_accuracy:.4f}"
            )

        print(
            f"  {group:<18}"
            f" total={group_total:<3}"
            f" accuracy={accuracy_text:<7}"
            f" mean_conf={mean_confidence:.4f}"
        )

    # --------------------------------------------------------
    # COMPARAÇÃO AMBÍGUA
    # --------------------------------------------------------

    explicit_confidences: list[
        float
    ] = []

    ambiguous_confidences: list[
        float
    ] = []

    for (
        index,
        case,
    ) in enumerate(
        TEST_CASES
    ):

        confidence = float(
            np.max(
                probabilities[
                    index
                ]
            )
        )

        if (
            case.group
            ==
            "ambiguous"
        ):

            ambiguous_confidences.append(
                confidence
            )

        elif (
            case.expected
            is not None
        ):

            explicit_confidences.append(
                confidence
            )

    print()

    explicit_mean = float(
        np.mean(
            explicit_confidences
        )
    )

    ambiguous_mean = float(
        np.mean(
            ambiguous_confidences
        )
    )

    print(
        "CONFIANÇA:"
    )

    print(
        "  Média casos causais: "
        f"{explicit_mean:.4f}"
    )

    print(
        "  Média ambíguos:       "
        f"{ambiguous_mean:.4f}"
    )

    if (
        ambiguous_mean
        >=
        explicit_mean
    ):

        print()

        print(
            "ATENÇÃO: o modelo está tão ou mais "
            "confiante em casos ambíguos do que "
            "em casos com causa explícita."
        )

    print()

    print(
        "=" * 78
    )


if __name__ == "__main__":
    main()