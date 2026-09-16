// Dashboard operational types

export interface Operacao {
  status: "normal" | "atencao" | "critico" | "indisponivel";
  mensagem: string;
  ultimaAtualizacao: Date;
  ocorrenciasCriticas: number;
  ocorrenciasParaPriorizar: number;
}

export interface KPI {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  variation?: number; // percentage
  trend?: "up" | "down" | "stable";
  status?: "normal" | "warning" | "critical";
  description?: string;
  sparkline?: number[];
  isCritical?: boolean;
}

export interface ParetoItem {
  id: string;
  label: string;
  causa: string;
  minutos: number;
  percentual: number;
  percentualAcumulado: number;
  frequencia?: number;
}

export interface JackKnifePoint {
  id: string;
  causa: string;
  frequencia: number;
  impacto: number;
  minutos: number;
  quadrante: "altoimp-altafreq" | "altoimp-baixafreq" | "baixoimp-altafreq" | "baixoimp-baixafreq";
}

export interface ProblemaEmAcao {
  id: string;
  posicao: number;
  codigo: string;
  descricao?: string;
  minutos: number;
  impacto: "critico" | "alto" | "medio" | "baixo";
  frequencia?: number;
  status?: "novo" | "em-acompanhamento" | "resolvido";
}

export interface FiltroContexto {
  planta: string;
  linha: string;
  produto: string;
  dataInicial: Date;
  dataFinal: Date;
  indicador: string;
  topCausas: number;
}

export interface DashboardState {
  operacao: Operacao;
  kpis: KPI[];
  pareto: ParetoItem[];
  jackKnife: JackKnifePoint[];
  problemasEmAcao: ProblemaEmAcao[];
  filtro: FiltroContexto;
  isLoading: boolean;
}
