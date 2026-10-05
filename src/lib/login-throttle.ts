import { createHash } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { executeQuery, getConnection } from "@/lib/db";

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS_PER_ACCOUNT = 10;
// Several people can share one office IP; this only stops spraying many accounts.
const MAX_ATTEMPTS_PER_IP = 50;

function throttleKey(kind: "account" | "ip", value: string): string {
  const normalized = value.toLowerCase().trim();
  // Accounts keep the original unprefixed hash so existing rows stay valid.
  return createHash("sha256").update(kind === "account" ? normalized : `ip:${normalized}`).digest("hex");
}

/*
 * Client IP only from a header the reverse proxy overwrites
 * (LOGIN_TRUSTED_IP_HEADER, e.g. "x-real-ip"). Without that
 * setting any client could forge X-Forwarded-For, so the IP
 * limit stays off and only the per-account limit applies.
 */
export function getTrustedClientIp(headers: Headers): string | null {
  const headerName = process.env.LOGIN_TRUSTED_IP_HEADER?.trim();
  if (!headerName) return null;
  const value = headers.get(headerName)?.split(",")[0]?.trim();
  return value ? value.slice(0, 64) : null;
}

async function consumeKey(connection: PoolConnection, key: string, maxAttempts: number): Promise<number> {
  await connection.execute(`INSERT INTO login_attempts (account_key, attempts, expires_at)
    VALUES (?, 1, DATE_ADD(NOW(), INTERVAL ? SECOND))
    ON DUPLICATE KEY UPDATE
      attempts = IF(expires_at <= NOW(), 1, attempts + 1),
      expires_at = IF(expires_at <= NOW(), DATE_ADD(NOW(), INTERVAL ? SECOND), expires_at)`,
    [key, WINDOW_SECONDS, WINDOW_SECONDS]);
  const [rows] = await connection.query<(RowDataPacket & { attempts: number; retry_after: number })[]>(
    "SELECT attempts, GREATEST(1, TIMESTAMPDIFF(SECOND, NOW(), expires_at)) AS retry_after FROM login_attempts WHERE account_key = ?",
    [key],
  );
  return Number(rows[0].attempts) > maxAttempts ? Number(rows[0].retry_after) : 0;
}

// Shared by every application instance. Returns seconds to wait, or 0.
export async function consumeLoginAttempt(email: string, clientIp: string | null = null): Promise<number> {
  const connection = await getConnection();
  let retryAfter = 0;
  try {
    await connection.beginTransaction();
    retryAfter = await consumeKey(connection, throttleKey("account", email), MAX_ATTEMPTS_PER_ACCOUNT);
    if (clientIp) {
      retryAfter = Math.max(retryAfter, await consumeKey(connection, throttleKey("ip", clientIp), MAX_ATTEMPTS_PER_IP));
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    connection.release();
    throw error;
  }

  // Housekeeping only: a deadlock here must not fail a valid login.
  try {
    await connection.query("DELETE FROM login_attempts WHERE expires_at < NOW() LIMIT 100");
  } catch (error) {
    console.warn("Falha ao limpar login_attempts expirados:", error);
  } finally {
    connection.release();
  }
  return retryAfter;
}


// A successful login must not keep counting toward the account lockout window.
// The IP counter is kept: one valid account must not reset spraying from that IP.
export async function clearLoginAttempts(email: string): Promise<void> {
  await executeQuery("DELETE FROM login_attempts WHERE account_key = ?", [throttleKey("account", email)]);
}
