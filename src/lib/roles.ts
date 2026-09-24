export const ASSIGNABLE_ROLES = [
  "ADMIN",
  "MANAGER",
  "MAINTENANCE",
] as const;

export type AssignableRole =
  (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<
  string,
  string
> = {
  ADMIN: "Admin",
  MANAGER: "Gestor",
  MAINTENANCE: "Analista",
  VIEWER: "Visualizador",
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

export function isAdminRole(
  role: string | undefined | null,
): boolean {
  return role === "ADMIN";
}
