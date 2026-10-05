import { SignJWT, jwtVerify } from "jose";

const AUTH_SECRET = process.env.AUTH_SECRET;

if (!AUTH_SECRET) {
  throw new Error(
    "A variável de ambiente AUTH_SECRET não foi definida.",
  );
}

/* HS256 com segredo curto é quebrável por força bruta. */
if (AUTH_SECRET.length < 32) {
  throw new Error(
    "AUTH_SECRET deve ter pelo menos 32 caracteres. Gere com: openssl rand -hex 32",
  );
}

const secretKey = new TextEncoder().encode(AUTH_SECRET);

export const SESSION_COOKIE_NAME = "coca_session";

export const SESSION_DURATION_SECONDS =
  60 * 60 * 8;

export interface SessionPayload {
  userId: number;
  unitId: number;
  name: string;
  email: string;
  role: string;
}

export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    unitId: payload.unitId,
    name: payload.name,
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({
      alg: "HS256",
    })
    .setIssuedAt()
    .setExpirationTime(
      `${SESSION_DURATION_SECONDS}s`,
    )
    .sign(secretKey);
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      secretKey,
      {
        algorithms: ["HS256"],
      },
    );

    if (
      typeof payload.userId !== "number" ||
      typeof payload.unitId !== "number" ||
      typeof payload.name !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      unitId: payload.unitId,
      name: payload.name,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    return null;
  }
}