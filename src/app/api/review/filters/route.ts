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

import {
  buildUnitInClause,
  getUnitSelection,
} from "@/lib/unit-selection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NameRow extends RowDataPacket {
  name: string | null;
}

interface ShiftRow extends RowDataPacket {
  shift: string | null;
}

function distinctNames(
  column: "source_line_name" | "source_equipment_name",
  unitIds: number[],
) {
  const unitClause = buildUnitInClause(unitIds);

  return executeRows<NameRow[]>(
    `
      SELECT DISTINCT
        TRIM(me.${column}) AS name

      FROM maintenance_events me

      INNER JOIN classification_suggestions cs
        ON cs.event_id = me.id

      WHERE
        me.unit_id IN (${unitClause.placeholders})
        AND cs.model_type = 'ML'
        AND me.${column} IS NOT NULL
        AND TRIM(me.${column}) <> ''

      ORDER BY name ASC
    `,
    unitClause.values,
  );
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
    /* Mesmas unidades exibidas na tabela de validação. */
    const { selectedUnitIds } = await getUnitSelection({
      userId: session.userId,
      defaultUnitId: session.unitId,
    });

    if (selectedUnitIds.length === 0) {
      return NextResponse.json({
        success: true,
        lines: [],
        equipments: [],
        shifts: [],
      });
    }

    const unitClause = buildUnitInClause(selectedUnitIds);

    const [lines, equipments, shifts] = await Promise.all([
      distinctNames("source_line_name", selectedUnitIds),
      distinctNames("source_equipment_name", selectedUnitIds),

      executeRows<ShiftRow[]>(
        `
          SELECT DISTINCT
            me.shift

          FROM maintenance_events me

          INNER JOIN classification_suggestions cs
            ON cs.event_id = me.id

          WHERE
            me.unit_id IN (${unitClause.placeholders})
            AND cs.model_type = 'ML'
            AND me.shift IS NOT NULL
            AND me.shift <> ''

          ORDER BY me.shift ASC
        `,
        unitClause.values,
      ),
    ]);

    return NextResponse.json({
      success: true,
      lines: lines
        .map((row) => row.name)
        .filter((name): name is string => Boolean(name)),
      equipments: equipments
        .map((row) => row.name)
        .filter((name): name is string => Boolean(name)),
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
