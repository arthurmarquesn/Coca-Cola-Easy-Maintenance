import type {
  PoolConnection,
  RowDataPacket,
} from "mysql2/promise";

import {
  classificationNoteField,
} from "@/lib/analytics/sql";

import {
  MaspApiError,
} from "@/lib/masp/api";

import {
  USER_UNIT_SCOPE_CONDITION,
} from "@/lib/unit-selection";


interface MaspEventRow
  extends RowDataPacket {
  id: number;
  unit_id: number;
  event_date:
    | Date
    | string;
  equipment_id:
    | number
    | null;
  equipment_name:
    | string
    | null;
  production_line_id:
    | number
    | null;
  line_name:
    | string
    | null;
  shift:
    | string
    | null;
  observation:
    | string
    | null;
  downtime_minutes:
    | number
    | string
    | null;
  component_code:
    | string
    | null;
  failure_mode:
    | string
    | null;
  failure_origin:
    | "MANUTENCAO"
    | "OPERACAO"
    | null;
  relation_type?:
    | "SOURCE"
    | "EVIDENCE"
    | "RECURRENCE";
}

interface ExistsRow
  extends RowDataPacket {
  id: number;
}

interface MetricRow
  extends RowDataPacket {
  event_count:
    | number
    | string;
  downtime_minutes:
    | number
    | string
    | null;
}

interface CountRow
  extends RowDataPacket {
  total:
    | number
    | string;
}

interface MaspAnalysisDetailRow
  extends RowDataPacket {
  id: number;
  unit_id: number;
  unit_name: string;
  production_line_id:
    | number
    | null;
  line_name:
    | string
    | null;
  equipment_id:
    | number
    | null;
  equipment_name:
    | string
    | null;
  created_by: number;
  created_by_name: string;
  owner_user_id:
    | number
    | null;
  owner_name:
    | string
    | null;
  title: string;
  problem_statement: string;
  status: string;
  scope_start_date:
    | Date
    | string
    | null;
  scope_end_date:
    | Date
    | string
    | null;
  recurrence_component_code:
    | string
    | null;
  recurrence_failure_mode:
    | string
    | null;
  recurrence_failure_origin:
    | string
    | null;
  verification_days: number;
  closed_at:
    | Date
    | string
    | null;
  created_at:
    | Date
    | string;
  updated_at:
    | Date
    | string;
}

function eventProjection(
  relationColumn =
    "NULL",
): string {
  return `
    me.id,
    me.unit_id,
    me.event_date,
    me.equipment_id,
    COALESCE(
        eq.name,
        me.source_equipment_name
    ) AS equipment_name,
    me.production_line_id,
    COALESCE(
        pl.name,
        me.source_line_name
    ) AS line_name,
    me.shift,
    me.observation,
    me.downtime_minutes,
    COALESCE(
        fm.code,
        ${classificationNoteField("ec", "failedComponentCode")},
        latest_suggestion.failed_component_code
    ) AS component_code,
    COALESCE(
        fm.name,
        ${classificationNoteField("ec", "failureMode")},
        latest_suggestion.failure_mode
    ) AS failure_mode,
    COALESCE(
        origin_review.manual_origin,
        ec.failure_origin,
        latest_origin.failure_origin,
        latest_suggestion.failure_origin
    ) AS failure_origin,
    ${relationColumn} AS relation_type
  `;
}

function eventClassificationJoins(): string {
  return `
    LEFT JOIN
        equipments eq
            ON eq.id = me.equipment_id
    LEFT JOIN
        production_lines pl
            ON pl.id = me.production_line_id
    LEFT JOIN
        event_classifications ec
            ON ec.event_id = me.id
            AND ec.status IN (
                'APROVADA',
                'CORRIGIDA'
            )
    LEFT JOIN
        failure_modes fm
            ON fm.id = ec.mode_id
    LEFT JOIN
        event_failure_origin_reviews origin_review
            ON origin_review.event_id = me.id
    LEFT JOIN
        classification_suggestions latest_suggestion
            ON latest_suggestion.id = (
                SELECT
                    cs.id
                FROM
                    classification_suggestions cs
                WHERE
                    cs.event_id = me.id
                    AND cs.status <> 'DESCARTADA'
                ORDER BY
                    cs.created_at DESC,
                    cs.id DESC
                LIMIT 1
            )
    LEFT JOIN
        event_failure_origin_predictions latest_origin
            ON latest_origin.id = (
                SELECT
                    eop.id
                FROM
                    event_failure_origin_predictions eop
                WHERE
                    eop.event_id = me.id
                ORDER BY
                    eop.created_at DESC,
                    eop.id DESC
                LIMIT 1
            )
  `;
}

function numericValue(
  value:
    | number
    | string
    | null
    | undefined,
): number {
  const parsed =
    Number(
      value ?? 0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function dateOnly(
  value:
    | Date
    | string
    | null,
): string | null {
  if (
    !value
  ) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      );
  }

  return String(
    value,
  ).slice(
    0,
    10,
  );
}

function formatBrazilianDate(
  value:
    | Date
    | string,
): string {
  const date =
    dateOnly(
      value,
    );

  if (
    !date
  ) {
    return "data não informada";
  }

  const [
    year,
    month,
    day,
  ] =
    date.split(
      "-",
    );

  return `${day}/${month}/${year}`;
}

function dominantValue(
  values: Array<
    string | null
  >,
): string | null {
  const counts =
    new Map<
      string,
      number
    >();

  for (
    const value
    of values
  ) {
    const cleaned =
      value?.trim();

    if (
      cleaned
    ) {
      counts.set(
        cleaned,
        (
          counts.get(
            cleaned,
          ) ?? 0
        ) + 1,
      );
    }
  }

  return [
    ...counts.entries(),
  ]
    .sort(
      (
        left,
        right,
      ) =>
        right[1] -
          left[1] ||
        left[0].localeCompare(
          right[0],
          "pt-BR",
        ),
    )[0]?.[0] ??
    null;
}

export async function loadEventsByIds(
  connection: PoolConnection,
  eventIds: number[],
): Promise<MaspEventRow[]> {
  if (
    eventIds.length ===
    0
  ) {
    return [];
  }

  const placeholders =
    eventIds
      .map(
        () =>
          "?",
      )
      .join(
        ", ",
      );

  const [
    rows,
  ] =
    await connection.query<
      MaspEventRow[]
    >(
      `
        SELECT
            ${eventProjection()}
        FROM
            maintenance_events me
        ${eventClassificationJoins()}
        WHERE
            me.id IN (
                ${placeholders}
            )
        ORDER BY
            me.event_date ASC,
            me.id ASC
      `,
      eventIds,
    );

  return rows;
}

export async function validateMaspReferences(
  connection: PoolConnection,
  unitId: number,
  equipmentId: number | null,
  productionLineId: number | null,
  ownerUserId: number | null,
): Promise<void> {
  if (
    equipmentId
  ) {
    const [
      rows,
    ] =
      await connection.query<
        ExistsRow[]
      >(
        `
          SELECT id
          FROM equipments
          WHERE id = ?
            AND unit_id = ?
            AND active = TRUE
          LIMIT 1
        `,
        [
          equipmentId,
          unitId,
        ],
      );

    if (
      !rows[0]
    ) {
      throw new MaspApiError(
        400,
        "O equipamento não pertence à unidade do MASP.",
      );
    }
  }

  if (
    productionLineId
  ) {
    const [
      rows,
    ] =
      await connection.query<
        ExistsRow[]
      >(
        `
          SELECT id
          FROM production_lines
          WHERE id = ?
            AND unit_id = ?
            AND active = TRUE
          LIMIT 1
        `,
        [
          productionLineId,
          unitId,
        ],
      );

    if (
      !rows[0]
    ) {
      throw new MaspApiError(
        400,
        "A linha não pertence à unidade do MASP.",
      );
    }
  }

  if (
    ownerUserId
  ) {
    const [
      rows,
    ] =
      await connection.query<
        ExistsRow[]
      >(
        `
          SELECT
              u.id
          FROM
              users u
          INNER JOIN
              user_units uu
                  ON uu.user_id = u.id
                  AND uu.unit_id = ?
          WHERE
              u.id = ?
              AND u.active = TRUE
              AND ${USER_UNIT_SCOPE_CONDITION}
          LIMIT 1
        `,
        [
          unitId,
          ownerUserId,
        ],
      );

    if (
      !rows[0]
    ) {
      throw new MaspApiError(
        400,
        "O responsável não está vinculado à unidade do MASP.",
      );
    }
  }
}

export async function validateActionReferences(
  connection: PoolConnection,
  maspId: number,
  unitId: number,
  rootCauseId: number | null,
  whoUserId: number | null,
): Promise<void> {
  if (
    rootCauseId
  ) {
    const [
      rows,
    ] =
      await connection.query<
        CountRow[]
      >(
        `
          SELECT COUNT(*) AS total
          FROM masp_root_causes
          WHERE id = ?
            AND masp_id = ?
        `,
        [
          rootCauseId,
          maspId,
        ],
      );

    if (
      Number(
        rows[0]?.total ?? 0,
      ) !== 1
    ) {
      throw new MaspApiError(
        400,
        "A causa raiz informada não pertence a este MASP.",
      );
    }
  }

  if (
    whoUserId
  ) {
    const [
      rows,
    ] =
      await connection.query<
        CountRow[]
      >(
        `
          SELECT COUNT(*) AS total
          FROM users u
          INNER JOIN user_units uu
              ON uu.user_id = u.id
              AND uu.unit_id = ?
          WHERE u.id = ?
            AND u.active = TRUE
            AND ${USER_UNIT_SCOPE_CONDITION}
        `,
        [
          unitId,
          whoUserId,
        ],
      );

    if (
      Number(
        rows[0]?.total ?? 0,
      ) !== 1
    ) {
      throw new MaspApiError(
        400,
        "O responsável pela ação não pertence à unidade do MASP.",
      );
    }
  }
}

export function summarizeMaspEvents(
  rows: MaspEventRow[],
) {
  const downtimeTotal =
    rows.reduce(
      (
        total,
        row,
      ) =>
        total +
        numericValue(
          row.downtime_minutes,
        ),
      0,
    );

  const first =
    rows[0] ??
    null;

  const last =
    rows[
      rows.length - 1
    ] ??
    null;

  return {
    eventCount:
      rows.length,
    firstOccurrence:
      first
        ? dateOnly(
            first.event_date,
          )
        : null,
    lastOccurrence:
      last
        ? dateOnly(
            last.event_date,
          )
        : null,
    downtimeTotalMinutes:
      downtimeTotal,
    downtimeAverageMinutes:
      rows.length > 0
        ? downtimeTotal /
          rows.length
        : 0,
    equipment:
      dominantValue(
        rows.map(
          (
            row,
          ) =>
            row.equipment_name,
        ),
      ),
    line:
      dominantValue(
        rows.map(
          (
            row,
          ) =>
            row.line_name,
        ),
      ),
    component:
      dominantValue(
        rows.map(
          (
            row,
          ) =>
            row.component_code,
        ),
      ),
    failureMode:
      dominantValue(
        rows.map(
          (
            row,
          ) =>
            row.failure_mode,
        ),
      ),
    failureOrigin:
      dominantValue(
        rows.map(
          (
            row,
          ) =>
            row.failure_origin,
        ),
      ),
    frequentShifts: [
      ...new Set(
        rows
          .map(
            (
              row,
            ) =>
              row.shift
                ?.trim() ??
              "",
          )
          .filter(
            Boolean,
          ),
      ),
    ].slice(
      0,
      5,
    ),
  };
}

export function buildProblemStatement(
  rows: MaspEventRow[],
): string {
  const summary =
    summarizeMaspEvents(
      rows,
    );

  if (
    rows.length ===
    0
  ) {
    return "Problema em análise pelo método MASP.";
  }

  const parts:
    string[] = [];

  if (
    rows[0] &&
    rows[
      rows.length - 1
    ]
  ) {
    parts.push(
      `Entre ${formatBrazilianDate(rows[0].event_date)} e ${formatBrazilianDate(rows[rows.length - 1].event_date)}`,
    );
  }

  if (
    summary.equipment
  ) {
    parts.push(
      `o equipamento ${summary.equipment}`,
    );
  }

  parts.push(
    `registrou ${rows.length} ${rows.length === 1 ? "ocorrência" : "ocorrências"}`,
  );

  if (
    summary.failureMode
  ) {
    parts.push(
      `relacionadas a ${summary.failureMode}`,
    );
  }

  parts.push(
    `totalizando ${summary.downtimeTotalMinutes.toLocaleString("pt-BR", {
      maximumFractionDigits: 2,
    })} minutos de parada`,
  );

  return `${parts.join(" ")}.`;
}

export async function loadMaspDetail(
  connection: PoolConnection,
  maspId: number,
) {
  const [
    analyses,
  ] =
    await connection.query<
      MaspAnalysisDetailRow[]
    >(
      `
        SELECT
            ma.id,
            ma.unit_id,
            un.name AS unit_name,
            ma.production_line_id,
            pl.name AS line_name,
            ma.equipment_id,
            eq.name AS equipment_name,
            ma.created_by,
            creator.name AS created_by_name,
            ma.owner_user_id,
            owner.name AS owner_name,
            ma.title,
            ma.problem_statement,
            ma.status,
            ma.scope_start_date,
            ma.scope_end_date,
            ma.recurrence_component_code,
            ma.recurrence_failure_mode,
            ma.recurrence_failure_origin,
            ma.verification_days,
            ma.closed_at,
            ma.created_at,
            ma.updated_at
        FROM
            masp_analyses ma
        INNER JOIN
            units un
                ON un.id = ma.unit_id
        INNER JOIN
            users creator
                ON creator.id = ma.created_by
        LEFT JOIN
            users owner
                ON owner.id = ma.owner_user_id
        LEFT JOIN
            equipments eq
                ON eq.id = ma.equipment_id
        LEFT JOIN
            production_lines pl
                ON pl.id = ma.production_line_id
        WHERE
            ma.id = ?
        LIMIT 1
      `,
      [
        maspId,
      ],
    );

  const analysis =
    analyses[0];

  if (
    !analysis
  ) {
    throw new MaspApiError(
      404,
      "MASP não encontrado.",
    );
  }

  const [
    events,
  ] =
    await connection.query<
      MaspEventRow[]
    >(
      `
        SELECT
            ${eventProjection("mse.relation_type")}
        FROM
            masp_events mse
        INNER JOIN
            maintenance_events me
                ON me.id = mse.event_id
        ${eventClassificationJoins()}
        WHERE
            mse.masp_id = ?
        ORDER BY
            me.event_date ASC,
            me.id ASC
      `,
      [
        maspId,
      ],
    );

  const childQueries = [
    `
      SELECT
          mh.*,
          u.name AS created_by_name
      FROM masp_hypotheses mh
      INNER JOIN users u
          ON u.id = mh.created_by
      WHERE mh.masp_id = ?
      ORDER BY mh.category, mh.created_at, mh.id
    `,
    `
      SELECT
          mw.*,
          u.name AS created_by_name
      FROM masp_five_whys mw
      INNER JOIN users u
          ON u.id = mw.created_by
      WHERE mw.masp_id = ?
      ORDER BY mw.depth, mw.created_at, mw.id
    `,
    `
      SELECT
          mrc.*,
          u.name AS confirmed_by_name
      FROM masp_root_causes mrc
      LEFT JOIN users u
          ON u.id = mrc.confirmed_by
      WHERE mrc.masp_id = ?
      ORDER BY mrc.created_at, mrc.id
    `,
    `
      SELECT
          me.*,
          u.name AS created_by_name
      FROM masp_evidence me
      INNER JOIN users u
          ON u.id = me.created_by
      WHERE me.masp_id = ?
      ORDER BY me.created_at, me.id
    `,
    `
      SELECT
          maa.*,
          responsible.name AS who_user_name,
          creator.name AS created_by_name
      FROM masp_actions maa
      INNER JOIN users creator
          ON creator.id = maa.created_by
      LEFT JOIN users responsible
          ON responsible.id = maa.who_user_id
      WHERE maa.masp_id = ?
      ORDER BY maa.when_date, maa.created_at, maa.id
    `,
    `
      SELECT
          mv.*,
          u.name AS verified_by_name
      FROM masp_verifications mv
      INNER JOIN users u
          ON u.id = mv.verified_by
      WHERE mv.masp_id = ?
      ORDER BY mv.verified_at DESC, mv.id DESC
    `,
  ];

  const childRows:
    RowDataPacket[][] = [];

  for (
    const sql
    of childQueries
  ) {
    const [
      rows,
    ] =
      await connection.query<
        RowDataPacket[]
      >(
        sql,
        [
          maspId,
        ],
      );

    childRows.push(
      rows,
    );
  }

  return {
    analysis,
    summary:
      summarizeMaspEvents(
        events,
      ),
    events,
    hypotheses:
      childRows[0],
    fiveWhys:
      childRows[1],
    rootCauses:
      childRows[2],
    evidence:
      childRows[3],
    actions:
      childRows[4],
    verifications:
      childRows[5],
  };
}

async function queryMetrics(
  connection: PoolConnection,
  params: {
    unitId: number;
    start: string | null;
    end: string | null;
    equipmentId: number | null;
    componentCode: string | null;
    failureMode: string | null;
    failureOrigin:
      | string
      | null;
  },
): Promise<{
  eventCount: number;
  downtimeMinutes: number;
}> {
  const conditions = [
    "me.unit_id = ?",
  ];

  const values:
    Array<number | string> = [
      params.unitId,
    ];

  if (
    params.start
  ) {
    conditions.push(
      "me.event_date >= ?",
    );
    values.push(
      params.start,
    );
  }

  if (
    params.end
  ) {
    conditions.push(
      "me.event_date <= ?",
    );
    values.push(
      params.end,
    );
  }

  if (
    params.equipmentId
  ) {
    conditions.push(
      "me.equipment_id = ?",
    );
    values.push(
      params.equipmentId,
    );
  }

  if (
    params.componentCode
  ) {
    conditions.push(
      "COALESCE(fm.code, latest_suggestion.failed_component_code) = ?",
    );
    values.push(
      params.componentCode,
    );
  }

  if (
    params.failureMode
  ) {
    conditions.push(
      "COALESCE(fm.name, latest_suggestion.failure_mode) = ?",
    );
    values.push(
      params.failureMode,
    );
  }

  if (
    params.failureOrigin
  ) {
    conditions.push(
      `
        COALESCE(
            ec.failure_origin,
            latest_origin.failure_origin,
            latest_suggestion.failure_origin
        ) = ?
      `,
    );
    values.push(
      params.failureOrigin,
    );
  }

  const [
    rows,
  ] =
    await connection.query<
      MetricRow[]
    >(
      `
        SELECT
            COUNT(*) AS event_count,
            COALESCE(
                SUM(me.downtime_minutes),
                0
            ) AS downtime_minutes
        FROM
            maintenance_events me
        ${eventClassificationJoins()}
        WHERE
            ${conditions.join(" AND ")}
      `,
      values,
    );

  return {
    eventCount:
      numericValue(
        rows[0]
          ?.event_count,
      ),
    downtimeMinutes:
      numericValue(
        rows[0]
          ?.downtime_minutes,
      ),
  };
}

export async function calculateVerificationMetrics(
  connection: PoolConnection,
  masp: {
    unit_id: number;
    equipment_id:
      | number
      | null;
    recurrence_component_code:
      | string
      | null;
    recurrence_failure_mode:
      | string
      | null;
    recurrence_failure_origin:
      | string
      | null;
  },
  periods: {
    baselineStart:
      | string
      | null;
    baselineEnd:
      | string
      | null;
    verificationStart: string;
    verificationEnd:
      | string
      | null;
  },
) {
  const signature = {
    unitId:
      Number(
        masp.unit_id,
      ),
    equipmentId:
      masp.equipment_id,
    componentCode:
      masp
        .recurrence_component_code,
    failureMode:
      masp
        .recurrence_failure_mode,
    failureOrigin:
      masp
        .recurrence_failure_origin,
  };

  const before =
    await queryMetrics(
      connection,
      {
        ...signature,
        start:
          periods.baselineStart,
        end:
          periods.baselineEnd,
      },
    );

  const after =
    await queryMetrics(
      connection,
      {
        ...signature,
        start:
          periods.verificationStart,
        end:
          periods.verificationEnd,
      },
    );

  return {
    before,
    after,
    recurrenceDetected:
      after.eventCount > 0,
  };
}
