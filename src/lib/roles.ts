export const ASSIGNABLE_ROLES = [
  "MAINTENANCE",
  "MANAGER",
] as const;

export type AssignableRole =
  (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<
  string,
  string
> = {
  MAINTENANCE: "Analista",
  MANAGER: "Gestor",
};

export function isAssignableRole(
  value: unknown,
): value is AssignableRole {
  return (
    typeof value === "string" &&
    (
      ASSIGNABLE_ROLES as readonly string[]
    ).includes(value)
  );
}

/*
 * Analista tem acesso total (cadastro de usuários,
 * importação e revisão). Gestor apenas consulta os
 * dados já gerados.
 *
 * Papel efetivo da sessão. ADMIN legado vira Analista:
 * bancos que ainda não rodaram database/migrations/001
 * continuam com usuários nesse papel. Qualquer outro
 * papel fora da lista não recebe sessão.
 */
export function normalizeSessionRole(
  value: unknown,
): AssignableRole | null {
  if (value === "ADMIN") {
    return "MAINTENANCE";
  }

  return isAssignableRole(value)
    ? value
    : null;
}

export function isAnalystRole(
  role: string | undefined | null,
): boolean {
  return role === "MAINTENANCE";
}
