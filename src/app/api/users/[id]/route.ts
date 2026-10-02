import { NextResponse } from "next/server";

import {
  executeQuery,
} from "@/lib/db";

import {
  isAnalystRole,
  isAssignableRole,
} from "@/lib/roles";

import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpdateUserBody {
  role?: unknown;
  active?: unknown;
}

function fail(
  status: number,
  message: string,
) {
  return NextResponse.json(
    {
      success: false,
      message,
    },
    {
      status,
    },
  );
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  const session = await getSession();

  if (!session) {
    return fail(401, "Sessão inválida.");
  }

  if (!isAnalystRole(session.role)) {
    return fail(403, "Acesso negado.");
  }

  const { id } = await params;

  const userId = Number(id);

  if (
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    return fail(400, "Usuário inválido.");
  }

  let body: UpdateUserBody;

  try {
    body =
      (await request.json()) as UpdateUserBody;
  } catch {
    return fail(
      400,
      "Requisição inválida.",
    );
  }

  const assignments: string[] = [];
  const values: (string | number)[] = [];

  if (body.role !== undefined) {
    if (!isAssignableRole(body.role)) {
      return fail(
        400,
        "Selecione uma função válida.",
      );
    }

    if (
      userId === session.userId &&
      body.role !== "MAINTENANCE"
    ) {
      return fail(
        400,
        "Você não pode remover o seu próprio acesso de Analista.",
      );
    }

    assignments.push("role = ?");
    values.push(body.role);
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return fail(
        400,
        "Status inválido.",
      );
    }

    if (
      userId === session.userId &&
      !body.active
    ) {
      return fail(
        400,
        "Você não pode desativar o seu próprio usuário.",
      );
    }

    assignments.push("active = ?");
    values.push(body.active ? 1 : 0);
  }

  if (assignments.length === 0) {
    return fail(
      400,
      "Nada para atualizar.",
    );
  }

  try {
    const result = await executeQuery(
      `
        UPDATE users
        SET ${assignments.join(", ")}
        WHERE id = ?
      `,
      [...values, userId],
    );

    if (result.affectedRows === 0) {
      return fail(
        404,
        "Usuário não encontrado.",
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "Erro ao atualizar usuário:",
      error,
    );

    return fail(
      500,
      "Não foi possível atualizar o usuário.",
    );
  }
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  const session = await getSession();

  if (!session) {
    return fail(401, "Sessão inválida.");
  }

  if (!isAnalystRole(session.role)) {
    return fail(403, "Acesso negado.");
  }

  const { id } = await params;

  const userId = Number(id);

  if (
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    return fail(400, "Usuário inválido.");
  }

  if (userId === session.userId) {
    return fail(
      400,
      "Você não pode remover o seu próprio usuário.",
    );
  }

  try {
    const result = await executeQuery(
      `
        DELETE FROM users
        WHERE id = ?
      `,
      [userId],
    );

    if (result.affectedRows === 0) {
      return fail(
        404,
        "Usuário não encontrado.",
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    if (
      (error as { code?: string }).code ===
      "ER_ROW_IS_REFERENCED_2"
    ) {
      return fail(
        409,
        "Este usuário possui registros vinculados e não pode ser removido. Desative-o.",
      );
    }

    console.error(
      "Erro ao remover usuário:",
      error,
    );

    return fail(
      500,
      "Não foi possível remover o usuário.",
    );
  }
}
