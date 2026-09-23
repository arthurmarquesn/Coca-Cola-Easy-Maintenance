import {
  NextRequest,
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


interface SummaryRow
  extends RowDataPacket {
  total: number | string | null;
  pending: number | string | null;
  confirmed: number | string | null;
  corrected: number | string | null;
}


interface SuggestionRow
  extends RowDataPacket {
  suggestion_id: number;

  event_id: number;

  event_date:
    string | Date;

  source_line_name:
    string | null;

  source_equipment_name:
    string | null;

  source_stop_type:
    string | null;

  source_stop_key_1:
    string | null;

  source_stop_subkey:
    string | null;

  observation:
    string | null;

  downtime_minutes:
    number | string | null;

  failed_component_code:
    string;

  failure_mode:
    string;

  confidence:
    number | string | null;

  model_version:
    string;

  top_predictions:
    unknown;
}


interface LockedSuggestionRow
  extends RowDataPacket {
  suggestion_id: number;

  event_id: number;

  status: string;

  failed_component_code:
    string;

  failure_mode:
    string;

  confidence:
    number | string | null;

  model_version:
    string;

  top_predictions:
    unknown;
}


interface ReviewBody {
  suggestionId?: unknown;

  action?: unknown;

  correctedComponent?: unknown;
}


interface TopPrediction {
  failedComponentCode: string;

  failureMode: string;

  confidence: number;
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


function formatDate(
  value:
    | Date
    | string,
): string {
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


function parseTopPredictions(
  value: unknown,
): TopPrediction[] {
  let parsed:
    unknown = value;

  if (
    typeof parsed === "string"
  ) {
    try {
      parsed =
        JSON.parse(
          parsed,
        );
    } catch {
      return [];
    }
  }

  if (
    !Array.isArray(
      parsed,
    )
  ) {
    return [];
  }

  return parsed
    .map(
      (
        item,
      ):
        TopPrediction | null => {
        if (
          !item ||
          typeof item !==
            "object"
        ) {
          return null;
        }

        const object =
          item as Record<
            string,
            unknown
          >;

        const code =
          typeof object
            .failedComponentCode ===
          "string"
            ? object
                .failedComponentCode
            : typeof object
                  .failed_component_code ===
                "string"
              ? object
                  .failed_component_code
              : "";

        const failureMode =
          typeof object
            .failureMode ===
          "string"
            ? object
                .failureMode
            : typeof object
                  .failure_mode ===
                "string"
              ? object
                  .failure_mode
              : "";

        const confidence =
          Number(
            object.confidence ??
              0,
          );

        if (
          !code ||
          !failureMode ||
          !Number.isFinite(
            confidence,
          )
        ) {
          return null;
        }

        return {
          failedComponentCode:
            code,

          failureMode,

          confidence,
        };
      },
    )
    .filter(
      (
        item,
      ): item is TopPrediction =>
        item !== null,
    );
}


function cleanComponentName(
  value: string,
): string {
  let result =
    value
      .trim()
      .replace(
        /\s+/g,
        " ",
      );

  result =
    result.replace(
      /^falha\s+de\s+/i,
      "",
    );

  return result.trim();
}


function componentCodeFromName(
  value: string,
): string {
  const normalized =
    value
      .normalize(
        "NFD",
      )
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .toUpperCase()
      .replace(
        /[^A-Z0-9]+/g,
        "_",
      )
      .replace(
        /^_+|_+$/g,
        "",
      );

  return (
    normalized ||
    "NAO_IDENTIFICADO"
  );
}


function buildFailureMode(
  component: string,
): string {
  return `Falha de ${component}`;
}


function normalizeLimit(
  value: string | null,
): number {
  const parsed =
    Number(
      value ?? 50,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return 50;
  }

  return Math.max(
    1,
    Math.min(
      Math.floor(
        parsed,
      ),
      100,
    ),
  );
}


export async function GET(
  request: NextRequest,
) {
  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Não autenticado.",
      },
      {
        status: 401,
      },
    );
  }

  const limit =
    normalizeLimit(
      request.nextUrl
        .searchParams
        .get(
          "limit",
        ),
    );

  const connection =
    await getConnection();

  try {
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
              me.unit_id = ?

              AND cs.model_type =
                  'ML'
        `,
        [
          session.unitId,
        ],
      );

    const [
      suggestionRows,
    ] =
      await connection.query<
        SuggestionRow[]
      >(
        `
          SELECT
              cs.id
                  AS suggestion_id,

              cs.event_id,

              me.event_date,

              me.source_line_name,

              me.source_equipment_name,

              me.source_stop_type,

              me.source_stop_key_1,

              me.source_stop_subkey,

              me.observation,

              me.downtime_minutes,

              cs.failed_component_code,

              cs.failure_mode,

              cs.confidence,

              cs.model_version,

              cs.top_predictions

          FROM
              classification_suggestions cs

          INNER JOIN
              maintenance_events me
              ON me.id =
                 cs.event_id

          WHERE
              me.unit_id = ?

              AND cs.model_type =
                  'ML'

              AND cs.status =
                  'PENDENTE_REVISAO'

          ORDER BY
              cs.created_at ASC,
              cs.id ASC

          LIMIT ?
        `,
        [
          session.unitId,
          limit,
        ],
      );

    const summary =
      summaryRows[0];

    const pending =
      numericValue(
        summary?.pending,
      );

    const confirmed =
      numericValue(
        summary?.confirmed,
      );

    const corrected =
      numericValue(
        summary?.corrected,
      );

    return NextResponse.json({
      success:
        true,

      summary: {
        total:
          numericValue(
            summary?.total,
          ),

        pending,

        confirmed,

        corrected,

        reviewed:
          confirmed +
          corrected,
      },

      items:
        suggestionRows.map(
          (
            row,
          ) => ({
            suggestionId:
              Number(
                row.suggestion_id,
              ),

            eventId:
              Number(
                row.event_id,
              ),

            event: {
              date:
                formatDate(
                  row.event_date,
                ),

              line:
                row
                  .source_line_name,

              equipment:
                row
                  .source_equipment_name,

              stopType:
                row
                  .source_stop_type,

              stopKey1:
                row
                  .source_stop_key_1,

              stopSubkey:
                row
                  .source_stop_subkey,

              observation:
                row.observation ??
                "",

              downtimeMinutes:
                row
                  .downtime_minutes ===
                null
                  ? null
                  : numericValue(
                      row
                        .downtime_minutes,
                    ),
            },

            suggestion: {
              failedComponentCode:
                row
                  .failed_component_code,

              failureMode:
                row
                  .failure_mode,

              confidence:
                numericValue(
                  row.confidence,
                ),

              modelVersion:
                row
                  .model_version,

              topPredictions:
                parseTopPredictions(
                  row
                    .top_predictions,
                ),
            },
          }),
        ),
    });
  } catch (error) {
    console.error(
      "Erro ao carregar revisão:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível carregar as sugestões.",
      },
      {
        status: 500,
      },
    );
  } finally {
    connection.release();
  }
}


export async function PATCH(
  request: NextRequest,
) {
  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Não autenticado.",
      },
      {
        status: 401,
      },
    );
  }

  let body:
    ReviewBody;

  try {
    body =
      (await request.json()) as
        ReviewBody;
  } catch {
    return NextResponse.json(
      {
        error:
          "Corpo da requisição inválido.",
      },
      {
        status: 400,
      },
    );
  }

  const suggestionId =
    Number(
      body.suggestionId,
    );

  if (
    !Number.isInteger(
      suggestionId,
    ) ||
    suggestionId <= 0
  ) {
    return NextResponse.json(
      {
        error:
          "Sugestão inválida.",
      },
      {
        status: 400,
      },
    );
  }

  const action =
    typeof body.action ===
    "string"
      ? body.action
          .trim()
          .toUpperCase()
      : "";

  if (
    action !==
      "CONFIRM" &&
    action !==
      "CORRECT"
  ) {
    return NextResponse.json(
      {
        error:
          "Ação de revisão inválida.",
      },
      {
        status: 400,
      },
    );
  }

  const connection =
    await getConnection();

  try {
    await connection
      .beginTransaction();

    const [
      rows,
    ] =
      await connection.query<
        LockedSuggestionRow[]
      >(
        `
          SELECT
              cs.id
                  AS suggestion_id,

              cs.event_id,

              cs.status,

              cs.failed_component_code,

              cs.failure_mode,

              cs.confidence,

              cs.model_version,

              cs.top_predictions

          FROM
              classification_suggestions cs

          INNER JOIN
              maintenance_events me
              ON me.id =
                 cs.event_id

          WHERE
              cs.id = ?

              AND me.unit_id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [
          suggestionId,
          session.unitId,
        ],
      );

    const suggestion =
      rows[0];

    if (!suggestion) {
      await connection
        .rollback();

      return NextResponse.json(
        {
          error:
            "Sugestão não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      suggestion.status !==
      "PENDENTE_REVISAO"
    ) {
      await connection
        .rollback();

      return NextResponse.json(
        {
          error:
            "Essa sugestão já foi revisada.",
        },
        {
          status: 409,
        },
      );
    }

    let officialCode =
      suggestion
        .failed_component_code;

    let officialMode =
      suggestion
        .failure_mode;

    let officialComponent =
      officialMode
        .replace(
          /^Falha\s+de\s+/i,
          "",
        )
        .trim();

    let classificationStatus:
      "APROVADA" |
      "CORRIGIDA";

    let suggestionStatus:
      "CONFIRMADA" |
      "CORRIGIDA";

    if (
      action ===
      "CONFIRM"
    ) {
      classificationStatus =
        "APROVADA";

      suggestionStatus =
        "CONFIRMADA";
    } else {
      const correctedComponent =
        typeof body
          .correctedComponent ===
        "string"
          ? cleanComponentName(
              body
                .correctedComponent,
            )
          : "";

      if (
        correctedComponent.length <
        2
      ) {
        await connection
          .rollback();

        return NextResponse.json(
          {
            error:
              "Informe o componente correto.",
          },
          {
            status: 400,
          },
        );
      }

      if (
        correctedComponent.length >
        120
      ) {
        await connection
          .rollback();

        return NextResponse.json(
          {
            error:
              "O nome do componente é muito longo.",
          },
          {
            status: 400,
          },
        );
      }

      officialComponent =
        correctedComponent;

      officialCode =
        componentCodeFromName(
          correctedComponent,
        );

      officialMode =
        buildFailureMode(
          correctedComponent,
        );

      classificationStatus =
        "CORRIGIDA";

      suggestionStatus =
        "CORRIGIDA";
    }

    const topPredictions =
      parseTopPredictions(
        suggestion
          .top_predictions,
      );

    const notes = {
      version: 11,

      source:
        "HUMAN_REVIEW",

      reviewAction:
        action,

      suggestionId:
        suggestionId,

      modelType:
        "ML",

      modelVersion:
        suggestion
          .model_version,

      failedComponentCode:
        officialCode,

      failedComponent:
        officialComponent,

      failureMode:
        officialMode,

      /*
       * Compatibilidade temporária
       * com o dataset builder antigo.
       */
      failureModeCode:
        officialCode,

      failureDetail:
        officialComponent,

      modelSuggestion: {
        failedComponentCode:
          suggestion
            .failed_component_code,

        failureMode:
          suggestion
            .failure_mode,

        confidence:
          numericValue(
            suggestion
              .confidence,
          ),

        topPredictions,
      },
    };

    /*
     * O schema de event_classifications pode vir de uma
     * versão anterior do projeto. Alguns bancos possuem
     * category_id / system_id / mode_id e outros não.
     *
     * Descobrimos as colunas existentes e montamos o UPSERT
     * somente com o que realmente existe na tabela.
     */
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
          (column) =>
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
        (column) =>
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
        (column) =>
          classificationColumns.has(
            column,
          ),
      );

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

    const insertValues =
      [
        "?",
        ...optionalNullColumns.map(
          () => "NULL",
        ),
        "?",
        "'MANUAL'",
        "NULL",
        "?",
        "?",
      ];

    const updateAssignments =
      [
        ...optionalNullColumns.map(
          (column) =>
            `\`${column}\` = NULL`,
        ),

        `\`classified_by_user_id\` = VALUES(\`classified_by_user_id\`)`,

        `\`source\` = 'MANUAL'`,

        `\`confidence\` = NULL`,

        `\`status\` = VALUES(\`status\`)`,

        `\`classification_notes\` = VALUES(\`classification_notes\`)`,
      ];

    const officialClassificationSql =
      `
        INSERT INTO
          event_classifications
        (
          ${insertColumns
            .map(
              (column) =>
                `\`${column}\``,
            )
            .join(", ")}
        )
        VALUES
        (
          ${insertValues.join(", ")}
        )

        ON DUPLICATE KEY UPDATE
          ${updateAssignments.join(", ")}
      `;

    await connection.execute<
      ResultSetHeader
    >(
      officialClassificationSql,
      [
        suggestion.event_id,

        session.userId,

        classificationStatus,

        JSON.stringify(
          notes,
        ),
      ],
    );

    await connection.execute<
      ResultSetHeader
    >(
      `
        UPDATE
            classification_suggestions

        SET
            status = ?,

            reviewed_by_user_id =
                ?,

            reviewed_at =
                NOW()

        WHERE
            id = ?
      `,
      [
        suggestionStatus,

        session.userId,

        suggestionId,
      ],
    );

    await connection.commit();

    return NextResponse.json({
      success:
        true,

      classification: {
        eventId:
          Number(
            suggestion
              .event_id,
          ),

        failedComponentCode:
          officialCode,

        failureMode:
          officialMode,

        status:
          classificationStatus,
      },
    });
  } catch (error) {
    await connection
      .rollback();

    console.error(
      "Erro ao revisar sugestão:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível registrar a revisão.",
      },
      {
        status: 500,
      },
    );
  } finally {
    connection.release();
  }
}