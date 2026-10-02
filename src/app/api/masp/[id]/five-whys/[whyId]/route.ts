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
    whyId: string;
  }>;
}

interface WhyContextRow
  extends RowDataPacket {
  previous_text: string;
}

export async function PATCH(
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
    const params =
      await routeContext.params;
    const maspId =
      parseRouteId(
        params.id,
        "MASP",
      );
    const whyId =
      parseRouteId(
        params.whyId,
        "Porquê",
      );
    const body =
      await parseJsonBody(
        request,
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

    const assignments:
      string[] = [];
    const values:
      string[] = [];
    let answer:
      string | null =
        null;

    if (
      body.answer !==
      undefined
    ) {
      answer =
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

      assignments.push(
        "answer = ?",
      );
      values.push(
        answer,
      );
    }

    if (
      body.status !==
      undefined
    ) {
      if (
        body.status !==
          "ACTIVE" &&
        body.status !==
          "DISCARDED"
      ) {
        throw new MaspApiError(
          400,
          "Status do porquê inválido.",
        );
      }

      assignments.push(
        "status = ?",
      );
      values.push(
        body.status,
      );
    }

    if (
      assignments.length ===
      0
    ) {
      throw new MaspApiError(
        400,
        "Nenhum campo válido foi informado.",
      );
    }

    const [
      result,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          UPDATE masp_five_whys
          SET ${assignments.join(", ")}
          WHERE id = ?
            AND masp_id = ?
        `,
        [
          ...values,
          whyId,
          maspId,
        ],
      );

    if (
      result.affectedRows < 1
    ) {
      throw new MaspApiError(
        404,
        "Porquê não encontrado neste MASP.",
      );
    }

    let warnings:
      string[] = [];

    if (
      answer
    ) {
      const [
        rows,
      ] =
        await connection.query<
          WhyContextRow[]
        >(
          `
            SELECT
                COALESCE(
                    parent.answer,
                    ma.problem_statement
                ) AS previous_text
            FROM masp_five_whys current_why
            INNER JOIN masp_analyses ma
                ON ma.id = current_why.masp_id
            LEFT JOIN masp_five_whys parent
                ON parent.id = current_why.parent_id
            WHERE current_why.id = ?
              AND current_why.masp_id = ?
            LIMIT 1
          `,
          [
            whyId,
            maspId,
          ],
        );

      warnings =
        getFiveWhysWarnings(
          answer,
          rows[0]
            ?.previous_text ??
            masp.problem_statement,
        );
    }

    return NextResponse.json({
      success: true,
      warnings,
    });
  } catch (
    error
  ) {
    return maspErrorResponse(
      error,
      "Erro ao atualizar porquê MASP:",
    );
  } finally {
    connection
      ?.release();
  }
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
    const whyId =
      parseRouteId(
        params.whyId,
        "Porquê",
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
        "Não é possível excluir porquês de um MASP encerrado.",
      );
    }

    const [
      result,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          DELETE FROM masp_five_whys
          WHERE id = ?
            AND masp_id = ?
        `,
        [
          whyId,
          maspId,
        ],
      );

    if (
      result.affectedRows < 1
    ) {
      throw new MaspApiError(
        404,
        "Porquê não encontrado neste MASP.",
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
      "Erro ao excluir porquê MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}
