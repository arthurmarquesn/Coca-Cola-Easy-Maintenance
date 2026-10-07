import { getAnalystAccessError } from "@/lib/write-access";
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
  PROBLEM_CATEGORIES,
  buildProblemCategoryCaseSql,
} from "@/lib/maintenance/problem-categories";

import {
  parseReviewFilters,
} from "@/lib/maintenance/review-filters";

import {
  getUnitSelection,
} from "@/lib/unit-selection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOW_CONFIDENCE_THRESHOLD = 0.7;

interface CategoryRow extends RowDataPacket {
  category_slug: string;
  total: number | string | null;
  pending: number | string | null;
  confirmed: number | string | null;
  corrected: number | string | null;
  rejected: number | string | null;
  avg_confidence: number | string | null;
  low_confidence_pending: number | string | null;
}

function numericValue(
  value: number | string | null | undefined,
): number {
  const parsed = Number(value ?? 0);

  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Não autenticado." },
      { status: 401 },
    );
  }

  /* Revisão e Ursus são exclusivos do Analista. */
  const analystError = getAnalystAccessError(session);
  if (analystError) return analystError;


  const unitSelection = await getUnitSelection({
    userId: session.userId,
    defaultUnitId: session.unitId,
  });

  if (unitSelection.selectedUnitIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "Nenhuma unidade válida está selecionada." },
      { status: 403 },
    );
  }

  try {
    const { whereSql, values } = parseReviewFilters(
      request.nextUrl.searchParams,
      unitSelection.selectedUnitIds,
    );

    const categorySql = buildProblemCategoryCaseSql();

    const rows = await executeRows<CategoryRow[]>(
      `
        SELECT
          ${categorySql} AS category_slug,

          COUNT(*) AS total,

          SUM(cs.status = 'PENDENTE_REVISAO') AS pending,

          SUM(cs.status = 'CONFIRMADA') AS confirmed,

          SUM(cs.status = 'CORRIGIDA') AS corrected,

          SUM(cs.status = 'DESCARTADA') AS rejected,

          AVG(cs.confidence) AS avg_confidence,

          SUM(
            cs.status = 'PENDENTE_REVISAO'
            AND cs.confidence < ${LOW_CONFIDENCE_THRESHOLD}
          ) AS low_confidence_pending

        FROM classification_suggestions cs

        INNER JOIN maintenance_events me
          ON me.id = cs.event_id

        WHERE ${whereSql}

        GROUP BY category_slug
      `,
      values,
    );

    const rowBySlug = new Map(
      rows.map((row) => [row.category_slug, row]),
    );

    const categories = PROBLEM_CATEGORIES.map((definition) => {
      const row = rowBySlug.get(definition.slug);

      const total = numericValue(row?.total);
      const pending = numericValue(row?.pending);
      const confirmed = numericValue(row?.confirmed);
      const corrected = numericValue(row?.corrected);
      const rejected = numericValue(row?.rejected);
      const validated = confirmed + corrected + rejected;
      const lowConfidencePending = numericValue(
        row?.low_confidence_pending,
      );

      return {
        slug: definition.slug,
        label: definition.label,
        description: definition.description,
        total,
        pending,
        validated,
        confirmed,
        corrected,
        rejected,
        percentValidated:
          total > 0
            ? Math.round((validated / total) * 100)
            : 0,
        averageConfidence:
          row?.avg_confidence === null ||
          row?.avg_confidence === undefined
            ? null
            : numericValue(row.avg_confidence),
        lowConfidencePending,
      };
    }).filter((category) => category.total > 0);

    categories.sort((a, b) => b.pending - a.pending);

    const totals = categories.reduce(
      (accumulator, category) => ({
        total: accumulator.total + category.total,
        pending: accumulator.pending + category.pending,
        validated: accumulator.validated + category.validated,
        lowConfidencePending:
          accumulator.lowConfidencePending +
          category.lowConfidencePending,
      }),
      {
        total: 0,
        pending: 0,
        validated: 0,
        lowConfidencePending: 0,
      },
    );

    return NextResponse.json({
      success: true,
      categories,
      totals,
    });
  } catch (error) {
    console.error(
      "Erro ao carregar categorias de validação:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error: "Não foi possível carregar as categorias.",
      },
      { status: 500 },
    );
  }
}
