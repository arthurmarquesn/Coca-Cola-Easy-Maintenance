import type {
  RowDataPacket,
} from "mysql2";

import { executeRows } from "@/lib/db";

interface UserListRow
  extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: string;
  active: number;
  last_login_at: Date | null;
  unit_id: number | null;
  unit_name: string | null;
}

interface UnitRow
  extends RowDataPacket {
  id: number;
  code: string;
  name: string;
}

export interface UserItem {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  unitId: number | null;
  unitName: string | null;
}

export interface UnitItem {
  id: number;
  code: string;
  name: string;
}

export async function listUsersAndUnits(): Promise<{
  users: UserItem[];
  units: UnitItem[];
}> {
  const users =
    await executeRows<UserListRow[]>(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.role,
          u.active,
          u.last_login_at,
          un.id AS unit_id,
          un.name AS unit_name

        FROM users u

        LEFT JOIN user_units uu
          ON uu.user_id = u.id
          AND uu.is_default = TRUE

        LEFT JOIN units un
          ON un.id = uu.unit_id

        ORDER BY u.name ASC
      `,
    );

  const units =
    await executeRows<UnitRow[]>(
      `
        SELECT
          id,
          code,
          name

        FROM units

        WHERE active = TRUE

        ORDER BY name ASC
      `,
    );

  return {
    users: users.map((user) => ({
      id: Number(user.id),
      name: user.name,
      email: user.email,
      role: user.role,
      active: Boolean(user.active),
      lastLoginAt:
        user.last_login_at
          ? new Date(
              user.last_login_at,
            ).toISOString()
          : null,
      unitId:
        user.unit_id === null
          ? null
          : Number(user.unit_id),
      unitName: user.unit_name,
    })),

    units: units.map((unit) => ({
      id: Number(unit.id),
      code: unit.code,
      name: unit.name,
    })),
  };
}
