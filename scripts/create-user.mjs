import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const [
  ,
  ,
  name,
  email,
  password,
  role,
  unitCode,
] = process.argv;

if (
  !name ||
  !email ||
  !password ||
  !role ||
  !unitCode
) {
  console.error(`
Uso:

node --env-file=.env.local scripts/create-user.mjs "NOME" "EMAIL" "SENHA" "ROLE" "UNIDADE"

Exemplo:

node --env-file=.env.local scripts/create-user.mjs "João da Silva" "joao@coca.com" "SenhaForte@2026" "GESTOR" "BAAK"

ROLE: ANALISTA (acesso total) ou GESTOR (somente consulta).
`);

  process.exit(1);
}

/* Mesmo limite da API (src/lib/user-admin.ts): bcrypt só
   considera 72 bytes e o login recusa senhas maiores. */
const passwordBytes =
  Buffer.byteLength(
    password,
    "utf8",
  );

if (
  passwordBytes < 8 ||
  passwordBytes > 72
) {
  console.error(
    "A senha deve possuir entre 8 e 72 bytes (acentos contam em dobro).",
  );

  process.exit(1);
}

const allowedRoles = [
  "GESTOR",
  "ANALISTA",
  "MANAGER",
  "MAINTENANCE",
];

const roleInput =
  role
    .trim()
    .toUpperCase();

if (
  !allowedRoles.includes(
    roleInput,
  )
) {
  console.error(
    `Role inválida. Utilize: ${allowedRoles.join(", ")}`,
  );

  process.exit(1);
}

/* =========================================================
   ENV
========================================================= */

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
} = process.env;

if (
  !DB_HOST ||
  !DB_USER ||
  !DB_NAME
) {
  console.error(
    "Variáveis de banco não configuradas no .env.local.",
  );

  process.exit(1);
}

/* =========================================================
   MAIN
========================================================= */

let connection;

try {
  connection =
    await mysql.createConnection({
      host:
        DB_HOST,

      port:
        Number(
          DB_PORT ??
            3306,
        ),

      user:
        DB_USER,

      password:
        DB_PASSWORD,

      database:
        DB_NAME,
    });

  await connection.beginTransaction();

  /* =======================================================
     LOCALIZAR UNIDADE
  ======================================================= */

  const [
    unitRows,
  ] =
    await connection.execute(
      `
        SELECT
          id,
          code,
          name
        FROM units
        WHERE code = ?
          AND active = TRUE
        LIMIT 1
      `,
      [
        unitCode
          .trim()
          .toUpperCase(),
      ],
    );

  const unit =
    unitRows[0];

  if (!unit) {
    throw new Error(
      `Unidade "${unitCode}" não encontrada.`,
    );
  }

  /* =======================================================
     VERIFICAR E-MAIL
  ======================================================= */

  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  const [
    existingUsers,
  ] =
    await connection.execute(
      `
        SELECT
          id
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [
        normalizedEmail,
      ],
    );

  if (
    existingUsers.length >
    0
  ) {
    throw new Error(
      `Já existe um usuário com o e-mail "${normalizedEmail}".`,
    );
  }

  /* =======================================================
     GERAR HASH DA SENHA

     A senha em texto puro nunca será enviada ao banco.
  ======================================================= */

const passwordHash =
    await bcrypt.hash(
      password,
      12,
    );

  /* =======================================================
     CRIAR USUÁRIO
  ======================================================= */

  const [
    userResult,
  ] =
    await connection.execute(
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
        unit.id,
        name.trim(),
        normalizedEmail,
        passwordHash,
        ({ GESTOR: "MANAGER", ANALISTA: "MAINTENANCE" }[roleInput] ?? roleInput),
      ],
    );

  const userId =
    userResult.insertId;

  /* =======================================================
     VINCULAR À UNIDADE
  ======================================================= */

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
      userId,
      unit.id,
    ],
  );

  await connection.commit();

  console.log("");
  console.log(
    "Usuário criado com sucesso.",
  );
  console.log(
    `ID: ${userId}`,
  );
  console.log(
    `Nome: ${name.trim()}`,
  );
  console.log(
    `E-mail: ${normalizedEmail}`,
  );
  console.log(
    `Role: ${roleInput}`,
  );
  console.log(
    `Unidade: ${unit.code}`,
  );
  console.log(
    "Senha armazenada como hash bcrypt.",
  );
  console.log("");
} catch (error) {
  if (connection) {
    try {
      await connection.rollback();
    } catch {
      // Não sobrescreve o erro original.
    }
  }

  console.error("");
  console.error(
    "Erro ao criar usuário:",
  );

  console.error(
    error instanceof Error
      ? error.message
      : error,
  );

  console.error("");

  process.exitCode =
    1;
} finally {
  if (connection) {
    await connection.end();
  }
}
