from __future__ import annotations

import argparse
import csv
import random
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path


# ============================================================
# CONFIGURAÇÃO
# ============================================================

RANDOM_SEED = 42

DEFAULT_OUTPUT = (
    "ml/data/origin/"
    "synthetic_origin_v1.csv"
)

ROWS_PER_SCENARIO = 80


# ============================================================
# TIPOS
# ============================================================

@dataclass(frozen=True)
class Scenario:
    scenario_id: str

    origin: str

    equipment: str

    failed_component_code: str

    failure_mode: str

    stop_type: str

    stop_key_1: str

    stop_subkey: str

    observations: tuple[
        str,
        ...,
    ]


# ============================================================
# CENÁRIOS
#
# IMPORTANTE:
#
# Existem propositalmente componentes iguais nas duas classes.
#
# Exemplo:
#
# SENSOR -> MANUTENCAO
# SENSOR -> OPERACAO
#
# Isso impede o modelo de aprender:
#
# SENSOR = manutenção
#
# Ele precisa analisar o contexto.
# ============================================================

SCENARIOS: tuple[
    Scenario,
    ...,
] = (

    # ========================================================
    # SENSOR
    # ========================================================

    Scenario(
        scenario_id="SENSOR_M_01",
        origin="MANUTENCAO",
        equipment="ENCHEDORA",
        failed_component_code="SENSOR",
        failure_mode="Falha de sensor",
        stop_type="Anomalia",
        stop_key_1="SENSOR",
        stop_subkey="SEM SINAL",
        observations=(
            "sensor sem leitura por cabo rompido",
            "sensor perdeu sinal devido cabo danificado",
            "sensor não detecta devido defeito elétrico",
            "sensor apresentou falha permanente de leitura",
        ),
    ),

    Scenario(
        scenario_id="SENSOR_O_01",
        origin="OPERACAO",
        equipment="ENCHEDORA",
        failed_component_code="SENSOR",
        failure_mode="Falha de sensor",
        stop_type="Processo",
        stop_key_1="SENSOR",
        stop_subkey="POSICIONAMENTO",
        observations=(
            "sensor não detectou garrafa fora de posição",
            "produto mal posicionado não acionou o sensor",
            "garrafa desalinhada bloqueou leitura do sensor",
            "sensor sem leitura após posicionamento incorreto do produto",
        ),
    ),

    # ========================================================
    # VÁLVULA
    # ========================================================

    Scenario(
        scenario_id="VALVULA_M_01",
        origin="MANUTENCAO",
        equipment="ENCHEDORA",
        failed_component_code="VALVULA",
        failure_mode="Falha de válvula",
        stop_type="Anomalia",
        stop_key_1="VALVULA",
        stop_subkey="VAZAMENTO",
        observations=(
            "válvula apresentou vazamento",
            "válvula não vedava corretamente",
            "falha mecânica na válvula de enchimento",
            "válvula travada por desgaste interno",
        ),
    ),

    Scenario(
        scenario_id="VALVULA_O_01",
        origin="OPERACAO",
        equipment="ENCHEDORA",
        failed_component_code="VALVULA",
        failure_mode="Falha de válvula",
        stop_type="Processo",
        stop_key_1="VALVULA",
        stop_subkey="AJUSTE",
        observations=(
            "válvula ficou fora de ajuste após troca de formato",
            "regulagem incorreta deixou válvula fora do ponto",
            "ajuste da máquina deixou válvula com abertura incorreta",
            "parâmetro configurado incorretamente alterou atuação da válvula",
        ),
    ),

    # ========================================================
    # TRANSPORTADOR
    # ========================================================

    Scenario(
        scenario_id="TRANSPORTADOR_M_01",
        origin="MANUTENCAO",
        equipment="TRANSPORTADOR",
        failed_component_code="TRANSPORTADOR",
        failure_mode="Falha de transportador",
        stop_type="Anomalia",
        stop_key_1="TRANSPORTE",
        stop_subkey="DEFEITO",
        observations=(
            "transportador parou por defeito mecânico",
            "transportador com componente danificado",
            "transportador apresentou falha no acionamento",
            "transportador parou devido desgaste do conjunto",
        ),
    ),

    Scenario(
        scenario_id="TRANSPORTADOR_O_01",
        origin="OPERACAO",
        equipment="TRANSPORTADOR",
        failed_component_code="TRANSPORTADOR",
        failure_mode="Falha de transportador",
        stop_type="Processo",
        stop_key_1="TRANSPORTE",
        stop_subkey="ACUMULO",
        observations=(
            "produto acumulado provocou parada do transportador",
            "alimentação excessiva gerou acúmulo na esteira",
            "garrafas posicionadas incorretamente travaram o transporte",
            "fluxo de produto inadequado causou bloqueio na esteira",
        ),
    ),

    # ========================================================
    # ESTEIRA / CORREIA
    # ========================================================

    Scenario(
        scenario_id="CORREIA_M_01",
        origin="MANUTENCAO",
        equipment="TRANSPORTADOR",
        failed_component_code="CORREIA",
        failure_mode="Falha de correia",
        stop_type="Anomalia",
        stop_key_1="TRANSMISSAO",
        stop_subkey="CORREIA",
        observations=(
            "correia rompeu durante funcionamento",
            "correia desgastada provocou parada",
            "correia saiu devido tensionador danificado",
            "correia apresentou desgaste excessivo",
        ),
    ),

    Scenario(
        scenario_id="CORREIA_O_01",
        origin="OPERACAO",
        equipment="TRANSPORTADOR",
        failed_component_code="CORREIA",
        failure_mode="Falha de correia",
        stop_type="Processo",
        stop_key_1="TRANSMISSAO",
        stop_subkey="AJUSTE",
        observations=(
            "correia saiu após ajuste incorreto de setup",
            "regulagem incorreta provocou desalinhamento da correia",
            "mudança de formato deixou guia pressionando a correia",
            "ajuste inadequado do conjunto deslocou a correia",
        ),
    ),

    # ========================================================
    # ESTRELA
    # ========================================================

    Scenario(
        scenario_id="ESTRELA_M_01",
        origin="MANUTENCAO",
        equipment="ENCHEDORA",
        failed_component_code="ESTRELA",
        failure_mode="Falha de estrela",
        stop_type="Anomalia",
        stop_key_1="TRANSFERENCIA",
        stop_subkey="ESTRELA",
        observations=(
            "estrela apresentou folga mecânica",
            "estrela danificada durante funcionamento",
            "estrela com desgaste causando travamento",
            "estrela quebrou e interrompeu transferência",
        ),
    ),

    Scenario(
        scenario_id="ESTRELA_O_01",
        origin="OPERACAO",
        equipment="ENCHEDORA",
        failed_component_code="ESTRELA",
        failure_mode="Falha de estrela",
        stop_type="Processo",
        stop_key_1="TRANSFERENCIA",
        stop_subkey="REGULAGEM",
        observations=(
            "estrela fora de posição após setup",
            "ajuste incorreto da estrela provocou travamento",
            "estrela regulada fora do ponto para o formato",
            "posição da estrela ficou incorreta após troca de produto",
        ),
    ),

    # ========================================================
    # BOCAL
    # ========================================================

    Scenario(
        scenario_id="BOCAL_M_01",
        origin="MANUTENCAO",
        equipment="ENCHEDORA",
        failed_component_code="BOCAL",
        failure_mode="Falha de bocal",
        stop_type="Anomalia",
        stop_key_1="ENCHIMENTO",
        stop_subkey="BOCAL",
        observations=(
            "bocal apresentou vazamento",
            "bocal danificado durante produção",
            "vedação do bocal apresentou desgaste",
            "bocal travado por falha mecânica",
        ),
    ),

    Scenario(
        scenario_id="BOCAL_O_01",
        origin="OPERACAO",
        equipment="ENCHEDORA",
        failed_component_code="BOCAL",
        failure_mode="Falha de bocal",
        stop_type="Processo",
        stop_key_1="ENCHIMENTO",
        stop_subkey="AJUSTE",
        observations=(
            "altura do bocal ajustada incorretamente",
            "setup deixou bocal fora de posição",
            "regulagem inadequada provocou contato do bocal com embalagem",
            "bocal configurado na altura errada para o formato",
        ),
    ),

    # ========================================================
    # CILINDRO
    # ========================================================

    Scenario(
        scenario_id="CILINDRO_M_01",
        origin="MANUTENCAO",
        equipment="EMPACOTADORA",
        failed_component_code="CILINDRO",
        failure_mode="Falha de cilindro",
        stop_type="Anomalia",
        stop_key_1="PNEUMATICA",
        stop_subkey="CILINDRO",
        observations=(
            "cilindro pneumático com vazamento",
            "cilindro perdeu força devido desgaste",
            "vedação do cilindro apresentou falha",
            "cilindro travou durante o movimento",
        ),
    ),

    Scenario(
        scenario_id="CILINDRO_O_01",
        origin="OPERACAO",
        equipment="EMPACOTADORA",
        failed_component_code="CILINDRO",
        failure_mode="Falha de cilindro",
        stop_type="Processo",
        stop_key_1="PNEUMATICA",
        stop_subkey="REGULAGEM",
        observations=(
            "curso do cilindro ajustado incorretamente",
            "regulagem inadequada limitou movimento do cilindro",
            "setup deixou avanço do cilindro fora de posição",
            "posição configurada incorretamente provocou parada do cilindro",
        ),
    ),

    # ========================================================
    # GARRA
    # ========================================================

    Scenario(
        scenario_id="GARRA_M_01",
        origin="MANUTENCAO",
        equipment="PALETIZADOR",
        failed_component_code="GARRA",
        failure_mode="Falha de garra",
        stop_type="Anomalia",
        stop_key_1="MANIPULACAO",
        stop_subkey="GARRA",
        observations=(
            "garra apresentou quebra",
            "garra com desgaste não segurava produto",
            "mecanismo da garra travou",
            "garra perdeu movimento por defeito mecânico",
        ),
    ),

    Scenario(
        scenario_id="GARRA_O_01",
        origin="OPERACAO",
        equipment="PALETIZADOR",
        failed_component_code="GARRA",
        failure_mode="Falha de garra",
        stop_type="Processo",
        stop_key_1="MANIPULACAO",
        stop_subkey="AJUSTE",
        observations=(
            "garra regulada incorretamente para o produto",
            "posição da garra ficou errada após setup",
            "parâmetro de abertura da garra configurado incorretamente",
            "ajuste inadequado da garra provocou queda de produto",
        ),
    ),

    # ========================================================
    # DOSADOR
    # ========================================================

    Scenario(
        scenario_id="DOSADOR_M_01",
        origin="MANUTENCAO",
        equipment="DOSADOR",
        failed_component_code="DOSADOR",
        failure_mode="Falha de dosador",
        stop_type="Anomalia",
        stop_key_1="DOSAGEM",
        stop_subkey="DEFEITO",
        observations=(
            "dosador apresentou falha mecânica",
            "dosador travou durante o ciclo",
            "acionamento do dosador apresentou defeito",
            "dosador não movimentava devido desgaste",
        ),
    ),

    Scenario(
        scenario_id="DOSADOR_O_01",
        origin="OPERACAO",
        equipment="DOSADOR",
        failed_component_code="DOSADOR",
        failure_mode="Falha de dosador",
        stop_type="Processo",
        stop_key_1="DOSAGEM",
        stop_subkey="PARAMETRO",
        observations=(
            "parâmetro de dosagem configurado incorretamente",
            "receita incorreta alterou quantidade dosada",
            "setup do dosador ficou fora do padrão",
            "valor de dosagem inserido incorretamente",
        ),
    ),

    # ========================================================
    # REJEITOR
    # ========================================================

    Scenario(
        scenario_id="REJEITOR_M_01",
        origin="MANUTENCAO",
        equipment="INSPETORA",
        failed_component_code="REJEITOR",
        failure_mode="Falha de rejeitor",
        stop_type="Anomalia",
        stop_key_1="REJEICAO",
        stop_subkey="DEFEITO",
        observations=(
            "rejeitor não acionava devido defeito",
            "mecanismo rejeitor apresentou falha",
            "rejeitor travado por desgaste",
            "atuador do rejeitor não movimentava",
        ),
    ),

    Scenario(
        scenario_id="REJEITOR_O_01",
        origin="OPERACAO",
        equipment="INSPETORA",
        failed_component_code="REJEITOR",
        failure_mode="Falha de rejeitor",
        stop_type="Processo",
        stop_key_1="REJEICAO",
        stop_subkey="PARAMETRO",
        observations=(
            "parâmetro de rejeição configurado incorretamente",
            "receita incorreta provocou rejeição indevida",
            "setup alterou posição de rejeição",
            "limite configurado incorretamente provocou rejeições",
        ),
    ),

    # ========================================================
    # ALIMENTADOR
    # ========================================================

    Scenario(
        scenario_id="ALIMENTADOR_M_01",
        origin="MANUTENCAO",
        equipment="ALIMENTADOR",
        failed_component_code="ALIMENTADOR",
        failure_mode="Falha de alimentador",
        stop_type="Anomalia",
        stop_key_1="ALIMENTACAO",
        stop_subkey="DEFEITO",
        observations=(
            "alimentador apresentou falha mecânica",
            "acionamento do alimentador travou",
            "alimentador parou por componente danificado",
            "alimentador com desgaste no mecanismo",
        ),
    ),

    Scenario(
        scenario_id="ALIMENTADOR_O_01",
        origin="OPERACAO",
        equipment="ALIMENTADOR",
        failed_component_code="ALIMENTADOR",
        failure_mode="Falha de alimentador",
        stop_type="Processo",
        stop_key_1="ALIMENTACAO",
        stop_subkey="FLUXO",
        observations=(
            "alimentação excessiva provocou acúmulo",
            "produto colocado fora de posição no alimentador",
            "alimentação irregular provocou travamento",
            "fluxo de entrada ajustado incorretamente",
        ),
    ),

    # ========================================================
    # SERVO
    # ========================================================

    Scenario(
        scenario_id="SERVO_M_01",
        origin="MANUTENCAO",
        equipment="ROTULADORA",
        failed_component_code="SERVO",
        failure_mode="Falha de servo",
        stop_type="Anomalia",
        stop_key_1="ACIONAMENTO",
        stop_subkey="SERVO",
        observations=(
            "servo apresentou falha no acionamento",
            "servo motor com erro permanente",
            "servo não movimentou devido defeito elétrico",
            "acionamento servo apresentou falha interna",
        ),
    ),

    Scenario(
        scenario_id="SERVO_O_01",
        origin="OPERACAO",
        equipment="ROTULADORA",
        failed_component_code="SERVO",
        failure_mode="Falha de servo",
        stop_type="Processo",
        stop_key_1="ACIONAMENTO",
        stop_subkey="PARAMETRO",
        observations=(
            "posição do servo configurada incorretamente",
            "receita deixou referência do servo fora do ponto",
            "setup incorreto alterou posição do servo",
            "parâmetro de movimento do servo ficou incorreto",
        ),
    ),

    # ========================================================
    # BOMBA
    # ========================================================

    Scenario(
        scenario_id="BOMBA_M_01",
        origin="MANUTENCAO",
        equipment="SISTEMA DE PROCESSO",
        failed_component_code="BOMBA",
        failure_mode="Falha de bomba",
        stop_type="Anomalia",
        stop_key_1="BOMBEAMENTO",
        stop_subkey="DEFEITO",
        observations=(
            "bomba apresentou vazamento",
            "bomba não pressurizava devido desgaste",
            "selo da bomba apresentou falha",
            "bomba parou por defeito no acionamento",
        ),
    ),

    Scenario(
        scenario_id="BOMBA_O_01",
        origin="OPERACAO",
        equipment="SISTEMA DE PROCESSO",
        failed_component_code="BOMBA",
        failure_mode="Falha de bomba",
        stop_type="Processo",
        stop_key_1="BOMBEAMENTO",
        stop_subkey="PROCESSO",
        observations=(
            "bomba operou sem alimentação de produto",
            "sequência incorreta deixou bomba sem produto",
            "válvula de processo não foi aberta antes da partida da bomba",
            "procedimento de partida deixou bomba trabalhando sem fluxo",
        ),
    ),

    # ========================================================
    # MOTOR
    # ========================================================

    Scenario(
        scenario_id="MOTOR_M_01",
        origin="MANUTENCAO",
        equipment="TRANSPORTADOR",
        failed_component_code="MOTOR",
        failure_mode="Falha de motor",
        stop_type="Anomalia",
        stop_key_1="ACIONAMENTO",
        stop_subkey="MOTOR",
        observations=(
            "motor queimou durante funcionamento",
            "motor apresentou aquecimento e parou",
            "motor com rolamento danificado",
            "motor apresentou falha elétrica",
        ),
    ),

    Scenario(
        scenario_id="MOTOR_O_01",
        origin="OPERACAO",
        equipment="TRANSPORTADOR",
        failed_component_code="MOTOR",
        failure_mode="Falha de motor",
        stop_type="Processo",
        stop_key_1="ACIONAMENTO",
        stop_subkey="SOBRECARGA",
        observations=(
            "excesso de produto provocou sobrecarga no motor",
            "transportador ficou sobrecarregado após acúmulo de produto",
            "alimentação excessiva elevou carga do acionamento",
            "fluxo inadequado de produto provocou sobrecarga",
        ),
    ),

    # ========================================================
    # INVERSOR
    # ========================================================

    Scenario(
        scenario_id="INVERSOR_M_01",
        origin="MANUTENCAO",
        equipment="TRANSPORTADOR",
        failed_component_code="INVERSOR",
        failure_mode="Falha de inversor",
        stop_type="Anomalia",
        stop_key_1="ACIONAMENTO",
        stop_subkey="INVERSOR",
        observations=(
            "inversor apresentou falha interna",
            "inversor queimou durante funcionamento",
            "inversor apresentou erro de hardware",
            "acionamento parou devido defeito no inversor",
        ),
    ),

    Scenario(
        scenario_id="INVERSOR_O_01",
        origin="OPERACAO",
        equipment="TRANSPORTADOR",
        failed_component_code="INVERSOR",
        failure_mode="Falha de inversor",
        stop_type="Processo",
        stop_key_1="ACIONAMENTO",
        stop_subkey="PARAMETRO",
        observations=(
            "frequência configurada incorretamente no acionamento",
            "parâmetro de velocidade ficou fora do padrão",
            "receita carregou referência incorreta de velocidade",
            "setup alterou velocidade do acionamento incorretamente",
        ),
    ),

    # ========================================================
    # GARRAFA / POSICIONAMENTO
    # ========================================================

    Scenario(
        scenario_id="GUIA_M_01",
        origin="MANUTENCAO",
        equipment="ROTULADORA",
        failed_component_code="GUIA",
        failure_mode="Falha de guia",
        stop_type="Anomalia",
        stop_key_1="GUIA",
        stop_subkey="DESGASTE",
        observations=(
            "guia quebrada provocou travamento de garrafas",
            "guia apresentou desgaste excessivo",
            "suporte da guia quebrou durante produção",
            "guia com folga provocou desalinhamento",
        ),
    ),

    Scenario(
        scenario_id="GUIA_O_01",
        origin="OPERACAO",
        equipment="ROTULADORA",
        failed_component_code="GUIA",
        failure_mode="Falha de guia",
        stop_type="Processo",
        stop_key_1="GUIA",
        stop_subkey="REGULAGEM",
        observations=(
            "guia regulada muito fechada para o formato",
            "ajuste da guia ficou fora da largura da embalagem",
            "setup deixou guia pressionando garrafas",
            "regulagem incorreta da guia provocou travamento",
        ),
    ),

    # ========================================================
    # ACOPLAMENTO
    # ========================================================

    Scenario(
        scenario_id="ACOPLAMENTO_M_01",
        origin="MANUTENCAO",
        equipment="TRANSPORTADOR",
        failed_component_code="ACOPLAMENTO",
        failure_mode="Falha de acoplamento",
        stop_type="Anomalia",
        stop_key_1="TRANSMISSAO",
        stop_subkey="ACOPLAMENTO",
        observations=(
            "acoplamento rompeu durante funcionamento",
            "acoplamento apresentou desgaste",
            "elemento elástico do acoplamento danificado",
            "acoplamento com folga excessiva",
        ),
    ),

    Scenario(
        scenario_id="ACOPLAMENTO_O_01",
        origin="OPERACAO",
        equipment="TRANSPORTADOR",
        failed_component_code="ACOPLAMENTO",
        failure_mode="Falha de acoplamento",
        stop_type="Processo",
        stop_key_1="TRANSMISSAO",
        stop_subkey="CARGA",
        observations=(
            "acúmulo de produto provocou esforço excessivo no conjunto",
            "sobrecarga do transportador após excesso de alimentação",
            "travamento por produto gerou esforço no acionamento",
            "fluxo acima do previsto sobrecarregou o conjunto",
        ),
    ),
)


# ============================================================
# VARIAÇÕES
# ============================================================

LINES = (
    "L01",
    "L02",
    "L03",
    "L04",
    "L05",
    "L06",
)

PREFIXES = (
    "",
    "",
    "",
    "parada por ",
    "identificado ",
    "durante produção ",
    "ocorreu ",
    "verificado ",
)

SUFFIXES = (
    "",
    "",
    "",
    " durante o ciclo",
    " causando parada",
    " com interrupção do equipamento",
    " durante produção",
    " e máquina parou",
)


def remove_accents(
    value: str,
) -> str:
    normalized = (
        unicodedata.normalize(
            "NFKD",
            value,
        )
    )

    return "".join(
        character
        for character
        in normalized
        if not unicodedata.combining(
            character
        )
    )


def normalize_text(
    value: str,
) -> str:
    text = remove_accents(
        value,
    ).upper()

    text = re.sub(
        r"[^A-Z0-9]+",
        " ",
        text,
    )

    return re.sub(
        r"\s+",
        " ",
        text,
    ).strip()


def add_text_noise(
    value: str,
    rng: random.Random,
) -> str:
    result = value

    transformation = (
        rng.randrange(
            7,
        )
    )

    if transformation == 0:
        result = result.lower()

    elif transformation == 1:
        result = result.upper()

    elif transformation == 2:
        result = remove_accents(
            result,
        )

    elif transformation == 3:
        result = (
            result
            .replace(
                "não",
                "nao",
            )
            .replace(
                "válvula",
                "valvula",
            )
            .replace(
                "regulagem",
                "reg.",
            )
        )

    elif transformation == 4:
        result = (
            result
            .replace(
                "apresentou",
                "apres.",
            )
            .replace(
                "incorretamente",
                "incorreto",
            )
        )

    elif transformation == 5:
        result = (
            result
            .replace(
                "durante",
                "dur.",
            )
            .replace(
                "produto",
                "prod.",
            )
        )

    result = re.sub(
        r"\s+",
        " ",
        result,
    ).strip()

    return result


# ============================================================
# CRIAÇÃO DE UMA LINHA
# ============================================================

def generate_variant(
    scenario: Scenario,
    rng: random.Random,
) -> dict[
    str,
    str,
]:
    base_observation = (
        rng.choice(
            scenario.observations,
        )
    )

    prefix = rng.choice(
        PREFIXES,
    )

    suffix = rng.choice(
        SUFFIXES,
    )

    observation = (
        f"{prefix}"
        f"{base_observation}"
        f"{suffix}"
    ).strip()

    observation = (
        add_text_noise(
            observation,
            rng,
        )
    )

    line = rng.choice(
        LINES,
    )

    return {
        "scenario_id":
            scenario.scenario_id,

        "observation":
            observation,

        "equipment":
            scenario.equipment,

        "stop_type":
            scenario.stop_type,

        "stop_key_1":
            scenario.stop_key_1,

        "stop_subkey":
            scenario.stop_subkey,

        "line":
            line,

        "failed_component_code":
            scenario.failed_component_code,

        "failure_mode":
            scenario.failure_mode,

        "failure_origin":
            scenario.origin,
    }


# ============================================================
# DATASET
# ============================================================

def generate_dataset(
    rows_per_scenario: int,
) -> list[
    dict[
        str,
        str,
    ]
]:
    rng = random.Random(
        RANDOM_SEED,
    )

    rows: list[
        dict[
            str,
            str,
        ]
    ] = []

    seen: set[
        tuple[
            str,
            str,
            str,
            str,
            str,
            str,
            str,
        ]
    ] = set()

    for scenario in SCENARIOS:

        generated = 0

        attempts = 0

        max_attempts = (
            rows_per_scenario
            *
            100
        )

        while (
            generated
            <
            rows_per_scenario
        ):
            attempts += 1

            if (
                attempts
                >
                max_attempts
            ):
                raise RuntimeError(
                    "Não foi possível gerar "
                    f"{rows_per_scenario} variações "
                    f"únicas para {scenario.scenario_id}."
                )

            row = (
                generate_variant(
                    scenario,
                    rng,
                )
            )

            unique_key = (
                normalize_text(
                    row[
                        "observation"
                    ]
                ),

                normalize_text(
                    row[
                        "equipment"
                    ]
                ),

                normalize_text(
                    row[
                        "stop_key_1"
                    ]
                ),

                normalize_text(
                    row[
                        "stop_subkey"
                    ]
                ),

                normalize_text(
                    row[
                        "line"
                    ]
                ),

                normalize_text(
                    row[
                        "failure_mode"
                    ]
                ),

                row[
                    "failure_origin"
                ],
            )

            if (
                unique_key
                in
                seen
            ):
                continue

            seen.add(
                unique_key,
            )

            rows.append(
                row,
            )

            generated += 1

    rng.shuffle(
        rows,
    )

    for (
        index,
        row,
    ) in enumerate(
        rows,
        start=1,
    ):
        row[
            "row_id"
        ] = str(
            index,
        )

    return rows


# ============================================================
# VALIDAÇÕES
# ============================================================

FEATURE_COLUMNS = (
    "observation",
    "equipment",
    "stop_type",
    "stop_key_1",
    "stop_subkey",
    "line",
    "failed_component_code",
    "failure_mode",
)


def validate_dataset(
    rows: list[
        dict[
            str,
            str,
        ]
    ],
) -> None:

    if not rows:
        raise RuntimeError(
            "Dataset vazio."
        )

    # --------------------------------------------------------
    # CLASSES
    # --------------------------------------------------------

    classes = {
        row[
            "failure_origin"
        ]
        for row
        in rows
    }

    if classes != {
        "MANUTENCAO",
        "OPERACAO",
    }:
        raise RuntimeError(
            "Classes inesperadas: "
            f"{sorted(classes)}"
        )

    # --------------------------------------------------------
    # LEAKAGE DIRETO
    #
    # Nenhuma feature sintética deve literalmente carregar
    # MANUTENCAO ou OPERACAO.
    # --------------------------------------------------------

    forbidden = (
        "MANUTENCAO",
        "OPERACAO",
    )

    for row in rows:
        feature_text = " ".join(
            row[
                column
            ]
            for column
            in FEATURE_COLUMNS
        )

        normalized = (
            normalize_text(
                feature_text,
            )
        )

        for token in forbidden:
            if token in normalized:
                raise RuntimeError(
                    "Possível target leakage "
                    f"na linha {row['row_id']}: "
                    f"{token}"
                )

    # --------------------------------------------------------
    # CONFLITOS
    #
    # Exatamente o mesmo conjunto de features não pode
    # possuir labels diferentes.
    # --------------------------------------------------------

    label_by_features: dict[
        str,
        str,
    ] = {}

    for row in rows:
        key = " | ".join(
            normalize_text(
                row[
                    column
                ]
            )
            for column
            in FEATURE_COLUMNS
        )

        current = (
            row[
                "failure_origin"
            ]
        )

        previous = (
            label_by_features.get(
                key,
            )
        )

        if (
            previous
            is not None
            and
            previous
            !=
            current
        ):
            raise RuntimeError(
                "Conflito de label encontrado:\n"
                f"{key}\n"
                f"{previous} x {current}"
            )

        label_by_features[
            key
        ] = current


# ============================================================
# RELATÓRIO
# ============================================================

def print_summary(
    rows: list[
        dict[
            str,
            str,
        ]
    ],
    output_path: Path,
) -> None:

    counts: dict[
        str,
        int,
    ] = {}

    scenario_counts: dict[
        str,
        int,
    ] = {}

    component_origins: dict[
        str,
        set[str],
    ] = {}

    for row in rows:

        origin = (
            row[
                "failure_origin"
            ]
        )

        counts[
            origin
        ] = (
            counts.get(
                origin,
                0,
            )
            +
            1
        )

        scenario_id = (
            row[
                "scenario_id"
            ]
        )

        scenario_counts[
            scenario_id
        ] = (
            scenario_counts.get(
                scenario_id,
                0,
            )
            +
            1
        )

        component = (
            row[
                "failed_component_code"
            ]
        )

        component_origins.setdefault(
            component,
            set(),
        ).add(
            origin,
        )

    shared_components = [
        component
        for (
            component,
            origins,
        ) in component_origins.items()
        if origins == {
            "MANUTENCAO",
            "OPERACAO",
        }
    ]

    print(
        "="
        *
        72
    )

    print(
        "EASY MAINTENANCE - DATASET DE ORIGEM v1"
    )

    print(
        "="
        *
        72
    )

    print()

    print(
        f"Arquivo: {output_path}"
    )

    print(
        f"Registros: {len(rows)}"
    )

    print(
        f"Cenários: {len(scenario_counts)}"
    )

    print()

    print(
        "DISTRIBUIÇÃO:"
    )

    for origin in (
        "MANUTENCAO",
        "OPERACAO",
    ):
        count = (
            counts.get(
                origin,
                0,
            )
        )

        percentage = (
            (
                count
                /
                len(rows)
            )
            *
            100
        )

        print(
            f"  {origin:<12}"
            f"{count:>6}"
            f"  ({percentage:>6.2f}%)"
        )

    print()

    print(
        "COMPONENTES PRESENTES NAS DUAS ORIGENS:"
    )

    for component in sorted(
        shared_components,
    ):
        print(
            f"  - {component}"
        )

    print()

    print(
        "Target leakage direto: 0"
    )

    print(
        "Conflitos de label:      0"
    )

    print()

    print(
        "IMPORTANTE:"
    )

    print(
        "Este dataset é sintético e serve apenas para "
        "bootstrap do modelo."
    )

    print(
        "A validação final deverá usar apontamentos reais."
    )

    print(
        "="
        *
        72
    )


# ============================================================
# MAIN
# ============================================================

def main() -> None:

    parser = (
        argparse.ArgumentParser(
            description=(
                "Gera dataset sintético para "
                "classificação de origem da falha."
            )
        )
    )

    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
    )

    parser.add_argument(
        "--rows-per-scenario",
        type=int,
        default=ROWS_PER_SCENARIO,
    )

    args = (
        parser.parse_args()
    )

    if (
        args.rows_per_scenario
        <
        10
    ):
        raise ValueError(
            "--rows-per-scenario deve ser >= 10."
        )

    output_path = (
        Path(
            args.output
        )
        .resolve()
    )

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    rows = (
        generate_dataset(
            args.rows_per_scenario,
        )
    )

    validate_dataset(
        rows,
    )

    fieldnames = (
        "row_id",
        "scenario_id",
        "observation",
        "equipment",
        "stop_type",
        "stop_key_1",
        "stop_subkey",
        "line",
        "failed_component_code",
        "failure_mode",
        "failure_origin",
    )

    with output_path.open(
        "w",
        newline="",
        encoding="utf-8-sig",
    ) as file:

        writer = (
            csv.DictWriter(
                file,
                fieldnames=fieldnames,
            )
        )

        writer.writeheader()

        writer.writerows(
            rows,
        )

    print_summary(
        rows,
        output_path,
    )


if __name__ == "__main__":
    main()