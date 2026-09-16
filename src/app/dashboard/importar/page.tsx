import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { ImportDataPage } from "@/components/imports/import-data-page";
import { executeRows } from "@/lib/db";
import { getSession } from "@/lib/session";

interface UnitRow extends RowDataPacket {
  id: number;
  city: string | null;
}

export default async function ImportPage() {
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
    <ImportDataPage
      user={{
        name: session.name,
      }}
      unit={{
        city: unit.city,
      }}
    />
  );
}