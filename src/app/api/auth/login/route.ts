import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";

import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";

import {
  executeQuery,
  executeRows,
} from "@/lib/db";

export const runtime = "nodejs";

interface UserRow extends RowDataPacket {
  id: number;
  unit_id: number;
  name: string;
  email: string;
  password_hash: string;
  role: string;
  active: number;
}

interface LoginBody {
  email?: string;
  password?: string;
  remember?: boolean;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (!email || !password) {
      return NextResponse.json(
        {
          success: false,
          message: "Informe e-mail e senha.",
        },
        {
          status: 400,
        },
      );
    }

    const users = await executeRows<UserRow[]>(
      `
        SELECT
          id,
          unit_id,
          name,
          email,
          password_hash,
          role,
          active
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [email],
    );

    const user = users[0];

    /*
     * Utilizamos a mesma mensagem para:
     * - usuário inexistente
     * - senha incorreta
     *
     * Isso evita revelar quais e-mails existem
     * no sistema.
     */
    if (!user || !user.active) {
      return NextResponse.json(
        {
          success: false,
          message: "E-mail ou senha inválidos.",
        },
        {
          status: 401,
        },
      );
    }

    const passwordMatches =
      await bcrypt.compare(
        password,
        user.password_hash,
      );

    if (!passwordMatches) {
      return NextResponse.json(
        {
          success: false,
          message: "E-mail ou senha inválidos.",
        },
        {
          status: 401,
        },
      );
    }

    const token = await createSessionToken({
      userId: user.id,
      unitId: user.unit_id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    await executeQuery(
      `
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = ?
      `,
      [user.id],
    );

    const response = NextResponse.json(
      {
        success: true,

        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      {
        status: 200,
      },
    );

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,

      httpOnly: true,

      secure:
        process.env.NODE_ENV === "production",

      sameSite: "lax",

      path: "/",

      /*
       * Checkbox "Manter conectado":
       *
       * marcado:
       * cookie permanece após fechar navegador.
       *
       * desmarcado:
       * session cookie.
       */
      maxAge: body.remember
        ? SESSION_DURATION_SECONDS
        : undefined,
    });

    return response;
  } catch (error) {
    console.error("Erro durante login:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          "Não foi possível realizar o login.",
      },
      {
        status: 500,
      },
    );
  }
}