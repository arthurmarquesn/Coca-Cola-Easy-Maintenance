import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import {
  getConnection,
} from "@/lib/db";

import {
  cleanText,
  FAILURE_ORIGINS,
  isOneOf,
  MASP_STATUSES,
  nullableDate,
  positiveIntegerOrNull,
} from "@/lib/masp/domain";

import {
  buildProblemStatement,
  loadEventsByIds,
  summarizeMaspEvents,
  validateMaspReferences,
} from "@/lib/masp/service";

import {
  MaspApiError,
  maspErrorResponse,
  parseJsonBody,
  requireMaspContext,
  requireSelectedUnit,
} from "@/lib/masp/api";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

interface MaspListRow
  extends RowDataPacket {
  id: number;
  unit_id: number;
  unit_name: string;
  equipment_id:
    | number
    | null;
  equipment_name:
    | string
    | null;
  title: string;
  status: string;
  owner_name:
    | string
    | null;
  event_count:
    | number
    | string;
  updated_at:
    | Date
    | string;
}

function uniquePositiveIds(
  value: unknown,
): number[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(
          Number,
        )
        .filter(
          (
            id,
          ) =>
            Number.isInteger(
              id,
            ) &&
            id > 0,
        ),
    ),
  ].slice(
    0,
    500,
  );
}

export async function GET(
  request: NextRequest,
) {
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

    const conditions = [
      `ma.unit_id IN (${context.selectedUnitIds.map(() => "?").join(", ")})`,
    ];

    const values:
      Array<number | string> = [
        ...context.selectedUnitIds,
      ];

    const requestedStatus =
      request
        .nextUrl
        .searchParams
        .get(
          "status",
        );

    if (
      requestedStatus &&
      isOneOf(
        requestedStatus,
        MASP_STATUSES,
      )
    ) {
      conditions.push(
        "ma.status = ?",
      );
      values.push(
        requestedStatus,
      );
    }

    const equipmentId =
      positiveIntegerOrNull(
        request
          .nextUrl
          .searchParams
          .get(
            "equipmentId",
          ),
      );

    if (
      equipmentId
    ) {
      conditions.push(
        "ma.equipment_id = ?",
      );
      values.push(
        equipmentId,
      );
    }

    const [
      rows,
    ] =
      await connection.query<
        MaspListRow[]
      >(
        `
          SELECT
              ma.id,
              ma.unit_id,
              un.name AS unit_name,
              ma.equipment_id,
              eq.name AS equipment_name,
              ma.title,
              ma.status,
              owner.name AS owner_name,
              COUNT(me.event_id) AS event_count,
              ma.updated_at
          FROM
              masp_analyses ma
          INNER JOIN
              units un
                  ON un.id = ma.unit_id
          LEFT JOIN
              equipments eq
                  ON eq.id = ma.equipment_id
          LEFT JOIN
              users owner
                  ON owner.id = ma.owner_user_id
          LEFT JOIN
              masp_events me
                  ON me.masp_id = ma.id
          WHERE
              ${conditions.join(" AND ")}
          GROUP BY
              ma.id,
              ma.unit_id,
              un.name,
              ma.equipment_id,
              eq.name,
              ma.title,
              ma.status,
              owner.name,
              ma.updated_at
          ORDER BY
              ma.updated_at DESC,
              ma.id DESC
        `,
        values,
      );

    return NextResponse.json({
      success: true,
      items:
        rows.map(
          (
            row,
          ) => ({
            ...row,
            event_count:
              Number(
                row.event_count,
              ),
          }),
        ),
      selectedUnitIds:
        context.selectedUnitIds,
    });
  } catch (
    error
  ) {
    return maspErrorResponse(
      error,
      "Erro ao listar MASPs:",
    );
  } finally {
    connection
      ?.release();
  }
}

export async function POST(
  request: NextRequest,
) {
  let connection:
    Awaited<
      ReturnType<
        typeof getConnection
      >
    > | null =
      null;

  try {
    const context =
      await requireMaspContext(true);

    const body =
      await parseJsonBody(
        request,
      );

    const eventIds =
      uniquePositiveIds(
        body.eventIds,
      );

    connection =
      await getConnection();

    await connection
      .beginTransaction();

    const events =
      await loadEventsByIds(
        connection,
        eventIds,
      );

    if (
      events.length !==
      eventIds.length
    ) {
      throw new MaspApiError(
        400,
        "Um ou mais eventos informados não existem.",
      );
    }

    const eventUnitIds =
      new Set(
        events.map(
          (
            event,
          ) =>
            Number(
              event.unit_id,
            ),
        ),
      );

    if (
      eventUnitIds.size > 1
    ) {
      throw new MaspApiError(
        400,
        "Todos os eventos do MASP devem pertencer à mesma unidade.",
      );
    }

    const requestedUnitId =
      positiveIntegerOrNull(
        body.unitId,
      );

    const unitId =
      events[0]
        ? Number(
            events[0]
              .unit_id,
          )
        : requestedUnitId ??
          (
            context
              .selectedUnitIds
              .length === 1
              ? context
                  .selectedUnitIds[0]
              : 0
          );

    if (
      !unitId
    ) {
      throw new MaspApiError(
        400,
        "Selecione uma unidade para o MASP.",
      );
    }

    requireSelectedUnit(
      unitId,
      context,
    );

    if (
      requestedUnitId &&
      requestedUnitId !==
        unitId
    ) {
      throw new MaspApiError(
        400,
        "A unidade informada não coincide com a unidade dos eventos.",
      );
    }

    const eventEquipmentIds =
      new Set(
        events
          .map(
            (
              event,
            ) =>
              event.equipment_id
                ? Number(
                    event
                      .equipment_id,
                  )
                : null,
          )
          .filter(
            (
              value,
            ): value is number =>
              value !== null,
          ),
      );

    const eventLineIds =
      new Set(
        events
          .map(
            (
              event,
            ) =>
              event.production_line_id
                ? Number(
                    event
                      .production_line_id,
                  )
                : null,
          )
          .filter(
            (
              value,
            ): value is number =>
              value !== null,
          ),
      );

    const equipmentId =
      positiveIntegerOrNull(
        body.equipmentId,
      ) ??
      (
        eventEquipmentIds.size ===
        1
          ? [...eventEquipmentIds][0]
          : null
      );

    const productionLineId =
      positiveIntegerOrNull(
        body.productionLineId,
      ) ??
      (
        eventLineIds.size ===
        1
          ? [...eventLineIds][0]
          : null
      );

    const ownerUserId =
      positiveIntegerOrNull(
        body.ownerUserId,
      );

    await validateMaspReferences(
      connection,
      unitId,
      equipmentId,
      productionLineId,
      ownerUserId,
    );

    const summary =
      summarizeMaspEvents(
        events,
      );

    const title =
      cleanText(
        body.title,
        180,
      ) ||
      `MASP - ${summary.equipment ?? "problema operacional"}`;

    const problemStatement =
      cleanText(
        body.problemStatement,
        10000,
      ) ||
      buildProblemStatement(
        events,
      );

    const scopeStartDate =
      nullableDate(
        body.scopeStartDate,
      ) ??
      summary.firstOccurrence;

    const scopeEndDate =
      nullableDate(
        body.scopeEndDate,
      ) ??
      summary.lastOccurrence;

    if (
      scopeStartDate &&
      scopeEndDate &&
      scopeStartDate >
        scopeEndDate
    ) {
      throw new MaspApiError(
        400,
        "A data inicial do escopo não pode ser posterior à data final.",
      );
    }

    const recurrenceOrigin =
      isOneOf(
        body.recurrenceFailureOrigin,
        FAILURE_ORIGINS,
      )
        ? body.recurrenceFailureOrigin
        : isOneOf(
              summary.failureOrigin,
              FAILURE_ORIGINS,
            )
          ? summary.failureOrigin
          : null;

    const verificationDays =
      Math.max(
        1,
        Math.min(
          Number(
            body.verificationDays ??
            30,
          ) || 30,
          365,
        ),
      );

    const [
      insertResult,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          INSERT INTO masp_analyses (
              unit_id,
              production_line_id,
              equipment_id,
              created_by,
              owner_user_id,
              title,
              problem_statement,
              scope_start_date,
              scope_end_date,
              recurrence_component_code,
              recurrence_failure_mode,
              recurrence_failure_origin,
              verification_days
          ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `,
        [
          unitId,
          productionLineId,
          equipmentId,
          context.userId,
          ownerUserId,
          title,
          problemStatement,
          scopeStartDate,
          scopeEndDate,
          cleanText(
            body.recurrenceComponentCode,
            120,
          ) ||
            summary.component,
          cleanText(
            body.recurrenceFailureMode,
            255,
          ) ||
            summary.failureMode,
          recurrenceOrigin,
          verificationDays,
        ],
      );

    const maspId =
      Number(
        insertResult.insertId,
      );

    if (
      events.length > 0
    ) {
      const placeholders =
        events
          .map(
            () =>
              "(?, ?, 'SOURCE')",
          )
          .join(
            ", ",
          );

      await connection.query(
        `
          INSERT INTO masp_events (
              masp_id,
              event_id,
              relation_type
          ) VALUES
              ${placeholders}
        `,
        events.flatMap(
          (
            event,
          ) => [
            maspId,
            Number(
              event.id,
            ),
          ],
        ),
      );
    }

    await connection
      .commit();

    return NextResponse.json(
      {
        success: true,
        id:
          maspId,
        problemStatement,
      },
      {
        status: 201,
      },
    );
  } catch (
    error
  ) {
    if (
      connection
    ) {
      await connection
        .rollback();
    }

    return maspErrorResponse(
      error,
      "Erro ao criar MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}
