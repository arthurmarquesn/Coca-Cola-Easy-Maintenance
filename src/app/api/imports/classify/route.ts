import { publicErrorMessage } from "@/lib/errors";
import { getWriteAccessError } from "@/lib/write-access";
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
  getSession,
} from "@/lib/session";

import {
  classifyImportWithMl,
} from "@/lib/ml/classify-import";

import {
  buildUnitInClause,
  getUnitSelection,
} from "@/lib/unit-selection";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const maxDuration =
  300;


/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const ML_BATCH_SIZE =
  250;


/* =========================================================
   TIPOS
========================================================= */

interface ClassifyBody {
  importId?: unknown;
}


interface ImportUnitRow
  extends RowDataPacket {
  unit_id:
    number | string;
}


interface ClassificationSummaryRow
  extends RowDataPacket {
  total_events:
    number | string | null;

  classified_events:
    number | string | null;
}


type MlResult =
  Awaited<
    ReturnType<
      typeof classifyImportWithMl
    >
  >;


interface UnitMlResult {
  unitId: number;

  success: boolean;

  result:
    MlResult | null;

  error:
    string | null;
}


/* =========================================================
   HELPERS
========================================================= */

function toNumber(
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


function uniqueNumbers(
  values:
    Array<
      number | string
    >,
): number[] {
  return Array.from(
    new Set(
      values
        .map(
          (
            value,
          ) =>
            Number(
              value,
            ),
        )
        .filter(
          (
            value,
          ) =>
            Number.isInteger(
              value,
            ) &&
            value > 0,
        ),
    ),
  );
}


/* =========================================================
   POST
========================================================= */

export async function POST(
  request: NextRequest,
) {
  /* =======================================================
     SESSÃO
  ======================================================= */

const session = await getSession();
  const accessError = getWriteAccessError(session);
  if (accessError) return accessError;


  if (!session) {
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


  /* =======================================================
     BODY
  ======================================================= */

  let body:
    ClassifyBody;


  try {
    body =
      (await request.json()) as
        ClassifyBody;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid request body");
    }
  } catch {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Corpo da requisição inválido.",
      },
      {
        status:
          400,
      },
    );
  }


  const importId =
    Number(
      body.importId,
    );


  if (
    !Number.isInteger(
      importId,
    ) ||
    importId <= 0
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Importação inválida.",
      },
      {
        status:
          400,
      },
    );
  }


  try {
    /* =====================================================
       UNIDADES SELECIONADAS

       getUnitSelection já limita a seleção às unidades às
       quais o usuário possui acesso.
    ===================================================== */

    const unitSelection =
      await getUnitSelection({
        userId:
          session.userId,

        defaultUnitId:
          session.unitId,
      });


    if (
      unitSelection
        .selectedUnitIds
        .length ===
      0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Nenhuma unidade válida está selecionada.",
        },
        {
          status:
            403,
        },
      );
    }


    const selectedUnitFilter =
      buildUnitInClause(
        unitSelection
          .selectedUnitIds,
      );


    /* =====================================================
       UNIDADES DA IMPORTAÇÃO QUE ESTÃO SELECIONADAS

       Não confiamos em um unitId vindo do front.

       O importId é cruzado com maintenance_events e somente
       unidades simultaneamente:

       - presentes na importação;
       - autorizadas ao usuário;
       - selecionadas no filtro global;

       poderão ser processadas.
    ===================================================== */

    const connection =
      await getConnection();


    let importUnitIds:
      number[] =
        [];


    try {
      const [
        unitRows,
      ] =
        await connection.query<
          ImportUnitRow[]
        >(
          `
            SELECT DISTINCT
                me.unit_id

            FROM
                maintenance_events me

            WHERE
                me.import_id = ?

                AND me.unit_id IN (
                  ${selectedUnitFilter.placeholders}
                )

            ORDER BY
                me.unit_id ASC
          `,
          [
            importId,

            ...selectedUnitFilter.values,
          ],
        );


      importUnitIds =
        uniqueNumbers(
          unitRows.map(
            (
              row,
            ) =>
              row.unit_id,
          ),
        );
    } finally {
      connection.release();
    }


    if (
      importUnitIds.length ===
      0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "A importação não possui eventos nas unidades atualmente selecionadas.",
        },
        {
          status:
            404,
        },
      );
    }


    /* =====================================================
       CLASSIFICAÇÃO POR UNIDADE

       classifyImportWithMl trabalha com uma unidade por vez.
       Portanto executamos o motor individualmente para cada
       unidade selecionada presente na importação.
    ===================================================== */

    const results:
      UnitMlResult[] =
        [];


    for (
      const unitId
      of importUnitIds
    ) {
      try {
        const result =
          await classifyImportWithMl({
            importId,

            unitId,

            batchSize:
              ML_BATCH_SIZE,
          });


        results.push({
          unitId,

          success:
            true,

          result,

          error:
            null,
        });
      } catch (
        error
      ) {
        const message =
          publicErrorMessage(
            error,
            "Erro desconhecido durante a classificação.",
          );


        console.error(
          `Erro ao classificar importação ${importId}, unidade ${unitId}:`,
          error,
        );


        results.push({
          unitId,

          success:
            false,

          result:
            null,

          error:
            message,
        });
      }
    }


    const successfulResults =
      results.filter(
        (
          item,
        ) =>
          item.success &&
          item.result,
      );


    if (
      successfulResults.length ===
      0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Não foi possível executar o classificador nas unidades selecionadas.",

          units:
            results,
        },
        {
          status:
            500,
        },
      );
    }


    const availableResults =
      successfulResults.filter(
        (
          item,
        ) =>
          item.result
            ?.available,
      );


    if (
      availableResults.length ===
      0
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "O serviço de classificação ML está indisponível no momento.",

          units:
            results,
        },
        {
          status:
            503,
        },
      );
    }


    /* =====================================================
       RESUMO AGREGADO

       O front atual espera um único AIResult.

       totalEvents:
         eventos classificáveis da importação nas unidades
         selecionadas (observação preenchida).

       classifiedEvents:
         evento que já possui uma classificação oficial OU
         uma sugestão ML ativa/não descartada.

       Assim um evento nunca é contado duas vezes, mesmo que
       existam várias versões históricas do modelo.
    ===================================================== */

    const importUnitFilter =
      buildUnitInClause(
        importUnitIds,
      );


    const summaryConnection =
      await getConnection();


    let totalEvents =
      0;

    let classifiedEvents =
      0;


    try {
      const [
        summaryRows,
      ] =
        await summaryConnection.query<
          ClassificationSummaryRow[]
        >(
          `
            SELECT
                COUNT(*) AS total_events,

                SUM(
                  CASE
                    WHEN
                      EXISTS (
                        SELECT 1

                        FROM
                            event_classifications ec

                        WHERE
                            ec.event_id =
                              me.id

                            AND ec.status IN (
                              'PENDENTE_REVISAO',
                              'APROVADA',
                              'CORRIGIDA'
                            )
                      )

                      OR

                      EXISTS (
                        SELECT 1

                        FROM
                            classification_suggestions cs

                        WHERE
                            cs.event_id =
                              me.id

                            AND cs.model_type =
                              'ML'

                            AND cs.status IN (
                              'PENDENTE_REVISAO',
                              'CONFIRMADA',
                              'CORRIGIDA'
                            )
                      )
                    THEN 1
                    ELSE 0
                  END
                ) AS classified_events

            FROM
                maintenance_events me

            WHERE
                me.import_id = ?

                AND me.unit_id IN (
                  ${importUnitFilter.placeholders}
                )

                AND me.observation
                    IS NOT NULL

                AND TRIM(
                    me.observation
                ) <> ''
          `,
          [
            importId,

            ...importUnitFilter.values,
          ],
        );


      const summary =
        summaryRows[0];


      totalEvents =
        toNumber(
          summary
            ?.total_events,
        );


      classifiedEvents =
        toNumber(
          summary
            ?.classified_events,
        );
    } finally {
      summaryConnection
        .release();
    }


    const pendingEvents =
      Math.max(
        totalEvents -
          classifiedEvents,
        0,
      );


    const eventsClassifiedThisRun =
      availableResults.reduce(
        (
          total,
          item,
        ) =>
          total +
          toNumber(
            item.result
              ?.inserted,
          ),
        0,
      );


    const modelVersions =
      Array.from(
        new Set(
          availableResults
            .map(
              (
                item,
              ) =>
                item.result
                  ?.modelVersion
                  ?.trim() ??
                "",
            )
            .filter(
              Boolean,
            ),
        ),
      );


    const model =
      modelVersions.length >
      0
        ? modelVersions.join(
            " + ",
          )
        : "ML";


    const hasPartialResult =
      results.some(
        (
          item,
        ) =>
          !item.success ||
          item.result
            ?.status ===
            "PARTIAL",
      );


    /* =====================================================
       UNIDADES PARA DIAGNÓSTICO
    ===================================================== */

    const selectedUnitSet =
      new Set(
        importUnitIds,
      );


    const units =
      unitSelection
        .units
        .filter(
          (
            unit,
          ) =>
            selectedUnitSet.has(
              unit.id,
            ),
        )
        .map(
          (
            unit,
          ) => ({
            id:
              unit.id,

            code:
              unit.code,

            name:
              unit.name,

            city:
              unit.city,

            state:
              unit.state,
          }),
        );


    /* =====================================================
       RESPOSTA

       Mantemos o formato esperado pela página de importação.
    ===================================================== */

    return NextResponse.json({
      success:
        true,

      ai: {
        model,

        groupsAnalyzed:
          importUnitIds.length,

        eventsClassifiedThisRun,

        totalEvents,

        classifiedEvents,

        pendingEvents,

        limitReached:
          hasPartialResult,
      },

      importId,

      units,

      unitResults:
        results,
    });
  } catch (
    error
  ) {
    console.error(
      "Erro ao executar classificação automática:",
      error,
    );


    return NextResponse.json(
      {
        success:
          false,

        message:
          publicErrorMessage(
            error,
            "Não foi possível concluir a classificação automática.",
          ),
      },
      {
        status:
          500,
      },
    );
  }
}
