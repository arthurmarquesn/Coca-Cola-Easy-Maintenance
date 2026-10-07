import {
  redirect,
} from "next/navigation";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  ReviewOverviewPage,
} from "@/components/review/review-overview-page";

import {
  executeRows,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

import {
  isAnalystRole,
} from "@/lib/roles";

interface UnitRow
  extends RowDataPacket {
  name: string;
}

export default async function ReviewPageRoute() {
  const session =
    await getSession();

  if (!session) {
    redirect(
      "/login",
    );
  }

  /* Revisão, MASP e Ursus não fazem parte do perfil Gestor
     (o dashboard também esconde esses módulos). */
  if (!isAnalystRole(session.role)) {
    redirect("/dashboard");
  }


  const units =
    await executeRows<
      UnitRow[]
    >(
      `
        SELECT
          name

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

  const unit =
    units[0];

  if (!unit) {
    redirect(
      "/login",
    );
  }

  return (
    <ReviewOverviewPage
      user={{
        name:
          session.name,
      }}
      unit={{
        name:
          unit.name,
      }}
    />
  );
}
