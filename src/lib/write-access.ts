import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/auth";
import { isAnalystRole } from "@/lib/roles";

function getAnalystOnlyError(session: SessionPayload | null, message: string) {
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado.", message: "Sessão inválida." }, { status: 401 });
  }
  if (!isAnalystRole(session.role)) {
    return NextResponse.json({ success: false, error: "Acesso negado.", message }, { status: 403 });
  }
  return null;
}

export function getWriteAccessError(session: SessionPayload | null) {
  return getAnalystOnlyError(session, "Somente analistas podem alterar dados.");
}

/* Revisão, MASP e Ursus são do Analista: o Gestor não lê esses dados. */
export function getAnalystAccessError(session: SessionPayload | null) {
  return getAnalystOnlyError(session, "Acesso restrito ao perfil Analista.");
}
