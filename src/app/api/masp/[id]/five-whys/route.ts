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
  getFiveWhysWarnings,
} from "@/lib/masp/five-whys-coach";


export const runtime =
  "nodejs";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface ParentRow
  extends RowDataPacket {
  id: number;
  depth: number;
  answer: string;
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
    const answer =
      cleanText(
        body.answer,
        10000,
      );

    if (
      !answer
    ) {
      throw new MaspApiError(
        400,
        "A resposta do porquê é obrigatória.",
      );
    }

    const parentId =
      positiveIntegerOrNull(
        body.parentId,
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
        "Não é possível alterar os 5 Porquês de um MASP encerrado.",
      );
    }

    let depth =
      1;

    let previousText =
      masp.problem_statement;

    if (
      parentId
    ) {
      const [
        parents,
      ] =
        await connection.query<
          ParentRow[]
        >(
          `
            SELECT
                id,
                depth,
                answer
            FROM masp_five_whys
            WHERE id = ?
              AND masp_id = ?
              AND status = 'ACTIVE'
            LIMIT 1
          `,
          [
            parentId,
            maspId,
          ],
        );

      if (
        !parents[0]
      ) {
        throw new MaspApiError(
          400,
          "O porquê pai não pertence a este MASP ou foi descartado.",
        );
      }

      depth =
        Number(
          parents[0]
            .depth,
        ) + 1;

      previousText =
        parents[0]
          .answer;
    }

    if (
      depth > 50
    ) {
      throw new MaspApiError(
        400,
        "A cadeia de porquês atingiu o limite técnico de segurança.",
      );
    }

    const [
      result,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          INSERT INTO masp_five_whys (
              masp_id,
              parent_id,
              depth,
              answer,
              status,
              created_by
          ) VALUES (?, ?, ?, ?, 'ACTIVE', ?)
        `,
        [
          maspId,
          parentId,
          depth,
          answer,
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
        depth,
        warnings:
          getFiveWhysWarnings(
            answer,
            previousText,
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
      "Erro ao criar porquê MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}

