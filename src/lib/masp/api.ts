import {
  NextResponse,
} from "next/server";

import type {
  PoolConnection,
  RowDataPacket,
} from "mysql2/promise";

import {
  getSession,
} from "@/lib/session";

import {
  getUnitSelection,
} from "@/lib/unit-selection";

import type {
  MaspStatus,
} from "@/lib/masp/domain";


export class MaspApiError
  extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(
      message,
    );
  }
}

export interface MaspRequestContext {
  userId: number;
  defaultUnitId: number;
  selectedUnitIds: number[];
}

export interface AccessibleMaspRow
  extends RowDataPacket {
  id: number;
  unit_id: number;
  status: MaspStatus;
  equipment_id:
    | number
    | null;
  production_line_id:
    | number
    | null;
  problem_statement: string;
  recurrence_component_code:
    | string
    | null;
  recurrence_failure_mode:
    | string
    | null;
  recurrence_failure_origin:
    | "MANUTENCAO"
    | "OPERACAO"
    | null;
}

export async function requireMaspContext():
Promise<MaspRequestContext> {
  const session =
    await getSession();

  if (
    !session
  ) {
    throw new MaspApiError(
      401,
      "Sessão inválida.",
    );
  }

  const userId =
    Number(
      session.userId,
    );

  const defaultUnitId =
    Number(
      session.unitId,
    );

  if (
    !Number.isInteger(
      userId,
    ) ||
    userId <= 0 ||
    !Number.isInteger(
      defaultUnitId,
    ) ||
    defaultUnitId <= 0
  ) {
    throw new MaspApiError(
      401,
      "Sessão inválida.",
    );
  }

  const selection =
    await getUnitSelection({
      userId,
      defaultUnitId,
    });

  if (
    selection
      .selectedUnitIds
      .length ===
    0
  ) {
    throw new MaspApiError(
      403,
      "Nenhuma unidade autorizada está selecionada.",
    );
  }

  return {
    userId,
    defaultUnitId,
    selectedUnitIds:
      selection.selectedUnitIds,
  };
}

export function parseRouteId(
  value: string,
  label =
    "Identificador",
): number {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <= 0
  ) {
    throw new MaspApiError(
      400,
      `${label} inválido.`,
    );
  }

  return parsed;
}

export async function parseJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body =
      await request.json();

    if (
      !body ||
      typeof body !==
        "object" ||
      Array.isArray(
        body,
      )
    ) {
      throw new Error();
    }

    return body as
      Record<string, unknown>;
  } catch {
    throw new MaspApiError(
      400,
      "Corpo da requisição inválido.",
    );
  }
}

export async function requireAccessibleMasp(
  connection: PoolConnection,
  maspId: number,
  context: MaspRequestContext,
  forUpdate = false,
): Promise<AccessibleMaspRow> {
  const placeholders =
    context
      .selectedUnitIds
      .map(
        () =>
          "?",
      )
      .join(
        ", ",
      );

  const [
    rows,
  ] =
    await connection.query<
      AccessibleMaspRow[]
    >(
      `
        SELECT
            id,
            unit_id,
            status,
            equipment_id,
            production_line_id,
            problem_statement,
            recurrence_component_code,
            recurrence_failure_mode,
            recurrence_failure_origin
        FROM
            masp_analyses
        WHERE
            id = ?
            AND unit_id IN (
                ${placeholders}
            )
        LIMIT 1
        ${forUpdate
          ? "FOR UPDATE"
          : ""}
      `,
      [
        maspId,
        ...context.selectedUnitIds,
      ],
    );

  if (
    !rows[0]
  ) {
    throw new MaspApiError(
      404,
      "MASP não encontrado nas unidades selecionadas.",
    );
  }

  return rows[0];
}

export function requireSelectedUnit(
  unitId: number,
  context: MaspRequestContext,
): void {
  if (
    !context
      .selectedUnitIds
      .includes(
        unitId,
      )
  ) {
    throw new MaspApiError(
      403,
      "A unidade informada não está autorizada na seleção atual.",
    );
  }
}

export function maspErrorResponse(
  error: unknown,
  logMessage: string,
): NextResponse {
  if (
    error instanceof
      MaspApiError
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status:
          error.status,
      },
    );
  }

  console.error(
    logMessage,
    error,
  );

  return NextResponse.json(
    {
      success: false,
      message:
        "Não foi possível concluir a operação MASP.",
    },
    {
      status: 500,
    },
  );
}

