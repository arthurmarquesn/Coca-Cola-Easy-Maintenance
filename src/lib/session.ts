import { cookies } from "next/headers";

import {
  SESSION_COOKIE_NAME,
  SessionPayload,
  verifySessionToken,
} from "@/lib/auth";

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();

  const token = cookieStore.get(
    SESSION_COOKIE_NAME,
  )?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}