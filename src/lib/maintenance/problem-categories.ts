/* =========================================================
   EASY MAINTENANCE
   CATEGORIAS DE PROBLEMA (VALIDAÇÃO HUMANA)

   Agrupa as sugestões da IA (classification_suggestions) em
   categorias amplas de problema, para permitir uma revisão
   humana em lote (por tipo de problema) em vez de item a
   item.

   A categoria é derivada automaticamente a partir de:
     1. Palavras-chave no modo de falha / observação
        (ex.: "vazamento", "temperatura") — têm prioridade,
        pois descrevem o SINTOMA e cruzam vários componentes.
     2. O componente que falhou (failed_component_code),
        quando nenhuma palavra-chave é encontrada.

   Esta é a ÚNICA fonte de verdade sobre a categoria: o
   mesmo CASE SQL é usado tanto para montar os cards-resumo
   quanto para filtrar a tabela de uma categoria, garantindo
   que os números batem entre as duas telas.
========================================================= */

export interface ProblemCategoryDef {
  slug: string;
  label: string;
  description: string;
}

/* =========================================================
   DEFINIÇÃO DAS CATEGORIAS

   ORDEM IMPORTA: é a ordem de prioridade usada no CASE SQL
   abaixo (a primeira condição que bater vence).
========================================================= */

export const PROBLEM_CATEGORIES: ProblemCategoryDef[] = [
  {
    slug: "vazamentos",
    label: "Vazamentos",
    description: "Ocorrências com indício de vazamento, independente do componente.",
  },
  {
    slug: "temperatura",
    label: "Problemas de temperatura",
    description: "Superaquecimento e outras falhas relacionadas à temperatura.",
  },
  {
    slug: "valvulas",
    label: "Problemas em válvulas",
    description: "Falhas classificadas em válvulas.",
  },
  {
    slug: "rolamentos",
    label: "Problemas em rolamentos",
    description: "Falhas classificadas em rolamentos.",
  },
  {
    slug: "motores",
    label: "Problemas em motores",
    description: "Motores, servos e inversores.",
  },
  {
    slug: "bombas",
    label: "Problemas em bombas",
    description: "Falhas classificadas em bombas.",
  },
  {
    slug: "eletricos",
    label: "Problemas elétricos",
    description: "CLP, IHM, fontes, cabos e comunicação.",
  },
  {
    slug: "transmissao",
    label: "Transmissão mecânica",
    description: "Correias, correntes, redutores, engrenagens e acoplamentos.",
  },
  {
    slug: "pneumatica_hidraulica",
    label: "Pneumática / hidráulica",
    description: "Cilindros, atuadores, mangueiras e vedações.",
  },
  {
    slug: "transporte",
    label: "Transporte e manuseio",
    description: "Transportadores, esteiras, garras, dosadores e alimentadores.",
  },
  {
    slug: "sensores",
    label: "Sensores e instrumentação",
    description: "Falhas classificadas em sensores.",
  },
  {
    slug: "outros",
    label: "Outros problemas",
    description: "Componente não identificado ou sem categoria específica.",
  },
];

export const PROBLEM_CATEGORY_SLUGS = PROBLEM_CATEGORIES.map(
  (category) => category.slug,
);

const CATEGORY_LABEL_BY_SLUG = new Map(
  PROBLEM_CATEGORIES.map((category) => [category.slug, category.label]),
);

export function isValidCategorySlug(
  value: string,
): boolean {
  return CATEGORY_LABEL_BY_SLUG.has(value);
}

export function getCategoryLabel(
  slug: string,
): string {
  return CATEGORY_LABEL_BY_SLUG.get(slug) ?? "Outros problemas";
}

/* =========================================================
   GRUPOS DE COMPONENTE POR CATEGORIA
========================================================= */

const COMPONENT_GROUPS: Record<string, string[]> = {
  valvulas: ["VALVULA"],
  rolamentos: ["ROLAMENTO"],
  motores: ["MOTOR", "SERVO", "INVERSOR"],
  bombas: ["BOMBA"],
  eletricos: [
    "CLP",
    "IHM",
    "FONTE",
    "CABO",
    "SISTEMA_COMUNICACAO",
    "SISTEMA_CONTROLE",
  ],
  transmissao: [
    "CORREIA",
    "CORRENTE",
    "REDUTOR",
    "ENGRENAGEM",
    "ACOPLAMENTO",
  ],
  pneumatica_hidraulica: [
    "CILINDRO",
    "ATUADOR",
    "MANGUEIRA",
    "VEDACAO",
  ],
  transporte: [
    "TRANSPORTADOR",
    "ESTEIRA",
    "ESTRELA",
    "GARRA",
    "BOCAL",
    "DOSADOR",
    "ALIMENTADOR",
    "REJEITOR",
    "SISTEMA_TRANSFERENCIA",
    "SISTEMA_ALIMENTACAO",
    "SISTEMA_REJEICAO",
  ],
  sensores: ["SENSOR"],
};

const LEAK_KEYWORDS = [
  "vazamento",
  "vazando",
  "goteja",
  "gotejando",
];

const TEMPERATURE_KEYWORDS = [
  "temperatura",
  "superaquec",
  "sobreaquec",
  "aquecendo",
  "esquentando",
];

/* =========================================================
   SQL

   Referencia:
     cs.failed_component_code
     cs.failure_mode
     me.observation

   (os aliases `cs` e `me` precisam existir na query onde
   este trecho for usado)
========================================================= */

function likeAnySql(
  column: string,
  keywords: string[],
): string {
  return keywords
    .map((keyword) => `${column} LIKE '%${keyword}%'`)
    .join(" OR ");
}

const TEXT_SOURCE_SQL =
  "LOWER(CONCAT(COALESCE(cs.failure_mode, ''), ' ', COALESCE(me.observation, '')))";

export function buildProblemCategoryCaseSql(): string {
  const whenClauses: string[] = [];

  whenClauses.push(
    `WHEN ${likeAnySql(TEXT_SOURCE_SQL, LEAK_KEYWORDS)} THEN 'vazamentos'`,
  );

  whenClauses.push(
    `WHEN ${likeAnySql(TEXT_SOURCE_SQL, TEMPERATURE_KEYWORDS)} THEN 'temperatura'`,
  );

  for (const [slug, codes] of Object.entries(COMPONENT_GROUPS)) {
    const codesSql = codes
      .map((code) => `'${code}'`)
      .join(", ");

    whenClauses.push(
      `WHEN cs.failed_component_code IN (${codesSql}) THEN '${slug}'`,
    );
  }

  return `
    CASE
      ${whenClauses.join("\n      ")}
      ELSE 'outros'
    END
  `;
}

/* =========================================================
   VERSÃO EM JAVASCRIPT (mesma regra, para uso fora do SQL)
========================================================= */

export function deriveProblemCategorySlug(input: {
  failedComponentCode: string;
  failureMode?: string | null;
  observation?: string | null;
}): string {
  const text = `${input.failureMode ?? ""} ${input.observation ?? ""}`.toLowerCase();

  if (LEAK_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "vazamentos";
  }

  if (TEMPERATURE_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "temperatura";
  }

  for (const [slug, codes] of Object.entries(COMPONENT_GROUPS)) {
    if (codes.includes(input.failedComponentCode)) {
      return slug;
    }
  }

  return "outros";
}
