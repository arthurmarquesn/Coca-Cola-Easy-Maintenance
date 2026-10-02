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
  isOneOf,
  ROOT_CAUSE_STATUSES,
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
    rootCauseId: string;
  }>;
}

interface CauseRow
  extends RowDataPacket {
  evidence_summary:
    | string
    | null;
  evidence_count:
    | number
    | string;
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
    const rootCauseId =
      parseRouteId(
        params.rootCauseId,
        "Causa raiz",
      );
    const body =
      await parseJsonBody(
        request,
      );

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
        "Não é possível alterar causas de um MASP encerrado.",
      );
    }

    const [
      causeRows,
    ] =
      await connection.query<
        CauseRow[]
      >(
        `
          SELECT
              mrc.evidence_summary,
              (
                  SELECT COUNT(*)
                  FROM masp_evidence me
                  WHERE me.masp_id = mrc.masp_id
              ) AS evidence_count
          FROM masp_root_causes mrc
          WHERE mrc.id = ?
            AND mrc.masp_id = ?
          LIMIT 1
          FOR UPDATE
        `,
        [
          rootCauseId,
          maspId,
        ],
      );

    if (
      !causeRows[0]
    ) {
      throw new MaspApiError(
        404,
        "Causa raiz não encontrada neste MASP.",
      );
    }

    const assignments:
      string[] = [];
    const values:
      Array<string | null> = [];

    if (
      body.description !==
      undefined
    ) {
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
          "A descrição da causa raiz é obrigatória.",
        );
      }

      assignments.push(
        "description = ?",
      );
      values.push(
        description,
      );
    }

    const requestedEvidenceSummary =
      body.evidenceSummary !==
      undefined
        ? cleanText(
            body.evidenceSummary,
            10000,
          ) || null
        : causeRows[0]
            .evidence_summary;

    if (
      body.evidenceSummary !==
      undefined
    ) {
      assignments.push(
        "evidence_summary = ?",
      );
      values.push(
        requestedEvidenceSummary,
      );
    }

    if (
      body.status !==
      undefined
    ) {
      if (
        !isOneOf(
          body.status,
          ROOT_CAUSE_STATUSES,
        )
      ) {
        throw new MaspApiError(
          400,
          "Status da causa raiz inválido.",
        );
      }

      if (
        body.status ===
          "CONFIRMED" &&
        !requestedEvidenceSummary &&
        Number(
          causeRows[0]
            .evidence_count,
        ) < 1
      ) {
        throw new MaspApiError(
          400,
          "Adicione uma evidência ou descreva o resumo da evidência antes de confirmar a causa raiz.",
        );
      }

      assignments.push(
        "status = ?",
      );
      values.push(
        body.status,
      );

      if (
        body.status ===
        "CONFIRMED"
      ) {
        assignments.push(
          "confirmed_by = ?",
          "confirmed_at = NOW()",
        );
        values.push(
          String(
            context.userId,
          ),
        );
      } else {
        assignments.push(
          "confirmed_by = NULL",
          "confirmed_at = NULL",
        );
      }
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
          UPDATE masp_root_causes
          SET ${assignments.join(", ")}
          WHERE id = ?
            AND masp_id = ?
        `,
        [
          ...values,
          rootCauseId,
          maspId,
        ],
      );

    if (
      result.affectedRows < 1
    ) {
      throw new MaspApiError(
        404,
        "Causa raiz não encontrada neste MASP.",
      );
    }

    await connection
      .commit();

    return NextResponse.json({
      success: true,
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
      "Erro ao atualizar causa raiz MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}

