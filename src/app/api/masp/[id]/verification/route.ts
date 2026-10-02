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
  nullableDate,
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
  calculateVerificationMetrics,
} from "@/lib/masp/service";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface VerificationRow
  extends RowDataPacket {
  id: number;
  baseline_start:
    | Date
    | string
    | null;
  baseline_end:
    | Date
    | string
    | null;
  verification_start:
    | Date
    | string;
  verification_end:
    | Date
    | string
    | null;
  event_count_before:
    | number
    | null;
  event_count_after:
    | number
    | null;
  downtime_before_minutes:
    | number
    | string
    | null;
  downtime_after_minutes:
    | number
    | string
    | null;
  recurrence_detected:
    | number
    | boolean;
  notes:
    | string
    | null;
  verified_by: number;
  verified_by_name: string;
  verified_at:
    | Date
    | string;
}

export async function GET(
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
    const {
      id,
    } =
      await routeContext.params;
    const maspId =
      parseRouteId(
        id,
        "MASP",
      );

    connection =
      await getConnection();
    await requireAccessibleMasp(
      connection,
      maspId,
      context,
    );

    const [
      rows,
    ] =
      await connection.query<
        VerificationRow[]
      >(
        `
          SELECT
              mv.*,
              u.name AS verified_by_name
          FROM masp_verifications mv
          INNER JOIN users u
              ON u.id = mv.verified_by
          WHERE mv.masp_id = ?
          ORDER BY
              mv.verified_at DESC,
              mv.id DESC
        `,
        [
          maspId,
        ],
      );

    return NextResponse.json({
      success: true,
      items:
        rows.map(
          (
            row,
          ) => ({
            ...row,
            recurrence_detected:
              Boolean(
                row
                  .recurrence_detected,
              ),
          }),
        ),
    });
  } catch (
    error
  ) {
    return maspErrorResponse(
      error,
      "Erro ao carregar verificações MASP:",
    );
  } finally {
    connection
      ?.release();
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

    const baselineStart =
      nullableDate(
        body.baselineStart,
      );
    const baselineEnd =
      nullableDate(
        body.baselineEnd,
      );
    const verificationStart =
      nullableDate(
        body.verificationStart,
      );
    const verificationEnd =
      nullableDate(
        body.verificationEnd,
      );

    if (
      !verificationStart
    ) {
      throw new MaspApiError(
        400,
        "A data inicial da verificação é obrigatória.",
      );
    }

    if (
      body.baselineStart &&
      !baselineStart ||
      body.baselineEnd &&
      !baselineEnd ||
      body.verificationEnd &&
      !verificationEnd
    ) {
      throw new MaspApiError(
        400,
        "Uma ou mais datas de verificação são inválidas.",
      );
    }

    if (
      baselineStart &&
      baselineEnd &&
      baselineStart >
        baselineEnd ||
      verificationEnd &&
      verificationStart >
        verificationEnd
    ) {
      throw new MaspApiError(
        400,
        "A data inicial não pode ser posterior à data final.",
      );
    }

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
        "Não é possível incluir verificações em um MASP encerrado.",
      );
    }

    const metrics =
      await calculateVerificationMetrics(
        connection,
        masp,
        {
          baselineStart,
          baselineEnd,
          verificationStart,
          verificationEnd,
        },
      );

    const [
      result,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          INSERT INTO masp_verifications (
              masp_id,
              baseline_start,
              baseline_end,
              verification_start,
              verification_end,
              event_count_before,
              event_count_after,
              downtime_before_minutes,
              downtime_after_minutes,
              recurrence_detected,
              notes,
              verified_by,
              verified_at
          ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()
          )
        `,
        [
          maspId,
          baselineStart,
          baselineEnd,
          verificationStart,
          verificationEnd,
          metrics.before
            .eventCount,
          metrics.after
            .eventCount,
          metrics.before
            .downtimeMinutes,
          metrics.after
            .downtimeMinutes,
          metrics.recurrenceDetected,
          cleanText(
            body.notes,
            10000,
          ) || null,
          context.userId,
        ],
      );

    await connection
      .commit();

    return NextResponse.json(
      {
        success: true,
        id:
          Number(
            result.insertId,
          ),
        ...metrics,
      },
      {
        status: 201,
      },
    );
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
      "Erro ao registrar verificação MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}
