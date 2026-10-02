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

const CENTERS_SHEET_NAME =
  "Centros KOFBR";

const CRITICALITY_SHEET_NAME =
  "Criticidade ABC";

const CENTER_MATRIX_HEADERS = {
  centerCode:
    "Cod. Centro",

  unitName:
    "Unidade",

  sapCode:
    "Cod. SAP",
} as const;

const CRITICALITY_MATRIX_HEADERS = {
  plant:
    "Planta",

  technicalLocation:
    "Ubicación Tecnica",

  parentEquipment:
    "Equipo Padre",

  tag:
    "N° de Identifi. Técnica (Tag)",

  equipmentDescription:
    "Descripción del Equipo",

  criticality:
    "CRITICIDADE",
} as const;


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

  sap_code?:
    string | null;

  city?:
    string | null;

  state?:
    string | null;

  active?:
    boolean | number | null;

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
  unitId:
    number;

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


type EquipmentCriticality =
  | "A"
  | "B"
  | "C";


type MatrixMatchType =
  | "EXACT_UNIQUE"
  | "EXACT_SAME_CRITICALITY"
  | "CONFLICT"
  | "NOT_FOUND";


interface CriticalityMatrixAsset {
  plant:
    string;

  technicalLocation:
    string | null;

  parentEquipment:
    string | null;

  tag:
    string;

  equipmentName:
    string;

  normalizedEquipmentName:
    string;

  criticality:
    EquipmentCriticality;
}


interface CriticalityNameResolution {
  criticality:
    EquipmentCriticality | null;

  matchType:
    MatrixMatchType;

  matrixRows:
    number;
}


interface CriticalityContext {
  available:
    boolean;

  centerSheetName:
    string | null;

  matrixSheetName:
    string | null;

  plantName:
    string | null;

  message:
    string | null;

  assets:
    CriticalityMatrixAsset[];

  matrixByCriticality: {
    A: number;
    B: number;
    C: number;
  };

  nameResolution:
    Map<
      string,
      CriticalityNameResolution
    >;
}


// ============================================================
// EQUIPAMENTOS
// ============================================================

/*
 * EquipmentRecord representa um equipamento dentro
 * da lógica da aplicação.
 *
 * Ele NÃO depende do mysql2 e, portanto, também pode
 * representar equipamentos que acabaram de ser criados
 * durante a própria importação.
 */
interface EquipmentRecord {
  id:
    number;

  code:
    string;

  name:
    string;

  criticality:
    EquipmentCriticality | null;
}


/*
 * EquipmentDbRow representa especificamente uma linha
 * retornada pelo mysql2.
 *
 * Como todo EquipmentDbRow também possui os campos de
 * EquipmentRecord, podemos utilizá-lo normalmente na
 * construção do mapa de equipamentos.
 */
interface EquipmentDbRow
  extends RowDataPacket,
    EquipmentRecord {}


interface ExistingEventEquipmentRow
  extends RowDataPacket {
  id:
    number;

  source_equipment_name:
    string | null;
}


interface EquipmentSyncResult {
  equipmentIdsByNormalizedName:
    Map<
      string,
      number
    >;

  eventsWithEquipment:
    number;

  matchedEvents:
    number;

  unmatchedEvents:
    number;

  coveragePercent:
    number;

  uniqueEquipmentNames:
    number;

  matchedUniqueEquipmentNames:
    number;

  ambiguousSameCriticalityNames:
    number;

  conflictingNames:
    number;

  notFoundNames:
    number;
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


function normalizeEquipmentMatchText(
  value: unknown,
): string {
  return normalizeText(
    value,
  ).replace(
    /\s+/g,
    " ",
  );
}


function isEquipmentCriticality(
  value: unknown,
): value is EquipmentCriticality {
  const normalized =
    normalizeText(
      value,
    );

  return (
    normalized === "A" ||
    normalized === "B" ||
    normalized === "C"
  );
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


async function getAccessibleUnits(
  connection:
    PoolConnection,

  userId:
    number,

  defaultUnitId:
    number,
): Promise<UnitRow[]> {
  const [
    rows,
  ] =
    await connection.query<
      UnitRow[]
    >(
      `
        SELECT DISTINCT
          u.*

        FROM
          units u

        LEFT JOIN
          user_units uu
          ON uu.unit_id = u.id
          AND uu.user_id = ?

        WHERE
          (
            uu.user_id IS NOT NULL
            OR u.id = ?
          )

          AND
          (
            u.active = TRUE
            OR u.id = ?
          )

        ORDER BY
          u.id ASC
      `,
      [
        userId,
        defaultUnitId,
        defaultUnitId,
      ],
    );

  if (
    rows.length ===
    0
  ) {
    throw new Error(
      "O usuário atual não possui unidades disponíveis para importação.",
    );
  }

  return rows;
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
    unit.sap_code,
  ];

  return new Set(
    values
      .map(
        normalizeIntegrationCode,
      )
      .filter(
        Boolean,
      ),
  );
}


function buildUnitAliasMap(
  units:
    UnitRow[],
): Map<
  string,
  UnitRow
> {
  const result =
    new Map<
      string,
      UnitRow
    >();

  for (
    const unit
    of units
  ) {
    for (
      const alias
      of getUnitAliases(
        unit,
      )
    ) {
      const existing =
        result.get(
          alias,
        );

      if (
        existing &&
        Number(
          existing.id,
        ) !==
          Number(
            unit.id,
          )
      ) {
        throw new Error(
          `O código de integração "${alias}" está associado a mais de uma unidade no banco. Corrija o cadastro antes de importar.`,
        );
      }

      result.set(
        alias,
        unit,
      );
    }
  }

  return result;
}


function resolveRowUnit(
  row:
    ExcelRow,

  unitByAlias:
    Map<
      string,
      UnitRow
    >,
): UnitRow | null {
  const rowCenter =
    normalizeIntegrationCode(
      row[
        HEADERS.center
      ],
    );

  if (!rowCenter) {
    return null;
  }

  return (
    unitByAlias.get(
      rowCenter,
    ) ??
    null
  );
}


function groupPreparedRowsByUnit(
  rows:
    PreparedRow[],
): Map<
  number,
  PreparedRow[]
> {
  const grouped =
    new Map<
      number,
      PreparedRow[]
    >();

  for (
    const row
    of rows
  ) {
    const current =
      grouped.get(
        row.unitId,
      ) ??
      [];

    current.push(
      row,
    );

    grouped.set(
      row.unitId,
      current,
    );
  }

  return grouped;
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

  unitId:
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
    unitId,

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


  for (
    const row
    of params.rows
  ) {
    if (
      row.unitId !==
      params.unitId
    ) {
      throw new Error(
        `Lote RAW contém uma linha da unidade ${row.unitId}, mas o lote pertence à unidade ${params.unitId}.`,
      );
    }
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
              row.unitId,
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
// MATRIZ DE CRITICIDADE
// ============================================================

function normalizeIntegrationCode(
  value: unknown,
): string {
  return normalizeText(
    value,
  ).replace(
    /\*+$/g,
    "",
  );
}


function findWorkbookSheet(
  workbook:
    XLSX.WorkBook,

  expectedName:
    string,
): {
  name: string;
  worksheet: XLSX.WorkSheet;
} | null {
  const expected =
    normalizeText(
      expectedName,
    );

  for (
    const sheetName
    of workbook.SheetNames
  ) {
    if (
      normalizeText(
        sheetName,
      ) !== expected
    ) {
      continue;
    }

    const worksheet =
      workbook.Sheets[
        sheetName
      ];

    if (!worksheet) {
      continue;
    }

    return {
      name:
        sheetName,

      worksheet,
    };
  }

  return null;
}


function worksheetToRows(
  worksheet:
    XLSX.WorkSheet,
): ExcelRow[] {
  return XLSX.utils
    .sheet_to_json<
      ExcelRow
    >(
      worksheet,
      {
        defval:
          null,

        raw:
          true,

        blankrows:
          false,
      },
    );
}


function buildCriticalityContext(
  workbook:
    XLSX.WorkBook,

  unit:
    UnitRow,

  preparedRows:
    PreparedRow[],
): CriticalityContext {
  const centersSheet =
    findWorkbookSheet(
      workbook,
      CENTERS_SHEET_NAME,
    );

  const criticalitySheet =
    findWorkbookSheet(
      workbook,
      CRITICALITY_SHEET_NAME,
    );

  if (!criticalitySheet) {
    return {
      available:
        false,

      centerSheetName:
        centersSheet?.name ??
        null,

      matrixSheetName:
        null,

      plantName:
        null,

      message:
        `A aba "${CRITICALITY_SHEET_NAME}" não foi encontrada. A importação continuará sem sincronizar criticidade.`,

      assets:
        [],

      matrixByCriticality: {
        A: 0,
        B: 0,
        C: 0,
      },

      nameResolution:
        new Map(),
    };
  }


  const matrixRows =
    worksheetToRows(
      criticalitySheet
        .worksheet,
    );


  const matrixPlantNames =
    new Map<
      string,
      string
    >();


  for (
    const row
    of matrixRows
  ) {
    const rawPlant =
      nullableString(
        row[
          CRITICALITY_MATRIX_HEADERS
            .plant
        ],
      );

    const normalizedPlant =
      normalizeText(
        rawPlant,
      );

    if (
      rawPlant &&
      normalizedPlant &&
      !matrixPlantNames.has(
        normalizedPlant,
      )
    ) {
      matrixPlantNames.set(
        normalizedPlant,
        rawPlant,
      );
    }
  }


  const plantCandidates:
    string[] =
      [];


  /*
   * A primeira fonte para descobrir a planta é o próprio
   * centro dos apontamentos, cruzado com "Centros KOFBR".
   */
  if (centersSheet) {
    const centerRows =
      worksheetToRows(
        centersSheet
          .worksheet,
      );

    const sourceCenters =
      new Set(
        preparedRows
          .map(
            (
              row,
            ) =>
              normalizeIntegrationCode(
                row.sourceCenter,
              ),
          )
          .filter(
            Boolean,
          ),
      );

    const unitIntegrationCodes =
      new Set(
        [
          unit.code,
          unit.external_code,
          unit.erp_code,
          unit.plant_code,
          unit.sap_code,
        ]
          .map(
            normalizeIntegrationCode,
          )
          .filter(
            Boolean,
          ),
      );


    for (
      const row
      of centerRows
    ) {
      const centerCode =
        normalizeIntegrationCode(
          row[
            CENTER_MATRIX_HEADERS
              .centerCode
          ],
        );

      const sapCode =
        normalizeIntegrationCode(
          row[
            CENTER_MATRIX_HEADERS
              .sapCode
          ],
        );

      const belongsBySourceCenter =
        Boolean(
          centerCode &&
          sourceCenters.has(
            centerCode,
          ),
        );

      const belongsByUnitCode =
        Boolean(
          (
            centerCode &&
            unitIntegrationCodes.has(
              centerCode,
            )
          ) ||
          (
            sapCode &&
            unitIntegrationCodes.has(
              sapCode,
            )
          ),
        );


      if (
        !belongsBySourceCenter &&
        !belongsByUnitCode
      ) {
        continue;
      }


      const mappedUnitName =
        nullableString(
          row[
            CENTER_MATRIX_HEADERS
              .unitName
          ],
        );


      if (
        mappedUnitName
      ) {
        plantCandidates.push(
          mappedUnitName,
        );
      }
    }
  }


  /*
   * Fallbacks seguros do cadastro da unidade.
   */
  for (
    const candidate
    of [
      unit.city,
      unit.name,
      unit.short_name,
    ]
  ) {
    const text =
      nullableString(
        candidate,
      );

    if (text) {
      plantCandidates.push(
        text,
      );
    }
  }


  let plantName:
    string | null =
      null;


  for (
    const candidate
    of plantCandidates
  ) {
    const normalized =
      normalizeText(
        candidate,
      );

    const matrixPlant =
      matrixPlantNames.get(
        normalized,
      );

    if (
      matrixPlant
    ) {
      plantName =
        matrixPlant;

      break;
    }
  }


  if (!plantName) {
    return {
      available:
        false,

      centerSheetName:
        centersSheet?.name ??
        null,

      matrixSheetName:
        criticalitySheet.name,

      plantName:
        null,

      message:
        "Não foi possível relacionar a unidade ativa a uma planta da aba Criticidade ABC. A importação continuará sem sincronizar criticidade.",

      assets:
        [],

      matrixByCriticality: {
        A: 0,
        B: 0,
        C: 0,
      },

      nameResolution:
        new Map(),
    };
  }


  const normalizedPlantName =
    normalizeText(
      plantName,
    );


  const assetsByTag =
    new Map<
      string,
      CriticalityMatrixAsset
    >();


  for (
    const row
    of matrixRows
  ) {
    if (
      normalizeText(
        row[
          CRITICALITY_MATRIX_HEADERS
            .plant
        ],
      ) !==
      normalizedPlantName
    ) {
      continue;
    }


    const tag =
      limitString(
        row[
          CRITICALITY_MATRIX_HEADERS
            .tag
        ],
        100,
      );

    const equipmentName =
      limitString(
        row[
          CRITICALITY_MATRIX_HEADERS
            .equipmentDescription
        ],
        255,
      );

    const criticalityValue =
      row[
        CRITICALITY_MATRIX_HEADERS
          .criticality
      ];


    if (
      !tag ||
      !equipmentName ||
      !isEquipmentCriticality(
        criticalityValue,
      )
    ) {
      continue;
    }


    const normalizedEquipmentName =
      normalizeEquipmentMatchText(
        equipmentName,
      );


    if (
      !normalizedEquipmentName
    ) {
      continue;
    }


    const asset:
      CriticalityMatrixAsset = {
        plant:
          plantName,

        technicalLocation:
          limitString(
            row[
              CRITICALITY_MATRIX_HEADERS
                .technicalLocation
            ],
            255,
          ),

        parentEquipment:
          limitString(
            row[
              CRITICALITY_MATRIX_HEADERS
                .parentEquipment
            ],
            255,
          ),

        tag,

        equipmentName,

        normalizedEquipmentName,

        criticality:
          normalizeText(
            criticalityValue,
          ) as
            EquipmentCriticality,
      };


    /*
     * O Tag é o identificador mestre da linha na matriz.
     * Se houver repetição acidental no Excel, mantemos
     * somente uma representação daquele Tag.
     */
    assetsByTag.set(
      normalizeText(
        tag,
      ),
      asset,
    );
  }


  const assets =
    Array.from(
      assetsByTag.values(),
    );


  if (
    assets.length ===
    0
  ) {
    return {
      available:
        false,

      centerSheetName:
        centersSheet?.name ??
        null,

      matrixSheetName:
        criticalitySheet.name,

      plantName,

      message:
        `A planta "${plantName}" foi localizada, mas nenhum ativo válido A/B/C foi encontrado na matriz.`,

      assets:
        [],

      matrixByCriticality: {
        A: 0,
        B: 0,
        C: 0,
      },

      nameResolution:
        new Map(),
    };
  }


  const matrixByCriticality = {
    A: 0,
    B: 0,
    C: 0,
  };


  for (
    const asset
    of assets
  ) {
    matrixByCriticality[
      asset.criticality
    ] +=
      1;
  }


  /*
   * Um mesmo texto de descrição pode existir em mais de um
   * Tag da matriz.
   *
   * Regras:
   *
   * 1. descrição única:
   *    podemos atribuir a criticidade com segurança;
   *
   * 2. descrição repetida, mas todos os Tags têm a mesma
   *    criticidade:
   *    podemos atribuir A/B/C ao apontamento, porém não
   *    afirmamos qual Tag específico originou a falha;
   *
   * 3. descrição repetida com criticidades diferentes:
   *    NÃO classificamos automaticamente.
   */
  const groupedByName =
    new Map<
      string,
      CriticalityMatrixAsset[]
    >();


  for (
    const asset
    of assets
  ) {
    const current =
      groupedByName.get(
        asset
          .normalizedEquipmentName,
      ) ??
      [];

    current.push(
      asset,
    );

    groupedByName.set(
      asset
        .normalizedEquipmentName,
      current,
    );
  }


  const nameResolution =
    new Map<
      string,
      CriticalityNameResolution
    >();


  for (
    const [
      normalizedName,
      groupedAssets,
    ]
    of groupedByName
  ) {
    const criticalities =
      new Set(
        groupedAssets.map(
          (
            asset,
          ) =>
            asset.criticality,
        ),
      );


    if (
      groupedAssets.length ===
      1
    ) {
      nameResolution.set(
        normalizedName,
        {
          criticality:
            groupedAssets[0]
              .criticality,

          matchType:
            "EXACT_UNIQUE",

          matrixRows:
            1,
        },
      );

      continue;
    }


    if (
      criticalities.size ===
      1
    ) {
      nameResolution.set(
        normalizedName,
        {
          criticality:
            groupedAssets[0]
              .criticality,

          matchType:
            "EXACT_SAME_CRITICALITY",

          matrixRows:
            groupedAssets.length,
        },
      );

      continue;
    }


    nameResolution.set(
      normalizedName,
      {
        criticality:
          null,

        matchType:
          "CONFLICT",

        matrixRows:
          groupedAssets.length,
      },
    );
  }


  return {
    available:
      true,

    centerSheetName:
      centersSheet?.name ??
      null,

    matrixSheetName:
      criticalitySheet.name,

    plantName,

    message:
      null,

    assets,

    matrixByCriticality,

    nameResolution,
  };
}


async function syncCriticalityMatrix(
  connection:
    PoolConnection,

  params: {
    unitId:
      number;

    importId:
      number;

    context:
      CriticalityContext;
  },
): Promise<void> {
  if (
    !params.context
      .available ||
    params.context
      .assets.length ===
      0
  ) {
    return;
  }


  try {
    await getTableDefinition(
      connection,
      "equipment_criticality_matrix",
    );
  } catch {
    throw new Error(
      "A tabela equipment_criticality_matrix não existe. Execute a migration da matriz de criticidade antes de processar a planilha.",
    );
  }


  /*
   * A tabela é uma cópia estruturada da fonte oficial.
   * Marcamos o snapshot anterior como inativo e reativamos
   * tudo o que está presente na planilha atual.
   */
  await connection.execute<
    ResultSetHeader
  >(
    `
      UPDATE
        equipment_criticality_matrix

      SET
        active = FALSE

      WHERE
        unit_id = ?
    `,
    [
      params.unitId,
    ],
  );


  const batches =
    splitIntoBatches(
      params.context
        .assets,
      DATABASE_BATCH_SIZE,
    );


  for (
    const batch
    of batches
  ) {
    const values:
      SqlValue[] =
        [];


    const placeholders =
      batch
        .map(
          (
            asset,
          ) => {
            values.push(
              params.unitId,
              params.importId,
              asset.plant,
              asset
                .technicalLocation,
              asset
                .parentEquipment,
              asset.tag,
              asset
                .equipmentName,
              asset
                .normalizedEquipmentName,
              asset
                .criticality,
              params.context
                .matrixSheetName ??
                CRITICALITY_SHEET_NAME,
              true,
            );

            return (
              "(" +
              new Array(
                11,
              )
                .fill(
                  "?",
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


    await connection.query<
      ResultSetHeader
    >(
      `
        INSERT INTO
          equipment_criticality_matrix
        (
          unit_id,
          last_import_id,
          plant_name,
          technical_location,
          parent_equipment,
          tag,
          equipment_name,
          normalized_equipment_name,
          criticality,
          source_sheet,
          active
        )

        VALUES
          ${placeholders}

        ON DUPLICATE KEY UPDATE
          last_import_id =
            VALUES(
              last_import_id
            ),

          plant_name =
            VALUES(
              plant_name
            ),

          technical_location =
            VALUES(
              technical_location
            ),

          parent_equipment =
            VALUES(
              parent_equipment
            ),

          equipment_name =
            VALUES(
              equipment_name
            ),

          normalized_equipment_name =
            VALUES(
              normalized_equipment_name
            ),

          criticality =
            VALUES(
              criticality
            ),

          source_sheet =
            VALUES(
              source_sheet
            ),

          active =
            TRUE
      `,
      values,
    );
  }
}


function sourceEquipmentCode(
  unitId:
    number,

  normalizedEquipmentName:
    string,
): string {
  return (
    "SRC-" +
    sha256Text(
      `${unitId}|${normalizedEquipmentName}`,
    ).slice(
      0,
      24,
    )
  );
}


async function syncEquipmentAliases(
  connection:
    PoolConnection,

  items:
    Array<{
      equipmentId:
        number;

      alias:
        string;

      normalizedAlias:
        string;
    }>,
): Promise<void> {
  if (
    items.length ===
    0
  ) {
    return;
  }


  const unique =
    new Map<
      string,
      {
        equipmentId:
          number;

        alias:
          string;

        normalizedAlias:
          string;
      }
    >();


  for (
    const item
    of items
  ) {
    unique.set(
      `${item.equipmentId}|${item.alias}`,
      item,
    );
  }


  const batches =
    splitIntoBatches(
      Array.from(
        unique.values(),
      ),
      DATABASE_BATCH_SIZE,
    );


  for (
    const batch
    of batches
  ) {
    const values:
      SqlValue[] =
        [];


    const placeholders =
      batch
        .map(
          (
            item,
          ) => {
            values.push(
              item
                .equipmentId,
              item.alias,
              item
                .normalizedAlias,
              SOURCE_SYSTEM,
              true,
            );

            return (
              "(?, ?, ?, ?, ?)"
            );
          },
        )
        .join(
          ", ",
        );


    await connection.query<
      ResultSetHeader
    >(
      `
        INSERT IGNORE INTO
          equipment_aliases
        (
          equipment_id,
          alias,
          normalized_alias,
          source_system,
          active
        )

        VALUES
          ${placeholders}
      `,
      values,
    );
  }
}



async function relinkMaintenanceEvents(
  connection:
    PoolConnection,

  params: {
    unitId:
      number;

    equipmentIdsByNormalizedName:
      Map<
        string,
        number
      >;
  },
): Promise<number> {
  if (
    params
      .equipmentIdsByNormalizedName
      .size ===
    0
  ) {
    return 0;
  }


  const [
    rows,
  ] =
    await connection.query<
      ExistingEventEquipmentRow[]
    >(
      `
        SELECT
          id,
          source_equipment_name

        FROM
          maintenance_events

        WHERE
          unit_id = ?

          AND source_equipment_name
              IS NOT NULL
      `,
      [
        params.unitId,
      ],
    );


  const eventIdsByEquipment =
    new Map<
      number,
      number[]
    >();


  for (
    const row
    of rows
  ) {
    const normalizedName =
      normalizeEquipmentMatchText(
        row
          .source_equipment_name,
      );

    if (!normalizedName) {
      continue;
    }


    const equipmentId =
      params
        .equipmentIdsByNormalizedName
        .get(
          normalizedName,
        );


    if (!equipmentId) {
      continue;
    }


    const current =
      eventIdsByEquipment.get(
        equipmentId,
      ) ??
      [];

    current.push(
      Number(
        row.id,
      ),
    );

    eventIdsByEquipment.set(
      equipmentId,
      current,
    );
  }


  let updated =
    0;


  for (
    const [
      equipmentId,
      eventIds,
    ]
    of eventIdsByEquipment
  ) {
    const batches =
      splitIntoBatches(
        eventIds,
        DATABASE_BATCH_SIZE,
      );


    for (
      const batch
      of batches
    ) {
      const placeholders =
        batch
          .map(
            () => "?",
          )
          .join(
            ", ",
          );


      const [
        result,
      ] =
        await connection.query<
          ResultSetHeader
        >(
          `
            UPDATE
              maintenance_events

            SET
              equipment_id = ?

            WHERE
              unit_id = ?

              AND id IN (
                ${placeholders}
              )
          `,
          [
            equipmentId,
            params.unitId,
            ...batch,
          ],
        );


      updated +=
        result.affectedRows;
    }
  }


  return updated;
}


async function syncOperationalEquipments(
  connection:
    PoolConnection,

  params: {
    unitId:
      number;

    rows:
      PreparedRow[];

    context:
      CriticalityContext;
  },
): Promise<
  EquipmentSyncResult
> {
  const equipmentTable =
    await getTableDefinition(
      connection,
      "equipments",
    );


  if (
    !equipmentTable
      .columns.has(
        "criticality",
      )
  ) {
    throw new Error(
      "A coluna equipments.criticality não existe. Execute a migration de criticidade antes de importar a matriz.",
    );
  }


  const [
    existingRows,
  ] =
    await connection.query<
      EquipmentDbRow[]
    >(
      `
        SELECT
          id,
          code,
          name,
          criticality

        FROM
          equipments

        WHERE
          unit_id = ?

          AND active = TRUE

        ORDER BY
          id ASC
      `,
      [
        params.unitId,
      ],
    );


const existingByName =
  new Map<
    string,
    EquipmentRecord[]
  >();


  for (
    const existing
    of existingRows
  ) {
    const normalizedName =
      normalizeEquipmentMatchText(
        existing.name,
      );

    if (
      !normalizedName
    ) {
      continue;
    }

    const current =
      existingByName.get(
        normalizedName,
      ) ??
      [];

    current.push(
      existing,
    );

    existingByName.set(
      normalizedName,
      current,
    );
  }


  const sourceNames =
    new Map<
      string,
      {
        sourceName:
          string;

        occurrences:
          number;
      }
    >();


  for (
    const row
    of params.rows
  ) {
    const sourceName =
      nullableString(
        row.sourceEquipmentName,
      );

    const normalizedName =
      normalizeEquipmentMatchText(
        sourceName,
      );

    if (
      !sourceName ||
      !normalizedName
    ) {
      continue;
    }


    const current =
      sourceNames.get(
        normalizedName,
      );


    if (current) {
      current.occurrences +=
        1;
    } else {
      sourceNames.set(
        normalizedName,
        {
          sourceName,

          occurrences:
            1,
        },
      );
    }
  }


  const equipmentIdsByNormalizedName =
    new Map<
      string,
      number
    >();


  const aliases:
    Array<{
      equipmentId:
        number;

      alias:
        string;

      normalizedAlias:
        string;
    }> =
      [];


  let matchedEvents =
    0;

  let matchedUniqueEquipmentNames =
    0;

  let ambiguousSameCriticalityNames =
    0;

  let conflictingNames =
    0;

  let notFoundNames =
    0;


  for (
    const [
      normalizedName,
      source,
    ]
    of sourceNames
  ) {
    const resolution =
      params.context
        .available
        ? params.context
            .nameResolution
            .get(
              normalizedName,
            )
        : undefined;


    const resolvedCriticality =
      resolution
        ?.criticality ??
      null;


    if (
      params.context
        .available
    ) {
      if (
        resolvedCriticality
      ) {
        matchedEvents +=
          source.occurrences;

        matchedUniqueEquipmentNames +=
          1;

        if (
          resolution
            ?.matchType ===
          "EXACT_SAME_CRITICALITY"
        ) {
          ambiguousSameCriticalityNames +=
            1;
        }
      } else if (
        resolution
          ?.matchType ===
        "CONFLICT"
      ) {
        conflictingNames +=
          1;
      } else {
        notFoundNames +=
          1;
      }
    }


    const candidates =
      existingByName.get(
        normalizedName,
      ) ??
      [];


    let selected:
  EquipmentRecord | null =
    candidates.find(
      (
        item,
      ) =>
        item.code
          .toUpperCase()
          .startsWith(
            "SRC-",
          ),
    ) ??
    candidates[0] ??
    null;


    if (!selected) {
      const data:
        Record<
          string,
          unknown
        > = {
        unit_id:
          params.unitId,

        production_line_id:
          null,

        code:
          sourceEquipmentCode(
            params.unitId,
            normalizedName,
          ),

        name:
          source.sourceName,

        description:
          "Equipamento identificado automaticamente nos apontamentos. A criticidade é sincronizada pela matriz Criticidade ABC quando existe correspondência segura.",

        criticality:
          params.context
            .available
            ? resolvedCriticality
            : null,

        active:
          true,
      };


      if (
        equipmentTable
          .columns.has(
            "criticality_justification",
          )
      ) {
        data
          .criticality_justification =
          resolvedCriticality
            ? "Sincronizado automaticamente da aba Criticidade ABC."
            : null;
      }


      if (
        equipmentTable
          .columns.has(
            "criticality_updated_by",
          )
      ) {
        data
          .criticality_updated_by =
          null;
      }


      if (
        equipmentTable
          .columns.has(
            "criticality_updated_at",
          )
      ) {
        data
          .criticality_updated_at =
          params.context
            .available
            ? new Date()
            : null;
      }


      const insertedId =
        await insertObject(
          connection,
          "equipments",
          data,
        );


      selected = {
        id:
          insertedId,

        code:
          String(
            data.code,
          ),

        name:
          source.sourceName,

        criticality:
          params.context
            .available
            ? resolvedCriticality
            : null,
      };


      const current =
        existingByName.get(
          normalizedName,
        ) ??
        [];

      current.push(
        selected,
      );

      existingByName.set(
        normalizedName,
        current,
      );
    } else {
      const updateData:
        Record<
          string,
          unknown
        > = {
        name:
          source.sourceName,

        active:
          true,
      };


      /*
       * Só alteramos a criticidade se a matriz desta
       * importação foi realmente localizada.
       *
       * Se a planilha vier sem a aba oficial, preservamos
       * o valor já armazenado.
       */
      if (
        params.context
          .available
      ) {
        updateData.criticality =
          resolvedCriticality;


        if (
          equipmentTable
            .columns.has(
              "criticality_justification",
            )
        ) {
          updateData
            .criticality_justification =
            resolvedCriticality
              ? "Sincronizado automaticamente da aba Criticidade ABC."
              : null;
        }


        if (
          equipmentTable
            .columns.has(
              "criticality_updated_by",
            )
        ) {
          updateData
            .criticality_updated_by =
            null;
        }


        if (
          equipmentTable
            .columns.has(
              "criticality_updated_at",
            )
        ) {
          updateData
            .criticality_updated_at =
            new Date();
        }
      }


      await updateObject(
        connection,
        "equipments",
        Number(
          selected.id,
        ),
        updateData,
      );
    }


    const equipmentId =
      Number(
        selected.id,
      );


    equipmentIdsByNormalizedName.set(
      normalizedName,
      equipmentId,
    );


    aliases.push({
      equipmentId,

      alias:
        source.sourceName,

      normalizedAlias:
        normalizedName,
    });
  }


  await syncEquipmentAliases(
    connection,
    aliases,
  );


  const eventsWithEquipment =
    Array.from(
      sourceNames.values(),
    ).reduce(
      (
        total,
        item,
      ) =>
        total +
        item.occurrences,
      0,
    );


  const unmatchedEvents =
    params.context
      .available
      ? Math.max(
          0,
          eventsWithEquipment -
          matchedEvents,
        )
      : eventsWithEquipment;


  const coveragePercent =
    (
      params.context
        .available &&
      eventsWithEquipment >
        0
    )
      ? Number(
          (
            matchedEvents /
            eventsWithEquipment *
            100
          ).toFixed(
            2,
          ),
        )
      : 0;


  return {
    equipmentIdsByNormalizedName,

    eventsWithEquipment,

    matchedEvents,

    unmatchedEvents,

    coveragePercent,

    uniqueEquipmentNames:
      sourceNames.size,

    matchedUniqueEquipmentNames,

    ambiguousSameCriticalityNames,

    conflictingNames,

    notFoundNames,
  };
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

    equipmentIdsByNormalizedName:
      Map<
        string,
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


  for (
    const row
    of params.rows
  ) {
    if (
      row.unitId !==
      params.unitId
    ) {
      throw new Error(
        `Lote de manutenção contém uma linha da unidade ${row.unitId}, mas o lote pertence à unidade ${params.unitId}.`,
      );
    }
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
   * 24 valores são enviados por parâmetros (?).
   * 2 campos continuam NULL:
   *
   * production_line_id
   * material_id
   *
   * equipment_id agora é preenchido automaticamente
   * pelo cadastro operacional sincronizado com a matriz.
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
            ?,
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
   * São exatamente 24 valores
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
      row.unitId,

      // 2
      params.importId,

      // 3
      rawRowId,

      /*
       * 4 = production_line_id
       * permanece NULL diretamente no SQL.
       *
       * 5 = equipment_id
       * agora é resolvido a partir do nome do equipamento.
       *
       * 6 = material_id
       * permanece NULL diretamente no SQL.
       */

      // 5
      row.sourceEquipmentName
        ? params
            .equipmentIdsByNormalizedName
            .get(
              normalizeEquipmentMatchText(
                row.sourceEquipmentName,
              ),
            ) ??
          null
        : null,

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
   * exatamente 24 parâmetros.
   */
  const expectedParameters =
    rows.length * 24;


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
    // UNIDADES DISPONÍVEIS PARA O USUÁRIO
    //
    // A unidade de cada falha agora vem do campo Centro da
    // própria linha. A session.unitId continua sendo apenas a
    // unidade padrão da sessão e não é mais aplicada a todas
    // as ocorrências.
    // --------------------------------------------------------

    const accessibleUnits =
      await getAccessibleUnits(
        connection,
        session.userId,
        session.unitId,
      );


    const unitsById =
      new Map<
        number,
        UnitRow
      >(
        accessibleUnits.map(
          (
            unit,
          ) => [
            Number(
              unit.id,
            ),
            unit,
          ],
        ),
      );


    const unitByAlias =
      buildUnitAliasMap(
        accessibleUnits,
      );


    // --------------------------------------------------------
    // RESOLVE UNIDADE E NORMALIZA CADA LINHA
    // --------------------------------------------------------

    const preparedRows:
      PreparedRow[] =
        [];

    let ignoredByUnit =
      0;

    let ignoredInvalidDate =
      0;

    const ignoredCenters =
      new Set<string>();


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


      const rowUnit =
        resolveRowUnit(
          row,
          unitByAlias,
        );


      if (!rowUnit) {
        ignoredByUnit +=
          1;

        const sourceCenter =
          nullableString(
            row[
              HEADERS.center
            ],
          );

        if (sourceCenter) {
          ignoredCenters.add(
            sourceCenter,
          );
        }

        continue;
      }


      const prepared =
        prepareRow(
          row,
          sourceRowNumber,
          Number(
            rowUnit.id,
          ),
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
      connection.release();

      return NextResponse.json(
        {
          error:
            "Nenhum apontamento válido de uma unidade autorizada foi encontrado na planilha.",

          details: {
            totalRows:
              excelRows.length,

            ignoredByUnit,

            ignoredInvalidDate,

            ignoredCenters:
              Array.from(
                ignoredCenters,
              ),
          },
        },
        {
          status:
            400,
        },
      );
    }


    // --------------------------------------------------------
    // AGRUPA POR UNIDADE
    //
    // Equipamentos, criticidade e maintenance_events são
    // processados dentro da unidade correta.
    // --------------------------------------------------------

    const rowsByUnit =
      groupPreparedRowsByUnit(
        preparedRows,
      );


    const importedUnitIds =
      Array.from(
        rowsByUnit.keys(),
      ).sort(
        (
          left,
          right,
        ) =>
          left - right,
      );


    const primaryUnitId =
      importedUnitIds.includes(
        session.unitId,
      )
        ? session.unitId
        : importedUnitIds[0];


    const primaryUnit =
      unitsById.get(
        primaryUnitId,
      );


    if (!primaryUnit) {
      throw new Error(
        "Não foi possível determinar a unidade principal da importação.",
      );
    }


    // --------------------------------------------------------
    // CONTEXTOS DE CRITICIDADE POR UNIDADE
    // --------------------------------------------------------

    const criticalityByUnit =
      new Map<
        number,
        CriticalityContext
      >();


    for (
      const unitId
      of importedUnitIds
    ) {
      const unit =
        unitsById.get(
          unitId,
        );

      const unitRows =
        rowsByUnit.get(
          unitId,
        ) ??
        [];


      if (!unit) {
        throw new Error(
          `A unidade ${unitId} não está disponível para o usuário atual.`,
        );
      }


      const context =
        buildCriticalityContext(
          workbook,
          unit,
          unitRows,
        );


      criticalityByUnit.set(
        unitId,
        context,
      );


      if (
        !context.available &&
        context.message
      ) {
        console.warn(
          `[Unidade ${unitId}] ${context.message}`,
        );
      }
    }


    // --------------------------------------------------------
    // DUPLICIDADE
    //
    // imports.unit_id continua representando a unidade
    // principal do arquivo para compatibilidade com o schema
    // atual. O vínculo real de cada falha fica em
    // maintenance_events.unit_id.
    // --------------------------------------------------------

    const duplicateId =
      await findDuplicateImport(
        connection,
        importConfig,
        primaryUnitId,
        fileHash,
      );


    /*
     * Não retornamos imediatamente em caso de duplicidade.
     *
     * Mesmo quando os apontamentos já foram importados,
     * ainda permitimos sincronizar criticidade, equipamentos
     * e os vínculos dos eventos de todas as unidades do arquivo.
     */


    // --------------------------------------------------------
    // PLANILHA JÁ IMPORTADA
    // --------------------------------------------------------

    if (
      duplicateId !==
      null
    ) {
      await connection
        .beginTransaction();


      const duplicateUnitSummaries:
        Array<
          {
            unit: {
              id: number;
              code: string | null;
              sapCode: string | null;
              city: string | null;
              state: string | null;
              name: string | null;
            };
            rows: number;
            criticality: CriticalityContext;
            equipmentSync: EquipmentSyncResult;
            relinkedEvents: number;
          }
        > =
          [];


      for (
        const unitId
        of importedUnitIds
      ) {
        const unit =
          unitsById.get(
            unitId,
          );

        const unitRows =
          rowsByUnit.get(
            unitId,
          ) ??
          [];

        const context =
          criticalityByUnit.get(
            unitId,
          );


        if (
          !unit ||
          !context
        ) {
          throw new Error(
            `Contexto da unidade ${unitId} não encontrado durante a sincronização da duplicidade.`,
          );
        }


        await syncCriticalityMatrix(
          connection,
          {
            unitId,

            importId:
              duplicateId,

            context,
          },
        );


        const equipmentSync =
          await syncOperationalEquipments(
            connection,
            {
              unitId,

              rows:
                unitRows,

              context,
            },
          );


        const relinkedEvents =
          await relinkMaintenanceEvents(
            connection,
            {
              unitId,

              equipmentIdsByNormalizedName:
                equipmentSync
                  .equipmentIdsByNormalizedName,
            },
          );


        duplicateUnitSummaries.push({
          unit: {
            id:
              Number(
                unit.id,
              ),

            code:
              unit.code ??
              null,

            sapCode:
              unit.sap_code ??
              null,

            city:
              unit.city ??
              null,

            state:
              unit.state ??
              null,

            name:
              unit.name ??
              null,
          },

          rows:
            unitRows.length,

          criticality:
            context,

          equipmentSync,

          relinkedEvents,
        });
      }


      await connection
        .commit();


      const primarySummary =
        duplicateUnitSummaries.find(
          (
            item,
          ) =>
            item.unit.id ===
            primaryUnitId,
        ) ??
        duplicateUnitSummaries[0];


      connection.release();


      return NextResponse.json(
        {
          error:
            "Essa planilha já havia sido importada. Os apontamentos não foram duplicados e a matriz de criticidade foi sincronizada para as unidades identificadas.",

          duplicate:
            true,

          importId:
            duplicateId,

          ignoredByUnit,

          ignoredInvalidDate,

          ignoredCenters:
            Array.from(
              ignoredCenters,
            ),

          units:
            duplicateUnitSummaries.map(
              (
                item,
              ) => ({
                ...item.unit,

                rows:
                  item.rows,

                relinkedEvents:
                  item.relinkedEvents,
              }),
            ),

          criticality:
            primarySummary
              ? {
                  source:
                    CRITICALITY_SHEET_NAME,

                  available:
                    primarySummary
                      .criticality
                      .available,

                  message:
                    primarySummary
                      .criticality
                      .message,

                  centerSheetName:
                    primarySummary
                      .criticality
                      .centerSheetName,

                  matrixSheetName:
                    primarySummary
                      .criticality
                      .matrixSheetName,

                  plant:
                    primarySummary
                      .criticality
                      .plantName,

                  matrixAssets:
                    primarySummary
                      .criticality
                      .assets.length,

                  matrixByCriticality:
                    primarySummary
                      .criticality
                      .matrixByCriticality,

                  relinkedEvents:
                    primarySummary
                      .relinkedEvents,

                  matching: {
                    eventsWithEquipment:
                      primarySummary
                        .equipmentSync
                        .eventsWithEquipment,

                    matchedEvents:
                      primarySummary
                        .equipmentSync
                        .matchedEvents,

                    unmatchedEvents:
                      primarySummary
                        .equipmentSync
                        .unmatchedEvents,

                    coveragePercent:
                      primarySummary
                        .equipmentSync
                        .coveragePercent,

                    uniqueEquipmentNames:
                      primarySummary
                        .equipmentSync
                        .uniqueEquipmentNames,

                    matchedUniqueEquipmentNames:
                      primarySummary
                        .equipmentSync
                        .matchedUniqueEquipmentNames,

                    ambiguousSameCriticalityNames:
                      primarySummary
                        .equipmentSync
                        .ambiguousSameCriticalityNames,

                    conflictingNames:
                      primarySummary
                        .equipmentSync
                        .conflictingNames,

                    notFoundNames:
                      primarySummary
                        .equipmentSync
                        .notFoundNames,
                  },

                  units:
                    duplicateUnitSummaries.map(
                      (
                        item,
                      ) => ({
                        unit:
                          item.unit,

                        rows:
                          item.rows,

                        available:
                          item
                            .criticality
                            .available,

                        message:
                          item
                            .criticality
                            .message,

                        plant:
                          item
                            .criticality
                            .plantName,

                        matrixAssets:
                          item
                            .criticality
                            .assets.length,

                        matrixByCriticality:
                          item
                            .criticality
                            .matrixByCriticality,

                        relinkedEvents:
                          item
                            .relinkedEvents,

                        matching: {
                          eventsWithEquipment:
                            item
                              .equipmentSync
                              .eventsWithEquipment,

                          matchedEvents:
                            item
                              .equipmentSync
                              .matchedEvents,

                          unmatchedEvents:
                            item
                              .equipmentSync
                              .unmatchedEvents,

                          coveragePercent:
                            item
                              .equipmentSync
                              .coveragePercent,

                          uniqueEquipmentNames:
                            item
                              .equipmentSync
                              .uniqueEquipmentNames,

                          matchedUniqueEquipmentNames:
                            item
                              .equipmentSync
                              .matchedUniqueEquipmentNames,

                          ambiguousSameCriticalityNames:
                            item
                              .equipmentSync
                              .ambiguousSameCriticalityNames,

                          conflictingNames:
                            item
                              .equipmentSync
                              .conflictingNames,

                          notFoundNames:
                            item
                              .equipmentSync
                              .notFoundNames,
                        },
                      }),
                    ),
                }
              : null,
        },
        {
          status:
            409,
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
            primaryUnitId,

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


    const unitSummaries:
      Array<
        {
          unit: {
            id: number;
            code: string | null;
            sapCode: string | null;
            city: string | null;
            state: string | null;
            name: string | null;
          };
          rows: number;
          criticality: CriticalityContext;
          equipmentSync: EquipmentSyncResult;
        }
      > =
        [];


    /*
     * A importação é processada por unidade.
     *
     * Isso garante que:
     * - cada falha receba o unit_id do seu próprio Centro;
     * - equipamentos sejam criados/vinculados na unidade certa;
     * - a matriz de criticidade seja sincronizada por unidade;
     * - raw_import_rows.unit_id, quando existir, também fique certo.
     */
    for (
      const unitId
      of importedUnitIds
    ) {
      const unit =
        unitsById.get(
          unitId,
        );

      const unitRows =
        rowsByUnit.get(
          unitId,
        ) ??
        [];

      const context =
        criticalityByUnit.get(
          unitId,
        );


      if (
        !unit ||
        !context
      ) {
        throw new Error(
          `Contexto da unidade ${unitId} não encontrado durante a importação.`,
        );
      }


      await syncCriticalityMatrix(
        connection,
        {
          unitId,

          importId,

          context,
        },
      );


      const equipmentSync =
        await syncOperationalEquipments(
          connection,
          {
            unitId,

            rows:
              unitRows,

            context,
          },
        );


      const batches =
        splitIntoBatches(
          unitRows,
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

              unitId,

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
              unitId,

              importId,

              rows:
                batch,

              rawIds,

              equipmentIdsByNormalizedName:
                equipmentSync
                  .equipmentIdsByNormalizedName,
            },
          );


        importedRows +=
          inserted;
      }


      unitSummaries.push({
        unit: {
          id:
            Number(
              unit.id,
            ),

          code:
            unit.code ??
            null,

          sapCode:
            unit.sap_code ??
            null,

          city:
            unit.city ??
            null,

          state:
            unit.state ??
            null,

          name:
            unit.name ??
            null,
        },

        rows:
          unitRows.length,

        criticality:
          context,

        equipmentSync,
      });
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
    // MODELO ML POR UNIDADE
    //
    // O mesmo import_id pode conter eventos de várias unidades,
    // porém classifyImportWithMl também recebe unitId. Portanto
    // executamos uma passagem para cada unidade presente no arquivo.
    // ========================================================

    let mlResult:
      Awaited<
        ReturnType<
          typeof classifyImportWithMl
        >
      > | null =
        null;


    const mlByUnit:
      Array<
        {
          unitId: number;
          success: boolean;
          result:
            Awaited<
              ReturnType<
                typeof classifyImportWithMl
              >
            > | null;
          error: string | null;
        }
      > =
        [];


    for (
      const unitId
      of importedUnitIds
    ) {
      try {
        const result =
          await classifyImportWithMl({
            importId,

            unitId,

            batchSize:
              ML_BATCH_SIZE,
          });


        if (
          unitId ===
            primaryUnitId ||
          mlResult ===
            null
        ) {
          mlResult =
            result;
        }


        mlByUnit.push({
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
          error instanceof Error
            ? error.message
            : "Erro desconhecido no Modelo ML.";


        console.error(
          `Importação ${importId} concluída, mas houve erro no Modelo ML para a unidade ${unitId}:`,
          error,
        );


        mlByUnit.push({
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


    // --------------------------------------------------------
    // RESPOSTA FINAL
    // --------------------------------------------------------

    const primarySummary =
      unitSummaries.find(
        (
          item,
        ) =>
          item.unit.id ===
          primaryUnitId,
      ) ??
      unitSummaries[0];


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

        /*
         * Mantidos também para compatibilidade com componentes
         * antigos da interface de importação.
         */
        totalRows:
          excelRows.length,

        processedRows:
          importedRows,

        failedRows:
          ignoredRows,

        ignoredRows,

        ignoredByUnit,

        ignoredInvalidDate,

        ignoredCenters:
          Array.from(
            ignoredCenters,
          ),

        unit: {
          id:
            Number(
              primaryUnit.id,
            ),

          code:
            primaryUnit.code ??
            null,

          sapCode:
            primaryUnit.sap_code ??
            null,

          city:
            primaryUnit.city ??
            null,

          state:
            primaryUnit.state ??
            null,

          name:
            primaryUnit.name ??
            null,
        },

        units:
          unitSummaries.map(
            (
              item,
            ) => ({
              ...item.unit,

              rows:
                item.rows,
            }),
          ),
      },

      criticality:
        primarySummary
          ? {
              source:
                CRITICALITY_SHEET_NAME,

              available:
                primarySummary
                  .criticality
                  .available,

              message:
                primarySummary
                  .criticality
                  .message,

              centerSheetName:
                primarySummary
                  .criticality
                  .centerSheetName,

              matrixSheetName:
                primarySummary
                  .criticality
                  .matrixSheetName,

              plant:
                primarySummary
                  .criticality
                  .plantName,

              matrixAssets:
                primarySummary
                  .criticality
                  .assets.length,

              matrixByCriticality:
                primarySummary
                  .criticality
                  .matrixByCriticality,

              matching: {
                eventsWithEquipment:
                  primarySummary
                    .equipmentSync
                    .eventsWithEquipment,

                matchedEvents:
                  primarySummary
                    .equipmentSync
                    .matchedEvents,

                unmatchedEvents:
                  primarySummary
                    .equipmentSync
                    .unmatchedEvents,

                coveragePercent:
                  primarySummary
                    .equipmentSync
                    .coveragePercent,

                uniqueEquipmentNames:
                  primarySummary
                    .equipmentSync
                    .uniqueEquipmentNames,

                matchedUniqueEquipmentNames:
                  primarySummary
                    .equipmentSync
                    .matchedUniqueEquipmentNames,

                ambiguousSameCriticalityNames:
                  primarySummary
                    .equipmentSync
                    .ambiguousSameCriticalityNames,

                conflictingNames:
                  primarySummary
                    .equipmentSync
                    .conflictingNames,

                notFoundNames:
                  primarySummary
                    .equipmentSync
                    .notFoundNames,
              },

              units:
                unitSummaries.map(
                  (
                    item,
                  ) => ({
                    unit:
                      item.unit,

                    rows:
                      item.rows,

                    available:
                      item
                        .criticality
                        .available,

                    message:
                      item
                        .criticality
                        .message,

                    plant:
                      item
                        .criticality
                        .plantName,

                    matrixAssets:
                      item
                        .criticality
                        .assets.length,

                    matrixByCriticality:
                      item
                        .criticality
                        .matrixByCriticality,

                    matching: {
                      eventsWithEquipment:
                        item
                          .equipmentSync
                          .eventsWithEquipment,

                      matchedEvents:
                        item
                          .equipmentSync
                          .matchedEvents,

                      unmatchedEvents:
                        item
                          .equipmentSync
                          .unmatchedEvents,

                      coveragePercent:
                        item
                          .equipmentSync
                          .coveragePercent,

                      uniqueEquipmentNames:
                        item
                          .equipmentSync
                          .uniqueEquipmentNames,

                      matchedUniqueEquipmentNames:
                        item
                          .equipmentSync
                          .matchedUniqueEquipmentNames,

                      ambiguousSameCriticalityNames:
                        item
                          .equipmentSync
                          .ambiguousSameCriticalityNames,

                      conflictingNames:
                        item
                          .equipmentSync
                          .conflictingNames,

                      notFoundNames:
                        item
                          .equipmentSync
                          .notFoundNames,
                    },
                  }),
                ),
            }
          : null,

      ml:
        mlResult,

      mlByUnit,

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
