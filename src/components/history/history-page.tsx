"use client";

import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
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
              Consulte os apontamentos processados e revise as classificações quando necessário.
            </p>

          </div>

          <form
            onSubmit={
              handleSearch
            }
            className="flex w-full max-w-[360px] items-center border-b border-[#D9DCE0] pb-2"
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
                              {formatCategory(
                                item
                                  .classification
                                  .category,
                              )}
                            </p>

                            <p className="mt-1 text-[11px] text-[#91969C]">
                              {item
                                .classification
                                .failureMode ??
                                item
                                  .classification
                                  .system ??
                                "—"}
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
            className="absolute inset-0 bg-black/20"
          />

          <aside className="absolute right-0 top-0 h-full w-full max-w-[520px] overflow-y-auto bg-white shadow-[-10px_0_40px_rgba(0,0,0,0.08)]">

            <div className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#E8E9EB] bg-white px-7">

              <p className="text-[14px] font-semibold text-[#292C30]">
                Detalhes do apontamento
              </p>

              <button
                type="button"
                onClick={
                  closeEvent
                }
                className="text-[#8E9399] transition-colors hover:text-[#33373B]"
              >
                <X
                  size={19}
                />
              </button>

            </div>

            <div className="px-7 py-8">

              {/* ===========================================
                  DADOS
              ============================================ */}

              <div className="grid grid-cols-2 gap-x-8 gap-y-6">

                <div>

                  <p className="text-[10px] text-[#969BA1]">
                    Data
                  </p>

                  <p className="mt-1 text-[13px] text-[#34383D]">
                    {formatDate(
                      selected.eventDate,
                    )}
                  </p>

                </div>

                <div>

                  <p className="text-[10px] text-[#969BA1]">
                    Turno
                  </p>

                  <p className="mt-1 text-[13px] text-[#34383D]">
                    {selected.shift ??
                      "—"}
                  </p>

                </div>

                <div>

                  <p className="text-[10px] text-[#969BA1]">
                    Linha
                  </p>

                  <p className="mt-1 text-[13px] text-[#34383D]">
                    {selected.line ??
                      "—"}
                  </p>

                </div>

                <div>

                  <p className="text-[10px] text-[#969BA1]">
                    Tempo de parada
                  </p>

                  <p className="mt-1 text-[13px] text-[#34383D]">
                    {formatMinutes(
                      selected.downtimeMinutes,
                    )}{" "}
                    min
                  </p>

                </div>

              </div>

              <div className="mt-7">

                <p className="text-[10px] text-[#969BA1]">
                  Equipamento
                </p>

                <p className="mt-1.5 text-[13px] leading-6 text-[#34383D]">
                  {selected.equipment ??
                    "—"}
                </p>

              </div>

              <div className="mt-6">

                <p className="text-[10px] text-[#969BA1]">
                  Observação
                </p>

                <p className="mt-1.5 text-[13px] leading-6 text-[#4F545A]">
                  {selected.observation ??
                    "—"}
                </p>

              </div>

              <div className="mt-8 border-t border-[#E9EBED] pt-8">

                <div className="flex items-center justify-between">

                  <h2 className="text-[15px] font-semibold text-[#292C30]">
                    Classificação
                  </h2>

                  {!editing && (
                    <button
                      type="button"
                      onClick={
                        startEditing
                      }
                      className="inline-flex items-center gap-2 text-[12px] font-medium text-[#73787E] transition-colors hover:text-[#F40009]"
                    >
                      <Pencil
                        size={14}
                      />

                      Editar
                    </button>
                  )}

                </div>

                {/* =========================================
                    VISUALIZAÇÃO
                ========================================== */}

                {!editing && (
                  <div className="mt-6 space-y-5">

                    <div>

                      <p className="text-[10px] text-[#969BA1]">
                        Categoria
                      </p>

                      <p className="mt-1 text-[13px] font-medium text-[#34383D]">
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

                      <p className="mt-1 text-[13px] text-[#34383D]">
                        {selected
                          .classification
                          ?.system ??
                          "—"}
                      </p>

                    </div>

                    <div>

                      <p className="text-[10px] text-[#969BA1]">
                        Modo de falha
                      </p>

                      <p className="mt-1 text-[13px] text-[#34383D]">
                        {selected
                          .classification
                          ?.failureMode ??
                          "—"}
                      </p>

                    </div>

                    {selected
                      .classification
                      ?.explanation && (
                      <div>

                        <p className="text-[10px] text-[#969BA1]">
                          Análise
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

                    {selected.classification && (
                      <div className="border-t border-[#ECEDEF] pt-5">

                        <p className="text-[11px] text-[#93989E]">

                          {selected
                            .classification
                            .source ===
                          "IA"
                            ? "Classificação automática"
                            : "Revisada manualmente"}

                          {selected
                              .classification
                              .source ===
                            "IA" &&
                            selected
                              .classification
                              .confidence !==
                              null &&
                            ` • ${Math.round(
                              selected
                                .classification
                                .confidence *
                                100,
                            )}% de confiança`}

                        </p>

                      </div>
                    )}

                  </div>
                )}

                {/* =========================================
                    EDIÇÃO
                ========================================== */}

                {editing && (
                  <div className="mt-6 space-y-5">

                    <div>

                      <label className="text-[11px] text-[#777C82]">
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
                        className="mt-2 h-11 w-full rounded-[9px] border border-[#DDE0E3] bg-white px-3 text-[13px] text-[#303438] outline-none transition-colors focus:border-[#B9BDC2]"
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

                      <label className="text-[11px] text-[#777C82]">
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
                        className="mt-2 h-11 w-full rounded-[9px] border border-[#DDE0E3] px-3 text-[13px] text-[#303438] outline-none transition-colors focus:border-[#B9BDC2]"
                      />

                    </div>

                    <div>

                      <label className="text-[11px] text-[#777C82]">
                        Modo de falha
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
                        className="mt-2 h-11 w-full rounded-[9px] border border-[#DDE0E3] px-3 text-[13px] text-[#303438] outline-none transition-colors focus:border-[#B9BDC2]"
                      />

                    </div>

                    <div>

                      <label className="text-[11px] text-[#777C82]">
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
                        className="mt-2 w-full resize-none rounded-[9px] border border-[#DDE0E3] px-3 py-3 text-[13px] leading-6 text-[#303438] outline-none transition-colors focus:border-[#B9BDC2]"
                      />

                    </div>

                    {editError && (
                      <p className="text-[12px] text-[#D1242F]">
                        {editError}
                      </p>
                    )}

                    <div className="flex justify-end gap-3 pt-2">

                      <button
                        type="button"
                        disabled={
                          saving
                        }
                        onClick={() =>
                          setEditing(
                            false,
                          )
                        }
                        className="px-4 py-2.5 text-[12px] font-medium text-[#73787E]"
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
                        className="min-w-[130px] rounded-[9px] bg-[#F40009] px-5 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#D90008] disabled:opacity-50"
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