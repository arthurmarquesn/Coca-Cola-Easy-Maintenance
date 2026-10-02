import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  PoolConnection,
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
  nullableDate,
} from "@/lib/masp/domain";

import {
  MaspApiError,
  maspErrorResponse,
  parseJsonBody,
  requireMaspContext,
} from "@/lib/masp/api";

import {
  buildProblemStatement,
  loadEventsByIds,
  summarizeMaspEvents,
  validateMaspReferences,
} from "@/lib/masp/service";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


type AnalysisLevel =
  | "EQUIPMENT"
  | "FAILURE_MODE";


interface ReliabilityEventRow
  extends RowDataPacket {
  id: number;
  unit_id: number;
}


interface ExistingMaspRow
  extends RowDataPacket {
  id: number;
  title: string;
  status: string;
  event_count:
    | number
    | string;
}


function isDateInput(
  value: unknown,
): value is string {
  return (
    typeof value ===
      "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      value,
    ) &&
    nullableDate(
      value,
    ) !== null
  );
}


function optionalDate(
  value: unknown,
  label: string,
): string | null {
  if (
    value ===
      null ||
    value ===
      undefined ||
    value ===
      ""
  ) {
    return null;
  }

  if (
    !isDateInput(
      value,
    )
  ) {
    throw new MaspApiError(
      400,
      `${label} inválida.`,
    );
  }

  return value;
}


function deterministicValue<
  T extends number | string,
>(
  values:
    Array<T | null>,
): T | null {
  if (
    values.length ===
      0 ||
    values.some(
      (
        value,
      ) =>
        value ===
        null,
    )
  ) {
    return null;
  }

  const distinct =
    new Set(
      values as T[],
    );

  return distinct.size ===
    1
    ? [...distinct][0]
    : null;
}


function buildDateConditions(
  startDate: string | null,
  endDate: string | null,
  values:
    Array<string | number>,
): string[] {
  const conditions:
    string[] = [];

  if (
    startDate
  ) {
    conditions.push(
      "e.event_date >= ?",
    );

    values.push(
      startDate,
    );
  }

  if (
    endDate
  ) {
    conditions.push(
      "e.event_date <= ?",
    );

    values.push(
      endDate,
    );
  }

  return conditions;
}


function formatMinutes(
  value: number,
): string {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      maximumFractionDigits:
        1,
    },
  ).format(
    value,
  );
}


async function insertMaspEvents(
  connection: PoolConnection,
  maspId: number,
  eventIds: number[],
): Promise<void> {
  const chunkSize =
    500;

  for (
    let offset = 0;
    offset <
      eventIds.length;
    offset +=
      chunkSize
  ) {
    const chunk =
      eventIds.slice(
        offset,
        offset +
          chunkSize,
      );

    const placeholders =
      chunk
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
      chunk.flatMap(
        (
          eventId,
        ) => [
          maspId,
          eventId,
        ],
      ),
    );
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
      await requireMaspContext();

    const body =
      await parseJsonBody(
        request,
      );

    const analysisLevel:
      AnalysisLevel =
      body.analysisLevel ===
        "EQUIPMENT" ||
      body.analysisLevel ===
        "FAILURE_MODE"
        ? body.analysisLevel
        : (() => {
            throw new MaspApiError(
              400,
              "O agrupamento de confiabilidade é inválido.",
            );
          })();

    const groupLabel =
      cleanText(
        body.groupLabel,
        500,
      );

    if (
      !groupLabel
    ) {
      throw new MaspApiError(
        400,
        "O problema selecionado é obrigatório.",
      );
    }

    const startDate =
      optionalDate(
        body.startDate,
        "Data inicial",
      );

    const endDate =
      optionalDate(
        body.endDate,
        "Data final",
      );

    if (
      startDate &&
      endDate &&
      startDate >
        endDate
    ) {
      throw new MaspApiError(
        400,
        "A data inicial não pode ser posterior à data final.",
      );
    }

    const line =
      cleanText(
        body.line,
        500,
      );

    const equipmentFilter =
      cleanText(
        body.equipment,
        500,
      );

    const expectedLevel:
      AnalysisLevel =
      equipmentFilter
        ? "FAILURE_MODE"
        : "EQUIPMENT";

    if (
      analysisLevel !==
      expectedLevel
    ) {
      throw new MaspApiError(
        400,
        "O agrupamento não corresponde aos filtros atuais de confiabilidade.",
      );
    }

    const allowDuplicate =
      body.allowDuplicate ===
      true;

    connection =
      await getConnection();

    await connection
      .beginTransaction();

    const unitPlaceholders =
      context
        .selectedUnitIds
        .map(
          () =>
            "?",
        )
        .join(
          ", ",
        );

    const values:
      Array<string | number> = [
        ...context.selectedUnitIds,
      ];

    const where = [
      `e.unit_id IN (${unitPlaceholders})`,
      ...buildDateConditions(
        startDate,
        endDate,
        values,
      ),
    ];

    if (
      line
    ) {
      where.push(
        "TRIM(e.source_line_name) = ?",
      );

      values.push(
        line,
      );
    }

    if (
      equipmentFilter
    ) {
      where.push(
        "TRIM(e.source_equipment_name) = ?",
      );

      values.push(
        equipmentFilter,
      );
    }

    const failureModeExpression =
      `
        COALESCE(
          NULLIF(
            CASE
              WHEN JSON_VALID(
                ec.classification_notes
              ) THEN
                JSON_UNQUOTE(
                  JSON_EXTRACT(
                    ec.classification_notes,
                    '$.failureMode'
                  )
                )
              ELSE NULL
            END,
            ''
          ),
          NULLIF(
            CASE
              WHEN JSON_VALID(
                ec.classification_notes
              ) THEN
                JSON_UNQUOTE(
                  JSON_EXTRACT(
                    ec.classification_notes,
                    '$.failure_mode'
                  )
                )
              ELSE NULL
            END,
            ''
          ),
          NULLIF(
            CASE
              WHEN JSON_VALID(
                ec.classification_notes
              ) THEN
                JSON_UNQUOTE(
                  JSON_EXTRACT(
                    ec.classification_notes,
                    '$.modelSuggestion.failureMode'
                  )
                )
              ELSE NULL
            END,
            ''
          ),
          NULLIF(
            cs.failure_mode,
            ''
          ),
          'Não classificado'
        )
      `;

    const groupExpression =
      analysisLevel ===
        "FAILURE_MODE"
        ? "base.failure_mode"
        : `
            COALESCE(
              NULLIF(
                TRIM(
                  base.equipment
                ),
                ''
              ),
              'Equipamento não informado'
            )
          `;

    values.push(
      groupLabel,
    );

    const [
      selectedEvents,
    ] =
      await connection.query<
        ReliabilityEventRow[]
      >(
        `
          WITH latest_suggestion AS (
            SELECT
                cs0.event_id,
                MAX(
                  cs0.id
                ) AS suggestion_id
            FROM
                classification_suggestions cs0
            WHERE
                cs0.model_type = 'ML'
            GROUP BY
                cs0.event_id
          ),
          base AS (
            SELECT
                e.id,
                e.unit_id,
                e.source_equipment_name AS equipment,
                ${failureModeExpression} AS failure_mode
            FROM
                maintenance_events e
            LEFT JOIN
                event_classifications ec
                    ON ec.event_id = e.id
            LEFT JOIN
                latest_suggestion latest
                    ON latest.event_id = e.id
            LEFT JOIN
                classification_suggestions cs
                    ON cs.id = latest.suggestion_id
            WHERE
                ${where.join("\nAND ")}
          )
          SELECT
              base.id,
              base.unit_id
          FROM
              base
          WHERE
              ${groupExpression} = ?
          ORDER BY
              base.id ASC
        `,
        values,
      );

    if (
      selectedEvents.length ===
      0
    ) {
      throw new MaspApiError(
        404,
        "Nenhuma ocorrência corresponde ao ponto selecionado.",
      );
    }

    const unitIds =
      new Set(
        selectedEvents.map(
          (
            event,
          ) =>
            Number(
              event.unit_id,
            ),
        ),
      );

    if (
      unitIds.size !==
      1
    ) {
      throw new MaspApiError(
        400,
        "Selecione uma única unidade antes de iniciar o MASP.",
      );
    }

    const unitId =
      [...unitIds][0];

    if (
      !context
        .selectedUnitIds
        .includes(
          unitId,
        )
    ) {
      throw new MaspApiError(
        403,
        "A unidade do problema não está autorizada na seleção atual.",
      );
    }

    const eventIds =
      selectedEvents.map(
        (
          event,
        ) =>
          Number(
            event.id,
          ),
      );

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
        409,
        "As ocorrências de confiabilidade foram alteradas. Atualize a análise e tente novamente.",
      );
    }

    const equipmentId =
      deterministicValue(
        events.map(
          (
            event,
          ) =>
            event.equipment_id
              ? Number(
                  event.equipment_id,
                )
              : null,
        ),
      );

    const productionLineId =
      deterministicValue(
        events.map(
          (
            event,
          ) =>
            event.production_line_id
              ? Number(
                  event.production_line_id,
                )
              : null,
        ),
      );

    await validateMaspReferences(
      connection,
      unitId,
      equipmentId,
      productionLineId,
      null,
    );

    const summary =
      summarizeMaspEvents(
        events,
      );

    const componentCode =
      deterministicValue(
        events.map(
          (
            event,
          ) =>
            event.component_code
              ?.trim() ||
            null,
        ),
      );

    const failureMode =
      analysisLevel ===
        "FAILURE_MODE" &&
      groupLabel !==
        "Não classificado"
        ? groupLabel
        : deterministicValue(
            events.map(
              (
                event,
              ) =>
                event.failure_mode
                  ?.trim() ||
                null,
            ),
          );

    const failureOrigin =
      deterministicValue(
        events.map(
          (
            event,
          ) =>
            isOneOf(
              event.failure_origin,
              FAILURE_ORIGINS,
            )
              ? event.failure_origin
              : null,
        ),
      );

    const [
      existingRows,
    ] =
      await connection.query<
        ExistingMaspRow[]
      >(
        `
          SELECT
              ma.id,
              ma.title,
              ma.status,
              (
                SELECT
                    COUNT(*)
                FROM
                    masp_events linked
                WHERE
                    linked.masp_id = ma.id
              ) AS event_count
          FROM
              masp_analyses ma
          WHERE
              ma.unit_id = ?
              AND ma.status NOT IN (
                  'CLOSED',
                  'CANCELLED'
              )
              AND ma.equipment_id <=> ?
              AND ma.recurrence_component_code <=> ?
              AND ma.recurrence_failure_mode <=> ?
              AND ma.recurrence_failure_origin <=> ?
          ORDER BY
              ma.updated_at DESC,
              ma.id DESC
          LIMIT 1
          FOR UPDATE
        `,
        [
          unitId,
          equipmentId,
          componentCode,
          failureMode,
          failureOrigin,
        ],
      );

    const existing =
      existingRows[0] ??
      null;

    if (
      existing &&
      !allowDuplicate
    ) {
      await connection
        .commit();

      return NextResponse.json({
        success: true,
        created: false,
        eventCount:
          eventIds.length,
        existingMasp: {
          id:
            Number(
              existing.id,
            ),
          title:
            existing.title,
          status:
            existing.status,
          eventCount:
            Number(
              existing.event_count,
            ),
        },
      });
    }

    const equipmentName =
      analysisLevel ===
        "EQUIPMENT"
        ? groupLabel
        : equipmentFilter ||
          summary.equipment;

    const titleParts = [
      failureMode ||
        groupLabel,
      equipmentName &&
      equipmentName !==
        groupLabel
        ? equipmentName
        : null,
    ].filter(
      Boolean,
    );

    const title =
      cleanText(
        `MASP - ${titleParts.join(" · ")}`,
        180,
      );

    const problemStatement =
      `${buildProblemStatement(events)} O recorte de confiabilidade totaliza ${formatMinutes(summary.downtimeTotalMinutes)} minutos de parada.`;

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
          null,
          title,
          problemStatement,
          startDate ??
            summary.firstOccurrence,
          endDate ??
            summary.lastOccurrence,
          componentCode,
          failureMode,
          failureOrigin,
          30,
        ],
      );

    const maspId =
      Number(
        insertResult.insertId,
      );

    await insertMaspEvents(
      connection,
      maspId,
      eventIds,
    );

    await connection
      .commit();

    return NextResponse.json(
      {
        success: true,
        created: true,
        id:
          maspId,
        eventCount:
          eventIds.length,
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
      "Erro ao iniciar MASP pela confiabilidade:",
    );
  } finally {
    connection
      ?.release();
  }
}
