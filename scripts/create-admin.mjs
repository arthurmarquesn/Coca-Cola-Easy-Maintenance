import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const [
  ,
  ,
  name,
  email,
  password,
] = process.argv;

if (!name || !email || !password) {
  console.error(
    'Uso: node --env-file=.env.local scripts/create-admin.mjs "Nome" "email@empresa.com" "Senha"',
  );

  process.exit(1);
}

if (password.length < 12) {
  console.error("A senha deve possuir pelo menos 12 caracteres.");
  process.exit(1);
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
});

try {
  const [units] = await connection.execute(
    `
      SELECT id
      FROM units
      WHERE code = ?
      LIMIT 1
    `,
    ["BAAK"],
  );

  if (!Array.isArray(units) || units.length === 0) {
    throw new Error("A unidade BAAK não foi encontrada.");
  }

  const unitId = units[0].id;

  const normalizedEmail = email.trim().toLowerCase();

  const passwordHash = await bcrypt.hash(password, 12);

  await connection.execute(
    `
      INSERT INTO users (
        unit_id,
        name,
        email,
        password_hash,
        role,
        active
      )
      VALUES (?, ?, ?, ?, 'ADMIN', TRUE)
    `,
    [
      unitId,
      name.trim(),
      normalizedEmail,
      passwordHash,
    ],
  );

  console.log("");
  console.log("Administrador criado com sucesso.");
  console.log(`Nome: ${name.trim()}`);
  console.log(`E-mail: ${normalizedEmail}`);
  console.log("Unidade: BAAK");
  console.log("Perfil: ADMIN");
  console.log("");
} catch (error) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  ) {
    console.error("Já existe um usuário com esse e-mail.");
  } else {
    console.error("Erro ao criar administrador:");
    console.error(error);
  }

  process.exitCode = 1;
} finally {
  await connection.end();
}