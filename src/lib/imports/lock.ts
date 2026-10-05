import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { createHash } from "node:crypto";

// Connection-scoped MySQL locks serialize identical uploads across processes.
export async function acquireImportLock(connection: PoolConnection, fileHash: string) {
  const [rows] = await connection.query<(RowDataPacket & { db: string })[]>("SELECT DATABASE() AS db");
  const key = createHash("sha256").update(`${rows[0].db}:${fileHash}`).digest("hex");
  const [locks] = await connection.query<(RowDataPacket & { acquired: number })[]>(
    "SELECT GET_LOCK(?, 10) AS acquired", [key],
  );
  if (Number(locks[0].acquired) !== 1) throw new Error("Esta planilha está sendo processada. Tente novamente em instantes.");
  return async () => {
    try {
      const [released] = await connection.query<(RowDataPacket & { released: number })[]>("SELECT RELEASE_LOCK(?) AS released", [key]);
      if (Number(released[0].released) !== 1) throw new Error("Falha ao liberar lock de importação.");
    } catch (error) {
      connection.destroy(); // Never return a connection holding a lock to the pool.
      throw error;
    }
  };
}
