import { readFileSync } from "node:fs";

import type { PoolOptions } from "mysql2/promise";

/* =========================================================
   TLS

   DB_SSL=true liga o TLS (obrigatório no MySQL HeatWave).
   DB_SSL_CA aponta para o certificado da CA que assina o
   servidor; sem ele, valem as CAs do sistema. A cadeia é
   sempre validada: nunca usamos rejectUnauthorized=false.

   O certificado padrão do HeatWave não traz o IP privado do
   banco no nome. DB_SSL_VERIFY_HOSTNAME=false mantém a
   validação da CA e dispensa só a do nome (equivale ao
   --ssl-mode=VERIFY_CA do cliente mysql).
========================================================= */

export function buildSslOptions(
  env: {
    DB_SSL?: string;
    DB_SSL_CA?: string;
    DB_SSL_VERIFY_HOSTNAME?: string;
  },
  readCa: (path: string) => string = (path) =>
    readFileSync(path, "utf8"),
): PoolOptions["ssl"] {
  if (env.DB_SSL?.trim().toLowerCase() !== "true") {
    return undefined;
  }

  const caPath = env.DB_SSL_CA?.trim();

  const verifyHostname =
    env.DB_SSL_VERIFY_HOSTNAME?.trim().toLowerCase() !== "false";

  return {
    rejectUnauthorized: true,

    minVersion: "TLSv1.2",

    verifyIdentity: verifyHostname,

    ...(caPath ? { ca: readCa(caPath) } : {}),
  };
}
