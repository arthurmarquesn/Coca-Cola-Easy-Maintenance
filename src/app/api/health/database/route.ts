import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { queryRows } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DatabaseHealthRow extends RowDataPacket {
  database_name: string;
  server_time: Date;
}

interface DatabaseError {
  code?: string;
  errno?: number;
  sqlState?: string;
  sqlMessage?: string;
  message?: string;
}

export async function GET() {
  try {
    const rows = await queryRows<DatabaseHealthRow[]>(
      "SELECT DATABASE() AS database_name, NOW() AS server_time",
    );

    const database = rows[0];

    return NextResponse.json(
      {
        success: true,

        database: {
          connected: true,
          name: database.database_name,
          serverTime: database.server_time,
        },
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    const databaseError = error as DatabaseError;

    console.error("==========================================");
    console.error("ERRO DE CONEXÃO COM MYSQL");
    console.error("==========================================");
    console.error(error);
    console.error("==========================================");

    return NextResponse.json(
      {
        success: false,

        database: {
          connected: false,
        },

        message: "Não foi possível conectar ao banco de dados.",

        debug:
          process.env.NODE_ENV === "development"
            ? {
                code: databaseError.code ?? null,
                errno: databaseError.errno ?? null,
                sqlState: databaseError.sqlState ?? null,
                sqlMessage: databaseError.sqlMessage ?? null,
                message: databaseError.message ?? null,
              }
            : undefined,
      },
      {
        status: 500,
      },
    );
  }
}