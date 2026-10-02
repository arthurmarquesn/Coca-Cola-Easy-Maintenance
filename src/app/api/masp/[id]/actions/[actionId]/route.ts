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
    actionId: string;
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
      await requireMaspContext();
    const params =
      await routeContext.params;
    const maspId =
      parseRouteId(
        params.id,
        "MASP",
      );
    const actionId =
      parseRouteId(
        params.actionId,
        "Ação",
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
        "Não é possível alterar ações de um MASP encerrado.",
      );
    }

    const assignments:
      string[] = [];
    const values:
      Array<
        string |
        number |
        null
      > = [];

    const textFields = [
      [
        "what",
        "what",
        10000,
        true,
      ],
      [
        "why",
        "why",
        10000,
        false,
      ],
      [
        "where_text",
        "whereText",
        255,
        false,
      ],
      [
        "who_text",
        "whoText",
        180,
        false,
      ],
      [
        "how_text",
        "howText",
        10000,
        false,
      ],
      [
        "how_much_text",
        "howMuchText",
        255,
        false,
      ],
    ] as const;

    for (
      const [
        column,
        field,
        maxLength,
        required,
      ]
      of textFields
    ) {
      if (
        body[field] !==
        undefined
      ) {
        const value =
          cleanText(
            body[field],
            maxLength,
          );

        if (
          required &&
          !value
        ) {
          throw new MaspApiError(
            400,
            "O campo WHAT da ação é obrigatório.",
          );
        }

        assignments.push(
          `${column} = ?`,
        );
        values.push(
          value || null,
        );
      }
    }

    if (
      body.whenDate !==
      undefined
    ) {
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

      assignments.push(
        "when_date = ?",
      );
      values.push(
        whenDate,
      );
    }

    const rootCauseId =
      body.rootCauseId ===
        null
        ? null
        : positiveIntegerOrNull(
            body.rootCauseId,
          );
    const whoUserId =
      body.whoUserId ===
        null
        ? null
        : positiveIntegerOrNull(
            body.whoUserId,
          );

    if (
      body.rootCauseId !==
        undefined ||
      body.whoUserId !==
        undefined
    ) {
      if (
        body.rootCauseId !==
          undefined &&
        body.rootCauseId !==
          null &&
        !rootCauseId
      ) {
        throw new MaspApiError(
          400,
          "Causa raiz inválida.",
        );
      }

      if (
        body.whoUserId !==
          undefined &&
        body.whoUserId !==
          null &&
        !whoUserId
      ) {
        throw new MaspApiError(
          400,
          "Responsável inválido.",
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

      if (
        body.rootCauseId !==
        undefined
      ) {
        assignments.push(
          "root_cause_id = ?",
        );
        values.push(
          rootCauseId,
        );
      }

      if (
        body.whoUserId !==
        undefined
      ) {
        assignments.push(
          "who_user_id = ?",
        );
        values.push(
          whoUserId,
        );
      }
    }

    if (
      body.status !==
      undefined
    ) {
      if (
        !isOneOf(
          body.status,
          ACTION_STATUSES,
        )
      ) {
        throw new MaspApiError(
          400,
          "Status da ação inválido.",
        );
      }

      assignments.push(
        "status = ?",
        body.status ===
          "DONE"
          ? "completed_at = COALESCE(completed_at, NOW())"
          : "completed_at = NULL",
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
          UPDATE masp_actions
          SET ${assignments.join(", ")}
          WHERE id = ?
            AND masp_id = ?
        `,
        [
          ...values,
          actionId,
          maspId,
        ],
      );

    if (
      result.affectedRows < 1
    ) {
      throw new MaspApiError(
        404,
        "Ação não encontrada neste MASP.",
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
      "Erro ao atualizar ação MASP:",
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
    const actionId =
      parseRouteId(
        params.actionId,
        "Ação",
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
        "Não é possível excluir ações de um MASP encerrado.",
      );
    }

    const [
      result,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          DELETE FROM masp_actions
          WHERE id = ?
            AND masp_id = ?
        `,
        [
          actionId,
          maspId,
        ],
      );

    if (
      result.affectedRows < 1
    ) {
      throw new MaspApiError(
        404,
        "Ação não encontrada neste MASP.",
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
      "Erro ao excluir ação MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}
