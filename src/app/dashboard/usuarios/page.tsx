import {
  redirect,
} from "next/navigation";

<<<<<<< HEAD
import type {
  RowDataPacket,
} from "mysql2/promise";

=======
>>>>>>> origin/marques
import {
  UsersPage,
} from "@/components/users/users-page";

import {
<<<<<<< HEAD
  executeRows,
} from "@/lib/db";

import {
  isAnalystRole,
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

  if (!isAnalystRole(session.role)) {
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
=======
  getSession,
} from "@/lib/session";


/* =========================================================
   TYPES
========================================================= */

type UserRole =
  | "GESTOR"
  | "ANALISTA";


/* =========================================================
   HELPERS
========================================================= */

function isUserRole(
  value:
    string,
): value is UserRole {
  return (
    value ===
      "GESTOR" ||
    value ===
      "ANALISTA"
  );
}


/* =========================================================
   PAGE
========================================================= */

export default async function UsersPageRoute() {
  /* =======================================================
     SESSION
  ======================================================= */

  const session =
    await getSession();


  if (
    !session
  ) {
    redirect(
      "/login",
    );
  }


  /* =======================================================
     ROLE VALIDATION

     O SessionPayload atualmente entrega role como string.

     Antes de passar para o componente, validamos em runtime
     que realmente se trata de um dos perfis suportados pela
     aplicação.
  ======================================================= */

  if (
    !isUserRole(
      session.role,
    )
  ) {
    redirect(
      "/dashboard",
    );
  }


  /* =======================================================
     UI
  ======================================================= */

  return (
    <UsersPage
      user={{
        name:
          session.name,

        email:
          session.email,

        role:
          session.role,
      }}
    />
  );
}
>>>>>>> origin/marques
