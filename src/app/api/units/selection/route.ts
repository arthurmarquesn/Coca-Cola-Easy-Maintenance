import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";

import {
  getSession,
} from "@/lib/session";

import {
  getAuthorizedUnits,
  serializeUnitSelection,
  UNIT_SELECTION_COOKIE_NAME,
  validateSelectedUnitIds,
} from "@/lib/unit-selection";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


/* =========================================================
   TYPES
========================================================= */

interface SelectionBody {
  unitIds?:
    unknown;
}


/* =========================================================
   HELPERS
========================================================= */

function parseRequestedUnitIds(
  value:
    unknown,
): number[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }


  return [
    ...new Set(
      value.filter(
        (
          item,
        ): item is number =>
          typeof item ===
            "number" &&
          Number.isInteger(
            item,
          ) &&
          item > 0,
      ),
    ),
  ];
}


/* =========================================================
   POST /api/units/selection
========================================================= */

export async function POST(
  request:
    NextRequest,
) {
  /* =======================================================
     SESSION
  ======================================================= */

  const session =
    await getSession();


  if (
    !session
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Sessão inválida.",
      },
      {
        status:
          401,
      },
    );
  }


  /* =======================================================
     BODY
  ======================================================= */

  let body:
    SelectionBody;


  try {
    body =
      (await request.json()) as
        SelectionBody;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid request body");
    }
  } catch {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Seleção de unidades inválida.",
      },
      {
        status:
          400,
      },
    );
  }


  /* =======================================================
     PARSE IDS
  ======================================================= */

  const requestedUnitIds =
    parseRequestedUnitIds(
      body.unitIds,
    );


  if (
    requestedUnitIds.length ===
    0
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Selecione pelo menos uma unidade.",
      },
      {
        status:
          400,
      },
    );
  }


  try {
    /* =====================================================
       ACTIVE UNITS
    ===================================================== */

    const units =
      await getAuthorizedUnits(
        session.userId,
      );


    if (
      units.length ===
      0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Nenhuma unidade ativa foi encontrada.",
        },
        {
          status:
            404,
        },
      );
    }


    /* =====================================================
       VALIDATE IDS

       O usuário pode consultar qualquer unidade ativa,
       mas o backend continua validando tudo o que veio
       do navegador.
    ===================================================== */

    const selectedUnitIds =
      validateSelectedUnitIds(
        requestedUnitIds,
        units,
      );


    /*
     * Se algum ID enviado não existir mais
     * ou estiver inativo, rejeitamos a requisição.
     */
    if (
      selectedUnitIds.length !==
      requestedUnitIds.length
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Uma ou mais unidades selecionadas são inválidas.",
        },
        {
          status:
            403,
        },
      );
    }


    /* =====================================================
       COOKIE
    ===================================================== */

    const response =
      NextResponse.json(
        {
          success:
            true,

          selectedUnitIds,

          totalSelected:
            selectedUnitIds.length,
        },
        {
          status:
            200,
        },
      );


    response.cookies.set(
      UNIT_SELECTION_COOKIE_NAME,
      serializeUnitSelection(
        selectedUnitIds,
      ),
      {
        httpOnly:
          true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite:
          "lax",

        path:
          "/",

        maxAge:
          SESSION_DURATION_SECONDS,
      },
    );


    return response;
  } catch (
    error
  ) {
    console.error(
      "Erro ao aplicar filtro de unidades:",
      error,
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível aplicar o filtro de unidades.",
      },
      {
        status:
          500,
      },
    );
  }
}