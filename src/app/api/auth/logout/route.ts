import {
  NextResponse,
} from "next/server";

import {
  SESSION_COOKIE_NAME,
} from "@/lib/auth";

import {
  UNIT_SELECTION_COOKIE_NAME,
} from "@/lib/unit-selection";

export const runtime =
  "nodejs";

export async function POST() {
  const response =
    NextResponse.json({
      success:
        true,
    });

  /* A seleção de unidades também sai: o próximo usuário
     do navegador começa pela própria unidade. */
  for (const name of [
    SESSION_COOKIE_NAME,
    UNIT_SELECTION_COOKIE_NAME,
  ]) {
    response.cookies.set(
      name,
      "",
      {
        httpOnly:
          true,

        sameSite:
          "lax",

        secure:
          process.env.NODE_ENV ===
          "production",

        path:
          "/",

        maxAge:
          0,
      },
    );
  }

  return response;
}
