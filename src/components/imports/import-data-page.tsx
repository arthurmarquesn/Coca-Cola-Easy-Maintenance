"use client";

import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  History,
  LoaderCircle,
  MoreHorizontal,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import type {
  ChangeEvent,
  DragEvent,
} from "react";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* =========================================================
   PROPS
========================================================= */

interface ImportDataPageProps {
  user: {
    name: string;
  };

  unit: {
    name: string;
  };
}

/* =========================================================
   PREVIEW
========================================================= */

interface ImportPreview {
  valid: boolean;

  filename: string;

  fileSize: number;

  sheetName: string;

  headerRow: number;

  totalRows: number;

  detectedColumns: string[];

  expectedColumns: string[];

  missingColumns: string[];
}

/* =========================================================
   IMPORTAÇÃO
========================================================= */

interface ImportResult {
  id: number;

  filename: string;

  sheetName: string;

  fileHash?: string;

  sourceRows: number;

  importedRows: number;

  skippedDuplicateRows?: number;

  ignoredRows: number;

  ignoredByUnit: number;

  ignoredInvalidDate: number;

  unit: {
    id: number;

    code: string | null;

    city: string | null;

    name: string | null;
  };
}

/* =========================================================
   MODELO ML
========================================================= */

type MlStatus =
  | "COMPLETED"
  | "PARTIAL"
  | "MODEL_OFFLINE";

interface MlResult {
  available: boolean;

  modelVersion: string | null;

  eligible: number;

  processed: number;

  inserted: number;

  failed: number;

  status: MlStatus;
}

interface ClassifyResult {
  model: string;

  groupsAnalyzed: number;

  eventsClassifiedThisRun: number;

  totalEvents: number;

  classifiedEvents: number;

  pendingEvents: number;

  limitReached: boolean;
}

/* =========================================================
   RESPOSTA DO PROCESSAMENTO
========================================================= */

interface ProcessResponse {
  success: boolean;

  import?: ImportResult;

  ml?: MlResult | null;

  review?: {
    required: boolean;

    href: string;
  };

  error?: string;

  message?: string;

  duplicate?: boolean;

  importId?: number;
}

/* =========================================================
   HISTÓRICO
========================================================= */

interface ImportHistoryItem {
  id: number;

  primaryUnitId: number;

  fileName: string;

  originalFileName: string | null;

  fileHash: string | null;

  sourceSystem: string | null;

  status: string | null;

  totalRows: number;

  processedRows: number;

  errorRows: number;

  errorMessage: string | null;

  events: number;

  classifiedEvents: number;

  pendingEvents: number;

  classificationCoverage: number;

  downtimeMinutes: number;

  rawRows: number;

  unitsCount: number;

  unitsLabel: string | null;

  modelVersions: string[];

  primaryUnit: {
    id: number;

    code: string | null;

    name: string | null;

    city: string | null;

    state: string | null;
  };

  importedAt: string | null;

  createdAt: string | null;

  updatedAt: string | null;
}

interface ImportsResponse {
  success: boolean;

  message?: string;

  summary?: {
    imports: number;

    events: number;

    rawRows: number;

    classifiedEvents: number;
  };

  filters?: {
    search: string;

    status: string | null;

    selectedUnitIds: number[];
  };

  options?: {
    statuses: string[];
  };

  pagination?: {
    page: number;

    pageSize: number;

    total: number;

    totalPages: number;
  };

  items?: ImportHistoryItem[];
}

/* =========================================================
   DETALHE
========================================================= */

interface ImportDetail {
  id: number;

  primaryUnitId: number;

  fileName: string;

  originalFileName: string | null;

  fileHash: string | null;

  sourceSystem: string | null;

  status: string | null;

  totalRows: number;

  processedRows: number;

  errorRows: number;

  errorMessage: string | null;

  importedAt: string | null;

  createdAt: string | null;

  updatedAt: string | null;

  units: Array<{
    id: number;

    code: string | null;

    name: string | null;

    city: string | null;

    state: string | null;

    events: number;
  }>;

  classification: {
    classifiableEvents: number;

    classifiedEvents: number;

    pendingEvents: number;

    coverage: number;

    modelVersions: string[];
  };

  impact: {
    events: number;

    downtimeMinutes: number;

    rawRows: number;

    eventClassifications: number;

    classificationAudits: number;

    classificationSuggestions: number;

    originPredictions: number;

    originReviews: number;

    originReviewAudits: number;

    maspEventLinks: number;

    maspEvidenceReferences: number;
  };
}

interface ImportDetailResponse {
  success: boolean;

  message?: string;

  item?: ImportDetail;
}

/* =========================================================
   STATUS DA TELA
========================================================= */

type ImportStatus =
  | "idle"
  | "validating"
  | "ready"
  | "processing"
  | "completed"
  | "invalid"
  | "error";

/* =========================================================
   HELPERS
========================================================= */

function formatNumber(
  value: number,
  maximumFractionDigits = 0,
) {
  return new Intl.NumberFormat(
    "pt-BR",
    {
      maximumFractionDigits,
    },
  ).format(
    Number.isFinite(
      value,
    )
      ? value
      : 0,
  );
}

function formatFileSize(
  bytes: number,
) {
  if (
    bytes <
    1024
  ) {
    return `${bytes} B`;
  }

  if (
    bytes <
    1024 * 1024
  ) {
    return `${(
      bytes /
      1024
    ).toFixed(
      1,
    )} KB`;
  }

  return `${(
    bytes /
    (
      1024 *
      1024
    )
  ).toFixed(
    1,
  )} MB`;
}

function formatDateTime(
  value: string | null,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      dateStyle:
        "short",

      timeStyle:
        "short",
    },
  ).format(
    date,
  );
}

function formatMinutes(
  value: number,
) {
  if (
    value >=
    60
  ) {
    return `${formatNumber(
      value /
        60,
      1,
    )} h`;
  }

  return `${formatNumber(
    value,
    1,
  )} min`;
}

function statusLabel(
  status: string | null,
) {
  const normalized =
    (
      status ??
      ""
    )
      .trim()
      .toUpperCase();

  if (
    [
      "COMPLETED",
      "CONCLUIDA",
      "CONCLUIDO",
      "SUCCESS",
      "SUCESSO",
    ].includes(
      normalized,
    )
  ) {
    return "Concluída";
  }

  if (
    [
      "PROCESSING",
      "PROCESSANDO",
      "PENDING",
      "PENDENTE",
    ].includes(
      normalized,
    )
  ) {
    return "Processando";
  }

  if (
    [
      "ERROR",
      "ERRO",
      "FAILED",
      "FALHA",
    ].includes(
      normalized,
    )
  ) {
    return "Erro";
  }

  return status ||
    "Sem status";
}

function statusClasses(
  status: string | null,
) {
  const normalized =
    (
      status ??
      ""
    )
      .trim()
      .toUpperCase();

  if (
    [
      "ERROR",
      "ERRO",
      "FAILED",
      "FALHA",
    ].includes(
      normalized,
    )
  ) {
    return "bg-accent-soft text-accent-primary";
  }

  if (
    [
      "PROCESSING",
      "PROCESSANDO",
      "PENDING",
      "PENDENTE",
    ].includes(
      normalized,
    )
  ) {
    return "bg-warning/10 text-warning";
  }

  return "bg-success/10 text-success";
}

/* =========================================================
   COMPONENTE
========================================================= */

export function ImportDataPage({
  user,
  unit,
}: ImportDataPageProps) {
  const inputRef =
    useRef<HTMLInputElement>(
      null,
    );

  /* =======================================================
     NOVA IMPORTAÇÃO
  ======================================================= */

  const [
    file,
    setFile,
  ] =
    useState<File | null>(
      null,
    );

  const [
    preview,
    setPreview,
  ] =
    useState<ImportPreview | null>(
      null,
    );

  const [
    result,
    setResult,
  ] =
    useState<ImportResult | null>(
      null,
    );

  const [
    mlResult,
    setMlResult,
  ] =
    useState<MlResult | null>(
      null,
    );

  const [
    status,
    setStatus,
  ] =
    useState<ImportStatus>(
      "idle",
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    warning,
    setWarning,
  ] =
    useState("");

  const [
    dragging,
    setDragging,
  ] =
    useState(
      false,
    );

  const [
    uploadExpanded,
    setUploadExpanded,
  ] =
    useState(
      false,
    );

  /* =======================================================
     HISTÓRICO
  ======================================================= */

  const [
    imports,
    setImports,
  ] =
    useState<
      ImportHistoryItem[]
    >(
      [],
    );

  const [
    importsLoading,
    setImportsLoading,
  ] =
    useState(
      true,
    );

  const [
    importsError,
    setImportsError,
  ] =
    useState("");

  const [
    search,
    setSearch,
  ] =
    useState("");

  const [
    debouncedSearch,
    setDebouncedSearch,
  ] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState("");

  const [
    statusOptions,
    setStatusOptions,
  ] =
    useState<
      string[]
    >(
      [],
    );

  const [
    page,
    setPage,
  ] =
    useState(
      1,
    );

  const [
    totalPages,
    setTotalPages,
  ] =
    useState(
      1,
    );

  const [
    totalImports,
    setTotalImports,
  ] =
    useState(
      0,
    );

  const [
    importsSummary,
    setImportsSummary,
  ] =
    useState({
      imports:
        0,

      events:
        0,

      rawRows:
        0,

      classifiedEvents:
        0,
    });

  /* =======================================================
     DETALHE / AÇÕES
  ======================================================= */

  const [
    selectedImportId,
    setSelectedImportId,
  ] =
    useState<
      number | null
    >(
      null,
    );

  const [
    selectedImport,
    setSelectedImport,
  ] =
    useState<
      ImportDetail | null
    >(
      null,
    );

  const [
    detailLoading,
    setDetailLoading,
  ] =
    useState(
      false,
    );

  const [
    detailError,
    setDetailError,
  ] =
    useState("");

  const [
    deleting,
    setDeleting,
  ] =
    useState(
      false,
    );

  const [
    deleteConfirm,
    setDeleteConfirm,
  ] =
    useState(
      false,
    );

  const [
    classifyingId,
    setClassifyingId,
  ] =
    useState<
      number | null
    >(
      null,
    );

  const [
    actionMessage,
    setActionMessage,
  ] =
    useState("");

  /* =======================================================
     CONTADORES DA IMPORTAÇÃO ATUAL
  ======================================================= */

  const importedCount =
    result?.importedRows ??
    0;

  const ignoredCount =
    result?.ignoredRows ??
    0;

  const duplicateCount = result?.skippedDuplicateRows ?? 0;

  const mlEligibleCount =
    mlResult?.eligible ??
    0;

  const mlProcessedCount =
    mlResult?.processed ??
    0;

  const suggestionsCount =
    mlResult?.inserted ??
    0;

  const mlFailedCount =
    mlResult?.failed ??
    0;

  const mlAvailable =
    Boolean(
      mlResult?.available &&
      mlResult.status !==
        "MODEL_OFFLINE",
    );

  const mlCompleted =
    Boolean(
      mlResult &&
      mlResult.available &&
      mlResult.status ===
        "COMPLETED",
    );

  /* =======================================================
     BUSCA COM DEBOUNCE
  ======================================================= */

  useEffect(
    () => {
      const timeout =
        window.setTimeout(
          () => {
            setDebouncedSearch(
              search.trim(),
            );

            setPage(
              1,
            );
          },
          300,
        );

      return () => {
        window.clearTimeout(
          timeout,
        );
      };
    },
    [
      search,
    ],
  );

  /* =======================================================
     CARREGAR HISTÓRICO
  ======================================================= */

  const loadImports =
    useCallback(
      async (
        signal?: AbortSignal,
      ) => {
        setImportsLoading(
          true,
        );

        setImportsError(
          "",
        );

        try {
          const params =
            new URLSearchParams();

          params.set(
            "page",
            String(
              page,
            ),
          );

          params.set(
            "pageSize",
            "12",
          );

          if (
            debouncedSearch
          ) {
            params.set(
              "search",
              debouncedSearch,
            );
          }

          if (
            statusFilter
          ) {
            params.set(
              "status",
              statusFilter,
            );
          }

          const response =
            await fetch(
              `/api/imports?${params.toString()}`,
              {
                cache:
                  "no-store",

                signal,
              },
            );

          const data =
            (
              await response.json()
            ) as ImportsResponse;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.message ??
                "Não foi possível carregar as importações.",
            );
          }

          setImports(
            Array.isArray(
              data.items,
            )
              ? data.items
              : [],
          );

          setStatusOptions(
            Array.isArray(
              data.options
                ?.statuses,
            )
              ? data.options
                  ?.statuses ??
                  []
              : [],
          );

          setPage(
            data.pagination
              ?.page ??
              1,
          );

          setTotalPages(
            data.pagination
              ?.totalPages ??
              1,
          );

          setTotalImports(
            data.pagination
              ?.total ??
              0,
          );

          setImportsSummary({
            imports:
              data.summary
                ?.imports ??
              0,

            events:
              data.summary
                ?.events ??
              0,

            rawRows:
              data.summary
                ?.rawRows ??
              0,

            classifiedEvents:
              data.summary
                ?.classifiedEvents ??
              0,
          });
        } catch (
          loadError
        ) {
          if (
            loadError instanceof
              DOMException &&
            loadError.name ===
              "AbortError"
          ) {
            return;
          }

          setImportsError(
            loadError instanceof
              Error
              ? loadError.message
              : "Não foi possível carregar as importações.",
          );
        } finally {
          if (
            !signal?.aborted
          ) {
            setImportsLoading(
              false,
            );
          }
        }
      },
      [
        page,
        debouncedSearch,
        statusFilter,
      ],
    );

  useEffect(
    () => {
      const controller =
        new AbortController();

      const task = setTimeout(() => { void loadImports(controller.signal); }, 0);

      return () => {
        clearTimeout(task);
        controller.abort();
      };
    },
    [
      loadImports,
    ],
  );

  /* =======================================================
     LIMPAR IMPORTAÇÃO ATUAL
  ======================================================= */

  function clearFile() {
    setFile(
      null,
    );

    setPreview(
      null,
    );

    setResult(
      null,
    );

    setMlResult(
      null,
    );

    setStatus(
      "idle",
    );

    setError(
      "",
    );

    setWarning(
      "",
    );

    if (
      inputRef.current
    ) {
      inputRef.current.value =
        "";
    }
  }

  /* =======================================================
     PREVIEW
  ======================================================= */

  async function validateFile(
    selectedFile: File,
  ) {
    setFile(
      selectedFile,
    );

    setPreview(
      null,
    );

    setResult(
      null,
    );

    setMlResult(
      null,
    );

    setError(
      "",
    );

    setWarning(
      "",
    );

    setStatus(
      "validating",
    );

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        selectedFile,
      );

      const response =
        await fetch(
          "/api/imports/preview",
          {
            method:
              "POST",

            body:
              formData,
          },
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        setError(
          data.error ??
            data.message ??
            "Não foi possível analisar o arquivo.",
        );

        setStatus(
          "error",
        );

        return;
      }

      const previewData =
        data.preview as
          ImportPreview;

      setPreview(
        previewData,
      );

      setStatus(
        previewData.valid
          ? "ready"
          : "invalid",
      );
    } catch (
      requestError
    ) {
      console.error(
        "Erro ao validar planilha:",
        requestError,
      );

      setError(
        "Não foi possível enviar a planilha para análise.",
      );

      setStatus(
        "error",
      );
    }
  }

  /* =======================================================
     PROCESSAMENTO
  ======================================================= */

  async function processFile() {
    if (
      !file ||
      !preview?.valid ||
      status !==
        "ready"
    ) {
      return;
    }

    setError(
      "",
    );

    setWarning(
      "",
    );

    setResult(
      null,
    );

    setMlResult(
      null,
    );

    setStatus(
      "processing",
    );

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        file,
      );

      const response =
        await fetch(
          "/api/imports/process",
          {
            method:
              "POST",

            body:
              formData,
          },
        );

      const data =
        (
          await response.json()
        ) as ProcessResponse;

      if (
        response.status ===
        409
      ) {
        setError(
          data.error ??
            data.message ??
            "Essa planilha já foi importada anteriormente.",
        );

        setStatus(
          "error",
        );

        return;
      }

      if (
        !response.ok ||
        !data.success ||
        !data.import
      ) {
        setError(
          data.error ??
            data.message ??
            "Não foi possível processar a planilha.",
        );

        setStatus(
          "error",
        );

        return;
      }

      setResult(
        data.import,
      );

      const ml =
        data.ml ??
        null;

      setMlResult(
        ml,
      );

      if (!ml) {
        setWarning(
          "A importação foi concluída, mas não foi possível obter o resultado do Modelo ML. Os dados permanecem salvos e podem ser classificados posteriormente.",
        );
      } else if (
        !ml.available ||
        ml.status ===
          "MODEL_OFFLINE"
      ) {
        setWarning(
          "A importação foi concluída, mas o Modelo ML estava indisponível. Nenhum dado importado foi perdido.",
        );
      } else if (
        ml.status ===
          "PARTIAL" ||
        ml.failed >
          0
      ) {
        setWarning(
          `${formatNumber(
            ml.failed,
          )} apontamento(s) não puderam ser analisados pelo Modelo ML. A importação foi preservada.`,
        );
      }

      setStatus(
        "completed",
      );

      await loadImports();
    } catch (
      requestError
    ) {
      console.error(
        "Erro durante processamento da importação:",
        requestError,
      );

      setError(
        "A conexão foi interrompida durante o processamento.",
      );

      setStatus(
        "error",
      );
    }
  }

  /* =======================================================
     INPUT
  ======================================================= */

  function handleFileChange(
    event:
      ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile =
      event.target
        .files?.[0];

    if (!selectedFile) {
      return;
    }

    void validateFile(
      selectedFile,
    );
  }

  /* =======================================================
     DRAG AND DROP
  ======================================================= */

  function handleDragOver(
    event:
      DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setDragging(
      true,
    );
  }

  function handleDragLeave(
    event:
      DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setDragging(
      false,
    );
  }

  function handleDrop(
    event:
      DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setDragging(
      false,
    );

    const selectedFile =
      event
        .dataTransfer
        .files?.[0];

    if (!selectedFile) {
      return;
    }

    void validateFile(
      selectedFile,
    );
  }

  /* =======================================================
     DETALHE
  ======================================================= */

  const loadImportDetail =
    useCallback(
      async (
        importId:
          number,
      ) => {
        setSelectedImportId(
          importId,
        );

        setSelectedImport(
          null,
        );

        setDetailLoading(
          true,
        );

        setDetailError(
          "",
        );

        setDeleteConfirm(
          false,
        );

        setActionMessage(
          "",
        );

        try {
          const response =
            await fetch(
              `/api/imports/${importId}`,
              {
                cache:
                  "no-store",
              },
            );

          const data =
            (
              await response.json()
            ) as ImportDetailResponse;

          if (
            !response.ok ||
            !data.success ||
            !data.item
          ) {
            throw new Error(
              data.message ??
                "Não foi possível carregar a importação.",
            );
          }

          setSelectedImport(
            data.item,
          );
        } catch (
          requestError
        ) {
          setDetailError(
            requestError instanceof
              Error
              ? requestError.message
              : "Não foi possível carregar a importação.",
          );
        } finally {
          setDetailLoading(
            false,
          );
        }
      },
      [],
    );

  function closeDetail() {
    if (
      deleting ||
      classifyingId
    ) {
      return;
    }

    setSelectedImportId(
      null,
    );

    setSelectedImport(
      null,
    );

    setDetailError(
      "",
    );

    setDeleteConfirm(
      false,
    );

    setActionMessage(
      "",
    );
  }

  /* =======================================================
     RECLASSIFICAR
  ======================================================= */

  async function classifyImport(
    importId:
      number,
  ) {
    if (
      classifyingId !==
      null
    ) {
      return;
    }

    setClassifyingId(
      importId,
    );

    setActionMessage(
      "",
    );

    setDetailError(
      "",
    );

    try {
      const response =
        await fetch(
          "/api/imports/classify",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                importId,
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
            "Não foi possível classificar novamente a importação.",
        );
      }

      const ai =
        data.ai as
          | ClassifyResult
          | undefined;

      if (ai) {
        setActionMessage(
          `${formatNumber(
            ai.eventsClassifiedThisRun,
          )} nova(s) classificação(ões) processada(s). ${formatNumber(
            ai.pendingEvents,
          )} ocorrência(s) permanecem pendentes.`,
        );
      } else {
        setActionMessage(
          "Classificação executada com sucesso.",
        );
      }

      await Promise.all([
        loadImports(),

        loadImportDetail(
          importId,
        ),
      ]);
    } catch (
      requestError
    ) {
      setDetailError(
        requestError instanceof
          Error
          ? requestError.message
          : "Não foi possível executar a classificação.",
      );
    } finally {
      setClassifyingId(
        null,
      );
    }
  }

  /* =======================================================
     EXCLUIR
  ======================================================= */

  async function deleteImport() {
    if (
      !selectedImport ||
      deleting
    ) {
      return;
    }

    setDeleting(
      true,
    );

    setDetailError(
      "",
    );

    try {
      const response =
        await fetch(
          `/api/imports/${selectedImport.id}`,
          {
            method:
              "DELETE",
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
            "Não foi possível excluir a importação.",
        );
      }

      setSelectedImportId(
        null,
      );

      setSelectedImport(
        null,
      );

      setDeleteConfirm(
        false,
      );

      setActionMessage(
        "",
      );

      if (
        imports.length ===
          1 &&
        page >
          1
      ) {
        setPage(
          (
            current,
          ) =>
            Math.max(
              1,
              current -
                1,
            ),
        );
      } else {
        await loadImports();
      }
    } catch (
      requestError
    ) {
      setDetailError(
        requestError instanceof
          Error
          ? requestError.message
          : "Não foi possível excluir a importação.",
      );
    } finally {
      setDeleting(
        false,
      );
    }
  }

  /* =======================================================
     PERCENTUAL GLOBAL DE CLASSIFICAÇÃO
  ======================================================= */

  const globalClassificationRate =
    useMemo(
      () => {
        if (
          importsSummary.events <=
          0
        ) {
          return 0;
        }

        return (
          importsSummary
            .classifiedEvents /
          importsSummary.events
        ) *
          100;
      },
      [
        importsSummary,
      ],
    );

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="min-h-screen bg-background-primary">
      {/* ===================================================
          HEADER
      ==================================================== */}

      <AppHeader userName={user.name} unitName={unit.name} />

      {/* ===================================================
          CONTEÚDO
      ==================================================== */}

      <section className="mx-auto w-full max-w-[1380px] px-6 pb-20 pt-7 sm:px-8 lg:px-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-[10px] border border-accent-primary bg-accent-primary px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:border-accent-primary hover:bg-accent-hover"
        >
          <ArrowLeft
            size={15}
          />

          Voltar
        </Link>

        {/* =================================================
            CABEÇALHO
        ================================================== */}

        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              Dados e modelo
            </p>

            <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.045em] text-text-primary sm:text-[40px]">
              Importações
            </h1>

            <p className="mt-2 max-w-[620px] text-[12px] leading-6 text-text-secondary">
              Importe apontamentos, acompanhe a classificação do modelo e gerencie os dados disponíveis no sistema.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setUploadExpanded(
                (
                  current,
                ) =>
                  !current,
              );

              if (
                !uploadExpanded
              ) {
                clearFile();
              }
            }}
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-[11px] bg-accent-primary px-4 text-[10px] font-semibold text-white transition hover:bg-accent-hover sm:self-auto"
          >
            <Upload
              size={14}
            />

            {uploadExpanded
              ? "Fechar importação"
              : "Nova importação"}
          </button>
        </div>

        {/* =================================================
            NOVA IMPORTAÇÃO
        ================================================== */}

        {uploadExpanded && (
          <section className="mt-6 overflow-hidden rounded-[24px] border border-border-theme bg-surface shadow-[0_12px_38px_rgba(28,31,34,0.025)]">
            <div className="border-b border-border-theme px-5 py-4 sm:px-6">
              <h2 className="text-[14px] font-semibold tracking-[-0.025em] text-text-primary">
                Nova importação
              </h2>

              <p className="mt-1 text-[9px] text-text-muted">
                Preview, processamento e análise ML no mesmo fluxo.
              </p>
            </div>

            <div className="px-5 py-5 sm:px-6">
              {!file && (
                <div
                  role="button"
                  tabIndex={0}
                  onDragOver={
                    handleDragOver
                  }
                  onDragLeave={
                    handleDragLeave
                  }
                  onDrop={
                    handleDrop
                  }
                  onClick={() =>
                    inputRef
                      .current
                      ?.click()
                  }
                  onKeyDown={(
                    event,
                  ) => {
                    if (
                      event.key ===
                        "Enter" ||
                      event.key ===
                        " "
                    ) {
                      inputRef
                        .current
                        ?.click();
                    }
                  }}
                  className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed px-8 text-center outline-none transition ${
                    dragging
                      ? "border-accent-primary bg-accent-soft"
                      : "border-border-theme bg-background-primary hover:border-text-muted"
                  }`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-surface text-text-body shadow-sm">
                    <Upload
                      size={19}
                    />
                  </div>

                  <p className="mt-5 text-[13px] font-semibold text-text-primary">
                    Arraste a planilha aqui
                  </p>

                  <p className="mt-1 text-[10px] text-text-secondary">
                    ou clique para selecionar
                  </p>

                  <p className="mt-4 text-[9px] text-text-muted">
                    .xlsx ou .xlsm
                  </p>
                </div>
              )}

              <input
                ref={
                  inputRef
                }
                type="file"
                accept=".xlsx,.xlsm"
                onChange={
                  handleFileChange
                }
                className="hidden"
              />

              {file && (
                <>
                  <div className="flex items-center justify-between rounded-[15px] border border-border-theme bg-background-primary px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-surface text-text-body">
                        <FileSpreadsheet
                          size={17}
                        />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-text-primary">
                          {file.name}
                        </p>

                        <p className="mt-0.5 text-[8px] text-text-muted">
                          {formatFileSize(
                            file.size,
                          )}
                        </p>
                      </div>
                    </div>

                    {![
                      "validating",
                      "processing",
                    ].includes(
                      status,
                    ) && (
                      <button
                        type="button"
                        onClick={
                          clearFile
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-secondary transition hover:bg-surface hover:text-text-primary"
                      >
                        <X
                          size={15}
                        />
                      </button>
                    )}
                  </div>

                  {status ===
                    "validating" && (
                    <div className="flex min-h-[150px] items-center justify-center gap-3">
                      <LoaderCircle
                        size={18}
                        className="animate-spin text-accent-primary"
                      />

                      <p className="text-[11px] text-text-secondary">
                        Verificando estrutura da planilha...
                      </p>
                    </div>
                  )}

                  {status ===
                    "ready" &&
                    preview && (
                      <div className="mt-5">
                        <div className="flex items-start gap-3">
                          <Check
                            size={17}
                            className="mt-0.5 text-success"
                          />

                          <div>
                            <p className="text-[12px] font-semibold text-text-primary">
                              Planilha pronta para processamento
                            </p>

                            <p className="mt-1 text-[9px] text-text-secondary">
                              A estrutura necessária foi identificada corretamente.
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 grid overflow-hidden rounded-[14px] border border-border-theme sm:grid-cols-3 sm:divide-x sm:divide-border-theme">
                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                              Registros
                            </p>

                            <p className="mt-1 text-[17px] font-semibold text-text-primary">
                              {formatNumber(
                                preview.totalRows,
                              )}
                            </p>
                          </div>

                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                              Aba
                            </p>

                            <p className="mt-1 truncate text-[12px] font-semibold text-text-primary">
                              {preview.sheetName}
                            </p>
                          </div>

                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                              Colunas
                            </p>

                            <p className="mt-1 text-[17px] font-semibold text-text-primary">
                              {preview.expectedColumns.length}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              void processFile()
                            }
                            className="h-10 rounded-[10px] bg-accent-primary px-5 text-[10px] font-semibold text-white transition hover:bg-accent-hover"
                          >
                            Processar dados
                          </button>
                        </div>
                      </div>
                    )}

                  {status ===
                    "processing" && (
                    <div className="py-8">
                      <div className="flex items-start gap-3">
                        <LoaderCircle
                          size={18}
                          className="mt-0.5 animate-spin text-accent-primary"
                        />

                        <div>
                          <p className="text-[12px] font-semibold text-text-primary">
                            Importando e analisando dados
                          </p>

                          <p className="mt-1 text-[9px] leading-5 text-text-secondary">
                            Os registros estão sendo armazenados e enviados ao modelo de classificação.
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 overflow-hidden rounded-full bg-surface-elevated">
                        <div className="h-[4px] w-1/2 animate-pulse rounded-full bg-accent-primary" />
                      </div>
                    </div>
                  )}

                  {status ===
                    "completed" &&
                    result && (
                      <div className="mt-5">
                        <div className="flex items-start gap-3">
                          <Check
                            size={18}
                            className="mt-0.5 text-success"
                          />

                          <div>
                            <p className="text-[12px] font-semibold text-text-primary">
                              Importação concluída
                            </p>

                            <p className="mt-1 text-[9px] text-text-secondary">
                              {mlCompleted
                                ? "Os dados foram armazenados e o modelo concluiu a análise."
                                : "Os dados foram armazenados com sucesso."}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 grid overflow-hidden rounded-[14px] border border-border-theme sm:grid-cols-3 sm:divide-x sm:divide-border-theme">
                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                              Importados
                            </p>

                            <p className="mt-1 text-[18px] font-semibold text-text-primary">
                              {formatNumber(
                                importedCount,
                              )}
                            </p>

                            {duplicateCount > 0 && (
                              <p className="mt-1 text-[10px] text-text-secondary">
                                {formatNumber(duplicateCount)} j{String.fromCharCode(225)} importado(s) antes
                              </p>
                            )}
                            {ignoredCount >
                              0 && (
                              <p className="mt-1 text-[8px] text-text-muted">
                                {formatNumber(
                                  ignoredCount,
                                )}{" "}
                                ignorados
                              </p>
                            )}
                          </div>

                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                              Analisados pelo ML
                            </p>

                            <p className="mt-1 text-[18px] font-semibold text-text-primary">
                              {formatNumber(
                                mlProcessedCount,
                              )}
                            </p>

                            {mlAvailable && (
                              <p className="mt-1 text-[8px] text-text-muted">
                                de{" "}
                                {formatNumber(
                                  mlEligibleCount,
                                )}{" "}
                                elegíveis
                              </p>
                            )}
                          </div>

                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                              Sugestões
                            </p>

                            <p className="mt-1 text-[18px] font-semibold text-text-primary">
                              {formatNumber(
                                suggestionsCount,
                              )}
                            </p>
                          </div>
                        </div>

                        {mlResult && (
                          <div className="mt-4 flex flex-col gap-2 rounded-[12px] bg-background-primary px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                                Modelo
                              </p>

                              <p className="mt-1 text-[10px] font-semibold text-text-primary">
                                {mlResult.modelVersion ??
                                  "Indisponível"}
                              </p>
                            </div>

                            <p className="text-[9px] font-medium text-text-secondary">
                              {mlCompleted
                                ? "Concluído"
                                : mlResult.status ===
                                    "PARTIAL"
                                  ? "Concluído parcialmente"
                                  : "Indisponível"}
                            </p>
                          </div>
                        )}

                        {mlFailedCount >
                          0 && (
                          <p className="mt-3 text-[9px] text-text-muted">
                            {formatNumber(
                              mlFailedCount,
                            )}{" "}
                            ocorrência(s) apresentaram erro na análise.
                          </p>
                        )}

                        {warning && (
                          <div className="mt-4 flex items-start gap-3 rounded-[12px] border border-accent-primary/30 bg-accent-soft px-4 py-3">
                            <AlertCircle
                              size={15}
                              className="mt-0.5 shrink-0 text-accent-primary"
                            />

                            <p className="text-[9px] leading-5 text-text-secondary">
                              {warning}
                            </p>
                          </div>
                        )}

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={
                              clearFile
                            }
                            className="text-[9px] font-semibold text-text-secondary hover:text-text-primary"
                          >
                            Importar outro arquivo
                          </button>

                          <div className="flex gap-2">
                            <Link
                              href="/dashboard/historico"
                              className="rounded-[9px] border border-border-theme bg-surface px-4 py-2.5 text-[9px] font-semibold text-text-body hover:bg-background-primary"
                            >
                              Ver histórico
                            </Link>

                            {suggestionsCount >
                              0 && (
                              <Link
                                href="/dashboard/revisao"
                                className="rounded-[9px] bg-surface-inverse px-4 py-2.5 text-[9px] font-semibold text-white hover:bg-surface-inverse-hover"
                              >
                                Revisar classificações
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                  {status ===
                    "invalid" &&
                    preview && (
                      <div className="mt-5 flex items-start gap-3 rounded-[13px] border border-accent-primary/30 bg-accent-soft px-4 py-4">
                        <AlertCircle
                          size={17}
                          className="mt-0.5 shrink-0 text-accent-primary"
                        />

                        <div>
                          <p className="text-[11px] font-semibold text-text-primary">
                            Estrutura incompatível
                          </p>

                          <p className="mt-1 text-[9px] leading-5 text-text-secondary">
                            A planilha não contém todas as colunas necessárias.
                          </p>

                          {preview.missingColumns.length >
                            0 && (
                            <p className="mt-2 text-[9px] leading-5 text-text-muted">
                              Ausentes:{" "}
                              {preview.missingColumns.join(
                                ", ",
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                  {status ===
                    "error" && (
                    <div className="mt-5 flex items-start gap-3 rounded-[13px] border border-accent-primary/30 bg-accent-soft px-4 py-4">
                      <AlertCircle
                        size={17}
                        className="mt-0.5 shrink-0 text-accent-primary"
                      />

                      <div>
                        <p className="text-[11px] font-semibold text-text-primary">
                          Não foi possível concluir
                        </p>

                        <p className="mt-1 text-[9px] leading-5 text-text-secondary">
                          {error}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* =================================================
            RESUMO
        ================================================== */}

        <section className="mt-6 grid overflow-hidden rounded-[20px] border border-border-theme bg-surface shadow-[0_8px_30px_rgba(28,31,34,0.02)] sm:grid-cols-4 sm:divide-x sm:divide-border-theme">
          <div className="px-5 py-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-text-muted">
              Importações
            </p>

            <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-text-primary">
              {formatNumber(
                importsSummary.imports,
              )}
            </p>
          </div>

          <div className="px-5 py-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-text-muted">
              Eventos
            </p>

            <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-text-primary">
              {formatNumber(
                importsSummary.events,
              )}
            </p>
          </div>

          <div className="px-5 py-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-text-muted">
              Classificados
            </p>

            <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-text-primary">
              {formatNumber(
                importsSummary.classifiedEvents,
              )}
            </p>
          </div>

          <div className="px-5 py-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-text-muted">
              Cobertura
            </p>

            <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-accent-primary">
              {formatNumber(
                globalClassificationRate,
                1,
              )}
              %
            </p>
          </div>
        </section>

        {/* =================================================
            HISTÓRICO
        ================================================== */}

        <section className="mt-5 overflow-hidden rounded-[24px] border border-border-theme bg-surface shadow-[0_12px_38px_rgba(28,31,34,0.025)]">
          <div className="flex flex-col gap-4 border-b border-border-theme px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <History
                size={15}
                className="text-text-secondary"
              />

              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.025em] text-text-primary">
                  Histórico de importações
                </h2>

                <p className="mt-0.5 text-[8px] text-text-muted">
                  {formatNumber(
                    totalImports,
                  )}{" "}
                  importações encontradas
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />

                <input
                  value={
                    search
                  }
                  onChange={(
                    event,
                  ) =>
                    setSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Buscar arquivo"
                  className="h-9 w-full rounded-[9px] border border-border-theme bg-background-primary pl-8 pr-3 text-[9px] text-text-primary outline-none focus:border-accent-primary/30 sm:w-[210px]"
                />
              </label>

              <select
                value={
                  statusFilter
                }
                onChange={(
                  event,
                ) => {
                  setStatusFilter(
                    event.target.value,
                  );

                  setPage(
                    1,
                  );
                }}
                className="h-9 rounded-[9px] border border-border-theme bg-background-primary px-3 text-[9px] text-text-body outline-none focus:border-accent-primary/30"
              >
                <option value="">
                  Todos os status
                </option>

                {statusOptions.map(
                  (
                    item,
                  ) => (
                    <option
                      key={
                        item
                      }
                      value={
                        item
                      }
                    >
                      {statusLabel(
                        item,
                      )}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          {importsError && (
            <div className="m-5 rounded-[12px] border border-accent-primary/30 bg-accent-soft px-4 py-3 text-[10px] text-accent-primary">
              {importsError}
            </div>
          )}

          {importsLoading &&
          imports.length ===
            0 ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <LoaderCircle
                size={20}
                className="animate-spin text-accent-primary"
              />
            </div>
          ) : imports.length ===
            0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
              <FileSpreadsheet
                size={24}
                className="text-text-muted"
              />

              <p className="mt-3 text-[11px] font-semibold text-text-body">
                Nenhuma importação encontrada
              </p>

              <p className="mt-1 text-[9px] text-text-muted">
                Importe uma planilha ou altere os filtros da busca.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse">
                  <thead>
                    <tr className="border-b border-border-theme bg-background-primary text-left">
                      <th className="px-5 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-text-muted sm:px-6">
                        Arquivo
                      </th>

                      <th className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                        Status
                      </th>

                      <th className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                        Eventos
                      </th>

                      <th className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                        Classificação
                      </th>

                      <th className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                        Unidade
                      </th>

                      <th className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                        Importado em
                      </th>

                      <th className="px-5 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-text-muted sm:px-6">
                        Ações
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {imports.map(
                      (
                        item,
                      ) => (
                        <tr
                          key={
                            item.id
                          }
                          className="border-b border-border-theme last:border-b-0 hover:bg-background-primary"
                        >
                          <td className="px-5 py-4 sm:px-6">
                            <button
                              type="button"
                              onClick={() =>
                                void loadImportDetail(
                                  item.id,
                                )
                              }
                              className="max-w-[280px] text-left"
                            >
                              <p className="truncate text-[10px] font-semibold text-text-primary hover:text-accent-hover">
                                {item.originalFileName ||
                                  item.fileName}
                              </p>

                              <p className="mt-1 text-[8px] text-text-muted">
                                Importação #
                                {item.id}
                              </p>
                            </button>
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-[8px] font-semibold ${statusClasses(
                                item.status,
                              )}`}
                            >
                              {statusLabel(
                                item.status,
                              )}
                            </span>
                          </td>

                          <td className="px-4 py-4 text-[10px] font-semibold tabular-nums text-text-body">
                            {formatNumber(
                              item.events,
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <p className="text-[10px] font-semibold tabular-nums text-text-body">
                              {formatNumber(
                                item.classificationCoverage,
                                1,
                              )}
                              %
                            </p>

                            <p className="mt-1 text-[8px] text-text-muted">
                              {formatNumber(
                                item.classifiedEvents,
                              )}{" "}
                              classificadas
                            </p>
                          </td>

                          <td className="max-w-[180px] px-4 py-4">
                            <p className="truncate text-[9px] text-text-body">
                              {item.unitsLabel ||
                                "—"}
                            </p>
                          </td>

                          <td className="px-4 py-4 text-[9px] text-text-secondary">
                            {formatDateTime(
                              item.importedAt ||
                                item.createdAt,
                            )}
                          </td>

                          <td className="px-5 py-4 text-right sm:px-6">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  void loadImportDetail(
                                    item.id,
                                  )
                                }
                                className="flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[8px] font-semibold text-text-body transition hover:bg-surface-elevated hover:text-text-primary"
                              >
                                <MoreHorizontal
                                  size={13}
                                />

                                Detalhes
                              </button>
                            </div>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-border-theme px-5 py-3.5 sm:px-6">
                <p className="text-[8px] text-text-muted">
                  Página{" "}
                  {page} de{" "}
                  {totalPages}
                </p>

                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={
                      page <=
                        1 ||
                      importsLoading
                    }
                    onClick={() =>
                      setPage(
                        (
                          current,
                        ) =>
                          Math.max(
                            1,
                            current -
                              1,
                          ),
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-theme text-text-secondary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft
                      size={14}
                    />
                  </button>

                  <button
                    type="button"
                    disabled={
                      page >=
                        totalPages ||
                      importsLoading
                    }
                    onClick={() =>
                      setPage(
                        (
                          current,
                        ) =>
                          Math.min(
                            totalPages,
                            current +
                              1,
                          ),
                      )
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border-theme text-text-secondary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronRight
                      size={14}
                    />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </section>

      {/* ===================================================
          DRAWER / DETALHE
      ==================================================== */}

      {selectedImportId !==
        null && (
        <div className="fixed inset-0 z-[120]">
          <button
            type="button"
            aria-label="Fechar detalhes"
            onClick={
              closeDetail
            }
            className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
          />

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col bg-surface shadow-[-20px_0_60px_rgba(20,22,25,0.12)]">
            <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-border-theme px-5 sm:px-6">
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                  Importação
                </p>

                <p className="mt-1 text-[13px] font-semibold text-text-primary">
                  #{selectedImportId}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeDetail
                }
                className="flex h-9 w-9 items-center justify-center rounded-[9px] text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
              >
                <X
                  size={16}
                />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {detailLoading && (
                <div className="flex min-h-[300px] items-center justify-center">
                  <LoaderCircle
                    size={21}
                    className="animate-spin text-accent-primary"
                  />
                </div>
              )}

              {detailError && (
                <div className="mb-5 rounded-[12px] border border-accent-primary/30 bg-accent-soft px-4 py-3 text-[9px] leading-5 text-accent-primary">
                  {detailError}
                </div>
              )}

              {actionMessage && (
                <div className="mb-5 rounded-[12px] border border-success/30 bg-background-primary px-4 py-3 text-[9px] leading-5 text-success">
                  {actionMessage}
                </div>
              )}

              {selectedImport &&
                !detailLoading && (
                  <>
                    <div>
                      <h2 className="break-words text-[18px] font-semibold tracking-[-0.035em] text-text-primary">
                        {selectedImport.originalFileName ||
                          selectedImport.fileName}
                      </h2>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[8px] font-semibold ${statusClasses(
                            selectedImport.status,
                          )}`}
                        >
                          {statusLabel(
                            selectedImport.status,
                          )}
                        </span>

                        <span className="text-[8px] text-text-muted">
                          {formatDateTime(
                            selectedImport.importedAt ||
                              selectedImport.createdAt,
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-[16px] border border-border-theme sm:grid-cols-3">
                      <div className="border-b border-r border-border-theme px-4 py-4">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                          Linhas
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-text-primary">
                          {formatNumber(
                            selectedImport.totalRows,
                          )}
                        </p>
                      </div>

                      <div className="border-b border-border-theme px-4 py-4 sm:border-r">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                          Processadas
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-text-primary">
                          {formatNumber(
                            selectedImport.processedRows,
                          )}
                        </p>
                      </div>

                      <div className="border-b border-r border-border-theme px-4 py-4 sm:border-r-0">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                          Erros
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-text-primary">
                          {formatNumber(
                            selectedImport.errorRows,
                          )}
                        </p>
                      </div>

                      <div className="border-r border-border-theme px-4 py-4">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                          Eventos
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-text-primary">
                          {formatNumber(
                            selectedImport.impact.events,
                          )}
                        </p>
                      </div>

                      <div className="border-r border-border-theme px-4 py-4">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                          Classificados
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-text-primary">
                          {formatNumber(
                            selectedImport.classification.classifiedEvents,
                          )}
                        </p>
                      </div>

                      <div className="px-4 py-4">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-text-muted">
                          Cobertura
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-accent-primary">
                          {formatNumber(
                            selectedImport.classification.coverage,
                            1,
                          )}
                          %
                        </p>
                      </div>
                    </div>

                    <div className="mt-6">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                        Unidades
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedImport.units.map(
                          (
                            currentUnit,
                          ) => (
                            <span
                              key={
                                currentUnit.id
                              }
                              className="rounded-[8px] bg-surface-elevated px-2.5 py-1.5 text-[8px] font-medium text-text-body"
                            >
                              {currentUnit.name ||
                                currentUnit.code ||
                                `Unidade ${currentUnit.id}`}
                              {" · "}
                              {formatNumber(
                                currentUnit.events,
                              )}{" "}
                              eventos
                            </span>
                          ),
                        )}
                      </div>
                    </div>

                    <div className="mt-6">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                        Modelo
                      </p>

                      <p className="mt-2 text-[10px] font-semibold text-text-primary">
                        {selectedImport.classification.modelVersions.length >
                        0
                          ? selectedImport.classification.modelVersions.join(
                              " · ",
                            )
                          : "Nenhuma versão registrada"}
                      </p>

                      <p className="mt-1 text-[8px] text-text-muted">
                        {formatNumber(
                          selectedImport.classification.pendingEvents,
                        )}{" "}
                        ocorrência(s) pendentes
                      </p>
                    </div>

                    <div className="mt-6">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-text-muted">
                        Impacto dos dados
                      </p>

                      <div className="mt-3 divide-y divide-border-theme rounded-[14px] border border-border-theme">
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-text-secondary">
                            Eventos
                          </span>

                          <span className="text-[9px] font-semibold text-text-primary">
                            {formatNumber(
                              selectedImport.impact.events,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-text-secondary">
                            Tempo de parada
                          </span>

                          <span className="text-[9px] font-semibold text-text-primary">
                            {formatMinutes(
                              selectedImport.impact.downtimeMinutes,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-text-secondary">
                            Sugestões ML
                          </span>

                          <span className="text-[9px] font-semibold text-text-primary">
                            {formatNumber(
                              selectedImport.impact.classificationSuggestions,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-text-secondary">
                            Classificações oficiais
                          </span>

                          <span className="text-[9px] font-semibold text-text-primary">
                            {formatNumber(
                              selectedImport.impact.eventClassifications,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-text-secondary">
                            Revisões de origem
                          </span>

                          <span className="text-[9px] font-semibold text-text-primary">
                            {formatNumber(
                              selectedImport.impact.originReviews,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-text-secondary">
                            Vínculos com MASP
                          </span>

                          <span className="text-[9px] font-semibold text-text-primary">
                            {formatNumber(
                              selectedImport.impact.maspEventLinks,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectedImport.errorMessage && (
                      <div className="mt-5 rounded-[12px] border border-accent-primary/30 bg-accent-soft px-4 py-3">
                        <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-accent-primary">
                          Erro registrado
                        </p>

                        <p className="mt-2 text-[9px] leading-5 text-text-secondary">
                          {selectedImport.errorMessage}
                        </p>
                      </div>
                    )}

                    {deleteConfirm && (
                      <div className="mt-6 rounded-[15px] border border-accent-primary/30 bg-accent-soft px-4 py-4">
                        <p className="text-[11px] font-semibold text-accent-primary">
                          Excluir esta importação?
                        </p>

                        <p className="mt-2 text-[9px] leading-5 text-text-secondary">
                          Serão removidos{" "}
                          <strong className="font-semibold text-text-body">
                            {formatNumber(
                              selectedImport.impact.events,
                            )}{" "}
                            eventos
                          </strong>
                          , suas classificações, sugestões e revisões relacionadas.
                        </p>

                        {selectedImport.impact.maspEventLinks >
                          0 && (
                          <p className="mt-2 text-[9px] leading-5 text-text-secondary">
                            {formatNumber(
                              selectedImport.impact.maspEventLinks,
                            )}{" "}
                            vínculo(s) com MASP serão removidos. As análises MASP permanecerão existentes.
                          </p>
                        )}

                        <p className="mt-2 text-[9px] font-semibold text-accent-primary">
                          Esta ação não pode ser desfeita.
                        </p>

                        <div className="mt-4 flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={
                              deleting
                            }
                            onClick={() =>
                              setDeleteConfirm(
                                false,
                              )
                            }
                            className="h-9 rounded-[9px] border border-border-theme bg-surface px-4 text-[9px] font-semibold text-text-body"
                          >
                            Cancelar
                          </button>

                          <button
                            type="button"
                            disabled={
                              deleting
                            }
                            onClick={() =>
                              void deleteImport()
                            }
                            className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-accent-hover px-4 text-[9px] font-semibold text-white disabled:opacity-50"
                          >
                            {deleting ? (
                              <LoaderCircle
                                size={12}
                                className="animate-spin"
                              />
                            ) : (
                              <Trash2
                                size={12}
                              />
                            )}

                            Excluir definitivamente
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
            </div>

            {selectedImport &&
              !detailLoading && (
                <div className="shrink-0 border-t border-border-theme bg-surface px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      disabled={
                        deleting ||
                        classifyingId !==
                          null
                      }
                      onClick={() =>
                        setDeleteConfirm(
                          true,
                        )
                      }
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] border border-accent-primary/30 px-4 text-[9px] font-semibold text-accent-primary transition hover:bg-accent-soft disabled:opacity-40"
                    >
                      <Trash2
                        size={13}
                      />

                      Excluir importação
                    </button>

                    <button
                      type="button"
                      disabled={
                        deleting ||
                        classifyingId !==
                          null
                      }
                      onClick={() =>
                        void classifyImport(
                          selectedImport.id,
                        )
                      }
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-surface-inverse px-4 text-[9px] font-semibold text-white transition hover:bg-surface-inverse-hover disabled:opacity-40"
                    >
                      {classifyingId ===
                      selectedImport.id ? (
                        <LoaderCircle
                          size={13}
                          className="animate-spin"
                        />
                      ) : (
                        <RefreshCcw
                          size={13}
                        />
                      )}

                      Classificar novamente
                    </button>
                  </div>
                </div>
              )}
          </aside>
        </div>
      )}
    </main>
  );
}