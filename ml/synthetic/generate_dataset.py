from __future__ import annotations

import argparse
import csv
import random
import re
import sys
import unicodedata
from pathlib import Path


# ============================================================
# PATHS
# ============================================================

CURRENT_FILE = Path(__file__).resolve()

ML_DIR = CURRENT_FILE.parents[1]

if str(ML_DIR) not in sys.path:
    sys.path.insert(
        0,
        str(ML_DIR),
    )


# ============================================================
# IMPORTS DO PROJETO ML
# ============================================================

from synthetic.noise import apply_noise  # noqa: E402

from synthetic.templates import (  # noqa: E402
    COMPONENT_SPECS,
    MECHANISM_TEMPLATES,
    ComponentSpec,
)

from synthetic.vocabulary import (  # noqa: E402
    EQUIPMENTS,
    STOP_KEYS,
    STOP_SUBKEYS,
    STOP_TYPES,
)


# ============================================================
# CONFIGURAÇÃO
# ============================================================

DEFAULT_SEED = 42

DEFAULT_EXAMPLES_PER_CLASS = 150

DATA_DIR = (
    ML_DIR
    / "data"
)

DEFAULT_OUTPUT = (
    DATA_DIR
    / "synthetic_training.csv"
)


# ============================================================
# LABELS PRINCIPAIS
#
# failure_mode responde:
#
# "O QUE FALHOU?"
#
# Nunca:
# "COMO FALHOU?"
# ============================================================

FAILURE_MODE_LABELS = {
    "SENSOR":
        "Falha de sensor",

    "ROLAMENTO":
        "Falha de rolamento",

    "BOMBA":
        "Falha de bomba",

    "CORREIA":
        "Falha de correia",

    "CORRENTE":
        "Falha de corrente",

    "VALVULA":
        "Falha de válvula",

    "MOTOR":
        "Falha de motor",

    "INVERSOR":
        "Falha de inversor",

    "REDUTOR":
        "Falha de redutor",

    "ENGRENAGEM":
        "Falha de engrenagem",

    "ACOPLAMENTO":
        "Falha de acoplamento",

    "CILINDRO":
        "Falha de cilindro",

    "ATUADOR":
        "Falha de atuador",

    "REJEITOR":
        "Falha de rejeitor",

    "SERVO":
        "Falha de servo",

    "CLP":
        "Falha de CLP",

    "IHM":
        "Falha de IHM",

    "CABO":
        "Falha de cabo",

    "MANGUEIRA":
        "Falha de mangueira",

    "BOCAL":
        "Falha de bocal",

    "GARRA":
        "Falha de garra",

    "ESTRELA":
        "Falha de estrela",

    "TRANSPORTADOR":
        "Falha de transportador",

    "DOSADOR":
        "Falha de dosador",

    "ALIMENTADOR":
        "Falha de alimentador",
}


# ============================================================
# FAILURE MODE
# ============================================================

def build_failure_mode(
    component_code: str,
) -> str:
    try:
        return FAILURE_MODE_LABELS[
            component_code
        ]

    except KeyError as error:
        raise ValueError(
            "Componente não possui "
            f"failure_mode configurado: "
            f"{component_code}"
        ) from error


# ============================================================
# NORMALIZAÇÃO DO TEXTO
#
# Essa representação será usada posteriormente pelo
# Modelo ML.
# ============================================================

def normalize_for_model(
    value: str,
) -> str:

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
# TEXTO COMBINADO
#
# Mantemos a origem de cada informação:
#
# obs = observação
# eq  = equipamento
# k1  = chave
# sk  = subchave
# st  = tipo de parada
# ============================================================

def build_combined_text(
    observation: str,
    equipment: str,
    stop_key_1: str,
    stop_subkey: str,
    stop_type: str,
) -> str:

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
        normalized = (
            normalize_for_model(
                value
            )
        )

        if normalized:
            parts.append(
                f"{prefix} {normalized}"
            )

    return " ".join(
        parts
    )


# ============================================================
# CRIA UM EXEMPLO
# ============================================================

def create_example(
    spec: ComponentSpec,
    rng: random.Random,
    synthetic_id: str,
) -> dict[str, str]:

    # --------------------------------------------------------
    # Componente
    # --------------------------------------------------------

    component_name = (
        rng.choice(
            spec.names
        )
    )

    # --------------------------------------------------------
    # Como ele falhou
    # --------------------------------------------------------

    mechanism = (
        rng.choice(
            spec.mechanisms
        )
    )

    # --------------------------------------------------------
    # Template compatível com o mecanismo
    # --------------------------------------------------------

    templates = (
        MECHANISM_TEMPLATES[
            mechanism
        ]
    )

    template = (
        rng.choice(
            templates
        )
    )

    # --------------------------------------------------------
    # Frase original
    # --------------------------------------------------------

    raw_observation = (
        template.format(
            component=
                component_name
        )
    )

    # --------------------------------------------------------
    # Linguagem industrial / ruído controlado
    # --------------------------------------------------------

    observation = (
        apply_noise(
            raw_observation,
            rng,
        )
    )

    # --------------------------------------------------------
    # Contexto
    # --------------------------------------------------------

    equipment = (
        rng.choice(
            EQUIPMENTS
        )
    )

    stop_key_1 = (
        rng.choice(
            STOP_KEYS
        )
    )

    stop_subkey = (
        rng.choice(
            STOP_SUBKEYS
        )
    )

    stop_type = (
        rng.choice(
            STOP_TYPES
        )
    )

    # --------------------------------------------------------
    # Texto final utilizado pelo Modelo ML
    # --------------------------------------------------------

    combined_text = (
        build_combined_text(
            observation=
                observation,

            equipment=
                equipment,

            stop_key_1=
                stop_key_1,

            stop_subkey=
                stop_subkey,

            stop_type=
                stop_type,
        )
    )

    # --------------------------------------------------------
    # Informação principal do produto
    # --------------------------------------------------------

    failure_mode = (
        build_failure_mode(
            spec.code
        )
    )

    # --------------------------------------------------------
    # Registro
    # --------------------------------------------------------

    return {
        "synthetic_id":
            synthetic_id,

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

        "text":
            combined_text,

        "failed_component_code":
            spec.code,

        "failed_component":
            spec.names[0],

        "failure_mechanism":
            mechanism,

        "failure_mode":
            failure_mode,

        "system":
            spec.system,

        "technical_category":
            spec.technical_category,

        "source":
            "SYNTHETIC_TEMPLATE",
    }


# ============================================================
# GERA UMA CLASSE
# ============================================================

def generate_component_examples(
    spec: ComponentSpec,
    amount: int,
    rng: random.Random,
) -> list[dict[str, str]]:

    examples: list[
        dict[str, str]
    ] = []

    seen: set[str] = set()

    attempts = 0

    max_attempts = (
        amount
        * 200
    )

    while (
        len(examples)
        < amount
        and attempts
        < max_attempts
    ):
        attempts += 1

        synthetic_id = (
            f"{spec.code}-"
            f"{len(examples) + 1:04d}"
        )

        example = (
            create_example(
                spec=spec,
                rng=rng,
                synthetic_id=
                    synthetic_id,
            )
        )

        # ----------------------------------------------------
        # Evita exemplos idênticos completos.
        #
        # O mesmo observation pode aparecer com contexto
        # diferente, o que é aceitável.
        # ----------------------------------------------------

        uniqueness_key = (
            example["text"]
        )

        if (
            uniqueness_key
            in seen
        ):
            continue

        seen.add(
            uniqueness_key
        )

        examples.append(
            example
        )

    if (
        len(examples)
        < amount
    ):
        raise RuntimeError(
            "Não foi possível gerar "
            f"{amount} exemplos únicos "
            f"para {spec.code}. "
            "Quantidade obtida: "
            f"{len(examples)}."
        )

    return examples


# ============================================================
# COLUNAS CSV
# ============================================================

CSV_COLUMNS = [
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
]


# ============================================================
# SALVA CSV
# ============================================================

def save_csv(
    rows: list[
        dict[str, str]
    ],
    output_path: Path,
) -> None:

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with output_path.open(
        "w",
        newline="",
        encoding=
            "utf-8-sig",
    ) as file:

        writer = (
            csv.DictWriter(
                file,
                fieldnames=
                    CSV_COLUMNS,
            )
        )

        writer.writeheader()

        writer.writerows(
            rows
        )


# ============================================================
# ESTATÍSTICAS
# ============================================================

def print_statistics(
    rows: list[
        dict[str, str]
    ],
    output_path: Path,
) -> None:

    component_counts: dict[
        str,
        int,
    ] = {}

    mechanism_counts: dict[
        str,
        int,
    ] = {}

    for row in rows:

        component = (
            row[
                "failed_component_code"
            ]
        )

        mechanism = (
            row[
                "failure_mechanism"
            ]
        )

        component_counts[
            component
        ] = (
            component_counts.get(
                component,
                0,
            )
            + 1
        )

        mechanism_counts[
            mechanism
        ] = (
            mechanism_counts.get(
                mechanism,
                0,
            )
            + 1
        )

    print()

    print(
        "=" * 74
    )

    print(
        "EASY MAINTENANCE - DATASET SINTÉTICO DO MODELO ML"
    )

    print(
        "=" * 74
    )

    print(
        f"Total de exemplos: "
        f"{len(rows)}"
    )

    print(
        f"Classes de componente: "
        f"{len(component_counts)}"
    )

    print(
        f"Mecanismos diferentes: "
        f"{len(mechanism_counts)}"
    )

    print()

    print(
        "DISTRIBUIÇÃO POR FAILURE_MODE"
    )

    print(
        "-" * 74
    )

    for code in sorted(
        component_counts
    ):
        failure_mode = (
            FAILURE_MODE_LABELS[
                code
            ]
        )

        count = (
            component_counts[
                code
            ]
        )

        print(
            f"{failure_mode:<36} "
            f"{count:>6}"
        )

    print()

    print(
        "DISTRIBUIÇÃO POR MECANISMO"
    )

    print(
        "-" * 74
    )

    for mechanism in sorted(
        mechanism_counts
    ):
        count = (
            mechanism_counts[
                mechanism
            ]
        )

        print(
            f"{mechanism:<36} "
            f"{count:>6}"
        )

    print()

    print(
        f"Arquivo gerado:"
    )

    print(
        output_path
    )

    print()

    print(
        "=" * 74
    )


# ============================================================
# ARGUMENTOS
# ============================================================

def parse_arguments():
    parser = (
        argparse.ArgumentParser(
            description=(
                "Gera dataset sintético "
                "para o Modelo ML do "
                "Easy Maintenance."
            )
        )
    )

    parser.add_argument(
        "--per-class",

        type=int,

        default=
            DEFAULT_EXAMPLES_PER_CLASS,

        help=(
            "Quantidade de exemplos "
            "gerados por componente."
        ),
    )

    parser.add_argument(
        "--seed",

        type=int,

        default=
            DEFAULT_SEED,

        help=(
            "Seed usada para tornar "
            "a geração reproduzível."
        ),
    )

    parser.add_argument(
        "--output",

        type=str,

        default=
            str(
                DEFAULT_OUTPUT
            ),

        help=(
            "Caminho do CSV gerado."
        ),
    )

    return (
        parser.parse_args()
    )


# ============================================================
# MAIN
# ============================================================

def main() -> None:

    args = (
        parse_arguments()
    )

    if (
        args.per_class
        < 10
    ):
        raise ValueError(
            "--per-class deve ser "
            "maior ou igual a 10."
        )

    rng = (
        random.Random(
            args.seed
        )
    )

    all_examples: list[
        dict[str, str]
    ] = []

    print()

    print(
        "Gerando dataset sintético "
        "do Modelo ML..."
    )

    print()

    # --------------------------------------------------------
    # Cada spec representa:
    #
    # O QUE FALHOU?
    #
    # SENSOR
    # ROLAMENTO
    # BOMBA
    # ...
    # --------------------------------------------------------

    for spec in COMPONENT_SPECS:

        failure_mode = (
            build_failure_mode(
                spec.code
            )
        )

        print(
            f"{spec.code:<25} "
            f"→ {failure_mode}"
        )

        examples = (
            generate_component_examples(
                spec=spec,

                amount=
                    args.per_class,

                rng=rng,
            )
        )

        all_examples.extend(
            examples
        )

    # --------------------------------------------------------
    # Mistura o dataset.
    # --------------------------------------------------------

    rng.shuffle(
        all_examples
    )

    output_path = (
        Path(
            args.output
        ).resolve()
    )

    # --------------------------------------------------------
    # Salva.
    # --------------------------------------------------------

    save_csv(
        rows=
            all_examples,

        output_path=
            output_path,
    )

    # --------------------------------------------------------
    # Relatório.
    # --------------------------------------------------------

    print_statistics(
        rows=
            all_examples,

        output_path=
            output_path,
    )


if __name__ == "__main__":
    main()