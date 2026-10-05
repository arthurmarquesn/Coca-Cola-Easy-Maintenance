// FILE: src/components/reliability/reliability-filters-provider.tsx

"use client";

import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/* =========================================================
   TIPOS
========================================================= */

interface ReliabilityFiltersState {
  startDate: string;
  endDate: string;
  line: string;
  equipment: string;
}

interface ReliabilityFiltersContextValue
  extends ReliabilityFiltersState {
  setStartDate: (
    value: string,
  ) => void;

  setEndDate: (
    value: string,
  ) => void;

  setLine: (
    value: string,
  ) => void;

  setEquipment: (
    value: string,
  ) => void;

  resetFilters:
    () => void;

  clearAssetFilters:
    () => void;
}

/* =========================================================
   CONSTANTES
========================================================= */

const QUERY_KEYS = {
  startDate: "start",
  endDate: "end",
  line: "line",
  equipment: "equipment",
} as const;

/* =========================================================
   HELPERS DE DATA
========================================================= */

function dateToInput(
  date: Date,
): string {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() +
        1,
    ).padStart(
      2,
      "0",
    );

  const day =
    String(
      date.getDate(),
    ).padStart(
      2,
      "0",
    );

  return `${year}-${month}-${day}`;
}

function defaultDateRange() {
  const end =
    new Date();

  const start =
    new Date();

  start.setDate(
    start.getDate() -
      29,
  );

  return {
    start:
      dateToInput(
        start,
      ),

    end:
      dateToInput(
        end,
      ),
  };
}

/* =========================================================
   VALIDAÇÃO DOS PARÂMETROS
========================================================= */

function isValidDateInput(
  value: string | null,
): value is string {
  if (!value) {
    return false;
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return false;
  }

  const [
    yearText,
    monthText,
    dayText,
  ] =
    value.split("-");

  const year =
    Number(
      yearText,
    );

  const month =
    Number(
      monthText,
    );

  const day =
    Number(
      dayText,
    );

  if (
    !Number.isInteger(
      year,
    ) ||
    !Number.isInteger(
      month,
    ) ||
    !Number.isInteger(
      day,
    )
  ) {
    return false;
  }

  const date =
    new Date(
      year,
      month - 1,
      day,
    );

  return (
    date.getFullYear() ===
      year &&
    date.getMonth() ===
      month - 1 &&
    date.getDate() ===
      day
  );
}

function normalizeTextFilter(
  value: string | null,
): string {
  if (!value) {
    return "";
  }

  return value
    .trim()
    .slice(
      0,
      180,
    );
}

/* =========================================================
   LEITURA INICIAL DA URL
========================================================= */

function getInitialFilters(
  searchParams: URLSearchParams,
): ReliabilityFiltersState {
  const defaultRange =
    defaultDateRange();

  const startParam =
    searchParams.get(
      QUERY_KEYS.startDate,
    );

  const endParam =
    searchParams.get(
      QUERY_KEYS.endDate,
    );

  const lineParam =
    searchParams.get(
      QUERY_KEYS.line,
    );

  const equipmentParam =
    searchParams.get(
      QUERY_KEYS.equipment,
    );

  return {
    startDate:
      isValidDateInput(
        startParam,
      )
        ? startParam
        : defaultRange.start,

    endDate:
      isValidDateInput(
        endParam,
      )
        ? endParam
        : defaultRange.end,

    line:
      normalizeTextFilter(
        lineParam,
      ),

    equipment:
      normalizeTextFilter(
        equipmentParam,
      ),
  };
}

/* =========================================================
   CONTEXT
========================================================= */

const ReliabilityFiltersContext =
  createContext<
    ReliabilityFiltersContextValue |
    null
  >(null);

/* =========================================================
   PROVIDER
========================================================= */

export function ReliabilityFiltersProvider({
  children,
}: {
  children:
    ReactNode;
}) {
  const router =
    useRouter();

  const pathname =
    usePathname();

  const searchParams =
    useSearchParams();

  /* =======================================================
     ESTADO INICIAL

     A URL é consultada somente na criação do estado.

     Isso permite:
     - F5;
     - link compartilhado;
     - abertura em nova aba;
     - acesso direto com query string.
  ======================================================= */

  const [
    filters,
    setFilters,
  ] =
    useState<
      ReliabilityFiltersState
    >(
      () =>
        getInitialFilters(
          new URLSearchParams(
            searchParams.toString(),
          ),
        ),
    );

  const {
    startDate,
    endDate,
    line,
    equipment,
  } =
    filters;

  /* =======================================================
     SETTERS DE PERÍODO
  ======================================================= */

  const setStartDate =
    useCallback(
      (
        value: string,
      ) => {
        setFilters(
          (
            current,
          ) => ({
            ...current,

            startDate:
              value,
          }),
        );
      },
      [],
    );

  const setEndDate =
    useCallback(
      (
        value: string,
      ) => {
        setFilters(
          (
            current,
          ) => ({
            ...current,

            endDate:
              value,
          }),
        );
      },
      [],
    );

  /* =======================================================
     SETTERS DE ATIVOS
  ======================================================= */

  const setLine =
    useCallback(
      (
        value: string,
      ) => {
        setFilters(
          (
            current,
          ) => ({
            ...current,

            line:
              value,

            /*
             * Equipamento pertence ao
             * recorte da linha.
             *
             * Quando a linha muda,
             * eliminamos o equipamento
             * anterior para impedir uma
             * combinação inválida.
             */
            equipment:
              "",
          }),
        );
      },
      [],
    );

  const setEquipment =
    useCallback(
      (
        value: string,
      ) => {
        setFilters(
          (
            current,
          ) => ({
            ...current,

            equipment:
              value,
          }),
        );
      },
      [],
    );

  /* =======================================================
     RESET
  ======================================================= */

  const resetFilters =
    useCallback(
      () => {
        const range =
          defaultDateRange();

        setFilters({
          startDate:
            range.start,

          endDate:
            range.end,

          line:
            "",

          equipment:
            "",
        });
      },
      [],
    );

  /* =======================================================
     LIMPEZA DE LINHA / EQUIPAMENTO

     Usado quando a seleção global de unidades muda.

     Período permanece.
     Linha/equipamento são eliminados porque podem não
     existir nas novas unidades selecionadas.
  ======================================================= */

  const clearAssetFilters =
    useCallback(
      () => {
        setFilters(
          (
            current,
          ) => ({
            ...current,

            line:
              "",

            equipment:
              "",
          }),
        );
      },
      [],
    );

  /* =======================================================
     SINCRONIZAÇÃO COM A URL

     O estado do Provider é refletido na query string.

     Não removemos parâmetros desconhecidos da URL.
     Alteramos somente:
     - start
     - end
     - line
     - equipment

     router.replace é usado para não criar uma nova entrada
     de histórico do navegador a cada mudança de filtro.
  ======================================================= */

  useEffect(
    () => {
      const params =
        new URLSearchParams(
          searchParams.toString(),
        );

      params.set(
        QUERY_KEYS.startDate,
        startDate,
      );

      params.set(
        QUERY_KEYS.endDate,
        endDate,
      );

      if (line) {
        params.set(
          QUERY_KEYS.line,
          line,
        );
      } else {
        params.delete(
          QUERY_KEYS.line,
        );
      }

      if (
        equipment
      ) {
        params.set(
          QUERY_KEYS.equipment,
          equipment,
        );
      } else {
        params.delete(
          QUERY_KEYS.equipment,
        );
      }

      const currentQuery =
        searchParams.toString();

      const nextQuery =
        params.toString();

      /*
       * Evita replace desnecessário
       * e possíveis ciclos de renderização.
       */
      if (
        currentQuery ===
        nextQuery
      ) {
        return;
      }

      const nextUrl =
        nextQuery
          ? `${pathname}?${nextQuery}`
          : pathname;

      router.replace(
        nextUrl,
        {
          scroll:
            false,
        },
      );
    },
    [
      pathname,
      router,
      searchParams,
      startDate,
      endDate,
      line,
      equipment,
    ],
  );

  /* =======================================================
     VALUE
  ======================================================= */

  const value =
    useMemo<
      ReliabilityFiltersContextValue
    >(
      () => ({
        startDate,
        endDate,
        line,
        equipment,

        setStartDate,
        setEndDate,

        setLine,
        setEquipment,

        resetFilters,
        clearAssetFilters,
      }),
      [
        startDate,
        endDate,
        line,
        equipment,
        setStartDate,
        setEndDate,
        setLine,
        setEquipment,
        resetFilters,
        clearAssetFilters,
      ],
    );

  return (
    <ReliabilityFiltersContext.Provider
      value={value}
    >
      {children}
    </ReliabilityFiltersContext.Provider>
  );
}

/* =========================================================
   HOOK
========================================================= */

export function useReliabilityFilters():
  ReliabilityFiltersContextValue {
  const context =
    useContext(
      ReliabilityFiltersContext,
    );

  if (!context) {
    throw new Error(
      "useReliabilityFilters precisa ser usado dentro de ReliabilityFiltersProvider.",
    );
  }

  return context;
}