import { createHash } from "crypto";

import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

import { getConnection } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const MAX_FILE_SIZE =
  50 * 1024 * 1024;

const BATCH_SIZE = 500;

const ALLOWED_EXTENSIONS = [
  ".xlsx",
  ".xlsm",
];

/* =========================================================
   COLUNAS
========================================================= */

const COLUMNS = {
  center: "Centro",
  eventDate: "Data Inicio Real",
  line: "Linha",
  stopType: "Tipo de Parada",
  material: "Material",
  order: "Ordem",
  materialDescription: "Descrição do Material",
  shift: "Turno",
  interval: "Intervalo",
  equipment: "chave do parada",
  stopSubkey: "Subchave de Parada",
  stopKey1: "chave 1 de parada",
  observation: "Observações",
  efficiencyLoss: "Pros. Efi. Perdid.",
  accumulatedPoints: "Ptos. Acumilados",
  producedCases: "Caixas Produzidas",
  totalMinutes: "Total minutos",
  downtimeMinutes: "Minutos de paradas",
} as const;

const REQUIRED_COLUMNS =
  Object.values(COLUMNS);

/* =========================================================
   TIPOS
========================================================= */

interface UnitRow extends RowDataPacket {
  id: number;
  code: string;
  sap_code: string | null;
  name: string;
  city: string | null;
}

interface ExistingImportRow
  extends RowDataPacket {
  id: number;
}

interface RawRowId
  extends RowDataPacket {
  id: number;
  source_row_number: number;
}

interface WorksheetStructure {
  sheetName: string;
  worksheet: XLSX.WorkSheet;
  range: XLSX.Range;
  headerRow: number;

  columnIndexes: Map<
    string,
    number
  >;
}

interface PreparedRow {
  sourceRowNumber: number;

  rawData: Record<
    string,
    unknown
  >;

  rowHash: string;

  event: {
    sourceOrderNumber:
      | string
      | null;

    eventDate:
      | string
      | null;

    shift:
      | string
      | null;

    intervalLabel:
      | string
      | null;

    intervalStart:
      | string
      | null;

    intervalEnd:
      | string
      | null;

    sourceLineName:
      | string
      | null;

    sourceStopType:
      | string
      | null;

    sourceMaterialCode:
      | string
      | null;

    sourceMaterialDescription:
      | string
      | null;

    sourceEquipmentName:
      | string
      | null;

    sourceStopSubkey:
      | string
      | null;

    sourceStopKey1:
      | string
      | null;

    observation:
      | string
      | null;

    processEfficiencyLoss:
      | number
      | null;

    accumulatedPoints:
      | number
      | null;

    producedCases:
      | number
      | null;

    totalMinutes:
      | number
      | null;

    downtimeMinutes:
      | number
      | null;
  };
}

/* =========================================================
   NORMALIZAÇÃO
========================================================= */

function normalizeText(
  value: unknown,
): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .trim();
}

function normalizeIdentifier(
  value: unknown,
): string {
  return normalizeText(
    value,
  ).replace(/\s+/g, "");
}

function digitsOnly(
  value: unknown,
): string {
  return String(value ?? "")
    .replace(/\D/g, "");
}

function toText(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text
    ? text
    : null;
}

function isBlank(
  value: unknown,
): boolean {
  return (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  );
}

/* =========================================================
   IDENTIFICAÇÃO DA UNIDADE

   Não existe hardcode de Marília.

   A correspondência é construída utilizando os dados
   cadastrados na tabela units.
========================================================= */

function centerMatchesUnit(
  centerValue: unknown,
  unit: UnitRow,
): boolean {
  const center =
    normalizeIdentifier(
      centerValue,
    );

  if (!center) {
    return false;
  }

  const identifiers =
    [
      unit.code,
      unit.sap_code,
      unit.name,
      unit.city,
    ]
      .filter(
        (
          value,
        ): value is string =>
          Boolean(value),
      )
      .map(
        normalizeIdentifier,
      )
      .filter(Boolean);

  if (
    identifiers.includes(
      center,
    )
  ) {
    return true;
  }

  /* =======================================================
     SAP

     Exemplo:

     cadastrado:
     BR1110

     planilha:
     1110
  ======================================================= */

  const sapDigits =
    digitsOnly(
      unit.sap_code,
    );

  const centerDigits =
    digitsOnly(
      centerValue,
    );

  if (
    sapDigits &&
    centerDigits &&
    sapDigits ===
      centerDigits
  ) {
    return true;
  }

  /* =======================================================
     Alguns arquivos podem trazer algo como:

     "BR1110 - MARILIA"

     Neste caso aceitamos a presença do identificador
     completo dentro do campo.
  ======================================================= */

  for (
    const identifier of
    identifiers
  ) {
    if (
      identifier.length >= 4 &&
      center.includes(
        identifier,
      )
    ) {
      return true;
    }
  }

  return false;
}

/* =========================================================
   NÚMEROS
========================================================= */

function toNumber(
  value: unknown,
): number | null {
  if (
    typeof value === "number"
  ) {
    return Number.isFinite(
      value,
    )
      ? value
      : null;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  let text =
    String(value)
      .trim()
      .replace(/\s/g, "");

  if (!text) {
    return null;
  }

  text =
    text.replace(/%$/, "");

  const commaIndex =
    text.lastIndexOf(",");

  const dotIndex =
    text.lastIndexOf(".");

  if (
    commaIndex !== -1 &&
    dotIndex !== -1
  ) {
    if (
      commaIndex >
      dotIndex
    ) {
      text =
        text
          .replace(/\./g, "")
          .replace(",", ".");
    } else {
      text =
        text.replace(/,/g, "");
    }
  } else if (
    commaIndex !== -1
  ) {
    text =
      text.replace(",", ".");
  }

  const number =
    Number(text);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

/* =========================================================
   DATA
========================================================= */

function formatDateParts(
  year: number,
  month: number,
  day: number,
): string | null {
  if (
    !year ||
    !month ||
    !day
  ) {
    return null;
  }

  const yyyy =
    String(year).padStart(
      4,
      "0",
    );

  const mm =
    String(month).padStart(
      2,
      "0",
    );

  const dd =
    String(day).padStart(
      2,
      "0",
    );

  return `${yyyy}-${mm}-${dd}`;
}

function toDate(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    value instanceof Date &&
    !Number.isNaN(
      value.getTime(),
    )
  ) {
    return formatDateParts(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
    );
  }

  if (
    typeof value === "number"
  ) {
    const parsed =
      XLSX.SSF.parse_date_code(
        value,
      );

    if (!parsed) {
      return null;
    }

    return formatDateParts(
      parsed.y,
      parsed.m,
      parsed.d,
    );
  }

  const text =
    String(value).trim();

  const brazilian =
    text.match(
      /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/,
    );

  if (brazilian) {
    return formatDateParts(
      Number(
        brazilian[3],
      ),
      Number(
        brazilian[2],
      ),
      Number(
        brazilian[1],
      ),
    );
  }

  const iso =
    text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})/,
    );

  if (iso) {
    return formatDateParts(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
    );
  }

  return null;
}

/* =========================================================
   INTERVALO
========================================================= */

function parseInterval(
  value: unknown,
): {
  label: string | null;
  start: string | null;
  end: string | null;
} {
  const label =
    toText(value);

  if (!label) {
    return {
      label: null,
      start: null,
      end: null,
    };
  }

  const times =
    label.match(
      /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g,
    );

  if (
    !times ||
    times.length < 2
  ) {
    return {
      label,
      start: null,
      end: null,
    };
  }

  function normalizeTime(
    time: string,
  ) {
    const [
      hour,
      minute,
    ] =
      time.split(":");

    return `${hour.padStart(
      2,
      "0",
    )}:${minute}:00`;
  }

  return {
    label,

    start:
      normalizeTime(
        times[0],
      ),

    end:
      normalizeTime(
        times[1],
      ),
  };
}

/* =========================================================
   EXTENSÃO
========================================================= */

function getFileExtension(
  filename: string,
): string {
  const index =
    filename.lastIndexOf(".");

  if (index === -1) {
    return "";
  }

  return filename
    .slice(index)
    .toLowerCase();
}

/* =========================================================
   LOCALIZA ABA E CABEÇALHO
========================================================= */

function findWorksheetStructure(
  workbook: XLSX.WorkBook,
): WorksheetStructure | null {
  const normalizedRequired =
    REQUIRED_COLUMNS.map(
      (column) => ({
        original: column,

        normalized:
          normalizeText(
            column,
          ),
      }),
    );

  let best:
    | WorksheetStructure
    | null = null;

  let bestScore = -1;

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

    const lastHeaderCandidate =
      Math.min(
        range.e.r,
        range.s.r + 29,
      );

    for (
      let row =
        range.s.r;
      row <=
      lastHeaderCandidate;
      row++
    ) {
      const detectedColumns =
        new Map<
          string,
          number
        >();

      for (
        let column =
          range.s.c;
        column <=
        range.e.c;
        column++
      ) {
        const cell =
          worksheet[
            XLSX.utils.encode_cell({
              r: row,
              c: column,
            })
          ];

        const header =
          normalizeText(
            cell?.v,
          );

        if (header) {
          detectedColumns.set(
            header,
            column,
          );
        }
      }

      const score =
        normalizedRequired.filter(
          (column) =>
            detectedColumns.has(
              column.normalized,
            ),
        ).length;

      if (
        score >
        bestScore
      ) {
        const columnIndexes =
          new Map<
            string,
            number
          >();

        for (
          const column of
          normalizedRequired
        ) {
          const index =
            detectedColumns.get(
              column.normalized,
            );

          if (
            index !== undefined
          ) {
            columnIndexes.set(
              column.original,
              index,
            );
          }
        }

        bestScore =
          score;

        best = {
          sheetName,
          worksheet,
          range,
          headerRow: row,
          columnIndexes,
        };
      }
    }
  }

  if (
    !best ||
    bestScore !==
      REQUIRED_COLUMNS.length
  ) {
    return null;
  }

  return best;
}

/* =========================================================
   LÊ CÉLULA
========================================================= */

function readCell(
  structure: WorksheetStructure,
  row: number,
  columnName: string,
): unknown {
  const column =
    structure.columnIndexes.get(
      columnName,
    );

  if (
    column === undefined
  ) {
    return null;
  }

  const address =
    XLSX.utils.encode_cell({
      r: row,
      c: column,
    });

  return (
    structure.worksheet[
      address
    ]?.v ?? null
  );
}

/* =========================================================
   RAW DATA
========================================================= */

function createRawData(
  structure: WorksheetStructure,
  row: number,
): Record<
  string,
  unknown
> {
  const result: Record<
    string,
    unknown
  > = {};

  for (
    const column of
    REQUIRED_COLUMNS
  ) {
    result[column] =
      readCell(
        structure,
        row,
        column,
      );
  }

  return result;
}

function isEmptyDataRow(
  rawData: Record<
    string,
    unknown
  >,
): boolean {
  return REQUIRED_COLUMNS.every(
    (column) =>
      isBlank(
        rawData[column],
      ),
  );
}

/* =========================================================
   PREPARA EVENTO
========================================================= */

function prepareRow(
  sourceRowNumber: number,
  rawData: Record<
    string,
    unknown
  >,
): PreparedRow {
  const interval =
    parseInterval(
      rawData[
        COLUMNS.interval
      ],
    );

  const rawJson =
    JSON.stringify(
      rawData,
    );

  const rowHash =
    createHash("sha256")
      .update(rawJson)
      .digest("hex");

  return {
    sourceRowNumber,

    rawData,

    rowHash,

    event: {
      sourceOrderNumber:
        toText(
          rawData[
            COLUMNS.order
          ],
        ),

      eventDate:
        toDate(
          rawData[
            COLUMNS.eventDate
          ],
        ),

      shift:
        toText(
          rawData[
            COLUMNS.shift
          ],
        ),

      intervalLabel:
        interval.label,

      intervalStart:
        interval.start,

      intervalEnd:
        interval.end,

      sourceLineName:
        toText(
          rawData[
            COLUMNS.line
          ],
        ),

      sourceStopType:
        toText(
          rawData[
            COLUMNS.stopType
          ],
        ),

      sourceMaterialCode:
        toText(
          rawData[
            COLUMNS.material
          ],
        ),

      sourceMaterialDescription:
        toText(
          rawData[
            COLUMNS
              .materialDescription
          ],
        ),

      sourceEquipmentName:
        toText(
          rawData[
            COLUMNS.equipment
          ],
        ),

      sourceStopSubkey:
        toText(
          rawData[
            COLUMNS.stopSubkey
          ],
        ),

      sourceStopKey1:
        toText(
          rawData[
            COLUMNS.stopKey1
          ],
        ),

      observation:
        toText(
          rawData[
            COLUMNS.observation
          ],
        ),

      processEfficiencyLoss:
        toNumber(
          rawData[
            COLUMNS.efficiencyLoss
          ],
        ),

      accumulatedPoints:
        toNumber(
          rawData[
            COLUMNS
              .accumulatedPoints
          ],
        ),

      producedCases:
        toNumber(
          rawData[
            COLUMNS.producedCases
          ],
        ),

      totalMinutes:
        toNumber(
          rawData[
            COLUMNS.totalMinutes
          ],
        ),

      downtimeMinutes:
        toNumber(
          rawData[
            COLUMNS
              .downtimeMinutes
          ],
        ),
    },
  };
}

/* =========================================================
   POST
========================================================= */

export async function POST(
  request: Request,
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

  if (
    file.size === 0 ||
    file.size >
      MAX_FILE_SIZE
  ) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Arquivo inválido ou acima do limite de 50 MB.",
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

  /* =======================================================
     ARQUIVO
  ======================================================= */

  const arrayBuffer =
    await file.arrayBuffer();

  const buffer =
    Buffer.from(
      arrayBuffer,
    );

  const fileHash =
    createHash("sha256")
      .update(buffer)
      .digest("hex");

  const workbook =
    XLSX.read(
      arrayBuffer,
      {
        type: "array",
        raw: true,
        cellDates: false,
      },
    );

  const structure =
    findWorksheetStructure(
      workbook,
    );

  if (!structure) {
    return NextResponse.json(
      {
        success: false,

        message:
          "A estrutura esperada não foi encontrada na planilha.",
      },
      {
        status: 400,
      },
    );
  }

  const connection =
    await getConnection();

  let importId:
    | number
    | null = null;

  let processedRows = 0;

  try {
    /* =====================================================
       UNIDADE
    ===================================================== */

    const [
      units,
    ] =
      await connection.execute<
        UnitRow[]
      >(
        `
          SELECT
            id,
            code,
            sap_code,
            name,
            city
          FROM units
          WHERE id = ?
            AND active = TRUE
          LIMIT 1
        `,
        [
          session.unitId,
        ],
      );

    const unit =
      units[0];

    if (!unit) {
      return NextResponse.json(
        {
          success: false,

          message:
            "A unidade do usuário não está disponível.",
        },
        {
          status: 403,
        },
      );
    }

    /* =====================================================
       FILTRA SOMENTE A UNIDADE ATIVA
    ===================================================== */

    const allDataRows: number[] =
      [];

    const unitDataRows: number[] =
      [];

    const ignoredCenters =
      new Map<
        string,
        number
      >();

    for (
      let row =
        structure.headerRow +
        1;
      row <=
      structure.range.e.r;
      row++
    ) {
      const rawData =
        createRawData(
          structure,
          row,
        );

      if (
        isEmptyDataRow(
          rawData,
        )
      ) {
        continue;
      }

      allDataRows.push(
        row,
      );

      const centerValue =
        rawData[
          COLUMNS.center
        ];

      if (
        centerMatchesUnit(
          centerValue,
          unit,
        )
      ) {
        unitDataRows.push(
          row,
        );

        continue;
      }

      const center =
        toText(
          centerValue,
        ) ??
        "Centro não informado";

      ignoredCenters.set(
        center,
        (
          ignoredCenters.get(
            center,
          ) ?? 0
        ) + 1,
      );
    }

    if (
      unitDataRows.length ===
      0
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            `Nenhum registro correspondente à unidade ${unit.city ?? unit.name} foi encontrado na planilha.`,

          detectedCenters:
            Array.from(
              ignoredCenters.entries(),
            )
              .sort(
                (a, b) =>
                  b[1] - a[1],
              )
              .slice(0, 10)
              .map(
                ([
                  center,
                  rows,
                ]) => ({
                  center,
                  rows,
                }),
              ),
        },
        {
          status: 400,
        },
      );
    }

    const ignoredRows =
      allDataRows.length -
      unitDataRows.length;

    /* =====================================================
       DUPLICIDADE
    ===================================================== */

    const [
      existingImports,
    ] =
      await connection.execute<
        ExistingImportRow[]
      >(
        `
          SELECT
            id
          FROM imports
          WHERE unit_id = ?
            AND file_hash = ?
            AND status = 'CONCLUIDO'
          LIMIT 1
        `,
        [
          session.unitId,
          fileHash,
        ],
      );

    if (
      existingImports.length >
      0
    ) {
      return NextResponse.json(
        {
          success: false,

          message:
            "Esta planilha já foi importada anteriormente para esta unidade.",

          importId:
            existingImports[0]
              .id,
        },
        {
          status: 409,
        },
      );
    }

    /* =====================================================
       IMPORT
    ===================================================== */

    const [
      importResult,
    ] =
      await connection.execute<
        ResultSetHeader
      >(
        `
          INSERT INTO imports (
            unit_id,
            uploaded_by,
            source_system,
            original_filename,
            file_hash,
            status,
            total_rows,
            processed_rows,
            failed_rows,
            started_at
          )
          VALUES (
            ?,
            ?,
            'SAP',
            ?,
            ?,
            'PROCESSANDO',
            ?,
            0,
            0,
            NOW()
          )
        `,
        [
          session.unitId,
          session.userId,
          file.name,
          fileHash,
          unitDataRows.length,
        ],
      );

    importId =
      importResult.insertId;

    /* =====================================================
       LOTES
    ===================================================== */

    for (
      let offset = 0;
      offset <
      unitDataRows.length;
      offset += BATCH_SIZE
    ) {
      const batchRows =
        unitDataRows.slice(
          offset,
          offset +
            BATCH_SIZE,
        );

      const preparedRows =
        batchRows.map(
          (row) => {
            const rawData =
              createRawData(
                structure,
                row,
              );

            return prepareRow(
              row + 1,
              rawData,
            );
          },
        );

      /* ===================================================
         RAW
      =================================================== */

      const rawPlaceholders =
        preparedRows
          .map(
            () =>
              "(?, ?, ?, ?, ?, FALSE, NULL)",
          )
          .join(", ");

      const rawValues:
        unknown[] = [];

      for (
        const row of
        preparedRows
      ) {
        rawValues.push(
          importId,
          structure.sheetName,
          row.sourceRowNumber,
          JSON.stringify(
            row.rawData,
          ),
          row.rowHash,
        );
      }

      await connection.query<
        ResultSetHeader
      >(
        `
          INSERT INTO raw_import_rows (
            import_id,
            sheet_name,
            source_row_number,
            raw_data,
            row_hash,
            processed,
            processing_error
          )
          VALUES
          ${rawPlaceholders}
        `,
        rawValues,
      );

      /* ===================================================
         RECUPERA IDS
      =================================================== */

      const rowNumberPlaceholders =
        preparedRows
          .map(() => "?")
          .join(", ");

      const [
        insertedRawRows,
      ] =
        await connection.query<
          RawRowId[]
        >(
          `
            SELECT
              id,
              source_row_number
            FROM raw_import_rows
            WHERE import_id = ?
              AND sheet_name = ?
              AND source_row_number IN (
                ${rowNumberPlaceholders}
              )
          `,
          [
            importId,
            structure.sheetName,

            ...preparedRows.map(
              (row) =>
                row.sourceRowNumber,
            ),
          ],
        );

      const rawIdMap =
        new Map<
          number,
          number
        >();

      for (
        const row of
        insertedRawRows
      ) {
        rawIdMap.set(
          Number(
            row.source_row_number,
          ),
          Number(
            row.id,
          ),
        );
      }

      /* ===================================================
         EVENTS
      =================================================== */

      const eventPlaceholders =
        preparedRows
          .map(
            () =>
              `(
                ?, ?, ?, 'SAP',
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?
              )`,
          )
          .join(", ");

      const eventValues:
        unknown[] = [];

      for (
        const row of
        preparedRows
      ) {
        const rawRowId =
          rawIdMap.get(
            row.sourceRowNumber,
          );

        if (!rawRowId) {
          throw new Error(
            `Não foi possível localizar a linha bruta ${row.sourceRowNumber}.`,
          );
        }

        eventValues.push(
          session.unitId,
          importId,
          rawRowId,

          row.event
            .sourceOrderNumber,

          row.event
            .eventDate,

          row.event.shift,

          row.event
            .intervalLabel,

          row.event
            .intervalStart,

          row.event
            .intervalEnd,

          row.event
            .sourceLineName,

          row.event
            .sourceStopType,

          row.event
            .sourceMaterialCode,

          row.event
            .sourceMaterialDescription,

          row.event
            .sourceEquipmentName,

          row.event
            .sourceStopSubkey,

          row.event
            .sourceStopKey1,

          row.event
            .observation,

          row.event
            .processEfficiencyLoss,

          row.event
            .accumulatedPoints,

          row.event
            .producedCases,

          row.event
            .totalMinutes,

          row.event
            .downtimeMinutes,
        );
      }

      await connection.query<
        ResultSetHeader
      >(
        `
          INSERT INTO maintenance_events (
            unit_id,
            import_id,
            raw_row_id,
            source_system,
            source_order_number,
            event_date,
            shift,
            interval_label,
            interval_start,
            interval_end,
            source_line_name,
            source_stop_type,
            source_material_code,
            source_material_description,
            source_equipment_name,
            source_stop_subkey,
            source_stop_key_1,
            observation,
            process_efficiency_loss,
            accumulated_points,
            produced_cases,
            total_minutes,
            downtime_minutes
          )
          VALUES
          ${eventPlaceholders}
        `,
        eventValues,
      );

      /* ===================================================
         RAW PROCESSADA
      =================================================== */

      await connection.query<
        ResultSetHeader
      >(
        `
          UPDATE raw_import_rows
          SET processed = TRUE
          WHERE import_id = ?
            AND sheet_name = ?
            AND source_row_number IN (
              ${rowNumberPlaceholders}
            )
        `,
        [
          importId,
          structure.sheetName,

          ...preparedRows.map(
            (row) =>
              row.sourceRowNumber,
          ),
        ],
      );

      processedRows +=
        preparedRows.length;

      await connection.execute<
        ResultSetHeader
      >(
        `
          UPDATE imports
          SET processed_rows = ?
          WHERE id = ?
        `,
        [
          processedRows,
          importId,
        ],
      );
    }

    /* =====================================================
       FINALIZA
    ===================================================== */

    await connection.execute<
      ResultSetHeader
    >(
      `
        UPDATE imports
        SET
          status = 'CONCLUIDO',
          processed_rows = ?,
          failed_rows = 0,
          completed_at = NOW()
        WHERE id = ?
      `,
      [
        processedRows,
        importId,
      ],
    );

    /* =====================================================
       RESULTADO
    ===================================================== */

    return NextResponse.json(
      {
        success: true,

        import: {
          id:
            importId,

          filename:
            file.name,

          sheetName:
            structure.sheetName,

          sourceRows:
            allDataRows.length,

          totalRows:
            unitDataRows.length,

          processedRows,

          ignoredRows,

          failedRows: 0,

          unit: {
            id:
              unit.id,

            city:
              unit.city,

            name:
              unit.name,
          },
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
      "ERRO DURANTE PROCESSAMENTO DA IMPORTAÇÃO",
    );

    console.error(
      "==========================================",
    );

    console.error(error);

    console.error(
      "==========================================",
    );

    if (importId) {
      try {
        await connection.execute(
          `
            UPDATE imports
            SET
              status = 'ERRO',
              processed_rows = ?,
              failed_rows =
                GREATEST(
                  total_rows - ?,
                  0
                ),
              completed_at = NOW()
            WHERE id = ?
          `,
          [
            processedRows,
            processedRows,
            importId,
          ],
        );
      } catch (
        updateError
      ) {
        console.error(
          "Erro ao atualizar status da importação:",
          updateError,
        );
      }
    }

    return NextResponse.json(
      {
        success: false,

        message:
          "Ocorreu um erro durante o processamento da planilha.",

        importId,

        processedRows,
      },
      {
        status: 500,
      },
    );
  } finally {
    connection.release();
  }
}