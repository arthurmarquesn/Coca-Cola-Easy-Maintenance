import { NextResponse } from "next/server";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  classifyImportWithAI,
} from "@/lib/ai/classify-import";

import {
  getConnection,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* =========================================================
   TIPOS
========================================================= */

interface ImportRow
  extends RowDataPacket {
  id: number;
  unit_id: number;
  status: string;
}

/* =========================================================
   POST /api/imports/classify
========================================================= */

export async function POST(
  request: Request,
) {
  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Sessão inválida.",
      },
      {
        status: 401,
      },
    );
  }

  let body:
    | {
        importId?: unknown;
      }
    | undefined;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        message:
          "Corpo da requisição inválido.",
      },
      {
        status: 400,
      },
    );
  }

  const importId =
    Number(
      body?.importId,
    );

  if (
    !Number.isInteger(
      importId,
    ) ||
    importId <= 0
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Importação inválida.",
      },
      {
        status: 400,
      },
    );
  }

  const connection =
    await getConnection();

  try {
    /* =====================================================
       CONFIRMA QUE A IMPORTAÇÃO PERTENCE À UNIDADE
    ===================================================== */

    const [
      imports,
    ] =
      await connection.execute<
        ImportRow[]
      >(
        `
          SELECT
            id,
            unit_id,
            status
          FROM imports
          WHERE id = ?
            AND unit_id = ?
          LIMIT 1
        `,
        [
          importId,
          session.unitId,
        ],
      );

    const importRecord =
      imports[0];

    if (!importRecord) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Importação não encontrada.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      importRecord.status !==
      "CONCLUIDO"
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A importação precisa estar concluída antes da análise.",
        },
        {
          status: 409,
        },
      );
    }

    /* =====================================================
       IA
    ===================================================== */

    const result =
      await classifyImportWithAI(
        connection,
        importId,
        session.unitId,
      );

    return NextResponse.json(
      {
        success: true,

        ai:
          result,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "==========================================",
    );

    console.error(
      "ERRO NA CLASSIFICAÇÃO POR IA",
    );

    console.error(
      "==========================================",
    );

    console.error(error);

    console.error(
      "==========================================",
    );

    return NextResponse.json(
      {
        success: false,

        message:
          "Os dados foram importados, mas a análise por IA não pôde ser concluída.",
      },
      {
        status: 500,
      },
    );
  } finally {
    connection.release();
  }
}