/* =========================================================
   FORMATAÇÃO pt-BR

   Vírgula decimal e ponto separando milhar, como o usuário
   da fábrica espera ler.
========================================================= */

const integerFormatter =
  new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  });

const minutesFormatter =
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

const percentFormatter =
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

export function formatInteger(
  value: number,
): string {
  return integerFormatter.format(
    Number.isFinite(value) ? value : 0,
  );
}

/* Minutos sempre com 1 casa decimal. */
export function formatMinutes(
  value: number,
): string {
  return minutesFormatter.format(
    Number.isFinite(value) ? value : 0,
  );
}

export function formatPercent(
  value: number,
): string {
  return `${percentFormatter.format(
    Number.isFinite(value) ? value : 0,
  )}%`;
}

/*
  Variação sempre com sinal, para a leitura não depender só
  da cor.
*/
export function formatChange(
  value: number | null,
): string | null {
  if (value === null) {
    return null;
  }

  const sign = value > 0 ? "+" : "";

  return `${sign}${percentFormatter.format(
    value,
  )}%`;
}

/*
  Título dinâmico com planta, linha e período, exigido em
  todos os gráficos.
*/
export function buildPeriodLabel(
  startDate: string | null,
  endDate: string | null,
): string {
  const format = (value: string) => {
    const [year, month, day] =
      value.split("-");

    return `${day}/${month}/${year}`;
  };

  if (startDate && endDate) {
    return `${format(
      startDate,
    )} a ${format(endDate)}`;
  }

  if (startDate) {
    return `a partir de ${format(
      startDate,
    )}`;
  }

  if (endDate) {
    return `até ${format(endDate)}`;
  }

  return "todo o período";
}

export function buildChartSubtitle(options: {
  city: string | null;
  line: string | null;
  equipment: string | null;
  startDate: string | null;
  endDate: string | null;
}): string {
  const parts = [
    options.city || "Planta",
  ];

  if (options.line) {
    parts.push(options.line);
  }

  if (options.equipment) {
    parts.push(options.equipment);
  }

  parts.push(
    buildPeriodLabel(
      options.startDate,
      options.endDate,
    ),
  );

  return parts.join(" · ");
}
