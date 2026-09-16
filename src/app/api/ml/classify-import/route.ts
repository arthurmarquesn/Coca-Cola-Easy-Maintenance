import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getSession,
} from "@/lib/session";

import {
  classifyImportWithMl,
} from "@/lib/ml/classify-import";


interface RequestBody {
  importId?: unknown;

  batchSize?: unknown;
}


export async function POST(
  request:
    NextRequest,
) {
  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Não autenticado.",
      },
      {
        status:
          401,
      },
    );
  }


  let body:
    RequestBody;

  try {
    body =
      (await request.json()) as
        RequestBody;
  } catch {
    return NextResponse.json(
      {
        error:
          "Corpo inválido.",
      },
      {
        status:
          400,
      },
    );
  }


  const importId =
    Number(
      body.importId,
    );


  if (
    !Number.isInteger(
      importId,
    ) ||
    importId <= 0
  ) {
    return NextResponse.json(
      {
        error:
          "Importação inválida.",
      },
      {
        status:
          400,
      },
    );
  }


  const batchSize =
    typeof body.batchSize ===
      "number"
      ? body.batchSize
      : 250;


  try {
    const result =
      await classifyImportWithMl({
        importId,

        unitId:
          session.unitId,

        batchSize,
      });


    return NextResponse.json({
      success:
        true,

      ml:
        result,
    });
  } catch (
    error
  ) {
    console.error(
      "Erro ao classificar importação:",
      error,
    );


    return NextResponse.json(
      {
        error:
          "Não foi possível classificar a importação.",
      },
      {
        status:
          500,
      },
    );
  }
}