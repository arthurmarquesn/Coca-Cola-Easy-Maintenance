import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  ExecuteValues,
  RowDataPacket,
} from "mysql2/promise";

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

/* =========================================================
   TIPOS
========================================================= */

interface CountRow
  extends RowDataPacket {
  total: number;
}

interface HistoryRow
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

  classification_id:
    | number
    | null;

  classification_source:
    | string
    | null;

  classification_confidence:
    | number
    | string
    | null;

  classification_status:
    | string
    | null;

  classification_notes:
    | string
    | null;

  classified_by_name:
    | string
    | null;
}

/* =========================================================
   CLASSIFICAÇÃO ARMAZENADA NO JSON
========================================================= */

interface ClassificationNotes {
  version?: number;

  model?: string;

  category?: string;

  system?: string;

  failureMode?: string;

  explanation?: string;
}

/* =========================================================
   CONVERSÃO DO JSON DA CLASSIFICAÇÃO
========================================================= */

function parseClassificationNotes(
  value:
    | string
    | null,
): ClassificationNotes | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(
      value,
    ) as ClassificationNotes;
  } catch {
    /*
       Compatibilidade com algum registro que possa ter sido
       salvo como texto simples em vez de JSON.
    */

    return {
      explanation:
        value,
    };
  }
}

/* =========================================================
   DATA
========================================================= */

function formatDatabaseDate(
  value:
    | string
    | Date
    | null,
): string | null {
  if (!value) {
    return null;
  }

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

    return `${year}-${month}-${day}`;
  }

  return String(
    value,
  ).slice(
    0,
    10,
  );
}

/* =========================================================
   GET /api/history
========================================================= */

export async function GET(
  request: NextRequest,
) {
  /* =======================================================
     SESSÃO
  ======================================================= */

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
    /* =====================================================
       PARÂMETROS
    ===================================================== */

    const searchParams =
      request.nextUrl
        .searchParams;

    const requestedPage =
      Number(
        searchParams.get(
          "page",
        ) ?? 1,
      );

    const requestedPageSize =
      Number(
        searchParams.get(
          "pageSize",
        ) ?? 20,
      );

    const page =
      Number.isFinite(
        requestedPage,
      )
        ? Math.max(
            1,
            Math.floor(
              requestedPage,
            ),
          )
        : 1;

    const pageSize =
      Number.isFinite(
        requestedPageSize,
      )
        ? Math.min(
            Math.max(
              Math.floor(
                requestedPageSize,
              ),
              10,
            ),
            100,
          )
        : 20;

    const search =
      (
        searchParams.get(
          "search",
        ) ?? ""
      )
        .trim()
        .slice(
          0,
          120,
        );

    /* =====================================================
       WHERE
    ===================================================== */

    const whereParts: string[] =
      [
        "e.unit_id = ?",
      ];

    /*
       IMPORTANTE:

       Não usamos unknown[].

       Nosso db.ts trabalha com ExecuteValues do mysql2.
    */

    let baseValues:
      ExecuteValues = [
        session.unitId,
      ];

    /* =====================================================
       PESQUISA
    ===================================================== */

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

      baseValues = [
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

    /* =====================================================
       TOTAL DE REGISTROS
    ===================================================== */

    const countRows =
      await executeRows<
        CountRow[]
      >(
        `
          SELECT
            COUNT(*) AS total

          FROM maintenance_events e

          WHERE
            ${whereClause}
        `,
        baseValues,
      );

    const total =
      Number(
        countRows[0]
          ?.total ?? 0,
      );

    const totalPages =
      Math.max(
        1,

        Math.ceil(
          total /
            pageSize,
        ),
      );

    const safePage =
      Math.min(
        page,
        totalPages,
      );

    const offset =
      (
        safePage -
        1
      ) *
      pageSize;

    /* =====================================================
       PARÂMETROS DO SELECT

       Criamos outro ExecuteValues para evitar problemas
       de tipagem com spread de unknown[].
    ===================================================== */

    const dataValues:
      ExecuteValues = [
        ...baseValues,

        pageSize,

        offset,
      ];

    /* =====================================================
       HISTÓRICO
    ===================================================== */

    const rows =
      await executeRows<
        HistoryRow[]
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

            ec.id
              AS classification_id,

            ec.source
              AS classification_source,

            ec.confidence
              AS classification_confidence,

            ec.status
              AS classification_status,

            ec.classification_notes,

            classified_user.name
              AS classified_by_name

          FROM maintenance_events e

          LEFT JOIN event_classifications ec
            ON ec.event_id =
              e.id

          LEFT JOIN users classified_user
            ON classified_user.id =
              ec.classified_by_user_id

          WHERE
            ${whereClause}

          ORDER BY
            e.event_date DESC,
            e.id DESC

          LIMIT ?
          OFFSET ?
        `,
        dataValues,
      );

    /* =====================================================
       NORMALIZAÇÃO DA RESPOSTA
    ===================================================== */

    const items =
      rows.map(
        (row) => {
          const classification =
            parseClassificationNotes(
              row.classification_notes,
            );

          return {
            id:
              Number(
                row.id,
              ),

            eventDate:
              formatDatabaseDate(
                row.event_date,
              ),

            shift:
              row.shift,

            line:
              row.source_line_name,

            stopType:
              row.source_stop_type,

            materialCode:
              row.source_material_code,

            materialDescription:
              row.source_material_description,

            equipment:
              row.source_equipment_name,

            stopSubkey:
              row.source_stop_subkey,

            stopKey1:
              row.source_stop_key_1,

            observation:
              row.observation,

            downtimeMinutes:
              row.downtime_minutes ===
              null
                ? null
                : Number(
                    row.downtime_minutes,
                  ),

            classification:
              row.classification_id
                ? {
                    id:
                      Number(
                        row.classification_id,
                      ),

                    source:
                      row.classification_source,

                    confidence:
                      row.classification_confidence ===
                      null
                        ? null
                        : Number(
                            row.classification_confidence,
                          ),

                    status:
                      row.classification_status,

                    classifiedBy:
                      row.classified_by_name,

                    category:
                      classification
                        ?.category ??
                      null,

                    system:
                      classification
                        ?.system ??
                      null,

                    failureMode:
                      classification
                        ?.failureMode ??
                      null,

                    explanation:
                      classification
                        ?.explanation ??
                      null,

                    model:
                      classification
                        ?.model ??
                      null,
                  }
                : null,
          };
        },
      );

    /* =====================================================
       RESPOSTA
    ===================================================== */

    return NextResponse.json(
      {
        success: true,

        items,

        pagination: {
          page:
            safePage,

          pageSize,

          total,

          totalPages,
        },
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
      "ERRO AO CARREGAR HISTÓRICO",
    );

    console.error(
      "==========================================",
    );

    console.error(
      error,
    );

    console.error(
      "==========================================",
    );

    return NextResponse.json(
      {
        success: false,

        message:
          "Não foi possível carregar o histórico.",
      },
      {
        status: 500,
      },
    );
  }
}