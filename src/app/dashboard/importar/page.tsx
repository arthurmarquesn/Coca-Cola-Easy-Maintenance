import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { ImportDataPage } from "@/components/imports/import-data-page";
import { executeRows } from "@/lib/db";
import { isAnalystRole } from "@/lib/roles";
import { getSession } from "@/lib/session";

interface UnitRow extends RowDataPacket {
  id: number;
  name: string;
}

export default async function ImportPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  /* Gestor apenas consulta; a importação é exclusiva do Analista. */
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
    <ImportDataPage
      user={{
        name: session.name,
      }}
      unit={{
        name: unit.name,
      }}
    />
  );
}