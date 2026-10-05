import { publicErrorMessage } from "@/lib/errors";
import { getWriteAccessError } from "@/lib/write-access";
import { MAX_IMPORT_BYTES } from "@/lib/imports/limits";
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
  isAnalystRole,
} from "@/lib/roles";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const maxDuration =
  300;


/* ============================================================
   CONFIGURAÇÃO
============================================================ */

const MATRIX_BATCH_SIZE =
  400;

const EVENT_BATCH_SIZE =
  500;

const SOURCE_SYSTEM =
  "SAP";

const CENTERS_SHEET_NAME =
  "Centros KOFBR";

const CRITICALITY_SHEET_NAME =
  "Criticidade ABC";


/* ============================================================
   CABEÇALHOS
============================================================ */

const CENTER_HEADERS = {
  centerCode:
    "Cod. Centro",

  unitName:
    "Unidade",

  sapCode:
    "Cod. SAP",
} as const;


const CRITICALITY_HEADERS = {
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


/* ============================================================
   TIPOS
============================================================ */

type ExcelRow =
  Record<
    string,
    unknown
  >;


type EquipmentCriticality =
  | "A"
  | "B"
  | "C";


interface UnitRow
  extends RowDataPacket {
  id:
    number;

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

  name?:
    string | null;

  short_name?:
    string | null;
}


interface TableColumnRow
  extends RowDataPacket {
  Field:
    string;
}


interface MatrixAsset {
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


interface NameResolution {
  criticality:
    EquipmentCriticality | null;

  conflict:
    boolean;

  matrixRows:
    number;
}


interface SourceEquipmentRow
  extends RowDataPacket {
  source_equipment_name:
    string;

  occurrences:
    number | string;

  downtime_minutes:
    number | string | null;
}


interface EquipmentDbRow
  extends RowDataPacket {
  id:
    number;

  code:
    string;

  name:
    string;

  criticality:
    EquipmentCriticality | null;
}


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


interface ExistingEventRow
  extends RowDataPacket {
  id:
    number;

  source_equipment_name:
    string | null;
}


interface MatrixSummaryRow
  extends RowDataPacket {
  total:
    number | string | null;

  class_a:
    number | string | null;

  class_b:
    number | string | null;

  class_c:
    number | string | null;

  last_sync:
    Date | string | null;

  plant_name:
    string | null;
}


interface CoverageRow
  extends RowDataPacket {
  total_events:
    number | string | null;

  linked_events:
    number | string | null;

  events_with_criticality:
    number | string | null;
}


interface ExposureRow
  extends RowDataPacket {
  criticality:
    EquipmentCriticality;

  occurrences:
    number | string | null;

  affected_equipments:
    number | string | null;

  downtime_minutes:
    number | string | null;
}


interface TopCriticalRow
  extends RowDataPacket {
  equipment_id:
    number;

  equipment:
    string;

  code:
    string;

  occurrences:
    number | string | null;

  downtime_minutes:
    number | string | null;

  mttr:
    number | string | null;
}


/* ============================================================
   HELPERS
============================================================ */

function nullableString(
  value:
    unknown,
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


function normalizeText(
  value:
    unknown,
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


function normalizeIntegrationCode(
  value:
    unknown,
): string {
  return normalizeText(
    value,
  ).replace(
    /[^A-Z0-9]/g,
    "",
  );
}


function normalizeEquipmentName(
  value:
    unknown,
): string {
  return normalizeText(
    value,
  )
    .replace(
      /[^A-Z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}


function getRowValue(
  row:
    ExcelRow,

  expectedHeader:
    string,
): unknown {
  const normalizedExpected =
    normalizeText(
      expectedHeader,
    );

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      row,
    )
  ) {
    if (
      normalizeText(
        key,
      ) ===
      normalizedExpected
    ) {
      return value;
    }
  }

  return null;
}


function numericValue(
  value:
    unknown,
): number {
  const number =
    Number(
      value ?? 0,
    );

  return Number.isFinite(
    number,
  )
    ? number
    : 0;
}


function isCriticality(
  value:
    unknown,
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


function sha256Text(
  value:
    string,
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


function equipmentCode(
  unitId:
    number,

  normalizedName:
    string,
): string {
  return (
    "SRC-" +
    sha256Text(
      `${unitId}|${normalizedName}`,
    ).slice(
      0,
      24,
    )
  );
}


function formatDatabaseDateTime(
  value:
    Date | string | null,
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


function findSheet(
  workbook:
    XLSX.WorkBook,

  expectedName:
    string,
): {
  name:
    string;

  worksheet:
    XLSX.WorkSheet;
} | null {
  const normalizedExpected =
    normalizeText(
      expectedName,
    );

  for (
    const name
    of workbook.SheetNames
  ) {
    if (
      normalizeText(
        name,
      ) !==
      normalizedExpected
    ) {
      continue;
    }

    const worksheet =
      workbook.Sheets[
        name
      ];

    if (!worksheet) {
      continue;
    }

    return {
      name,
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


function splitIntoBatches<T>(
  values:
    T[],

  size:
    number,
): T[][] {
  const result:
    T[][] =
      [];

  for (
    let index = 0;
    index <
    values.length;
    index +=
      size
  ) {
    result.push(
      values.slice(
        index,
        index +
          size,
      ),
    );
  }

  return result;
}


/* ============================================================
   UNIDADE
============================================================ */

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
        SELECT
          *

        FROM
          units

        WHERE
          id = ?

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


/* ============================================================
   COLUNAS
============================================================ */

async function getTableColumns(
  connection:
    PoolConnection,

  tableName:
    string,
): Promise<
  Set<string>
> {
  const [
    rows,
  ] =
    await connection.query<
      TableColumnRow[]
    >(
      `SHOW COLUMNS FROM \`${tableName}\``,
    );

  return new Set(
    rows.map(
      (
        row,
      ) =>
        row.Field,
    ),
  );
}


/* ============================================================
   IDENTIFICAÇÃO DA PLANTA + LEITURA DA MATRIZ
============================================================ */

function buildMatrixContext(
  workbook:
    XLSX.WorkBook,

  unit:
    UnitRow,
): {
  centerSheetName:
    string | null;

  matrixSheetName:
    string;

  plantName:
    string;

  assets:
    MatrixAsset[];

  nameResolution:
    Map<
      string,
      NameResolution
    >;

  matrixByCriticality: {
    A:
      number;

    B:
      number;

    C:
      number;
  };
} {
  const centersSheet =
    findSheet(
      workbook,
      CENTERS_SHEET_NAME,
    );

  const criticalitySheet =
    findSheet(
      workbook,
      CRITICALITY_SHEET_NAME,
    );

  if (!criticalitySheet) {
    throw new Error(
      `A aba "${CRITICALITY_SHEET_NAME}" não foi encontrada.`,
    );
  }

  const matrixRows =
    worksheetToRows(
      criticalitySheet
        .worksheet,
    );

  if (
    matrixRows.length ===
    0
  ) {
    throw new Error(
      `A aba "${CRITICALITY_SHEET_NAME}" está vazia.`,
    );
  }

  const availablePlants =
    new Map<
      string,
      string
    >();

  for (
    const row
    of matrixRows
  ) {
    const plant =
      nullableString(
        getRowValue(
          row,
          CRITICALITY_HEADERS
            .plant,
        ),
      );

    const normalized =
      normalizeText(
        plant,
      );

    if (
      plant &&
      normalized &&
      !availablePlants.has(
        normalized,
      )
    ) {
      availablePlants.set(
        normalized,
        plant,
      );
    }
  }

  const plantCandidates:
    string[] =
      [];

  const unitCodes =
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

  if (
    centersSheet
  ) {
    const centerRows =
      worksheetToRows(
        centersSheet
          .worksheet,
      );

    for (
      const row
      of centerRows
    ) {
      const centerCode =
        normalizeIntegrationCode(
          getRowValue(
            row,
            CENTER_HEADERS
              .centerCode,
          ),
        );

      const sapCode =
        normalizeIntegrationCode(
          getRowValue(
            row,
            CENTER_HEADERS
              .sapCode,
          ),
        );

      const matchesUnit =
        (
          centerCode &&
          unitCodes.has(
            centerCode,
          )
        ) ||
        (
          sapCode &&
          unitCodes.has(
            sapCode,
          )
        );

      if (
        !matchesUnit
      ) {
        continue;
      }

      const mappedUnit =
        nullableString(
          getRowValue(
            row,
            CENTER_HEADERS
              .unitName,
          ),
        );

      if (
        mappedUnit
      ) {
        plantCandidates.push(
          mappedUnit,
        );
      }
    }
  }

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

    if (
      text
    ) {
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
    const found =
      availablePlants.get(
        normalizeText(
          candidate,
        ),
      );

    if (
      found
    ) {
      plantName =
        found;

      break;
    }
  }

  if (
    !plantName
  ) {
    throw new Error(
      [
        "Não foi possível relacionar a unidade ativa",
        `a uma planta da aba "${CRITICALITY_SHEET_NAME}".`,
        `Unidade: ${unit.name ?? unit.city ?? unit.code ?? unit.id}.`,
      ].join(
        " ",
      ),
    );
  }

  const normalizedPlant =
    normalizeText(
      plantName,
    );

  const byTag =
    new Map<
      string,
      MatrixAsset
    >();

  for (
    const row
    of matrixRows
  ) {
    const rowPlant =
      normalizeText(
        getRowValue(
          row,
          CRITICALITY_HEADERS
            .plant,
        ),
      );

    if (
      rowPlant !==
      normalizedPlant
    ) {
      continue;
    }

    const tag =
      nullableString(
        getRowValue(
          row,
          CRITICALITY_HEADERS
            .tag,
        ),
      );

    const equipmentName =
      nullableString(
        getRowValue(
          row,
          CRITICALITY_HEADERS
            .equipmentDescription,
        ),
      );

    const rawCriticality =
      getRowValue(
        row,
        CRITICALITY_HEADERS
          .criticality,
      );

    if (
      !tag ||
      !equipmentName ||
      !isCriticality(
        rawCriticality,
      )
    ) {
      continue;
    }

    const normalizedEquipmentName =
      normalizeEquipmentName(
        equipmentName,
      );

    if (
      !normalizedEquipmentName
    ) {
      continue;
    }

    const asset:
      MatrixAsset = {
      plant:
        plantName,

      technicalLocation:
        nullableString(
          getRowValue(
            row,
            CRITICALITY_HEADERS
              .technicalLocation,
          ),
        ),

      parentEquipment:
        nullableString(
          getRowValue(
            row,
            CRITICALITY_HEADERS
              .parentEquipment,
          ),
        ),

      tag,

      equipmentName,

      normalizedEquipmentName,

      criticality:
        normalizeText(
          rawCriticality,
        ) as
          EquipmentCriticality,
    };

    byTag.set(
      normalizeText(
        tag,
      ),
      asset,
    );
  }

  const assets =
    Array.from(
      byTag.values(),
    );

  if (
    assets.length ===
    0
  ) {
    throw new Error(
      `Nenhum ativo válido da planta "${plantName}" foi encontrado na matriz.`,
    );
  }

  const groupedByName =
    new Map<
      string,
      MatrixAsset[]
    >();

  const matrixByCriticality = {
    A:
      0,

    B:
      0,

    C:
      0,
  };

  for (
    const asset
    of assets
  ) {
    matrixByCriticality[
      asset.criticality
    ] +=
      1;

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
      NameResolution
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
      criticalities.size ===
      1
    ) {
      nameResolution.set(
        normalizedName,
        {
          criticality:
            groupedAssets[0]
              .criticality,

          conflict:
            false,

          matrixRows:
            groupedAssets.length,
        },
      );

      continue;
    }

    /*
     * Mesmo nome de equipamento apareceu com
     * criticidades diferentes.
     *
     * Neste caso NÃO classificamos automaticamente.
     */
    nameResolution.set(
      normalizedName,
      {
        criticality:
          null,

        conflict:
          true,

        matrixRows:
          groupedAssets.length,
      },
    );
  }

  return {
    centerSheetName:
      centersSheet?.name ??
      null,

    matrixSheetName:
      criticalitySheet.name,

    plantName,

    assets,

    nameResolution,

    matrixByCriticality,
  };
}


/* ============================================================
   SINCRONIZA SNAPSHOT DA MATRIZ
============================================================ */

async function synchronizeMatrixTable(
  connection:
    PoolConnection,

  unitId:
    number,

  context:
    ReturnType<
      typeof buildMatrixContext
    >,
): Promise<void> {
  await getTableColumns(
    connection,
    "equipment_criticality_matrix",
  );

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
      unitId,
    ],
  );

  const batches =
    splitIntoBatches(
      context.assets,
      MATRIX_BATCH_SIZE,
    );

  for (
    const batch
    of batches
  ) {
    const values:
      Array<
        string |
        number |
        boolean |
        null
      > =
        [];

    const placeholders =
      batch.map(
        (
          asset,
        ) => {
          values.push(
            unitId,
            null,
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
            context
              .matrixSheetName,
            true,
          );

          return (
            "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          );
        },
      ).join(
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
            NULL,

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


/* ============================================================
   SINCRONIZA EQUIPAMENTOS OPERACIONAIS
============================================================ */

async function synchronizeOperationalEquipments(
  connection:
    PoolConnection,

  unitId:
    number,

  context:
    ReturnType<
      typeof buildMatrixContext
    >,
): Promise<{
  totalEvents:
    number;

  matchedEvents:
    number;

  matchedNames:
    number;

  notFoundNames:
    number;

  conflictingNames:
    number;

  linkedEvents:
    number;
}> {
  const equipmentColumns =
    await getTableColumns(
      connection,
      "equipments",
    );

  if (
    !equipmentColumns.has(
      "criticality",
    )
  ) {
    throw new Error(
      "A coluna equipments.criticality não existe. Execute a migration de criticidade.",
    );
  }

  const [
    sourceRows,
  ] =
    await connection.query<
      SourceEquipmentRow[]
    >(
      `
        SELECT
          source_equipment_name,

          COUNT(*) AS occurrences,

          SUM(
            COALESCE(
              downtime_minutes,
              0
            )
          ) AS downtime_minutes

        FROM
          maintenance_events

        WHERE
          unit_id = ?

          AND source_equipment_name
              IS NOT NULL

          AND TRIM(
            source_equipment_name
          ) <> ''

        GROUP BY
          source_equipment_name

        ORDER BY
          source_equipment_name
      `,
      [
        unitId,
      ],
    );

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
        unitId,
      ],
    );

  const existingByName =
    new Map<
      string,
      EquipmentRecord[]
    >();

  for (
    const row
    of existingRows
  ) {
    const normalized =
      normalizeEquipmentName(
        row.name,
      );

    if (
      !normalized
    ) {
      continue;
    }

    const current =
      existingByName.get(
        normalized,
      ) ??
      [];

    current.push({
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
    });

    existingByName.set(
      normalized,
      current,
    );
  }

  const equipmentIdByName =
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

  let totalEvents =
    0;

  let matchedEvents =
    0;

  let matchedNames =
    0;

  let notFoundNames =
    0;

  let conflictingNames =
    0;

  for (
    const source
    of sourceRows
  ) {
    const sourceName =
      nullableString(
        source
          .source_equipment_name,
      );

    if (
      !sourceName
    ) {
      continue;
    }

    const normalizedName =
      normalizeEquipmentName(
        sourceName,
      );

    if (
      !normalizedName
    ) {
      continue;
    }

    const occurrences =
      numericValue(
        source.occurrences,
      );

    totalEvents +=
      occurrences;

    const resolution =
      context
        .nameResolution
        .get(
          normalizedName,
        );

    const criticality =
      resolution
        ?.criticality ??
      null;

    if (
      criticality
    ) {
      matchedEvents +=
        occurrences;

      matchedNames +=
        1;
    } else if (
      resolution
        ?.conflict
    ) {
      conflictingNames +=
        1;
    } else {
      notFoundNames +=
        1;
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
            candidate,
          ) =>
            candidate.code
              .toUpperCase()
              .startsWith(
                "SRC-",
              ),
        ) ??
        candidates[0] ??
        null;

    if (
      !selected
    ) {
      const code =
        equipmentCode(
          unitId,
          normalizedName,
        );

      const [
        result,
      ] =
        await connection.execute<
          ResultSetHeader
        >(
          `
            INSERT INTO
              equipments
            (
              unit_id,
              production_line_id,
              code,
              name,
              description,
              criticality,
              criticality_justification,
              criticality_updated_by,
              criticality_updated_at,
              active
            )

            VALUES
            (
              ?,
              NULL,
              ?,
              ?,
              ?,
              ?,
              ?,
              NULL,
              NOW(),
              TRUE
            )
          `,
          [
            unitId,
            code,
            sourceName,
            "Equipamento identificado automaticamente a partir dos apontamentos.",
            criticality,
            criticality
              ? "Sincronizado automaticamente da aba Criticidade ABC."
              : null,
          ],
        );

      selected = {
        id:
          Number(
            result.insertId,
          ),

        code,

        name:
          sourceName,

        criticality,
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
      await connection.execute<
        ResultSetHeader
      >(
        `
          UPDATE
            equipments

          SET
            name = ?,

            criticality = ?,

            criticality_justification = ?,

            criticality_updated_by =
              NULL,

            criticality_updated_at =
              NOW(),

            active =
              TRUE

          WHERE
            id = ?

            AND unit_id = ?
        `,
        [
          sourceName,

          criticality,

          criticality
            ? "Sincronizado automaticamente da aba Criticidade ABC."
            : null,

          selected.id,

          unitId,
        ],
      );

      selected = {
        ...selected,

        name:
          sourceName,

        criticality,
      };
    }

    equipmentIdByName.set(
      normalizedName,
      selected.id,
    );

    aliases.push({
      equipmentId:
        selected.id,

      alias:
        sourceName,

      normalizedAlias:
        normalizedName,
    });
  }

  /* ========================================================
     ALIASES
  ======================================================== */

  if (
    aliases.length >
    0
  ) {
    const uniqueAliases =
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
      const alias
      of aliases
    ) {
      uniqueAliases.set(
        `${alias.equipmentId}|${alias.normalizedAlias}`,
        alias,
      );
    }

    for (
      const batch
      of splitIntoBatches(
        Array.from(
          uniqueAliases.values(),
        ),
        MATRIX_BATCH_SIZE,
      )
    ) {
      const values:
        Array<
          string |
          number |
          boolean
        > =
          [];

      const placeholders =
        batch.map(
          (
            item,
          ) => {
            values.push(
              item.equipmentId,
              item.alias,
              item.normalizedAlias,
              SOURCE_SYSTEM,
              true,
            );

            return (
              "(?, ?, ?, ?, ?)"
            );
          },
        ).join(
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

  /* ========================================================
     RELACIONAR EVENTOS EXISTENTES
  ======================================================== */

  const [
    eventRows,
  ] =
    await connection.query<
      ExistingEventRow[]
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

          AND TRIM(
            source_equipment_name
          ) <> ''
      `,
      [
        unitId,
      ],
    );

  const eventIdsByEquipment =
    new Map<
      number,
      number[]
    >();

  for (
    const event
    of eventRows
  ) {
    const normalized =
      normalizeEquipmentName(
        event
          .source_equipment_name,
      );

    if (
      !normalized
    ) {
      continue;
    }

    const equipmentId =
      equipmentIdByName.get(
        normalized,
      );

    if (
      !equipmentId
    ) {
      continue;
    }

    const current =
      eventIdsByEquipment.get(
        equipmentId,
      ) ??
      [];

    current.push(
      Number(
        event.id,
      ),
    );

    eventIdsByEquipment.set(
      equipmentId,
      current,
    );
  }

  let linkedEvents =
    0;

  for (
    const [
      equipmentId,
      eventIds,
    ]
    of eventIdsByEquipment
  ) {
    for (
      const batch
      of splitIntoBatches(
        eventIds,
        EVENT_BATCH_SIZE,
      )
    ) {
      const placeholders =
        batch.map(
          () => "?",
        ).join(
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
            unitId,
            ...batch,
          ],
        );

      linkedEvents +=
        result.affectedRows;
    }
  }

  return {
    totalEvents,
    matchedEvents,
    matchedNames,
    notFoundNames,
    conflictingNames,
    linkedEvents,
  };
}


/* ============================================================
   GET - DASHBOARD DE CRITICIDADE
============================================================ */

export async function GET() {
  const session =
    await getSession();

  if (
    !session
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Sessão inválida.",
      },
      {
        status:
          401,
      },
    );
  }

  const connection =
    await getConnection();

  try {
    /* getSession() já relê o papel no banco e converte o
       ADMIN legado em Analista. */
    const role =
      session.role;

    const unit =
      await getUnit(
        connection,
        Number(
          session.unitId,
        ),
      );

    const [
      matrixRows,
    ] =
      await connection.query<
        MatrixSummaryRow[]
      >(
        `
          SELECT
            COUNT(*) AS total,

            SUM(
              criticality = 'A'
            ) AS class_a,

            SUM(
              criticality = 'B'
            ) AS class_b,

            SUM(
              criticality = 'C'
            ) AS class_c,

            MAX(
              updated_at
            ) AS last_sync,

            MAX(
              plant_name
            ) AS plant_name

          FROM
            equipment_criticality_matrix

          WHERE
            unit_id = ?

            AND active = TRUE
        `,
        [
          session.unitId,
        ],
      );

    const matrix =
      matrixRows[0];

    const [
      coverageRows,
    ] =
      await connection.query<
        CoverageRow[]
      >(
        `
          SELECT
            COUNT(
              me.id
            ) AS total_events,

            SUM(
              me.equipment_id
                IS NOT NULL
            ) AS linked_events,

            SUM(
              eq.criticality
                IN (
                  'A',
                  'B',
                  'C'
                )
            ) AS events_with_criticality

          FROM
            maintenance_events me

          LEFT JOIN
            equipments eq
              ON eq.id =
                 me.equipment_id

          WHERE
            me.unit_id = ?
        `,
        [
          session.unitId,
        ],
      );

    const coverage =
      coverageRows[0];

    const [
      exposureRows,
    ] =
      await connection.query<
        ExposureRow[]
      >(
        `
          SELECT
            eq.criticality,

            COUNT(
              me.id
            ) AS occurrences,

            COUNT(
              DISTINCT
              me.equipment_id
            ) AS affected_equipments,

            SUM(
              COALESCE(
                me.downtime_minutes,
                0
              )
            ) AS downtime_minutes

          FROM
            maintenance_events me

          INNER JOIN
            equipments eq
              ON eq.id =
                 me.equipment_id

          WHERE
            me.unit_id = ?

            AND eq.criticality
                IN (
                  'A',
                  'B',
                  'C'
                )

          GROUP BY
            eq.criticality
        `,
        [
          session.unitId,
        ],
      );

    const exposure = {
      A: {
        occurrences:
          0,

        affectedEquipments:
          0,

        downtimeMinutes:
          0,
      },

      B: {
        occurrences:
          0,

        affectedEquipments:
          0,

        downtimeMinutes:
          0,
      },

      C: {
        occurrences:
          0,

        affectedEquipments:
          0,

        downtimeMinutes:
          0,
      },
    };

    for (
      const row
      of exposureRows
    ) {
      exposure[
        row.criticality
      ] = {
        occurrences:
          numericValue(
            row.occurrences,
          ),

        affectedEquipments:
          numericValue(
            row
              .affected_equipments,
          ),

        downtimeMinutes:
          numericValue(
            row
              .downtime_minutes,
          ),
      };
    }

    const [
      topCriticalRows,
    ] =
      await connection.query<
        TopCriticalRow[]
      >(
        `
          SELECT
            eq.id
              AS equipment_id,

            eq.name
              AS equipment,

            eq.code,

            COUNT(
              me.id
            ) AS occurrences,

            SUM(
              COALESCE(
                me.downtime_minutes,
                0
              )
            ) AS downtime_minutes,

            SUM(
              COALESCE(
                me.downtime_minutes,
                0
              )
            ) /
            NULLIF(
              COUNT(
                me.id
              ),
              0
            ) AS mttr

          FROM
            equipments eq

          INNER JOIN
            maintenance_events me
              ON me.equipment_id =
                 eq.id

          WHERE
            eq.unit_id = ?

            AND eq.active = TRUE

            AND eq.criticality =
                'A'

          GROUP BY
            eq.id,
            eq.name,
            eq.code

          ORDER BY
            downtime_minutes DESC,
            occurrences DESC,
            eq.name ASC

          LIMIT 20
        `,
        [
          session.unitId,
        ],
      );

    const totalEvents =
      numericValue(
        coverage
          ?.total_events,
      );

    const linkedEvents =
      numericValue(
        coverage
          ?.linked_events,
      );

    const eventsWithCriticality =
      numericValue(
        coverage
          ?.events_with_criticality,
      );

    return NextResponse.json({
      success:
        true,

      permissions: {
        role,

        canSync:
          isAnalystRole(
            role,
          ),
      },

      unit: {
        id:
          Number(
            unit.id,
          ),

        code:
          unit.code ??
          null,

        name:
          unit.name ??
          null,

        city:
          unit.city ??
          null,
      },

      matrix: {
        plantName:
          matrix
            ?.plant_name ??
          null,

        total:
          numericValue(
            matrix
              ?.total,
          ),

        A:
          numericValue(
            matrix
              ?.class_a,
          ),

        B:
          numericValue(
            matrix
              ?.class_b,
          ),

        C:
          numericValue(
            matrix
              ?.class_c,
          ),

        lastSync:
          formatDatabaseDateTime(
            matrix
              ?.last_sync ??
            null,
          ),
      },

      coverage: {
        totalEvents,

        linkedEvents,

        eventsWithCriticality,

        linkedPercentage:
          totalEvents >
          0
            ? (
                linkedEvents /
                totalEvents
              ) *
              100
            : 0,

        criticalityPercentage:
          totalEvents >
          0
            ? (
                eventsWithCriticality /
                totalEvents
              ) *
              100
            : 0,
      },

      exposure,

      topCritical:
        topCriticalRows.map(
          (
            row,
          ) => ({
            equipmentId:
              Number(
                row
                  .equipment_id,
              ),

            equipment:
              row.equipment,

            code:
              row.code,

            occurrences:
              numericValue(
                row.occurrences,
              ),

            downtimeMinutes:
              numericValue(
                row
                  .downtime_minutes,
              ),

            mttr:
              numericValue(
                row.mttr,
              ),
          }),
        ),
    });
  } catch (
    error
  ) {
    console.error(
      "Erro ao carregar análise de criticidade:",
      error,
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          publicErrorMessage(
            error,
            "Não foi possível carregar a análise de criticidade.",
          ),
      },
      {
        status:
          500,
      },
    );
  } finally {
    connection.release();
  }
}


/* ============================================================
   POST - SINCRONIZAR MATRIZ
============================================================ */

export async function POST(
  request:
    NextRequest,
) {
const session = await getSession();
  const accessError = getWriteAccessError(session);
  if (accessError) return accessError;

  if (
    !session
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Sessão inválida.",
      },
      {
        status:
          401,
      },
    );
  }

  let formData:
    FormData;

  try {
    formData =
      await request
        .formData();
  } catch {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "Não foi possível ler o arquivo.",
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
        success:
          false,

        message:
          "Selecione a planilha da matriz.",
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
        success:
          false,

        message:
          "O arquivo deve ser XLSX, XLSM ou XLS.",
      },
      {
        status:
          400,
      },
    );
  }

  if (
    file.size >
    MAX_IMPORT_BYTES
  ) {
    return NextResponse.json(
      {
        success:
          false,

        message:
          "O arquivo excede o limite de 50 MB.",
      },
      {
        status:
          413,
      },
    );
  }

  const connection =
    await getConnection();

  let transactionStarted =
    false;

  try {
    /* getSession() já relê o papel no banco e converte o
       ADMIN legado em Analista. */
    const role =
      session.role;

    if (
      !isAnalystRole(
        role,
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Seu perfil possui acesso somente para visualização.",
        },
        {
          status:
            403,
        },
      );
    }

    const arrayBuffer =
      await file
        .arrayBuffer();

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
          success:
            false,

          message:
            "A planilha está vazia.",
        },
        {
          status:
            400,
        },
      );
    }

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
    } catch {
      return NextResponse.json(
        {
          success:
            false,

          message:
            "Não foi possível abrir a planilha.",
        },
        {
          status:
            400,
        },
      );
    }

    const unit =
      await getUnit(
        connection,
        Number(
          session.unitId,
        ),
      );

    const context =
      buildMatrixContext(
        workbook,
        unit,
      );

    await connection
      .beginTransaction();

    transactionStarted =
      true;

    await synchronizeMatrixTable(
      connection,
      Number(
        session.unitId,
      ),
      context,
    );

    const equipmentSync =
      await synchronizeOperationalEquipments(
        connection,
        Number(
          session.unitId,
        ),
        context,
      );

    await connection
      .commit();

    transactionStarted =
      false;

    const matchedPercentage =
      equipmentSync
        .totalEvents >
      0
        ? (
            equipmentSync
              .matchedEvents /
            equipmentSync
              .totalEvents
          ) *
          100
        : 0;

    return NextResponse.json({
      success:
        true,

      message:
        "Matriz de criticidade sincronizada com sucesso.",

      sync: {
        fileName:
          file.name,

        centerSheet:
          context
            .centerSheetName,

        matrixSheet:
          context
            .matrixSheetName,

        plantName:
          context
            .plantName,

        matrixAssets:
          context
            .assets
            .length,

        matrixByCriticality:
          context
            .matrixByCriticality,

        totalEvents:
          equipmentSync
            .totalEvents,

        matchedEvents:
          equipmentSync
            .matchedEvents,

        matchedPercentage,

        matchedEquipmentNames:
          equipmentSync
            .matchedNames,

        notFoundEquipmentNames:
          equipmentSync
            .notFoundNames,

        conflictingEquipmentNames:
          equipmentSync
            .conflictingNames,

        linkedEvents:
          equipmentSync
            .linkedEvents,
      },
    });
  } catch (
    error
  ) {
    if (
      transactionStarted
    ) {
      try {
        await connection
          .rollback();
      } catch (
        rollbackError
      ) {
        console.error(
          "Erro no rollback da sincronização:",
          rollbackError,
        );
      }
    }

    console.error(
      "Erro ao sincronizar matriz de criticidade:",
      error,
    );

    return NextResponse.json(
      {
        success:
          false,

        message:
          publicErrorMessage(
            error,
            "Não foi possível sincronizar a matriz.",
          ),
      },
      {
        status:
          500,
      },
    );
  } finally {
    connection.release();
  }
}
