import {
  redirect,
} from "next/navigation";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  ReliabilityEvolutionPage,
} from "@/components/reliability/reliability-evolution-page";

import {
  executeRows,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

interface UnitRow
  extends RowDataPacket {
  name: string;
}

export default async function ReliabilityEvolutionPageRoute() {
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
          name
        FROM units
        WHERE id = ?
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

  return (
    <ReliabilityEvolutionPage
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