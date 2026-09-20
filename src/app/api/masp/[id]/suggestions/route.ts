import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getConnection,
} from "@/lib/db";

import {
  maspErrorResponse,
  parseRouteId,
  requireAccessibleMasp,
  requireMaspContext,
} from "@/lib/masp/api";

import {
  generateMaspSuggestions,
} from "@/lib/masp/suggestion-engine";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
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
      await requireMaspContext();
    const {
      id,
    } =
      await routeContext.params;
    const maspId =
      parseRouteId(
        id,
        "MASP",
      );

    const requestedDays =
      Number(
        request
          .nextUrl
          .searchParams
          .get(
            "days",
          ) ?? 180,
      );

    connection =
      await getConnection();
    const masp =
      await requireAccessibleMasp(
        connection,
        maspId,
        context,
      );

    const items =
      await generateMaspSuggestions(
        connection,
        masp,
        Number.isFinite(
          requestedDays,
        )
          ? requestedDays
          : 180,
      );

    return NextResponse.json({
      success: true,
      label:
        "Sugestões baseadas no histórico local",
      historyDays:
        Math.max(
          30,
          Math.min(
            Math.trunc(
              requestedDays,
            ) || 180,
            730,
          ),
        ),
      items,
    });
  } catch (
    error
  ) {
    return maspErrorResponse(
      error,
      "Erro ao gerar sugestões MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}
