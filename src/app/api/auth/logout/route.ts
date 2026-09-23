import {
  NextResponse,
} from "next/server";

export const runtime =
  "nodejs";

export async function POST() {
  const response =
    NextResponse.json({
      success:
        true,
    });

  response.cookies.set(
    "coca_session",
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

  return response;
}