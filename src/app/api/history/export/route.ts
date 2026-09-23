import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  ExecuteValues,
  RowDataPacket,
} from "mysql2/promise";

import * as XLSX from "xlsx";

import {
  executeRows,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

interface ExportRow
  extends RowDataPacket {
  id: number;

  event_date:
    | string
    | Date
    | null;

  shift:
    | string
    | null;

  source_line_name:
    | string
    | null;

  source_stop_type:
    | string
    | null;

  source_material_code:
    | string
    | null;

  source_material_description:
    | string
    | null;

  source_equipment_name:
    | string
    | null;

  source_stop_subkey:
    | string
    | null;

  source_stop_key_1:
    | string
    | null;

  observation:
    | string
    | null;

  downtime_minutes:
    | number
    | string
    | null;

  classification_notes:
    | string
    | object
    | null;

  suggestion_failure_mode:
    | string
    | null;
}

interface ClassificationNotes {
  failureMode?: string;

  failure_mode?: string;

  modelSuggestion?: {
    failureMode?: string;
  };
}

function parseClassificationNotes(
  value: unknown,
): ClassificationNotes | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value ===
    "object"
  ) {
    return value as
      ClassificationNotes;
  }

  const text =
    String(
      value,
    ).trim();

  if (!text) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        text,
      );

    if (
      parsed &&
      typeof parsed ===
        "object"
    ) {
      return parsed as
        ClassificationNotes;
    }

    return null;
  } catch {
    return null;
  }
}

function firstText(
  ...values: Array<
    string | null | undefined
  >
): string | null {
  for (
    const value of values
  ) {
    const normalized =
      value?.trim();

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function formatDate(
  value:
    | string
    | Date
    | null,
): string {
  if (!value) {
    return "";
  }

  let isoDate = "";

  if (
    value instanceof Date
  ) {
    const year =
      value.getUTCFullYear();

    const month =
      String(
        value.getUTCMonth() +
          1,
      ).padStart(
        2,
        "0",
      );

    const day =
      String(
        value.getUTCDate(),
      ).padStart(
        2,
        "0",
      );

    isoDate =
      `${year}-${month}-${day}`;
  } else {
    isoDate =
      String(
        value,
      ).slice(
        0,
        10,
      );
  }

  const [
    year,
    month,
    day,
  ] = isoDate.split(
    "-",
  );

  if (
    !year ||
    !month ||
    !day
  ) {
    return isoDate;
  }

  return `${day}/${month}/${year}`;
}

function numberOrBlank(
  value:
    | number
    | string
    | null,
): number | "" {
  if (
    value === null ||
    value === ""
  ) {
    return "";
  }

  const parsed =
    Number(
      value,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : "";
}

export async function GET(
  request: NextRequest,
) {
  const session =
    await getSession();

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Sessão inválida.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const search =
      (
        request.nextUrl
          .searchParams
          .get(
            "search",
          ) ?? ""
      )
        .trim()
        .slice(
          0,
          120,
        );

    const whereParts: string[] =
      [
        "e.unit_id = ?",
      ];

    let values:
      ExecuteValues = [
        session.unitId,
      ];

    if (search) {
      whereParts.push(
        `
          (
            e.source_line_name LIKE ?
            OR e.source_equipment_name LIKE ?
            OR e.source_stop_type LIKE ?
            OR e.source_stop_subkey LIKE ?
            OR e.source_stop_key_1 LIKE ?
            OR e.observation LIKE ?
            OR e.source_material_description LIKE ?
          )
        `,
      );

      const like =
        `%${search}%`;

      values = [
        session.unitId,
        like,
        like,
        like,
        like,
        like,
        like,
        like,
      ];
    }

    const whereClause =
      whereParts.join(
        " AND ",
      );

    const rows =
      await executeRows<
        ExportRow[]
      >(
        `
          SELECT
            e.id,
            e.event_date,
            e.shift,
            e.source_line_name,
            e.source_stop_type,
            e.source_material_code,
            e.source_material_description,
            e.source_equipment_name,
            e.source_stop_subkey,
            e.source_stop_key_1,
            e.observation,
            e.downtime_minutes,
            ec.classification_notes,
            cs.failure_mode
              AS suggestion_failure_mode

          FROM maintenance_events e

          LEFT JOIN event_classifications ec
            ON ec.event_id =
              e.id

          /*
             Fallback apenas para dados históricos que ainda
             possuem a classificação na antiga sugestão.
             Nada referente ao modelo é exposto na planilha.
          */
          LEFT JOIN (
            SELECT
              cs_current.event_id,
              cs_current.failure_mode

            FROM classification_suggestions cs_current

            INNER JOIN (
              SELECT
                event_id,
                MAX(id) AS latest_id

              FROM classification_suggestions

              WHERE model_type =
                'ML'

              GROUP BY event_id
            ) latest
              ON latest.latest_id =
                cs_current.id
          ) cs
            ON cs.event_id =
              e.id

          WHERE
            ${whereClause}

          ORDER BY
            e.event_date DESC,
            e.id DESC
        `,
        values,
      );

    const exportRows =
      rows.map(
        (row) => {
          const notes =
            parseClassificationNotes(
              row.classification_notes,
            );

          const classification =
            firstText(
              notes?.failureMode,
              notes?.failure_mode,
              notes
                ?.modelSuggestion
                ?.failureMode,
              row
                .suggestion_failure_mode,
            ) ??
            "Não classificado";

          return [
            formatDate(
              row.event_date,
            ),
            row.shift ?? "",
            row.source_line_name ??
              "",
            row.source_equipment_name ??
              "",
            row.source_stop_type ??
              "",
            row.source_material_code ??
              "",
            row.source_material_description ??
              "",
            row.source_stop_subkey ??
              "",
            row.source_stop_key_1 ??
              "",
            row.observation ??
              "",
            numberOrBlank(
              row.downtime_minutes,
            ),
            classification,
          ];
        },
      );

    const worksheet =
      XLSX.utils.aoa_to_sheet(
        [
          [
            "Data",
            "Turno",
            "Linha",
            "Equipamento",
            "Tipo de parada",
            "Código do material",
            "Material",
            "Subchave da parada",
            "Chave 1 da parada",
            "Ocorrência",
            "Tempo de parada (min)",
            "Classificação",
          ],
          ...exportRows,
        ],
      );

    worksheet["!cols"] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 16 },
      { wch: 34 },
      { wch: 22 },
      { wch: 18 },
      { wch: 38 },
      { wch: 30 },
      { wch: 30 },
      { wch: 60 },
      { wch: 22 },
      { wch: 28 },
    ];

    if (
      exportRows.length > 0
    ) {
      worksheet["!autofilter"] = {
        ref:
          `A1:L${exportRows.length + 1}`,
      };
    }

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Histórico",
    );

    const output =
      XLSX.write(
        workbook,
        {
          type: "buffer",
          bookType:
            "xlsx",
          compression:
            true,
        },
      ) as Buffer;

    const today =
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        );

    const filename =
      `historico-manutencao-${today}.xlsx`;

    return new NextResponse(
      new Uint8Array(
        output,
      ),
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

          "Content-Disposition":
            `attachment; filename="${filename}"`,

          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "Erro ao exportar histórico:",
      error,
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Não foi possível exportar o histórico.",
      },
      {
        status: 500,
      },
    );
  }
}
