import {
  cookies,
} from "next/headers";
import type { RowDataPacket } from "mysql2/promise";
import { executeRows } from "@/lib/db";
import { normalizeSessionRole } from "@/lib/roles";
import { USER_UNIT_SCOPE_CONDITION } from "@/lib/unit-selection";

import {
  SESSION_COOKIE_NAME,
  SessionPayload,
  verifySessionToken,
} from "@/lib/auth";


export async function getSession():
Promise<
  SessionPayload | null
> {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      SESSION_COOKIE_NAME,
    )?.value;

  if (
    !token
  ) {
    return null;
  }

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  // JWT identifies the user; current database state grants access.
  // The session unit is the primary unit (users.unit_id); a manager
  // never falls back to another linked unit.
  const [user] = await executeRows<(RowDataPacket & {
    name: string; email: string; role: string; unit_id: number;
  })[]>(`
    SELECT u.name, u.email, u.role, uu.unit_id
    FROM users u
    INNER JOIN user_units uu ON uu.user_id = u.id
    INNER JOIN units un ON un.id = uu.unit_id AND un.active = TRUE
    WHERE u.id = ? AND u.active = TRUE
      AND ${USER_UNIT_SCOPE_CONDITION}
    ORDER BY (uu.unit_id = u.unit_id) DESC, uu.unit_id ASC
    LIMIT 1
  `, [payload.userId]);

  const role = user ? normalizeSessionRole(user.role) : null;
  if (!user || !role) return null;
  return { ...payload, name: user.name, email: user.email,
    role, unitId: Number(user.unit_id) };
}
