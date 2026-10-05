import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  getConnection,
} from "@/lib/db";

import {
  canTransitionMaspStatus,
  cleanText,
  FAILURE_ORIGINS,
  isOneOf,
  MASP_STATUSES,
  nullableDate,
  positiveIntegerOrNull,
} from "@/lib/masp/domain";

import {
  MaspApiError,
  maspErrorResponse,
  parseJsonBody,
  parseRouteId,
  requireAccessibleMasp,
  requireMaspContext,
} from "@/lib/masp/api";

import {
  loadMaspDetail,
  validateMaspReferences,
} from "@/lib/masp/service";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

interface CountRow
  extends RowDataPacket {
  total:
    | number
    | string;
}

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(
  _request: NextRequest,
  routeContext: RouteContext,
) {
  let connection:
    Awaited<
      ReturnType<
        typeof getConnection
      >
    > | null =
      null;

  try {
    const context =
      await requireMaspContext();

    const {
      id,
    } =
      await routeContext.params;

    const maspId =
      parseRouteId(
        id,
        "MASP",
      );

    connection =
      await getConnection();

    await requireAccessibleMasp(
      connection,
      maspId,
      context,
    );

    const detail =
      await loadMaspDetail(
        connection,
        maspId,
      );

    return NextResponse.json({
      success: true,
      ...detail,
    });
  } catch (
    error
  ) {
    return maspErrorResponse(
      error,
      "Erro ao carregar MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}

export async function PATCH(
  request: NextRequest,
  routeContext: RouteContext,
) {
  let connection:
    Awaited<
      ReturnType<
        typeof getConnection
      >
    > | null =
      null;

  try {
    const context =
      await requireMaspContext(true);

    const {
      id,
    } =
      await routeContext.params;

    const maspId =
      parseRouteId(
        id,
        "MASP",
      );

    const body =
      await parseJsonBody(
        request,
      );

    connection =
      await getConnection();

    await connection
      .beginTransaction();

    const masp =
      await requireAccessibleMasp(
        connection,
        maspId,
        context,
        true,
      );

    if (
      masp.status ===
        "CLOSED" ||
      masp.status ===
        "CANCELLED"
    ) {
      throw new MaspApiError(
        409,
        "Um MASP encerrado ou cancelado não pode ser alterado.",
      );
    }

    const assignments:
      string[] = [];

    const values:
      Array<
        number |
        string |
        null
      > = [];

    if (
      body.title !==
      undefined
    ) {
      const title =
        cleanText(
          body.title,
          180,
        );

      if (
        !title
      ) {
        throw new MaspApiError(
          400,
          "O título do MASP é obrigatório.",
        );
      }

      assignments.push(
        "title = ?",
      );
      values.push(
        title,
      );
    }

    if (
      body.problemStatement !==
      undefined
    ) {
      const statement =
        cleanText(
          body.problemStatement,
          10000,
        );

      if (
        !statement
      ) {
        throw new MaspApiError(
          400,
          "A descrição do problema é obrigatória.",
        );
      }

      assignments.push(
        "problem_statement = ?",
      );
      values.push(
        statement,
      );
    }

    const equipmentId =
      body.equipmentId ===
        null
        ? null
        : positiveIntegerOrNull(
            body.equipmentId,
          );

    const productionLineId =
      body.productionLineId ===
        null
        ? null
        : positiveIntegerOrNull(
            body.productionLineId,
          );

    const ownerUserId =
      body.ownerUserId ===
        null
        ? null
        : positiveIntegerOrNull(
            body.ownerUserId,
          );

    if (
      body.equipmentId !==
        undefined ||
      body.productionLineId !==
        undefined ||
      body.ownerUserId !==
        undefined
    ) {
      await validateMaspReferences(
        connection,
        Number(
          masp.unit_id,
        ),
        body.equipmentId !==
          undefined
          ? equipmentId
          : masp.equipment_id,
        body.productionLineId !==
          undefined
          ? productionLineId
          : masp.production_line_id,
        body.ownerUserId !==
          undefined
          ? ownerUserId
          : null,
      );
    }

    const nullableReferences = [
      [
        "equipment_id",
        "equipmentId",
        equipmentId,
      ],
      [
        "production_line_id",
        "productionLineId",
        productionLineId,
      ],
      [
        "owner_user_id",
        "ownerUserId",
        ownerUserId,
      ],
    ] as const;

    for (
      const [
        column,
        field,
        value,
      ]
      of nullableReferences
    ) {
      if (
        body[field] !==
        undefined
      ) {
        if (
          body[field] !==
            null &&
          value ===
            null
        ) {
          throw new MaspApiError(
            400,
            `${field} inválido.`,
          );
        }

        assignments.push(
          `${column} = ?`,
        );
        values.push(
          value,
        );
      }
    }

    const dateFields = [
      [
        "scope_start_date",
        "scopeStartDate",
      ],
      [
        "scope_end_date",
        "scopeEndDate",
      ],
    ] as const;

    /* Datas efetivas após o PATCH, para validar a ordem. */
    const scopeDates: Record<
      (typeof dateFields)[number][1],
      string | null
    > = {
      scopeStartDate:
        nullableDate(
          masp.scope_start_date,
        ),
      scopeEndDate:
        nullableDate(
          masp.scope_end_date,
        ),
    };

    for (
      const [
        column,
        field,
      ]
      of dateFields
    ) {
      if (
        body[field] !==
        undefined
      ) {
        const value =
          nullableDate(
            body[field],
          );

        if (
          body[field] !==
            null &&
          body[field] !==
            "" &&
          value ===
            null
        ) {
          throw new MaspApiError(
            400,
            `${field} inválido.`,
          );
        }

        scopeDates[field] =
          value;

        assignments.push(
          `${column} = ?`,
        );
        values.push(
          value,
        );
      }
    }

    if (
      scopeDates.scopeStartDate &&
      scopeDates.scopeEndDate &&
      scopeDates.scopeStartDate >
        scopeDates.scopeEndDate
    ) {
      throw new MaspApiError(
        400,
        "A data inicial do escopo não pode ser posterior à data final.",
      );
    }

    const textFields = [
      [
        "recurrence_component_code",
        "recurrenceComponentCode",
        120,
      ],
      [
        "recurrence_failure_mode",
        "recurrenceFailureMode",
        255,
      ],
    ] as const;

    for (
      const [
        column,
        field,
        maxLength,
      ]
      of textFields
    ) {
      if (
        body[field] !==
        undefined
      ) {
        assignments.push(
          `${column} = ?`,
        );
        values.push(
          cleanText(
            body[field],
            maxLength,
          ) || null,
        );
      }
    }

    if (
      body.recurrenceFailureOrigin !==
      undefined
    ) {
      if (
        body.recurrenceFailureOrigin !==
          null &&
        !isOneOf(
          body.recurrenceFailureOrigin,
          FAILURE_ORIGINS,
        )
      ) {
        throw new MaspApiError(
          400,
          "Origem de recorrência inválida.",
        );
      }

      assignments.push(
        "recurrence_failure_origin = ?",
      );
      values.push(
        body.recurrenceFailureOrigin as
          | string
          | null,
      );
    }

    if (
      body.verificationDays !==
      undefined
    ) {
      const days =
        Number(
          body.verificationDays,
        );

      if (
        !Number.isInteger(
          days,
        ) ||
        days < 1 ||
        days > 365
      ) {
        throw new MaspApiError(
          400,
          "O período de verificação deve estar entre 1 e 365 dias.",
        );
      }

      assignments.push(
        "verification_days = ?",
      );
      values.push(
        days,
      );
    }

    if (
      body.status !==
      undefined
    ) {
      if (
        !isOneOf(
          body.status,
          MASP_STATUSES,
        )
      ) {
        throw new MaspApiError(
          400,
          "Status do MASP inválido.",
        );
      }

      if (
        !canTransitionMaspStatus(
          masp.status,
          body.status,
        )
      ) {
        throw new MaspApiError(
          409,
          `Transição de ${masp.status} para ${body.status} não permitida.`,
        );
      }

      /* Cada etapa exige o registro mínimo da anterior. */
      const stepRequirement: Partial<
        Record<
          string,
          {
            sql: string;
            message: string;
          }
        >
      > = {
        ROOT_CAUSE: {
          sql: "SELECT COUNT(*) AS total FROM masp_hypotheses WHERE masp_id = ? AND status <> 'DISCARDED'",
          message:
            "Registre ao menos uma hipótese antes de avançar para a causa raiz.",
        },
        ACTION_PLAN: {
          sql: "SELECT COUNT(*) AS total FROM masp_root_causes WHERE masp_id = ? AND status = 'CONFIRMED'",
          message:
            "Confirme ao menos uma causa raiz antes de avançar para o plano de ação.",
        },
        EXECUTION: {
          sql: "SELECT COUNT(*) AS total FROM masp_actions WHERE masp_id = ? AND status <> 'CANCELLED'",
          message:
            "Cadastre ao menos uma ação antes de avançar para a execução.",
        },
        VERIFICATION: {
          sql: "SELECT COUNT(*) AS total FROM masp_actions WHERE masp_id = ? AND status = 'DONE'",
          message:
            "Conclua ao menos uma ação antes de avançar para a verificação.",
        },
      };

      const requirement =
        body.status !==
          masp.status
          ? stepRequirement[
              body.status
            ]
          : undefined;

      if (
        requirement
      ) {
        const [
          requirementRows,
        ] =
          await connection.query<
            CountRow[]
          >(
            requirement.sql,
            [
              maspId,
            ],
          );

        if (
          Number(
            requirementRows[0]
              ?.total ??
              0,
          ) < 1
        ) {
          throw new MaspApiError(
            400,
            requirement.message,
          );
        }
      }

      if (
        body.status ===
        "CLOSED"
      ) {
        const [
          counts,
        ] =
          await connection.query<
            CountRow[]
          >(
            `
              SELECT
                  (
                      SELECT COUNT(*)
                      FROM masp_root_causes
                      WHERE masp_id = ?
                        AND status = 'CONFIRMED'
                  ) AS confirmed_causes,
                  (
                      SELECT COUNT(*)
                      FROM masp_actions
                      WHERE masp_id = ?
                        AND status = 'DONE'
                  ) AS done_actions,
                  (
                      SELECT COUNT(*)
                      FROM masp_verifications
                      WHERE masp_id = ?
                  ) AS verifications,
                  (
                      SELECT recurrence_detected
                      FROM masp_verifications
                      WHERE masp_id = ?
                      ORDER BY verified_at DESC, id DESC
                      LIMIT 1
                  ) AS latest_recurrence
            `,
            [
              maspId,
              maspId,
              maspId,
              maspId,
            ],
          );

        const criteria =
          counts[0] as
            CountRow & {
              confirmed_causes:
                | number
                | string;
              done_actions:
                | number
                | string;
              verifications:
                | number
                | string;
              latest_recurrence:
                | number
                | string
                | null;
            };

        if (
          Number(
            criteria
              .confirmed_causes,
          ) < 1 ||
          Number(
            criteria
              .done_actions,
          ) < 1 ||
          Number(
            criteria
              .verifications,
          ) < 1
        ) {
          throw new MaspApiError(
            400,
            "Para encerrar o MASP, confirme uma causa raiz, conclua uma ação e registre uma verificação.",
          );
        }

        if (
          Number(
            criteria
              .latest_recurrence ??
              0,
          ) === 1
        ) {
          throw new MaspApiError(
            400,
            "A última verificação detectou recorrência. Volte para o plano de ação ou registre nova verificação.",
          );
        }

        assignments.push(
          "closed_at = NOW()",
        );
      }

      assignments.push(
        "status = ?",
      );
      values.push(
        body.status,
      );
    }

    if (
      assignments.length ===
      0
    ) {
      throw new MaspApiError(
        400,
        "Nenhum campo válido foi informado.",
      );
    }

    await connection.query(
      `
        UPDATE
            masp_analyses
        SET
            ${assignments.join(", ")}
        WHERE
            id = ?
            AND unit_id = ?
      `,
      [
        ...values,
        maspId,
        masp.unit_id,
      ],
    );

    await connection
      .commit();

    return NextResponse.json({
      success: true,
    });
  } catch (
    error
  ) {
    if (
      connection
    ) {
      await connection
        .rollback();
    }

    return maspErrorResponse(
      error,
      "Erro ao atualizar MASP:",
    );
  } finally {
    connection
      ?.release();
  }
}
