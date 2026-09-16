import { redirect } from "next/navigation";

import type { RowDataPacket } from "mysql2";

import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { executeRows } from "@/lib/db";
import { getSession } from "@/lib/session";

/* =========================================================
   TIPOS
========================================================= */

interface UnitRow extends RowDataPacket {
  id: number;
  city: string | null;
}

/* =========================================================
   DASHBOARD
========================================================= */

export default async function DashboardPage() {
  const session = await getSession();

  /* =======================================================
     PROTEÇÃO DA ROTA
  ======================================================= */

  if (!session) {
    redirect("/login");
  }

  /* =======================================================
     UNIDADE ATUAL
  ======================================================= */

  const units = await executeRows<UnitRow[]>(
    `
      SELECT
        id,
        city
      FROM units
      WHERE id = ?
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

  /* =======================================================
     INTERFACE
  ======================================================= */

  return (
    <DashboardHome
      user={{
        name: session.name,
        email: session.email,
        role: session.role,
      }}
      unit={{
        id: unit.id,
        city: unit.city,
      }}
    />
  );
}