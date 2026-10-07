"use client";

import { BrandLogo } from "@/components/layout/brand-logo";
import { useInitialRequest } from "@/lib/use-initial-request";


import Link from "next/link";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  Pencil,
  Search,
  X,
} from "lucide-react";

import type {
  FormEvent,
} from "react";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  UnitFilter,
} from "@/components/units/unit-filter";

import {
  ThemeSwitcher,
} from "@/components/theme/theme-switcher";


/* =========================================================
   PROPS
========================================================= */

interface HistoryPageProps {
  user: {
    name: string;
  };

  unit: {
    name: string;
  };

  /* Só o Analista corrige classificações; o Gestor consulta. */
  canWrite: boolean;
}


/* =========================================================
   UNIT
========================================================= */

interface HistoryUnit {
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
}


/* =========================================================
   CLASSIFICATION
========================================================= */

interface Classification {
  id: number;

  source:
    | string
    | null;

  confidence:
    | number
    | null;

  status:
    | string
    | null;

  classifiedBy:
    | string
    | null;

  category:
    | string
    | null;

  system:
    | string
    | null;

  failureMode:
    | string
    | null;

  explanation:
    | string
    | null;

  model:
    | string
    | null;
}


/* =========================================================
   EVENT
========================================================= */

interface HistoryItem {
  id: number;

  unit:
    HistoryUnit;

  eventDate:
    | string
    | null;

  shift:
    | string
    | null;

  line:
    | string
    | null;

  stopType:
    | string
    | null;

  materialCode:
    | string
    | null;

  materialDescription:
    | string
    | null;

  equipment:
    | string
    | null;

  stopSubkey:
    | string
    | null;

  stopKey1:
    | string
    | null;

  observation:
    | string
    | null;

  downtimeMinutes:
    | number
    | null;

  classification:
    | Classification
    | null;
}


/* =========================================================
   FILTERS
========================================================= */

interface HistoryFilters {
  selectedUnitIds:
    number[];

  selectedUnits:
    HistoryUnit[];
}


/* =========================================================
   PAGINATION
========================================================= */

interface Pagination {
  page: number;

  pageSize: number;

  total: number;

  totalPages: number;
}


/* =========================================================
   API RESPONSE
========================================================= */

interface HistoryResponse {
  success: boolean;

  message?: string;

  filters?:
    HistoryFilters;

  items?:
    HistoryItem[];

  pagination?:
    Pagination;
}


/* =========================================================
   CATEGORY OPTIONS
========================================================= */

const CATEGORY_OPTIONS = [
  {
    value:
      "MECANICA",

    label:
      "Mecânica",
  },
  {
    value:
      "ELETRICA",

    label:
      "Elétrica",
  },
  {
    value:
      "AUTOMACAO_INSTRUMENTACAO",

    label:
      "Automação e Instrumentação",
  },
  {
    value:
      "PNEUMATICA",

    label:
      "Pneumática",
  },
  {
    value:
      "HIDRAULICA",

    label:
      "Hidráulica",
  },
  {
    value:
      "PROCESSO",

    label:
      "Processo",
  },
  {
    value:
      "OPERACIONAL",

    label:
      "Operacional",
  },
  {
    value:
      "QUALIDADE",

    label:
      "Qualidade",
  },
  {
    value:
      "OUTROS",

    label:
      "Outros",
  },
];


/* =========================================================
   HELPERS
========================================================= */

function formatDate(
  value:
    | string
    | null,
) {
  if (
    !value
  ) {
    return "—";
  }


  const [
    year,
    month,
    day,
  ] =
    value.split(
      "-",
    );


  if (
    !year ||
    !month ||
    !day
  ) {
    return value;
  }


  return `${day}/${month}/${year}`;
}


function formatMinutes(
  value:
    | number
    | null,
) {
  if (
    value ===
    null
  ) {
    return "—";
  }


  return new Intl.NumberFormat(
    "pt-BR",
    {
      maximumFractionDigits:
        2,
    },
  ).format(
    value,
  );
}


function formatCategory(
  value:
    | string
    | null,
) {
  const option =
    CATEGORY_OPTIONS.find(
      (
        item,
      ) =>
        item.value ===
        value,
    );


  return (
    option?.label ??
    value ??
    "Não classificado"
  );
}


function getClassificationTitle(
  classification:
    | Classification
    | null,
) {
  if (
    !classification
  ) {
    return "Não classificado";
  }


  return (
    classification
      .failureMode ??
    classification
      .system ??
    formatCategory(
      classification
        .category,
    )
  );
}


function getUnitLabel(
  unit:
    HistoryUnit,
): string {
  return (
    unit.name?.trim() ||
    unit.code?.trim() ||
    `Unidade ${unit.id}`
  );
}


/* =========================================================
   COMPONENT
========================================================= */

export function HistoryPage({
  user,
  unit,
  canWrite,
}: HistoryPageProps) {
  const [
    items,
    setItems,
  ] =
    useState<
      HistoryItem[]
    >(
      [],
    );


  const [
    filters,
    setFilters,
  ] =
    useState<
      HistoryFilters | null
    >(
      null,
    );


  const [
    pagination,
    setPagination,
  ] =
    useState<
      Pagination
    >({
      page:
        1,

      pageSize:
        20,

      total:
        0,

      totalPages:
        1,
    });


  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );


  const [
    error,
    setError,
  ] =
    useState(
      "",
    );


  const [
    exporting,
    setExporting,
  ] =
    useState(
      false,
    );


  const [
    exportError,
    setExportError,
  ] =
    useState(
      "",
    );


  const [
    searchInput,
    setSearchInput,
  ] =
    useState(
      "",
    );


  const [
    search,
    setSearch,
  ] =
    useState(
      "",
    );


  const [
    selected,
    setSelected,
  ] =
    useState<
      HistoryItem | null
    >(
      null,
    );


  const [
    editing,
    setEditing,
  ] =
    useState(
      false,
    );


  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );


  const [
    editCategory,
    setEditCategory,
  ] =
    useState(
      "",
    );


  const [
    editSystem,
    setEditSystem,
  ] =
    useState(
      "",
    );


  const [
    editFailureMode,
    setEditFailureMode,
  ] =
    useState(
      "",
    );


  const [
    editExplanation,
    setEditExplanation,
  ] =
    useState(
      "",
    );


  const [
    editError,
    setEditError,
  ] =
    useState(
      "",
    );


  /* =======================================================
     COMPUTED
  ======================================================= */

  const multipleUnits =
    (
      filters
        ?.selectedUnitIds
        .length ??
      0
    ) >
    1;


  const selectedUnitsLabel =
    useMemo(
      () => {
        const selectedUnits =
          filters
            ?.selectedUnits ??
          [];


        if (
          selectedUnits.length ===
          0
        ) {
          return (
            unit.name ??
            "Unidade atual"
          );
        }


        if (
          selectedUnits.length ===
          1
        ) {
          return getUnitLabel(
            selectedUnits[0],
          );
        }


        return `${selectedUnits.length} unidades selecionadas`;
      },
      [
        filters,
        unit.name,
      ],
    );


  const tableColumnCount =
    multipleUnits
      ? 7
      : 6;


  /* =======================================================
     LOAD HISTORY
  ======================================================= */

  const activeRequestRef =
    useRef<AbortController | null>(
      null,
    );


  const loadHistory =
    useCallback(
      async (
        page:
          number,

        searchTerm:
          string,
        externalSignal?: AbortSignal,
      ) => {
        /* Busca e paginação rápidas: só a última requisição
           pode atualizar a tela. */
        activeRequestRef.current?.abort();

        const controller =
          new AbortController();

        activeRequestRef.current =
          controller;

        externalSignal?.addEventListener(
          "abort",
          () =>
            controller.abort(),
        );

        const signal =
          controller.signal;

        setLoading(
          true,
        );


        setError(
          "",
        );


        try {
          const params =
            new URLSearchParams({
              page:
                String(
                  page,
                ),

              pageSize:
                "20",
            });


          if (
            searchTerm
          ) {
            params.set(
              "search",
              searchTerm,
            );
          }


          const response =
            await fetch(
              `/api/history?${params.toString()}`,
              {
                cache:
                  "no-store",
                signal,
              },
            );


          const data =
            (await response.json()) as
              HistoryResponse;


          if (signal?.aborted) return;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.message ??
              "Não foi possível carregar o histórico.",
            );
          }


          const nextItems =
            Array.isArray(
              data.items,
            )
              ? data.items
              : [];


          setItems(
            nextItems,
          );


          if (
            data.pagination
          ) {
            setPagination(
              data.pagination,
            );
          }


          if (
            data.filters
          ) {
            setFilters(
              data.filters,
            );
          }


          /*
           * Se um drawer já estiver aberto,
           * atualizamos o registro se ele ainda
           * fizer parte do novo resultado.
           */
          setSelected(
            (
              current,
            ) => {
              if (
                !current
              ) {
                return null;
              }


              return (
                nextItems.find(
                  (
                    item,
                  ) =>
                    item.id ===
                    current.id,
                ) ??
                null
              );
            },
          );
        } catch (
          loadError
        ) {
          if (signal?.aborted) return;
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Não foi possível carregar o histórico.",
          );
        } finally {
          if (!signal?.aborted) setLoading(
            false,
          );
        }
      },
      [],
    );


  /* =======================================================
     INITIAL LOAD
  ======================================================= */

  const initialRequest = useCallback(
    (signal: AbortSignal) => loadHistory (1, "", signal),
    [loadHistory],
  );
  useInitialRequest(initialRequest);


  /* =======================================================
     UNIT FILTER CHANGE
  ======================================================= */

  const handleUnitSelectionApplied =
    useCallback(
      async () => {
        setSelected(
          null,
        );


        setEditing(
          false,
        );


        setEditError(
          "",
        );


        setExportError(
          "",
        );


        await loadHistory(
          1,
          search,
        );
      },
      [
        loadHistory,
        search,
      ],
    );


  /* =======================================================
     SEARCH
  ======================================================= */

  function handleSearch(
    event:
      FormEvent,
  ) {
    event.preventDefault();


    const value =
      searchInput
        .trim();


    setSearch(
      value,
    );


    void loadHistory(
      1,
      value,
    );
  }


  /* =======================================================
     EXPORT
  ======================================================= */

  async function handleExport() {
    if (
      exporting ||
      pagination.total ===
        0
    ) {
      return;
    }


    setExporting(
      true,
    );


    setExportError(
      "",
    );


    try {
      const params =
        new URLSearchParams();


      if (
        search
      ) {
        params.set(
          "search",
          search,
        );
      }


      const url =
        params.size >
        0
          ? `/api/history/export?${params.toString()}`
          : "/api/history/export";


      const response =
        await fetch(
          url,
          {
            method:
              "GET",

            cache:
              "no-store",
          },
        );


      if (
        !response.ok
      ) {
        let message =
          "Não foi possível exportar o histórico.";


        try {
          const data =
            await response.json();


          message =
            data.message ??
            message;
        } catch {
          // resposta pode não ser JSON
        }


        throw new Error(
          message,
        );
      }


      const blob =
        await response.blob();


      const disposition =
        response.headers.get(
          "content-disposition",
        );


      const filenameMatch =
        disposition?.match(
          /filename="?([^";]+)"?/i,
        );


      const filename =
        filenameMatch?.[1] ??
        "historico-manutencao.xlsx";


      const objectUrl =
        URL.createObjectURL(
          blob,
        );


      const anchor =
        document.createElement(
          "a",
        );


      anchor.href =
        objectUrl;


      anchor.download =
        filename;


      document.body.appendChild(
        anchor,
      );


      anchor.click();


      anchor.remove();


      URL.revokeObjectURL(
        objectUrl,
      );
    } catch (
      exportFailure
    ) {
      setExportError(
        exportFailure instanceof
          Error
          ? exportFailure.message
          : "Não foi possível exportar o histórico.",
      );
    } finally {
      setExporting(
        false,
      );
    }
  }


  /* =======================================================
     EVENT
  ======================================================= */

  function openEvent(
    item:
      HistoryItem,
  ) {
    setSelected(
      item,
    );


    setEditing(
      false,
    );


    setEditError(
      "",
    );
  }


  function closeEvent() {
    setSelected(
      null,
    );


    setEditing(
      false,
    );


    setEditError(
      "",
    );
  }


  /* =======================================================
     EDIT
  ======================================================= */

  function startEditing() {
    if (
      !selected
    ) {
      return;
    }


    setEditCategory(
      selected
        .classification
        ?.category ??
      "",
    );


    setEditSystem(
      selected
        .classification
        ?.system ??
      "",
    );


    setEditFailureMode(
      selected
        .classification
        ?.failureMode ??
      "",
    );


    setEditExplanation(
      selected
        .classification
        ?.explanation ??
      "",
    );


    setEditError(
      "",
    );


    setEditing(
      true,
    );
  }


  /* =======================================================
     SAVE CLASSIFICATION
  ======================================================= */

  async function saveClassification() {
    if (
      !selected ||
      saving
    ) {
      return;
    }


    if (
      !editCategory ||
      !editSystem.trim() ||
      !editFailureMode.trim()
    ) {
      setEditError(
        "Preencha categoria, sistema e modo de falha.",
      );


      return;
    }


    setSaving(
      true,
    );


    setEditError(
      "",
    );


    try {
      const response =
        await fetch(
          "/api/history/classification",
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                eventId:
                  selected.id,

                category:
                  editCategory,

                system:
                  editSystem,

                failureMode:
                  editFailureMode,

                explanation:
                  editExplanation,
              }),
          },
        );


      const data =
        await response.json();


      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ??
          "Não foi possível salvar a classificação.",
        );
      }


      const updatedClassification:
        Classification = {
          id:
            selected
              .classification
              ?.id ??
            selected.id,

          source:
            "MANUAL",

          confidence:
            null,

          status:
            typeof data
                .classification
                ?.status ===
              "string"
              ? data
                  .classification
                  .status
              : "CORRIGIDA",

          classifiedBy:
            user.name,

          category:
            editCategory,

          system:
            editSystem
              .trim(),

          failureMode:
            typeof data
                .classification
                ?.failureMode ===
              "string"
              ? data
                  .classification
                  .failureMode
              : editFailureMode
                  .trim(),

          explanation:
            editExplanation
                .trim() ||
              null,

          model:
            selected
              .classification
              ?.model ??
            null,
        };


      const updatedItem:
        HistoryItem = {
          ...selected,

          classification:
            updatedClassification,
        };


      setSelected(
        updatedItem,
      );


      setItems(
        (
          current,
        ) =>
          current.map(
            (
              item,
            ) =>
              item.id ===
              selected.id
                ? updatedItem
                : item,
          ),
      );


      setEditing(
        false,
      );
    } catch (
      saveError
    ) {
      setEditError(
        saveError instanceof
          Error
          ? saveError.message
          : "Não foi possível salvar a classificação.",
      );
    } finally {
      setSaving(
        false,
      );
    }
  }


  /* =======================================================
     UI
  ======================================================= */

  return (
    <main className="min-h-screen bg-background-primary">

      {/* ===================================================
          HEADER
      ==================================================== */}

      <header className="border-b border-border-theme bg-surface">

        <div className="mx-auto flex min-h-[78px] w-full max-w-[1380px] items-center justify-between gap-6 px-6 py-2 sm:px-8 lg:px-12">

          <Link
            href="/dashboard"
          >
            <BrandLogo />
          </Link>


          <div className="flex items-center gap-3 sm:gap-5">

            <UnitFilter
              fallbackLabel={
                unit.name
              }
              onSelectionApplied={
                handleUnitSelectionApplied
              }
            />


            <div className="hidden h-8 w-px bg-border-theme sm:block" />


            <div className="hidden text-right sm:block">

              <p className="text-[13px] font-medium text-text-primary">
                {user.name}
              </p>


              <p className="mt-0.5 text-[10px] text-text-secondary">
                Histórico de manutenção
              </p>

            </div>

            <div className="hidden h-8 w-px bg-border-theme sm:block" />

            <ThemeSwitcher />

          </div>

        </div>

      </header>


      {/* ===================================================
          CONTENT
      ==================================================== */}

      <section className="mx-auto w-full max-w-[1380px] px-6 pb-20 pt-10 sm:px-8 lg:px-12">

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
        >

          <ArrowLeft
            size={15}
          />

          Voltar

        </Link>


        {/* =================================================
            TITLE / FILTER SUMMARY
        ================================================== */}

        <div className="mt-9 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">

          <div>

            <h1 className="text-[34px] font-semibold tracking-[-0.045em] text-text-primary sm:text-[40px]">
              Histórico de manutenção
            </h1>


            <p className="mt-3 text-[14px] text-text-secondary">
              Consulte os apontamentos registrados e suas classificações.
            </p>


            <div className="mt-4 inline-flex items-center rounded-full bg-surface-elevated px-3 py-1.5">

              <span className="text-[10px] font-medium text-text-secondary">
                {selectedUnitsLabel}
              </span>

            </div>

          </div>


          <div className="flex w-full flex-col gap-3 lg:max-w-[600px] lg:items-end">

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">

              <form
                onSubmit={
                  handleSearch
                }
                className="flex w-full items-center border-b border-border-theme pb-2 sm:max-w-[380px]"
              >

                <Search
                  size={17}
                  className="mr-3 shrink-0 text-text-secondary"
                />


                <input
                  value={
                    searchInput
                  }
                  onChange={(
                    event,
                  ) =>
                    setSearchInput(
                      event.target
                        .value,
                    )
                  }
                  placeholder="Buscar equipamento, linha, unidade ou ocorrência"
                  className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
                />

              </form>


              <button
                type="button"
                onClick={() =>
                  void handleExport()
                }
                disabled={
                  exporting ||
                  loading ||
                  pagination.total ===
                    0
                }
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-border-theme bg-surface px-4 text-[12px] font-medium text-text-primary transition-colors hover:border-border-theme hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              >

                {exporting ? (
                  <LoaderCircle
                    size={15}
                    className="animate-spin"
                  />
                ) : (
                  <Download
                    size={15}
                  />
                )}


                {exporting
                  ? "Exportando..."
                  : "Exportar Excel"}

              </button>

            </div>


            {exportError && (
              <p className="text-[11px] text-accent-primary">
                {exportError}
              </p>
            )}

          </div>

        </div>


        {/* =================================================
            TABLE
        ================================================== */}

        <div className="mt-10 overflow-x-auto border-y border-border-theme">

          <table
            className={[
              "w-full border-collapse",
              multipleUnits
                ? "min-w-[1140px]"
                : "min-w-[1000px]",
            ].join(
              " ",
            )}
          >

            <thead>

              <tr className="border-b border-border-theme text-left">

                <th className="py-4 pr-5 text-[11px] font-medium text-text-secondary">
                  Data
                </th>


                {multipleUnits && (
                  <th className="px-5 py-4 text-[11px] font-medium text-text-secondary">
                    Unidade
                  </th>
                )}


                <th className="px-5 py-4 text-[11px] font-medium text-text-secondary">
                  Linha
                </th>


                <th className="px-5 py-4 text-[11px] font-medium text-text-secondary">
                  Equipamento
                </th>


                <th className="px-5 py-4 text-[11px] font-medium text-text-secondary">
                  Ocorrência
                </th>


                <th className="px-5 py-4 text-[11px] font-medium text-text-secondary">
                  Classificação
                </th>


                <th className="py-4 pl-5 text-right text-[11px] font-medium text-text-secondary">
                  Min.
                </th>

              </tr>

            </thead>


            <tbody>

              {loading && (
                <tr>

                  <td
                    colSpan={
                      tableColumnCount
                    }
                    className="py-16 text-center"
                  >

                    <LoaderCircle
                      size={20}
                      className="mx-auto animate-spin text-accent-primary"
                    />

                  </td>

                </tr>
              )}


              {!loading &&
                error && (
                  <tr>

                    <td
                      colSpan={
                        tableColumnCount
                      }
                      className="py-16 text-center text-[13px] text-text-secondary"
                    >
                      {error}
                    </td>

                  </tr>
                )}


              {!loading &&
                !error &&
                items.length ===
                  0 && (
                  <tr>

                    <td
                      colSpan={
                        tableColumnCount
                      }
                      className="py-16 text-center text-[13px] text-text-secondary"
                    >
                      Nenhum apontamento encontrado.
                    </td>

                  </tr>
                )}


              {!loading &&
                !error &&
                items.map(
                  (
                    item,
                  ) => (
                    <tr
                      key={
                        item.id
                      }
                      onClick={() =>
                        openEvent(
                          item,
                        )
                      }
                      className="cursor-pointer border-b border-border-theme transition-colors last:border-b-0 hover:bg-surface-hover"
                    >

                      <td className="whitespace-nowrap py-5 pr-5 text-[12px] text-text-primary">
                        {formatDate(
                          item.eventDate,
                        )}
                      </td>


                      {multipleUnits && (
                        <td className="px-5 py-5">

                          <p className="max-w-[150px] truncate text-[12px] font-medium text-text-primary">
                            {getUnitLabel(
                              item.unit,
                            )}
                          </p>


                          {item
                            .unit
                            .code && (
                            <p className="mt-1 text-[9px] text-text-secondary">
                              {
                                item
                                  .unit
                                  .code
                              }
                            </p>
                          )}

                        </td>
                      )}


                      <td className="px-5 py-5 text-[12px] font-medium text-text-primary">
                        {item.line ??
                          "—"}
                      </td>


                      <td className="max-w-[230px] px-5 py-5 text-[12px] text-text-primary">

                        <p className="truncate">
                          {item.equipment ??
                            "—"}
                        </p>

                      </td>


                      <td className="max-w-[280px] px-5 py-5 text-[12px] text-text-primary">

                        <p className="truncate">
                          {item.observation ??
                            item.stopKey1 ??
                            item.stopSubkey ??
                            "—"}
                        </p>

                      </td>


                      <td className="px-5 py-5">

                        {item.classification ? (
                          <div>

                            <p className="text-[12px] font-medium text-text-primary">
                              {getClassificationTitle(
                                item.classification,
                              )}
                            </p>


                            <p className="mt-1 text-[11px] text-text-secondary">
                              {item
                                .classification
                                .system ??
                                formatCategory(
                                  item
                                    .classification
                                    .category,
                                )}
                            </p>

                          </div>
                        ) : (
                          <span className="text-[12px] text-text-secondary">
                            Não classificado
                          </span>
                        )}

                      </td>


                      <td className="whitespace-nowrap py-5 pl-5 text-right text-[12px] text-text-primary">
                        {formatMinutes(
                          item.downtimeMinutes,
                        )}
                      </td>

                    </tr>
                  ),
                )}

            </tbody>

          </table>

        </div>


        {/* =================================================
            PAGINATION
        ================================================== */}

        {!loading &&
          pagination.total >
            0 && (
            <div className="mt-6 flex items-center justify-between">

              <p className="text-[11px] text-text-secondary">
                {new Intl.NumberFormat(
                  "pt-BR",
                ).format(
                  pagination.total,
                )}{" "}
                registros
              </p>


              <div className="flex items-center gap-4">

                <button
                  type="button"
                  disabled={
                    pagination.page <=
                    1
                  }
                  onClick={() =>
                    void loadHistory(
                      pagination.page -
                        1,
                      search,
                    )
                  }
                  className="text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Página anterior"
                >

                  <ChevronLeft
                    size={18}
                  />

                </button>


                <span className="text-[11px] text-text-secondary">
                  {
                    pagination.page
                  }{" "}
                  /{" "}
                  {
                    pagination.totalPages
                  }
                </span>


                <button
                  type="button"
                  disabled={
                    pagination.page >=
                    pagination.totalPages
                  }
                  onClick={() =>
                    void loadHistory(
                      pagination.page +
                        1,
                      search,
                    )
                  }
                  className="text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Próxima página"
                >

                  <ChevronRight
                    size={18}
                  />

                </button>

              </div>

            </div>
          )}

      </section>


      {/* ===================================================
          DRAWER
      ==================================================== */}

      {selected && (
        <div className="fixed inset-0 z-50">

          <button
            type="button"
            aria-label="Fechar detalhes"
            onClick={
              closeEvent
            }
            className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
          />


          <aside className="absolute right-0 top-0 h-full w-full max-w-[560px] overflow-y-auto bg-surface shadow-[-16px_0_48px_rgba(0,0,0,0.08)]">

            <div className="sticky top-0 z-10 border-b border-border-theme bg-surface/96 backdrop-blur-sm">

              <div className="flex min-h-[78px] items-center justify-between gap-5 px-7 py-3">

                <div>

                  <p className="text-[15px] font-semibold tracking-[-0.02em] text-text-primary">
                    Detalhes do apontamento
                  </p>


                  <p className="mt-1 text-[11px] text-text-secondary">
                    {getUnitLabel(
                      selected.unit,
                    )}
                  </p>

                </div>


                <button
                  type="button"
                  onClick={
                    closeEvent
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                >

                  <X
                    size={18}
                  />

                </button>

              </div>

            </div>


            <div className="px-7 py-7 pb-10">

              {/* =============================================
                  MAIN FAILURE
              ============================================== */}

              <div className="rounded-[22px] border border-border-theme bg-surface-elevated p-5">

                <p className="text-[10px] uppercase tracking-[0.12em] text-text-secondary">
                  Falha registrada
                </p>


                <p className="mt-3 text-[24px] font-semibold leading-8 tracking-[-0.035em] text-text-primary">
                  {getClassificationTitle(
                    selected.classification,
                  )}
                </p>


                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border-theme pt-4">

                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Unidade
                    </p>


                    <p className="mt-1 text-[12px] font-medium text-text-primary">
                      {getUnitLabel(
                        selected.unit,
                      )}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Tempo de parada
                    </p>


                    <p className="mt-1 text-[12px] font-medium text-text-primary">
                      {formatMinutes(
                        selected.downtimeMinutes,
                      )}{" "}
                      min
                    </p>

                  </div>

                </div>

              </div>


              {/* =============================================
                  EVENT INFORMATION
              ============================================== */}

              <div className="mt-7 rounded-[22px] border border-border-theme bg-surface p-5">

                <h2 className="text-[15px] font-semibold text-text-primary">
                  Informações do apontamento
                </h2>


                <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5">

                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Unidade
                    </p>


                    <p className="mt-1.5 text-[13px] text-text-primary">
                      {getUnitLabel(
                        selected.unit,
                      )}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Código
                    </p>


                    <p className="mt-1.5 text-[13px] text-text-primary">
                      {selected
                        .unit
                        .code ??
                        "—"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Data
                    </p>


                    <p className="mt-1.5 text-[13px] text-text-primary">
                      {formatDate(
                        selected.eventDate,
                      )}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Turno
                    </p>


                    <p className="mt-1.5 text-[13px] text-text-primary">
                      {selected.shift ??
                        "—"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Linha
                    </p>


                    <p className="mt-1.5 text-[13px] text-text-primary">
                      {selected.line ??
                        "—"}
                    </p>

                  </div>


                  <div>

                    <p className="text-[10px] text-text-secondary">
                      Tempo de parada
                    </p>


                    <p className="mt-1.5 text-[13px] text-text-primary">
                      {formatMinutes(
                        selected.downtimeMinutes,
                      )}{" "}
                      min
                    </p>

                  </div>

                </div>


                <div className="mt-6 border-t border-border-theme pt-5">

                  <p className="text-[10px] text-text-secondary">
                    Equipamento
                  </p>


                  <p className="mt-1.5 text-[13px] leading-6 text-text-primary">
                    {selected.equipment ??
                      "—"}
                  </p>

                </div>


                <div className="mt-6 border-t border-border-theme pt-5">

                  <p className="text-[10px] text-text-secondary">
                    Tipo de parada
                  </p>


                  <p className="mt-1.5 text-[13px] leading-6 text-text-primary">
                    {selected.stopType ??
                      "—"}
                  </p>

                </div>


                <div className="mt-6 border-t border-border-theme pt-5">

                  <p className="text-[10px] text-text-secondary">
                    Observação
                  </p>


                  <p className="mt-1.5 text-[13px] leading-6 text-text-primary">
                    {selected.observation ??
                      selected.stopKey1 ??
                      selected.stopSubkey ??
                      "—"}
                  </p>

                </div>

              </div>


              {/* =============================================
                  CLASSIFICATION
              ============================================== */}

              <div className="mt-7 rounded-[22px] border border-border-theme bg-surface p-5">

                <div className="flex items-start justify-between gap-4">

                  <div>

                    <h2 className="text-[15px] font-semibold text-text-primary">
                      Classificação
                    </h2>


                    <p className="mt-1 text-[11px] text-text-secondary">
                      Ajuste os dados com clareza e padronização.
                    </p>

                  </div>


                  {canWrite && !editing && (
                    <button
                      type="button"
                      onClick={
                        startEditing
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-border-theme px-4 py-2 text-[12px] font-medium text-text-primary transition-colors hover:border-border-theme hover:bg-surface-hover"
                    >

                      <Pencil
                        size={14}
                      />

                      Editar

                    </button>
                  )}

                </div>


                {!editing && (
                  <div className="mt-6 space-y-5">

                    <div className="rounded-[18px] bg-surface-elevated p-4">

                      <p className="text-[10px] uppercase tracking-[0.12em] text-text-secondary">
                        Falha
                      </p>


                      <p className="mt-2 text-[20px] font-semibold leading-7 tracking-[-0.03em] text-text-primary">
                        {selected
                          .classification
                          ?.failureMode ??
                          "Não classificado"}
                      </p>

                    </div>


                    <div className="grid grid-cols-2 gap-4">

                      <div>

                        <p className="text-[10px] text-text-secondary">
                          Categoria
                        </p>


                        <p className="mt-1.5 text-[13px] text-text-primary">
                          {formatCategory(
                            selected
                              .classification
                              ?.category ??
                              null,
                          )}
                        </p>

                      </div>


                      <div>

                        <p className="text-[10px] text-text-secondary">
                          Sistema
                        </p>


                        <p className="mt-1.5 text-[13px] text-text-primary">
                          {selected
                            .classification
                            ?.system ??
                            "—"}
                        </p>

                      </div>

                    </div>


                    {selected
                      .classification
                      ?.classifiedBy && (
                      <div className="border-t border-border-theme pt-5">

                        <p className="text-[10px] text-text-secondary">
                          Revisado por
                        </p>


                        <p className="mt-1.5 text-[12px] text-text-secondary">
                          {
                            selected
                              .classification
                              .classifiedBy
                          }
                        </p>

                      </div>
                    )}


                    {selected
                      .classification
                      ?.explanation && (
                      <div className="border-t border-border-theme pt-5">

                        <p className="text-[10px] text-text-secondary">
                          Observação da classificação
                        </p>


                        <p className="mt-1.5 text-[12px] leading-6 text-text-secondary">
                          {
                            selected
                              .classification
                              .explanation
                          }
                        </p>

                      </div>
                    )}

                  </div>
                )}


                {/* ===========================================
                    EDIT FORM
                ============================================ */}

                {editing && (
                  <div className="mt-6">

                    <div className="rounded-[18px] bg-surface-elevated p-4">

                      <p className="text-[10px] uppercase tracking-[0.12em] text-text-secondary">
                        Ocorrência
                      </p>


                      <p className="mt-2 text-[13px] leading-6 text-text-primary">
                        {selected.observation ??
                          selected.stopKey1 ??
                          selected.stopSubkey ??
                          "—"}
                      </p>

                    </div>


                    <div className="mt-5 grid gap-5 sm:grid-cols-2">

                      <div>

                        <label className="text-[11px] font-medium text-text-secondary">
                          Categoria
                        </label>


                        <select
                          value={
                            editCategory
                          }
                          onChange={(
                            event,
                          ) =>
                            setEditCategory(
                              event.target
                                .value,
                            )
                          }
                          className="mt-2 h-12 w-full rounded-[12px] border border-border-theme bg-surface px-3 text-[13px] text-text-primary outline-none transition-colors focus:border-border-theme"
                        >

                          <option value="">
                            Selecione
                          </option>


                          {CATEGORY_OPTIONS.map(
                            (
                              category,
                            ) => (
                              <option
                                key={
                                  category.value
                                }
                                value={
                                  category.value
                                }
                              >
                                {
                                  category.label
                                }
                              </option>
                            ),
                          )}

                        </select>

                      </div>


                      <div>

                        <label className="text-[11px] font-medium text-text-secondary">
                          Sistema
                        </label>


                        <input
                          value={
                            editSystem
                          }
                          onChange={(
                            event,
                          ) =>
                            setEditSystem(
                              event.target
                                .value,
                            )
                          }
                          placeholder="Ex.: Transporte, Rotulagem, Dosagem"
                          className="mt-2 h-12 w-full rounded-[12px] border border-border-theme bg-surface px-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-theme"
                        />

                      </div>

                    </div>


                    <div className="mt-5">

                      <label className="text-[11px] font-medium text-text-secondary">
                        Falha identificada
                      </label>


                      <input
                        value={
                          editFailureMode
                        }
                        onChange={(
                          event,
                        ) =>
                          setEditFailureMode(
                            event.target
                              .value,
                          )
                        }
                        placeholder="Ex.: Falha de dosador"
                        className="mt-2 h-12 w-full rounded-[12px] border border-border-theme bg-surface px-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-theme"
                      />

                    </div>


                    <div className="mt-5 rounded-[18px] border border-border-theme bg-surface-elevated p-4">

                      <p className="text-[10px] uppercase tracking-[0.12em] text-text-secondary">
                        Pré-visualização
                      </p>


                      <p className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-text-primary">
                        {editFailureMode.trim() ||
                          "Informe a falha"}
                      </p>

                    </div>


                    <div className="mt-5">

                      <label className="text-[11px] font-medium text-text-secondary">
                        Observação da classificação
                      </label>


                      <textarea
                        value={
                          editExplanation
                        }
                        onChange={(
                          event,
                        ) =>
                          setEditExplanation(
                            event.target
                              .value,
                          )
                        }
                        rows={4}
                        placeholder="Adicione um contexto complementar, se necessário."
                        className="mt-2 w-full resize-none rounded-[12px] border border-border-theme bg-surface px-3 py-3 text-[13px] leading-6 text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-theme"
                      />

                    </div>


                    {editError && (
                      <div className="mt-5 rounded-[14px] border border-accent-primary/30 bg-surface-elevated px-4 py-3">

                        <p className="text-[12px] text-accent-primary">
                          {editError}
                        </p>

                      </div>
                    )}


                    <div className="mt-7 flex justify-end gap-3 border-t border-border-theme pt-5">

                      <button
                        type="button"
                        disabled={
                          saving
                        }
                        onClick={() => {
                          setEditing(
                            false,
                          );


                          setEditError(
                            "",
                          );
                        }}
                        className="rounded-full border border-border-theme px-5 py-2.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-50"
                      >
                        Cancelar
                      </button>


                      <button
                        type="button"
                        disabled={
                          saving
                        }
                        onClick={() =>
                          void saveClassification()
                        }
                        className="inline-flex min-w-[150px] items-center justify-center rounded-full bg-accent-primary px-5 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                      >
                        {saving
                          ? "Salvando..."
                          : "Salvar alteração"}
                      </button>

                    </div>

                  </div>
                )}

              </div>

            </div>

          </aside>

        </div>
      )}

    </main>
  );
}