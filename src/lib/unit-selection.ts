import {
  cookies,
} from "next/headers";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  executeRows,
} from "@/lib/db";


export const UNIT_SELECTION_COOKIE_NAME =
  "coca_unit_selection";


/* =========================================================
   TYPES
========================================================= */

interface UnitRow
  extends RowDataPacket {
  id: number;

  code:
    | string
    | null;

  name: string;

  city:
    | string
    | null;

  state:
    | string
    | null;

  is_default:
    | number
    | boolean
    | null;
}


export interface AuthorizedUnit {
  id: number;

  code:
    | string
    | null;

  name: string;

  city:
    | string
    | null;

  state:
    | string
    | null;

  isDefault: boolean;
}


export interface UnitSelection {
  units:
    AuthorizedUnit[];

  selectedUnitIds:
    number[];
}


/* =========================================================
   SERIALIZE
========================================================= */

export function serializeUnitSelection(
  unitIds:
    number[],
): string {
  return [
    ...new Set(
      unitIds.filter(
        (
          unitId,
        ) =>
          Number.isInteger(
            unitId,
          ) &&
          unitId > 0,
      ),
    ),
  ]
    .sort(
      (
        a,
        b,
      ) =>
        a - b,
    )
    .join(
      ",",
    );
}


/* =========================================================
   PARSE
========================================================= */

export function parseUnitSelection(
  value:
    | string
    | null
    | undefined,
): number[] {
  if (
    !value
  ) {
    return [];
  }


  return [
    ...new Set(
      value
        .split(
          ",",
        )
        .map(
          (
            item,
          ) =>
            Number(
              item.trim(),
            ),
        )
        .filter(
          (
            unitId,
          ) =>
            Number.isInteger(
              unitId,
            ) &&
            unitId > 0,
        ),
    ),
  ];
}


/* =========================================================
   AUTHORIZED UNITS

   Regra atual:

   - cada usuário só consulta e altera dados das
     unidades ativas em que está cadastrado
     (user_units);

   - is_default identifica a unidade representada
     pelo usuário.
========================================================= */

export async function getAuthorizedUnits(
  userId:
    number,
): Promise<
  AuthorizedUnit[]
> {
  const rows =
    await executeRows<
      UnitRow[]
    >(
      `
        SELECT
            un.id,

            un.code,

            un.name,

            un.city,

            un.state,

            uu.is_default

        FROM
            units un

        INNER JOIN
            user_units uu
            ON uu.unit_id =
               un.id

            AND uu.user_id =
                ?

        WHERE
            un.active =
                TRUE

        ORDER BY
            uu.is_default DESC,

            COALESCE(
              un.city,
              un.name
            ) ASC,

            un.name ASC,

            un.id ASC
      `,
      [
        userId,
      ],
    );


  return rows.map(
    (
      row,
    ) => ({
      id:
        Number(
          row.id,
        ),

      code:
        row.code,

      name:
        row.name,

      city:
        row.city,

      state:
        row.state,

      isDefault:
        Boolean(
          row.is_default,
        ),
    }),
  );
}


/* =========================================================
   VALIDATE
========================================================= */

export function validateSelectedUnitIds(
  requestedUnitIds:
    number[],

  units:
    AuthorizedUnit[],
): number[] {
  const availableIds =
    new Set(
      units.map(
        (
          unit,
        ) =>
          unit.id,
      ),
    );


  return [
    ...new Set(
      requestedUnitIds.filter(
        (
          unitId,
        ) =>
          availableIds.has(
            unitId,
          ),
      ),
    ),
  ];
}


/* =========================================================
   CURRENT SELECTION
========================================================= */

export async function getUnitSelection(
  params: {
    userId:
      number;

    defaultUnitId:
      number;
  },
): Promise<
  UnitSelection
> {
  const units =
    await getAuthorizedUnits(
      params.userId,
    );


  if (
    units.length ===
    0
  ) {
    return {
      units:
        [],

      selectedUnitIds:
        [],
    };
  }


  const cookieStore =
    await cookies();


  const cookieValue =
    cookieStore.get(
      UNIT_SELECTION_COOKIE_NAME,
    )?.value;


  const requestedUnitIds =
    parseUnitSelection(
      cookieValue,
    );


  const validatedUnitIds =
    validateSelectedUnitIds(
      requestedUnitIds,
      units,
    );


  /* =======================================================
     COOKIE VÁLIDO
  ======================================================= */

  if (
    validatedUnitIds.length >
    0
  ) {
    return {
      units,

      selectedUnitIds:
        validatedUnitIds,
    };
  }


  /* =======================================================
     FALLBACK:
     unidade representada pela sessão
  ======================================================= */

  const sessionUnitExists =
    units.some(
      (
        unit,
      ) =>
        unit.id ===
        params.defaultUnitId,
    );


  if (
    sessionUnitExists
  ) {
    return {
      units,

      selectedUnitIds: [
        params.defaultUnitId,
      ],
    };
  }


  /* =======================================================
     FALLBACK:
     user_units.is_default
  ======================================================= */

  const defaultUnit =
    units.find(
      (
        unit,
      ) =>
        unit.isDefault,
    );


  if (
    defaultUnit
  ) {
    return {
      units,

      selectedUnitIds: [
        defaultUnit.id,
      ],
    };
  }


  /* =======================================================
     FALLBACK FINAL
  ======================================================= */

  return {
    units,

    selectedUnitIds: [
      units[0].id,
    ],
  };
}


/* =========================================================
   SQL IN
========================================================= */

export function buildUnitInClause(
  unitIds:
    number[],
): {
  placeholders:
    string;

  values:
    number[];
} {
  const values =
    [
      ...new Set(
        unitIds.filter(
          (
            unitId,
          ) =>
            Number.isInteger(
              unitId,
            ) &&
            unitId > 0,
        ),
      ),
    ];


  if (
    values.length ===
    0
  ) {
    throw new Error(
      "Nenhuma unidade válida foi selecionada.",
    );
  }


  return {
    placeholders:
      values
        .map(
          () =>
            "?",
        )
        .join(
          ", ",
        ),

    values,
  };
}