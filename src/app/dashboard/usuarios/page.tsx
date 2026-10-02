import {
  redirect,
} from "next/navigation";

import {
  UsersPage,
} from "@/components/users/users-page";

import {
  getSession,
} from "@/lib/session";

import {
  isAnalystRole,
} from "@/lib/roles";


/* =========================================================
   TYPES
========================================================= */

type UserRole =
  | "MANAGER"
  | "MAINTENANCE";


/* =========================================================
   HELPERS
========================================================= */

function isUserRole(
  value:
    string,
): value is UserRole {
  return (
    value ===
      "MANAGER" ||
    value ===
      "MAINTENANCE"
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
     PERMISSÃO

     Apenas o Analista administra usuários; o Gestor volta
     para o dashboard. A API aplica a mesma regra.
  ======================================================= */

  if (
    !isAnalystRole(
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