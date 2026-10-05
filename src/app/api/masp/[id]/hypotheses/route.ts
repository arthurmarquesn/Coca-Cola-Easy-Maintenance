import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  ResultSetHeader,
} from "mysql2/promise";

import {
  getConnection,
} from "@/lib/db";

import {
  cleanText,
  HYPOTHESIS_SOURCES,
  HYPOTHESIS_STATUSES,
  isOneOf,
  MASP_CATEGORIES,
} from "@/lib/masp/domain";

import {
  MaspApiError,
  maspErrorResponse,
  parseJsonBody,
  parseRouteId,
  requireAccessibleMasp,
  requireMaspContext,
} from "@/lib/masp/api";


export const runtime =
  "nodejs";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function POST(
  request: NextRequest,
  routeContext: RouteContext,
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
      await requireMaspContext(true);
    const {
      id,
    } =
      await routeContext.params;
    const maspId =
      parseRouteId(
        id,
        "MASP",
      );
    const body =
      await parseJsonBody(
        request,
      );

    const description =
      cleanText(
        body.description,
        5000,
      );

    if (
      !description ||
      !isOneOf(
        body.category,
        MASP_CATEGORIES,
      )
    ) {
      throw new MaspApiError(
        400,
        "Informe uma descrição e uma categoria 6M válidas.",
      );
    }

    const source =
      isOneOf(
        body.source,
        HYPOTHESIS_SOURCES,
      )
        ? body.source
        : "ANALYST";

    const status =
      isOneOf(
        body.status,
        HYPOTHESIS_STATUSES,
      )
        ? body.status
        : "OPEN";

    const supportCount =
      Math.max(
        0,
        Math.min(
          Math.trunc(
            Number(
              body.supportCount,
            ) || 0,
          ),
          1_000_000,
        ),
      );

    connection =
      await getConnection();
    const masp =
      await requireAccessibleMasp(
        connection,
        maspId,
        context,
      );

    if (
      masp.status ===
        "CLOSED" ||
      masp.status ===
        "CANCELLED"
    ) {
      throw new MaspApiError(
        409,
        "Não é possível incluir hipóteses em um MASP encerrado.",
      );
    }

    const [
      result,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          INSERT INTO masp_hypotheses (
              masp_id,
              category,
              description,
              status,
              source,
              support_count,
              created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          maspId,
          body.category,
          description,
          status,
          source,
          supportCount,
          context.userId,
        ],
      );

    return NextResponse.json(
      {
        success: true,
        id:
          Number(
            result.insertId,
          ),
      },
      {
        status: 201,
      },
    );
  } catch (
    error
  ) {
    return maspErrorResponse(
      error,
      "Erro ao criar hipótese MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}
