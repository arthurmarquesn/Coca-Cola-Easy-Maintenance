/* =========================================================
   CABEÇALHOS DA PLANILHA

   Compara cabeçalhos ignorando acentos, caixa, pontuação e
   espaços repetidos:

   "Descrição do Material"
   "DESCRICAO DO MATERIAL"
   "Descrição   do Material"
========================================================= */

export function normalizeHeader(
  value: unknown,
): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/*
 * Renomeia as chaves de cada linha para o texto canônico do
 * cabeçalho. Sem isso, uma coluna "Minutos de Paradas" passa
 * na validação (que normaliza) mas é lida como vazia por
 * row["Minutos de paradas"].
 */
export function canonicalizeRowKeys<
  T extends Record<string, unknown>,
>(
  rows: T[],
  canonicalHeaders: readonly string[],
): Record<string, unknown>[] {
  const canonicalByNormalized = new Map(
    canonicalHeaders.map((header) => [
      normalizeHeader(header),
      header,
    ]),
  );

  return rows.map((row) => {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      const canonical =
        canonicalByNormalized.get(normalizeHeader(key)) ?? key;

      /* Coluna repetida: mantém o primeiro valor preenchido. */
      if (
        result[canonical] === undefined ||
        result[canonical] === null ||
        result[canonical] === ""
      ) {
        result[canonical] = value;
      }
    }

    return result;
  });
}
