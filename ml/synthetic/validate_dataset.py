from __future__ import annotations

import csv
import sys
from collections import Counter, defaultdict
from pathlib import Path


# ============================================================
# PATHS
# ============================================================

CURRENT_FILE = Path(__file__).resolve()
ML_DIR = CURRENT_FILE.parents[1]

DATASET_PATH = (
    ML_DIR
    / "data"
    / "synthetic_training.csv"
)


# ============================================================
# TAXONOMIA ESPERADA
# ============================================================

VALID_COMPONENTS = {
    "SENSOR",
    "ROLAMENTO",
    "BOMBA",
    "CORREIA",
    "CORRENTE",
    "VALVULA",
    "MOTOR",
    "INVERSOR",
    "REDUTOR",
    "ENGRENAGEM",
    "ACOPLAMENTO",
    "CILINDRO",
    "ATUADOR",
    "REJEITOR",
    "SERVO",
    "CLP",
    "IHM",
    "CABO",
    "MANGUEIRA",
    "BOCAL",
    "GARRA",
    "ESTRELA",
    "TRANSPORTADOR",
    "DOSADOR",
    "ALIMENTADOR",
}


VALID_MECHANISMS = {
    "QUEBRA",
    "PARADA",
    "DESARME",
    "VAZAMENTO",
    "TRAVAMENTO",
    "DESGASTE",
    "FOLGA",
    "ROMPIMENTO",
    "SEM_DETECCAO",
    "SEM_LEITURA",
    "PERDA_SINAL",
    "PERDA_COMUNICACAO",
    "DESALINHAMENTO",
    "POSICIONAMENTO_INCORRETO",
    "SOBREAQUECIMENTO",
    "OBSTRUCAO",
    "BAIXO_FLUXO",
    "PERDA_PRESSAO",
}


VALID_TECHNICAL_CATEGORIES = {
    "MECANICA",
    "ELETRICA",
    "AUTOMACAO_INSTRUMENTACAO",
    "PNEUMATICA",
    "HIDRAULICA",
    "PROCESSO",
    "OPERACIONAL",
    "QUALIDADE",
    "INDETERMINADA",
}


EXPECTED_FAILURE_MODES = {
    "SENSOR": "Falha de sensor",
    "ROLAMENTO": "Falha de rolamento",
    "BOMBA": "Falha de bomba",
    "CORREIA": "Falha de correia",
    "CORRENTE": "Falha de corrente",
    "VALVULA": "Falha de válvula",
    "MOTOR": "Falha de motor",
    "INVERSOR": "Falha de inversor",
    "REDUTOR": "Falha de redutor",
    "ENGRENAGEM": "Falha de engrenagem",
    "ACOPLAMENTO": "Falha de acoplamento",
    "CILINDRO": "Falha de cilindro",
    "ATUADOR": "Falha de atuador",
    "REJEITOR": "Falha de rejeitor",
    "SERVO": "Falha de servo",
    "CLP": "Falha de CLP",
    "IHM": "Falha de IHM",
    "CABO": "Falha de cabo",
    "MANGUEIRA": "Falha de mangueira",
    "BOCAL": "Falha de bocal",
    "GARRA": "Falha de garra",
    "ESTRELA": "Falha de estrela",
    "TRANSPORTADOR": "Falha de transportador",
    "DOSADOR": "Falha de dosador",
    "ALIMENTADOR": "Falha de alimentador",
}


# ============================================================
# COLUNAS
# ============================================================

REQUIRED_COLUMNS = {
    "synthetic_id",
    "observation",
    "equipment",
    "stop_key_1",
    "stop_subkey",
    "stop_type",
    "text",
    "failed_component_code",
    "failed_component",
    "failure_mechanism",
    "failure_mode",
    "system",
    "technical_category",
    "source",
}


# ============================================================
# UTIL
# ============================================================

def fail(
    errors: list[str],
    message: str,
) -> None:
    errors.append(message)


# ============================================================
# MAIN
# ============================================================

def main() -> None:
    print()

    print(
        "=" * 74
    )

    print(
        "EASY MAINTENANCE - VALIDAÇÃO DO DATASET DO MODELO ML"
    )

    print(
        "=" * 74
    )

    if not DATASET_PATH.exists():
        print(
            f"ERRO: dataset não encontrado:\n{DATASET_PATH}"
        )

        sys.exit(1)

    print(
        f"Dataset: {DATASET_PATH}"
    )

    print()

    with DATASET_PATH.open(
        "r",
        encoding="utf-8-sig",
        newline="",
    ) as file:
        reader = csv.DictReader(
            file
        )

        fieldnames = set(
            reader.fieldnames
            or []
        )

        missing_columns = (
            REQUIRED_COLUMNS
            - fieldnames
        )

        if missing_columns:
            print(
                "ERRO: colunas obrigatórias ausentes:"
            )

            for column in sorted(
                missing_columns
            ):
                print(
                    f"  - {column}"
                )

            sys.exit(1)

        rows = list(
            reader
        )

    if not rows:
        print(
            "ERRO: dataset vazio."
        )

        sys.exit(1)

    errors: list[str] = []

    warnings: list[str] = []

    component_counts: Counter[
        str
    ] = Counter()

    mechanism_counts: Counter[
        str
    ] = Counter()

    mechanism_by_component: dict[
        str,
        Counter[str],
    ] = defaultdict(
        Counter
    )

    observations_seen: set[
        str
    ] = set()

    text_seen: set[
        str
    ] = set()

    duplicate_observations = 0

    duplicate_text = 0

    empty_text = 0

    # ========================================================
    # LINHAS
    # ========================================================

    for index, row in enumerate(
        rows,
        start=2,
    ):
        component = (
            row[
                "failed_component_code"
            ]
            .strip()
        )

        mechanism = (
            row[
                "failure_mechanism"
            ]
            .strip()
        )

        failure_mode = (
            row[
                "failure_mode"
            ]
            .strip()
        )

        observation = (
            row[
                "observation"
            ]
            .strip()
        )

        combined_text = (
            row[
                "text"
            ]
            .strip()
        )

        technical_category = (
            row[
                "technical_category"
            ]
            .strip()
        )

        source = (
            row[
                "source"
            ]
            .strip()
        )

        # ====================================================
        # COMPONENTE
        # ====================================================

        if component not in VALID_COMPONENTS:
            fail(
                errors,
                (
                    f"Linha {index}: "
                    f"failed_component_code inválido: "
                    f"{component!r}"
                ),
            )

        # ====================================================
        # MECANISMO
        # ====================================================

        if mechanism not in VALID_MECHANISMS:
            fail(
                errors,
                (
                    f"Linha {index}: "
                    f"failure_mechanism inválido: "
                    f"{mechanism!r}"
                ),
            )

        # ====================================================
        # FAILURE MODE
        # ====================================================

        expected_failure_mode = (
            EXPECTED_FAILURE_MODES.get(
                component
            )
        )

        if (
            expected_failure_mode
            and failure_mode
            != expected_failure_mode
        ):
            fail(
                errors,
                (
                    f"Linha {index}: "
                    f"{component} deveria gerar "
                    f"{expected_failure_mode!r}, "
                    f"mas gerou "
                    f"{failure_mode!r}"
                ),
            )

        # ====================================================
        # ÁREA
        # ====================================================

        if (
            technical_category
            not in
            VALID_TECHNICAL_CATEGORIES
        ):
            fail(
                errors,
                (
                    f"Linha {index}: "
                    f"technical_category inválida: "
                    f"{technical_category!r}"
                ),
            )

        # ====================================================
        # SOURCE
        # ====================================================

        if (
            source
            != "SYNTHETIC_TEMPLATE"
        ):
            fail(
                errors,
                (
                    f"Linha {index}: "
                    f"source inesperado: "
                    f"{source!r}"
                ),
            )

        # ====================================================
        # TEXTO
        # ====================================================

        if not observation:
            fail(
                errors,
                (
                    f"Linha {index}: "
                    "observation vazia."
                ),
            )

        if not combined_text:
            empty_text += 1

            fail(
                errors,
                (
                    f"Linha {index}: "
                    "text vazio."
                ),
            )

        # ====================================================
        # DUPLICADOS
        # ====================================================

        normalized_observation = (
            observation.lower()
        )

        if (
            normalized_observation
            in observations_seen
        ):
            duplicate_observations += 1
        else:
            observations_seen.add(
                normalized_observation
            )

        if combined_text in text_seen:
            duplicate_text += 1
        else:
            text_seen.add(
                combined_text
            )

        # ====================================================
        # ESTATÍSTICAS
        # ====================================================

        component_counts[
            component
        ] += 1

        mechanism_counts[
            mechanism
        ] += 1

        mechanism_by_component[
            component
        ][
            mechanism
        ] += 1

    # ========================================================
    # BALANCEAMENTO
    # ========================================================

    counts = list(
        component_counts.values()
    )

    if counts:
        smallest = min(
            counts
        )

        largest = max(
            counts
        )

        if (
            largest
            - smallest
            > 2
        ):
            warnings.append(
                (
                    "As classes não estão "
                    "perfeitamente balanceadas: "
                    f"mínimo={smallest}, "
                    f"máximo={largest}."
                )
            )

    missing_components = (
        VALID_COMPONENTS
        - set(
            component_counts.keys()
        )
    )

    if missing_components:
        for component in sorted(
            missing_components
        ):
            warnings.append(
                (
                    "Componente sem exemplos: "
                    f"{component}"
                )
            )

    # ========================================================
    # RELATÓRIO
    # ========================================================

    print(
        f"Total de registros: {len(rows)}"
    )

    print(
        f"Componentes:        {len(component_counts)}"
    )

    print(
        f"Mecanismos:         {len(mechanism_counts)}"
    )

    print()

    print(
        "DISTRIBUIÇÃO POR FAILURE_MODE"
    )

    print(
        "-" * 74
    )

    for component in sorted(
        component_counts
    ):
        failure_mode = (
            EXPECTED_FAILURE_MODES.get(
                component,
                component,
            )
        )

        print(
            f"{failure_mode:<35} "
            f"{component_counts[component]:>6}"
        )

    print()

    print(
        "DISTRIBUIÇÃO DE MECANISMOS"
    )

    print(
        "-" * 74
    )

    for mechanism in sorted(
        mechanism_counts
    ):
        print(
            f"{mechanism:<35} "
            f"{mechanism_counts[mechanism]:>6}"
        )

    print()

    print(
        "DIVERSIDADE POR COMPONENTE"
    )

    print(
        "-" * 74
    )

    for component in sorted(
        mechanism_by_component
    ):
        mechanisms = (
            mechanism_by_component[
                component
            ]
        )

        mechanism_text = ", ".join(
            sorted(
                mechanisms.keys()
            )
        )

        print(
            f"{component:<25} "
            f"{len(mechanisms):>2} mecanismos  "
            f"{mechanism_text}"
        )

    print()

    print(
        "QUALIDADE"
    )

    print(
        "-" * 74
    )

    print(
        f"Textos vazios:                  {empty_text}"
    )

    print(
        f"Observações repetidas:          {duplicate_observations}"
    )

    print(
        f"Entradas completas repetidas:   {duplicate_text}"
    )

    print()

    if warnings:
        print(
            "AVISOS"
        )

        print(
            "-" * 74
        )

        for warning in warnings:
            print(
                f"- {warning}"
            )

        print()

    if errors:
        print(
            "ERROS"
        )

        print(
            "-" * 74
        )

        for error in errors[
            :50
        ]:
            print(
                f"- {error}"
            )

        if len(errors) > 50:
            print(
                f"... e mais {len(errors) - 50} erros."
            )

        print()

        print(
            "RESULTADO: DATASET INVÁLIDO"
        )

        print(
            "=" * 74
        )

        sys.exit(1)

    print(
        "RESULTADO: DATASET VÁLIDO"
    )

    print(
        "=" * 74
    )


if __name__ == "__main__":
    main()