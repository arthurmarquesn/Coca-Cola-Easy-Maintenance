/* =========================================================
   MODOS DE FALHA PADRONIZADOS
========================================================= */

export const FAILURE_MODE_CODES = [
  "FALHA_SENSOR",
  "FALHA_DETECCAO",
  "FALHA_LEITURA",
  "FALHA_SINAL",
  "FALHA_COMUNICACAO",

  "DESARME",

  "FALHA_ACIONAMENTO",
  "FALHA_CONTROLE",

  "TRAVAMENTO",
  "DESALINHAMENTO",
  "FALHA_POSICIONAMENTO",

  "QUEBRA",
  "ROMPIMENTO",
  "DESGASTE",
  "FOLGA",

  "VAZAMENTO",
  "OBSTRUCAO",

  "FALHA_TRANSFERENCIA",
  "FALHA_REJEICAO",

  "FALHA_ABERTURA",
  "FALHA_FECHAMENTO",

  "PERDA_PRESSAO",
  "FALHA_FLUXO",

  "SOBREAQUECIMENTO",

  "FALHA_ALIMENTACAO",

  "FALHA_TRANSMISSAO",

  "FALHA_VEDACAO",

  "FALHA_FIXACAO",

  "AJUSTE_REGULAGEM",

  "FALHA_NAO_IDENTIFICADA",
] as const;

export type FailureModeCode =
  (typeof FAILURE_MODE_CODES)[number];

/* =========================================================
   ÁREA TÉCNICA

   NÃO é a classificação principal.
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
   LABEL BASE
========================================================= */

const FAILURE_MODE_LABELS: Record<
  FailureModeCode,
  string
> = {
  FALHA_SENSOR:
    "Falha de sensor",

  FALHA_DETECCAO:
    "Falha de detecção",

  FALHA_LEITURA:
    "Falha de leitura",

  FALHA_SINAL:
    "Falha de sinal",

  FALHA_COMUNICACAO:
    "Falha de comunicação",

  DESARME:
    "Desarme",

  FALHA_ACIONAMENTO:
    "Falha de acionamento",

  FALHA_CONTROLE:
    "Falha de controle",

  TRAVAMENTO:
    "Travamento",

  DESALINHAMENTO:
    "Desalinhamento",

  FALHA_POSICIONAMENTO:
    "Falha de posicionamento",

  QUEBRA:
    "Quebra",

  ROMPIMENTO:
    "Rompimento",

  DESGASTE:
    "Desgaste",

  FOLGA:
    "Folga",

  VAZAMENTO:
    "Vazamento",

  OBSTRUCAO:
    "Obstrução",

  FALHA_TRANSFERENCIA:
    "Falha de transferência",

  FALHA_REJEICAO:
    "Falha de rejeição",

  FALHA_ABERTURA:
    "Falha de abertura",

  FALHA_FECHAMENTO:
    "Falha de fechamento",

  PERDA_PRESSAO:
    "Perda de pressão",

  FALHA_FLUXO:
    "Falha de fluxo",

  SOBREAQUECIMENTO:
    "Sobreaquecimento",

  FALHA_ALIMENTACAO:
    "Falha de alimentação",

  FALHA_TRANSMISSAO:
    "Falha de transmissão",

  FALHA_VEDACAO:
    "Falha de vedação",

  FALHA_FIXACAO:
    "Falha de fixação",

  AJUSTE_REGULAGEM:
    "Ajuste / regulagem",

  FALHA_NAO_IDENTIFICADA:
    "Falha não identificada",
};

/* =========================================================
   NORMALIZA DETALHE
========================================================= */

export function normalizeFailureDetail(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  let text =
    value
      .trim()
      .replace(/\s+/g, " ");

  if (!text) {
    return null;
  }

  /*
     O detalhe deve continuar curto.

     Não queremos reproduzir a observação inteira.
  */

  const words =
    text.split(" ");

  if (words.length > 5) {
    text =
      words
        .slice(0, 5)
        .join(" ");
  }

  if (text.length > 60) {
    text =
      text.slice(0, 60);
  }

  return text;
}

/* =========================================================
   CLASSIFICAÇÃO VISÍVEL
========================================================= */

export function buildFailureModeLabel(
  failureModeCode: FailureModeCode,
  failureDetail: string | null,
): string {
  const base =
    FAILURE_MODE_LABELS[
      failureModeCode
    ];

  const detail =
    normalizeFailureDetail(
      failureDetail,
    );

  if (
    !detail ||
    failureModeCode ===
      "FALHA_NAO_IDENTIFICADA"
  ) {
    return base;
  }

  /*
     Usamos "—" de propósito.

     Isso evita frases linguisticamente estranhas como:

     "Falha de detecção de presença de garrafa"

     e preserva uma estrutura consistente:

     Falha de detecção — presença de garrafa
     Desarme — bomba de carbonato
     Travamento — bocal
  */

  return `${base} — ${detail}`;
}   