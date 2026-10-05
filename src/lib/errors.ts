/*
 * Mensagem de erro que pode ir para o navegador.
 *
 * Erros lançados pela própria aplicação (new Error("A unidade
 * ... não foi encontrada.")) já são escritos para o usuário.
 * Erros do driver MySQL ou do sistema (ER_DUP_ENTRY,
 * ECONNREFUSED, "Unknown column ...") carregam `code`/`errno`
 * e expõem detalhes internos: esses viram a mensagem genérica.
 * O erro completo continua no log do servidor.
 */
export function publicErrorMessage(
  error: unknown,
  fallback: string,
): string {
  /* TypeError, AbortError etc. também são internos. */
  if (
    !(error instanceof Error) ||
    error.name !== "Error" ||
    !error.message
  ) {
    return fallback;
  }

  const details = error as Error & {
    code?: unknown;
    errno?: unknown;
    sqlMessage?: unknown;
    sqlState?: unknown;
  };

  if (
    details.code !== undefined ||
    details.errno !== undefined ||
    details.sqlMessage !== undefined ||
    details.sqlState !== undefined
  ) {
    return fallback;
  }

  return error.message;
}
