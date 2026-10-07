import type {
  PoolConnection,
  RowDataPacket,
} from "mysql2/promise";

import { normalizeSessionRole } from "@/lib/roles";

/* =========================================================
   SENHA

   bcrypt considera só os primeiros 72 bytes, e o login
   recusa senhas maiores. O limite é em bytes UTF-8, não
   em caracteres: acentos ocupam 2 bytes.
========================================================= */

export const PASSWORD_MIN_BYTES = 8;
export const PASSWORD_MAX_BYTES = 72;

export function isValidPasswordLength(
  password: string,
): boolean {
  const bytes = Buffer.byteLength(password, "utf8");

  return (
    bytes >= PASSWORD_MIN_BYTES &&
    bytes <= PASSWORD_MAX_BYTES
  );
}

/* =========================================================
   ESCOPO DE ADMINISTRAÇÃO

   O Analista só administra usuários que compartilham ao
   menos uma unidade ativa com ele. Deve rodar dentro de
   uma transação: os FOR UPDATE serializam alterações
   simultâneas (dois Analistas rebaixando um ao outro).
========================================================= */

interface UserStateRow extends RowDataPacket {
  role: string;
  active: number | boolean;
  unit_id?: number | string;
}

interface UnitLinkRow extends RowDataPacket {
  unit_id: number | string;
}

interface UnitNameRow extends RowDataPacket {
  name: string;
}

export type AdministrableTarget =
  | {
      ok: true;
      role: string;
      active: boolean;
      unitId: number;
    }
  | {
      ok: false;
      status: 403 | 404;
      message: string;
    };

export async function lockAdministrableTarget(
  connection: PoolConnection,
  sessionUserId: number,
  targetUserId: number,
): Promise<AdministrableTarget> {
  const [actorRows] = await connection.query<UserStateRow[]>(
    `
      SELECT role, active
      FROM users
      WHERE id = ?
      FOR UPDATE
    `,
    [sessionUserId],
  );

  const actor = actorRows[0];

  if (
    !actor ||
    !actor.active ||
    normalizeSessionRole(actor.role) !== "MAINTENANCE"
  ) {
    return {
      ok: false,
      status: 403,
      message: "Acesso negado.",
    };
  }

  const [targetRows] = await connection.query<UserStateRow[]>(
    `
      SELECT u.role, u.active, u.unit_id
      FROM users u
      WHERE u.id = ?
        AND EXISTS (
          SELECT 1
          FROM user_units target_unit
          INNER JOIN user_units actor_unit
            ON actor_unit.unit_id = target_unit.unit_id
           AND actor_unit.user_id = ?
          INNER JOIN units un
            ON un.id = target_unit.unit_id
           AND un.active = TRUE
          WHERE target_unit.user_id = u.id
        )
      FOR UPDATE
    `,
    [targetUserId, sessionUserId],
  );

  const target = targetRows[0];

  /* Usuário de outra unidade responde como inexistente. */
  if (!target) {
    return {
      ok: false,
      status: 404,
      message: "Usuário não encontrado.",
    };
  }

  return {
    ok: true,
    role: normalizeSessionRole(target.role) ?? target.role,
    active: Boolean(target.active),
    unitId: Number(target.unit_id),
  };
}

/* Vínculos atuais do usuário, travados até o fim da transação. */
export async function lockUserUnitLinks(
  connection: PoolConnection,
  userId: number,
): Promise<number[]> {
  const [rows] = await connection.query<UnitLinkRow[]>(
    `
      SELECT unit_id
      FROM user_units
      WHERE user_id = ?
      FOR UPDATE
    `,
    [userId],
  );

  return rows.map((row) => Number(row.unit_id));
}

/* =========================================================
   UNIDADES DO USUÁRIO

   users.unit_id é a unidade principal; user_units guarda
   todas as unidades que o usuário acessa (a principal
   incluída, com is_default). O Gestor tem exatamente uma
   unidade. O Analista pode receber unidades extras, mas
   só entre as unidades de quem cadastra.
========================================================= */

/* Lista de IDs vinda do corpo da requisição; null se inválida. */
export function parseUnitIdList(
  value: unknown,
): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (
    !value.every(
      (item) =>
        typeof item === "number" &&
        Number.isInteger(item) &&
        item > 0,
    )
  ) {
    return null;
  }

  return [...new Set(value as number[])];
}

export type UnitLinkPlan =
  | {
      ok: true;
      primaryUnitId: number;
      unitIds: number[];
    }
  | {
      ok: false;
      status: 400 | 403;
      message: string;
    };

export function planUnitLinks(params: {
  role: string;
  primaryUnitId: number;
  /* undefined mantém as extras atuais dentro do escopo. */
  extraUnitIds: number[] | undefined;
  currentUnitIds: number[];
  currentPrimaryUnitId: number | null;
  actorUnitIds: number[];
}): UnitLinkPlan {
  const actorScope = new Set(params.actorUnitIds);

  if (
    params.primaryUnitId !== params.currentPrimaryUnitId &&
    !actorScope.has(params.primaryUnitId)
  ) {
    return {
      ok: false,
      status: 403,
      message:
        "A unidade selecionada não está disponível para o seu usuário.",
    };
  }

  if (params.role === "MANAGER") {
    if (
      params.extraUnitIds?.some(
        (unitId) => unitId !== params.primaryUnitId,
      )
    ) {
      return {
        ok: false,
        status: 400,
        message:
          "O Gestor acessa somente a própria unidade.",
      };
    }

    return {
      ok: true,
      primaryUnitId: params.primaryUnitId,
      unitIds: [params.primaryUnitId],
    };
  }

  if (
    params.extraUnitIds?.some(
      (unitId) => !actorScope.has(unitId),
    )
  ) {
    return {
      ok: false,
      status: 403,
      message:
        "Uma ou mais unidades de acesso não estão disponíveis para o seu usuário.",
    };
  }

  /* Vínculos fora do escopo de quem edita não são visíveis
     para ele e permanecem como estão. */
  const outsideScope = params.currentUnitIds.filter(
    (unitId) => !actorScope.has(unitId),
  );

  const extras =
    params.extraUnitIds ??
    params.currentUnitIds.filter((unitId) =>
      actorScope.has(unitId),
    );

  return {
    ok: true,
    primaryUnitId: params.primaryUnitId,
    unitIds: [
      ...new Set([
        params.primaryUnitId,
        ...outsideScope,
        ...extras,
      ]),
    ].sort((a, b) => a - b),
  };
}

/* Aplica o plano: principal em users.unit_id e vínculos
   em user_units. Roda dentro da transação do chamador. */
export async function applyUnitLinks(
  connection: PoolConnection,
  userId: number,
  plan: { primaryUnitId: number; unitIds: number[] },
): Promise<void> {
  const placeholders = plan.unitIds.map(() => "?").join(", ");

  await connection.execute(
    `
      UPDATE users
      SET unit_id = ?
      WHERE id = ?
    `,
    [plan.primaryUnitId, userId],
  );

  await connection.execute(
    `
      DELETE FROM user_units
      WHERE user_id = ?
        AND unit_id NOT IN (${placeholders})
    `,
    [userId, ...plan.unitIds],
  );

  await connection.query(
    `
      INSERT IGNORE INTO user_units (user_id, unit_id, is_default)
      VALUES ${plan.unitIds.map(() => "(?, ?, FALSE)").join(", ")}
    `,
    plan.unitIds.flatMap((unitId) => [userId, unitId]),
  );

  await connection.execute(
    `
      UPDATE user_units
      SET is_default = (unit_id = ?)
      WHERE user_id = ?
    `,
    [plan.primaryUnitId, userId],
  );
}

/*
 * Primeira unidade ativa do usuário que ficaria sem nenhum
 * Analista ativo se ele deixasse de ser Analista ativo.
 * Com unitIds, verifica só essas unidades (vínculos que o
 * Analista vai perder).
 */
export async function findUnitLeftWithoutAnalyst(
  connection: PoolConnection,
  targetUserId: number,
  unitIds?: number[],
): Promise<string | null> {
  if (unitIds && unitIds.length === 0) {
    return null;
  }

  const unitFilter = unitIds
    ? `AND target_unit.unit_id IN (${unitIds.map(() => "?").join(", ")})`
    : "";

  const [rows] = await connection.query<UnitNameRow[]>(
    `
      SELECT un.name
      FROM user_units target_unit
      INNER JOIN units un
        ON un.id = target_unit.unit_id
       AND un.active = TRUE
      WHERE target_unit.user_id = ?
        ${unitFilter}
        AND NOT EXISTS (
          SELECT 1
          FROM user_units other_unit
          INNER JOIN users other_user
            ON other_user.id = other_unit.user_id
          WHERE other_unit.unit_id = target_unit.unit_id
            AND other_unit.user_id <> target_unit.user_id
            AND other_user.active = TRUE
            -- ADMIN legado ainda conta como Analista (lib/roles.ts).
            AND other_user.role IN ('MAINTENANCE', 'ADMIN')
        )
      ORDER BY un.name ASC
      LIMIT 1
    `,
    [targetUserId, ...(unitIds ?? [])],
  );

  return rows[0]?.name ?? null;
}
