import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

/* =========================================================
   USO

   Exemplo:

   node --env-file=.env.local scripts/create-user.mjs \
   "Arthur Marques" \
   "arthur@empresa.com" \
   "SenhaForte@123" \
   "GESTOR" \
   "BAAK"
========================================================= */

const [
  ,
  ,
  name,
  email,
  password,
  roleArgument,
  unitCodeArgument,
] = process.argv;

/* =========================================================
   VALIDAÇÃO DOS ARGUMENTOS
========================================================= */

if (
  !name ||
  !email ||
  !password
) {
  console.error("");
  console.error("Parâmetros obrigatórios ausentes.");
  console.error("");

  console.error(
    'Uso: node --env-file=.env.local scripts/create-user.mjs "Nome" "email@empresa.com" "Senha" "GESTOR" "BAAK"',
  );

  console.error("");

  process.exit(1);
}

/* =========================================================
   SENHA
========================================================= */

if (password.length < 12) {
  console.error("");
  console.error(
    "A senha deve possuir pelo menos 12 caracteres.",
  );
  console.error("");

  process.exit(1);
}

/* =========================================================
   PERFIL
========================================================= */

const role =
  (roleArgument ?? "ANALISTA")
    .trim()
    .toUpperCase();

const allowedRoles = [
  "ANALISTA",
  "GESTOR",
];

if (!allowedRoles.includes(role)) {
  console.error("");
  console.error(
    "Perfil inválido. Utilize ANALISTA ou GESTOR.",
  );
  console.error("");

  process.exit(1);
}

/* =========================================================
   UNIDADE
========================================================= */

const unitCode =
  (unitCodeArgument ?? "BAAK")
    .trim()
    .toUpperCase();

/* =========================================================
   VARIÁVEIS DE AMBIENTE
========================================================= */

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
} = process.env;

if (!DB_HOST) {
  console.error(
    "A variável DB_HOST não foi definida.",
  );

  process.exit(1);
}

if (!DB_USER) {
  console.error(
    "A variável DB_USER não foi definida.",
  );

  process.exit(1);
}

if (!DB_NAME) {
  console.error(
    "A variável DB_NAME não foi definida.",
  );

  process.exit(1);
}

/* =========================================================
   CONEXÃO
========================================================= */

const connection =
  await mysql.createConnection({
    host: DB_HOST,

    port: Number(
      DB_PORT ?? 3306,
    ),

    user: DB_USER,

    password:
      DB_PASSWORD ?? "",

    database: DB_NAME,

    charset: "utf8mb4",

    timezone: "Z",
  });

try {
  /* =======================================================
     TRANSAÇÃO
  ======================================================= */

  await connection.beginTransaction();

  /* =======================================================
     NORMALIZAÇÃO
  ======================================================= */

  const normalizedName =
    name.trim();

  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  /* =======================================================
     VERIFICA UNIDADE
  ======================================================= */

  const [units] =
    await connection.execute(
      `
        SELECT
          id,
          code,
          name,
          active
        FROM units
        WHERE code = ?
        LIMIT 1
      `,
      [
        unitCode,
      ],
    );

  if (
    !Array.isArray(units) ||
    units.length === 0
  ) {
    throw new Error(
      `A unidade ${unitCode} não foi encontrada.`,
    );
  }

  const unit = units[0];

  if (!unit.active) {
    throw new Error(
      `A unidade ${unitCode} está inativa.`,
    );
  }

  /* =======================================================
     VERIFICA E-MAIL
  ======================================================= */

  const [existingUsers] =
    await connection.execute(
      `
        SELECT
          id,
          email
        FROM users
        WHERE email = ?
        LIMIT 1
      `,
      [
        normalizedEmail,
      ],
    );

  if (
    Array.isArray(existingUsers) &&
    existingUsers.length > 0
  ) {
    throw new Error(
      "Já existe um usuário cadastrado com esse e-mail.",
    );
  }

  /* =======================================================
     HASH DA SENHA
  ======================================================= */

  const passwordHash =
    await bcrypt.hash(
      password,
      12,
    );

  /* =======================================================
     CRIA USUÁRIO
  ======================================================= */

  const [userResult] =
    await connection.execute(
      `
        INSERT INTO users (
          name,
          email,
          password_hash,
          role,
          active
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          TRUE
        )
      `,
      [
        normalizedName,
        normalizedEmail,
        passwordHash,
        role,
      ],
    );

  const userId =
    userResult.insertId;

  /* =======================================================
     VINCULA USUÁRIO À UNIDADE
  ======================================================= */

  await connection.execute(
    `
      INSERT INTO user_units (
        user_id,
        unit_id,
        is_default
      )
      VALUES (
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

  /* =======================================================
     COMMIT
  ======================================================= */

  await connection.commit();

  /* =======================================================
     SUCESSO
  ======================================================= */

  console.log("");
  console.log(
    "==========================================",
  );

  console.log(
    "USUÁRIO CRIADO COM SUCESSO",
  );

  console.log(
    "==========================================",
  );

  console.log(
    `ID: ${userId}`,
  );

  console.log(
    `Nome: ${normalizedName}`,
  );

  console.log(
    `E-mail: ${normalizedEmail}`,
  );

  console.log(
    `Perfil: ${role}`,
  );

  console.log(
    `Unidade: ${unit.code} - ${unit.name}`,
  );

  console.log(
    "==========================================",
  );

  console.log("");
} catch (error) {
  /* =======================================================
     ROLLBACK
  ======================================================= */

  await connection.rollback();

  console.error("");
  console.error(
    "==========================================",
  );

  console.error(
    "ERRO AO CRIAR USUÁRIO",
  );

  console.error(
    "==========================================",
  );

  console.error(error);

  console.error(
    "==========================================",
  );

  console.error("");

  process.exitCode = 1;
} finally {
  await connection.end();
}