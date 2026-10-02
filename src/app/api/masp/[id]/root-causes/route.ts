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
  positiveIntegerOrNull,
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
  }>;
}

interface CountRow
  extends RowDataPacket {
  total:
    | number
    | string;
}

async function requireLinkedSource(
  connection: Awaited<
    ReturnType<
      typeof getConnection
    >
  >,
  maspId: number,
  hypothesisId: number | null,
  fiveWhyId: number | null,
) {
  if (
    hypothesisId
  ) {
    const [
      rows,
    ] =
      await connection.query<
        CountRow[]
      >(
        `
          SELECT COUNT(*) AS total
          FROM masp_hypotheses
          WHERE id = ?
            AND masp_id = ?
        `,
        [
          hypothesisId,
          maspId,
        ],
      );

    if (
      Number(
        rows[0]?.total ?? 0,
      ) !== 1
    ) {
      throw new MaspApiError(
        400,
        "A hipótese informada não pertence a este MASP.",
      );
    }
  }

  if (
    fiveWhyId
  ) {
    const [
      rows,
    ] =
      await connection.query<
        CountRow[]
      >(
        `
          SELECT COUNT(*) AS total
          FROM masp_five_whys
          WHERE id = ?
            AND masp_id = ?
        `,
        [
          fiveWhyId,
          maspId,
        ],
      );

    if (
      Number(
        rows[0]?.total ?? 0,
      ) !== 1
    ) {
      throw new MaspApiError(
        400,
        "O porquê informado não pertence a este MASP.",
      );
    }
  }
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

    const hypothesisId =
      positiveIntegerOrNull(
        body.hypothesisId,
      );
    const fiveWhyId =
      positiveIntegerOrNull(
        body.fiveWhyId,
      );
    const evidenceSummary =
      cleanText(
        body.evidenceSummary,
        10000,
      ) || null;
    const status =
      isOneOf(
        body.status,
        ROOT_CAUSE_STATUSES,
      )
        ? body.status
        : "PROPOSED";

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
        "Não é possível incluir causas em um MASP encerrado.",
      );
    }

    await requireLinkedSource(
      connection,
      maspId,
      hypothesisId,
      fiveWhyId,
    );

    if (
      status ===
        "CONFIRMED" &&
      !evidenceSummary
    ) {
      const [
        evidence,
      ] =
        await connection.query<
          CountRow[]
        >(
          `
            SELECT COUNT(*) AS total
            FROM masp_evidence
            WHERE masp_id = ?
          `,
          [
            maspId,
          ],
        );

      if (
        Number(
          evidence[0]
            ?.total ?? 0,
        ) < 1
      ) {
        throw new MaspApiError(
          400,
          "Adicione uma evidência ou descreva o resumo da evidência antes de confirmar a causa raiz.",
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
          INSERT INTO masp_root_causes (
              masp_id,
              hypothesis_id,
              five_why_id,
              description,
              status,
              evidence_summary,
              confirmed_by,
              confirmed_at
          ) VALUES (
              ?, ?, ?, ?, ?, ?,
              ${status === "CONFIRMED" ? "?" : "NULL"},
              ${status === "CONFIRMED" ? "NOW()" : "NULL"}
          )
        `,
        status ===
          "CONFIRMED"
          ? [
              maspId,
              hypothesisId,
              fiveWhyId,
              description,
              status,
              evidenceSummary,
              context.userId,
            ]
          : [
              maspId,
              hypothesisId,
              fiveWhyId,
              description,
              status,
              evidenceSummary,
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
      "Erro ao criar causa raiz MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}

