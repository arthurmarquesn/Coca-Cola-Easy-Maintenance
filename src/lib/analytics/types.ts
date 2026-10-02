/* =========================================================
   TIPOS COMPARTILHADOS DOS GRÁFICOS COMPLEMENTARES
========================================================= */

/*
  Uma ocorrência já normalizada, do jeito que as funções de
  agregação esperam receber. Cada linha da planilha vira um
  AnalyticsEvent.

  Os campos opcionais chegam como null quando a planilha veio
  sem o dado. As funções de agregação precisam tratar isso
  sem quebrar.
*/
export interface AnalyticsEvent {
  id: number;

  /* AAAA-MM-DD. null quando a planilha não trouxe a data. */
  date: string | null;

  line: string | null;

  equipment: string | null;

  /* Coluna D. "P.EQ.LINHA" = parada de manutenção. */
  stopType: string | null;

  /* Coluna H. "1", "2" ou "3". */
  shift: string | null;

  /* Coluna I. Faixa horária de 1 hora. */
  intervalLabel: string | null;

  /* Coluna M, já sem o número de Ordem de Serviço. */
  observation: string | null;

  /*
    Minutos de parada. Nulo na planilha vira 0, mas a
    ocorrência continua contando em Q.
  */
  downtimeMinutes: number;

  /* Classe de falha, ou UNCLASSIFIED_LABEL. */
  failureMode: string;

  /* true quando a classificação automática não identificou. */
  unclassified: boolean;
}

export interface AnalyticsFilters {
  startDate: string | null;
  endDate: string | null;
  line: string | null;
  equipment: string | null;
}

/*
  Trio de métricas usado em quase todos os gráficos.

  Q    = quantidade de paradas (ocorrências)
  T    = soma dos minutos de parada
  MTTR = T / Q
*/
export interface Metrics {
  occurrences: number;
  downtimeMinutes: number;
  mttr: number;
}

export interface LabeledMetrics extends Metrics {
  label: string;
}
