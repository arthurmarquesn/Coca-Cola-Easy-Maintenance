"use client";

import Image from "next/image";
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
  useEffect,
  useState,
} from "react";

/* =========================================================
   PROPS
========================================================= */

interface HistoryPageProps {
  user: {
    name: string;
  };

  unit: {
    city:
      | string
      | null;
  };
}

/* =========================================================
   CLASSIFICAÇÃO
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
   EVENTO
========================================================= */

interface HistoryItem {
  id: number;

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
   PAGINAÇÃO
========================================================= */

interface Pagination {
  page: number;

  pageSize: number;

  total: number;

  totalPages: number;
}

/* =========================================================
   CATEGORIAS
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
  if (!value) {
    return "—";
  }

  const [
    year,
    month,
    day,
  ] = value.split("-");

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
    value === null
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
      (item) =>
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
  if (!classification) {
    return "Não classificado";
  }

  return (
    classification.failureMode ??
    classification.system ??
    formatCategory(
      classification.category,
    )
  );
}

/* =========================================================
   COMPONENTE
========================================================= */

export function HistoryPage({
  user,
  unit,
}: HistoryPageProps) {
  const [items, setItems] =
    useState<
      HistoryItem[]
    >([]);

  const [
    pagination,
    setPagination,
  ] =
    useState<Pagination>({
      page: 1,

      pageSize: 20,

      total: 0,

      totalPages: 1,
    });

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    exporting,
    setExporting,
  ] =
    useState(false);

  const [
    exportError,
    setExportError,
  ] =
    useState("");

  const [
    searchInput,
    setSearchInput,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    selected,
    setSelected,
  ] =
    useState<
      HistoryItem | null
    >(null);

  const [
    editing,
    setEditing,
  ] =
    useState(false);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    editCategory,
    setEditCategory,
  ] =
    useState("");

  const [
    editSystem,
    setEditSystem,
  ] =
    useState("");

  const [
    editFailureMode,
    setEditFailureMode,
  ] =
    useState("");

  const [
    editExplanation,
    setEditExplanation,
  ] =
    useState("");

  const [
    editError,
    setEditError,
  ] =
    useState("");

  /* =======================================================
     CARREGA HISTÓRICO
  ======================================================= */

  const loadHistory =
    useCallback(
      async (
        page: number,
        searchTerm: string,
      ) => {
        setLoading(true);

        setError("");

        try {
          const params =
            new URLSearchParams({
              page:
                String(page),

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
              },
            );

          const data =
            await response.json();

          if (
            !response.ok ||
            !data.success
          ) {
            setError(
              data.message ??
                "Não foi possível carregar o histórico.",
            );

            return;
          }

          setItems(
            data.items,
          );

          setPagination(
            data.pagination,
          );

          /*
             Se o registro selecionado estiver na lista,
             atualizamos o drawer também.
          */
          if (
            selected
          ) {
            const refreshed =
              (
                data.items as HistoryItem[]
              ).find(
                (item) =>
                  item.id ===
                  selected.id,
              );

            if (
              refreshed
            ) {
              setSelected(
                refreshed,
              );
            }
          }
        } catch {
          setError(
            "Não foi possível carregar o histórico.",
          );
        } finally {
          setLoading(false);
        }
      },
      [
        selected,
      ],
    );

  useEffect(() => {
    void loadHistory(
      1,
      "",
    );

    // Executar apenas na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =======================================================
     PESQUISA
  ======================================================= */

  function handleSearch(
    event: FormEvent,
  ) {
    event.preventDefault();

    const value =
      searchInput.trim();

    setSearch(
      value,
    );

    void loadHistory(
      1,
      value,
    );
  }

  async function handleExport() {
    if (
      exporting ||
      pagination.total === 0
    ) {
      return;
    }

    setExporting(true);
    setExportError("");

    try {
      const params =
        new URLSearchParams();

      if (search) {
        params.set(
          "search",
          search,
        );
      }

      const url =
        params.size > 0
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

      if (!response.ok) {
        let message =
          "Não foi possível exportar o histórico.";

        try {
          const data =
            await response.json();

          message =
            data.message ??
            message;
        } catch {
          // A resposta pode não ser JSON.
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
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Não foi possível exportar o histórico.",
      );
    } finally {
      setExporting(false);
    }
  }

  /* =======================================================
     SELECIONA
  ======================================================= */

  function openEvent(
    item: HistoryItem,
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
     EDITAR
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

    setEditError("");

    setEditing(true);
  }

  /* =======================================================
     SALVAR CORREÇÃO
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

    setSaving(true);

    setEditError("");

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
        setEditError(
          data.message ??
            "Não foi possível salvar a classificação.",
        );

        return;
      }

      const updatedItem: HistoryItem =
        {
          ...selected,

          classification:
            data.classification,
        };

      setSelected(
        updatedItem,
      );

      setItems(
        (
          current,
        ) =>
          current.map(
            (item) =>
              item.id ===
              selected.id
                ? updatedItem
                : item,
          ),
      );

      setEditing(
        false,
      );
    } catch {
      setEditError(
        "Não foi possível salvar a classificação.",
      );
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     INTERFACE
  ======================================================= */

  return (
    <main className="min-h-screen bg-white">

      {/* ===================================================
          HEADER
      ==================================================== */}

      <header className="border-b border-[#E8E9EB]">

        <div className="mx-auto flex h-[78px] w-full max-w-[1380px] items-center justify-between px-6 sm:px-8 lg:px-12">

          <Link
            href="/dashboard"
          >
            <Image
              src="/logo.webp"
              alt="Coca-Cola FEMSA"
              width={180}
              height={70}
              priority
              className="h-auto max-h-[52px] w-auto max-w-[140px] object-contain"
            />
          </Link>

          <div className="hidden text-right sm:block">

            <p className="text-[13px] font-medium text-[#2D3034]">
              {user.name}
            </p>

            {unit.city && (
              <p className="mt-0.5 text-[11px] text-[#979BA1]">
                {unit.city}
              </p>
            )}

          </div>

        </div>

      </header>

      {/* ===================================================
          CONTEÚDO
      ==================================================== */}

      <section className="mx-auto w-full max-w-[1380px] px-6 pb-20 pt-10 sm:px-8 lg:px-12">

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-[#81868C] transition-colors hover:text-[#282B2F]"
        >
          <ArrowLeft
            size={15}
          />

          Voltar
        </Link>

        <div className="mt-9 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">

          <div>

            <h1 className="text-[34px] font-semibold tracking-[-0.045em] text-[#191B1E] sm:text-[40px]">
              Histórico de manutenção
            </h1>

            <p className="mt-3 text-[14px] text-[#7D8288]">
              Consulte os apontamentos registrados e suas classificações.
            </p>

          </div>

          <div className="flex w-full flex-col gap-3 lg:max-w-[560px] lg:items-end">

            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">

              <form
                onSubmit={
                  handleSearch
                }
                className="flex w-full items-center border-b border-[#D9DCE0] pb-2 sm:max-w-[360px]"
              >

                <Search
                  size={17}
                  className="mr-3 shrink-0 text-[#94999F]"
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
                  placeholder="Buscar equipamento, linha ou ocorrência"
                  className="w-full bg-transparent text-[13px] text-[#292C30] outline-none placeholder:text-[#A2A6AB]"
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
                  pagination.total === 0
                }
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[#DFE2E5] bg-white px-4 text-[12px] font-medium text-[#4F545A] transition-colors hover:border-[#CFD3D7] hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-40"
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
              <p className="text-[11px] text-[#C92A32]">
                {exportError}
              </p>
            )}

          </div>

        </div>

        {/* =================================================
            TABELA
        ================================================== */}

        <div className="mt-10 overflow-x-auto border-y border-[#E7E9EB]">

          <table className="w-full min-w-[1000px] border-collapse">

            <thead>

              <tr className="border-b border-[#E7E9EB] text-left">

                <th className="py-4 pr-5 text-[11px] font-medium text-[#8B9096]">
                  Data
                </th>

                <th className="px-5 py-4 text-[11px] font-medium text-[#8B9096]">
                  Linha
                </th>

                <th className="px-5 py-4 text-[11px] font-medium text-[#8B9096]">
                  Equipamento
                </th>

                <th className="px-5 py-4 text-[11px] font-medium text-[#8B9096]">
                  Ocorrência
                </th>

                <th className="px-5 py-4 text-[11px] font-medium text-[#8B9096]">
                  Classificação
                </th>

                <th className="py-4 pl-5 text-right text-[11px] font-medium text-[#8B9096]">
                  Min.
                </th>

              </tr>

            </thead>

            <tbody>

              {loading && (
                <tr>

                  <td
                    colSpan={6}
                    className="py-16 text-center"
                  >

                    <LoaderCircle
                      size={20}
                      className="mx-auto animate-spin text-[#F40009]"
                    />

                  </td>

                </tr>
              )}

              {!loading &&
                error && (
                  <tr>

                    <td
                      colSpan={6}
                      className="py-16 text-center text-[13px] text-[#8A8F95]"
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
                      colSpan={6}
                      className="py-16 text-center text-[13px] text-[#8A8F95]"
                    >
                      Nenhum apontamento encontrado.
                    </td>

                  </tr>
                )}

              {!loading &&
                !error &&
                items.map(
                  (item) => (
                    <tr
                      key={
                        item.id
                      }
                      onClick={() =>
                        openEvent(
                          item,
                        )
                      }
                      className="cursor-pointer border-b border-[#EEF0F1] transition-colors last:border-b-0 hover:bg-[#FAFAFB]"
                    >

                      <td className="whitespace-nowrap py-5 pr-5 text-[12px] text-[#5E6369]">
                        {formatDate(
                          item.eventDate,
                        )}
                      </td>

                      <td className="px-5 py-5 text-[12px] font-medium text-[#393D42]">
                        {item.line ??
                          "—"}
                      </td>

                      <td className="max-w-[230px] px-5 py-5 text-[12px] text-[#4F545A]">

                        <p className="truncate">
                          {item.equipment ??
                            "—"}
                        </p>

                      </td>

                      <td className="max-w-[280px] px-5 py-5 text-[12px] text-[#62676D]">

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

                            <p className="text-[12px] font-medium text-[#34383D]">
                              {getClassificationTitle(
                                item.classification,
                              )}
                            </p>

                            <p className="mt-1 text-[11px] text-[#91969C]">
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
                          <span className="text-[12px] text-[#A0A4A9]">
                            Não classificado
                          </span>
                        )}

                      </td>

                      <td className="whitespace-nowrap py-5 pl-5 text-right text-[12px] text-[#5E6369]">
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
            PAGINAÇÃO
        ================================================== */}

        {!loading &&
          pagination.total >
            0 && (
            <div className="mt-6 flex items-center justify-between">

              <p className="text-[11px] text-[#92979D]">
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
                  className="text-[#777C82] transition-colors hover:text-[#202327] disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Página anterior"
                >
                  <ChevronLeft
                    size={18}
                  />
                </button>

                <span className="text-[11px] text-[#6F747A]">
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
                  className="text-[#777C82] transition-colors hover:text-[#202327] disabled:cursor-not-allowed disabled:opacity-30"
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
          PAINEL LATERAL
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

          <aside className="absolute right-0 top-0 h-full w-full max-w-[560px] overflow-y-auto bg-white shadow-[-16px_0_48px_rgba(0,0,0,0.08)]">

            <div className="sticky top-0 z-10 border-b border-[#E8E9EB] bg-white/96 backdrop-blur-sm">

              <div className="flex h-[78px] items-center justify-between px-7">

                <div>

                  <p className="text-[15px] font-semibold tracking-[-0.02em] text-[#1F2226]">
                    Detalhes do apontamento
                  </p>

                  <p className="mt-1 text-[11px] text-[#9AA0A6]">
                    Visualize e ajuste a classificação quando necessário.
                  </p>

                </div>

                <button
                  type="button"
                  onClick={
                    closeEvent
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[#8E9399] transition-colors hover:bg-[#F5F6F7] hover:text-[#33373B]"
                >
                  <X
                    size={18}
                  />
                </button>

              </div>

            </div>

            <div className="px-7 py-7 pb-10">

              <div className="rounded-[22px] border border-[#ECEDEF] bg-[#FAFAFA] p-5">

                <p className="text-[10px] uppercase tracking-[0.12em] text-[#A1A6AC]">
                  Falha registrada
                </p>

                <p className="mt-3 text-[24px] font-semibold leading-8 tracking-[-0.035em] text-[#202327]">
                  {getClassificationTitle(
                    selected.classification,
                  )}
                </p>

                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#E8EAEC] pt-4">

                  <div>
                    <p className="text-[10px] text-[#A1A6AC]">
                      Linha
                    </p>

                    <p className="mt-1 text-[12px] font-medium text-[#3A3F45]">
                      {selected.line ??
                        "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-[#A1A6AC]">
                      Tempo de parada
                    </p>

                    <p className="mt-1 text-[12px] font-medium text-[#3A3F45]">
                      {formatMinutes(
                        selected.downtimeMinutes,
                      )}{" "}
                      min
                    </p>
                  </div>
                </div>

              </div>

              <div className="mt-7 rounded-[22px] border border-[#ECEDEF] bg-white p-5">

                <h2 className="text-[15px] font-semibold text-[#262A2F]">
                  Informações do apontamento
                </h2>

                <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-5">

                  <div>
                    <p className="text-[10px] text-[#969BA1]">
                      Data
                    </p>

                    <p className="mt-1.5 text-[13px] text-[#34383D]">
                      {formatDate(
                        selected.eventDate,
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-[#969BA1]">
                      Turno
                    </p>

                    <p className="mt-1.5 text-[13px] text-[#34383D]">
                      {selected.shift ??
                        "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-[#969BA1]">
                      Linha
                    </p>

                    <p className="mt-1.5 text-[13px] text-[#34383D]">
                      {selected.line ??
                        "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] text-[#969BA1]">
                      Tempo de parada
                    </p>

                    <p className="mt-1.5 text-[13px] text-[#34383D]">
                      {formatMinutes(
                        selected.downtimeMinutes,
                      )}{" "}
                      min
                    </p>
                  </div>
                </div>

                <div className="mt-6 border-t border-[#ECEDEF] pt-5">

                  <p className="text-[10px] text-[#969BA1]">
                    Equipamento
                  </p>

                  <p className="mt-1.5 text-[13px] leading-6 text-[#34383D]">
                    {selected.equipment ??
                      "—"}
                  </p>

                </div>

                <div className="mt-6 border-t border-[#ECEDEF] pt-5">

                  <p className="text-[10px] text-[#969BA1]">
                    Observação
                  </p>

                  <p className="mt-1.5 text-[13px] leading-6 text-[#4F545A]">
                    {selected.observation ??
                      selected.stopKey1 ??
                      selected.stopSubkey ??
                      "—"}
                  </p>

                </div>

              </div>

              <div className="mt-7 rounded-[22px] border border-[#ECEDEF] bg-white p-5">

                <div className="flex items-start justify-between gap-4">

                  <div>
                    <h2 className="text-[15px] font-semibold text-[#262A2F]">
                      Classificação
                    </h2>

                    <p className="mt-1 text-[11px] text-[#9AA0A6]">
                      Ajuste os dados com clareza e padronização.
                    </p>
                  </div>

                  {!editing && (
                    <button
                      type="button"
                      onClick={
                        startEditing
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-[#E3E5E8] px-4 py-2 text-[12px] font-medium text-[#4C5157] transition-colors hover:border-[#D5D8DC] hover:bg-[#F8F8F8]"
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

                    <div className="rounded-[18px] bg-[#FAFAFA] p-4">

                      <p className="text-[10px] uppercase tracking-[0.12em] text-[#A0A4A9]">
                        Falha
                      </p>

                      <p className="mt-2 text-[20px] font-semibold leading-7 tracking-[-0.03em] text-[#222529]">
                        {selected
                          .classification
                          ?.failureMode ??
                          "Não classificado"}
                      </p>

                    </div>

                    <div className="grid grid-cols-2 gap-4">

                      <div>
                        <p className="text-[10px] text-[#969BA1]">
                          Categoria
                        </p>

                        <p className="mt-1.5 text-[13px] text-[#34383D]">
                          {formatCategory(
                            selected
                              .classification
                              ?.category ??
                              null,
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] text-[#969BA1]">
                          Sistema
                        </p>

                        <p className="mt-1.5 text-[13px] text-[#34383D]">
                          {selected
                            .classification
                            ?.system ??
                            "—"}
                        </p>
                      </div>

                    </div>

                    {selected
                      .classification
                      ?.explanation && (
                      <div className="border-t border-[#ECEDEF] pt-5">

                        <p className="text-[10px] text-[#969BA1]">
                          Observação da classificação
                        </p>

                        <p className="mt-1.5 text-[12px] leading-6 text-[#64696F]">
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

                {editing && (
                  <div className="mt-6">

                    <div className="rounded-[18px] bg-[#FAFAFA] p-4">

                      <p className="text-[10px] uppercase tracking-[0.12em] text-[#A0A4A9]">
                        Ocorrência
                      </p>

                      <p className="mt-2 text-[13px] leading-6 text-[#4A5056]">
                        {selected.observation ??
                          selected.stopKey1 ??
                          selected.stopSubkey ??
                          "—"}
                      </p>

                    </div>

                    <div className="mt-5 grid gap-5 sm:grid-cols-2">

                      <div>

                        <label className="text-[11px] font-medium text-[#777C82]">
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
                              event
                                .target
                                .value,
                            )
                          }
                          className="mt-2 h-12 w-full rounded-[12px] border border-[#DDE0E3] bg-white px-3 text-[13px] text-[#303438] outline-none transition-colors focus:border-[#C6CAD0]"
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

                        <label className="text-[11px] font-medium text-[#777C82]">
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
                              event
                                .target
                                .value,
                            )
                          }
                          placeholder="Ex.: Transporte, Rotulagem, Dosagem"
                          className="mt-2 h-12 w-full rounded-[12px] border border-[#DDE0E3] bg-white px-3 text-[13px] text-[#303438] outline-none transition-colors placeholder:text-[#B0B4B8] focus:border-[#C6CAD0]"
                        />

                      </div>

                    </div>

                    <div className="mt-5">

                      <label className="text-[11px] font-medium text-[#777C82]">
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
                            event
                              .target
                              .value,
                          )
                        }
                        placeholder="Ex.: Falha de dosador"
                        className="mt-2 h-12 w-full rounded-[12px] border border-[#DDE0E3] bg-white px-3 text-[13px] text-[#303438] outline-none transition-colors placeholder:text-[#B0B4B8] focus:border-[#C6CAD0]"
                      />

                    </div>

                    <div className="mt-5 rounded-[18px] border border-[#ECEDEF] bg-[#FCFCFC] p-4">

                      <p className="text-[10px] uppercase tracking-[0.12em] text-[#A0A4A9]">
                        Pré-visualização
                      </p>

                      <p className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[#212429]">
                        {editFailureMode.trim() ||
                          "Informe a falha"}
                      </p>

                      <p className="mt-3 text-[11px] leading-5 text-[#8A9096]">
                        Use uma nomenclatura curta e padronizada, como
                        “Falha de rolamento”, “Falha de sensor” ou
                        “Falha de válvula”.
                      </p>

                    </div>

                    <div className="mt-5">

                      <label className="text-[11px] font-medium text-[#777C82]">
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
                            event
                              .target
                              .value,
                          )
                        }
                        rows={4}
                        placeholder="Adicione um contexto complementar, se necessário."
                        className="mt-2 w-full resize-none rounded-[12px] border border-[#DDE0E3] bg-white px-3 py-3 text-[13px] leading-6 text-[#303438] outline-none transition-colors placeholder:text-[#B0B4B8] focus:border-[#C6CAD0]"
                      />

                    </div>

                    {editError && (
                      <div className="mt-5 rounded-[14px] border border-[#F1D6D9] bg-[#FFF8F8] px-4 py-3">
                        <p className="text-[12px] text-[#C92A32]">
                          {editError}
                        </p>
                      </div>
                    )}

                    <div className="mt-7 flex justify-end gap-3 border-t border-[#ECEDEF] pt-5">

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
                        className="rounded-full border border-[#E1E4E7] px-5 py-2.5 text-[12px] font-medium text-[#70757B] transition-colors hover:bg-[#F8F8F8]"
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
                        className="inline-flex min-w-[150px] items-center justify-center rounded-full bg-[#F40009] px-5 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#D90008] disabled:opacity-50"
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