import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getConnection,
} from "@/lib/db";

import {
  MaspApiError,
  maspErrorResponse,
  parseRouteId,
  requireAccessibleMasp,
  requireMaspContext,
} from "@/lib/masp/api";


export const runtime =
  "nodejs";

interface RouteContext {
  params: Promise<{
    id: string;
    eventId: string;
  }>;
}

export async function DELETE(
  _request: NextRequest,
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
    const params =
      await routeContext.params;
    const maspId =
      parseRouteId(
        params.id,
        "MASP",
      );
    const eventId =
      parseRouteId(
        params.eventId,
        "Evento",
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
        "Não é possível remover eventos de um MASP encerrado.",
      );
    }

    const [
      result,
    ] =
      await connection.query(
        `
          DELETE FROM masp_events
          WHERE masp_id = ?
            AND event_id = ?
        `,
        [
          maspId,
          eventId,
        ],
      );

    const affectedRows =
      "affectedRows" in result
        ? Number(
            result
              .affectedRows,
          )
        : 0;

    if (
      affectedRows < 1
    ) {
      throw new MaspApiError(
        404,
        "Evento não associado a este MASP.",
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (
    error
  ) {
    return maspErrorResponse(
      error,
      "Erro ao remover evento do MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}

