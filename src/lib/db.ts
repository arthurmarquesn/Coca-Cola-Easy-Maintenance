import mysql from "mysql2/promise";

import type {
  ExecuteValues,
  Pool,
  PoolConnection,
  QueryValues,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import { buildSslOptions } from "@/lib/db-ssl";

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  DB_SSL,
  DB_SSL_CA,
  DB_SSL_VERIFY_HOSTNAME,
} = process.env;

/* =========================================================
   VALIDAÇÃO DAS VARIÁVEIS DE AMBIENTE
========================================================= */

if (!DB_HOST) {
  throw new Error(
    "A variável de ambiente DB_HOST não foi definida.",
  );
}

if (!DB_USER) {
  throw new Error(
    "A variável de ambiente DB_USER não foi definida.",
  );
}

if (!DB_NAME) {
  throw new Error(
    "A variável de ambiente DB_NAME não foi definida.",
  );
}

/* TLS do banco: ver src/lib/db-ssl.ts. */
const sslOptions = buildSslOptions({
  DB_SSL,
  DB_SSL_CA,
  DB_SSL_VERIFY_HOSTNAME,
});

/* =========================================================
   GLOBAL
   Evita múltiplos pools durante o Hot Reload do Next.js
========================================================= */

const globalForDatabase = globalThis as unknown as {
  mysqlPool: Pool | undefined;
};

/* =========================================================
   CRIAÇÃO DO POOL
========================================================= */

function createPool(): Pool {
  return mysql.createPool({
    host: DB_HOST,

    port: Number(DB_PORT ?? 3306),

    user: DB_USER,

    password: DB_PASSWORD ?? "",

    database: DB_NAME,

    ...(sslOptions ? { ssl: sslOptions } : {}),

    waitForConnections: true,

    connectionLimit: 10,

    maxIdle: 10,

    idleTimeout: 60_000,

    queueLimit: 0,

    enableKeepAlive: true,

    keepAliveInitialDelay: 0,

    charset: "utf8mb4",

    timezone: "Z",

    /* DATE não tem fuso: volta como "YYYY-MM-DD". Como
       Date, viraria meia-noite UTC e, lido no horário
       local (BRT), cairia no dia anterior. */
    dateStrings: ["DATE"],
  });
}

/* =========================================================
   POOL PRINCIPAL
========================================================= */

export const db: Pool =
  globalForDatabase.mysqlPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.mysqlPool = db;
}

/* =========================================================
   CONEXÃO MANUAL
   Útil futuramente para transactions
========================================================= */

export async function getConnection(): Promise<PoolConnection> {
  return db.getConnection();
}

/* =========================================================
   QUERY DE LEITURA

   Exemplo:

   const users = await queryRows<UserRow[]>(
     "SELECT * FROM users WHERE email = ?",
     [email],
   );
========================================================= */

export async function queryRows<
  T extends RowDataPacket[],
>(
  sql: string,
  values: QueryValues = [],
): Promise<T> {
  const [rows] = await db.query<T>(
    sql,
    values,
  );

  return rows;
}

/* =========================================================
   EXECUTE DE LEITURA

   Usa prepared statements.

   Será a opção preferida para consultas que recebem
   dados do usuário.
========================================================= */

export async function executeRows<
  T extends RowDataPacket[],
>(
  sql: string,
  values: ExecuteValues = [],
): Promise<T> {
  const [rows] = await db.execute<T>(
    sql,
    values,
  );

  return rows;
}

/* =========================================================
   EXECUTE DE ESCRITA

   INSERT
   UPDATE
   DELETE

   Retorna informações como:
   - insertId
   - affectedRows
   - changedRows
========================================================= */

export async function executeQuery(
  sql: string,
  values: ExecuteValues = [],
): Promise<ResultSetHeader> {
  const [result] = await db.execute<ResultSetHeader>(
    sql,
    values,
  );

  return result;
}