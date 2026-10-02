const STOPWORDS =
  new Set([
    "a",
    "ao",
    "as",
    "com",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "para",
    "por",
    "que",
    "um",
    "uma",
  ]);

const GENERIC_TERMS =
  new Set([
    "defeito",
    "erro",
    "falha",
    "problema",
  ]);

function tokens(
  value: string,
): string[] {
  return value
    .normalize(
      "NFD",
    )
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9\s]/g,
      " ",
    )
    .split(
      /\s+/,
    )
    .filter(
      (
        token,
      ) =>
        token.length > 2 &&
        !STOPWORDS.has(
          token,
        ),
    );
}

function jaccardSimilarity(
  left: string[],
  right: string[],
): number {
  const leftSet =
    new Set(
      left,
    );

  const rightSet =
    new Set(
      right,
    );

  const union =
    new Set([
      ...leftSet,
      ...rightSet,
    ]);

  if (
    union.size ===
    0
  ) {
    return 0;
  }

  const intersection =
    [...leftSet]
      .filter(
        (
          token,
        ) =>
          rightSet.has(
            token,
          ),
      )
      .length;

  return intersection /
    union.size;
}

export function getFiveWhysWarnings(
  answer: string,
  previousText: string,
): string[] {
  const warnings:
    string[] = [];

  const answerTokens =
    tokens(
      answer,
    );

  if (
    answer.trim().length < 12 ||
    answerTokens.length < 2
  ) {
    warnings.push(
      "Detalhe melhor a causa.",
    );
  }

  if (
    jaccardSimilarity(
      answerTokens,
      tokens(
        previousText,
      ),
    ) >= 0.7
  ) {
    warnings.push(
      "Esta resposta parece repetir o problema em vez de explicar sua causa.",
    );
  }

  if (
    answerTokens.length > 0 &&
    answerTokens.every(
      (
        token,
      ) =>
        GENERIC_TERMS.has(
          token,
        ),
    )
  ) {
    warnings.push(
      "Tente identificar o mecanismo ou condição que provocou a falha.",
    );
  }

  return warnings;
}
