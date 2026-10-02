import {
  NextResponse,
} from "next/server";

import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import {
  getConnection,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

import {
  buildUnitInClause,
  getUnitSelection,
} from "@/lib/unit-selection";


interface CountRow
  extends RowDataPacket {
  total:
    | number
    | string
    | null;
}


interface SummaryRow
  extends RowDataPacket {
  total:
    | number
    | string
    | null;

  pending:
    | number
    | string
    | null;

  confirmed:
    | number
    | string
    | null;

  corrected:
    | number
    | string
    | null;
}


interface TableColumnRow
  extends RowDataPacket {
  Field: string;
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


export async function POST() {
  const session =
    await getSession();


  if (!session) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          "Não autenticado.",
      },
      {
        status:
          401,
      },
    );
  }


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

        error:
          "Nenhuma unidade válida está selecionada.",
      },
      {
        status:
          403,
      },
    );
  }


  const unitFilter =
    buildUnitInClause(
      unitSelection
        .selectedUnitIds,
    );


  const connection =
    await getConnection();


  try {
    await connection
      .beginTransaction();


    /* =====================================================
       QUANTIDADE PENDENTE
    ===================================================== */

    const [
      countRows,
    ] =
      await connection.query<
        CountRow[]
      >(
        `
          SELECT
              COUNT(*) AS total

          FROM
              classification_suggestions cs

          INNER JOIN
              maintenance_events me
              ON me.id =
                 cs.event_id

          WHERE
              me.unit_id IN (
                ${unitFilter.placeholders}
              )

              AND cs.model_type =
                  'ML'

              AND cs.status =
                  'PENDENTE_REVISAO'
        `,
        [
          ...unitFilter.values,
        ],
      );


    const pendingBefore =
      numericValue(
        countRows[0]
          ?.total,
      );


    if (
      pendingBefore ===
      0
    ) {
      await connection
        .commit();


      return NextResponse.json({
        success:
          true,

        accepted:
          0,

        message:
          "Não existem sugestões pendentes.",
      });
    }


    /* =====================================================
       DESCOBRIR SCHEMA REAL DE event_classifications
    ===================================================== */

    const [
      classificationColumnRows,
    ] =
      await connection.query<
        TableColumnRow[]
      >(
        "SHOW COLUMNS FROM event_classifications",
      );


    const classificationColumns =
      new Set(
        classificationColumnRows.map(
          (
            column,
          ) =>
            column.Field,
        ),
      );


    const requiredClassificationColumns =
      [
        "event_id",
        "classified_by_user_id",
        "source",
        "confidence",
        "status",
        "classification_notes",
      ] as const;


    const missingRequiredColumns =
      requiredClassificationColumns.filter(
        (
          column,
        ) =>
          !classificationColumns.has(
            column,
          ),
      );


    if (
      missingRequiredColumns.length >
      0
    ) {
      throw new Error(
        `A tabela event_classifications não possui as colunas obrigatórias: ${missingRequiredColumns.join(
          ", ",
        )}.`,
      );
    }


    const optionalNullColumns =
      [
        "category_id",
        "system_id",
        "mode_id",
      ].filter(
        (
          column,
        ) =>
          classificationColumns.has(
            column,
          ),
      );


    /* =====================================================
       ACEITAÇÃO EM LOTE
       -----------------------------------------------------
       IMPORTANTE:
       source = REGRA, e não MANUAL.

       Isso é proposital. Estes registros NÃO passaram por
       revisão humana individual e não devem ser tratados
       como ground truth para treinamento.
    ===================================================== */

    const insertColumns =
      [
        "event_id",
        ...optionalNullColumns,
        "classified_by_user_id",
        "source",
        "confidence",
        "status",
        "classification_notes",
      ];


    const selectExpressions =
      [
        "cs.event_id",

        ...optionalNullColumns.map(
          () =>
            "NULL",
        ),

        "?",

        "'REGRA'",

        "NULL",

        "'APROVADA'",

        `
          JSON_OBJECT(
            'version',
            11,

            'source',
            'TEMPORARY_BULK_ACCEPT',

            'reviewAction',
            'CONFIRM_ALL_TEMPORARY',

            'humanVerified',
            FALSE,

            'excludeFromTraining',
            TRUE,

            'modelType',
            'ML',

            'modelVersion',
            cs.model_version,

            'suggestionId',
            cs.id,

            'failedComponentCode',
            cs.failed_component_code,

            'failedComponent',
            TRIM(
              REPLACE(
                cs.failure_mode,
                'Falha de ',
                ''
              )
            ),

            'failureMode',
            cs.failure_mode,

            'failureModeCode',
            cs.failed_component_code,

            'failureDetail',
            TRIM(
              REPLACE(
                cs.failure_mode,
                'Falha de ',
                ''
              )
            ),

            'modelSuggestion',
            JSON_OBJECT(
              'failedComponentCode',
              cs.failed_component_code,

              'failureMode',
              cs.failure_mode,

              'confidence',
              cs.confidence,

              'topPredictions',
              cs.top_predictions
            )
          )
        `,
      ];


    const updateAssignments =
      [
        ...optionalNullColumns.map(
          (
            column,
          ) =>
            `\`${column}\` = NULL`,
        ),

        `\`classified_by_user_id\` = VALUES(\`classified_by_user_id\`)`,

        `\`source\` = 'REGRA'`,

        `\`confidence\` = NULL`,

        `\`status\` = 'APROVADA'`,

        `\`classification_notes\` = VALUES(\`classification_notes\`)`,
      ];


    const bulkInsertSql =
      `
        INSERT INTO
            event_classifications
        (
            ${insertColumns
              .map(
                (
                  column,
                ) =>
                  `\`${column}\``,
              )
              .join(
                ", ",
              )}
        )

        SELECT
            ${selectExpressions.join(
              ", ",
            )}

        FROM
            classification_suggestions cs

        INNER JOIN
            maintenance_events me
            ON me.id =
               cs.event_id

        WHERE
            me.unit_id IN (
              ${unitFilter.placeholders}
            )

            AND cs.model_type =
                'ML'

            AND cs.status =
                'PENDENTE_REVISAO'

        ON DUPLICATE KEY UPDATE

            ${updateAssignments.join(
              ", ",
            )}
      `;


    await connection.execute<
      ResultSetHeader
    >(
      bulkInsertSql,
      [
        session.userId,

        ...unitFilter.values,
      ],
    );


    /* =====================================================
       MARCAR SUGESTÕES COMO LIBERADAS
    ===================================================== */

    await connection.execute<
      ResultSetHeader
    >(
      `
        UPDATE
            classification_suggestions cs

        INNER JOIN
            maintenance_events me
            ON me.id =
               cs.event_id

        SET
            cs.status =
                'CONFIRMADA',

            cs.reviewed_by_user_id =
                ?,

            cs.reviewed_at =
                NOW()

        WHERE
            me.unit_id IN (
              ${unitFilter.placeholders}
            )

            AND cs.model_type =
                'ML'

            AND cs.status =
                'PENDENTE_REVISAO'
      `,
      [
        session.userId,

        ...unitFilter.values,
      ],
    );


    /* =====================================================
       RESUMO ATUALIZADO
    ===================================================== */

    const [
      summaryRows,
    ] =
      await connection.query<
        SummaryRow[]
      >(
        `
          SELECT
              COUNT(*) AS total,

              SUM(
                  cs.status =
                  'PENDENTE_REVISAO'
              ) AS pending,

              SUM(
                  cs.status =
                  'CONFIRMADA'
              ) AS confirmed,

              SUM(
                  cs.status =
                  'CORRIGIDA'
              ) AS corrected

          FROM
              classification_suggestions cs

          INNER JOIN
              maintenance_events me
              ON me.id =
                 cs.event_id

          WHERE
              me.unit_id IN (
                ${unitFilter.placeholders}
              )

              AND cs.model_type =
                  'ML'
        `,
        [
          ...unitFilter.values,
        ],
      );


    const summary =
      summaryRows[0];


    const pending =
      numericValue(
        summary
          ?.pending,
      );


    const confirmed =
      numericValue(
        summary
          ?.confirmed,
      );


    const corrected =
      numericValue(
        summary
          ?.corrected,
      );


    await connection
      .commit();


    return NextResponse.json({
      success:
        true,

      accepted:
        pendingBefore,

      message:
        `${pendingBefore} sugestão(ões) aceita(s) temporariamente.`,

      summary: {
        total:
          numericValue(
            summary
              ?.total,
          ),

        pending,

        confirmed,

        corrected,

        reviewed:
          confirmed +
          corrected,
      },
    });
  } catch (error) {
    await connection
      .rollback();


    console.error(
      "Erro ao aceitar sugestões em lote:",
      error,
    );


    return NextResponse.json(
      {
        success:
          false,

        error:
          "Não foi possível aceitar todas as sugestões temporariamente.",
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
