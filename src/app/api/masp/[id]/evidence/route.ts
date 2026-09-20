import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import {
  getConnection,
} from "@/lib/db";

import {
  cleanText,
  EVIDENCE_TYPES,
  isOneOf,
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


export const runtime =
  "nodejs";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface CountRow
  extends RowDataPacket {
  total:
    | number
    | string;
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

    if (
      !isOneOf(
        body.type,
        EVIDENCE_TYPES,
      )
    ) {
      throw new MaspApiError(
        400,
        "Tipo de evidência inválido.",
      );
    }

    const description =
      cleanText(
        body.description,
        10000,
      );

    if (
      !description
    ) {
      throw new MaspApiError(
        400,
        "A descrição da evidência é obrigatória.",
      );
    }

    const hypothesisId =
      positiveIntegerOrNull(
        body.hypothesisId,
      );
    const fiveWhyId =
      positiveIntegerOrNull(
        body.fiveWhyId,
      );
    const eventId =
      positiveIntegerOrNull(
        body.eventId,
      );

    if (
      body.type ===
        "EVENT" &&
      !eventId
    ) {
      throw new MaspApiError(
        400,
        "Evidências do tipo EVENT exigem um evento.",
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
        "Não é possível incluir evidências em um MASP encerrado.",
      );
    }

    const checks = [
      hypothesisId
        ? {
            sql: "SELECT COUNT(*) AS total FROM masp_hypotheses WHERE id = ? AND masp_id = ?",
            values: [
              hypothesisId,
              maspId,
            ],
            message:
              "A hipótese não pertence a este MASP.",
          }
        : null,
      fiveWhyId
        ? {
            sql: "SELECT COUNT(*) AS total FROM masp_five_whys WHERE id = ? AND masp_id = ?",
            values: [
              fiveWhyId,
              maspId,
            ],
            message:
              "O porquê não pertence a este MASP.",
          }
        : null,
      eventId
        ? {
            sql: "SELECT COUNT(*) AS total FROM maintenance_events WHERE id = ? AND unit_id = ?",
            values: [
              eventId,
              masp.unit_id,
            ],
            message:
              "O evento não pertence à unidade deste MASP.",
          }
        : null,
    ].filter(
      (
        item,
      ): item is {
        sql: string;
        values: number[];
        message: string;
      } =>
        item !== null,
    );

    for (
      const check
      of checks
    ) {
      const [
        rows,
      ] =
        await connection.query<
          CountRow[]
        >(
          check.sql,
          check.values,
        );

      if (
        Number(
          rows[0]?.total ?? 0,
        ) !== 1
      ) {
        throw new MaspApiError(
          400,
          check.message,
        );
      }
    }

    const [
      result,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          INSERT INTO masp_evidence (
              masp_id,
              hypothesis_id,
              five_why_id,
              event_id,
              type,
              description,
              attachment_path,
              created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          maspId,
          hypothesisId,
          fiveWhyId,
          eventId,
          body.type,
          description,
          cleanText(
            body.attachmentPath,
            500,
          ) || null,
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
      "Erro ao criar evidência MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}
