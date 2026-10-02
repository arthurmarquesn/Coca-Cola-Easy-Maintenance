import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import {
  getConnection,
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

type Criticality =
  | "A"
  | "B"
  | "C";

type UserRole =
  | "GESTOR"
  | "ANALISTA";

interface UserRoleRow
  extends RowDataPacket {
  role: UserRole;
}

interface EquipmentRow
  extends RowDataPacket {
  id: number;

  code: string;

  name: string;

  criticality:
    | Criticality
    | null;

  criticality_justification:
    | string
    | null;

  criticality_updated_at:
    | Date
    | string
    | null;

  updated_by_name:
    | string
    | null;

  occurrences:
    | number
    | string
    | null;

  downtime_minutes:
    | number
    | string
    | null;

  last_event_date:
    | Date
    | string
    | null;

  line_names:
    | string
    | null;
}

interface EquipmentExistsRow
  extends RowDataPacket {
  id: number;
}

interface PatchBody {
  equipmentId?: unknown;

  criticality?: unknown;

  justification?: unknown;
}

interface CriticalityBucket {
  equipments: number;

  affectedEquipments: number;

  occurrences: number;

  downtimeMinutes: number;
}

/* =========================================================
   HELPERS
========================================================= */

function numericValue(
  value:
    | number
    | string
    | null
    | undefined,
): number {
  const parsed =
    Number(
      value ?? 0,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : 0;
}

function formatDatabaseDate(
  value:
    | Date
    | string
    | null,
): string | null {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10,
      );
  }

  return String(
    value,
  ).slice(
    0,
    10,
  );
}

function formatDatabaseDateTime(
  value:
    | Date
    | string
    | null,
): string | null {
  if (!value) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return value
      .toISOString();
  }

  return String(
    value,
  );
}

function normalizeLines(
  value:
    | string
    | null,
): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(
          "|||",
        )
        .map(
          (
            item,
          ) =>
            item.trim(),
        )
        .filter(
          Boolean,
        ),
    ),
  ).sort(
    (
      a,
      b,
    ) =>
      a.localeCompare(
        b,
        "pt-BR",
      ),
  );
}

function isCriticality(
  value: unknown,
): value is Criticality {
  return (
    value === "A" ||
    value === "B" ||
    value === "C"
  );
}

function createBucket():
  CriticalityBucket {
  return {
    equipments: 0,

    affectedEquipments: 0,

    occurrences: 0,

    downtimeMinutes: 0,
  };
}

/* =========================================================
   BUSCA DO PAPEL REAL DO USUÁRIO
========================================================= */

async function getUserRole(
  connection:
    Awaited<
      ReturnType<
        typeof getConnection
      >
    >,

  userId: number,
): Promise<UserRole | null> {
  const [
    rows,
  ] =
    await connection.query<
      UserRoleRow[]
    >(
      `
        SELECT
          role
        FROM users
        WHERE id = ?
          AND active = TRUE
        LIMIT 1
      `,
      [
        userId,
      ],
    );

  return (
    rows[0]?.role ??
    null
  );
}

/* =========================================================
   GET
========================================================= */

export async function GET() {
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

  const connection =
    await getConnection();

  try {
    const userId =
      Number(
        session.userId,
      );

    if (
      !Number.isInteger(
        userId,
      ) ||
      userId <= 0
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Usuário inválido.",
        },
        {
          status: 401,
        },
      );
    }

    const role =
      await getUserRole(
        connection,
        userId,
      );

    if (!role) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Usuário não encontrado.",
        },
        {
          status: 403,
        },
      );
    }

    /* =====================================================
       AGREGAÇÃO DOS APONTAMENTOS POR EQUIPAMENTO
    ===================================================== */

    const [
      rows,
    ] =
      await connection.query<
        EquipmentRow[]
      >(
        `
          WITH event_stats AS (
            SELECT
              me.equipment_id,

              COUNT(*) AS occurrences,

              SUM(
                COALESCE(
                  me.downtime_minutes,
                  0
                )
              ) AS downtime_minutes,

              MAX(
                me.event_date
              ) AS last_event_date,

              GROUP_CONCAT(
                DISTINCT NULLIF(
                  TRIM(
                    me.source_line_name
                  ),
                  ''
                )
                SEPARATOR '|||'
              ) AS line_names

            FROM
              maintenance_events me

            WHERE
              me.unit_id = ?

              AND me.equipment_id
                  IS NOT NULL

            GROUP BY
              me.equipment_id
          )

          SELECT
            eq.id,

            eq.code,

            eq.name,

            eq.criticality,

            eq.criticality_justification,

            eq.criticality_updated_at,

            updated_user.name
              AS updated_by_name,

            COALESCE(
              stats.occurrences,
              0
            ) AS occurrences,

            COALESCE(
              stats.downtime_minutes,
              0
            ) AS downtime_minutes,

            stats.last_event_date,

            stats.line_names

          FROM
            equipments eq

          LEFT JOIN
            event_stats stats
              ON stats.equipment_id =
                 eq.id

          LEFT JOIN
            users updated_user
              ON updated_user.id =
                 eq.criticality_updated_by

          WHERE
            eq.unit_id = ?

            AND eq.active = TRUE

          ORDER BY
            CASE
              WHEN eq.criticality IS NULL
                THEN 0
              WHEN eq.criticality = 'A'
                THEN 1
              WHEN eq.criticality = 'B'
                THEN 2
              ELSE 3
            END,

            downtime_minutes DESC,

            occurrences DESC,

            eq.name ASC
        `,
        [
          session.unitId,
          session.unitId,
        ],
      );

    /* =====================================================
       NORMALIZAÇÃO
    ===================================================== */

    const items =
      rows.map(
        (
          row,
        ) => {
          const occurrences =
            numericValue(
              row.occurrences,
            );

          const downtimeMinutes =
            numericValue(
              row.downtime_minutes,
            );

          const mttr =
            occurrences > 0
              ? downtimeMinutes /
                occurrences
              : 0;

          return {
            id:
              Number(
                row.id,
              ),

            code:
              row.code,

            name:
              row.name,

            criticality:
              row.criticality,

            criticalityJustification:
              row
                .criticality_justification,

            criticalityUpdatedAt:
              formatDatabaseDateTime(
                row
                  .criticality_updated_at,
              ),

            criticalityUpdatedBy:
              row
                .updated_by_name,

            occurrences,

            downtimeMinutes,

            mttr,

            lastEventDate:
              formatDatabaseDate(
                row
                  .last_event_date,
              ),

            lines:
              normalizeLines(
                row.line_names,
              ),
          };
        },
      );

    /* =====================================================
       RESUMO
    ===================================================== */

    const byCriticality = {
      A:
        createBucket(),

      B:
        createBucket(),

      C:
        createBucket(),

      UNCLASSIFIED:
        createBucket(),
    };

    for (
      const item
      of items
    ) {
      const key =
        item.criticality ??
        "UNCLASSIFIED";

      const bucket =
        byCriticality[
          key
        ];

      bucket.equipments +=
        1;

      if (
        item.occurrences >
        0
      ) {
        bucket.affectedEquipments +=
          1;
      }

      bucket.occurrences +=
        item.occurrences;

      bucket.downtimeMinutes +=
        item.downtimeMinutes;
    }

    const classified =
      byCriticality.A
        .equipments +
      byCriticality.B
        .equipments +
      byCriticality.C
        .equipments;

    const allLines =
      Array.from(
        new Set(
          items.flatMap(
            (
              item,
            ) =>
              item.lines,
          ),
        ),
      ).sort(
        (
          a,
          b,
        ) =>
          a.localeCompare(
            b,
            "pt-BR",
          ),
      );

    return NextResponse.json({
      success: true,

      permissions: {
        role,

        canEditCriticality:
          role ===
          "ANALISTA",
      },

      summary: {
        totalEquipments:
          items.length,

        classified,

        unclassified:
          byCriticality
            .UNCLASSIFIED
            .equipments,

        byCriticality,
      },

      filters: {
        lines:
          allLines,
      },

      items,
    });
  } catch (
    error
  ) {
    console.error(
      "Erro ao carregar criticidade dos equipamentos:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        message:
          "Não foi possível carregar os equipamentos.",
      },
      {
        status: 500,
      },
    );
  } finally {
    connection.release();
  }
}

/* =========================================================
   PATCH
========================================================= */

export async function PATCH(
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

  let body:
    PatchBody;

  try {
    body =
      (
        await request.json()
      ) as PatchBody;
  } catch {
    return NextResponse.json(
      {
        success: false,

        message:
          "Corpo da requisição inválido.",
      },
      {
        status: 400,
      },
    );
  }

  const equipmentId =
    Number(
      body.equipmentId,
    );

  if (
    !Number.isInteger(
      equipmentId,
    ) ||
    equipmentId <= 0
  ) {
    return NextResponse.json(
      {
        success: false,

        message:
          "Equipamento inválido.",
      },
      {
        status: 400,
      },
    );
  }

  const criticality =
    body.criticality ===
    null
      ? null
      : isCriticality(
            body.criticality,
          )
        ? body.criticality
        : undefined;

  if (
    criticality ===
    undefined
  ) {
    return NextResponse.json(
      {
        success: false,

        message:
          "Criticidade inválida.",
      },
      {
        status: 400,
      },
    );
  }

  const justification =
    typeof body
      .justification ===
    "string"
      ? body.justification
          .trim()
          .slice(
            0,
            2000,
          )
      : "";

  const connection =
    await getConnection();

  try {
    const userId =
      Number(
        session.userId,
      );

    const role =
      await getUserRole(
        connection,
        userId,
      );

    if (
      role !==
      "ANALISTA"
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Seu perfil possui acesso somente para visualização.",
        },
        {
          status: 403,
        },
      );
    }

    const [
      equipmentRows,
    ] =
      await connection.query<
        EquipmentExistsRow[]
      >(
        `
          SELECT
            id
          FROM equipments
          WHERE id = ?
            AND unit_id = ?
            AND active = TRUE
          LIMIT 1
        `,
        [
          equipmentId,
          session.unitId,
        ],
      );

    if (
      equipmentRows.length ===
      0
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Equipamento não encontrado nesta unidade.",
        },
        {
          status: 404,
        },
      );
    }

    const [
      result,
    ] =
      await connection.query<
        ResultSetHeader
      >(
        `
          UPDATE
            equipments

          SET
            criticality = ?,

            criticality_justification = ?,

            criticality_updated_by = ?,

            criticality_updated_at =
              NOW()

          WHERE
            id = ?

            AND unit_id = ?
        `,
        [
          criticality,

          criticality
            ? justification ||
              null
            : null,

          userId,

          equipmentId,

          session.unitId,
        ],
      );

    if (
      result.affectedRows <
      1
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Não foi possível atualizar o equipamento.",
        },
        {
          status: 409,
        },
      );
    }

    return NextResponse.json({
      success: true,

      message:
        criticality
          ? `Criticidade ${criticality} salva com sucesso.`
          : "Criticidade removida com sucesso.",
    });
  } catch (
    error
  ) {
    console.error(
      "Erro ao atualizar criticidade:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        message:
          "Não foi possível salvar a criticidade.",
      },
      {
        status: 500,
      },
    );
  } finally {
    connection.release();
  }
}