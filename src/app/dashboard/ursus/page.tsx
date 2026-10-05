import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";

import { UrsusDashboardPage } from "@/components/ursus/ursus-dashboard-page";
import { executeRows } from "@/lib/db";
import { getSession } from "@/lib/session";

interface UnitRow extends RowDataPacket {
  id: number;
  city: string | null;
}

export default async function UrsusPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

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
        city: unit.city,
      }}
    />
  );
}