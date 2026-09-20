import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getConnection,
} from "@/lib/db";

import {
  EVENT_RELATION_TYPES,
  isOneOf,
} from "@/lib/masp/domain";

import {
  MaspApiError,
  maspErrorResponse,
  parseJsonBody,
  parseRouteId,
  requireAccessibleMasp,
  requireMaspContext,
} from "@/lib/masp/api";

import {
  loadEventsByIds,
} from "@/lib/masp/service";


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
    const body =
      await parseJsonBody(
        request,
      );

    const rawIds =
      Array.isArray(
        body.eventIds,
      )
        ? body.eventIds
        : [
            body.eventId,
          ];

    const eventIds = [
      ...new Set(
        rawIds
          .map(
            Number,
          )
          .filter(
            (
              value,
            ) =>
              Number.isInteger(
                value,
              ) &&
              value > 0,
          ),
      ),
    ].slice(
      0,
      500,
    );

    if (
      eventIds.length ===
      0
    ) {
      throw new MaspApiError(
        400,
        "Informe ao menos um evento válido.",
      );
    }

    const relationType =
      isOneOf(
        body.relationType,
        EVENT_RELATION_TYPES,
      )
        ? body.relationType
        : "SOURCE";

    connection =
      await getConnection();

    await connection
      .beginTransaction();

    const masp =
      await requireAccessibleMasp(
        connection,
        maspId,
        context,
        true,
      );

    if (
      masp.status ===
        "CLOSED" ||
      masp.status ===
        "CANCELLED"
    ) {
      throw new MaspApiError(
        409,
        "Não é possível associar eventos a um MASP encerrado.",
      );
    }

    const events =
      await loadEventsByIds(
        connection,
        eventIds,
      );

    if (
      events.length !==
      eventIds.length ||
      events.some(
        (
          event,
        ) =>
          Number(
            event.unit_id,
          ) !==
          Number(
            masp.unit_id,
          ),
      )
    ) {
      throw new MaspApiError(
        400,
        "Todos os eventos devem existir e pertencer à unidade do MASP.",
      );
    }

    const placeholders =
      eventIds
        .map(
          () =>
            "(?, ?, ?)",
        )
        .join(
          ", ",
        );

    await connection.query(
      `
        INSERT INTO masp_events (
            masp_id,
            event_id,
            relation_type
        ) VALUES
            ${placeholders}
        ON DUPLICATE KEY UPDATE
            relation_type =
                VALUES(relation_type)
      `,
      eventIds.flatMap(
        (
          eventId,
        ) => [
          maspId,
          eventId,
          relationType,
        ],
      ),
    );

    await connection
      .commit();

    return NextResponse.json({
      success: true,
      attached:
        eventIds.length,
    });
  } catch (
    error
  ) {
    if (
      connection
    ) {
      await connection
        .rollback();
    }

    return maspErrorResponse(
      error,
      "Erro ao associar eventos ao MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}

