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
  getSession,
} from "@/lib/session";

import {
  getUnitSelection,
} from "@/lib/unit-selection";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* =========================================================
   TIPOS
========================================================= */

interface RouteContext {
  params:
    Promise<{
      id:
        string;
    }>;
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
}

interface ImportUnitRow
  extends RowDataPacket {
  id:
    number | string;

  code:
    string | null;

  name:
    string | null;

  city:
    string | null;

  state:
    string | null;

  events:
    number | string | null;
}

interface ImpactRow
  extends RowDataPacket {
  events:
    number | string | null;

  downtime_minutes:
    number | string | null;

  raw_rows:
    number | string | null;

  event_classifications:
    number | string | null;

  classification_audits:
    number | string | null;

  classification_suggestions:
    number | string | null;

  origin_predictions:
    number | string | null;

  origin_reviews:
    number | string | null;

  origin_review_audits:
    number | string | null;

  masp_event_links:
    number | string | null;

  masp_evidence_references:
    number | string | null;
}

interface ClassificationSummaryRow
  extends RowDataPacket {
  classifiable_events:
    number | string | null;

  classified_events:
    number | string | null;

  pending_events:
    number | string | null;
}

interface ModelRow
  extends RowDataPacket {
  model_version:
    string;
}

interface DeleteImpact {
  events:
    number;

  downtimeMinutes:
    number;

  rawRows:
    number;

  eventClassifications:
    number;

  classificationAudits:
    number;

  classificationSuggestions:
    number;

  originPredictions:
    number;

  originReviews:
    number;

  originReviewAudits:
    number;

  maspEventLinks:
    number;

  maspEvidenceReferences:
    number;
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

function normalizeImportId(
  value:
    string,
): number | null {
  const id =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      id,
    ) ||
    id <=
      0
  ) {
    return null;
  }

  return id;
}

function buildImpact(
  row:
    ImpactRow | undefined,
): DeleteImpact {
  return {
    events:
      toNumber(
        row?.events,
      ),

    downtimeMinutes:
      toNumber(
        row
          ?.downtime_minutes,
      ),

    rawRows:
      toNumber(
        row?.raw_rows,
      ),

    eventClassifications:
      toNumber(
        row
          ?.event_classifications,
      ),

    classificationAudits:
      toNumber(
        row
          ?.classification_audits,
      ),

    classificationSuggestions:
      toNumber(
        row
          ?.classification_suggestions,
      ),

    originPredictions:
      toNumber(
        row
          ?.origin_predictions,
      ),

    originReviews:
      toNumber(
        row
          ?.origin_reviews,
      ),

    originReviewAudits:
      toNumber(
        row
          ?.origin_review_audits,
      ),

    maspEventLinks:
      toNumber(
        row
          ?.masp_event_links,
      ),

    maspEvidenceReferences:
      toNumber(
        row
          ?.masp_evidence_references,
      ),
  };
}

/* =========================================================
   BUSCA DE IMPACTO

   Importante:
   estas consultas não executam exclusões.
   Apenas dizem exatamente o que será afetado.
========================================================= */

async function getImportImpact(
  connection:
    Awaited<
      ReturnType<
        typeof getConnection
      >
    >,

  importId:
    number,
): Promise<
  DeleteImpact
> {
  const [
    rows,
  ] =
    await connection.query<
      ImpactRow[]
    >(
      `
        SELECT
          (
            SELECT
              COUNT(*)

            FROM
              maintenance_events me

            WHERE
              me.import_id = ?
          ) AS events,

          (
            SELECT
              COALESCE(
                SUM(
                  COALESCE(
                    me.downtime_minutes,
                    0
                  )
                ),
                0
              )

            FROM
              maintenance_events me

            WHERE
              me.import_id = ?
          ) AS downtime_minutes,

          (
            SELECT
              COUNT(*)

            FROM
              raw_import_rows rir

            WHERE
              rir.import_id = ?
          ) AS raw_rows,

          (
            SELECT
              COUNT(*)

            FROM
              event_classifications ec

            INNER JOIN
              maintenance_events me
                ON me.id =
                   ec.event_id

            WHERE
              me.import_id = ?
          ) AS event_classifications,

          (
            SELECT
              COUNT(*)

            FROM
              classification_audit ca

            INNER JOIN
              event_classifications ec
                ON ec.id =
                   ca.classification_id

            INNER JOIN
              maintenance_events me
                ON me.id =
                   ec.event_id

            WHERE
              me.import_id = ?
          ) AS classification_audits,

          (
            SELECT
              COUNT(*)

            FROM
              classification_suggestions cs

            INNER JOIN
              maintenance_events me
                ON me.id =
                   cs.event_id

            WHERE
              me.import_id = ?
          ) AS classification_suggestions,

          (
            SELECT
              COUNT(*)

            FROM
              event_failure_origin_predictions prediction

            INNER JOIN
              maintenance_events me
                ON me.id =
                   prediction.event_id

            WHERE
              me.import_id = ?
          ) AS origin_predictions,

          (
            SELECT
              COUNT(*)

            FROM
              event_failure_origin_reviews review

            INNER JOIN
              maintenance_events me
                ON me.id =
                   review.event_id

            WHERE
              me.import_id = ?
          ) AS origin_reviews,

          (
            SELECT
              COUNT(*)

            FROM
              event_failure_origin_review_audit audit

            INNER JOIN
              maintenance_events me
                ON me.id =
                   audit.event_id

            WHERE
              me.import_id = ?
          ) AS origin_review_audits,

          (
            SELECT
              COUNT(*)

            FROM
              masp_events masp_event

            INNER JOIN
              maintenance_events me
                ON me.id =
                   masp_event.event_id

            WHERE
              me.import_id = ?
          ) AS masp_event_links,

          (
            SELECT
              COUNT(*)

            FROM
              masp_evidence evidence

            INNER JOIN
              maintenance_events me
                ON me.id =
                   evidence.event_id

            WHERE
              me.import_id = ?
          ) AS masp_evidence_references
      `,
      [
        importId,
        importId,
        importId,
        importId,
        importId,
        importId,
        importId,
        importId,
        importId,
        importId,
        importId,
      ],
    );

  return buildImpact(
    rows[
      0
    ],
  );
}

/* =========================================================
   AUTORIZAÇÃO DA IMPORTAÇÃO

   Não existe diferença entre ANALISTA e GESTOR.

   O usuário precisa possuir acesso a TODAS as unidades que
   aparecem na importação.

   Isso evita excluir uma importação multiunidade parcialmente
   autorizada.
========================================================= */

async function getImportUnits(
  connection:
    Awaited<
      ReturnType<
        typeof getConnection
      >
    >,

  importId:
    number,

  primaryUnitId:
    number,
): Promise<
  ImportUnitRow[]
> {
  const [
    eventUnitRows,
  ] =
    await connection.query<
      ImportUnitRow[]
    >(
      `
        SELECT
          u.id,

          u.code,

          u.name,

          u.city,

          u.state,

          COUNT(
            me.id
          ) AS events

        FROM
          maintenance_events me

        INNER JOIN
          units u
            ON u.id =
               me.unit_id

        WHERE
          me.import_id = ?

        GROUP BY
          u.id,
          u.code,
          u.name,
          u.city,
          u.state

        ORDER BY
          COALESCE(
            u.city,
            u.name,
            u.code
          ) ASC
      `,
      [
        importId,
      ],
    );

  if (
    eventUnitRows.length >
    0
  ) {
    return eventUnitRows;
  }

  /*
   * Importação falhou ou ainda não gerou eventos.
   * Nesse caso usamos a unidade principal de imports.
   */

  const [
    primaryRows,
  ] =
    await connection.query<
      ImportUnitRow[]
    >(
      `
        SELECT
          u.id,

          u.code,

          u.name,

          u.city,

          u.state,

          0 AS events

        FROM
          units u

        WHERE
          u.id = ?

        LIMIT 1
      `,
      [
        primaryUnitId,
      ],
    );

  return primaryRows;
}

function hasAccessToAllUnits(
  unitIds:
    number[],

  accessibleUnitIds:
    Set<number>,
): boolean {
  return unitIds.every(
    (
      unitId,
    ) =>
      accessibleUnitIds.has(
        unitId,
      ),
  );
}

/* =========================================================
   GET /api/imports/[id]
========================================================= */

export async function GET(
  _request:
    NextRequest,

  context:
    RouteContext,
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

  const {
    id:
      rawId,
  } =
    await context.params;

  const importId =
    normalizeImportId(
      rawId,
    );

  if (!importId) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Importação inválida.",
      },
      {
        status:
          400,
      },
    );
  }

  const connection =
    await getConnection();

  try {
    /* =====================================================
       IMPORTAÇÃO
    ====================================================== */

    const [
      importRows,
    ] =
      await connection.query<
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

            i.updated_at

          FROM
            imports i

          WHERE
            i.id = ?

          LIMIT 1
        `,
        [
          importId,
        ],
      );

    const importRow =
      importRows[
        0
      ];

    if (!importRow) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Importação não encontrada.",
        },
        {
          status:
            404,
        },
      );
    }

    /* =====================================================
       AUTORIZAÇÃO
    ====================================================== */

    const unitSelection =
      await getUnitSelection({
        userId:
          session.userId,

        defaultUnitId:
          session.unitId,
      });

    const accessibleUnitIds =
      new Set(
        unitSelection
          .units
          .map(
            (
              unit,
            ) =>
              Number(
                unit.id,
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
      );

    const units =
      await getImportUnits(
        connection,
        importId,
        Number(
          importRow.unit_id,
        ),
      );

    const importUnitIds =
      units.map(
        (
          unit,
        ) =>
          Number(
            unit.id,
          ),
      );

    if (
      !hasAccessToAllUnits(
        importUnitIds,
        accessibleUnitIds,
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Você não possui acesso a todas as unidades desta importação.",
        },
        {
          status:
            403,
        },
      );
    }

    /* =====================================================
       IMPACTO
    ====================================================== */

    const impact =
      await getImportImpact(
        connection,
        importId,
      );

    /* =====================================================
       RESUMO DA CLASSIFICAÇÃO
    ====================================================== */

    const [
      classificationRows,
    ] =
      await connection.query<
        ClassificationSummaryRow[]
      >(
        `
          SELECT
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
            ) AS classified_events,

            SUM(
              CASE
                WHEN
                  me.observation IS NOT NULL

                  AND TRIM(
                    me.observation
                  ) <> ''

                  AND NOT EXISTS (
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

                  AND NOT EXISTS (
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

                THEN 1

                ELSE 0
              END
            ) AS pending_events

          FROM
            maintenance_events me

          WHERE
            me.import_id = ?
        `,
        [
          importId,
        ],
      );

    const classification =
      classificationRows[
        0
      ];

    /* =====================================================
       VERSÕES DO MODELO
    ====================================================== */

    const [
      modelRows,
    ] =
      await connection.query<
        ModelRow[]
      >(
        `
          SELECT DISTINCT
            cs.model_version

          FROM
            classification_suggestions cs

          INNER JOIN
            maintenance_events me
              ON me.id =
                 cs.event_id

          WHERE
            me.import_id = ?

            AND cs.model_type =
                'ML'

          ORDER BY
            cs.model_version ASC
        `,
        [
          importId,
        ],
      );

    const classifiableEvents =
      toNumber(
        classification
          ?.classifiable_events,
      );

    const classifiedEvents =
      toNumber(
        classification
          ?.classified_events,
      );

    const pendingEvents =
      toNumber(
        classification
          ?.pending_events,
      );

    /* =====================================================
       RESPONSE
    ====================================================== */

    return NextResponse.json({
      success:
        true,

      item: {
        id:
          Number(
            importRow.id,
          ),

        primaryUnitId:
          Number(
            importRow.unit_id,
          ),

        fileName:
          importRow.file_name,

        originalFileName:
          importRow.original_file_name,

        fileHash:
          importRow.file_hash,

        sourceSystem:
          importRow.source_system,

        status:
          importRow.status,

        totalRows:
          toNumber(
            importRow.total_rows,
          ),

        processedRows:
          toNumber(
            importRow.processed_rows,
          ),

        errorRows:
          toNumber(
            importRow.error_rows,
          ),

        errorMessage:
          importRow.error_message,

        importedAt:
          formatDateTime(
            importRow.imported_at,
          ),

        createdAt:
          formatDateTime(
            importRow.created_at,
          ),

        updatedAt:
          formatDateTime(
            importRow.updated_at,
          ),

        units:
          units.map(
            (
              unit,
            ) => ({
              id:
                Number(
                  unit.id,
                ),

              code:
                unit.code,

              name:
                unit.name,

              city:
                unit.city,

              state:
                unit.state,

              events:
                toNumber(
                  unit.events,
                ),
            }),
          ),

        classification: {
          classifiableEvents,

          classifiedEvents,

          pendingEvents,

          coverage:
            classifiableEvents >
            0
              ? (
                  classifiedEvents /
                  classifiableEvents
                ) *
                  100
              : 0,

          modelVersions:
            modelRows
              .map(
                (
                  row,
                ) =>
                  row.model_version
                    ?.trim(),
              )
              .filter(
                (
                  value,
                ): value is string =>
                  Boolean(
                    value,
                  ),
              ),
        },

        impact,
      },
    });
  } catch (
    error
  ) {
    console.error(
      `GET /api/imports/${importId}`,
      error,
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível carregar os detalhes da importação.",
      },
      {
        status:
          500,
      },
    );
  } finally {
    connection.release();
  }
}

/* =========================================================
   DELETE /api/imports/[id]

   Não existe diferença entre ANALISTA e GESTOR.

   FLUXO:

   1. autentica;
   2. trava a importação;
   3. valida TODAS as unidades;
   4. calcula impacto;
   5. apaga maintenance_events;
   6. cascatas removem dependências dos eventos;
   7. apaga imports;
   8. raw_import_rows cai em CASCADE;
   9. criticality.last_import_id vira NULL;
   10. commit.
========================================================= */

export async function DELETE(
  _request:
    NextRequest,

  context:
    RouteContext,
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

  const {
    id:
      rawId,
  } =
    await context.params;

  const importId =
    normalizeImportId(
      rawId,
    );

  if (!importId) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Importação inválida.",
      },
      {
        status:
          400,
      },
    );
  }

  const connection =
    await getConnection();

  try {
    /* =====================================================
       UNIDADES ACESSÍVEIS
    ====================================================== */

    const unitSelection =
      await getUnitSelection({
        userId:
          session.userId,

        defaultUnitId:
          session.unitId,
      });

    const accessibleUnitIds =
      new Set(
        unitSelection
          .units
          .map(
            (
              unit,
            ) =>
              Number(
                unit.id,
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
      );

    if (
      accessibleUnitIds.size ===
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

    /* =====================================================
       TRANSAÇÃO
    ====================================================== */

    await connection
      .beginTransaction();

    /* =====================================================
       TRAVA A IMPORTAÇÃO
    ====================================================== */

    const [
      importRows,
    ] =
      await connection.query<
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

            i.updated_at

          FROM
            imports i

          WHERE
            i.id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [
          importId,
        ],
      );

    const importRow =
      importRows[
        0
      ];

    if (!importRow) {
      await connection
        .rollback();

      return NextResponse.json(
        {
          success:
            false,

          message:
            "Importação não encontrada.",
        },
        {
          status:
            404,
        },
      );
    }

    /* =====================================================
       VERIFICA TODAS AS UNIDADES DA IMPORTAÇÃO
    ====================================================== */

    const units =
      await getImportUnits(
        connection,
        importId,
        Number(
          importRow.unit_id,
        ),
      );

    const importUnitIds =
      units.map(
        (
          unit,
        ) =>
          Number(
            unit.id,
          ),
      );

    if (
      !hasAccessToAllUnits(
        importUnitIds,
        accessibleUnitIds,
      )
    ) {
      await connection
        .rollback();

      return NextResponse.json(
        {
          success:
            false,

          message:
            "A importação possui dados de unidades às quais você não possui acesso.",
        },
        {
          status:
            403,
        },
      );
    }

    /* =====================================================
       IMPACTO ANTES DA EXCLUSÃO
    ====================================================== */

    const impact =
      await getImportImpact(
        connection,
        importId,
      );

    /* =====================================================
       REMOVE EVENTOS

       Cascatas automáticas:

       event_classifications
         -> classification_audit

       classification_suggestions

       event_failure_origin_predictions

       event_failure_origin_reviews

       event_failure_origin_review_audit

       masp_events

       masp_evidence.event_id
         -> SET NULL
    ====================================================== */

    const [
      eventDelete,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          DELETE FROM
            maintenance_events

          WHERE
            import_id = ?
        `,
        [
          importId,
        ],
      );

    /* =====================================================
       REMOVE IMPORTAÇÃO

       Cascatas / ações automáticas:

       raw_import_rows
         -> CASCADE

       equipment_criticality_matrix.last_import_id
         -> SET NULL
    ====================================================== */

    const [
      importDelete,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          DELETE FROM
            imports

          WHERE
            id = ?
        `,
        [
          importId,
        ],
      );

    if (
      importDelete.affectedRows !==
      1
    ) {
      throw new Error(
        "A importação não foi removida.",
      );
    }

    await connection
      .commit();

    /* =====================================================
       RESPONSE
    ====================================================== */

    return NextResponse.json({
      success:
        true,

      message:
        "Importação excluída com sucesso.",

      deleted: {
        importId,

        fileName:
          importRow
            .original_file_name ||
          importRow
            .file_name,

        events:
          eventDelete
            .affectedRows,

        impact,

        units:
          units.map(
            (
              unit,
            ) => ({
              id:
                Number(
                  unit.id,
                ),

              code:
                unit.code,

              name:
                unit.name,

              city:
                unit.city,

              state:
                unit.state,
            }),
          ),
      },
    });
  } catch (
    error
  ) {
    try {
      await connection
        .rollback();
    } catch {
      // A transação já pode ter sido encerrada.
    }

    console.error(
      `DELETE /api/imports/${importId}`,
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
            : "Não foi possível excluir a importação.",
      },
      {
        status:
          500,
      },
    );
  } finally {
    connection.release();
  }
}