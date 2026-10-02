/* =========================================================
   CACHE DAS AGREGAÇÕES

   A planilha pode ter dezenas de milhares de linhas, e cada
   troca de filtro recalcularia tudo. Guardamos o resultado
   por combinação de filtros durante alguns minutos.

   Cache em memória do processo: suficiente para um servidor
   só. Se o projeto for para vários servidores, troque por
   Redis mantendo esta mesma interface.
========================================================= */

const TTL_MS = 5 * 60 * 1000;

const MAX_ENTRIES = 50;

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export function cacheKey(
  parts: Array<string | number | boolean | null>,
): string {
  return parts
    .map((part) =>
      part === null ? "" : String(part),
    )
    .join("|");
}

export function getCached<T>(
  key: string,
): T | null {
  const entry = store.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt < Date.now()) {
    store.delete(key);

    return null;
  }

  return entry.value as T;
}

export function setCached(
  key: string,
  value: unknown,
): void {
  /*
    Descarta a entrada mais antiga quando estoura o limite,
    para o cache não crescer sem fim.
  */
  if (store.size >= MAX_ENTRIES) {
    const oldest = store
      .keys()
      .next().value;

    if (oldest !== undefined) {
      store.delete(oldest);
    }
  }

  store.set(key, {
    value,
    expiresAt: Date.now() + TTL_MS,
  });
}
