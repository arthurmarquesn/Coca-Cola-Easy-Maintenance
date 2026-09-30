import {
  NextResponse,
} from "next/server";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  executeRows,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OptionRow extends RowDataPacket {
  id: number;
  name: string;
}

interface ShiftRow extends RowDataPacket {
  shift: string | null;
}

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Não autenticado." },
      { status: 401 },
    );
  }

  try {
    const [lines, equipments, shifts] = await Promise.all([
      executeRows<OptionRow[]>(
        `
          SELECT DISTINCT
            pl.id,
            pl.name

          FROM production_lines pl

          INNER JOIN maintenance_events me
            ON me.production_line_id = pl.id

          INNER JOIN classification_suggestions cs
            ON cs.event_id = me.id

          WHERE
            me.unit_id = ?
            AND cs.model_type = 'ML'

          ORDER BY pl.name ASC
        `,
        [session.unitId],
      ),

      executeRows<OptionRow[]>(
        `
          SELECT DISTINCT
            eq.id,
            eq.name

          FROM equipments eq

          INNER JOIN maintenance_events me
            ON me.equipment_id = eq.id

          INNER JOIN classification_suggestions cs
            ON cs.event_id = me.id

          WHERE
            me.unit_id = ?
            AND cs.model_type = 'ML'

          ORDER BY eq.name ASC
        `,
        [session.unitId],
      ),

      executeRows<ShiftRow[]>(
        `
          SELECT DISTINCT
            me.shift

          FROM maintenance_events me

          INNER JOIN classification_suggestions cs
            ON cs.event_id = me.id

          WHERE
            me.unit_id = ?
            AND cs.model_type = 'ML'
            AND me.shift IS NOT NULL
            AND me.shift <> ''

          ORDER BY me.shift ASC
        `,
        [session.unitId],
      ),
    ]);

    return NextResponse.json({
      success: true,
      lines: lines.map((row) => ({
        id: Number(row.id),
        name: row.name,
      })),
      equipments: equipments.map((row) => ({
        id: Number(row.id),
        name: row.name,
      })),
      shifts: shifts
        .map((row) => row.shift)
        .filter((shift): shift is string => Boolean(shift)),
    });
  } catch (error) {
    console.error(
      "Erro ao carregar filtros de validação:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error: "Não foi possível carregar os filtros.",
      },
      { status: 500 },
    );
  }
}
