import bcrypt from "bcryptjs";
import { clearLoginAttempts, consumeLoginAttempt, getTrustedClientIp } from "@/lib/login-throttle";
import { normalizeSessionRole } from "@/lib/roles";

import {
  NextResponse,
} from "next/server";

import type {
  RowDataPacket,
} from "mysql2";

import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";

import {
  executeQuery,
  executeRows,
} from "@/lib/db";

import {
  serializeUnitSelection,
  UNIT_SELECTION_COOKIE_NAME,
} from "@/lib/unit-selection";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* Hash válido de uma senha descartável: usuário inexistente
   leva o mesmo tempo de bcrypt que um usuário real. */
const DUMMY_PASSWORD_HASH =
  bcrypt.hashSync("senha-inexistente", 12);


/* =========================================================
   TIPOS
========================================================= */

interface UserRow
  extends RowDataPacket {
  id: number;

  name: string;

  email: string;

  password_hash:
    string;

  role: string;

  active: number;
}


interface UserUnitRow
  extends RowDataPacket {
  unit_id: number;

  unit_code: string;

  unit_name: string;

  unit_active: number;

  is_default: number;
}


interface LoginBody {
  email?: string;

  password?: string;

  remember?: boolean;
}


/* =========================================================
   POST /api/auth/login
========================================================= */

export async function POST(
  request:
    Request,
) {
  try {
    /* =====================================================
       BODY
    ===================================================== */

    let body: LoginBody;
    try {
      const parsed: unknown = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid request body");
      }
      body = parsed as LoginBody;
    } catch {
      return NextResponse.json(
        { success: false, message: "Corpo da requisição inválido." },
        { status: 400 },
      );
    }

    const email =
      typeof body.email ===
      "string"
        ? body.email
            .trim()
            .toLowerCase()
        : "";

    const password =
      typeof body.password ===
      "string"
        ? body.password
        : "";

    const remember =
      body.remember ===
      true;


    /* =====================================================
       VALIDAÇÃO
    ===================================================== */

    if (
      !email ||
      !password || email.length > 191 || Buffer.byteLength(password, "utf8") > 72
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Informe e-mail e senha.",
        },
        {
          status:
            400,
        },
      );
    }


    /* =====================================================
       USUÁRIO
    ===================================================== */

    const retryAfter = await consumeLoginAttempt(email, getTrustedClientIp(request.headers));
    if (retryAfter) {
      return NextResponse.json({ success: false, message: "Muitas tentativas. Aguarde antes de tentar novamente." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } });
    }

    const users =
      await executeRows<
        UserRow[]
      >(
        `
          SELECT
              id,

              name,

              email,

              password_hash,

              role,

              active

          FROM
              users

          WHERE
              email = ?

          LIMIT 1
        `,
        [
          email,
        ],
      );

    const user =
      users[0];


    if (
      !user ||
      !Boolean(
        user.active,
      )
    ) {
      await bcrypt.compare(
        password,
        DUMMY_PASSWORD_HASH,
      );

      return NextResponse.json(
        {
          success:
            false,

          message:
            "E-mail ou senha inválidos.",
        },
        {
          status:
            401,
        },
      );
    }


    /* =====================================================
       SENHA
    ===================================================== */

    const passwordMatches =
      await bcrypt.compare(
        password,
        user.password_hash,
      );

    if (
      !passwordMatches
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "E-mail ou senha inválidos.",
        },
        {
          status:
            401,
        },
      );
    }


    const role =
      normalizeSessionRole(
        user.role,
      );

    if (
      !role
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Seu usuário não possui um perfil de acesso válido.",
        },
        {
          status:
            403,
        },
      );
    }

    await clearLoginAttempts(
      email,
    );


    /* =====================================================
       UNIDADE PADRÃO

       session.unitId continua representando
       uma única unidade operacional.
    ===================================================== */

    const userUnits =
      await executeRows<
        UserUnitRow[]
      >(
        `
          SELECT
              un.id
                  AS unit_id,

              un.code
                  AS unit_code,

              un.name
                  AS unit_name,

              un.active
                  AS unit_active,

              uu.is_default

          FROM
              user_units uu

          INNER JOIN
              units un
              ON un.id =
                 uu.unit_id

          WHERE
              uu.user_id = ?

              AND un.active =
                  TRUE

          ORDER BY
              uu.is_default DESC,

              uu.created_at ASC,

              un.id ASC

          LIMIT 1
        `,
        [
          user.id,
        ],
      );

    const userUnit =
      userUnits[0];


    if (
      !userUnit
    ) {
      console.error(
        `Usuário ${user.id} não possui unidade ativa vinculada.`,
      );

      return NextResponse.json(
        {
          success:
            false,

          message:
            "Seu usuário não possui uma unidade ativa vinculada.",
        },
        {
          status:
            403,
        },
      );
    }


    /* =====================================================
       TOKEN
    ===================================================== */

    const token =
      await createSessionToken({
        userId:
          user.id,

        unitId:
          userUnit
            .unit_id,

        name:
          user.name,

        email:
          user.email,

        role,
      });


    /* =====================================================
       LAST LOGIN
    ===================================================== */

    try {
      await executeQuery(
        `
          UPDATE
              users

          SET
              last_login_at =
                  NOW()

          WHERE
              id = ?
        `,
        [
          user.id,
        ],
      );
    } catch (
      error
    ) {
      console.error(
        "Não foi possível atualizar last_login_at:",
        error,
      );
    }


    /* =====================================================
       RESPONSE
    ===================================================== */

    const response =
      NextResponse.json(
        {
          success:
            true,

          user: {
            id:
              user.id,

            name:
              user.name,

            email:
              user.email,

            role,
          },

          unit: {
            id:
              userUnit
                .unit_id,

            code:
              userUnit
                .unit_code,

            name:
              userUnit
                .unit_name,
          },

          /*
           * Seleção inicial.
           * O usuário poderá expandi-la
           * depois pela checklist.
           */
          selectedUnitIds: [
            userUnit
              .unit_id,
          ],
        },
        {
          status:
            200,
        },
      );


    /* =====================================================
       AUTH COOKIE
    ===================================================== */

    response.cookies.set({
      name:
        SESSION_COOKIE_NAME,

      value:
        token,

      httpOnly:
        true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite:
        "lax",

      path:
        "/",

      maxAge:
        remember
          ? SESSION_DURATION_SECONDS
          : undefined,
    });


    /* =====================================================
       UNIT FILTER COOKIE
    ===================================================== */

    response.cookies.set({
      name:
        UNIT_SELECTION_COOKIE_NAME,

      value:
        serializeUnitSelection(
          [
            userUnit
              .unit_id,
          ],
        ),

      httpOnly:
        true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite:
        "lax",

      path:
        "/",

      maxAge:
        remember
          ? SESSION_DURATION_SECONDS
          : undefined,
    });


    return response;
  } catch (
    error
  ) {
    console.error(
      "==========================================",
    );

    console.error(
      "ERRO DURANTE LOGIN",
    );

    console.error(
      "==========================================",
    );

    console.error(
      error,
    );

    console.error(
      "==========================================",
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível realizar o login.",
      },
      {
        status:
          500,
      },
    );
  }
}
