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
    hypothesisId: string;
  }>;
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
      await requireMaspContext(true);
    const params =
      await routeContext.params;
    const maspId =
      parseRouteId(
        params.id,
        "MASP",
      );
    const hypothesisId =
      parseRouteId(
        params.hypothesisId,
        "Hipótese",
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
        "Não é possível editar hipóteses de um MASP encerrado.",
      );
    }

    const assignments:
      string[] = [];
    const values:
      string[] = [];

    if (
      body.description !==
      undefined
    ) {
      const description =
        cleanText(
          body.description,
          5000,
        );

      if (
        !description
      ) {
        throw new MaspApiError(
          400,
          "A descrição da hipótese é obrigatória.",
        );
      }

      assignments.push(
        "description = ?",
      );
      values.push(
        description,
      );
    }

    if (
      body.category !==
      undefined
    ) {
      if (
        !isOneOf(
          body.category,
          MASP_CATEGORIES,
        )
      ) {
        throw new MaspApiError(
          400,
          "Categoria 6M inválida.",
        );
      }

      assignments.push(
        "category = ?",
      );
      values.push(
        body.category,
      );
    }

    if (
      body.status !==
      undefined
    ) {
      if (
        !isOneOf(
          body.status,
          HYPOTHESIS_STATUSES,
        )
      ) {
        throw new MaspApiError(
          400,
          "Status da hipótese inválido.",
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
          UPDATE masp_hypotheses
          SET ${assignments.join(", ")}
          WHERE id = ?
            AND masp_id = ?
        `,
        [
          ...values,
          hypothesisId,
          maspId,
        ],
      );

    if (
      result.affectedRows < 1
    ) {
      throw new MaspApiError(
        404,
        "Hipótese não encontrada neste MASP.",
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
      "Erro ao atualizar hipótese MASP:",
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
      await requireMaspContext(true);
    const params =
      await routeContext.params;
    const maspId =
      parseRouteId(
        params.id,
        "MASP",
      );
    const hypothesisId =
      parseRouteId(
        params.hypothesisId,
        "Hipótese",
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
        "Não é possível excluir hipóteses de um MASP encerrado.",
      );
    }

    const [
      result,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          DELETE FROM masp_hypotheses
          WHERE id = ?
            AND masp_id = ?
        `,
        [
          hypothesisId,
          maspId,
        ],
      );

    if (
      result.affectedRows < 1
    ) {
      throw new MaspApiError(
        404,
        "Hipótese não encontrada neste MASP.",
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
      "Erro ao excluir hipótese MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}
