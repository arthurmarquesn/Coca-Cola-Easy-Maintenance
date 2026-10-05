import { getWriteAccessError } from "@/lib/write-access";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { getSession } from "@/lib/session";
import { normalizeHeader } from "@/lib/imports/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_EXTENSIONS = [
  ".xlsx",
  ".xlsm",
];

const REQUIRED_COLUMNS = [
  "Centro",
  "Data Inicio Real",
  "Linha",
  "Tipo de Parada",
  "Material",
  "Ordem",
  "Descrição do Material",
  "Turno",
  "Intervalo",
  "chave do parada",
  "Subchave de Parada",
  "chave 1 de parada",
  "Observações",
  "Pros. Efi. Perdid.",
  "Ptos. Acumilados",
  "Caixas Produzidas",
  "Total minutos",
  "Minutos de paradas",
] as const;

/* =========================================================
   EXTENSÃO
========================================================= */

function getFileExtension(
  filename: string,
): string {
  const dotIndex =
    filename.lastIndexOf(".");

  if (dotIndex === -1) {
    return "";
  }

  return filename
    .slice(dotIndex)
    .toLowerCase();
}

/* =========================================================
   POST /api/imports/preview
========================================================= */

export async function POST(
  request: Request,
) {
  try {
    /* =====================================================
       SESSÃO
    ===================================================== */

const session = await getSession();
  const accessError = getWriteAccessError(session);
  if (accessError) return accessError;

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

    /* =====================================================
       FORM DATA
    ===================================================== */

    const formData =
      await request.formData();

    const file =
      formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Nenhum arquivo foi enviado.",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       VALIDAÇÃO DO ARQUIVO
    ===================================================== */

    if (file.size === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "O arquivo está vazio.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      file.size >
      MAX_FILE_SIZE
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "O arquivo ultrapassa o limite de 50 MB.",
        },
        {
          status: 400,
        },
      );
    }

    const extension =
      getFileExtension(
        file.name,
      );

    if (
      !ALLOWED_EXTENSIONS.includes(
        extension,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Utilize um arquivo .xlsx ou .xlsm.",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       CARREGA EXCEL
    ===================================================== */

    const arrayBuffer =
      await file.arrayBuffer();

    const workbook =
      XLSX.read(
        arrayBuffer,
        {
          type: "array",
          raw: true,
          cellDates: false,
        },
      );

    if (
      workbook.SheetNames.length ===
      0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Nenhuma aba foi encontrada na planilha.",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       COLUNAS ESPERADAS NORMALIZADAS
    ===================================================== */

    const requiredColumns =
      REQUIRED_COLUMNS.map(
        (column) => ({
          original: column,
          normalized:
            normalizeHeader(
              column,
            ),
        }),
      );

    /* =====================================================
       PROCURA AUTOMATICAMENTE A ABA CORRETA

       Não assumimos nome de aba.

       Também não assumimos que o cabeçalho esteja
       obrigatoriamente na primeira linha.

       Procuramos nas primeiras 30 linhas.
    ===================================================== */

    let selectedSheetName:
      | string
      | null = null;

    let selectedHeaderRow =
      -1;

    let selectedHeaders:
      string[] = [];

    let selectedScore =
      -1;

    let selectedLastRow =
      -1;

    for (
      const sheetName of
      workbook.SheetNames
    ) {
      const worksheet =
        workbook.Sheets[
          sheetName
        ];

      if (
        !worksheet ||
        !worksheet["!ref"]
      ) {
        continue;
      }

      const range =
        XLSX.utils.decode_range(
          worksheet["!ref"],
        );

      const lastCandidateRow =
        Math.min(
          range.e.r,
          range.s.r + 29,
        );

      for (
        let rowIndex =
          range.s.r;
        rowIndex <=
        lastCandidateRow;
        rowIndex++
      ) {
        const headers: string[] =
          [];

        const normalizedHeaders =
          new Set<string>();

        for (
          let columnIndex =
            range.s.c;
          columnIndex <=
          range.e.c;
          columnIndex++
        ) {
          const address =
            XLSX.utils.encode_cell(
              {
                r: rowIndex,
                c: columnIndex,
              },
            );

          const cell =
            worksheet[address];

          const value =
            cell?.v ?? "";

          const header =
            String(value)
              .trim();

          headers.push(
            header,
          );

          if (header) {
            normalizedHeaders.add(
              normalizeHeader(
                header,
              ),
            );
          }
        }

        const score =
          requiredColumns.filter(
            (column) =>
              normalizedHeaders.has(
                column.normalized,
              ),
          ).length;

        if (
          score >
          selectedScore
        ) {
          selectedScore =
            score;

          selectedSheetName =
            sheetName;

          selectedHeaderRow =
            rowIndex;

          selectedHeaders =
            headers;

          selectedLastRow =
            range.e.r;
        }
      }
    }

    /* =====================================================
       NÃO ENCONTROU PLANILHA COMPATÍVEL
    ===================================================== */

    if (
      !selectedSheetName ||
      selectedHeaderRow < 0 ||
      selectedScore <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Não foi possível localizar a estrutura de apontamentos na planilha.",
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       VERIFICA COLUNAS AUSENTES
    ===================================================== */

    const normalizedDetectedColumns =
      new Set(
        selectedHeaders
          .filter(Boolean)
          .map(
            normalizeHeader,
          ),
      );

    const missingColumns =
      requiredColumns
        .filter(
          (column) =>
            !normalizedDetectedColumns.has(
              column.normalized,
            ),
        )
        .map(
          (column) =>
            column.original,
        );

    /* =====================================================
       QUANTIDADE APROXIMADA DE REGISTROS

       header = linha zero-based.
       A linha seguinte já é o primeiro registro.
    ===================================================== */

    const totalRows =
      Math.max(
        0,
        selectedLastRow -
          selectedHeaderRow,
      );

    const valid =
      missingColumns.length ===
      0;

    /* =====================================================
       RESPOSTA
    ===================================================== */

    return NextResponse.json(
      {
        success: true,

        preview: {
          valid,

          filename:
            file.name,

          fileSize:
            file.size,

          sheetName:
            selectedSheetName,

          headerRow:
            selectedHeaderRow +
            1,

          totalRows,

          detectedColumns:
            selectedHeaders.filter(
              Boolean,
            ),

          expectedColumns:
            REQUIRED_COLUMNS,

          missingColumns,
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
      "ERRO AO ANALISAR PLANILHA",
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
          "Não foi possível analisar a planilha.",
      },
      {
        status: 500,
      },
    );
  }
}
