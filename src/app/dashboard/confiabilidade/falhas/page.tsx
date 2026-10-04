import {
  redirect,
} from "next/navigation";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  ReliabilityFailuresPage,
} from "@/components/reliability/reliability-failures-page";

import {
  executeRows,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

interface UnitRow
  extends RowDataPacket {
  city:
    string | null;
}

export default async function ReliabilityFailuresPageRoute() {
  const session =
    await getSession();

  if (
    !session
  ) {
    redirect(
      "/login",
    );
  }

  const units =
    await executeRows<
      UnitRow[]
    >(
      `
        SELECT
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
    units[
      0
    ];

  if (
    !unit
  ) {
    redirect(
      "/login",
    );
  }

  return (
    <ReliabilityFailuresPage
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