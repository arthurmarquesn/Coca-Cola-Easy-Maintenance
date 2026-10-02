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
  ACTION_STATUSES,
  cleanText,
  isOneOf,
  nullableDate,
  positiveIntegerOrNull,
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
  validateActionReferences,
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
    const what =
      cleanText(
        body.what,
        10000,
      );

    if (
      !what
    ) {
      throw new MaspApiError(
        400,
        "O campo WHAT da ação é obrigatório.",
      );
    }

    const rootCauseId =
      positiveIntegerOrNull(
        body.rootCauseId,
      );
    const whoUserId =
      positiveIntegerOrNull(
        body.whoUserId,
      );
    const status =
      isOneOf(
        body.status,
        ACTION_STATUSES,
      )
        ? body.status
        : "PLANNED";
    const whenDate =
      nullableDate(
        body.whenDate,
      );

    if (
      body.whenDate &&
      !whenDate
    ) {
      throw new MaspApiError(
        400,
        "Data da ação inválida.",
      );
    }

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
        "Não é possível incluir ações em um MASP encerrado.",
      );
    }

    await validateActionReferences(
      connection,
      maspId,
      Number(
        masp.unit_id,
      ),
      rootCauseId,
      whoUserId,
    );

    const [
      result,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          INSERT INTO masp_actions (
              masp_id,
              root_cause_id,
              what,
              why,
              where_text,
              when_date,
              who_user_id,
              who_text,
              how_text,
              how_much_text,
              status,
              completed_at,
              created_by
          ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ${status === "DONE" ? "NOW()" : "NULL"},
              ?
          )
        `,
        [
          maspId,
          rootCauseId,
          what,
          cleanText(
            body.why,
            10000,
          ) || null,
          cleanText(
            body.whereText,
            255,
          ) || null,
          whenDate,
          whoUserId,
          cleanText(
            body.whoText,
            180,
          ) || null,
          cleanText(
            body.howText,
            10000,
          ) || null,
          cleanText(
            body.howMuchText,
            255,
          ) || null,
          status,
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
      "Erro ao criar ação MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}

