import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";

import { UrsusDashboardPage } from "@/components/ursus/ursus-dashboard-page";
import { executeRows } from "@/lib/db";
import { isAnalystRole } from "@/lib/roles";
import { getSession } from "@/lib/session";

interface UnitRow extends RowDataPacket {
  id: number;
  name: string;
}

export default async function UrsusPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  /* Revisão, MASP e Ursus não fazem parte do perfil Gestor
     (o dashboard também esconde esses módulos). */
  if (!isAnalystRole(session.role)) {
    redirect("/dashboard");
  }


  const units = await executeRows<UnitRow[]>(
    `
      SELECT
        id,
        name
      FROM units
      WHERE id = ?
        AND active = TRUE
      LIMIT 1
    `,
    [session.unitId],
  );

  const unit = units[0];

  if (!unit) {
    redirect("/login");
  }

  return (
    <UrsusDashboardPage
      user={{
        name: session.name,
      }}
      unit={{
        name: unit.name,
      }}
    />
  );
}