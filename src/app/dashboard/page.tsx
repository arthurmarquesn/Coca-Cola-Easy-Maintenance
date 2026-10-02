import {
  redirect,
} from "next/navigation";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  DashboardHome,
} from "@/components/dashboard/dashboard-home";

import {
  executeRows,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";


/* =========================================================
   TYPES
========================================================= */

interface UnitRow
  extends RowDataPacket {
  id: number;

  city:
    | string
    | null;
}


/* =========================================================
   DASHBOARD
========================================================= */

export default async function DashboardPage() {
  const session =
    await getSession();


  /* =======================================================
     AUTH
  ======================================================= */

  if (
    !session
  ) {
    redirect(
      "/login",
    );
  }


  /* =======================================================
     DEFAULT UNIT

     A unidade abaixo continua sendo a unidade operacional
     padrão da sessão.

     O filtro multiunidade é carregado separadamente pelo
     UnitFilter através de /api/units.
  ======================================================= */

  const units =
    await executeRows<
      UnitRow[]
    >(
      `
        SELECT
            id,
            city

        FROM
            units

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


  if (
    !unit
  ) {
    redirect(
      "/login",
    );
  }


  /* =======================================================
     UI
  ======================================================= */

  return (
    <DashboardHome
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