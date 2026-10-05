import { getWriteAccessError } from "@/lib/write-access";
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

import {
  buildUnitInClause,
  getUnitSelection,
} from "@/lib/unit-selection";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* =========================================================
   CATEGORIAS PERMITIDAS
========================================================= */

const ALLOWED_CATEGORIES = [
  "MECANICA",
  "ELETRICA",
  "AUTOMACAO_INSTRUMENTACAO",
  "PNEUMATICA",
  "HIDRAULICA",
  "PROCESSO",
  "OPERACIONAL",
  "QUALIDADE",
  "OUTROS",
] as const;

type Category =
  (typeof ALLOWED_CATEGORIES)[number];

/* =========================================================
   TIPOS
========================================================= */

interface EventRow
  extends RowDataPacket {
  event_id: number;

  classification_id:
    | number
    | null;

  classification_notes:
    | string
    | null;

  classification_source:
    | string
    | null;
}

interface RequestBody {
  eventId?: unknown;

  category?: unknown;

  system?: unknown;

  failureMode?: unknown;

  explanation?: unknown;
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeRequiredText(
  value: unknown,
  maxLength: number,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const text =
    value.trim();

  if (!text) {
    return null;
  }

  return text.slice(
    0,
    maxLength,
  );
}

function normalizeOptionalText(
  value: unknown,
  maxLength: number,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const text =
    value.trim();

  return text
    ? text.slice(
        0,
        maxLength,
      )
    : null;
}

/* =========================================================
   PATCH
========================================================= */

export async function PATCH(
  request: NextRequest,
) {
const session = await getSession();
  const accessError = getWriteAccessError(session);
  if (accessError) return accessError;

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
    RequestBody;

  try {
    body =
      (await request.json()) as RequestBody;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Invalid request body");
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        message:
          "Dados inválidos.",
      },
      {
        status: 400,
      },
    );
  }

  const eventId =
    Number(
      body.eventId,
    );

  const category =
    normalizeRequiredText(
      body.category,
      80,
    );

  const system =
    normalizeRequiredText(
      body.system,
      180,
    );

  const failureMode =
    normalizeRequiredText(
      body.failureMode,
      200,
    );

  const explanation =
    normalizeOptionalText(
      body.explanation,
      500,
    );

  if (
    !Number.isInteger(
      eventId,
    ) ||
    eventId <= 0
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Evento inválido.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !category ||
    !ALLOWED_CATEGORIES.includes(
      category as Category,
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Selecione uma categoria válida.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    !system ||
    !failureMode
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Informe o sistema e o modo de falha.",
      },
      {
        status: 400,
      },
    );
  }

  /* A tela de histórico lista todas as unidades
     selecionadas; a edição segue a mesma seleção. */
  const { selectedUnitIds } =
    await getUnitSelection({
      userId: session.userId,
      defaultUnitId: session.unitId,
    });

  if (selectedUnitIds.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Evento não encontrado.",
      },
      {
        status: 404,
      },
    );
  }

  const unitClause =
    buildUnitInClause(
      selectedUnitIds,
    );

  const connection =
    await getConnection();

  try {
    await connection.beginTransaction();

    /* =====================================================
       CONFIRMA EVENTO / UNIDADE
    ===================================================== */

    const [rows] =
      await connection.execute<
        EventRow[]
      >(
        `
          SELECT
            e.id AS event_id,

            ec.id
              AS classification_id,

            ec.classification_notes,

            ec.source
              AS classification_source

          FROM maintenance_events e

          LEFT JOIN event_classifications ec
            ON ec.event_id = e.id

          WHERE
            e.id = ?
            AND e.unit_id IN (${unitClause.placeholders})

          LIMIT 1

          FOR UPDATE
        `,
        [
          eventId,
          ...unitClause.values,
        ],
      );

    const event =
      rows[0];

    if (!event) {
      await connection.rollback();

      return NextResponse.json(
        {
          success: false,
          message:
            "Evento não encontrado.",
        },
        {
          status: 404,
        },
      );
    }

    const previousNotes =
      event.classification_notes;

    const newNotes =
      JSON.stringify({
        version: 2,

        category,

        system,

        failureMode,

        explanation:
          explanation ??
          "Classificação revisada manualmente.",
      });

    let classificationId:
      number;

    /* =====================================================
       ATUALIZA CLASSIFICAÇÃO EXISTENTE
    ===================================================== */

    if (
      event.classification_id
    ) {
      await connection.execute<
        ResultSetHeader
      >(
        `
          UPDATE event_classifications

          SET
            category_id = NULL,

            system_id = NULL,

            mode_id = NULL,

            classified_by_user_id = ?,

            source = 'MANUAL',

            confidence = NULL,

            status = 'CORRIGIDA',

            classification_notes = ?

          WHERE id = ?
        `,
        [
          session.userId,

          newNotes,

          event.classification_id,
        ],
      );

      classificationId =
        Number(
          event.classification_id,
        );

      /* ===================================================
         AUDITORIA
      =================================================== */

      await connection.execute<
        ResultSetHeader
      >(
        `
          INSERT INTO classification_audit (
            classification_id,
            user_id,
            previous_category_id,
            new_category_id,
            previous_failure_system_id,
            new_failure_system_id,
            previous_failure_mode_id,
            new_failure_mode_id,
            action,
            notes
          )
          VALUES (
            ?,
            ?,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            'CORRECAO',
            ?
          )
        `,
        [
          classificationId,

          session.userId,

          JSON.stringify({
            previous:
              previousNotes,

            current:
              newNotes,
          }),
        ],
      );
    } else {
      /* ===================================================
         CLASSIFICAÇÃO MANUAL NOVA
      =================================================== */

      const [
        insertResult,
      ] =
        await connection.execute<
          ResultSetHeader
        >(
          `
            INSERT INTO event_classifications (
              event_id,
              category_id,
              system_id,
              mode_id,
              classified_by_user_id,
              source,
              confidence,
              status,
              classification_notes
            )
            VALUES (
              ?,
              NULL,
              NULL,
              NULL,
              ?,
              'MANUAL',
              NULL,
              'APROVADA',
              ?
            )
          `,
          [
            eventId,

            session.userId,

            newNotes,
          ],
        );

      classificationId =
        insertResult.insertId;

      await connection.execute<
        ResultSetHeader
      >(
        `
          INSERT INTO classification_audit (
            classification_id,
            user_id,
            action,
            notes
          )
          VALUES (
            ?,
            ?,
            'CRIACAO',
            ?
          )
        `,
        [
          classificationId,

          session.userId,

          newNotes,
        ],
      );
    }

    await connection.commit();

    return NextResponse.json(
      {
        success: true,

        classification: {
          id:
            classificationId,

          source:
            "MANUAL",

          status:
            event.classification_id
              ? "CORRIGIDA"
              : "APROVADA",

          confidence:
            null,

          classifiedBy:
            session.name,

          category,

          system,

          failureMode,

          explanation:
            explanation ??
            "Classificação revisada manualmente.",

          model:
            null,
        },
      },
      {
        status: 200,
      },
    );
  } catch (error) {
    await connection.rollback();

    console.error(
      "ERRO AO ALTERAR CLASSIFICAÇÃO:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        message:
          "Não foi possível salvar a classificação.",
      },
      {
        status: 500,
      },
    );
  } finally {
    connection.release();
  }
}
