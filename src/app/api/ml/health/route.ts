import {
  NextResponse,
} from "next/server";

import {
  getSession,
} from "@/lib/session";


interface MlHealthResponse {
  status: string;

  model_version: string;
}


function getMlServiceUrl(): string {
  const value =
    process.env.ML_SERVICE_URL?.trim();

  if (!value) {
    throw new Error(
      "ML_SERVICE_URL não configurado.",
    );
  }

  return value.replace(
    /\/+$/,
    "",
  );
}


export async function GET() {
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

    const response =
      await fetch(
        `${getMlServiceUrl()}/health`,
        {
          cache: "no-store",
        },
      );

    if (!response.ok) {
      return NextResponse.json({
        available: false,

        status:
          "offline",

        modelVersion:
          null,
      });
    }

    const data =
      (await response.json()) as
        MlHealthResponse;

    return NextResponse.json({
      available:
        data.status === "ok",

      status:
        data.status,

      modelVersion:
        data.model_version,
    });
  } catch (error) {
    console.error(
      "Erro ao consultar status do Modelo ML:",
      error,
    );

    return NextResponse.json({
      available: false,

      status:
        "offline",

      modelVersion:
        null,
    });
  }
}