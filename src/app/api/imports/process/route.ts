import {
  createHash,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import type {
  PoolConnection,
} from "mysql2/promise";

import * as XLSX from "xlsx";

import {
  getConnection,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

import {
  classifyImportWithMl,
} from "@/lib/ml/classify-import";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const maxDuration =
  300;

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const DATABASE_BATCH_SIZE =
  500;

const ML_BATCH_SIZE =
  250;

const SOURCE_SYSTEM =
  "SAP";


// ============================================================
// CABEÇALHOS DA PLANILHA
// ============================================================

const HEADERS = {
  center:
    "Centro",

  eventDate:
    "Data Inicio Real",

  line:
    "Linha",

  stopType:
    "Tipo de Parada",

  material:
    "Material",

  order:
    "Ordem",

  materialDescription:
    "Descrição do Material",

  shift:
    "Turno",

  interval:
    "Intervalo",

  equipment:
    "chave do parada",

  stopSubkey:
    "Subchave de Parada",

  stopKey1:
    "chave 1 de parada",

  observation:
    "Observações",

  processEfficiencyLoss:
    "Pros. Efi. Perdid.",

  accumulatedPoints:
    "Ptos. Acumilados",

  producedCases:
    "Caixas Produzidas",

  totalMinutes:
    "Total minutos",

  downtimeMinutes:
    "Minutos de paradas",
} as const;


const REQUIRED_HEADERS = [
  HEADERS.center,
  HEADERS.eventDate,
  HEADERS.line,
  HEADERS.stopType,
  HEADERS.material,
  HEADERS.order,
  HEADERS.materialDescription,
  HEADERS.shift,
  HEADERS.interval,
  HEADERS.equipment,
  HEADERS.stopSubkey,
  HEADERS.stopKey1,
  HEADERS.observation,
  HEADERS.processEfficiencyLoss,
  HEADERS.accumulatedPoints,
  HEADERS.producedCases,
  HEADERS.totalMinutes,
  HEADERS.downtimeMinutes,
];


// ============================================================
// TIPOS
// ============================================================

type ExcelRow =
  Record<
    string,
    unknown
  >;


interface TableColumn
  extends RowDataPacket {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: unknown;
  Extra: string;
}


interface GenericRow
  extends RowDataPacket {
  [key: string]:
    unknown;
}


interface UnitRow
  extends RowDataPacket {
  id: number;

  code?:
    string | null;

  external_code?:
    string | null;

  erp_code?:
    string | null;

  plant_code?:
    string | null;

  city?:
    string | null;

  name?:
    string | null;

  short_name?:
    string | null;
}


interface ExistingImportRow
  extends RowDataPacket {
  id: number;
}


interface RawRowId
  extends RowDataPacket {
  id: number;

  source_row_number:
    number;
}


interface PreparedRow {
  sourceRowNumber:
    number;

  raw:
    ExcelRow;

  sourceCenter:
    string | null;

  sourceOrderNumber:
    string | null;

  eventDate:
    string;

  shift:
    string | null;

  intervalLabel:
    string | null;

  intervalStart:
    string | null;

  intervalEnd:
    string | null;

  sourceLineName:
    string | null;

  sourceStopType:
    string | null;

  sourceMaterialCode:
    string | null;

  sourceMaterialDescription:
    string | null;

  sourceEquipmentName:
    string | null;

  sourceStopSubkey:
    string | null;

  sourceStopKey1:
    string | null;

  observation:
    string | null;

  processEfficiencyLoss:
    number | null;

  accumulatedPoints:
    number | null;

  producedCases:
    number | null;

  totalMinutes:
    number | null;

  downtimeMinutes:
    number | null;
}


interface TableDefinition {
  columns:
    Map<
      string,
      TableColumn
    >;
}


interface ImportTableConfig {
  table:
    TableDefinition;

  unitColumn:
    string | null;

  userColumn:
    string | null;

  filenameColumn:
    string | null;

  hashColumn:
    string | null;

  sheetColumn:
    string | null;

  sourceSystemColumn:
    string | null;

  totalRowsColumn:
    string | null;

  importedRowsColumn:
    string | null;

  ignoredRowsColumn:
    string | null;

  statusColumn:
    string | null;

  errorColumn:
    string | null;

  startedAtColumn:
    string | null;

  completedAtColumn:
    string | null;
}


interface RawTableConfig {
  table:
    TableDefinition;

  importIdColumn:
    string;

  unitIdColumn:
    string | null;

  sourceRowNumberColumn:
    string;

  sheetNameColumn:
    string | null;

  rowHashColumn:
    string;

  jsonColumn:
    string;
}


// ============================================================
// NORMALIZAÇÃO
// ============================================================

function normalizeText(
  value: unknown,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(
    value,
  )
    .normalize(
      "NFD",
    )
    .replace(
      /[\u0300-\u036f]/g,
      "",
    )
    .trim()
    .toUpperCase();
}


function nullableString(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(
      value,
    ).trim();

  return text
    ? text
    : null;
}


function limitString(
  value: unknown,
  maxLength: number,
): string | null {
  const text =
    nullableString(
      value,
    );

  if (!text) {
    return null;
  }

  return text.slice(
    0,
    maxLength,
  );
}


// ============================================================
// NÚMEROS
// ============================================================

function nullableNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value ===
      "number"
  ) {
    return Number.isFinite(
      value,
    )
      ? value
      : null;
  }

  let text =
    String(
      value,
    )
      .trim()
      .replace(
        /\s+/g,
        "",
      );

  if (!text) {
    return null;
  }

  /*
   * 1.234,56
   */
  if (
    text.includes(
      ",",
    )
  ) {
    text =
      text
        .replace(
          /\./g,
          "",
        )
        .replace(
          ",",
          ".",
        );
  }

  text =
    text.replace(
      /[^0-9.+-]/g,
      "",
    );

  if (!text) {
    return null;
  }

  const parsed =
    Number(
      text,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}


// ============================================================
// DATAS
// ============================================================

function pad2(
  value: number,
): string {
  return String(
    value,
  ).padStart(
    2,
    "0",
  );
}


function buildDateString(
  year: number,
  month: number,
  day: number,
): string | null {
  if (
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return (
    `${year}-` +
    `${pad2(month)}-` +
    `${pad2(day)}`
  );
}


function excelDateToString(
  value: unknown,
): string | null {
  if (
    value instanceof Date
  ) {
    if (
      Number.isNaN(
        value.getTime(),
      )
    ) {
      return null;
    }

    /*
     * XLSX frequentemente cria as datas
     * usando UTC.
     */
    const utc =
      buildDateString(
        value.getUTCFullYear(),
        value.getUTCMonth() +
          1,
        value.getUTCDate(),
      );

    if (utc) {
      return utc;
    }

    return buildDateString(
      value.getFullYear(),
      value.getMonth() +
        1,
      value.getDate(),
    );
  }


  if (
    typeof value ===
      "number"
  ) {
    const parsed =
      XLSX.SSF.parse_date_code(
        value,
      );

    if (!parsed) {
      return null;
    }

    return buildDateString(
      parsed.y,
      parsed.m,
      parsed.d,
    );
  }


  const text =
    nullableString(
      value,
    );

  if (!text) {
    return null;
  }


  /*
   * YYYY-MM-DD
   */
  const isoMatch =
    text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})/,
    );

  if (isoMatch) {
    return buildDateString(
      Number(
        isoMatch[1],
      ),
      Number(
        isoMatch[2],
      ),
      Number(
        isoMatch[3],
      ),
    );
  }


  /*
   * DD/MM/YYYY
   * DD-MM-YYYY
   */
  const brMatch =
    text.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/,
    );

  if (brMatch) {
    return buildDateString(
      Number(
        brMatch[3],
      ),
      Number(
        brMatch[2],
      ),
      Number(
        brMatch[1],
      ),
    );
  }


  const parsedDate =
    new Date(
      text,
    );

  if (
    Number.isNaN(
      parsedDate.getTime(),
    )
  ) {
    return null;
  }

  return buildDateString(
    parsedDate.getFullYear(),
    parsedDate.getMonth() +
      1,
    parsedDate.getDate(),
  );
}


// ============================================================
// INTERVALO
// ============================================================

function normalizeTime(
  value: string,
): string | null {
  const match =
    value.match(
      /(\d{1,2}):(\d{2})(?::(\d{2}))?/,
    );

  if (!match) {
    return null;
  }

  const hour =
    Number(
      match[1],
    );

  const minute =
    Number(
      match[2],
    );

  const second =
    Number(
      match[3] ??
      0,
    );

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  return (
    `${pad2(hour)}:` +
    `${pad2(minute)}:` +
    `${pad2(second)}`
  );
}


function parseInterval(
  value: unknown,
): {
  label:
    string | null;

  start:
    string | null;

  end:
    string | null;
} {
  const label =
    nullableString(
      value,
    );

  if (!label) {
    return {
      label:
        null,

      start:
        null,

      end:
        null,
    };
  }

  const matches =
    label.match(
      /(\d{1,2}:\d{2}(?::\d{2})?)/g,
    ) ??
    [];

  return {
    label,

    start:
      matches[0]
        ? normalizeTime(
            matches[0],
          )
        : null,

    end:
      matches[1]
        ? normalizeTime(
            matches[1],
          )
        : null,
  };
}


// ============================================================
// SERIALIZAÇÃO DO RAW
// ============================================================

function serializeRawValue(
  value: unknown,
): unknown {
  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    typeof value ===
    "number"
  ) {
    return Number.isFinite(
      value,
    )
      ? value
      : null;
  }

  if (
    value === undefined
  ) {
    return null;
  }

  return value;
}


function serializeRawRow(
  row: ExcelRow,
): ExcelRow {
  const result:
    ExcelRow =
      {};

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      row,
    )
  ) {
    result[key] =
      serializeRawValue(
        value,
      );
  }

  return result;
}


// ============================================================
// HASH
// ============================================================
function sha256Text(
  value: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest(
      "hex",
    );
}


function buildRawRowHash(
  row: PreparedRow,
): string {
  return sha256Text(
    JSON.stringify(
      row.raw,
    ),
  );
}


function sha256(
  buffer: Buffer,
): string {
  return createHash(
    "sha256",
  )
    .update(
      buffer,
    )
    .digest(
      "hex",
    );
}


// ============================================================
// BANCO: METADADOS
// ============================================================

async function getTableDefinition(
  connection:
    PoolConnection,

  tableName:
    string,
): Promise<TableDefinition> {
  const [
    rows,
  ] =
    await connection.query<
      TableColumn[]
    >(
      `SHOW COLUMNS FROM \`${tableName}\``,
    );

  return {
    columns:
      new Map(
        rows.map(
          (
            row,
          ) => [
            row.Field,
            row,
          ],
        ),
      ),
  };
}


function firstExistingColumn(
  table:
    TableDefinition,

  candidates:
    string[],
): string | null {
  for (
    const candidate
    of candidates
  ) {
    if (
      table.columns.has(
        candidate,
      )
    ) {
      return candidate;
    }
  }

  return null;
}


function findJsonColumn(
  table:
    TableDefinition,
): string | null {
  for (
    const column
    of table.columns.values()
  ) {
    if (
      column.Type
        .toLowerCase()
        .startsWith(
          "json",
        )
    ) {
      return column.Field;
    }
  }

  return firstExistingColumn(
    table,
    [
      "row_data",
      "raw_data",
      "raw_json",
      "row_json",
      "payload",
      "source_data",
      "data_json",
    ],
  );
}


// ============================================================
// ENUM
// ============================================================

function enumValues(
  mysqlType:
    string,
): string[] {
  if (
    !mysqlType
      .toLowerCase()
      .startsWith(
        "enum(",
      )
  ) {
    return [];
  }

  const matches =
    [
      ...mysqlType.matchAll(
        /'((?:\\'|[^'])*)'/g,
      ),
    ];

  return matches.map(
    (
      match,
    ) =>
      match[1]
        .replace(
          /\\'/g,
          "'",
        ),
  );
}


function enumCandidate(
  table:
    TableDefinition,

  columnName:
    string | null,

  candidates:
    string[],
): string | null {
  if (!columnName) {
    return null;
  }

  const definition =
    table.columns.get(
      columnName,
    );

  if (!definition) {
    return null;
  }

  const allowed =
    enumValues(
      definition.Type,
    );

  if (
    allowed.length ===
    0
  ) {
    return candidates[0] ??
      null;
  }

  const normalized =
    new Map(
      allowed.map(
        (
          value,
        ) => [
          normalizeText(
            value,
          ),
          value,
        ],
      ),
    );

  for (
    const candidate
    of candidates
  ) {
    const match =
      normalized.get(
        normalizeText(
          candidate,
        ),
      );

    if (match) {
      return match;
    }
  }

  return null;
}


// ============================================================
// IMPORT TABLE CONFIG
// ============================================================

async function getImportTableConfig(
  connection:
    PoolConnection,
): Promise<ImportTableConfig> {
  const table =
    await getTableDefinition(
      connection,
      "imports",
    );

  return {
    table,

    unitColumn:
      firstExistingColumn(
        table,
        [
          "unit_id",
        ],
      ),

    userColumn:
      firstExistingColumn(
        table,
        [
          "uploaded_by_user_id",
          "user_id",
          "created_by_user_id",
          "imported_by_user_id",
        ],
      ),

    filenameColumn:
      firstExistingColumn(
        table,
        [
          "original_filename",
          "filename",
          "file_name",
        ],
      ),

    hashColumn:
      firstExistingColumn(
        table,
        [
          "file_sha256",
          "file_hash",
          "sha256",
        ],
      ),

    sheetColumn:
      firstExistingColumn(
        table,
        [
          "sheet_name",
          "worksheet_name",
        ],
      ),

    sourceSystemColumn:
      firstExistingColumn(
        table,
        [
          "source_system",
        ],
      ),

    totalRowsColumn:
      firstExistingColumn(
        table,
        [
          "total_rows",
          "source_rows",
        ],
      ),

    importedRowsColumn:
      firstExistingColumn(
        table,
        [
          "imported_rows",
          "processed_rows",
          "valid_rows",
        ],
      ),

    ignoredRowsColumn:
      firstExistingColumn(
        table,
        [
          "ignored_rows",
          "skipped_rows",
        ],
      ),

    statusColumn:
      firstExistingColumn(
        table,
        [
          "status",
        ],
      ),

    errorColumn:
      firstExistingColumn(
        table,
        [
          "error_message",
          "error",
          "failure_reason",
        ],
      ),

    startedAtColumn:
      firstExistingColumn(
        table,
        [
          "started_at",
        ],
      ),

    completedAtColumn:
      firstExistingColumn(
        table,
        [
          "completed_at",
          "finished_at",
        ],
      ),
  };
}


// ============================================================
// RAW TABLE CONFIG
// ============================================================

async function getRawTableConfig(
  connection:
    PoolConnection,
): Promise<RawTableConfig> {
  const table =
    await getTableDefinition(
      connection,
      "raw_import_rows",
    );


  const importIdColumn =
    firstExistingColumn(
      table,
      [
        "import_id",
      ],
    );


  const sourceRowNumberColumn =
    firstExistingColumn(
      table,
      [
        "source_row_number",
        "row_number",
      ],
    );


  const rowHashColumn =
    firstExistingColumn(
      table,
      [
        "row_hash",
        "source_row_hash",
        "hash",
      ],
    );


  const jsonColumn =
    findJsonColumn(
      table,
    );


  if (!importIdColumn) {
    throw new Error(
      "A tabela raw_import_rows não possui import_id.",
    );
  }


  if (!sourceRowNumberColumn) {
    throw new Error(
      "A tabela raw_import_rows não possui source_row_number.",
    );
  }


  if (!rowHashColumn) {
    throw new Error(
      "A tabela raw_import_rows não possui row_hash.",
    );
  }


  if (!jsonColumn) {
    throw new Error(
      "Não foi encontrada a coluna JSON da tabela raw_import_rows.",
    );
  }


  return {
    table,

    importIdColumn,

    unitIdColumn:
      firstExistingColumn(
        table,
        [
          "unit_id",
        ],
      ),

    sourceRowNumberColumn,

    sheetNameColumn:
      firstExistingColumn(
        table,
        [
          "sheet_name",
          "worksheet_name",
        ],
      ),

    rowHashColumn,

    jsonColumn,
  };
}


// ============================================================
// SQL DINÂMICO
// ============================================================


type SqlValue =
  | string
  | number
  | boolean
  | Date
  | Buffer
  | null;


function toSqlValue(
  value: unknown,
): SqlValue {
  if (
    value === null
  ) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    value instanceof Date
  ) {
    return value;
  }

  if (
    Buffer.isBuffer(
      value,
    )
  ) {
    return value;
  }

  throw new Error(
    `Valor SQL inválido: ${String(value)}`,
  );
}


async function insertObject(
  connection:
    PoolConnection,

  tableName:
    string,

  values:
    Record<
      string,
      unknown
    >,
): Promise<number> {
  const entries =
    Object.entries(
      values,
    )
      .filter(
        (
          [, value],
        ) =>
          value !==
          undefined,
      )
      .map(
        (
          [
            column,
            value,
          ],
        ) =>
          [
            column,
            toSqlValue(
              value,
            ),
          ] as const,
      );


  if (
    entries.length ===
    0
  ) {
    throw new Error(
      `Nenhum campo disponível para inserir em ${tableName}.`,
    );
  }


  const columns =
    entries
      .map(
        (
          [column],
        ) =>
          `\`${column}\``,
      )
      .join(
        ", ",
      );


  const placeholders =
    entries
      .map(
        () => "?",
      )
      .join(
        ", ",
      );


  const params:
    SqlValue[] =
      entries.map(
        (
          [
            ,
            value,
          ],
        ) =>
          value,
      );


  const [
    result,
  ] =
    await connection.execute<
      ResultSetHeader
    >(
      `
        INSERT INTO \`${tableName}\`
        (
          ${columns}
        )
        VALUES
        (
          ${placeholders}
        )
      `,
      params,
    );


  return Number(
    result.insertId,
  );
}


async function updateObject(
  connection:
    PoolConnection,

  tableName:
    string,

  id:
    number,

  values:
    Record<
      string,
      unknown
    >,
): Promise<void> {
  const entries =
    Object.entries(
      values,
    )
      .filter(
        (
          [, value],
        ) =>
          value !==
          undefined,
      )
      .map(
        (
          [
            column,
            value,
          ],
        ) =>
          [
            column,
            toSqlValue(
              value,
            ),
          ] as const,
      );


  if (
    entries.length ===
    0
  ) {
    return;
  }


  const assignments =
    entries
      .map(
        (
          [column],
        ) =>
          `\`${column}\` = ?`,
      )
      .join(
        ", ",
      );


  const params:
    SqlValue[] = [
      ...entries.map(
        (
          [
            ,
            value,
          ],
        ) =>
          value,
      ),

      id,
    ];


  await connection.execute<
    ResultSetHeader
  >(
    `
      UPDATE \`${tableName}\`

      SET
        ${assignments}

      WHERE
        id = ?
    `,
    params,
  );
}


// ============================================================
// UNIDADE
// ============================================================

async function getUnit(
  connection:
    PoolConnection,

  unitId:
    number,
): Promise<UnitRow> {
  const [
    rows,
  ] =
    await connection.query<
      UnitRow[]
    >(
      `
        SELECT *
        FROM units
        WHERE id = ?
        LIMIT 1
      `,
      [
        unitId,
      ],
    );

  const unit =
    rows[0];

  if (!unit) {
    throw new Error(
      "Unidade ativa não encontrada.",
    );
  }

  return unit;
}


function getUnitAliases(
  unit:
    UnitRow,
): Set<string> {
  const values = [
    unit.code,
    unit.external_code,
    unit.erp_code,
    unit.plant_code,
  ];

  return new Set(
    values
      .map(
        normalizeText,
      )
      .filter(
        Boolean,
      ),
  );
}


function rowBelongsToUnit(
  row:
    ExcelRow,

  unitAliases:
    Set<string>,
): boolean {
  /*
   * Se a unidade não possuir código
   * de integração configurado, não
   * aplicamos um filtro destrutivo.
   */
  if (
    unitAliases.size ===
    0
  ) {
    return true;
  }

  const rowCenter =
    normalizeText(
      row[
        HEADERS.center
      ],
    );

  if (!rowCenter) {
    return false;
  }

  return unitAliases.has(
    rowCenter,
  );
}


// ============================================================
// ESCOLHA DA ABA
// ============================================================

function getSheetHeaders(
  worksheet:
    XLSX.WorkSheet,
): string[] {
  const matrix =
    XLSX.utils
      .sheet_to_json<
        unknown[]
      >(
        worksheet,
        {
          header:
            1,

          defval:
            null,

          raw:
            false,

          blankrows:
            false,
        },
      );

  const firstRow =
    matrix[0] ??
    [];

  return firstRow
    .map(
      (
        value,
      ) =>
        nullableString(
          value,
        ) ??
        "",
    );
}


function sheetScore(
  worksheet:
    XLSX.WorkSheet,
): number {
  const headers =
    new Set(
      getSheetHeaders(
        worksheet,
      ).map(
        normalizeText,
      ),
    );

  return REQUIRED_HEADERS.reduce(
    (
      score,
      header,
    ) =>
      score +
      (
        headers.has(
          normalizeText(
            header,
          ),
        )
          ? 1
          : 0
      ),
    0,
  );
}


function selectMainSheet(
  workbook:
    XLSX.WorkBook,
): {
  name:
    string;

  worksheet:
    XLSX.WorkSheet;

  score:
    number;
} {
  let best:
    {
      name:
        string;

      worksheet:
        XLSX.WorkSheet;

      score:
        number;
    } | null =
      null;

  for (
    const sheetName
    of workbook.SheetNames
  ) {
    const worksheet =
      workbook.Sheets[
        sheetName
      ];

    if (!worksheet) {
      continue;
    }

    const score =
      sheetScore(
        worksheet,
      );

    if (
      !best ||
      score >
        best.score
    ) {
      best = {
        name:
          sheetName,

        worksheet,

        score,
      };
    }
  }

  if (!best) {
    throw new Error(
      "Nenhuma aba válida foi encontrada na planilha.",
    );
  }

  /*
   * Exigimos que uma parte relevante
   * dos campos do layout esperado tenha
   * sido reconhecida.
   */
  if (
    best.score < 10
  ) {
    throw new Error(
      "A planilha não possui o layout esperado dos apontamentos.",
    );
  }

  return best;
}


// ============================================================
// PREPARAÇÃO DA LINHA
// ============================================================

function prepareRow(
  row:
    ExcelRow,

  sourceRowNumber:
    number,
): PreparedRow | null {
  const eventDate =
    excelDateToString(
      row[
        HEADERS.eventDate
      ],
    );

  if (!eventDate) {
    return null;
  }

  const interval =
    parseInterval(
      row[
        HEADERS.interval
      ],
    );

  return {
    sourceRowNumber,

    raw:
      serializeRawRow(
        row,
      ),

    sourceCenter:
      limitString(
        row[
          HEADERS.center
        ],
        120,
      ),

    sourceOrderNumber:
      limitString(
        row[
          HEADERS.order
        ],
        120,
      ),

    eventDate,

    shift:
      limitString(
        row[
          HEADERS.shift
        ],
        80,
      ),

    intervalLabel:
      interval.label
        ?.slice(
          0,
          120,
        ) ??
      null,

    intervalStart:
      interval.start,

    intervalEnd:
      interval.end,

    sourceLineName:
      limitString(
        row[
          HEADERS.line
        ],
        180,
      ),

    sourceStopType:
      limitString(
        row[
          HEADERS.stopType
        ],
        180,
      ),

    sourceMaterialCode:
      limitString(
        row[
          HEADERS.material
        ],
        120,
      ),

    sourceMaterialDescription:
      limitString(
        row[
          HEADERS.materialDescription
        ],
        255,
      ),

    sourceEquipmentName:
      limitString(
        row[
          HEADERS.equipment
        ],
        255,
      ),

    sourceStopSubkey:
      limitString(
        row[
          HEADERS.stopSubkey
        ],
        255,
      ),

    sourceStopKey1:
      limitString(
        row[
          HEADERS.stopKey1
        ],
        255,
      ),

    observation:
      nullableString(
        row[
          HEADERS.observation
        ],
      ),

    processEfficiencyLoss:
      nullableNumber(
        row[
          HEADERS.processEfficiencyLoss
        ],
      ),

    accumulatedPoints:
      nullableNumber(
        row[
          HEADERS.accumulatedPoints
        ],
      ),

    producedCases:
      nullableNumber(
        row[
          HEADERS.producedCases
        ],
      ),

    totalMinutes:
      nullableNumber(
        row[
          HEADERS.totalMinutes
        ],
      ),

    downtimeMinutes:
      nullableNumber(
        row[
          HEADERS.downtimeMinutes
        ],
      ),
  };
}


// ============================================================
// CRIAÇÃO DO REGISTRO DE IMPORTAÇÃO
// ============================================================

async function createImport(
  connection:
    PoolConnection,

  config:
    ImportTableConfig,

  params: {
    unitId:
      number;

    userId:
      number;

    filename:
      string;

    hash:
      string;

    sheetName:
      string;

    totalRows:
      number;
  },
): Promise<number> {
  const data:
    Record<
      string,
      unknown
    > =
      {};


  if (
    config.unitColumn
  ) {
    data[
      config.unitColumn
    ] =
      params.unitId;
  }


  if (
    config.userColumn
  ) {
    data[
      config.userColumn
    ] =
      params.userId;
  }


  if (
    config.filenameColumn
  ) {
    data[
      config.filenameColumn
    ] =
      params.filename;
  }


  if (
    config.hashColumn
  ) {
    data[
      config.hashColumn
    ] =
      params.hash;
  }


  if (
    config.sheetColumn
  ) {
    data[
      config.sheetColumn
    ] =
      params.sheetName;
  }


  if (
    config.sourceSystemColumn
  ) {
    data[
      config
        .sourceSystemColumn
    ] =
      SOURCE_SYSTEM;
  }


  if (
    config.totalRowsColumn
  ) {
    data[
      config.totalRowsColumn
    ] =
      params.totalRows;
  }


  if (
    config.importedRowsColumn
  ) {
    data[
      config.importedRowsColumn
    ] =
      0;
  }


  if (
    config.ignoredRowsColumn
  ) {
    data[
      config.ignoredRowsColumn
    ] =
      0;
  }


  if (
    config.statusColumn
  ) {
    const status =
      enumCandidate(
        config.table,
        config.statusColumn,
        [
          "PROCESSING",
          "PROCESSANDO",
          "PENDING",
          "PENDENTE",
          "IMPORTING",
        ],
      );

    if (status) {
      data[
        config.statusColumn
      ] =
        status;
    }
  }


  if (
    config.startedAtColumn
  ) {
    data[
      config.startedAtColumn
    ] =
      new Date();
  }


  return insertObject(
    connection,
    "imports",
    data,
  );
}


// ============================================================
// DUPLICIDADE
// ============================================================

async function findDuplicateImport(
  connection:
    PoolConnection,

  config:
    ImportTableConfig,

  unitId:
    number,

  hash:
    string,
): Promise<number | null> {
  if (
    !config.hashColumn
  ) {
    return null;
  }

  const where:
    string[] =
      [
        `\`${config.hashColumn}\` = ?`,
      ];

  const params:
    unknown[] =
      [
        hash,
      ];


  if (
    config.unitColumn
  ) {
    where.push(
      `\`${config.unitColumn}\` = ?`,
    );

    params.push(
      unitId,
    );
  }


  const [
    rows,
  ] =
    await connection.query<
      ExistingImportRow[]
    >(
      `
        SELECT id

        FROM imports

        WHERE
          ${where.join(
            " AND ",
          )}

        ORDER BY
          id DESC

        LIMIT 1
      `,
      params,
    );

  return rows[0]
    ? Number(
        rows[0].id,
      )
    : null;
}


// ============================================================
// FINALIZA IMPORT
// ============================================================

async function completeImport(
  connection:
    PoolConnection,

  config:
    ImportTableConfig,

  importId:
    number,

  importedRows:
    number,

  ignoredRows:
    number,
): Promise<void> {
  const data:
    Record<
      string,
      unknown
    > =
      {};


  if (
    config.importedRowsColumn
  ) {
    data[
      config.importedRowsColumn
    ] =
      importedRows;
  }


  if (
    config.ignoredRowsColumn
  ) {
    data[
      config.ignoredRowsColumn
    ] =
      ignoredRows;
  }


  if (
    config.statusColumn
  ) {
    const status =
      enumCandidate(
        config.table,
        config.statusColumn,
        [
          "COMPLETED",
          "CONCLUIDO",
          "CONCLUÍDO",
          "SUCCESS",
          "SUCESSO",
          "DONE",
        ],
      );

    if (status) {
      data[
        config.statusColumn
      ] =
        status;
    }
  }


  if (
    config.completedAtColumn
  ) {
    data[
      config.completedAtColumn
    ] =
      new Date();
  }


  if (
    config.errorColumn
  ) {
    data[
      config.errorColumn
    ] =
      null;
  }


  await updateObject(
    connection,
    "imports",
    importId,
    data,
  );
}


// ============================================================
// FALHA NO IMPORT
// ============================================================

async function failImport(
  connection:
    PoolConnection,

  config:
    ImportTableConfig,

  importId:
    number,

  errorMessage:
    string,
): Promise<void> {
  const data:
    Record<
      string,
      unknown
    > =
      {};


  if (
    config.statusColumn
  ) {
    const status =
      enumCandidate(
        config.table,
        config.statusColumn,
        [
          "FAILED",
          "ERRO",
          "ERROR",
          "FALHOU",
        ],
      );

    if (status) {
      data[
        config.statusColumn
      ] =
        status;
    }
  }


  if (
    config.errorColumn
  ) {
    data[
      config.errorColumn
    ] =
      errorMessage.slice(
        0,
        5000,
      );
  }


  if (
    config.completedAtColumn
  ) {
    data[
      config.completedAtColumn
    ] =
      new Date();
  }


  await updateObject(
    connection,
    "imports",
    importId,
    data,
  );
}


// ============================================================
// RAW IMPORT ROWS
// ============================================================

async function insertRawBatch(
  connection:
    PoolConnection,

  config:
    RawTableConfig,

  params: {
    importId:
      number;

    unitId:
      number;

    sheetName:
      string;

    rows:
      PreparedRow[];
  },
): Promise<
  Map<
    number,
    number
  >
> {
  if (
    params.rows.length ===
    0
  ) {
    return new Map();
  }


  const columns: string[] =
    [
      config.importIdColumn,
    ];


  if (
    config.unitIdColumn
  ) {
    columns.push(
      config.unitIdColumn,
    );
  }


  columns.push(
    config.sourceRowNumberColumn,
  );


  if (
    config.sheetNameColumn
  ) {
    columns.push(
      config.sheetNameColumn,
    );
  }


  columns.push(
    config.rowHashColumn,
  );


  columns.push(
    config.jsonColumn,
  );


  const values:
    SqlValue[] =
      [];


  const placeholders =
    params.rows
      .map(
        (
          row,
        ) => {
          const current:
            SqlValue[] =
              [
                params.importId,
              ];


          if (
            config.unitIdColumn
          ) {
            current.push(
              params.unitId,
            );
          }


          current.push(
            row.sourceRowNumber,
          );


          if (
            config.sheetNameColumn
          ) {
            current.push(
              params.sheetName,
            );
          }


          const rawJson =
            JSON.stringify(
              row.raw,
            );


          const rowHash =
            buildRawRowHash(
              row,
            );


          current.push(
            rowHash,
          );


          current.push(
            rawJson,
          );


          values.push(
            ...current,
          );


          return (
            "(" +
            current
              .map(
                () => "?",
              )
              .join(
                ", ",
              ) +
            ")"
          );
        },
      )
      .join(
        ", ",
      );


  await connection.query(
    `
      INSERT INTO
        raw_import_rows
      (
        ${columns
          .map(
            (
              column,
            ) =>
              `\`${column}\``,
          )
          .join(
            ", ",
          )}
      )

      VALUES
        ${placeholders}
    `,
    values,
  );


  const sourceNumbers =
    params.rows.map(
      (
        row,
      ) =>
        row.sourceRowNumber,
    );


  const sourcePlaceholders =
    sourceNumbers
      .map(
        () => "?",
      )
      .join(
        ", ",
      );


  const queryValues:
    SqlValue[] = [
      params.importId,
      ...sourceNumbers,
    ];


  const [
    rawRows,
  ] =
    await connection.query<
      GenericRow[]
    >(
      `
        SELECT
          id,

          \`${config.sourceRowNumberColumn}\`
            AS source_row_number

        FROM
          raw_import_rows

        WHERE
          \`${config.importIdColumn}\`
            = ?

          AND
          \`${config.sourceRowNumberColumn}\`
            IN (
              ${sourcePlaceholders}
            )
      `,
      queryValues,
    );


  return new Map(
    rawRows.map(
      (
        row,
      ) => [
        Number(
          row.source_row_number,
        ),

        Number(
          row.id,
        ),
      ],
    ),
  );
}


// ============================================================
// MAINTENANCE EVENTS
// ============================================================

async function insertMaintenanceBatch(
  connection:
    PoolConnection,

  params: {
    unitId:
      number;

    importId:
      number;

    rows:
      PreparedRow[];

    rawIds:
      Map<
        number,
        number
      >;
  },
): Promise<number> {
  if (
    params.rows.length ===
    0
  ) {
    return 0;
  }


  const rows =
    params.rows.filter(
      (
        row,
      ) =>
        params.rawIds.has(
          row.sourceRowNumber,
        ),
    );


  if (
    rows.length ===
    0
  ) {
    return 0;
  }


  /*
   * maintenance_events possui 26 colunas
   * neste INSERT.
   *
   * 23 valores são enviados por parâmetros (?).
   * 3 campos ficam NULL:
   *
   * production_line_id
   * equipment_id
   * material_id
   *
   * IMPORTANTE:
   * cada bloco abaixo deve conter exatamente
   * 26 posições.
   */
  const placeholders =
    rows
      .map(
        () =>
          `(
            ?,
            ?,
            ?,
            NULL,
            NULL,
            NULL,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )`,
      )
      .join(
        ", ",
      );


  /*
   * São exatamente 23 valores
   * por ocorrência.
   */
  const values:
    SqlValue[] =
      [];


  for (
    const row
    of rows
  ) {
    const rawRowId =
      params.rawIds.get(
        row.sourceRowNumber,
      );


    if (
      rawRowId ===
      undefined
    ) {
      continue;
    }


    values.push(
      // 1
      params.unitId,

      // 2
      params.importId,

      // 3
      rawRowId,

      /*
       * 4, 5 e 6 são NULL diretamente
       * no SQL:
       *
       * production_line_id
       * equipment_id
       * material_id
       */

      // 7
      SOURCE_SYSTEM,

      // 8
      row.sourceOrderNumber,

      // 9
      row.eventDate,

      // 10
      row.shift,

      // 11
      row.intervalLabel,

      // 12
      row.intervalStart,

      // 13
      row.intervalEnd,

      // 14
      row.sourceLineName,

      // 15
      row.sourceStopType,

      // 16
      row.sourceMaterialCode,

      // 17
      row.sourceMaterialDescription,

      // 18
      row.sourceEquipmentName,

      // 19
      row.sourceStopSubkey,

      // 20
      row.sourceStopKey1,

      // 21
      row.observation,

      // 22
      row.processEfficiencyLoss,

      // 23
      row.accumulatedPoints,

      // 24
      row.producedCases,

      // 25
      row.totalMinutes,

      // 26
      row.downtimeMinutes,
    );
  }


  /*
   * Validação defensiva.
   *
   * Cada ocorrência precisa gerar
   * exatamente 23 parâmetros.
   */
  const expectedParameters =
    rows.length * 23;


  if (
    values.length !==
    expectedParameters
  ) {
    throw new Error(
      [
        "Quantidade inválida de parâmetros ao criar maintenance_events.",
        `Esperado: ${expectedParameters}.`,
        `Recebido: ${values.length}.`,
        `Linhas: ${rows.length}.`,
      ].join(
        " ",
      ),
    );
  }


  const [
    result,
  ] =
    await connection.query<
      ResultSetHeader
    >(
      `
        INSERT INTO
          maintenance_events
        (
          unit_id,

          import_id,

          raw_row_id,

          production_line_id,

          equipment_id,

          material_id,

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
          ${placeholders}
      `,
      values,
    );


  return result.affectedRows;
}


// ============================================================
// BATCH
// ============================================================

function splitIntoBatches<T>(
  rows:
    T[],

  batchSize:
    number,
): T[][] {
  const batches:
    T[][] =
      [];

  for (
    let index = 0;
    index <
    rows.length;
    index +=
      batchSize
  ) {
    batches.push(
      rows.slice(
        index,
        index +
          batchSize,
      ),
    );
  }

  return batches;
}


// ============================================================
// POST
// ============================================================

export async function POST(
  request:
    NextRequest,
) {
  const session =
    await getSession();


  // ----------------------------------------------------------
  // AUTENTICAÇÃO
  // ----------------------------------------------------------

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Não autenticado.",
      },
      {
        status:
          401,
      },
    );
  }


  // ----------------------------------------------------------
  // ARQUIVO
  // ----------------------------------------------------------

  let formData:
    FormData;


  try {
    formData =
      await request.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          "Não foi possível ler o arquivo enviado.",
      },
      {
        status:
          400,
      },
    );
  }


  const file =
    formData.get(
      "file",
    );


  if (
    !(file instanceof File)
  ) {
    return NextResponse.json(
      {
        error:
          "Selecione uma planilha.",
      },
      {
        status:
          400,
      },
    );
  }


  const extension =
    file.name
      .split(
        ".",
      )
      .pop()
      ?.toLowerCase();


  if (
    extension !==
      "xlsx" &&
    extension !==
      "xlsm" &&
    extension !==
      "xls"
  ) {
    return NextResponse.json(
      {
        error:
          "O arquivo deve ser XLSX, XLSM ou XLS.",
      },
      {
        status:
          400,
      },
    );
  }


  const arrayBuffer =
    await file.arrayBuffer();

  const buffer =
    Buffer.from(
      arrayBuffer,
    );


  if (
    buffer.length ===
    0
  ) {
    return NextResponse.json(
      {
        error:
          "A planilha está vazia.",
      },
      {
        status:
          400,
      },
    );
  }


  const fileHash =
    sha256(
      buffer,
    );


  // ----------------------------------------------------------
  // ABRE EXCEL
  // ----------------------------------------------------------

  let workbook:
    XLSX.WorkBook;


  try {
    workbook =
      XLSX.read(
        buffer,
        {
          type:
            "buffer",

          cellDates:
            true,

          cellNF:
            false,

          cellText:
            false,
        },
      );
  } catch (
    error
  ) {
    console.error(
      "Erro ao abrir planilha:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível abrir a planilha.",
      },
      {
        status:
          400,
      },
    );
  }


  let selectedSheet:
    ReturnType<
      typeof selectMainSheet
    >;


  try {
    selectedSheet =
      selectMainSheet(
        workbook,
      );
  } catch (
    error
  ) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Planilha inválida.",
      },
      {
        status:
          400,
      },
    );
  }


  const excelRows =
    XLSX.utils
      .sheet_to_json<
        ExcelRow
      >(
        selectedSheet
          .worksheet,
        {
          defval:
            null,

          raw:
            true,

          blankrows:
            false,
        },
      );


  if (
    excelRows.length ===
    0
  ) {
    return NextResponse.json(
      {
        error:
          "A aba de apontamentos não possui registros.",
      },
      {
        status:
          400,
      },
    );
  }


  // ----------------------------------------------------------
  // CONEXÃO
  // ----------------------------------------------------------

  const connection =
    await getConnection();


  let importId:
    number | null =
      null;

  let importConfig:
    ImportTableConfig |
    null =
      null;


  try {
    // --------------------------------------------------------
    // CONFIG DO BANCO
    // --------------------------------------------------------

    importConfig =
      await getImportTableConfig(
        connection,
      );


    const rawConfig =
      await getRawTableConfig(
        connection,
      );


    // --------------------------------------------------------
    // UNIDADE
    // --------------------------------------------------------

    const unit =
      await getUnit(
        connection,
        session.unitId,
      );


    const unitAliases =
      getUnitAliases(
        unit,
      );


    // --------------------------------------------------------
    // DUPLICIDADE
    // --------------------------------------------------------

    const duplicateId =
      await findDuplicateImport(
        connection,
        importConfig,
        session.unitId,
        fileHash,
      );


    if (
      duplicateId !==
      null
    ) {
      return NextResponse.json(
        {
          error:
            "Essa planilha já foi importada para a unidade atual.",

          duplicate:
            true,

          importId:
            duplicateId,
        },
        {
          status:
            409,
        },
      );
    }


    // --------------------------------------------------------
    // FILTRA E NORMALIZA
    // --------------------------------------------------------

    const preparedRows:
      PreparedRow[] =
        [];

    let ignoredByUnit =
      0;

    let ignoredInvalidDate =
      0;


    for (
      let index = 0;
      index <
      excelRows.length;
      index +=
        1
    ) {
      const sourceRowNumber =
        index +
        2;

      const row =
        excelRows[
          index
        ];


      if (
        !rowBelongsToUnit(
          row,
          unitAliases,
        )
      ) {
        ignoredByUnit +=
          1;

        continue;
      }


      const prepared =
        prepareRow(
          row,
          sourceRowNumber,
        );


      if (!prepared) {
        ignoredInvalidDate +=
          1;

        continue;
      }


      preparedRows.push(
        prepared,
      );
    }


    const ignoredRows =
      ignoredByUnit +
      ignoredInvalidDate;


    if (
      preparedRows.length ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "Nenhum apontamento válido da unidade ativa foi encontrado na planilha.",

          details: {
            totalRows:
              excelRows.length,

            ignoredByUnit,

            ignoredInvalidDate,
          },
        },
        {
          status:
            400,
        },
      );
    }


    // --------------------------------------------------------
    // CRIA IMPORT
    // --------------------------------------------------------

    importId =
      await createImport(
        connection,
        importConfig,
        {
          unitId:
            session.unitId,

          userId:
            session.userId,

          filename:
            file.name,

          hash:
            fileHash,

          sheetName:
            selectedSheet.name,

          totalRows:
            excelRows.length,
        },
      );


    // --------------------------------------------------------
    // IMPORTAÇÃO TRANSACIONAL
    // --------------------------------------------------------

    await connection
      .beginTransaction();


    let importedRows =
      0;


    const batches =
      splitIntoBatches(
        preparedRows,
        DATABASE_BATCH_SIZE,
      );


    for (
      const batch
      of batches
    ) {
      const rawIds =
        await insertRawBatch(
          connection,
          rawConfig,
          {
            importId,

            unitId:
              session.unitId,

            sheetName:
              selectedSheet
                .name,

            rows:
              batch,
          },
        );


      const inserted =
        await insertMaintenanceBatch(
          connection,
          {
            unitId:
              session.unitId,

            importId,

            rows:
              batch,

            rawIds,
          },
        );


      importedRows +=
        inserted;
    }


    await connection
      .commit();


    // --------------------------------------------------------
    // MARCA IMPORTAÇÃO COMO CONCLUÍDA
    // --------------------------------------------------------

    await completeImport(
      connection,
      importConfig,
      importId,
      importedRows,
      ignoredRows,
    );


    // --------------------------------------------------------
    // LIBERA CONEXÃO ANTES DO ML
    // --------------------------------------------------------

    connection.release();


    // ========================================================
    // MODELO ML
    //
    // A importação já está salva e concluída neste momento.
    //
    // Se o ML estiver offline ou falhar:
    //
    // - NÃO apagamos a importação;
    // - NÃO apagamos maintenance_events;
    // - retornamos o estado separadamente.
    // ========================================================

    let mlResult:
      Awaited<
        ReturnType<
          typeof classifyImportWithMl
        >
      > | null =
        null;


    try {
      mlResult =
        await classifyImportWithMl({
          importId,

          unitId:
            session.unitId,

          batchSize:
            ML_BATCH_SIZE,
        });
    } catch (
      error
    ) {
      console.error(
        `Importação ${importId} concluída, mas houve erro no Modelo ML:`,
        error,
      );
    }


    // --------------------------------------------------------
    // RESPOSTA FINAL
    // --------------------------------------------------------

    return NextResponse.json({
      success:
        true,

      import: {
        id:
          importId,

        filename:
          file.name,

        sheetName:
          selectedSheet.name,

        fileHash,

        sourceRows:
          excelRows.length,

        importedRows,

        ignoredRows,

        ignoredByUnit,

        ignoredInvalidDate,

        unit: {
          id:
            Number(
              unit.id,
            ),

          code:
            unit.code ??
            null,

          city:
            unit.city ??
            null,

          name:
            unit.name ??
            null,
        },
      },

      ml:
        mlResult,

      review: {
        required:
          true,

        href:
          "/dashboard/revisao",
      },
    });
  } catch (
    error
  ) {
    console.error(
      "Erro ao processar importação:",
      error,
    );


    try {
      await connection
        .rollback();
    } catch {
      /*
       * Pode não haver transação aberta.
       */
    }


    /*
     * Se o registro da importação já existir,
     * tentamos registrar a falha.
     */
    if (
      importId !==
        null &&
      importConfig !==
        null
    ) {
      try {
        await failImport(
          connection,
          importConfig,
          importId,
          error instanceof Error
            ? error.message
            : "Erro desconhecido durante a importação.",
        );
      } catch (
        updateError
      ) {
        console.error(
          "Também não foi possível atualizar o status da importação:",
          updateError,
        );
      }
    }


    connection.release();


    return NextResponse.json(
      {
        success:
          false,

        error:
          error instanceof Error
            ? error.message
            : "Não foi possível processar a planilha.",
      },
      {
        status:
          500,
      },
    );
  }
}