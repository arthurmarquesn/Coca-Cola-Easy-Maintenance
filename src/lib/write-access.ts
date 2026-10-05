import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/auth";
import { isAnalystRole } from "@/lib/roles";

export function getWriteAccessError(session: SessionPayload | null) {
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado.", message: "Sessão inválida." }, { status: 401 });
  }
  if (!isAnalystRole(session.role)) {
    return NextResponse.json({ success: false, error: "Acesso negado.", message: "Somente analistas podem alterar dados." }, { status: 403 });
  }
  return null;
}
