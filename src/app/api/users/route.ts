import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import { getConnection } from "@/lib/db";

import { listUsersAndUnits } from "@/lib/users";

import {
  isAdminRole,
  isAssignableRole,
} from "@/lib/roles";

import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;

interface CreateUserBody {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
  unitId?: unknown;
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

export async function GET() {
  const session = await getSession();

  if (!session) {
    return fail(401, "Sessão inválida.");
  }

  if (!isAdminRole(session.role)) {
    return fail(403, "Acesso negado.");
  }

  try {
    const { users, units } =
      await listUsersAndUnits();

    return NextResponse.json({
      success: true,
      users,
      units,
    });
  } catch (error) {
    console.error(
      "Erro ao listar usuários:",
      error,
    );

    return fail(
      500,
      "Não foi possível listar os usuários.",
    );
  }
}

export async function POST(
  request: Request,
) {
  const session = await getSession();

  if (!session) {
    return fail(401, "Sessão inválida.");
  }

  if (!isAdminRole(session.role)) {
    return fail(403, "Acesso negado.");
  }

  let body: CreateUserBody;

  try {
    body =
      (await request.json()) as CreateUserBody;
  } catch {
    return fail(
      400,
      "Requisição inválida.",
    );
  }

  const name =
    typeof body.name === "string"
      ? body.name.trim()
      : "";

  const email =
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";

  const password =
    typeof body.password === "string"
      ? body.password
      : "";

  const unitId = Number(body.unitId);

  if (!name || name.length > 150) {
    return fail(
      400,
      "Informe um nome válido (até 150 caracteres).",
    );
  }

  if (
    !email ||
    email.length > 191 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email,
    )
  ) {
    return fail(
      400,
      "Informe um e-mail válido.",
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return fail(
      400,
      `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }

  if (!isAssignableRole(body.role)) {
    return fail(
      400,
      "Selecione uma função válida.",
    );
  }

  if (
    !Number.isInteger(unitId) ||
    unitId <= 0
  ) {
    return fail(
      400,
      "Selecione uma unidade.",
    );
  }

  const connection =
    await getConnection();

  try {
    await connection.beginTransaction();

    const [units] =
      await connection.execute<
        RowDataPacket[]
      >(
        `
          SELECT id
          FROM units
          WHERE id = ?
            AND active = TRUE
          LIMIT 1
        `,
        [unitId],
      );

    if (units.length === 0) {
      await connection.rollback();

      return fail(
        400,
        "Unidade não encontrada.",
      );
    }

    const [existing] =
      await connection.execute<
        RowDataPacket[]
      >(
        `
          SELECT id
          FROM users
          WHERE email = ?
          LIMIT 1
        `,
        [email],
      );

    if (existing.length > 0) {
      await connection.rollback();

      return fail(
        409,
        "Já existe um usuário com esse e-mail.",
      );
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    const [result] =
      await connection.execute<ResultSetHeader>(
        `
          INSERT INTO users
          (
            unit_id,
            name,
            email,
            password_hash,
            role,
            active
          )
          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            ?,
            TRUE
          )
        `,
        [
          unitId,
          name,
          email,
          passwordHash,
          body.role,
        ],
      );

    await connection.execute(
      `
        INSERT INTO user_units
        (
          user_id,
          unit_id,
          is_default
        )
        VALUES
        (
          ?,
          ?,
          TRUE
        )
      `,
      [
        result.insertId,
        unitId,
      ],
    );

    await connection.commit();

    return NextResponse.json(
      {
        success: true,
        id: Number(result.insertId),
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Sem transação aberta.
    }

    console.error(
      "Erro ao cadastrar usuário:",
      error,
    );

    return fail(
      500,
      "Não foi possível cadastrar o usuário.",
    );
  } finally {
    connection.release();
  }
}
