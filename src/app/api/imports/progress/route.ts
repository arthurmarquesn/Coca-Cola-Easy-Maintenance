import { NextRequest, NextResponse } from "next/server";

import { getImportProgress, isValidProgressId } from "@/lib/import-progress";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   GET /api/imports/progress?id=...

   Consultado pela tela enquanto o POST /api/imports/process
   ainda está rodando.
========================================================= */

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Sessão expirada." },
      { status: 401 },
    );
  }

  const progressId = request.nextUrl.searchParams.get("id");

  if (!isValidProgressId(progressId)) {
    return NextResponse.json(
      { success: false, message: "Identificador de progresso inválido." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    progress: getImportProgress(session.userId, progressId),
  });
}
