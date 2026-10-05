import { publicErrorMessage } from "@/lib/errors";
import { getWriteAccessError } from "@/lib/write-access";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getConnection,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

import {
  applyReview,
  type ReviewAction,
} from "@/lib/maintenance/apply-review";

import {
  getUnitSelection,
} from "@/lib/unit-selection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS_PER_REQUEST = 500;

interface BulkBody {
  suggestionIds?: unknown;
  action?: unknown;
  correctedComponent?: unknown;
  note?: unknown;
}

export async function POST(request: NextRequest) {
const session = await getSession();
  const accessError = getWriteAccessError(session);
  if (accessError) return accessError;

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Não autenticado." },
      { status: 401 },
    );
  }

  const unitSelection = await getUnitSelection({
    userId: session.userId,
    defaultUnitId: session.unitId,
  });

  if (unitSelection.selectedUnitIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "Nenhuma unidade válida está selecionada." },
      { status: 403 },
    );
  }

  let body: BulkBody;

  try {
    body = (await request.json()) as BulkBody;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid request body");
    }
  } catch {
    return NextResponse.json(
      { success: false, error: "Corpo da requisição inválido." },
      { status: 400 },
    );
  }

  const suggestionIds = Array.isArray(body.suggestionIds)
    ? body.suggestionIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : [];

  if (suggestionIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "Selecione ao menos uma ocorrência." },
      { status: 400 },
    );
  }

  if (suggestionIds.length > MAX_ITEMS_PER_REQUEST) {
    return NextResponse.json(
      {
        success: false,
        error: `Selecione no máximo ${MAX_ITEMS_PER_REQUEST} ocorrências por vez.`,
      },
      { status: 400 },
    );
  }

  const action = typeof body.action === "string"
    ? body.action.trim().toUpperCase()
    : "";

  if (action !== "CONFIRM" && action !== "CORRECT" && action !== "REJECT") {
    return NextResponse.json(
      { success: false, error: "Ação de revisão inválida." },
      { status: 400 },
    );
  }

  const correctedComponent = typeof body.correctedComponent === "string"
    ? body.correctedComponent
    : "";

  if (action === "CORRECT" && correctedComponent.trim().length < 2) {
    return NextResponse.json(
      {
        success: false,
        error: "Informe o componente correto para reclassificar em lote.",
      },
      { status: 400 },
    );
  }

  const note = typeof body.note === "string"
    ? body.note.trim().slice(0, 500)
    : "";

  const connection = await getConnection();

  const succeeded: number[] = [];
  const failed: { suggestionId: number; error: string }[] = [];

  try {
    for (const suggestionId of suggestionIds) {
      try {
        const result = await applyReview(connection, {
          suggestionId,
          unitIds: unitSelection.selectedUnitIds,
          userId: session.userId,
          action: action as ReviewAction,
          correctedComponent,
          note,
        });

        if (result.ok) {
          succeeded.push(suggestionId);
        } else {
          failed.push({ suggestionId, error: result.error });
        }
      } catch (itemError) {
        failed.push({
          suggestionId,
          error: publicErrorMessage(
            itemError,
            "Falha ao processar esta ocorrência.",
          ),
        });
      }
    }

    return NextResponse.json({
      success: true,
      accepted: succeeded.length,
      failed,
      message:
        failed.length === 0
          ? `${succeeded.length} ocorrência(s) atualizada(s).`
          : `${succeeded.length} ocorrência(s) atualizada(s), ${failed.length} falharam.`,
    });
  } catch (error) {
    console.error("Erro ao aplicar revisão em lote:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Não foi possível concluir a ação em lote.",
      },
      { status: 500 },
    );
  } finally {
    connection.release();
  }
}
