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

import {
  buildProblemCategoryCaseSql,
  deriveProblemCategorySlug,
  getCategoryLabel,
} from "@/lib/maintenance/problem-categories";

import {
  parseReviewFilters,
} from "@/lib/maintenance/review-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
   O CASE de categoria é montado dinamicamente (depende da
   taxonomia). Resolvemos a string uma única vez e a
   reaproveitamos nas consultas abaixo.
*/
const CATEGORY_CASE_SQL = buildProblemCategoryCaseSql();


interface SummaryRow extends RowDataPacket {
  total: number | string | null;
  pending: number | string | null;
  confirmed: number | string | null;
  corrected: number | string | null;
  rejected: number | string | null;
}


interface CountRow extends RowDataPacket {
  total: number | string | null;
}


interface SuggestionRow extends RowDataPacket {
  suggestion_id: number;
  event_id: number;
  event_date: string | Date | null;
  shift: string | null;
  source_line_name: string | null;
  source_equipment_name: string | null;
  source_stop_type: string | null;
  source_stop_key_1: string | null;
  source_stop_subkey: string | null;
  observation: string | null;
  downtime_minutes: number | string | null;
  failed_component_code: string;
  failure_mode: string;
  confidence: number | string | null;
  model_version: string;
  top_predictions: unknown;
  status: string;
  reviewed_at: string | Date | null;
  reviewed_by_name: string | null;
  classification_notes: string | null;
}


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


interface ReviewBody {
  suggestionId?: unknown;
  suggestionIds?: unknown;
  action?: unknown;
  correctedComponent?: unknown;
  note?: unknown;
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


export type ReviewAction = "CONFIRM" | "CORRECT" | "REJECT";


function numericValue(
  value: number | string | null | undefined,
): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}


function formatDate(
  value: Date | string | null,
): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}


function formatDateTime(
  value: Date | string | null,
): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}


function parseTopPredictions(
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


function extractReviewNote(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;

    const note = parsed.reviewNote;

    return typeof note === "string" && note.trim() ? note.trim() : null;
  } catch {
    return null;
  }
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


function normalizeLimit(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.floor(parsed), max));
}


/*
   IMPORTANTE: esta ordenação é aplicada FORA da subconsulta
   que calcula category_slug (alias `grouped`), então precisa
   referenciar os nomes de coluna EXPOSTOS pela subconsulta
   (sem o prefixo `cs.`/`me.`), e não os aliases originais.
*/
function sortSql(sort: string | null): string {
  switch (sort) {
    case "confidence_asc":
      return "confidence ASC, suggestion_id ASC";
    case "confidence_desc":
      return "confidence DESC, suggestion_id ASC";
    case "date_asc":
      return "event_date ASC, suggestion_id ASC";
    case "date_desc":
    default:
      return "event_date DESC, suggestion_id DESC";
  }
}


/* =========================================================
   GET

   Lista as sugestões da IA com filtros combináveis, usadas
   tanto pela página geral de validação (quando category não
   é informado) quanto pela página de uma categoria
   específica.
========================================================= */

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Não autenticado." },
      { status: 401 },
    );
  }

  const searchParams = request.nextUrl.searchParams;

  const page = normalizeLimit(searchParams.get("page"), 1, 100000);
  const pageSize = normalizeLimit(searchParams.get("pageSize"), 50, 200);

  const category = (searchParams.get("category") ?? "").trim();

  const connection = await getConnection();

  try {
    const { whereSql, values } = parseReviewFilters(
      searchParams,
      session.unitId,
    );

    const categoryFilterClause = category
      ? "WHERE category_slug = ?"
      : "";

    /* =====================================================
       RESUMO (respeita os filtros, exceto o status)
    ===================================================== */

    const [summaryRows] = await connection.execute<SummaryRow[]>(
      `
        SELECT
            COUNT(*) AS total,
            SUM(cs.status = 'PENDENTE_REVISAO') AS pending,
            SUM(cs.status = 'CONFIRMADA') AS confirmed,
            SUM(cs.status = 'CORRIGIDA') AS corrected,
            SUM(cs.status = 'DESCARTADA') AS rejected

        FROM classification_suggestions cs

        INNER JOIN maintenance_events me
            ON me.id = cs.event_id

        WHERE ${whereSql}
      `,
      values,
    );

    /* =====================================================
       CONTAGEM TOTAL PARA PAGINAÇÃO
       (precisa aplicar o filtro de categoria também)
    ===================================================== */

    const categoryFilterValues = category
      ? [...values, category]
      : values;

    const [countRows] = await connection.execute<CountRow[]>(
      `
        SELECT COUNT(*) AS total FROM (
          SELECT
              cs.id,
              ${CATEGORY_CASE_SQL} AS category_slug
          FROM classification_suggestions cs
          INNER JOIN maintenance_events me
              ON me.id = cs.event_id
          WHERE ${whereSql}
        ) grouped
        ${categoryFilterClause}
      `,
      categoryFilterValues,
    );

    const total = numericValue(countRows[0]?.total);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * pageSize;

    const dataValues = [
      ...categoryFilterValues,
      pageSize,
      offset,
    ];

    const [suggestionRows] = await connection.execute<SuggestionRow[]>(
      `
        SELECT * FROM (
          SELECT
              cs.id AS suggestion_id,
              cs.event_id,
              me.event_date,
              me.shift,
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
              cs.top_predictions,
              cs.status,
              cs.reviewed_at,
              ru.name AS reviewed_by_name,
              ec.classification_notes,
              ${CATEGORY_CASE_SQL} AS category_slug

          FROM classification_suggestions cs

          INNER JOIN maintenance_events me
              ON me.id = cs.event_id

          LEFT JOIN users ru
              ON ru.id = cs.reviewed_by_user_id

          LEFT JOIN event_classifications ec
              ON ec.event_id = cs.event_id

          WHERE ${whereSql}
        ) grouped
        ${categoryFilterClause}
        ORDER BY ${sortSql(searchParams.get("sort"))}
        LIMIT ?
        OFFSET ?
      `,
      dataValues,
    );

    const summary = summaryRows[0];

    const pending = numericValue(summary?.pending);
    const confirmed = numericValue(summary?.confirmed);
    const corrected = numericValue(summary?.corrected);
    const rejected = numericValue(summary?.rejected);

    return NextResponse.json({
      success: true,

      summary: {
        total: numericValue(summary?.total),
        pending,
        confirmed,
        corrected,
        rejected,
        reviewed: confirmed + corrected + rejected,
      },

      page: safePage,
      pageSize,
      total,
      totalPages,

      items: suggestionRows.map((row) => ({
        suggestionId: Number(row.suggestion_id),
        eventId: Number(row.event_id),

        categorySlug: row.status
          ? deriveProblemCategorySlug({
              failedComponentCode: row.failed_component_code,
              failureMode: row.failure_mode,
              observation: row.observation,
            })
          : "outros",

        categoryLabel: getCategoryLabel(
          deriveProblemCategorySlug({
            failedComponentCode: row.failed_component_code,
            failureMode: row.failure_mode,
            observation: row.observation,
          }),
        ),

        status: row.status,

        event: {
          date: formatDate(row.event_date),
          shift: row.shift,
          line: row.source_line_name,
          equipment: row.source_equipment_name,
          stopType: row.source_stop_type,
          stopKey1: row.source_stop_key_1,
          stopSubkey: row.source_stop_subkey,
          observation: row.observation ?? "",
          downtimeMinutes:
            row.downtime_minutes === null
              ? null
              : numericValue(row.downtime_minutes),
        },

        suggestion: {
          failedComponentCode: row.failed_component_code,
          failureMode: row.failure_mode,
          confidence: numericValue(row.confidence),
          modelVersion: row.model_version,
          topPredictions: parseTopPredictions(row.top_predictions),
        },

        reviewedAt: formatDateTime(row.reviewed_at),
        reviewedByName: row.reviewed_by_name,
        note: extractReviewNote(row.classification_notes),
      })),
    });
  } catch (error) {
    console.error("Erro ao carregar revisão:", error);

    return NextResponse.json(
      { error: "Não foi possível carregar as sugestões." },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}


/* =========================================================
   PATCH

   Revisão individual: aprovar, corrigir ou rejeitar uma
   sugestão da IA.
========================================================= */

export async function PATCH(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Não autenticado." },
      { status: 401 },
    );
  }

  let body: ReviewBody;

  try {
    body = (await request.json()) as ReviewBody;
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido." },
      { status: 400 },
    );
  }

  const suggestionId = Number(body.suggestionId);

  if (!Number.isInteger(suggestionId) || suggestionId <= 0) {
    return NextResponse.json(
      { error: "Sugestão inválida." },
      { status: 400 },
    );
  }

  const action = typeof body.action === "string"
    ? body.action.trim().toUpperCase()
    : "";

  if (action !== "CONFIRM" && action !== "CORRECT" && action !== "REJECT") {
    return NextResponse.json(
      { error: "Ação de revisão inválida." },
      { status: 400 },
    );
  }

  const note = typeof body.note === "string"
    ? body.note.trim().slice(0, 500)
    : "";

  const connection = await getConnection();

  try {
    const result = await applyReview(connection, {
      suggestionId,
      unitId: session.unitId,
      userId: session.userId,
      action: action as ReviewAction,
      correctedComponent:
        typeof body.correctedComponent === "string"
          ? body.correctedComponent
          : "",
      note,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      success: true,
      classification: result.classification,
    });
  } catch (error) {
    console.error("Erro ao revisar sugestão:", error);

    return NextResponse.json(
      { error: "Não foi possível registrar a revisão." },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}


/* =========================================================
   LÓGICA COMPARTILHADA (usada também pelo endpoint de ações
   em massa, /api/review/bulk)
========================================================= */

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
    unitId: number;
    userId: number;
    action: ReviewAction;
    correctedComponent: string;
    note: string;
  },
): Promise<ApplyReviewResult> {
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
            AND me.unit_id = ?

        LIMIT 1
        FOR UPDATE
      `,
      [params.suggestionId, params.unitId],
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
    }

    const topPredictions = parseTopPredictions(suggestion.top_predictions);

    const notes = {
      version: 12,
      source: "HUMAN_REVIEW",
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
      "`source` = 'MANUAL'",
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
