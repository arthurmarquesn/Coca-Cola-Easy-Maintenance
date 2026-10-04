import {
  NextRequest,
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

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* =========================================================
   TIPOS
========================================================= */

interface CountRow
  extends RowDataPacket {
  total:
    | number
    | string
    | null;
}

interface ImportsSummaryRow
  extends RowDataPacket {
  total_imports:
    | number
    | string
    | null;

  total_events:
    | number
    | string
    | null;

  total_raw_rows:
    | number
    | string
    | null;

  total_classified:
    | number
    | string
    | null;
}

interface ImportRow
  extends RowDataPacket {
  id:
    number | string;

  unit_id:
    number | string;

  file_name:
    string;

  original_file_name:
    string | null;

  file_hash:
    string | null;

  source_system:
    string | null;

  status:
    string | null;

  total_rows:
    number | string | null;

  processed_rows:
    number | string | null;

  error_rows:
    number | string | null;

  error_message:
    string | null;

  imported_at:
    string | Date | null;

  created_at:
    string | Date | null;

  updated_at:
    string | Date | null;

  primary_unit_code:
    string | null;

  primary_unit_name:
    string | null;

  primary_unit_city:
    string | null;

  primary_unit_state:
    string | null;

  events:
    number | string | null;

  classifiable_events:
    number | string | null;

  classified_events:
    number | string | null;

  pending_events:
    number | string | null;

  downtime_minutes:
    number | string | null;

  raw_rows:
    number | string | null;

  units_count:
    number | string | null;

  units_label:
    string | null;

  model_versions:
    string | null;
}

interface StatusRow
  extends RowDataPacket {
  status:
    string | null;
}

/* =========================================================
   HELPERS
========================================================= */

function toNumber(
  value:
    | number
    | string
    | null
    | undefined,
): number {
  const parsed =
    Number(
      value ??
        0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function formatDateTime(
  value:
    | string
    | Date
    | null,
): string | null {
  if (!value) {
    return null;
  }

  if (
    value instanceof
    Date
  ) {
    return value.toISOString();
  }

  return String(
    value,
  );
}

function normalizePage(
  value:
    string | null,
): number {
  const parsed =
    Number(
      value ??
        1,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return 1;
  }

  return Math.max(
    1,
    Math.floor(
      parsed,
    ),
  );
}

function normalizePageSize(
  value:
    string | null,
): number {
  const parsed =
    Number(
      value ??
        20,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return 20;
  }

  return Math.min(
    100,
    Math.max(
      10,
      Math.floor(
        parsed,
      ),
    ),
  );
}

/* =========================================================
   GET /api/imports
========================================================= */

export async function GET(
  request:
    NextRequest,
) {
  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Sessão expirada.",
      },
      {
        status:
          401,
      },
    );
  }

  try {
    /* =====================================================
       UNIDADES
    ====================================================== */

    const unitSelection =
      await getUnitSelection({
        userId:
          session.userId,

        defaultUnitId:
          session.unitId,
      });

    if (
      unitSelection
        .selectedUnitIds
        .length ===
      0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Nenhuma unidade válida está selecionada.",
        },
        {
          status:
            403,
        },
      );
    }

    const selectedUnitIds =
      unitSelection
        .selectedUnitIds;

    const accessibleUnitIds =
      Array.from(
        new Set(
          unitSelection
            .units
            .map(
              (
                currentUnit,
              ) =>
                Number(
                  currentUnit.id,
                ),
            )
            .filter(
              (
                id,
              ) =>
                Number.isInteger(
                  id,
                ) &&
                id >
                  0,
            ),
        ),
      );

    if (
      accessibleUnitIds.length ===
      0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "O usuário não possui unidades autorizadas.",
        },
        {
          status:
            403,
        },
      );
    }

    const selectedFilter =
      buildUnitInClause(
        selectedUnitIds,
      );

    const accessibleFilter =
      buildUnitInClause(
        accessibleUnitIds,
      );

    /* =====================================================
       PARÂMETROS
    ====================================================== */

    const searchParams =
      request.nextUrl
        .searchParams;

    const page =
      normalizePage(
        searchParams.get(
          "page",
        ),
      );

    const pageSize =
      normalizePageSize(
        searchParams.get(
          "pageSize",
        ),
      );

    const search =
      (
        searchParams.get(
          "search",
        ) ??
        ""
      )
        .trim()
        .slice(
          0,
          120,
        );

    const status =
      (
        searchParams.get(
          "status",
        ) ??
        ""
      )
        .trim()
        .slice(
          0,
          50,
        );

    /* =====================================================
       FILTRO BASE

       Uma importação é visível quando:

       1. a unidade principal está selecionada
          OU algum evento dela pertence à unidade selecionada;

       2. nenhuma unidade presente na importação está fora
          do acesso permitido ao usuário.
    ====================================================== */

    const baseWhere:
      string[] = [
        `
          (
            i.unit_id IN (
              ${selectedFilter.placeholders}
            )

            OR EXISTS (
              SELECT
                1

              FROM
                maintenance_events selected_event

              WHERE
                selected_event.import_id =
                  i.id

                AND selected_event.unit_id IN (
                  ${selectedFilter.placeholders}
                )
            )
          )
        `,

        `
          i.unit_id IN (
            ${accessibleFilter.placeholders}
          )
        `,

        `
          NOT EXISTS (
            SELECT
              1

            FROM
              maintenance_events unauthorized_event

            WHERE
              unauthorized_event.import_id =
                i.id

              AND unauthorized_event.unit_id NOT IN (
                ${accessibleFilter.placeholders}
              )
          )
        `,
      ];

    const baseValues:
      Array<
        string | number
      > = [
        ...selectedFilter.values,

        ...selectedFilter.values,

        ...accessibleFilter.values,

        ...accessibleFilter.values,
      ];

    /* =====================================================
       FILTRO DA LISTAGEM
    ====================================================== */

    const filteredWhere =
      [
        ...baseWhere,
      ];

    const filteredValues:
      Array<
        string | number
      > = [
        ...baseValues,
      ];

    if (
      search
    ) {
      filteredWhere.push(
        `
          (
            i.file_name LIKE ?

            OR COALESCE(
              i.original_file_name,
              ''
            ) LIKE ?

            OR COALESCE(
              i.source_system,
              ''
            ) LIKE ?

            OR COALESCE(
              i.status,
              ''
            ) LIKE ?
          )
        `,
      );

      const like =
        `%${search}%`;

      filteredValues.push(
        like,
        like,
        like,
        like,
      );
    }

    if (
      status
    ) {
      filteredWhere.push(
        "i.status = ?",
      );

      filteredValues.push(
        status,
      );
    }

    const baseWhereSql =
      baseWhere.join(
        "\nAND ",
      );

    const filteredWhereSql =
      filteredWhere.join(
        "\nAND ",
      );

    /* =====================================================
       CONTAGEM
    ====================================================== */

    const countRows =
      await executeRows<
        CountRow[]
      >(
        `
          SELECT
            COUNT(*) AS total

          FROM
            imports i

          WHERE
            ${filteredWhereSql}
        `,
        filteredValues,
      );

    const total =
      toNumber(
        countRows[
          0
        ]?.total,
      );

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          total /
            pageSize,
        ),
      );

    const safePage =
      Math.min(
        page,
        totalPages,
      );

    const offset =
      (
        safePage -
        1
      ) *
      pageSize;

    /* =====================================================
       RESUMO

       IMPORTANTE:

       Não fazemos JOIN entre várias tabelas 1:N.

       Cada tabela é agregada primeiro e só depois entra
       no cálculo final.
    ====================================================== */

    const summaryRows =
      await executeRows<
        ImportsSummaryRow[]
      >(
        `
          SELECT
            COUNT(*) AS total_imports,

            COALESCE(
              SUM(
                COALESCE(
                  event_stats.events,
                  0
                )
              ),
              0
            ) AS total_events,

            COALESCE(
              SUM(
                COALESCE(
                  raw_stats.raw_rows,
                  0
                )
              ),
              0
            ) AS total_raw_rows,

            COALESCE(
              SUM(
                COALESCE(
                  event_stats.classified_events,
                  0
                )
              ),
              0
            ) AS total_classified

          FROM
            imports i

          LEFT JOIN (
            SELECT
              me.import_id,

              COUNT(*) AS events,

              SUM(
                CASE
                  WHEN
                    (
                      EXISTS (
                        SELECT
                          1

                        FROM
                          event_classifications ec

                        WHERE
                          ec.event_id =
                            me.id

                          AND ec.status IN (
                            'PENDENTE_REVISAO',
                            'APROVADA',
                            'CORRIGIDA'
                          )
                      )

                      OR EXISTS (
                        SELECT
                          1

                        FROM
                          classification_suggestions cs

                        WHERE
                          cs.event_id =
                            me.id

                          AND cs.model_type =
                            'ML'

                          AND cs.status IN (
                            'PENDENTE_REVISAO',
                            'CONFIRMADA',
                            'CORRIGIDA'
                          )
                      )
                    )

                  THEN 1

                  ELSE 0
                END
              ) AS classified_events

            FROM
              maintenance_events me

            GROUP BY
              me.import_id
          ) event_stats
            ON event_stats.import_id =
               i.id

          LEFT JOIN (
            SELECT
              rir.import_id,

              COUNT(*) AS raw_rows

            FROM
              raw_import_rows rir

            GROUP BY
              rir.import_id
          ) raw_stats
            ON raw_stats.import_id =
               i.id

          WHERE
            ${filteredWhereSql}
        `,
        filteredValues,
      );

    const summary =
      summaryRows[
        0
      ];

    /* =====================================================
       LISTAGEM

       IMPORTANTE:

       Cada subquery produz no máximo UMA linha por import_id.
       Não existe multiplicação cartesiana.
    ====================================================== */

    const rows =
      await executeRows<
        ImportRow[]
      >(
        `
          SELECT
            i.id,

            i.unit_id,

            i.file_name,

            i.original_file_name,

            i.file_hash,

            i.source_system,

            i.status,

            i.total_rows,

            i.processed_rows,

            i.error_rows,

            i.error_message,

            i.imported_at,

            i.created_at,

            i.updated_at,

            primary_unit.code
              AS primary_unit_code,

            primary_unit.name
              AS primary_unit_name,

            primary_unit.city
              AS primary_unit_city,

            primary_unit.state
              AS primary_unit_state,

            COALESCE(
              event_stats.events,
              0
            ) AS events,

            COALESCE(
              event_stats.classifiable_events,
              0
            ) AS classifiable_events,

            COALESCE(
              event_stats.classified_events,
              0
            ) AS classified_events,

            GREATEST(
              COALESCE(
                event_stats.classifiable_events,
                0
              ) -
              COALESCE(
                event_stats.classified_events,
                0
              ),
              0
            ) AS pending_events,

            COALESCE(
              event_stats.downtime_minutes,
              0
            ) AS downtime_minutes,

            COALESCE(
              raw_stats.raw_rows,
              0
            ) AS raw_rows,

            CASE
              WHEN
                unit_stats.units_count IS NULL

                OR unit_stats.units_count = 0

              THEN 1

              ELSE unit_stats.units_count
            END AS units_count,

            COALESCE(
              unit_stats.units_label,

              COALESCE(
                primary_unit.city,
                primary_unit.name,
                primary_unit.code,
                CONCAT(
                  'Unidade ',
                  i.unit_id
                )
              )
            ) AS units_label,

            model_stats.model_versions

          FROM
            imports i

          INNER JOIN
            units primary_unit
              ON primary_unit.id =
                 i.unit_id

          /* -------------------------------------------------
             EVENTOS
          ------------------------------------------------- */

          LEFT JOIN (
            SELECT
              me.import_id,

              COUNT(*) AS events,

              COALESCE(
                SUM(
                  COALESCE(
                    me.downtime_minutes,
                    0
                  )
                ),
                0
              ) AS downtime_minutes,

              SUM(
                CASE
                  WHEN
                    me.observation IS NOT NULL

                    AND TRIM(
                      me.observation
                    ) <> ''

                  THEN 1

                  ELSE 0
                END
              ) AS classifiable_events,

              SUM(
                CASE
                  WHEN
                    me.observation IS NOT NULL

                    AND TRIM(
                      me.observation
                    ) <> ''

                    AND (
                      EXISTS (
                        SELECT
                          1

                        FROM
                          event_classifications ec_current

                        WHERE
                          ec_current.event_id =
                            me.id

                          AND ec_current.status IN (
                            'PENDENTE_REVISAO',
                            'APROVADA',
                            'CORRIGIDA'
                          )
                      )

                      OR EXISTS (
                        SELECT
                          1

                        FROM
                          classification_suggestions cs_current

                        WHERE
                          cs_current.event_id =
                            me.id

                          AND cs_current.model_type =
                            'ML'

                          AND cs_current.status IN (
                            'PENDENTE_REVISAO',
                            'CONFIRMADA',
                            'CORRIGIDA'
                          )
                      )
                    )

                  THEN 1

                  ELSE 0
                END
              ) AS classified_events

            FROM
              maintenance_events me

            GROUP BY
              me.import_id
          ) event_stats
            ON event_stats.import_id =
               i.id

          /* -------------------------------------------------
             LINHAS BRUTAS
          ------------------------------------------------- */

          LEFT JOIN (
            SELECT
              rir.import_id,

              COUNT(*) AS raw_rows

            FROM
              raw_import_rows rir

            GROUP BY
              rir.import_id
          ) raw_stats
            ON raw_stats.import_id =
               i.id

          /* -------------------------------------------------
             UNIDADES
          ------------------------------------------------- */

          LEFT JOIN (
            SELECT
              event_units.import_id,

              COUNT(
                DISTINCT event_units.unit_id
              ) AS units_count,

              GROUP_CONCAT(
                DISTINCT COALESCE(
                  u.city,
                  u.name,
                  u.code,
                  CONCAT(
                    'Unidade ',
                    u.id
                  )
                )

                ORDER BY
                  COALESCE(
                    u.city,
                    u.name,
                    u.code
                  )

                SEPARATOR ' · '
              ) AS units_label

            FROM
              maintenance_events event_units

            INNER JOIN
              units u
                ON u.id =
                   event_units.unit_id

            GROUP BY
              event_units.import_id
          ) unit_stats
            ON unit_stats.import_id =
               i.id

          /* -------------------------------------------------
             MODELOS
          ------------------------------------------------- */

          LEFT JOIN (
            SELECT
              me_model.import_id,

              GROUP_CONCAT(
                DISTINCT cs_model.model_version

                ORDER BY
                  cs_model.model_version

                SEPARATOR ' · '
              ) AS model_versions

            FROM
              maintenance_events me_model

            INNER JOIN
              classification_suggestions cs_model
                ON cs_model.event_id =
                   me_model.id

            WHERE
              cs_model.model_type =
                'ML'

              AND cs_model.model_version
                  IS NOT NULL

              AND TRIM(
                cs_model.model_version
              ) <> ''

            GROUP BY
              me_model.import_id
          ) model_stats
            ON model_stats.import_id =
               i.id

          WHERE
            ${filteredWhereSql}

          ORDER BY
            COALESCE(
              i.imported_at,
              i.created_at
            ) DESC,

            i.id DESC

          LIMIT ?

          OFFSET ?
        `,
        [
          ...filteredValues,

          pageSize,

          offset,
        ],
      );

    /* =====================================================
       STATUS

       Aqui usamos somente o filtro base.

       Assim, ao selecionar um status, as outras opções
       continuam aparecendo no select.
    ====================================================== */

    const statusRows =
      await executeRows<
        StatusRow[]
      >(
        `
          SELECT DISTINCT
            i.status

          FROM
            imports i

          WHERE
            ${baseWhereSql}

            AND i.status IS NOT NULL

            AND TRIM(
              i.status
            ) <> ''

          ORDER BY
            i.status ASC
        `,
        baseValues,
      );

    /* =====================================================
       RESPONSE
    ====================================================== */

    return NextResponse.json({
      success:
        true,

      summary: {
        imports:
          toNumber(
            summary
              ?.total_imports,
          ),

        events:
          toNumber(
            summary
              ?.total_events,
          ),

        rawRows:
          toNumber(
            summary
              ?.total_raw_rows,
          ),

        classifiedEvents:
          toNumber(
            summary
              ?.total_classified,
          ),
      },

      filters: {
        search,

        status:
          status ||
          null,

        selectedUnitIds,
      },

      options: {
        statuses:
          statusRows
            .map(
              (
                row,
              ) =>
                row.status
                  ?.trim() ??
                "",
            )
            .filter(
              (
                currentStatus,
              ) =>
                currentStatus.length >
                0,
            ),
      },

      pagination: {
        page:
          safePage,

        pageSize,

        total,

        totalPages,
      },

      items:
        rows.map(
          (
            row,
          ) => {
            const events =
              toNumber(
                row.events,
              );

            const classifiableEvents =
              toNumber(
                row.classifiable_events,
              );

            const classifiedEvents =
              toNumber(
                row.classified_events,
              );

            const pendingEvents =
              toNumber(
                row.pending_events,
              );

            return {
              id:
                Number(
                  row.id,
                ),

              primaryUnitId:
                Number(
                  row.unit_id,
                ),

              fileName:
                row.file_name,

              originalFileName:
                row.original_file_name,

              fileHash:
                row.file_hash,

              sourceSystem:
                row.source_system,

              status:
                row.status,

              totalRows:
                toNumber(
                  row.total_rows,
                ),

              processedRows:
                toNumber(
                  row.processed_rows,
                ),

              errorRows:
                toNumber(
                  row.error_rows,
                ),

              errorMessage:
                row.error_message,

              events,

              classifiableEvents,

              classifiedEvents,

              pendingEvents,

              classificationCoverage:
                classifiableEvents >
                0
                  ? (
                      classifiedEvents /
                      classifiableEvents
                    ) *
                    100
                  : 0,

              downtimeMinutes:
                toNumber(
                  row.downtime_minutes,
                ),

              rawRows:
                toNumber(
                  row.raw_rows,
                ),

              unitsCount:
                toNumber(
                  row.units_count,
                ),

              unitsLabel:
                row.units_label,

              modelVersions:
                row.model_versions
                  ? row.model_versions
                      .split(
                        " · ",
                      )
                      .map(
                        (
                          value,
                        ) =>
                          value.trim(),
                      )
                      .filter(
                        (
                          value,
                        ) =>
                          value.length >
                          0,
                      )
                  : [],

              primaryUnit: {
                id:
                  Number(
                    row.unit_id,
                  ),

                code:
                  row.primary_unit_code,

                name:
                  row.primary_unit_name,

                city:
                  row.primary_unit_city,

                state:
                  row.primary_unit_state,
              },

              importedAt:
                formatDateTime(
                  row.imported_at,
                ),

              createdAt:
                formatDateTime(
                  row.created_at,
                ),

              updatedAt:
                formatDateTime(
                  row.updated_at,
                ),
            };
          },
        ),
    });
  } catch (
    error
  ) {
    console.error(
      "GET /api/imports",
      error,
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          error instanceof
          Error
            ? error.message
            : "Não foi possível carregar as importações.",
      },
      {
        status:
          500,
      },
    );
  }
}