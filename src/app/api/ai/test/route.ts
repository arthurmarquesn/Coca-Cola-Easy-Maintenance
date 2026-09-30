import { NextResponse } from "next/server";

import {
  AI_MODEL,
  groq,
} from "@/lib/ai/client";

import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session =
      await getSession();

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          message: "Sessão inválida.",
        },
        {
          status: 401,
        },
      );
    }

    const completion =
      await groq.chat.completions.create({
        model: AI_MODEL,

        temperature: 0,

        messages: [
          {
            role: "system",

            content:
              "Você é um assistente técnico especializado em manutenção industrial.",
          },

          {
            role: "user",

            content:
              "Responda apenas com a frase: Integração de IA funcionando.",
          },
        ],
      });

    const response =
      completion.choices[0]
        ?.message?.content;

    if (!response) {
      throw new Error(
        "O modelo não retornou conteúdo.",
      );
    }

    return NextResponse.json(
      {
        success: true,
        model: AI_MODEL,
        response,
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "==========================================",
    );

    console.error(
      "ERRO NO TESTE DA IA",
    );

    console.error(
      "==========================================",
    );

    console.error(error);

    console.error(
      "==========================================",
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Não foi possível comunicar com o modelo de IA.",
      },
      {
        status: 500,
      },
    );
  }
}
