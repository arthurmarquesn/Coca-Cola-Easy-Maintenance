import { publicErrorMessage } from "@/lib/errors";
import {
  readFile,
} from "node:fs/promises";

import {
  isDateValue as isCalendarDate,
} from "@/lib/analytics/sql";

import path from "node:path";

import {
  createElement,
} from "react";

import {
  renderToBuffer,
} from "@react-pdf/renderer";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getSession,
} from "@/lib/session";

import {
  buildMaintenanceReportData,
  getMaintenanceReportOptions,
  ReportAccessError,
  type MaintenanceReportMetric,
  type MaintenanceReportRequest,
} from "@/lib/reports/maintenance-report-data";

import {
  MaintenanceReportPdf,
} from "@/lib/reports/maintenance-report-pdf";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

const ALLOWED_METRICS:
  MaintenanceReportMetric[] = [
    "SUMMARY",
    "UNIT_COMPARISON",
    "PARETO",
    "JACK_KNIFE",
    "CRITICALITY",
    "FAILURE_MODES",
    "DETAILS",
  ];

/* Data de calendário real: o formato sozinho aceitava
   2026-02-31 e 2026-00-10. */
function isDateValue(
  value: unknown,
): value is string {
  return (
    typeof value ===
      "string" &&
    isCalendarDate(
      value,
    )
  );
}

function cleanOptionalText(
  value: unknown,
  maxLength: number,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const cleaned =
    value
      .trim()
      .slice(
        0,
        maxLength,
      );

  return cleaned ||
    null;
}

function parseUnitIds(
  value: unknown,
): number[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(
          Number,
        )
        .filter(
          (
            id,
          ) =>
            Number.isInteger(
              id,
            ) &&
            id >
              0,
        ),
    ),
  ];
}

function parseMetrics(
  value: unknown,
): MaintenanceReportMetric[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  const allowed =
    new Set<
      MaintenanceReportMetric
    >(
      ALLOWED_METRICS,
    );

  return [
    ...new Set(
      value.filter(
        (
          metric,
        ): metric is MaintenanceReportMetric =>
          typeof metric ===
            "string" &&
          allowed.has(
            metric as MaintenanceReportMetric,
          ),
      ),
    ),
  ];
}

async function loadLogoDataUri(): Promise<string | null> {
  const candidates = [
    {
      file:
        "logo-pdf.png",
      mime:
        "image/png",
    },
    {
      file:
        "logo.png",
      mime:
        "image/png",
    },
    {
      file:
        "coca-cola-femsa.png",
      mime:
        "image/png",
    },
    {
      file:
        "logo-pdf.jpg",
      mime:
        "image/jpeg",
    },
    {
      file:
        "logo-pdf.jpeg",
      mime:
        "image/jpeg",
    },
  ];

  for (
    const candidate
    of candidates
  ) {
    try {
      const filePath =
        path.join(
          process.cwd(),
          "public",
          candidate.file,
        );

      const buffer =
        await readFile(
          filePath,
        );

      return `data:${candidate.mime};base64,${buffer.toString(
        "base64",
      )}`;
    } catch {
      // Tenta o próximo arquivo.
    }
  }

  return null;
}

function buildFilename(
  startDate: string,
  endDate: string,
) {
  return `relatorio-manutencao-${startDate}-a-${endDate}.pdf`;
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
        status: 401,
      },
    );
  }

  try {
    const options =
      await getMaintenanceReportOptions(
        session.userId,
      );

    return NextResponse.json(
      {
        success:
          true,
        ...options,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (
    error
  ) {
    console.error(
      "Erro ao carregar opções do relatório:",
      error,
    );

    return NextResponse.json(
      {
        success:
          false,
        message:
          "Não foi possível carregar as opções do relatório.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
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
        status: 401,
      },
    );
  }

  let rawBody:
    Record<
      string,
      unknown
    >;

  try {
    const parsed =
      await request.json();

    if (
      !parsed ||
      typeof parsed !==
        "object"
    ) {
      throw new Error(
        "invalid",
      );
    }

    rawBody =
      parsed as Record<
        string,
        unknown
      >;
  } catch {
    return NextResponse.json(
      {
        success:
          false,
        message:
          "Parâmetros do relatório inválidos.",
      },
      {
        status: 400,
      },
    );
  }

  const unitIds =
    parseUnitIds(
      rawBody.unitIds,
    );

  const metrics =
    parseMetrics(
      rawBody.metrics,
    );

  const startDate =
    rawBody.startDate;

  const endDate =
    rawBody.endDate;

  if (
    unitIds.length ===
    0
  ) {
    return NextResponse.json(
      {
        success:
          false,
        message:
          "Selecione pelo menos uma unidade.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !isDateValue(
      startDate,
    ) ||
    !isDateValue(
      endDate,
    )
  ) {
    return NextResponse.json(
      {
        success:
          false,
        message:
          "Informe um período válido.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    startDate >
    endDate
  ) {
    return NextResponse.json(
      {
        success:
          false,
        message:
          "A data inicial não pode ser posterior à data final.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    metrics.length ===
    0
  ) {
    return NextResponse.json(
      {
        success:
          false,
        message:
          "Selecione pelo menos uma métrica para o relatório.",
      },
      {
        status: 400,
      },
    );
  }

  const reportRequest:
    MaintenanceReportRequest = {
      unitIds,
      startDate,
      endDate,
      line:
        cleanOptionalText(
          rawBody.line,
          180,
        ),
      equipment:
        cleanOptionalText(
          rawBody.equipment,
          255,
        ),
      metrics,
    };

  try {
    const data =
      await buildMaintenanceReportData({
        userId:
          session.userId,
        requestedBy:
          session.name,
        request:
          reportRequest,
      });

    const logoDataUri =
      await loadLogoDataUri();

    const reportElement =
      createElement(
        MaintenanceReportPdf,
        {
          data,
          logoDataUri,
        },
      );

    const pdfBuffer =
      await renderToBuffer(
        reportElement as unknown as Parameters<
          typeof renderToBuffer
        >[0],
      );

    const filename =
      buildFilename(
        startDate,
        endDate,
      );

    return new NextResponse(
      new Uint8Array(
        pdfBuffer,
      ),
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/pdf",
          "Content-Disposition":
            `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
              filename,
            )}`,
          "Cache-Control":
            "no-store, max-age=0",
        },
      },
    );
  } catch (
    error
  ) {
    console.error(
      "Erro ao gerar relatório de manutenção:",
      error,
    );

    const forbidden =
      error instanceof
      ReportAccessError;

    const message =
      publicErrorMessage(
        error,
        "Não foi possível gerar o relatório.",
      );

    return NextResponse.json(
      {
        success:
          false,
        message,
      },
      {
        status:
          forbidden
            ? 403
            : 500,
      },
    );
  }
}
