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
    city: string | null;
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
    return "bg-[#FFF1F2] text-[#B4232C]";
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
    return "bg-[#FFF8E6] text-[#8B6B16]";
  }

  return "bg-[#EEF7F1] text-[#3E6650]";
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

      void loadImports(
        controller.signal,
      );

      return () => {
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD

        setDetailError(
          "",
        );

<<<<<<< HEAD
  const duplicateCount =
    result?.skippedDuplicateRows ??
    0;
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques

        setDetailError(
          "",
        );

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  const mlEligibleCount =
    mlResult?.eligible ??
    0;
=======
        setDeleteConfirm(
          false,
        );
>>>>>>> origin/marques
=======
        setDeleteConfirm(
          false,
        );
>>>>>>> origin/marques
=======
        setDeleteConfirm(
          false,
        );
>>>>>>> origin/marques
=======
        setDeleteConfirm(
          false,
        );
>>>>>>> origin/marques

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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
    <main className="min-h-screen bg-background-primary transition-colors">

=======
    <main className="min-h-screen bg-[#F7F7F6]">
>>>>>>> origin/marques
=======
    <main className="min-h-screen bg-[#F7F7F6]">
>>>>>>> origin/marques
=======
    <main className="min-h-screen bg-[#F7F7F6]">
>>>>>>> origin/marques
=======
    <main className="min-h-screen bg-[#F7F7F6]">
>>>>>>> origin/marques
      {/* ===================================================
          HEADER
      ==================================================== */}

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
      <AppHeader userName={user.name} city={unit.city} />
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
      <header className="border-b border-black/[0.05] bg-white">
        <div className="mx-auto flex h-[76px] w-full max-w-[1380px] items-center justify-between px-6 sm:px-8 lg:px-12">
          <Link
            href="/dashboard"
          >
            <Image
              src="/logo.webp"
              alt="Coca-Cola FEMSA"
              width={180}
              height={64}
              priority
              className="h-auto max-h-[42px] w-auto object-contain"
            />
          </Link>

          <div className="hidden text-right sm:block">
            <p className="text-[13px] font-medium text-[#25272A]">
              {user.name}
            </p>

            {unit.city && (
              <p className="mt-0.5 text-[10px] text-[#999DA2]">
                {unit.city}
              </p>
            )}
          </div>
        </div>
      </header>
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques

      {/* ===================================================
          CONTEÚDO
      ==================================================== */}

      <section className="mx-auto w-full max-w-[1380px] px-6 pb-20 pt-7 sm:px-8 lg:px-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-[10px] border border-[#F40009] bg-[#F40009] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:border-[#B90007] hover:bg-[#B90007]"
        >
          <ArrowLeft
            size={15}
          />

          Voltar
        </Link>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD

        <div className="mt-10">

          <h1 className="text-text-title">
            Importar dados
          </h1>


          <p className="mt-4 text-[14px] leading-6 text-text-body">
            Importe os apontamentos de manutenção.
            Após o armazenamento, o Modelo ML analisa
            automaticamente as ocorrências e prepara as
            sugestões para revisão humana.
          </p>

        </div>


=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
        {/* =================================================
            CABEÇALHO
        ================================================== */}

        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A2A6AB]">
              Dados e modelo
            </p>

            <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.045em] text-[#191B1E] sm:text-[40px]">
              Importações
            </h1>

            <p className="mt-2 max-w-[620px] text-[12px] leading-6 text-[#858A90]">
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            className={`mt-10 flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed px-8 text-center outline-none transition-all duration-200 ${
              dragging
                ? "border-[#F40009] bg-surface-elevated"
                : "border-border-theme bg-surface-elevated hover:border-border-theme"
            }`}
=======
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-[11px] bg-[#E41E2B] px-4 text-[10px] font-semibold text-white transition hover:bg-[#C91824] sm:self-auto"
>>>>>>> origin/marques
=======
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-[11px] bg-[#E41E2B] px-4 text-[10px] font-semibold text-white transition hover:bg-[#C91824] sm:self-auto"
>>>>>>> origin/marques
=======
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-[11px] bg-[#E41E2B] px-4 text-[10px] font-semibold text-white transition hover:bg-[#C91824] sm:self-auto"
>>>>>>> origin/marques
=======
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-[11px] bg-[#E41E2B] px-4 text-[10px] font-semibold text-white transition hover:bg-[#C91824] sm:self-auto"
>>>>>>> origin/marques
          >
            <Upload
              size={14}
            />

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-background-primary transition-colors text-text-primary shadow-[0_2px_10px_rgba(0,0,0,0.05)]">

              <Upload
                size={21}
                strokeWidth={1.8}
              />

            </div>


            <h2 className="mt-6 text-[16px] font-semibold text-text-primary">
              Arraste a planilha aqui
            </h2>


            <p className="mt-4 text-[14px] leading-6 text-text-body">
              ou clique para selecionar
            </p>


            <p className="mt-5 text-[11px] text-text-secondary">
              .xlsx ou .xlsm
            </p>

          </div>
        )}


        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm"
          onChange={
            handleFileChange
          }
          className="hidden"
        />

=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
            {uploadExpanded
              ? "Fechar importação"
              : "Nova importação"}
          </button>
        </div>
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques

        {/* =================================================
            NOVA IMPORTAÇÃO
        ================================================== */}

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
        {file && (
          <div className="mt-10">

            <div className="flex items-center justify-between rounded-[16px] border border-border-theme px-5 py-4">

              <div className="flex min-w-0 items-center gap-4">

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-text-primary">

                  <FileSpreadsheet
                    size={20}
                    strokeWidth={1.8}
                  />

                </div>


                <div className="min-w-0">

                  <p className="truncate text-[13px] font-medium text-text-primary">
                    {file.name}
                  </p>


                  <p className="mt-1 text-[11px] text-text-body">
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
                  className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                  aria-label="Remover arquivo"
                >
                  <X
                    size={17}
                    strokeWidth={1.8}
                  />
                </button>
              )}
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
        {uploadExpanded && (
          <section className="mt-6 overflow-hidden rounded-[24px] border border-black/[0.05] bg-white shadow-[0_12px_38px_rgba(28,31,34,0.025)]">
            <div className="border-b border-black/[0.05] px-5 py-4 sm:px-6">
              <h2 className="text-[14px] font-semibold tracking-[-0.025em] text-[#202327]">
                Nova importação
              </h2>
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques

              <p className="mt-1 text-[9px] text-[#9A9FA5]">
                Preview, processamento e análise ML no mesmo fluxo.
              </p>
            </div>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD

            {/* =============================================
                VALIDANDO
            ============================================== */}

            {status ===
              "validating" && (
              <div className="flex items-center gap-3 py-8">

                <LoaderCircle
                  size={18}
                  className="animate-spin text-[#F40009]"
                />


                <p className="text-[13px] text-text-secondary">
                  Verificando estrutura da planilha...
                </p>

              </div>
            )}


            {/* =============================================
                PRONTA
            ============================================== */}

            {status ===
              "ready" &&
              preview && (
                <div className="mt-8">

                  <div className="flex items-start gap-3">

                    <Check
                      size={18}
                      strokeWidth={2}
                      className="mt-0.5 text-[#238636]"
                    />


                    <div>

                      <p className="text-[14px] font-medium text-text-primary">
                        Planilha pronta para processamento
                      </p>


                      <p className="mt-1 text-[12px] text-text-secondary">
                        A estrutura necessária foi identificada corretamente.
                      </p>

                    </div>

=======
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
                      ? "border-[#E41E2B] bg-[#FFF8F8]"
                      : "border-[#D5D7DA] bg-[#FAFAF9] hover:border-[#B9BDC1]"
                  }`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-white text-[#4B5055] shadow-sm">
                    <Upload
                      size={19}
                    />
>>>>>>> origin/marques
=======
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
                      ? "border-[#E41E2B] bg-[#FFF8F8]"
                      : "border-[#D5D7DA] bg-[#FAFAF9] hover:border-[#B9BDC1]"
                  }`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-white text-[#4B5055] shadow-sm">
                    <Upload
                      size={19}
                    />
>>>>>>> origin/marques
=======
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
                      ? "border-[#E41E2B] bg-[#FFF8F8]"
                      : "border-[#D5D7DA] bg-[#FAFAF9] hover:border-[#B9BDC1]"
                  }`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-white text-[#4B5055] shadow-sm">
                    <Upload
                      size={19}
                    />
>>>>>>> origin/marques
=======
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
                      ? "border-[#E41E2B] bg-[#FFF8F8]"
                      : "border-[#D5D7DA] bg-[#FAFAF9] hover:border-[#B9BDC1]"
                  }`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-[11px] bg-white text-[#4B5055] shadow-sm">
                    <Upload
                      size={19}
                    />
>>>>>>> origin/marques
                  </div>

                  <p className="mt-5 text-[13px] font-semibold text-[#32363A]">
                    Arraste a planilha aqui
                  </p>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
                  <div className="mt-7 grid border-y border-border-theme py-6 sm:grid-cols-3">

                    <div>

                      <p className="text-[11px] text-text-secondary">
                        Registros
                      </p>


                      <p className="mt-1.5 text-[17px] font-medium text-text-primary">
                        {formatNumber(
                          preview.totalRows,
                        )}
                      </p>

                    </div>


                    <div className="border-t border-border-theme py-4 sm:border-l sm:border-t-0 sm:px-6 sm:py-0">

                      <p className="text-[11px] text-text-secondary">
                        Aba identificada
                      </p>


                      <p className="mt-1.5 truncate text-[14px] font-medium text-text-primary">
                        {preview.sheetName}
                      </p>

                    </div>


                    <div className="border-t border-border-theme pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">

                      <p className="text-[11px] text-text-secondary">
                        Colunas
                      </p>


                      <p className="mt-1.5 text-[17px] font-medium text-text-primary">
                        {
                          preview
                            .expectedColumns
                            .length
                        }
                      </p>

                    </div>

                  </div>


                  <div className="mt-8 flex justify-end">

                    <button
                      type="button"
                      onClick={() =>
                        void processFile()
                      }
                      className="rounded-[10px] bg-[#F40009] px-6 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#D90008]"
                    >
                      Processar dados
                    </button>

                  </div>
=======
                  <p className="mt-1 text-[10px] text-[#979CA2]">
                    ou clique para selecionar
                  </p>
>>>>>>> origin/marques
=======
                  <p className="mt-1 text-[10px] text-[#979CA2]">
                    ou clique para selecionar
                  </p>
>>>>>>> origin/marques
=======
                  <p className="mt-1 text-[10px] text-[#979CA2]">
                    ou clique para selecionar
                  </p>
>>>>>>> origin/marques
=======
                  <p className="mt-1 text-[10px] text-[#979CA2]">
                    ou clique para selecionar
                  </p>
>>>>>>> origin/marques

                  <p className="mt-4 text-[9px] text-[#A4A8AD]">
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
                  <div className="flex items-center justify-between rounded-[15px] border border-black/[0.06] bg-[#FAFAF9] px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-white text-[#484D52]">
                        <FileSpreadsheet
                          size={17}
                        />
                      </div>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            {status ===
              "processing" && (
              <div className="py-10">

                <div className="flex items-start gap-3">

                  <LoaderCircle
                    size={19}
                    className="mt-0.5 animate-spin text-[#F40009]"
                  />


                  <div>

                    <p className="text-[14px] font-medium text-text-primary">
                      Importando e analisando dados
                    </p>


                    <p className="mt-1 max-w-[590px] text-[12px] leading-6 text-text-secondary">
                      Os apontamentos estão sendo armazenados.
                      Em seguida, as ocorrências elegíveis são
                      analisadas automaticamente pelo Modelo ML.
                    </p>

                  </div>

                </div>


                <div className="mt-7 overflow-hidden rounded-full bg-surface-hover">

                  <div className="h-[5px] w-1/2 animate-pulse rounded-full bg-[#F40009]" />

                </div>


                <p className="mt-4 text-[11px] leading-5 text-text-secondary">
                  A classificação gerada pelo modelo não é
                  considerada oficial até a revisão humana.
                </p>

              </div>
            )}


            {/* =============================================
                CONCLUÍDO
            ============================================== */}

            {status ===
              "completed" &&
              result && (
                <div className="mt-8">

                  <div className="flex items-start gap-3">

                    <Check
                      size={19}
                      strokeWidth={2}
                      className="mt-0.5 shrink-0 text-[#238636]"
                    />


                    <div>

                      <p className="text-[14px] font-medium text-text-primary">
                        Importação concluída
                      </p>


                      <p className="mt-1 text-[12px] leading-6 text-text-secondary">
                        {mlCompleted
                          ? "Os registros foram armazenados e as sugestões do Modelo ML estão prontas para revisão."
                          : "Os registros foram armazenados com sucesso."}
                      </p>

                    </div>

                  </div>


                  {/* =========================================
                      RESUMO PRINCIPAL
                  ========================================== */}

                  <div className="mt-7 grid border-y border-border-theme py-6 sm:grid-cols-3">

                    <div>

                      <p className="text-[11px] text-text-secondary">
                        Importados
                      </p>


                      <p className="mt-1.5 text-[20px] font-medium text-text-primary">
                        {formatNumber(
                          importedCount,
                        )}
                      </p>


                      {ignoredCount >
                        0 && (
                        <p className="mt-1 text-[10px] text-text-secondary">
                          {formatNumber(
                            ignoredCount,
                          )}{" "}
                          ignorado(s)
=======
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-[#33373B]">
                          {file.name}
>>>>>>> origin/marques
                        </p>

<<<<<<< HEAD
                      {duplicateCount >
                        0 && (
                        <p className="mt-1 text-[10px] text-text-secondary">
                          {formatNumber(
                            duplicateCount,
                          )}{" "}
                          já importado(s) antes
=======
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-[#33373B]">
                          {file.name}
>>>>>>> origin/marques
                        </p>

<<<<<<< HEAD
                    </div>


                    <div className="border-t border-border-theme py-4 sm:border-l sm:border-t-0 sm:px-6 sm:py-0">

                      <p className="text-[11px] text-text-secondary">
                        Analisados pelo ML
                      </p>


                      <p className="mt-1.5 text-[20px] font-medium text-text-primary">
                        {formatNumber(
                          mlProcessedCount,
                        )}
                      </p>


                      {mlAvailable && (
                        <p className="mt-1 text-[10px] text-text-secondary">
                          de{" "}
                          {formatNumber(
                            mlEligibleCount,
                          )}{" "}
                          elegíveis
                        </p>
                      )}

                    </div>


                    <div className="border-t border-border-theme pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">

                      <p className="text-[11px] text-text-secondary">
                        Aguardando revisão
                      </p>


                      <p className="mt-1.5 text-[20px] font-medium text-text-primary">
                        {formatNumber(
                          suggestionsCount,
                        )}
                      </p>


                      <p className="mt-1 text-[10px] text-text-secondary">
                        sugestões geradas
                      </p>

=======
                        <p className="mt-0.5 text-[8px] text-[#9CA1A6]">
                          {formatFileSize(
                            file.size,
                          )}
                        </p>
                      </div>
>>>>>>> origin/marques
=======
                        <p className="mt-0.5 text-[8px] text-[#9CA1A6]">
                          {formatFileSize(
                            file.size,
                          )}
                        </p>
                      </div>
>>>>>>> origin/marques
=======
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-[#33373B]">
                          {file.name}
                        </p>

                        <p className="mt-0.5 text-[8px] text-[#9CA1A6]">
                          {formatFileSize(
                            file.size,
                          )}
                        </p>
                      </div>
>>>>>>> origin/marques
=======
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-[#33373B]">
                          {file.name}
                        </p>

                        <p className="mt-0.5 text-[8px] text-[#9CA1A6]">
                          {formatFileSize(
                            file.size,
                          )}
                        </p>
                      </div>
>>>>>>> origin/marques
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
                        className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#92979C] transition hover:bg-white hover:text-[#34383D]"
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
                        className="animate-spin text-[#E41E2B]"
                      />

                      <p className="text-[11px] text-[#777C82]">
                        Verificando estrutura da planilha...
                      </p>
                    </div>
                  )}

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
                  {mlResult && (
                    <div className="mt-6 rounded-[14px] bg-surface-elevated px-5 py-4">

                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                        <div>

                          <p className="text-[11px] font-medium text-text-secondary">
                            Modelo ML
                          </p>


                          <p className="mt-1 text-[12px] font-medium text-text-primary">
                            {mlResult.modelVersion ??
                              "Indisponível"}
                          </p>
=======
                  {status ===
                    "ready" &&
                    preview && (
                      <div className="mt-5">
                        <div className="flex items-start gap-3">
                          <Check
                            size={17}
                            className="mt-0.5 text-[#456A57]"
                          />

                          <div>
                            <p className="text-[12px] font-semibold text-[#303438]">
                              Planilha pronta para processamento
                            </p>
>>>>>>> origin/marques

=======
                  {status ===
                    "ready" &&
                    preview && (
                      <div className="mt-5">
                        <div className="flex items-start gap-3">
                          <Check
                            size={17}
                            className="mt-0.5 text-[#456A57]"
                          />

                          <div>
                            <p className="text-[12px] font-semibold text-[#303438]">
                              Planilha pronta para processamento
                            </p>

>>>>>>> origin/marques
=======
                  {status ===
                    "ready" &&
                    preview && (
                      <div className="mt-5">
                        <div className="flex items-start gap-3">
                          <Check
                            size={17}
                            className="mt-0.5 text-[#456A57]"
                          />

                          <div>
                            <p className="text-[12px] font-semibold text-[#303438]">
                              Planilha pronta para processamento
                            </p>

>>>>>>> origin/marques
=======
                  {status ===
                    "ready" &&
                    preview && (
                      <div className="mt-5">
                        <div className="flex items-start gap-3">
                          <Check
                            size={17}
                            className="mt-0.5 text-[#456A57]"
                          />

                          <div>
                            <p className="text-[12px] font-semibold text-[#303438]">
                              Planilha pronta para processamento
                            </p>

>>>>>>> origin/marques
                            <p className="mt-1 text-[9px] text-[#8F949A]">
                              A estrutura necessária foi identificada corretamente.
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 grid overflow-hidden rounded-[14px] border border-black/[0.05] sm:grid-cols-3 sm:divide-x sm:divide-black/[0.05]">
                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                              Registros
                            </p>

                            <p className="mt-1 text-[17px] font-semibold text-[#34383D]">
                              {formatNumber(
                                preview.totalRows,
                              )}
                            </p>
                          </div>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
                          <p className="text-[11px] text-text-secondary">
                            Status
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                              Aba
                            </p>

                            <p className="mt-1 truncate text-[12px] font-semibold text-[#34383D]">
                              {preview.sheetName}
                            </p>
                          </div>

                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                              Colunas
                            </p>

                            <p className="mt-1 text-[17px] font-semibold text-[#34383D]">
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
                            className="h-10 rounded-[10px] bg-[#E41E2B] px-5 text-[10px] font-semibold text-white transition hover:bg-[#C91824]"
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
                          className="mt-0.5 animate-spin text-[#E41E2B]"
                        />

                        <div>
                          <p className="text-[12px] font-semibold text-[#303438]">
                            Importando e analisando dados
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
                          </p>

                          <p className="mt-1 text-[9px] leading-5 text-[#8E9399]">
                            Os registros estão sendo armazenados e enviados ao modelo de classificação.
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 overflow-hidden rounded-full bg-[#ECEEEF]">
                        <div className="h-[4px] w-1/2 animate-pulse rounded-full bg-[#E41E2B]" />
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
                            className="mt-0.5 text-[#456A57]"
                          />

                          <div>
                            <p className="text-[12px] font-semibold text-[#303438]">
                              Importação concluída
                            </p>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
                            <p className="text-[12px] font-medium text-text-body">
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
                            <p className="mt-1 text-[9px] text-[#8F949A]">
                              {mlCompleted
                                ? "Os dados foram armazenados e o modelo concluiu a análise."
                                : "Os dados foram armazenados com sucesso."}
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 grid overflow-hidden rounded-[14px] border border-black/[0.05] sm:grid-cols-3 sm:divide-x sm:divide-black/[0.05]">
                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                              Importados
                            </p>

                            <p className="mt-1 text-[18px] font-semibold text-[#34383D]">
                              {formatNumber(
                                importedCount,
                              )}
                            </p>

                            {ignoredCount >
                              0 && (
                              <p className="mt-1 text-[8px] text-[#A0A5AA]">
                                {formatNumber(
                                  ignoredCount,
                                )}{" "}
                                ignorados
                              </p>
                            )}
                          </div>

                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                              Analisados pelo ML
                            </p>

                            <p className="mt-1 text-[18px] font-semibold text-[#34383D]">
                              {formatNumber(
                                mlProcessedCount,
                              )}
                            </p>

                            {mlAvailable && (
                              <p className="mt-1 text-[8px] text-[#A0A5AA]">
                                de{" "}
                                {formatNumber(
                                  mlEligibleCount,
                                )}{" "}
                                elegíveis
                              </p>
                            )}
                          </div>

                          <div className="px-4 py-4">
                            <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                              Sugestões
                            </p>

                            <p className="mt-1 text-[18px] font-semibold text-[#34383D]">
                              {formatNumber(
                                suggestionsCount,
                              )}
                            </p>
                          </div>
                        </div>

                        {mlResult && (
                          <div className="mt-4 flex flex-col gap-2 rounded-[12px] bg-[#F7F7F6] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                                Modelo
                              </p>

                              <p className="mt-1 text-[10px] font-semibold text-[#41464B]">
                                {mlResult.modelVersion ??
                                  "Indisponível"}
                              </p>
                            </div>

                            <p className="text-[9px] font-medium text-[#777C82]">
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
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
                          <p className="mt-3 text-[9px] text-[#9A9FA5]">
                            {formatNumber(
                              mlFailedCount,
                            )}{" "}
                            ocorrência(s) apresentaram erro na análise.
                          </p>
                        )}

                        {warning && (
                          <div className="mt-4 flex items-start gap-3 rounded-[12px] border border-[#F0D7D9] bg-[#FFF8F8] px-4 py-3">
                            <AlertCircle
                              size={15}
                              className="mt-0.5 shrink-0 text-[#B4232C]"
                            />

                            <p className="text-[9px] leading-5 text-[#74797F]">
                              {warning}
                            </p>
                          </div>
                        )}

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
                      {mlFailedCount >
                        0 && (
                        <p className="mt-4 border-t border-border-theme transition-colors pt-4 text-[11px] text-text-secondary">
                          {formatNumber(
                            mlFailedCount,
                          )}{" "}
                          apontamento(s) apresentaram erro durante a análise.
                        </p>
                      )}
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={
                              clearFile
                            }
                            className="text-[9px] font-semibold text-[#777C82] hover:text-[#303438]"
                          >
                            Importar outro arquivo
                          </button>
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques

                          <div className="flex gap-2">
                            <Link
                              href="/dashboard/historico"
                              className="rounded-[9px] border border-black/[0.08] bg-white px-4 py-2.5 text-[9px] font-semibold text-[#4B5055] hover:bg-[#F7F7F6]"
                            >
                              Ver histórico
                            </Link>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD

                  {/* =========================================
                      AVISO
                  ========================================== */}

                  {warning && (
                    <div className="mt-5 flex items-start gap-3 rounded-[12px] border border-[#F0D7D9] bg-[#FFF8F8] px-4 py-3">

                      <AlertCircle
                        size={17}
                        className="mt-0.5 shrink-0 text-[#D1242F]"
                      />


                      <p className="text-[12px] leading-6 text-text-secondary">
                        {warning}
                      </p>

                    </div>
                  )}


                  {/* =========================================
                      REGRA DA REVISÃO
                  ========================================== */}

                  {suggestionsCount >
                    0 && (
                    <div className="mt-6">

                      <p className="mt-4 text-[14px] leading-6 text-text-body">
                        As sugestões do Modelo ML ainda não são
                        classificações oficiais. Cada ocorrência
                        precisa ser confirmada ou corrigida por um
                        responsável.
                      </p>

                    </div>
                  )}


                  {/* =========================================
                      AÇÕES
                  ========================================== */}

                  <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                    <button
                      type="button"
                      onClick={
                        clearFile
                      }
                      className="text-left text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                    >
                      Importar outro arquivo
                    </button>


                    <div className="flex flex-col gap-3 sm:flex-row">

                      <Link
                        href="/dashboard/historico"
                        className="rounded-[10px] border border-border-theme bg-background-primary transition-colors px-6 py-3 text-center text-[13px] font-semibold text-text-primary transition-colors hover:border-border-theme hover:bg-surface-elevated transition-colors"
                      >
                        Ver histórico
                      </Link>


                      {suggestionsCount >
                        0 && (
                        <Link
                          href="/dashboard/revisao"
                          className="rounded-[10px] bg-[#F40009] px-6 py-3 text-center text-[13px] font-semibold text-white transition-colors hover:bg-[#D90008]"
                        >
                          Revisar classificações
                        </Link>
                      )}

                    </div>

                  </div>

                </div>
              )}


            {/* =============================================
                INVÁLIDO
            ============================================== */}

            {status ===
              "invalid" &&
              preview && (
                <div className="mt-8 flex items-start gap-3 border-t border-border-theme pt-7">

                  <AlertCircle
                    size={18}
                    className="mt-0.5 text-[#D1242F]"
                  />


                  <div>

                    <p className="text-[14px] font-medium text-text-primary">
                      Estrutura incompatível
                    </p>


                    <p className="mt-1 text-[12px] text-text-secondary">
                      A planilha não contém todas as colunas necessárias.
                    </p>


                    {preview
                      .missingColumns
                      .length >
                      0 && (
                      <div className="mt-4">

                        <p className="text-[11px] font-medium text-text-secondary">
                          Colunas ausentes
                        </p>


                        <p className="mt-2 text-[11px] leading-6 text-text-secondary">
                          {preview
                            .missingColumns
                            .join(
                              ", ",
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
                            {suggestionsCount >
                              0 && (
                              <Link
                                href="/dashboard/revisao"
                                className="rounded-[9px] bg-[#202327] px-4 py-2.5 text-[9px] font-semibold text-white hover:bg-[#111315]"
                              >
                                Revisar classificações
                              </Link>
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                  {status ===
                    "invalid" &&
                    preview && (
                      <div className="mt-5 flex items-start gap-3 rounded-[13px] border border-[#F0D7D9] bg-[#FFF8F8] px-4 py-4">
                        <AlertCircle
                          size={17}
                          className="mt-0.5 shrink-0 text-[#B4232C]"
                        />

                        <div>
                          <p className="text-[11px] font-semibold text-[#373B40]">
                            Estrutura incompatível
                          </p>

                          <p className="mt-1 text-[9px] leading-5 text-[#858A90]">
                            A planilha não contém todas as colunas necessárias.
                          </p>

                          {preview.missingColumns.length >
                            0 && (
                            <p className="mt-2 text-[9px] leading-5 text-[#A0A5AA]">
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
                    <div className="mt-5 flex items-start gap-3 rounded-[13px] border border-[#F0D7D9] bg-[#FFF8F8] px-4 py-4">
                      <AlertCircle
                        size={17}
                        className="mt-0.5 shrink-0 text-[#B4232C]"
                      />

                      <div>
                        <p className="text-[11px] font-semibold text-[#373B40]">
                          Não foi possível concluir
                        </p>

                        <p className="mt-1 text-[9px] leading-5 text-[#858A90]">
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

        <section className="mt-6 grid overflow-hidden rounded-[20px] border border-black/[0.045] bg-white shadow-[0_8px_30px_rgba(28,31,34,0.02)] sm:grid-cols-4 sm:divide-x sm:divide-black/[0.05]">
          <div className="px-5 py-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#A0A5AA]">
              Importações
            </p>

            <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-[#25292D]">
              {formatNumber(
                importsSummary.imports,
              )}
            </p>
          </div>

          <div className="px-5 py-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#A0A5AA]">
              Eventos
            </p>

            <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-[#25292D]">
              {formatNumber(
                importsSummary.events,
              )}
            </p>
          </div>

          <div className="px-5 py-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#A0A5AA]">
              Classificados
            </p>

            <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-[#25292D]">
              {formatNumber(
                importsSummary.classifiedEvents,
              )}
            </p>
          </div>

          <div className="px-5 py-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#A0A5AA]">
              Cobertura
            </p>

            <p className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-[#E41E2B]">
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

        <section className="mt-5 overflow-hidden rounded-[24px] border border-black/[0.05] bg-white shadow-[0_12px_38px_rgba(28,31,34,0.025)]">
          <div className="flex flex-col gap-4 border-b border-black/[0.05] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-center gap-3">
              <History
                size={15}
                className="text-[#777C82]"
              />

              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.025em] text-[#202327]">
                  Histórico de importações
                </h2>

                <p className="mt-0.5 text-[8px] text-[#A0A5AA]">
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
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#A0A5AA]"
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
                  className="h-9 w-full rounded-[9px] border border-black/[0.07] bg-[#FAFAF9] pl-8 pr-3 text-[9px] text-[#41464B] outline-none focus:border-[#D8A5A9] sm:w-[210px]"
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
                className="h-9 rounded-[9px] border border-black/[0.07] bg-[#FAFAF9] px-3 text-[9px] text-[#555A60] outline-none focus:border-[#D8A5A9]"
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
            <div className="m-5 rounded-[12px] border border-[#F0D7D9] bg-[#FFF8F8] px-4 py-3 text-[10px] text-[#B4232C]">
              {importsError}
            </div>
          )}

          {importsLoading &&
          imports.length ===
            0 ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <LoaderCircle
                size={20}
                className="animate-spin text-[#E41E2B]"
              />
            </div>
          ) : imports.length ===
            0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
              <FileSpreadsheet
                size={24}
                className="text-[#C4C7CA]"
              />

              <p className="mt-3 text-[11px] font-semibold text-[#60656B]">
                Nenhuma importação encontrada
              </p>

              <p className="mt-1 text-[9px] text-[#999EA4]">
                Importe uma planilha ou altere os filtros da busca.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse">
                  <thead>
                    <tr className="border-b border-black/[0.05] bg-[#FAFAF9] text-left">
                      <th className="px-5 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#9CA1A7] sm:px-6">
                        Arquivo
                      </th>

                      <th className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#9CA1A7]">
                        Status
                      </th>

                      <th className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#9CA1A7]">
                        Eventos
                      </th>

                      <th className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#9CA1A7]">
                        Classificação
                      </th>

                      <th className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#9CA1A7]">
                        Unidade
                      </th>

                      <th className="px-4 py-3 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#9CA1A7]">
                        Importado em
                      </th>

                      <th className="px-5 py-3 text-right text-[8px] font-semibold uppercase tracking-[0.08em] text-[#9CA1A7] sm:px-6">
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
                          className="border-b border-black/[0.045] last:border-b-0 hover:bg-[#FCFCFB]"
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
                              <p className="truncate text-[10px] font-semibold text-[#34383D] hover:text-[#E41E2B]">
                                {item.originalFileName ||
                                  item.fileName}
                              </p>

                              <p className="mt-1 text-[8px] text-[#A0A5AA]">
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

                          <td className="px-4 py-4 text-[10px] font-semibold tabular-nums text-[#4A4F54]">
                            {formatNumber(
                              item.events,
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <p className="text-[10px] font-semibold tabular-nums text-[#4A4F54]">
                              {formatNumber(
                                item.classificationCoverage,
                                1,
                              )}
                              %
                            </p>

                            <p className="mt-1 text-[8px] text-[#A0A5AA]">
                              {formatNumber(
                                item.classifiedEvents,
                              )}{" "}
                              classificadas
                            </p>
                          </td>

                          <td className="max-w-[180px] px-4 py-4">
                            <p className="truncate text-[9px] text-[#71767C]">
                              {item.unitsLabel ||
                                "—"}
                            </p>
                          </td>

                          <td className="px-4 py-4 text-[9px] text-[#858A90]">
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
                                className="flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[8px] font-semibold text-[#71767C] transition hover:bg-[#F1F1F0] hover:text-[#34383D]"
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

              <div className="flex items-center justify-between border-t border-black/[0.05] px-5 py-3.5 sm:px-6">
                <p className="text-[8px] text-[#9A9FA5]">
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
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-black/[0.06] text-[#74797F] transition hover:bg-[#F5F5F4] disabled:cursor-not-allowed disabled:opacity-30"
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
                    className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-black/[0.06] text-[#74797F] transition hover:bg-[#F5F5F4] disabled:cursor-not-allowed disabled:opacity-30"
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

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col bg-white shadow-[-20px_0_60px_rgba(20,22,25,0.12)]">
            <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-black/[0.06] px-5 sm:px-6">
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#A0A5AA]">
                  Importação
                </p>

                <p className="mt-1 text-[13px] font-semibold text-[#303438]">
                  #{selectedImportId}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  closeDetail
                }
                className="flex h-9 w-9 items-center justify-center rounded-[9px] text-[#8B9095] transition hover:bg-[#F2F2F1] hover:text-[#33373B]"
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
                    className="animate-spin text-[#E41E2B]"
                  />
                </div>
              )}

              {detailError && (
                <div className="mb-5 rounded-[12px] border border-[#F0D7D9] bg-[#FFF8F8] px-4 py-3 text-[9px] leading-5 text-[#B4232C]">
                  {detailError}
                </div>
              )}

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
            {/* =============================================
                ERRO
            ============================================== */}

            {status ===
              "error" && (
                <div className="mt-8 border-t border-border-theme pt-7">

                  <div className="flex items-start gap-3">

                    <AlertCircle
                      size={18}
                      className="mt-0.5 shrink-0 text-[#D1242F]"
                    />

=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
              {actionMessage && (
                <div className="mb-5 rounded-[12px] border border-[#DCE9E1] bg-[#F6FAF7] px-4 py-3 text-[9px] leading-5 text-[#456A57]">
                  {actionMessage}
                </div>
              )}
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques

              {selectedImport &&
                !detailLoading && (
                  <>
                    <div>
                      <h2 className="break-words text-[18px] font-semibold tracking-[-0.035em] text-[#202327]">
                        {selectedImport.originalFileName ||
                          selectedImport.fileName}
                      </h2>

<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
                      <p className="text-[14px] font-medium text-text-primary">
                        Não foi possível concluir o processamento
                      </p>


                      <p className="mt-1 text-[12px] leading-6 text-text-secondary">
                        {error}
                      </p>
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques

                        <span className="text-[8px] text-[#A0A5AA]">
                          {formatDateTime(
                            selectedImport.importedAt ||
                              selectedImport.createdAt,
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-[16px] border border-black/[0.05] sm:grid-cols-3">
                      <div className="border-b border-r border-black/[0.05] px-4 py-4">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                          Linhas
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-[#34383D]">
                          {formatNumber(
                            selectedImport.totalRows,
                          )}
                        </p>
                      </div>

                      <div className="border-b border-black/[0.05] px-4 py-4 sm:border-r">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                          Processadas
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-[#34383D]">
                          {formatNumber(
                            selectedImport.processedRows,
                          )}
                        </p>
                      </div>

                      <div className="border-b border-r border-black/[0.05] px-4 py-4 sm:border-r-0">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                          Erros
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-[#34383D]">
                          {formatNumber(
                            selectedImport.errorRows,
                          )}
                        </p>
                      </div>

                      <div className="border-r border-black/[0.05] px-4 py-4">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                          Eventos
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-[#34383D]">
                          {formatNumber(
                            selectedImport.impact.events,
                          )}
                        </p>
                      </div>

                      <div className="border-r border-black/[0.05] px-4 py-4">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                          Classificados
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-[#34383D]">
                          {formatNumber(
                            selectedImport.classification.classifiedEvents,
                          )}
                        </p>
                      </div>

                      <div className="px-4 py-4">
                        <p className="text-[8px] uppercase tracking-[0.08em] text-[#A0A5AA]">
                          Cobertura
                        </p>

                        <p className="mt-1 text-[16px] font-semibold text-[#E41E2B]">
                          {formatNumber(
                            selectedImport.classification.coverage,
                            1,
                          )}
                          %
                        </p>
                      </div>
                    </div>

                    <div className="mt-6">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#9CA1A7]">
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
                              className="rounded-[8px] bg-[#F3F3F2] px-2.5 py-1.5 text-[8px] font-medium text-[#6E7379]"
                            >
                              {currentUnit.city ||
                                currentUnit.name ||
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
                      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#9CA1A7]">
                        Modelo
                      </p>

                      <p className="mt-2 text-[10px] font-semibold text-[#41464B]">
                        {selectedImport.classification.modelVersions.length >
                        0
                          ? selectedImport.classification.modelVersions.join(
                              " · ",
                            )
                          : "Nenhuma versão registrada"}
                      </p>

                      <p className="mt-1 text-[8px] text-[#9A9FA5]">
                        {formatNumber(
                          selectedImport.classification.pendingEvents,
                        )}{" "}
                        ocorrência(s) pendentes
                      </p>
                    </div>

                    <div className="mt-6">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#9CA1A7]">
                        Impacto dos dados
                      </p>

                      <div className="mt-3 divide-y divide-black/[0.045] rounded-[14px] border border-black/[0.05]">
                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-[#7E8389]">
                            Eventos
                          </span>

                          <span className="text-[9px] font-semibold text-[#41464B]">
                            {formatNumber(
                              selectedImport.impact.events,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-[#7E8389]">
                            Tempo de parada
                          </span>

                          <span className="text-[9px] font-semibold text-[#41464B]">
                            {formatMinutes(
                              selectedImport.impact.downtimeMinutes,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-[#7E8389]">
                            Sugestões ML
                          </span>

                          <span className="text-[9px] font-semibold text-[#41464B]">
                            {formatNumber(
                              selectedImport.impact.classificationSuggestions,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-[#7E8389]">
                            Classificações oficiais
                          </span>

                          <span className="text-[9px] font-semibold text-[#41464B]">
                            {formatNumber(
                              selectedImport.impact.eventClassifications,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-[#7E8389]">
                            Revisões de origem
                          </span>

                          <span className="text-[9px] font-semibold text-[#41464B]">
                            {formatNumber(
                              selectedImport.impact.originReviews,
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                          <span className="text-[9px] text-[#7E8389]">
                            Vínculos com MASP
                          </span>

                          <span className="text-[9px] font-semibold text-[#41464B]">
                            {formatNumber(
                              selectedImport.impact.maspEventLinks,
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectedImport.errorMessage && (
                      <div className="mt-5 rounded-[12px] border border-[#F0D7D9] bg-[#FFF8F8] px-4 py-3">
                        <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#B4232C]">
                          Erro registrado
                        </p>

                        <p className="mt-2 text-[9px] leading-5 text-[#74797F]">
                          {selectedImport.errorMessage}
                        </p>
                      </div>
                    )}

                    {deleteConfirm && (
                      <div className="mt-6 rounded-[15px] border border-[#EAC8CB] bg-[#FFF8F8] px-4 py-4">
                        <p className="text-[11px] font-semibold text-[#A9252E]">
                          Excluir esta importação?
                        </p>

                        <p className="mt-2 text-[9px] leading-5 text-[#74797F]">
                          Serão removidos{" "}
                          <strong className="font-semibold text-[#4B5055]">
                            {formatNumber(
                              selectedImport.impact.events,
                            )}{" "}
                            eventos
                          </strong>
                          , suas classificações, sugestões e revisões relacionadas.
                        </p>

                        {selectedImport.impact.maspEventLinks >
                          0 && (
                          <p className="mt-2 text-[9px] leading-5 text-[#74797F]">
                            {formatNumber(
                              selectedImport.impact.maspEventLinks,
                            )}{" "}
                            vínculo(s) com MASP serão removidos. As análises MASP permanecerão existentes.
                          </p>
                        )}

                        <p className="mt-2 text-[9px] font-semibold text-[#A9252E]">
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
                            className="h-9 rounded-[9px] border border-black/[0.07] bg-white px-4 text-[9px] font-semibold text-[#6F747A]"
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
                            className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-[#B4232C] px-4 text-[9px] font-semibold text-white disabled:opacity-50"
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
                <div className="shrink-0 border-t border-black/[0.06] bg-white px-5 py-4 sm:px-6">
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
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] border border-[#E7C5C8] px-4 text-[9px] font-semibold text-[#B4232C] transition hover:bg-[#FFF8F8] disabled:opacity-40"
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
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
                      className="text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary"
=======
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
                      onClick={() =>
                        void classifyImport(
                          selectedImport.id,
                        )
                      }
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-[9px] bg-[#202327] px-4 text-[9px] font-semibold text-white transition hover:bg-[#111315] disabled:opacity-40"
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
=======
>>>>>>> origin/marques
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