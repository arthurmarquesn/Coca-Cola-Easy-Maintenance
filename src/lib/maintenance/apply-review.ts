import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { getConnection } from "@/lib/db";
import { buildUnitInClause } from "@/lib/unit-selection";
export type ReviewAction = "CONFIRM" | "CORRECT" | "REJECT";
interface LockedSuggestionRow extends RowDataPacket {
  suggestion_id: number;
  event_id: number;
  status: string;
  failed_component_code: string;
  failure_mode: string;
  confidence: number | string | null;
  model_version: string;
  top_predictions: unknown;
  observation: string | null;
}

interface TopPrediction {
  failedComponentCode: string;
  failureMode: string;
  confidence: number;
}

interface TableColumnRow extends RowDataPacket {
  Field: string;
}

interface ClassificationIdRow extends RowDataPacket {
  id: number;
}

function numericValue(
  value: number | string | null | undefined,
): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseTopPredictions(
  value: unknown,
): TopPrediction[] {
  let parsed: unknown = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map((item): TopPrediction | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const object = item as Record<string, unknown>;

      const code =
        typeof object.failedComponentCode === "string"
          ? object.failedComponentCode
          : typeof object.failed_component_code === "string"
            ? object.failed_component_code
            : "";

      const failureMode =
        typeof object.failureMode === "string"
          ? object.failureMode
          : typeof object.failure_mode === "string"
            ? object.failure_mode
            : "";

      const confidence = Number(object.confidence ?? 0);

      if (!code || !failureMode || !Number.isFinite(confidence)) {
        return null;
      }

      return { failedComponentCode: code, failureMode, confidence };
    })
    .filter((item): item is TopPrediction => item !== null);
}

function cleanComponentName(value: string): string {
  let result = value.trim().replace(/\s+/g, " ");

  result = result.replace(/^falha\s+de\s+/i, "");

  return result.trim();
}

function componentCodeFromName(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "NAO_IDENTIFICADO";
}

function buildFailureMode(component: string): string {
  return `Falha de ${component}`;
}

type ApplyReviewResult =
  | {
      ok: true;
      classification: {
        eventId: number;
        failedComponentCode: string;
        failureMode: string;
        status: string;
      };
    }
  | {
      ok: false;
      status: number;
      error: string;
    };


export async function applyReview(
  connection: Awaited<ReturnType<typeof getConnection>>,
  params: {
    suggestionId: number;
    unitIds: number[];
    userId: number;
    action: ReviewAction;
    correctedComponent: string;
    note: string;
  },
): Promise<ApplyReviewResult> {
  /* Validado antes de abrir a transação: buildUnitInClause
     lança se nenhuma unidade válida for informada. */
  const unitFilter = buildUnitInClause(params.unitIds);

  await connection.beginTransaction();

  try {
    const [rows] = await connection.query<LockedSuggestionRow[]>(
      `
        SELECT
            cs.id AS suggestion_id,
            cs.event_id,
            cs.status,
            cs.failed_component_code,
            cs.failure_mode,
            cs.confidence,
            cs.model_version,
            cs.top_predictions,
            me.observation

        FROM classification_suggestions cs

        INNER JOIN maintenance_events me
            ON me.id = cs.event_id

        WHERE cs.id = ?
            AND me.unit_id IN (${unitFilter.placeholders})

        LIMIT 1
        FOR UPDATE
      `,
      [params.suggestionId, ...unitFilter.values],
    );

    const suggestion = rows[0];

    if (!suggestion) {
      await connection.rollback();

      return { ok: false, status: 404, error: "Sugestão não encontrada." };
    }

    if (suggestion.status !== "PENDENTE_REVISAO") {
      await connection.rollback();

      return {
        ok: false,
        status: 409,
        error: "Essa sugestão já foi revisada.",
      };
    }

    let officialCode = suggestion.failed_component_code;
    const [existing] = await connection.query<RowDataPacket[]>(
      "SELECT status FROM event_classifications WHERE event_id = ? FOR UPDATE",
      [suggestion.event_id],
    );
    if (existing.some(row => ["APROVADA", "CORRIGIDA"].includes(row.status))) {
      await connection.rollback();
      return { ok: false, status: 409, error: "O evento já possui classificação oficial. Edite pelo histórico." };
    }
    let officialMode = suggestion.failure_mode;
    let officialComponent = officialMode
      .replace(/^Falha\s+de\s+/i, "")
      .trim();

    let classificationStatus: "APROVADA" | "CORRIGIDA" | "PENDENTE_REVISAO";
    let suggestionStatus: "CONFIRMADA" | "CORRIGIDA" | "DESCARTADA";

    if (params.action === "CONFIRM") {
      classificationStatus = "APROVADA";
      suggestionStatus = "CONFIRMADA";
    } else if (params.action === "CORRECT") {
      const correctedComponent = cleanComponentName(
        params.correctedComponent,
      );

      if (correctedComponent.length < 2) {
        await connection.rollback();

        return {
          ok: false,
          status: 400,
          error: "Informe o componente correto.",
        };
      }

      if (correctedComponent.length > 120) {
        await connection.rollback();

        return {
          ok: false,
          status: 400,
          error: "O nome do componente é muito longo.",
        };
      }

      officialComponent = correctedComponent;
      officialCode = componentCodeFromName(correctedComponent);
      officialMode = buildFailureMode(correctedComponent);

      classificationStatus = "CORRIGIDA";
      suggestionStatus = "CORRIGIDA";
    } else {
      /* REJECT: descarta a sugestão da IA. O evento fica
         sem classificação oficial (PENDENTE_REVISAO), pronto
         para ser classificado manualmente depois. */
      classificationStatus = "PENDENTE_REVISAO";
      suggestionStatus = "DESCARTADA";
      officialCode = "NAO_IDENTIFICADO";
      officialMode = "Não classificado";
      officialComponent = "";
    }

    const topPredictions = parseTopPredictions(suggestion.top_predictions);

    const notes = {
      version: 12,
      source: "HUMAN_REVIEW",
      humanVerified: true,
      excludeFromTraining: params.action === "REJECT",
      reviewAction: params.action,
      reviewNote: params.note || undefined,
      suggestionId: params.suggestionId,
      modelType: "ML",
      modelVersion: suggestion.model_version,
      failedComponentCode: officialCode,
      failedComponent: officialComponent,
      failureMode: officialMode,
      failureModeCode: officialCode,
      failureDetail: officialComponent,
      modelSuggestion: {
        failedComponentCode: suggestion.failed_component_code,
        failureMode: suggestion.failure_mode,
        confidence: numericValue(suggestion.confidence),
        topPredictions,
      },
    };

    const [classificationColumnRows] = await connection.query<
      TableColumnRow[]
    >("SHOW COLUMNS FROM event_classifications");

    const classificationColumns = new Set(
      classificationColumnRows.map((column) => column.Field),
    );

    const requiredClassificationColumns = [
      "event_id",
      "classified_by_user_id",
      "source",
      "confidence",
      "status",
      "classification_notes",
    ] as const;

    const missingRequiredColumns = requiredClassificationColumns.filter(
      (column) => !classificationColumns.has(column),
    );

    if (missingRequiredColumns.length > 0) {
      throw new Error(
        `A tabela event_classifications não possui as colunas obrigatórias: ${missingRequiredColumns.join(", ")}.`,
      );
    }

    const optionalNullColumns = [
      "category_id",
      "system_id",
      "mode_id",
    ].filter((column) => classificationColumns.has(column));

    const insertColumns = [
      "event_id",
      ...optionalNullColumns,
      "classified_by_user_id",
      "source",
      "confidence",
      "status",
      "classification_notes",
    ];

    const insertValues = [
      "?",
      ...optionalNullColumns.map(() => "NULL"),
      "?",
      "'MANUAL'",
      "NULL",
      "?",
      "?",
    ];

    const updateAssignments = [
      ...optionalNullColumns.map((column) => `\`${column}\` = NULL`),
      "`classified_by_user_id` = VALUES(`classified_by_user_id`)",
      "`source` = VALUES(`source`)",
      "`confidence` = NULL",
      "`status` = VALUES(`status`)",
      "`classification_notes` = VALUES(`classification_notes`)",
    ];

    await connection.execute<ResultSetHeader>(
      `
        INSERT INTO event_classifications (
          ${insertColumns.map((column) => `\`${column}\``).join(", ")}
        )
        VALUES (
          ${insertValues.join(", ")}
        )
        ON DUPLICATE KEY UPDATE
          ${updateAssignments.join(", ")}
      `,
      [
        suggestion.event_id,
        params.userId,
        classificationStatus,
        JSON.stringify(notes),
      ],
    );

    await connection.execute<ResultSetHeader>(
      `
        UPDATE classification_suggestions
        SET
            status = ?,
            reviewed_by_user_id = ?,
            reviewed_at = NOW()
        WHERE id = ?
      `,
      [suggestionStatus, params.userId, params.suggestionId],
    );

    /* =====================================================
       FEEDBACK HUMANO (para evolução futura do modelo)
       Registrado em classification_audit: classificação
       original da IA vs. decisão humana.
    ===================================================== */

    const [classificationIdRows] = await connection.query<
      ClassificationIdRow[]
    >(
      "SELECT id FROM event_classifications WHERE event_id = ? LIMIT 1",
      [suggestion.event_id],
    );

    const classificationId = classificationIdRows[0]?.id;

    if (classificationId) {
      await connection.execute<ResultSetHeader>(
        `
          INSERT INTO classification_audit (
            classification_id,
            user_id,
            action,
            notes
          )
          VALUES (?, ?, ?, ?)
        `,
        [
          classificationId,
          params.userId,
          params.action === "CONFIRM" ? "APROVACAO" : "CORRECAO",
          JSON.stringify({
            aiFailedComponentCode: suggestion.failed_component_code,
            aiFailureMode: suggestion.failure_mode,
            aiConfidence: numericValue(suggestion.confidence),
            humanAction: params.action,
            humanFailedComponentCode: officialCode,
            humanFailureMode: officialMode,
            note: params.note || null,
          }),
        ],
      );
    }

    await connection.commit();

    return {
      ok: true,
      classification: {
        eventId: Number(suggestion.event_id),
        failedComponentCode: officialCode,
        failureMode: officialMode,
        status: suggestionStatus,
      },
    };
  } catch (error) {
    await connection.rollback();

    throw error;
  }
}
