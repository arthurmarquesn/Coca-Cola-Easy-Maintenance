from __future__ import annotations

from dataclasses import dataclass


# ============================================================
# ESPECIFICAÇÃO DE COMPONENTE
# ============================================================

@dataclass(frozen=True)
class ComponentSpec:
    code: str
    names: list[str]
    mechanisms: list[str]
    system: str
    technical_category: str


# ============================================================
# MECANISMOS DE FALHA
#
# IMPORTANTE:
#
# O mecanismo responde:
# "COMO FALHOU?"
#
# Ele NÃO representa o failure_mode principal.
#
# Exemplo:
#
# sensor quebrou
# sensor parou
# sensor não detecta
#
# Em todos os casos:
#
# failed_component_code = SENSOR
# failure_mode = Falha de sensor
#
# O mecanismo varia:
#
# QUEBRA
# PARADA
# SEM_DETECCAO
# ============================================================

MECHANISM_TEMPLATES: dict[str, list[str]] = {
    "QUEBRA": [
        "{component} quebrou",
        "quebrou {component}",
        "{component} quebrado",
        "identificada quebra no {component}",
    ],

    "PARADA": [
        "{component} parou",
        "{component} não funciona",
        "{component} fora de operação",
        "{component} parou de funcionar",
    ],

    "DESARME": [
        "{component} desarmou",
        "desarme do {component}",
        "{component} desarmado",
        "ocorreu desarme no {component}",
    ],

    "VAZAMENTO": [
        "{component} vazando",
        "vazamento no {component}",
        "identificado vazamento no {component}",
        "{component} com vazamento",
    ],

    "TRAVAMENTO": [
        "{component} travou",
        "{component} travado",
        "travamento no {component}",
        "{component} preso",
    ],

    "DESGASTE": [
        "{component} desgastado",
        "desgaste no {component}",
        "{component} com desgaste",
        "desgaste excessivo do {component}",
    ],

    "FOLGA": [
        "{component} com folga",
        "folga no {component}",
        "{component} apresenta folga",
        "excesso de folga no {component}",
    ],

    "ROMPIMENTO": [
        "{component} rompeu",
        "{component} rompido",
        "rompimento do {component}",
        "{component} partiu",
    ],

    "SEM_DETECCAO": [
        "{component} não detecta garrafa",
        "{component} sem detecção",
        "{component} não identifica produto",
        "{component} não reconhece presença",
    ],

    "SEM_LEITURA": [
        "{component} sem leitura",
        "{component} não realiza leitura",
        "erro de leitura no {component}",
        "{component} apresenta leitura incorreta",
    ],

    "PERDA_SINAL": [
        "{component} sem sinal",
        "perda de sinal no {component}",
        "sinal do {component} oscilando",
        "{component} com sinal intermitente",
    ],

    "PERDA_COMUNICACAO": [
        "{component} sem comunicação",
        "perda de comunicação com {component}",
        "{component} não comunica",
        "{component} fora da rede",
    ],

    "DESALINHAMENTO": [
        "{component} desalinhado",
        "desalinhamento do {component}",
        "{component} fora de alinhamento",
        "necessário alinhar {component}",
    ],

    "POSICIONAMENTO_INCORRETO": [
        "{component} fora de posição",
        "{component} não posiciona",
        "posição incorreta do {component}",
        "{component} não retorna à posição",
    ],

    "SOBREAQUECIMENTO": [
        "{component} superaquecendo",
        "sobreaquecimento do {component}",
        "{component} muito quente",
        "{component} com temperatura elevada",
    ],

    "OBSTRUCAO": [
        "{component} obstruído",
        "obstrução no {component}",
        "{component} entupido",
        "{component} bloqueado",
    ],

    "BAIXO_FLUXO": [
        "{component} com baixo fluxo",
        "{component} sem vazão",
        "fluxo baixo no {component}",
        "{component} com vazão insuficiente",
    ],

    "PERDA_PRESSAO": [
        "{component} com baixa pressão",
        "perda de pressão no {component}",
        "pressão caiu no {component}",
        "{component} sem pressão",
    ],
}


# ============================================================
# COMPONENTES
#
# Cada ComponentSpec representa uma CLASSE PRINCIPAL do
# primeiro Modelo ML.
#
# Exemplo:
#
# code = ROLAMENTO
#
# Frases possíveis:
# - rolamento quebrou
# - rolamento travou
# - rolamento desgastado
# - rolamento com folga
#
# Todas pertencem à mesma classe:
# ROLAMENTO
#
# E no front-end:
# Falha de rolamento
# ============================================================

COMPONENT_SPECS: list[ComponentSpec] = [

    ComponentSpec(
        code="SENSOR",
        names=[
            "sensor",
            "sensor de presença",
            "sensor de garrafa",
            "fotocélula",
            "sensor indutivo",
            "sensor de nível",
            "sensor de posição",
        ],
        mechanisms=[
            "QUEBRA",
            "PARADA",
            "SEM_DETECCAO",
            "SEM_LEITURA",
            "PERDA_SINAL",
        ],
        system="Sensoriamento",
        technical_category="AUTOMACAO_INSTRUMENTACAO",
    ),

    ComponentSpec(
        code="ROLAMENTO",
        names=[
            "rolamento",
            "rolamento da esteira",
            "rolamento do transportador",
            "rolamento do motor",
            "rolamento do forno",
        ],
        mechanisms=[
            "QUEBRA",
            "TRAVAMENTO",
            "DESGASTE",
            "FOLGA",
            "SOBREAQUECIMENTO",
        ],
        system="Mecânico",
        technical_category="MECANICA",
    ),

    ComponentSpec(
        code="BOMBA",
        names=[
            "bomba",
            "bomba de carbonato",
            "bomba de xarope",
            "bomba de água",
            "bomba de dosagem",
            "bomba CIP",
        ],
        mechanisms=[
            "PARADA",
            "DESARME",
            "VAZAMENTO",
            "TRAVAMENTO",
            "BAIXO_FLUXO",
            "SOBREAQUECIMENTO",
        ],
        system="Bombeamento",
        technical_category="INDETERMINADA",
    ),

    ComponentSpec(
        code="CORREIA",
        names=[
            "correia",
            "correia da esteira",
            "correia do transportador",
            "correia de transmissão",
        ],
        mechanisms=[
            "ROMPIMENTO",
            "DESGASTE",
            "DESALINHAMENTO",
            "FOLGA",
            "PARADA",
        ],
        system="Transmissão",
        technical_category="MECANICA",
    ),

    ComponentSpec(
        code="CORRENTE",
        names=[
            "corrente",
            "corrente transportadora",
            "corrente da esteira",
            "corrente de transmissão",
        ],
        mechanisms=[
            "ROMPIMENTO",
            "DESGASTE",
            "FOLGA",
            "TRAVAMENTO",
            "DESALINHAMENTO",
        ],
        system="Transmissão",
        technical_category="MECANICA",
    ),

    ComponentSpec(
        code="VALVULA",
        names=[
            "válvula",
            "válvula pneumática",
            "válvula de processo",
            "válvula de carbonato",
            "válvula de água",
            "válvula de dosagem",
        ],
        mechanisms=[
            "PARADA",
            "VAZAMENTO",
            "TRAVAMENTO",
            "PERDA_PRESSAO",
        ],
        system="Controle de fluxo",
        technical_category="INDETERMINADA",
    ),

    ComponentSpec(
        code="MOTOR",
        names=[
            "motor",
            "motor da esteira",
            "motor do transportador",
            "motor da bomba",
        ],
        mechanisms=[
            "PARADA",
            "DESARME",
            "TRAVAMENTO",
            "SOBREAQUECIMENTO",
        ],
        system="Acionamento",
        technical_category="ELETRICA",
    ),

    ComponentSpec(
        code="INVERSOR",
        names=[
            "inversor",
            "inversor de frequência",
            "inversor da esteira",
            "inversor do motor",
        ],
        mechanisms=[
            "PARADA",
            "DESARME",
            "PERDA_COMUNICACAO",
            "SOBREAQUECIMENTO",
        ],
        system="Acionamento",
        technical_category="ELETRICA",
    ),

    ComponentSpec(
        code="REDUTOR",
        names=[
            "redutor",
            "redutor da esteira",
            "redutor do transportador",
        ],
        mechanisms=[
            "QUEBRA",
            "TRAVAMENTO",
            "DESGASTE",
            "FOLGA",
            "SOBREAQUECIMENTO",
        ],
        system="Transmissão",
        technical_category="MECANICA",
    ),

    ComponentSpec(
        code="ENGRENAGEM",
        names=[
            "engrenagem",
            "engrenagem de transmissão",
            "engrenagem do redutor",
        ],
        mechanisms=[
            "QUEBRA",
            "DESGASTE",
            "FOLGA",
            "TRAVAMENTO",
        ],
        system="Transmissão",
        technical_category="MECANICA",
    ),

    ComponentSpec(
        code="ACOPLAMENTO",
        names=[
            "acoplamento",
            "acoplamento do motor",
            "acoplamento da bomba",
        ],
        mechanisms=[
            "QUEBRA",
            "DESGASTE",
            "FOLGA",
            "DESALINHAMENTO",
        ],
        system="Transmissão",
        technical_category="MECANICA",
    ),

    ComponentSpec(
        code="CILINDRO",
        names=[
            "cilindro",
            "cilindro pneumático",
            "cilindro do rejeitor",
        ],
        mechanisms=[
            "PARADA",
            "VAZAMENTO",
            "TRAVAMENTO",
            "PERDA_PRESSAO",
            "POSICIONAMENTO_INCORRETO",
        ],
        system="Pneumático",
        technical_category="PNEUMATICA",
    ),

    ComponentSpec(
        code="ATUADOR",
        names=[
            "atuador",
            "atuador pneumático",
            "atuador linear",
            "atuador elétrico",
        ],
        mechanisms=[
            "PARADA",
            "TRAVAMENTO",
            "POSICIONAMENTO_INCORRETO",
            "PERDA_PRESSAO",
        ],
        system="Atuação",
        technical_category="INDETERMINADA",
    ),

    ComponentSpec(
        code="REJEITOR",
        names=[
            "rejeitor",
            "rejeitor linear",
            "rejeitor pneumático",
            "sistema de rejeição",
        ],
        mechanisms=[
            "PARADA",
            "TRAVAMENTO",
            "POSICIONAMENTO_INCORRETO",
            "PERDA_PRESSAO",
        ],
        system="Rejeição",
        technical_category="AUTOMACAO_INSTRUMENTACAO",
    ),

    ComponentSpec(
        code="SERVO",
        names=[
            "servo",
            "servo motor",
            "servo drive",
            "servo do rejeitor",
        ],
        mechanisms=[
            "PARADA",
            "DESARME",
            "PERDA_COMUNICACAO",
            "POSICIONAMENTO_INCORRETO",
        ],
        system="Movimento",
        technical_category="AUTOMACAO_INSTRUMENTACAO",
    ),

    ComponentSpec(
        code="CLP",
        names=[
            "CLP",
            "controlador",
            "controlador lógico",
        ],
        mechanisms=[
            "PARADA",
            "PERDA_COMUNICACAO",
            "PERDA_SINAL",
        ],
        system="Controle",
        technical_category="AUTOMACAO_INSTRUMENTACAO",
    ),

    ComponentSpec(
        code="IHM",
        names=[
            "IHM",
            "interface homem máquina",
            "painel IHM",
        ],
        mechanisms=[
            "PARADA",
            "PERDA_COMUNICACAO",
            "PERDA_SINAL",
        ],
        system="Supervisão",
        technical_category="AUTOMACAO_INSTRUMENTACAO",
    ),

    ComponentSpec(
        code="CABO",
        names=[
            "cabo",
            "cabo elétrico",
            "cabo de sinal",
            "cabo de comunicação",
        ],
        mechanisms=[
            "ROMPIMENTO",
            "QUEBRA",
            "PERDA_SINAL",
            "PERDA_COMUNICACAO",
        ],
        system="Interligação",
        technical_category="ELETRICA",
    ),

    ComponentSpec(
        code="MANGUEIRA",
        names=[
            "mangueira",
            "mangueira pneumática",
            "mangueira de processo",
            "mangueira de ar",
        ],
        mechanisms=[
            "ROMPIMENTO",
            "VAZAMENTO",
            "OBSTRUCAO",
            "PERDA_PRESSAO",
        ],
        system="Fluidos",
        technical_category="INDETERMINADA",
    ),

    ComponentSpec(
        code="BOCAL",
        names=[
            "bocal",
            "bocal da enchedora",
            "bico de enchimento",
        ],
        mechanisms=[
            "QUEBRA",
            "TRAVAMENTO",
            "OBSTRUCAO",
            "POSICIONAMENTO_INCORRETO",
        ],
        system="Enchimento",
        technical_category="MECANICA",
    ),

    ComponentSpec(
        code="GARRA",
        names=[
            "garra",
            "garra da máquina",
            "garra de transferência",
        ],
        mechanisms=[
            "QUEBRA",
            "TRAVAMENTO",
            "DESGASTE",
            "POSICIONAMENTO_INCORRETO",
        ],
        system="Manipulação",
        technical_category="MECANICA",
    ),

    ComponentSpec(
        code="ESTRELA",
        names=[
            "estrela",
            "estrela de entrada",
            "estrela de saída",
            "estrela de transferência",
        ],
        mechanisms=[
            "QUEBRA",
            "TRAVAMENTO",
            "DESGASTE",
            "DESALINHAMENTO",
            "POSICIONAMENTO_INCORRETO",
        ],
        system="Transferência",
        technical_category="MECANICA",
    ),

    ComponentSpec(
        code="TRANSPORTADOR",
        names=[
            "transportador",
            "transportador de garrafas",
            "transportador de caixas",
        ],
        mechanisms=[
            "PARADA",
            "TRAVAMENTO",
            "DESALINHAMENTO",
        ],
        system="Movimentação",
        technical_category="MECANICA",
    ),

    ComponentSpec(
        code="DOSADOR",
        names=[
            "dosador",
            "dosador de produto",
            "sistema de dosagem",
        ],
        mechanisms=[
            "PARADA",
            "OBSTRUCAO",
            "BAIXO_FLUXO",
        ],
        system="Dosagem",
        technical_category="PROCESSO",
    ),

    ComponentSpec(
        code="ALIMENTADOR",
        names=[
            "alimentador",
            "alimentador de tampas",
            "alimentador de garrafas",
        ],
        mechanisms=[
            "PARADA",
            "TRAVAMENTO",
            "OBSTRUCAO",
        ],
        system="Alimentação",
        technical_category="PROCESSO",
    ),
]


# ============================================================
# ÍNDICE
# ============================================================

COMPONENT_SPEC_BY_CODE = {
    spec.code: spec
    for spec in COMPONENT_SPECS
}