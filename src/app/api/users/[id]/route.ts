import { NextResponse } from "next/server";

import type { PoolConnection } from "mysql2/promise";

import {
  getConnection,
} from "@/lib/db";

import {
  isAnalystRole,
  isAssignableRole,
} from "@/lib/roles";

import { getSession } from "@/lib/session";

import { getAuthorizedUnits } from "@/lib/unit-selection";

import {
  applyUnitLinks,
  findUnitLeftWithoutAnalyst,
  lockAdministrableTarget,
  lockUserUnitLinks,
  parseUnitIdList,
  planUnitLinks,
} from "@/lib/user-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpdateUserBody {
  role?: unknown;
  active?: unknown;
  /* Unidade principal (users.unit_id). */
  unitId?: unknown;
  /* Unidades de acesso além da principal (só Analista). */
  extraUnitIds?: unknown;
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

async function rollbackQuietly(
  connection: PoolConnection,
) {
  try {
    await connection.rollback();
  } catch {
    // Não sobrescreve o erro original.
  }
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid request body");
    }
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

  let unitId: number | undefined;

  if (body.unitId !== undefined) {
    if (
      typeof body.unitId !== "number" ||
      !Number.isInteger(body.unitId) ||
      body.unitId <= 0
    ) {
      return fail(
        400,
        "Selecione uma unidade válida.",
      );
    }

    unitId = body.unitId;
  }

  let extraUnitIds: number[] | undefined;

  if (body.extraUnitIds !== undefined) {
    const parsed = parseUnitIdList(body.extraUnitIds);

    if (!parsed) {
      return fail(
        400,
        "Unidades de acesso inválidas.",
      );
    }

    extraUnitIds = parsed;
  }

  if (
    assignments.length === 0 &&
    unitId === undefined &&
    extraUnitIds === undefined
  ) {
    return fail(
      400,
      "Nada para atualizar.",
    );
  }

  const changesUnits =
    unitId !== undefined ||
    extraUnitIds !== undefined ||
    body.role === "MANAGER";

  const actorUnitIds = changesUnits
    ? (await getAuthorizedUnits(session.userId)).map(
        (unit) => unit.id,
      )
    : [];

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    const target = await lockAdministrableTarget(
      connection,
      session.userId,
      userId,
    );

    if (!target.ok) {
      await connection.rollback();
      return fail(target.status, target.message);
    }

    const losesAnalystAccess =
      target.active &&
      target.role === "MAINTENANCE" &&
      (
        (body.role !== undefined && body.role !== "MAINTENANCE") ||
        body.active === false
      );

    if (losesAnalystAccess) {
      const orphanUnit = await findUnitLeftWithoutAnalyst(
        connection,
        userId,
      );

      if (orphanUnit) {
        await connection.rollback();
        return fail(
          409,
          `A unidade ${orphanUnit} ficaria sem nenhum Analista ativo.`,
        );
      }
    }

    if (changesUnits) {
      const currentUnitIds = await lockUserUnitLinks(
        connection,
        userId,
      );

      const role =
        typeof body.role === "string"
          ? body.role
          : target.role;

      const plan = planUnitLinks({
        role,
        primaryUnitId: unitId ?? target.unitId,
        extraUnitIds,
        currentUnitIds,
        currentPrimaryUnitId: target.unitId,
        actorUnitIds,
      });

      if (!plan.ok) {
        await connection.rollback();
        return fail(plan.status, plan.message);
      }

      /* Analista que continua ativo mas perde vínculos: cada
         unidade removida precisa manter outro Analista. */
      const removedUnitIds = currentUnitIds.filter(
        (currentUnitId) => !plan.unitIds.includes(currentUnitId),
      );

      if (
        !losesAnalystAccess &&
        target.active &&
        target.role === "MAINTENANCE"
      ) {
        const orphanUnit = await findUnitLeftWithoutAnalyst(
          connection,
          userId,
          removedUnitIds,
        );

        if (orphanUnit) {
          await connection.rollback();
          return fail(
            409,
            `A unidade ${orphanUnit} ficaria sem nenhum Analista ativo.`,
          );
        }
      }

      await applyUnitLinks(connection, userId, plan);
    }

    if (assignments.length > 0) {
      await connection.execute(
        `
          UPDATE users
          SET ${assignments.join(", ")}
          WHERE id = ?
        `,
        [...values, userId],
      );
    }

    await connection.commit();

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    await rollbackQuietly(connection);

    console.error(
      "Erro ao atualizar usuário:",
      error,
    );

    return fail(
      500,
      "Não foi possível atualizar o usuário.",
    );
  } finally {
    connection.release();
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

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    const target = await lockAdministrableTarget(
      connection,
      session.userId,
      userId,
    );

    if (!target.ok) {
      await connection.rollback();
      return fail(target.status, target.message);
    }

    if (
      target.active &&
      target.role === "MAINTENANCE"
    ) {
      const orphanUnit = await findUnitLeftWithoutAnalyst(
        connection,
        userId,
      );

      if (orphanUnit) {
        await connection.rollback();
        return fail(
          409,
          `A unidade ${orphanUnit} ficaria sem nenhum Analista ativo.`,
        );
      }
    }

    await connection.execute(
      `
        DELETE FROM users
        WHERE id = ?
      `,
      [userId],
    );

    await connection.commit();

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    await rollbackQuietly(connection);

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
  } finally {
    connection.release();
  }
}
