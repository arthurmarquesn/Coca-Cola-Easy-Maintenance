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
}

interface UnitNameRow extends RowDataPacket {
  name: string;
}

export type AdministrableTarget =
  | {
      ok: true;
      role: string;
      active: boolean;
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
      SELECT u.role, u.active
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
  };
}

/*
 * Primeira unidade ativa do usuário que ficaria sem nenhum
 * Analista ativo se ele deixasse de ser Analista ativo.
 */
export async function findUnitLeftWithoutAnalyst(
  connection: PoolConnection,
  targetUserId: number,
): Promise<string | null> {
  const [rows] = await connection.query<UnitNameRow[]>(
    `
      SELECT un.name
      FROM user_units target_unit
      INNER JOIN units un
        ON un.id = target_unit.unit_id
       AND un.active = TRUE
      WHERE target_unit.user_id = ?
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
    [targetUserId],
  );

  return rows[0]?.name ?? null;
}
