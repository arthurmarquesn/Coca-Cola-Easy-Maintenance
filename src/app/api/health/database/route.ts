import { NextResponse } from "next/server";
import { queryRows } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await queryRows("SELECT 1");
    return NextResponse.json({ success: true, database: { connected: true } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha no health check do banco:", error);
    return NextResponse.json({ success: false, database: { connected: false } }, { status: 503 });
  }
}
