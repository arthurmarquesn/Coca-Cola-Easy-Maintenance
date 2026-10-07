import { getAnalystAccessError } from "@/lib/write-access";
// FILE: src/app/api/ursus/overview/route.ts

import { NextResponse } from "next/server";

import {
  getSession,
} from "@/lib/session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";


interface MlHealthResponse {
  status?: string;

  model_version?: string;

  requested_model_version?: string;

  active_model_version?: string;

  fallback_used?: boolean;

  shadow_v16_enabled?: boolean;
}


/*
 * ============================================================
 * PERFORMANCE OFICIAL DO URSUS
 * ============================================================
 *
 * Valores do FINAL TEST realizado somente após o lock da v1.6.
 *
 * Top-1: 74.4986%
 * Top-3: 90.4011%
 * Top-5: 92.5501%
 * MRR:   82.6208%
 *
 * Para apresentação na interface:
 *
 * Top-1 -> 74,5%
 * Top-3 -> 90,4%
 * Top-5 -> 92,6%
 * MRR   -> 82,6%
 *
 * O Top-5 é apresentado como "Assertividade do Ursus", pois o
 * produto funciona como sistema de apoio à decisão: o Ursus
 * apresenta um ranking de sugestões e a pessoa valida o resultado.
 * ============================================================
 */

const URSUS_PERFORMANCE = {
  assertiveness:
    92.6,

  top1:
    74.5,

  top3:
    90.4,

  top5:
    92.6,

  mrr:
    82.6,

  target:
    90.0,
} as const;


function normalizeText(
  value:
    unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}


async function getMlHealth():
Promise<{
  available: boolean;

  data:
    | MlHealthResponse
    | null;
}> {
  const configuredUrl =
    process.env
      .ML_SERVICE_URL
      ?.trim();

  if (
    !configuredUrl
  ) {
    return {
      available:
        false,

      data:
        null,
    };
  }

  const baseUrl =
    configuredUrl.replace(
      /\/+$/,
      "",
    );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      4000,
    );

  try {
    const response =
      await fetch(
        `${baseUrl}/health`,
        {
          cache:
            "no-store",

          signal:
            controller.signal,
        },
      );

    if (
      !response.ok
    ) {
      return {
        available:
          false,

        data:
          null,
      };
    }

    const data =
      (
        await response.json()
      ) as MlHealthResponse;

    const healthy =
      normalizeText(
        data.status,
      ).toLowerCase() ===
      "ok";

    return {
      available:
        healthy,

      data:
        healthy
          ? data
          : null,
    };
  } catch {
    return {
      available:
        false,

      data:
        null,
    };
  } finally {
    clearTimeout(
      timeout,
    );
  }
}


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
          "Sessão expirada.",
      },
      {
        status:
          401,
      },
    );
  }

  /* Revisão e Ursus são exclusivos do Analista. */
  const analystError = getAnalystAccessError(session);
  if (analystError) return analystError;


  try {
    const health =
      await getMlHealth();

    const fallbackUsed =
      Boolean(
        health.data
          ?.fallback_used,
      );

    const serviceAvailable =
      health.available &&
      !fallbackUsed;

    return NextResponse.json({
      success:
        true,

      generatedAt:
        new Date()
          .toISOString(),

      service: {
        available:
          serviceAvailable,

        status:
          serviceAvailable
            ? "operational"
            : health.available
              ? "degraded"
              : "offline",

        fallbackUsed,

        shadowEnabled:
          Boolean(
            health.data
              ?.shadow_v16_enabled,
          ),

        humanReviewRequired:
          true,
      },

      performance: {
        assertiveness:
          URSUS_PERFORMANCE
            .assertiveness,

        top1:
          URSUS_PERFORMANCE
            .top1,

        top3:
          URSUS_PERFORMANCE
            .top3,

        top5:
          URSUS_PERFORMANCE
            .top5,

        mrr:
          URSUS_PERFORMANCE
            .mrr,

        target:
          URSUS_PERFORMANCE
            .target,

        targetReached:
          (
            URSUS_PERFORMANCE
              .assertiveness
            >=
            URSUS_PERFORMANCE
              .target
          ),

        gapToTarget:
          Number(
            (
              URSUS_PERFORMANCE
                .assertiveness
              -
              URSUS_PERFORMANCE
                .target
            ).toFixed(
              1,
            ),
          ),
      },
    });
  } catch (
    error
  ) {
    console.error(
      "Erro ao carregar performance do Ursus:",
      error,
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível carregar a performance do Ursus.",
      },
      {
        status:
          500,
      },
    );
  }
}


