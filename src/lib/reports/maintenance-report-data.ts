import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  executeRows,
} from "@/lib/db";

/* Mesma regra de modo de falha dos gráficos: a decisão do
   revisor (classification_notes) vem antes da sugestão. */
import {
  CLASSIFICATION_JOINS,
  FAILURE_MODE_EXPRESSION,
} from "@/lib/analytics/sql";

/* Pedido de relatório com unidade fora do acesso do usuário. */
export class ReportAccessError extends Error {}

export type MaintenanceReportMetric =
  | "SUMMARY"
  | "UNIT_COMPARISON"
  | "PARETO"
  | "JACK_KNIFE"
  | "CRITICALITY"
  | "FAILURE_MODES"
  | "DETAILS";

export interface MaintenanceReportRequest {
  unitIds: number[];
  startDate: string;
  endDate: string;
  line: string | null;
  equipment: string | null;
  metrics: MaintenanceReportMetric[];
}

export interface MaintenanceReportUnit {
  id: number;
  code: string | null;
  sapCode: string | null;
  name: string;
  city: string | null;
  state: string | null;
}

export interface MaintenanceReportSummary {
  events: number;
  downtimeMinutes: number;
  averageDowntimeMinutes: number;
  mttrMinutes: number;
  equipments: number;
  lines: number;
}

export interface MaintenanceReportUnitComparison {
  unitId: number;
  code: string | null;
  name: string;
  city: string | null;
  events: number;
  downtimeMinutes: number;
  mttrMinutes: number;
}

export interface MaintenanceReportParetoItem {
  rank: number;
  label: string;
  occurrences: number;
  downtimeMinutes: number;
  percentage: number;
  cumulativePercentage: number;
}

export type MaintenanceReportQuadrant =
  | "CRITICO_CRONICO"
  | "CRITICO"
  | "CRONICO"
  | "CONFORTO";

export interface MaintenanceReportJackKnifeItem {
  label: string;
  frequency: number;
  downtimeMinutes: number;
  mttrMinutes: number;
  quadrant: MaintenanceReportQuadrant;
}

export interface MaintenanceReportCriticalityItem {
  criticality: string;
  events: number;
  downtimeMinutes: number;
}

export interface MaintenanceReportFailureModeItem {
  label: string;
  events: number;
  downtimeMinutes: number;
}

export interface MaintenanceReportDetailItem {
  id: number;
  eventDate: string;
  unit: string;
  unitCode: string | null;
  line: string | null;
  equipment: string | null;
  failureMode: string | null;
  observation: string | null;
  downtimeMinutes: number;
}

export interface MaintenanceReportData {
  generatedAt: string;
  requestedBy: string;

  filters: {
    startDate: string;
    endDate: string;
    line: string | null;
    equipment: string | null;
    metrics: MaintenanceReportMetric[];
  };

  units: MaintenanceReportUnit[];

  summary:
    MaintenanceReportSummary;

  unitComparison:
    MaintenanceReportUnitComparison[];

  pareto:
    MaintenanceReportParetoItem[];

  jackKnife:
    MaintenanceReportJackKnifeItem[];

  jackKnifeLimits: {
    frequency: number;
    mttrMinutes: number;
  };

  criticality:
    MaintenanceReportCriticalityItem[];

  failureModes:
    MaintenanceReportFailureModeItem[];

  details:
    MaintenanceReportDetailItem[];

  detailsTruncated: boolean;

  executiveAnalysis:
    string[];
}

/* =========================================================
   DATABASE TYPES
========================================================= */

interface UnitRow
  extends RowDataPacket {
  id: number | string;
  code: string | null;
  sap_code: string | null;
  name: string;
  city: string | null;
  state: string | null;
}

interface OptionRow
  extends RowDataPacket {
  value: string;
}

interface SummaryRow
  extends RowDataPacket {
  events: number | string;

  downtime_minutes:
    | number
    | string
    | null;

  average_downtime_minutes:
    | number
    | string
    | null;

  equipment_count:
    | number
    | string;

  line_count:
    | number
    | string;
}

interface UnitComparisonRow
  extends RowDataPacket {
  unit_id:
    | number
    | string;
  code: string | null;
  name: string;
  city: string | null;
  events:
    | number
    | string;
  downtime_minutes:
    | number
    | string
    | null;
}

interface AggregateRow
  extends RowDataPacket {
  label: string;
  events:
    | number
    | string;
  downtime_minutes:
    | number
    | string
    | null;
}

interface CriticalityRow
  extends RowDataPacket {
  criticality:
    | string
    | null;
  events:
    | number
    | string;
  downtime_minutes:
    | number
    | string
    | null;
}

interface DetailRow
  extends RowDataPacket {
  id:
    | number
    | string;

  event_date:
    | string
    | Date;

  unit_name: string;

  unit_code:
    | string
    | null;

  source_line_name:
    | string
    | null;

  source_equipment_name:
    | string
    | null;

  failure_mode:
    | string
    | null;

  observation:
    | string
    | null;

  downtime_minutes:
    | number
    | string
    | null;
}

const MAX_DETAIL_ROWS =
  2000;

/* =========================================================
   HELPERS
========================================================= */

function numberValue(
  value: unknown,
) {
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

function round(
  value: number,
  digits = 2,
) {
  const factor =
    10 ** digits;

  return (
    Math.round(
      value * factor,
    ) / factor
  );
}

function formatDatabaseDate(
  value:
    | string
    | Date,
) {
  if (
    value instanceof Date
  ) {
    const year =
      value.getUTCFullYear();

    const month =
      String(
        value.getUTCMonth() +
          1,
      ).padStart(
        2,
        "0",
      );

    const day =
      String(
        value.getUTCDate(),
      ).padStart(
        2,
        "0",
      );

    return `${year}-${month}-${day}`;
  }

  return String(
    value,
  ).slice(
    0,
    10,
  );
}

function placeholders(
  values: number[],
) {
  return values
    .map(
      () => "?",
    )
    .join(
      ", ",
    );
}

function normalizeIds(
  ids: number[],
) {
  return [
    ...new Set(
      ids
        .map(Number)
        .filter(
          (id) =>
            Number.isInteger(
              id,
            ) &&
            id > 0,
        ),
    ),
  ];
}

/* =========================================================
   ACCESS
========================================================= */

async function loadAccessibleUnits(
  userId: number,
): Promise<
  MaintenanceReportUnit[]
> {
  const rows =
    await executeRows<
      UnitRow[]
    >(
      `
        SELECT
          u.id,
          u.code,
          u.sap_code,
          u.name,
          u.city,
          u.state

        FROM user_units uu

        INNER JOIN units u
          ON u.id = uu.unit_id

        WHERE
          uu.user_id = ?
          AND u.active = TRUE

        ORDER BY
          uu.is_default DESC,
          u.city ASC,
          u.name ASC,
          u.id ASC
      `,
      [
        userId,
      ],
    );

  return rows.map(
    (row) => ({
      id:
        Number(
          row.id,
        ),

      code:
        row.code,

      sapCode:
        row.sap_code,

      name:
        row.name,

      city:
        row.city,

      state:
        row.state,
    }),
  );
}

/* =========================================================
   OPTIONS FOR MODAL
========================================================= */

export async function getMaintenanceReportOptions(
  userId: number,
) {
  const units =
    await loadAccessibleUnits(
      userId,
    );

  if (
    units.length === 0
  ) {
    return {
      units,
      lines: [] as string[],
      equipments: [] as string[],
    };
  }

  const ids =
    units.map(
      (unit) =>
        unit.id,
    );

  const inClause =
    placeholders(ids);

  const [
    lineRows,
    equipmentRows,
  ] =
    await Promise.all([
      executeRows<OptionRow[]>(
        `
          SELECT DISTINCT
            TRIM(
              e.source_line_name
            ) AS value

          FROM maintenance_events e

          WHERE
            e.unit_id IN (${inClause})

            AND
            e.source_line_name
              IS NOT NULL

            AND
            TRIM(
              e.source_line_name
            ) <> ''

          ORDER BY value ASC
        `,
        ids,
      ),

      executeRows<OptionRow[]>(
        `
          SELECT DISTINCT
            TRIM(
              e.source_equipment_name
            ) AS value

          FROM maintenance_events e

          WHERE
            e.unit_id IN (${inClause})

            AND
            e.source_equipment_name
              IS NOT NULL

            AND
            TRIM(
              e.source_equipment_name
            ) <> ''

          ORDER BY value ASC
        `,
        ids,
      ),
    ]);

  return {
    units,

    lines:
      lineRows.map(
        (row) =>
          row.value,
      ),

    equipments:
      equipmentRows.map(
        (row) =>
          row.value,
      ),
  };
}

/* =========================================================
   WHERE
========================================================= */

function buildWhere(
  request:
    MaintenanceReportRequest,

  unitIds:
    number[],
) {
  const where = [
    `e.unit_id IN (${placeholders(
      unitIds,
    )})`,

    "e.event_date >= ?",

    "e.event_date <= ?",
  ];

  const params:
    Array<
      string | number
    > = [
      ...unitIds,
      request.startDate,
      request.endDate,
    ];

  if (
    request.line
  ) {
    where.push(
      "TRIM(e.source_line_name) = ?",
    );

    params.push(
      request.line,
    );
  }

  if (
    request.equipment
  ) {
    where.push(
      "TRIM(e.source_equipment_name) = ?",
    );

    params.push(
      request.equipment,
    );
  }

  return {
    clause:
      where.join(
        "\nAND ",
      ),

    params,
  };
}

/* =========================================================
   PARETO
========================================================= */

function createPareto(
  rows:
    AggregateRow[],
): MaintenanceReportParetoItem[] {
  const normalized =
    rows
      .map(
        (row) => ({
          label:
            row.label,

          occurrences:
            numberValue(
              row.events,
            ),

          downtimeMinutes:
            numberValue(
              row.downtime_minutes,
            ),
        }),
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.downtimeMinutes -
          a.downtimeMinutes,
      );

  const totalDowntime =
    normalized.reduce(
      (
        total,
        item,
      ) =>
        total +
        item.downtimeMinutes,
      0,
    );

  let cumulative =
    0;

  return normalized.map(
    (
      item,
      index,
    ) => {
      cumulative +=
        item.downtimeMinutes;

      return {
        rank:
          index + 1,

        label:
          item.label,

        occurrences:
          item.occurrences,

        downtimeMinutes:
          round(
            item.downtimeMinutes,
          ),

        percentage:
          totalDowntime > 0
            ? round(
                (
                  item.downtimeMinutes /
                  totalDowntime
                ) * 100,
              )
            : 0,

        cumulativePercentage:
          totalDowntime > 0
            ? round(
                (
                  cumulative /
                  totalDowntime
                ) * 100,
              )
            : 0,
      };
    },
  );
}

/* =========================================================
   JACK-KNIFE
========================================================= */

function createJackKnife(
  pareto:
    MaintenanceReportParetoItem[],

  summary:
    MaintenanceReportSummary,
) {
  const frequencyLimit =
    pareto.length > 0
      ? Math.max(
          1,
          Math.ceil(
            pareto.reduce(
              (
                total,
                item,
              ) =>
                total +
                item.occurrences,
              0,
            ) /
              pareto.length,
          ),
        )
      : 1;

  const mttrLimit =
    summary.events > 0
      ? (
          summary.downtimeMinutes /
          summary.events
        )
      : 0;

  const items:
    MaintenanceReportJackKnifeItem[] =
    pareto.map(
      (item) => {
        const mttr =
          item.occurrences > 0
            ? (
                item.downtimeMinutes /
                item.occurrences
              )
            : 0;

        const highFrequency =
          item.occurrences >=
          frequencyLimit;

        const highMttr =
          mttr >=
          mttrLimit;

        let quadrant:
          MaintenanceReportQuadrant =
          "CONFORTO";

        if (
          highFrequency &&
          highMttr
        ) {
          quadrant =
            "CRITICO_CRONICO";
        } else if (
          highMttr
        ) {
          quadrant =
            "CRITICO";
        } else if (
          highFrequency
        ) {
          quadrant =
            "CRONICO";
        }

        return {
          label:
            item.label,

          frequency:
            item.occurrences,

          downtimeMinutes:
            item.downtimeMinutes,

          mttrMinutes:
            round(mttr),

          quadrant,
        };
      },
    );

  return {
    items,

    limits: {
      frequency:
        frequencyLimit,

      mttrMinutes:
        round(
          mttrLimit,
        ),
    },
  };
}

/* =========================================================
   EXECUTIVE TEXT
========================================================= */

function createExecutiveAnalysis(
  summary:
    MaintenanceReportSummary,

  units:
    MaintenanceReportUnitComparison[],

  pareto:
    MaintenanceReportParetoItem[],

  criticality:
    MaintenanceReportCriticalityItem[],
) {
  const result:
    string[] = [];

  result.push(
    `No período analisado foram registradas ${Math.round(
      summary.events,
    ).toLocaleString(
      "pt-BR",
    )} ocorrências, totalizando ${round(
      summary.downtimeMinutes,
      1,
    ).toLocaleString(
      "pt-BR",
    )} minutos de parada.`,
  );

  const topUnit =
    [...units].sort(
      (
        a,
        b,
      ) =>
        b.downtimeMinutes -
        a.downtimeMinutes,
    )[0];

  if (
    topUnit &&
    summary.downtimeMinutes > 0
  ) {
    const share =
      (
        topUnit.downtimeMinutes /
        summary.downtimeMinutes
      ) * 100;

    result.push(
      `${topUnit.city || topUnit.name} concentrou ${round(
        share,
        1,
      ).toLocaleString(
        "pt-BR",
      )}% do tempo total de parada do recorte selecionado.`,
    );
  }

  const topPareto =
    pareto[0];

  if (topPareto) {
    result.push(
      `${topPareto.label} foi o principal item do Pareto, com ${round(
        topPareto.downtimeMinutes,
        1,
      ).toLocaleString(
        "pt-BR",
      )} minutos de parada, correspondendo a ${round(
        topPareto.percentage,
        1,
      ).toLocaleString(
        "pt-BR",
      )}% do total.`,
    );
  }

  const criticalA =
    criticality.find(
      (item) =>
        item.criticality ===
        "A",
    );

  if (
    criticalA &&
    criticalA.events > 0
  ) {
    result.push(
      `Equipamentos de criticidade A concentraram ${criticalA.events.toLocaleString(
        "pt-BR",
      )} ocorrências e ${round(
        criticalA.downtimeMinutes,
        1,
      ).toLocaleString(
        "pt-BR",
      )} minutos de parada.`,
    );
  }

  return result;
}

/* =========================================================
   BUILD REPORT DATA
========================================================= */

export async function buildMaintenanceReportData({
  userId,
  requestedBy,
  request,
}: {
  userId: number;
  requestedBy: string;
  request: MaintenanceReportRequest;
}): Promise<MaintenanceReportData> {
  const accessibleUnits =
    await loadAccessibleUnits(
      userId,
    );

  const accessibleMap =
    new Map(
      accessibleUnits.map(
        (unit) => [
          unit.id,
          unit,
        ],
      ),
    );

  const requestedIds =
    normalizeIds(
      request.unitIds,
    );

  const forbiddenIds =
    requestedIds.filter(
      (id) =>
        !accessibleMap.has(id),
    );

  if (
    forbiddenIds.length > 0
  ) {
    throw new ReportAccessError(
      "Uma ou mais unidades selecionadas não estão autorizadas para este usuário.",
    );
  }

  const selectedUnits =
    requestedIds
      .map(
        (id) =>
          accessibleMap.get(id),
      )
      .filter(
        (
          unit,
        ): unit is MaintenanceReportUnit =>
          Boolean(unit),
      );

  if (
    selectedUnits.length === 0
  ) {
    throw new Error(
      "Selecione pelo menos uma unidade válida.",
    );
  }

  const selectedIds =
    selectedUnits.map(
      (unit) =>
        unit.id,
    );

  const where =
    buildWhere(
      request,
      selectedIds,
    );

  /* -------------------------------------------------------
     SUMMARY
  ------------------------------------------------------- */

  const summaryRows =
  await executeRows<
    SummaryRow[]
  >(
    `
      SELECT
        COUNT(*) AS events,

        COALESCE(
          SUM(
            e.downtime_minutes
          ),
          0
        ) AS downtime_minutes,

        COALESCE(
          AVG(
            e.downtime_minutes
          ),
          0
        ) AS average_downtime_minutes,

        COUNT(
          DISTINCT
          NULLIF(
            TRIM(
              e.source_equipment_name
            ),
            ''
          )
        ) AS equipment_count,

        COUNT(
          DISTINCT
          NULLIF(
            TRIM(
              e.source_line_name
            ),
            ''
          )
        ) AS line_count

      FROM maintenance_events e

      WHERE
        ${where.clause}
    `,
    where.params,
  );

  const summaryRow =
    summaryRows[0];

  const events =
    numberValue(
      summaryRow?.events,
    );

  const downtimeMinutes =
    numberValue(
      summaryRow
        ?.downtime_minutes,
    );

  const summary:
    MaintenanceReportSummary = {
    events,

    downtimeMinutes:
      round(
        downtimeMinutes,
      ),

    averageDowntimeMinutes:
      round(
        numberValue(
          summaryRow
            ?.average_downtime_minutes,
        ),
      ),

    mttrMinutes:
      events > 0
        ? round(
            downtimeMinutes /
              events,
          )
        : 0,

    equipments:
  numberValue(
    summaryRow
      ?.equipment_count,
  ),

lines:
  numberValue(
    summaryRow
      ?.line_count,
  ),
  };

  const metrics =
    new Set(
      request.metrics,
    );

  const needsPareto =
    metrics.has(
      "PARETO",
    ) ||
    metrics.has(
      "JACK_KNIFE",
    ) ||
    metrics.has(
      "SUMMARY",
    );

  /* -------------------------------------------------------
     OTHER QUERIES
  ------------------------------------------------------- */

  const [
    unitRows,
    paretoRows,
    criticalityRows,
    failureModeRows,
    detailRows,
  ] =
    await Promise.all([
      metrics.has(
        "UNIT_COMPARISON",
      ) ||
      metrics.has(
        "SUMMARY",
      )
        ? executeRows<
            UnitComparisonRow[]
          >(
            `
              SELECT
                u.id AS unit_id,
                u.code,
                u.name,
                u.city,

                COUNT(*) AS events,

                COALESCE(
                  SUM(
                    e.downtime_minutes
                  ),
                  0
                ) AS downtime_minutes

              FROM maintenance_events e

              INNER JOIN units u
                ON u.id = e.unit_id

              WHERE
                ${where.clause}

              GROUP BY
                u.id,
                u.code,
                u.name,
                u.city

              ORDER BY
                downtime_minutes DESC,
                events DESC,
                u.name ASC
            `,
            where.params,
          )
        : Promise.resolve(
            [] as UnitComparisonRow[],
          ),

      needsPareto
        ? executeRows<
            AggregateRow[]
          >(
            `
              SELECT
                COALESCE(
                  NULLIF(
                    TRIM(
                      e.source_equipment_name
                    ),
                    ''
                  ),
                  'Não identificado'
                ) AS label,

                COUNT(*) AS events,

                COALESCE(
                  SUM(
                    e.downtime_minutes
                  ),
                  0
                ) AS downtime_minutes

              FROM maintenance_events e

              WHERE
                ${where.clause}

              GROUP BY label

              ORDER BY
                downtime_minutes DESC,
                events DESC,
                label ASC
            `,
            where.params,
          )
        : Promise.resolve(
            [] as AggregateRow[],
          ),

      metrics.has(
        "CRITICALITY",
      ) ||
      metrics.has(
        "SUMMARY",
      )
        ? executeRows<
            CriticalityRow[]
          >(
            `
              SELECT
                criticality_summary.criticality,
                criticality_summary.events,
                criticality_summary.downtime_minutes

              FROM (
                SELECT
                  COALESCE(
                    eq.criticality,
                    'N/D'
                  ) AS criticality,

                  COUNT(*) AS events,

                  COALESCE(
                    SUM(
                      e.downtime_minutes
                    ),
                    0
                  ) AS downtime_minutes

                FROM maintenance_events e

                LEFT JOIN equipments eq
                  ON eq.id =
                     e.equipment_id

                WHERE
                  ${where.clause}

                GROUP BY
                  COALESCE(
                    eq.criticality,
                    'N/D'
                  )
              ) AS criticality_summary

              ORDER BY
                FIELD(
                  criticality_summary.criticality,
                  'A',
                  'B',
                  'C',
                  'N/D'
                ),
                criticality_summary.criticality ASC
            `,
            where.params,
          )
        : Promise.resolve(
            [] as CriticalityRow[],
          ),

      metrics.has(
        "FAILURE_MODES",
      )
        ? executeRows<
            AggregateRow[]
          >(
            `
              SELECT
                ${FAILURE_MODE_EXPRESSION} AS label,

                COUNT(*) AS events,

                COALESCE(
                  SUM(
                    e.downtime_minutes
                  ),
                  0
                ) AS downtime_minutes

              FROM maintenance_events e

              ${CLASSIFICATION_JOINS}

              WHERE
                ${where.clause}

              GROUP BY label

              ORDER BY
                downtime_minutes DESC,
                events DESC,
                label ASC
            `,
            where.params,
          )
        : Promise.resolve(
            [] as AggregateRow[],
          ),

      metrics.has(
        "DETAILS",
      )
        ? executeRows<
            DetailRow[]
          >(
            `
              SELECT
                e.id,
                e.event_date,

                u.name AS unit_name,
                u.code AS unit_code,

                e.source_line_name,
                e.source_equipment_name,

                ${FAILURE_MODE_EXPRESSION} AS failure_mode,

                e.observation,

                COALESCE(
                  e.downtime_minutes,
                  0
                ) AS downtime_minutes

              FROM maintenance_events e

              INNER JOIN units u
                ON u.id =
                   e.unit_id

              ${CLASSIFICATION_JOINS}

              WHERE
                ${where.clause}

              ORDER BY
                e.event_date DESC,
                e.id DESC

              LIMIT ${MAX_DETAIL_ROWS + 1}
            `,
            where.params,
          )
        : Promise.resolve(
            [] as DetailRow[],
          ),
    ]);

  /* -------------------------------------------------------
     MAP RESULTS
  ------------------------------------------------------- */

  const unitComparison:
    MaintenanceReportUnitComparison[] =
    unitRows.map(
      (row) => {
        const unitEvents =
          numberValue(
            row.events,
          );

        const unitDowntime =
          numberValue(
            row.downtime_minutes,
          );

        return {
          unitId:
            Number(
              row.unit_id,
            ),

          code:
            row.code,

          name:
            row.name,

          city:
            row.city,

          events:
            unitEvents,

          downtimeMinutes:
            round(
              unitDowntime,
            ),

          mttrMinutes:
            unitEvents > 0
              ? round(
                  unitDowntime /
                    unitEvents,
                )
              : 0,
        };
      },
    );

  const pareto =
    createPareto(
      paretoRows,
    );

  const jackKnifeResult =
    createJackKnife(
      pareto,
      summary,
    );

  const criticality:
    MaintenanceReportCriticalityItem[] =
    criticalityRows.map(
      (row) => ({
        criticality:
          row.criticality ||
          "N/D",

        events:
          numberValue(
            row.events,
          ),

        downtimeMinutes:
          round(
            numberValue(
              row.downtime_minutes,
            ),
          ),
      }),
    );

  const failureModes:
    MaintenanceReportFailureModeItem[] =
    failureModeRows.map(
      (row) => ({
        label:
          row.label,

        events:
          numberValue(
            row.events,
          ),

        downtimeMinutes:
          round(
            numberValue(
              row.downtime_minutes,
            ),
          ),
      }),
    );

  const detailsTruncated =
    detailRows.length >
    MAX_DETAIL_ROWS;

  const details:
    MaintenanceReportDetailItem[] =
    detailRows
      .slice(
        0,
        MAX_DETAIL_ROWS,
      )
      .map(
        (row) => ({
          id:
            Number(
              row.id,
            ),

          eventDate:
            formatDatabaseDate(
              row.event_date,
            ),

          unit:
            row.unit_name,

          unitCode:
            row.unit_code,

          line:
            row.source_line_name,

          equipment:
            row.source_equipment_name,

          failureMode:
            row.failure_mode,

          observation:
            row.observation,

          downtimeMinutes:
            round(
              numberValue(
                row.downtime_minutes,
              ),
            ),
        }),
      );

  return {
    generatedAt:
      new Date()
        .toISOString(),

    requestedBy,

    filters: {
      startDate:
        request.startDate,

      endDate:
        request.endDate,

      line:
        request.line,

      equipment:
        request.equipment,

      metrics:
        request.metrics,
    },

    units:
      selectedUnits,

    summary,

    unitComparison,

    pareto,

    jackKnife:
      jackKnifeResult.items,

    jackKnifeLimits:
      jackKnifeResult.limits,

    criticality,

    failureModes,

    details,

    detailsTruncated,

    executiveAnalysis:
      createExecutiveAnalysis(
        summary,
        unitComparison,
        pareto,
        criticality,
      ),
  };
}