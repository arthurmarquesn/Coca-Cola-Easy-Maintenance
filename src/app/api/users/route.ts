import bcrypt from "bcryptjs";

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
  getSession,
} from "@/lib/session";

import {
  getAuthorizedUnits,
} from "@/lib/unit-selection";

import {
  isAnalystRole,
} from "@/lib/roles";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


/* =========================================================
   TYPES
========================================================= */

type UserRole =
  | "MANAGER"
  | "MAINTENANCE";


interface UserRow
  extends RowDataPacket {
  id:
    number;

  name:
    string;

  email:
    string;

  role:
    UserRole;

  active:
    number | boolean;

  last_login_at:
    | string
    | Date
    | null;

  created_at:
    | string
    | Date;
}


interface UserUnitRow
  extends RowDataPacket {
  user_id:
    number;

  unit_id:
    number;

  unit_code:
    | string
    | null;

  unit_name:
    string;

  unit_city:
    | string
    | null;

  unit_state:
    | string
    | null;

  is_default:
    number | boolean;
}


interface ExistingUserRow
  extends RowDataPacket {
  id:
    number;
}


interface CreateUserBody {
  name?:
    unknown;

  email?:
    unknown;

  password?:
    unknown;

  role?:
    unknown;

  representativeUnitId?:
    unknown;
}


/* =========================================================
   HELPERS
========================================================= */

function isValidRole(
  value:
    unknown,
): value is UserRole {
  return (
    value ===
      "MANAGER" ||
    value ===
      "MAINTENANCE"
  );
}


function formatDateTime(
  value:
    | string
    | Date
    | null,
): string | null {
  if (
    value ===
    null
  ) {
    return null;
  }


  if (
    value instanceof
    Date
  ) {
    return value
      .toISOString();
  }


  return String(
    value,
  );
}


function isDuplicateEntryError(
  error:
    unknown,
): boolean {
  if (
    !error ||
    typeof error !==
      "object"
  ) {
    return false;
  }


  const candidate =
    error as {
      code?:
        unknown;

      errno?:
        unknown;
    };


  return (
    candidate.code ===
      "ER_DUP_ENTRY" ||
    candidate.errno ===
      1062
  );
}


/* =========================================================
   AUTH
========================================================= */

async function requireAdministrationAccess() {
  const session =
    await getSession();


  if (
    !session
  ) {
    return {
      error:
        NextResponse.json(
          {
            success:
              false,

            message:
              "Sessão inválida.",
          },
          {
            status:
              401,
          },
        ),
    };
  }


  /* Só o Analista administra usuários. O Gestor apenas
     consulta os dados, conforme lib/roles.ts. */
  if (
    !isAnalystRole(
      session.role,
    )
  ) {
    return {
      error:
        NextResponse.json(
          {
            success:
              false,

            message:
              "Você não possui permissão para administrar usuários.",
          },
          {
            status:
              403,
          },
        ),
    };
  }


  return {
    session,
  };
}


/* =========================================================
   GET /api/users
========================================================= */

export async function GET() {
  const authorization =
    await requireAdministrationAccess();


  if (
    "error" in
    authorization
  ) {
    return authorization
      .error;
  }


  const {
    session,
  } =
    authorization;


  const connection =
    await getConnection();


  try {
    /* =====================================================
       TODAS AS UNIDADES ATIVAS
    ===================================================== */

    const units =
      await getAuthorizedUnits(
        session.userId,
      );


    /* =====================================================
       USERS
    ===================================================== */

    const [
      users,
    ] =
      await connection.query<
        UserRow[]
      >(
        `
          SELECT
              id,

              name,

              email,

              role,

              active,

              last_login_at,

              created_at

          FROM
              users

          ORDER BY
              active DESC,

              name ASC,

              id ASC
        `,
      );


    /* =====================================================
       REPRESENTATIVE UNITS
    ===================================================== */

    const [
      memberships,
    ] =
      await connection.query<
        UserUnitRow[]
      >(
        `
          SELECT
              uu.user_id,

              un.id
                  AS unit_id,

              un.code
                  AS unit_code,

              un.name
                  AS unit_name,

              un.city
                  AS unit_city,

              un.state
                  AS unit_state,

              uu.is_default

          FROM
              user_units uu

          INNER JOIN
              units un
              ON un.id =
                 uu.unit_id

          WHERE
              un.active =
                  TRUE

          ORDER BY
              uu.user_id ASC,

              uu.is_default DESC,

              uu.created_at ASC
        `,
      );


    const responseUsers =
      users.map(
        (
          user,
        ) => {
          const membership =
            memberships.find(
              (
                item,
              ) =>
                Number(
                  item.user_id,
                ) ===
                Number(
                  user.id,
                ) &&
                Boolean(
                  item.is_default,
                ),
            ) ??
            memberships.find(
              (
                item,
              ) =>
                Number(
                  item.user_id,
                ) ===
                Number(
                  user.id,
                ),
            );


          return {
            id:
              Number(
                user.id,
              ),

            name:
              user.name,

            email:
              user.email,

            role:
              user.role,

            active:
              Boolean(
                user.active,
              ),

            lastLoginAt:
              formatDateTime(
                user.last_login_at,
              ),

            createdAt:
              formatDateTime(
                user.created_at,
              ),

            representativeUnit:
              membership
                ? {
                    id:
                      Number(
                        membership.unit_id,
                      ),

                    code:
                      membership.unit_code,

                    name:
                      membership.unit_name,

                    city:
                      membership.unit_city,

                    state:
                      membership.unit_state,
                  }
                : null,
          };
        },
      );


    return NextResponse.json({
      success:
        true,

      users:
        responseUsers,

      units:
        units.map(
          (
            unit,
          ) => ({
            id:
              unit.id,

            code:
              unit.code,

            name:
              unit.name,

            city:
              unit.city,

            state:
              unit.state,
          }),
        ),
    });
  } catch (
    error
  ) {
    console.error(
      "Erro ao carregar usuários:",
      error,
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível carregar os usuários.",
      },
      {
        status:
          500,
      },
    );
  } finally {
    connection.release();
  }
}


/* =========================================================
   POST /api/users
========================================================= */

export async function POST(
  request:
    NextRequest,
) {
  const authorization =
    await requireAdministrationAccess();


  if (
    "error" in
    authorization
  ) {
    return authorization
      .error;
  }


  const {
    session,
  } =
    authorization;


  let body:
    CreateUserBody;


  try {
    body =
      (await request.json()) as
        CreateUserBody;
  } catch {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Corpo da requisição inválido.",
      },
      {
        status:
          400,
      },
    );
  }


  /* =======================================================
     NORMALIZE
  ======================================================= */

  const name =
    typeof body.name ===
      "string"
      ? body.name
          .trim()
          .replace(
            /\s+/g,
            " ",
          )
      : "";


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


  const role =
    body.role;


  const representativeUnitId =
    Number(
      body.representativeUnitId,
    );


  /* =======================================================
     VALIDATION
  ======================================================= */

  if (
    name.length <
      2 ||
    name.length >
      150
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Informe um nome válido.",
      },
      {
        status:
          400,
      },
    );
  }


  if (
    !email ||
    email.length >
      191 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email,
    )
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Informe um e-mail válido.",
      },
      {
        status:
          400,
      },
    );
  }


  if (
    password.length <
      8 ||
    password.length >
      72
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "A senha deve possuir entre 8 e 72 caracteres.",
      },
      {
        status:
          400,
      },
    );
  }


  if (
    !isValidRole(
      role,
    )
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Perfil inválido.",
      },
      {
        status:
          400,
      },
    );
  }


  if (
    !Number.isInteger(
      representativeUnitId,
    ) ||
    representativeUnitId <=
      0
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Selecione a unidade representada.",
      },
      {
        status:
          400,
      },
    );
  }


  /* =======================================================
     UNIT EXISTS / ACTIVE
  ======================================================= */

  const activeUnits =
    await getAuthorizedUnits(
      session.userId,
    );


  const representativeUnit =
    activeUnits.find(
      (
        unit,
      ) =>
        unit.id ===
        representativeUnitId,
    );


  if (
    !representativeUnit
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "A unidade selecionada não está ativa.",
      },
      {
        status:
          400,
      },
    );
  }


  /* =======================================================
     HASH
  ======================================================= */

  const passwordHash =
    await bcrypt.hash(
      password,
      12,
    );


  const connection =
    await getConnection();


  try {
    await connection
      .beginTransaction();


    /* =====================================================
       DUPLICATE EMAIL
    ===================================================== */

    const [
      existingUsers,
    ] =
      await connection.query<
        ExistingUserRow[]
      >(
        `
          SELECT
              id

          FROM
              users

          WHERE
              email = ?

          LIMIT 1

          FOR UPDATE
        `,
        [
          email,
        ],
      );


    if (
      existingUsers.length >
      0
    ) {
      await connection
        .rollback();


      return NextResponse.json(
        {
          success:
            false,

          message:
            "Já existe um usuário cadastrado com este e-mail.",
        },
        {
          status:
            409,
        },
      );
    }


    /* =====================================================
       USER
    ===================================================== */

    const [
      result,
    ] =
      await connection.execute<
        ResultSetHeader
      >(
        `
          INSERT INTO
              users
          (
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
              TRUE
          )
        `,
        [
          name,

          email,

          passwordHash,

          role,
        ],
      );


    const newUserId =
      Number(
        result.insertId,
      );


    /* =====================================================
       REPRESENTATIVE UNIT

       Apenas a unidade principal precisa ficar em
       user_units.

       O acesso às demais unidades é global por regra
       de negócio.
    ===================================================== */

    await connection.execute<
      ResultSetHeader
    >(
      `
        INSERT INTO
            user_units
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
        newUserId,

        representativeUnitId,
      ],
    );


    await connection
      .commit();


    return NextResponse.json(
      {
        success:
          true,

        message:
          "Usuário cadastrado com sucesso.",

        user: {
          id:
            newUserId,

          name,

          email,

          role,

          active:
            true,

          representativeUnit: {
            id:
              representativeUnit.id,

            code:
              representativeUnit.code,

            name:
              representativeUnit.name,

            city:
              representativeUnit.city,

            state:
              representativeUnit.state,
          },
        },
      },
      {
        status:
          201,
      },
    );
  } catch (
    error
  ) {
    await connection
      .rollback();


    if (
      isDuplicateEntryError(
        error,
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Já existe um usuário cadastrado com este e-mail.",
        },
        {
          status:
            409,
        },
      );
    }


    console.error(
      "Erro ao cadastrar usuário:",
      error,
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível cadastrar o usuário.",
      },
      {
        status:
          500,
      },
    );
  } finally {
    connection.release();
  }
}