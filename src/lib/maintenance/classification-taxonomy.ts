/* =========================================================
   EASY MAINTENANCE
   TAXONOMIA DE FALHAS

   REGRA PRINCIPAL:

   failure_mode responde:
   "O QUE FALHOU?"

   failure_mechanism responde:
   "COMO FALHOU?"
========================================================= */

/* =========================================================
   COMPONENTES / ENTIDADES QUE PODEM FALHAR
========================================================= */

export const FAILED_COMPONENT_CODES = [
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
  "FONTE",
  "CABO",
  "MANGUEIRA",
  "BOCAL",
  "GARRA",
  "ESTRELA",
  "TRANSPORTADOR",
  "ESTEIRA",
  "DOSADOR",
  "ALIMENTADOR",
  "VEDACAO",
  "SISTEMA_COMUNICACAO",
  "SISTEMA_CONTROLE",
  "SISTEMA_TRANSFERENCIA",
  "SISTEMA_ALIMENTACAO",
  "SISTEMA_REJEICAO",
  "OUTRO",
  "NAO_IDENTIFICADO",
] as const;

export type FailedComponentCode =
  (typeof FAILED_COMPONENT_CODES)[number];

/* =========================================================
   LABELS
========================================================= */

export const FAILED_COMPONENT_LABELS: Record<
  FailedComponentCode,
  string
> = {
  SENSOR:
    "sensor",

  ROLAMENTO:
    "rolamento",

  BOMBA:
    "bomba",

  CORREIA:
    "correia",

  CORRENTE:
    "corrente",

  VALVULA:
    "válvula",

  MOTOR:
    "motor",

  INVERSOR:
    "inversor",

  REDUTOR:
    "redutor",

  ENGRENAGEM:
    "engrenagem",

  ACOPLAMENTO:
    "acoplamento",

  CILINDRO:
    "cilindro",

  ATUADOR:
    "atuador",

  REJEITOR:
    "rejeitor",

  SERVO:
    "servo",

  CLP:
    "CLP",

  IHM:
    "IHM",

  FONTE:
    "fonte",

  CABO:
    "cabo",

  MANGUEIRA:
    "mangueira",

  BOCAL:
    "bocal",

  GARRA:
    "garra",

  ESTRELA:
    "estrela",

  TRANSPORTADOR:
    "transportador",

  ESTEIRA:
    "esteira",

  DOSADOR:
    "dosador",

  ALIMENTADOR:
    "alimentador",

  VEDACAO:
    "vedação",

  SISTEMA_COMUNICACAO:
    "sistema de comunicação",

  SISTEMA_CONTROLE:
    "sistema de controle",

  SISTEMA_TRANSFERENCIA:
    "sistema de transferência",

  SISTEMA_ALIMENTACAO:
    "sistema de alimentação",

  SISTEMA_REJEICAO:
    "sistema de rejeição",

  OUTRO:
    "outro componente",

  NAO_IDENTIFICADO:
    "não identificada",
};

/* =========================================================
   MECANISMO DA FALHA

   Informação SECUNDÁRIA.

   Não aparece como informação principal do front-end.
========================================================= */

export const FAILURE_MECHANISM_CODES = [
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
  "NAO_IDENTIFICADO",
] as const;

export type FailureMechanismCode =
  (typeof FAILURE_MECHANISM_CODES)[number];

export const FAILURE_MECHANISM_LABELS: Record<
  FailureMechanismCode,
  string
> = {
  QUEBRA:
    "Quebra",

  PARADA:
    "Parada",

  DESARME:
    "Desarme",

  VAZAMENTO:
    "Vazamento",

  TRAVAMENTO:
    "Travamento",

  DESGASTE:
    "Desgaste",

  FOLGA:
    "Folga",

  ROMPIMENTO:
    "Rompimento",

  SEM_DETECCAO:
    "Sem detecção",

  SEM_LEITURA:
    "Sem leitura",

  PERDA_SINAL:
    "Perda de sinal",

  PERDA_COMUNICACAO:
    "Perda de comunicação",

  DESALINHAMENTO:
    "Desalinhamento",

  POSICIONAMENTO_INCORRETO:
    "Posicionamento incorreto",

  SOBREAQUECIMENTO:
    "Sobreaquecimento",

  OBSTRUCAO:
    "Obstrução",

  BAIXO_FLUXO:
    "Baixo fluxo",

  PERDA_PRESSAO:
    "Perda de pressão",

  NAO_IDENTIFICADO:
    "Não identificado",
};

/* =========================================================
   ÁREA TÉCNICA
========================================================= */

export const TECHNICAL_CATEGORIES = [
  "MECANICA",
  "ELETRICA",
  "AUTOMACAO_INSTRUMENTACAO",
  "PNEUMATICA",
  "HIDRAULICA",
  "PROCESSO",
  "OPERACIONAL",
  "QUALIDADE",
  "INDETERMINADA",
] as const;

export type TechnicalCategory =
  (typeof TECHNICAL_CATEGORIES)[number];

/* =========================================================
   FAILURE MODE

   Este é o dado principal do produto.

   Exemplos:

   SENSOR
   → Falha de sensor

   ROLAMENTO
   → Falha de rolamento

   BOMBA
   → Falha de bomba
========================================================= */

export function buildFailureModeLabel(
  code: FailedComponentCode,

  /*
     Mantido apenas temporariamente para compatibilidade
     com telas antigas que ainda passam failureDetail.

     O detalhe NÃO influencia mais failure_mode.
  */
  _legacyDetail?: string | null,
): string {
  void _legacyDetail;
  if (
    code ===
    "NAO_IDENTIFICADO"
  ) {
    return "Falha não identificada";
  }

  return `Falha de ${FAILED_COMPONENT_LABELS[code]}`;
}

/* =========================================================
   HELPERS
========================================================= */

export function buildFailureMechanismLabel(
  code: FailureMechanismCode,
): string {
  return FAILURE_MECHANISM_LABELS[
    code
  ];
}

export function getFailedComponentLabel(
  code: FailedComponentCode,
): string {
  return FAILED_COMPONENT_LABELS[
    code
  ];
}

/* =========================================================
   COMPATIBILIDADE TEMPORÁRIA

   Algumas telas atuais ainda importam:

   FAILURE_MODE_CODES
   FailureModeCode

   Para não quebrarmos o projeto inteiro agora, esses nomes
   passam a representar "o que falhou".

   Depois podemos remover esses aliases.
========================================================= */

export const FAILURE_MODE_CODES =
  FAILED_COMPONENT_CODES;

export type FailureModeCode =
  FailedComponentCode;