import {
  NextResponse,
} from "next/server";

import {
  getSession,
} from "@/lib/session";

import {
  getUnitSelection,
} from "@/lib/unit-selection";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


/* =========================================================
   GET /api/units
========================================================= */

export async function GET() {
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


  try {
    const selection =
      await getUnitSelection({
        userId:
          session.userId,

        defaultUnitId:
          session.unitId,
      });


    if (
      selection.units.length ===
      0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Nenhuma unidade ativa encontrada.",
        },
        {
          status:
            404,
        },
      );
    }


    const selectedIds =
      new Set(
        selection.selectedUnitIds,
      );


    return NextResponse.json({
      success:
        true,

      selectedUnitIds:
        selection.selectedUnitIds,

      totalSelected:
        selection
          .selectedUnitIds
          .length,

      totalAvailable:
        selection
          .units
          .length,

      allSelected:
        selection
          .selectedUnitIds
          .length ===
        selection
          .units
          .length,

      units:
        selection.units.map(
          (
            unit,
          ) => ({
            id:
              unit.id,

            code:
              unit.code,

            name:
              unit.name,

            city:
              unit.city,

            state:
              unit.state,

            isDefault:
              unit.isDefault,

            selected:
              selectedIds.has(
                unit.id,
              ),
          }),
        ),
    });
  } catch (
    error
  ) {
    console.error(
      "Erro ao carregar unidades:",
      error,
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível carregar as unidades.",
      },
      {
        status:
          500,
      },
    );
  }
}