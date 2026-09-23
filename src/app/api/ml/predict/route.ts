import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getSession,
} from "@/lib/session";

import {
  predictFailure,
} from "@/lib/ml/client";


interface RequestBody {
  observation?: unknown;

  equipment?: unknown;

  stopKey1?: unknown;

  stopSubkey?: unknown;

  stopType?: unknown;
}


function optionalString(
  value: unknown,
): string {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value.trim();
}


export async function POST(
  request: NextRequest,
) {
  try {
    const session =
      await getSession();

    if (!session) {
      return NextResponse.json(
        {
          error:
            "Não autenticado.",
        },
        {
          status: 401,
        },
      );
    }

    const body =
      (await request.json()) as
        RequestBody;

    const observation =
      optionalString(
        body.observation,
      );

    if (!observation) {
      return NextResponse.json(
        {
          error:
            "Informe a ocorrência.",
        },
        {
          status: 400,
        },
      );
    }

    const prediction =
      await predictFailure({
        observation,

        equipment:
          optionalString(
            body.equipment,
          ),

        stopKey1:
          optionalString(
            body.stopKey1,
          ),

        stopSubkey:
          optionalString(
            body.stopSubkey,
          ),

        stopType:
          optionalString(
            body.stopType,
          ),
      });

    return NextResponse.json({
      prediction,
    });
  } catch (error) {
    console.error(
      "Erro na predição do Modelo ML:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível consultar o Modelo ML.",
      },
      {
        status: 500,
      },
    );
  }
}