import {
  NextResponse,
} from "next/server";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  getConnection,
} from "@/lib/db";

import {
  maspErrorResponse,
  requireMaspContext,
} from "@/lib/masp/api";

import {
  USER_UNIT_SCOPE_CONDITION,
} from "@/lib/unit-selection";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export async function GET() {
  let connection:
    Awaited<
      ReturnType<
        typeof getConnection
      >
    > | null =
      null;

  try {
    const context =
      await requireMaspContext();

    connection =
      await getConnection();

    const placeholders =
      context
        .selectedUnitIds
        .map(
          () =>
            "?",
        )
        .join(
          ", ",
        );

    const queries = [
      `
        SELECT id, code, name, city, state
        FROM units
        WHERE id IN (${placeholders})
          AND active = TRUE
        ORDER BY COALESCE(city, name), name
      `,
      `
        SELECT id, unit_id, code, name, production_line_id
        FROM equipments
        WHERE unit_id IN (${placeholders})
          AND active = TRUE
        ORDER BY name
        LIMIT 1000
      `,
      `
        SELECT id, unit_id, code, name
        FROM production_lines
        WHERE unit_id IN (${placeholders})
          AND active = TRUE
        ORDER BY name
        LIMIT 500
      `,
      `
        SELECT DISTINCT
            u.id,
            u.name,
            uu.unit_id
        FROM users u
        INNER JOIN user_units uu
            ON uu.user_id = u.id
        WHERE uu.unit_id IN (${placeholders})
          AND u.active = TRUE
          AND ${USER_UNIT_SCOPE_CONDITION}
        ORDER BY u.name
      `,
      `
        SELECT
            me.id,
            me.unit_id,
            me.event_date,
            COALESCE(eq.name, me.source_equipment_name) AS equipment_name,
            COALESCE(pl.name, me.source_line_name) AS line_name,
            me.observation,
            me.downtime_minutes
        FROM maintenance_events me
        LEFT JOIN equipments eq
            ON eq.id = me.equipment_id
        LEFT JOIN production_lines pl
            ON pl.id = me.production_line_id
        WHERE me.unit_id IN (${placeholders})
        ORDER BY me.event_date DESC, me.id DESC
        LIMIT 300
      `,
    ];

    const results:
      RowDataPacket[][] = [];

    for (
      const sql
      of queries
    ) {
      const [
        rows,
      ] =
        await connection.query<
          RowDataPacket[]
        >(
          sql,
          context.selectedUnitIds,
        );

      results.push(
        rows,
      );
    }

    return NextResponse.json({
      success: true,
      units:
        results[0],
      equipments:
        results[1],
      productionLines:
        results[2],
      users:
        results[3],
      recentEvents:
        results[4],
    });
  } catch (
    error
  ) {
    return maspErrorResponse(
      error,
      "Erro ao carregar opções MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}
