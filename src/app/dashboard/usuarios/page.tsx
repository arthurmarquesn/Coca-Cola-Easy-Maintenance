import {
  redirect,
} from "next/navigation";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  UsersPage,
} from "@/components/users/users-page";

import {
  executeRows,
} from "@/lib/db";

import {
  isAdminRole,
} from "@/lib/roles";

import {
  getSession,
} from "@/lib/session";

import {
  listUsersAndUnits,
} from "@/lib/users";

interface UnitRow
  extends RowDataPacket {
  city:
    | string
    | null;
}

export default async function UsersPageRoute() {
  const session =
    await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!isAdminRole(session.role)) {
    redirect("/dashboard");
  }

  const units =
    await executeRows<UnitRow[]>(
      `
        SELECT
          city

        FROM units

        WHERE
          id = ?

          AND active = TRUE

        LIMIT 1
      `,
      [
        session.unitId,
      ],
    );

  const unit = units[0];

  if (!unit) {
    redirect("/login");
  }

  const { users, units: unitOptions } =
    await listUsersAndUnits();

  return (
    <UsersPage
      initialUsers={users}
      initialUnits={unitOptions}
      currentUserId={
        session.userId
      }
      user={{
        name:
          session.name,
      }}
      unit={{
        city:
          unit.city,
      }}
    />
  );
}
