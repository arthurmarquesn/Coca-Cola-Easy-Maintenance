/**
 * Dados do dashboard de confiabilidade.
 *
 * Por enquanto os dados são mockados, pois o banco ainda não possui
 * tabelas de manutenção/confiabilidade (schema atual só tem `units`
 * e `users`).
 *
 * `getReliabilityData` é o único ponto de acesso aos dados: quando o
 * backend estiver pronto, basta trocar a implementação desta função
 * por uma consulta real (via `@/lib/db`) mantendo a mesma assinatura
 * e o mesmo formato de retorno.
 */

export type AnalysisType =
  | "equipamentos"
  | "linhas"
  | "modos-falha";

export type Quadrant =
  | "critico"
  | "critico-cronico"
  | "conforto"
  | "cronico";

export interface KpiSummary {
  paradas: number;
  minutos: number;
  criticos: number;
  critCronico: number;
}

export interface ParetoEntry {
  id: string;
  label: string;
  minutes: number;
  cumulativePct: number;
}

export interface JackKnifeEntry {
  id: string;
  label: string;
  failureCount: number;
  meanTimeToRepair: number;
  occurrences: number;
  quadrant: Quadrant;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface PeriodOption extends FilterOption {
  range: {
    from: string;
    to: string;
  };
}

export interface FilterOptions {
  units: FilterOption[];
  lines: FilterOption[];
  periods: PeriodOption[];
  turnos: FilterOption[];
  equipamentos: FilterOption[];
  sistemas: FilterOption[];
  subsistemas: FilterOption[];
}

export interface ReliabilityDataset {
  summary: KpiSummary;
  totalRecordsLabel: string;
  totalUnitsLabel: string;
  pareto: ParetoEntry[];
  jackKnife: JackKnifeEntry[];
  filterOptions: FilterOptions;
}

export interface ReliabilityFilters {
  analysisType?: AnalysisType;
  period?: string;
  customFrom?: string;
  customTo?: string;
  unit?: string;
  line?: string;
  turno?: string;
  equipamento?: string;
  sistema?: string;
  subsistema?: string;
  topN?: number;
}

/* =========================================================
   RÓTULOS POR TIPO DE ANÁLISE

   O eixo do Pareto muda de nome conforme o tipo de análise
   selecionado (equipamentos, linhas de produção ou modos de
   falha).
========================================================= */

const PARETO_LABELS: Record<AnalysisType, string[]> = {
  equipamentos: [
    "Envasadora 04",
    "Rotuladora 02",
    "Paletizadora 01",
    "Sopradora PET 03",
    "Compressor de Ar 01",
    "Esteira Transportadora 07",
    "Pasteurizador 02",
    "Datador a Laser 01",
    "Robô Paletizador 02",
    "Misturador de Xarope 01",
  ],
  linhas: [
    "Linha 01 - PET 600ml",
    "Linha 02 - PET 2L",
    "Linha 03 - Lata 350ml",
    "Linha 04 - Vidro Retornável",
    "Linha 05 - PET 1,5L",
    "Linha 06 - Lata 269ml",
    "Linha 07 - PET 300ml",
    "Linha 08 - Caixa de Papelão",
    "Linha 09 - Vidro NR",
    "Linha 10 - PET 1L",
  ],
  "modos-falha": [
    "Falha elétrica",
    "Desgaste mecânico",
    "Sensor desregulado",
    "Vazamento pneumático",
    "Falha de software/CLP",
    "Ruptura de correia",
    "Superaquecimento",
    "Obstrução de esteira",
    "Falha de vedação",
    "Desalinhamento",
  ],
};

/* =========================================================
   GERADOR DETERMINÍSTICO DO PARETO
========================================================= */

function buildParetoEntries(
  analysisType: AnalysisType,
): ParetoEntry[] {
  const labels = PARETO_LABELS[analysisType];

  // Minutos de parada decrescentes, formato clássico de Pareto.
  const minutesByRank = [
    420, 365, 210, 150, 120, 95, 78, 62, 48, 35,
  ];

  const totalMinutes = minutesByRank.reduce(
    (sum, value) => sum + value,
    0,
  );

  let accumulated = 0;

  return labels.map((label, index) => {
    accumulated += minutesByRank[index];

    return {
      id: `pareto-${index}`,
      label,
      minutes: minutesByRank[index],
      cumulativePct: Number(
        ((accumulated / totalMinutes) * 100).toFixed(1),
      ),
    };
  });
}

/* =========================================================
   GERADOR DETERMINÍSTICO DO JACK KNIFE
========================================================= */

const JACK_KNIFE_ENTRIES: JackKnifeEntry[] = [
  // Crítico (poucas falhas, alto tempo de reparo) — laranja
  { id: "jk-01", label: "Sopradora PET 03", failureCount: 3, meanTimeToRepair: 88, occurrences: 3, quadrant: "critico" },
  { id: "jk-02", label: "Compressor de Ar 01", failureCount: 5, meanTimeToRepair: 62, occurrences: 5, quadrant: "critico" },

  // Crítico-crônico (muitas falhas, alto tempo de reparo) — vermelho
  { id: "jk-03", label: "Envasadora 04", failureCount: 34, meanTimeToRepair: 95, occurrences: 34, quadrant: "critico-cronico" },
  { id: "jk-04", label: "Rotuladora 02", failureCount: 14, meanTimeToRepair: 58, occurrences: 14, quadrant: "critico-cronico" },
  { id: "jk-05", label: "Paletizadora 01", failureCount: 26, meanTimeToRepair: 54, occurrences: 26, quadrant: "critico-cronico" },

  // Conforto (poucas falhas, baixo tempo de reparo) — verde
  { id: "jk-06", label: "Datador a Laser 01", failureCount: 4, meanTimeToRepair: 18, occurrences: 4, quadrant: "conforto" },
  { id: "jk-07", label: "Misturador de Xarope 01", failureCount: 2, meanTimeToRepair: 12, occurrences: 2, quadrant: "conforto" },

  // Crônico (muitas falhas, baixo tempo de reparo) — azul
  { id: "jk-08", label: "Esteira Transportadora 07", failureCount: 22, meanTimeToRepair: 22, occurrences: 22, quadrant: "cronico" },
  { id: "jk-09", label: "Robô Paletizador 02", failureCount: 31, meanTimeToRepair: 15, occurrences: 31, quadrant: "cronico" },
];

/* =========================================================
   OPÇÕES DE FILTRO
========================================================= */

const FILTER_OPTIONS: FilterOptions = {
  units: [
    { value: "all", label: "Todas (12)" },
    { value: "baag", label: "BAAG - Itabirito" },
    { value: "baad", label: "BAAD - Jundiaí" },
    { value: "baae", label: "BAAE - Mogi" },
    { value: "baaj", label: "BAAJ - Maringá" },
    { value: "baar", label: "BAAR - Santa Maria" },
    { value: "baal", label: "BAAL - Antônio Carlos" },
    { value: "baaf", label: "BAAF - Campo Grande" },
    { value: "baao", label: "BAAO - Porto Alegre" },
    { value: "b0ac", label: "B0AC - Bauru" },
    { value: "baai", label: "BAAI - Curitiba" },
    { value: "baak", label: "BAAK - Marília" },
    { value: "b2bh", label: "B2BH - Antônio Prado" },
  ],
  lines: [
    { value: "all", label: "Todas" },
    { value: "linha001", label: "LINHA001" },
    { value: "linha002", label: "LINHA002" },
    { value: "linha003", label: "LINHA003" },
    { value: "linha004", label: "LINHA004" },
    { value: "linha005", label: "LINHA005" },
    { value: "linha006", label: "LINHA006" },
    { value: "linha007", label: "LINHA007" },
    { value: "linha008", label: "LINHA008" },
    { value: "multi006", label: "MULTI006" },
    { value: "multi009", label: "MULTI009" },
  ],
  periods: [
    {
      value: "7d",
      label: "Últimos 7 dias",
      range: { from: "24/09", to: "30/09/2026" },
    },
    {
      value: "30d",
      label: "Últimos 30 dias",
      range: { from: "01/09", to: "30/09/2026" },
    },
    {
      value: "90d",
      label: "Últimos 90 dias",
      range: { from: "03/07", to: "30/09/2026" },
    },
    {
      value: "custom",
      label: "Personalizado...",
      range: { from: "", to: "" },
    },
  ],
  turnos: [
    { value: "all", label: "Todos os turnos" },
    { value: "turno-1", label: "Turno 1" },
    { value: "turno-2", label: "Turno 2" },
    { value: "turno-3", label: "Turno 3" },
  ],
  equipamentos: [
    { value: "all", label: "Todos os equipamentos" },
    { value: "envasadora-04", label: "Envasadora 04" },
    { value: "rotuladora-02", label: "Rotuladora 02" },
    { value: "paletizadora-01", label: "Paletizadora 01" },
    { value: "sopradora-pet-03", label: "Sopradora PET 03" },
    { value: "compressor-ar-01", label: "Compressor de Ar 01" },
    { value: "esteira-07", label: "Esteira Transportadora 07" },
    { value: "pasteurizador-02", label: "Pasteurizador 02" },
    { value: "datador-laser-01", label: "Datador a Laser 01" },
    { value: "robo-paletizador-02", label: "Robô Paletizador 02" },
    { value: "misturador-xarope-01", label: "Misturador de Xarope 01" },
  ],
  sistemas: [
    { value: "all", label: "Todos os sistemas" },
    { value: "eletrico", label: "Sistema Elétrico" },
    { value: "motriz", label: "Sistema Motriz" },
    { value: "instrumentos", label: "Sistema de Instrumentos" },
    { value: "pneumatico", label: "Sistema Pneumático" },
    { value: "estrutura", label: "Estrutura" },
  ],
  subsistemas: [
    { value: "all", label: "Todos os subsistemas" },
    { value: "cadeia-transmissao", label: "Cadeia de transmissão" },
    { value: "painel-controle", label: "Painel de controle" },
    { value: "qualidade-pecas", label: "Qualidade de peças" },
    { value: "transportador-desnivelado", label: "Transportador desnivelado" },
  ],
};

const KPI_SUMMARY: KpiSummary = {
  paradas: 1234,
  minutos: 125000,
  criticos: 18,
  critCronico: 5,
};

/* =========================================================
   FUNÇÃO PRINCIPAL

   Ponto único de acesso aos dados do dashboard. Hoje retorna
   dados mockados; no futuro deve passar a consultar o banco
   (via `@/lib/db`), mantendo a mesma assinatura.
========================================================= */

export async function getReliabilityData(
  filters: ReliabilityFilters = {},
): Promise<ReliabilityDataset> {
  const analysisType =
    filters.analysisType ?? "equipamentos";

  return {
    summary: KPI_SUMMARY,
    totalRecordsLabel: "94.321 registros",
    totalUnitsLabel: "12 unidades",
    pareto: buildParetoEntries(analysisType),
    jackKnife: JACK_KNIFE_ENTRIES,
    filterOptions: FILTER_OPTIONS,
  };
}
