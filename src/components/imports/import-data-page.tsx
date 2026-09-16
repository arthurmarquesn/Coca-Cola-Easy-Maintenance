"use client";

import Image from "next/image";
import Link from "next/link";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
  X,
} from "lucide-react";

import type {
  ChangeEvent,
  DragEvent,
} from "react";

import {
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

  sourceRows?: number;

  totalRows: number;

  processedRows: number;

  ignoredRows?: number;

  failedRows: number;
}

/* =========================================================
   IA
========================================================= */

interface AIResult {
  model: string;

  groupsAnalyzed: number;

  eventsClassifiedThisRun: number;

  totalEvents: number;

  classifiedEvents: number;

  pendingEvents: number;

  limitReached: boolean;
}

/* =========================================================
   STATUS
========================================================= */

type ImportStatus =
  | "idle"
  | "validating"
  | "ready"
  | "processing"
  | "analyzing"
  | "completed"
  | "invalid"
  | "error";

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

  const [file, setFile] =
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
    aiResult,
    setAIResult,
  ] =
    useState<AIResult | null>(
      null,
    );

  const [
    activeImportId,
    setActiveImportId,
  ] =
    useState<number | null>(
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
    aiWarning,
    setAIWarning,
  ] =
    useState("");

  const [
    dragging,
    setDragging,
  ] =
    useState(false);

  /* =======================================================
     FORMATAÇÃO
  ======================================================= */

  function formatFileSize(
    bytes: number,
  ) {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (
      bytes <
      1024 * 1024
    ) {
      return `${(
        bytes / 1024
      ).toFixed(1)} KB`;
    }

    return `${(
      bytes /
      (1024 * 1024)
    ).toFixed(1)} MB`;
  }

  function formatNumber(
    value: number,
  ) {
    return new Intl.NumberFormat(
      "pt-BR",
    ).format(value);
  }

  /* =======================================================
     LIMPAR
  ======================================================= */

  function clearFile() {
    setFile(null);

    setPreview(null);

    setResult(null);

    setAIResult(null);

    setActiveImportId(
      null,
    );

    setStatus("idle");

    setError("");

    setAIWarning("");

    if (inputRef.current) {
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

    setPreview(null);

    setResult(null);

    setAIResult(null);

    setActiveImportId(
      null,
    );

    setError("");

    setAIWarning("");

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
          data.message ??
            "Não foi possível analisar o arquivo.",
        );

        setStatus(
          "error",
        );

        return;
      }

      const previewData =
        data.preview as ImportPreview;

      setPreview(
        previewData,
      );

      setStatus(
        previewData.valid
          ? "ready"
          : "invalid",
      );
    } catch {
      setError(
        "Não foi possível enviar a planilha para análise.",
      );

      setStatus(
        "error",
      );
    }
  }

  /* =======================================================
     IA
  ======================================================= */

  async function runAI(
    importId: number,
  ) {
    setActiveImportId(
      importId,
    );

    setStatus(
      "analyzing",
    );

    setAIWarning("");

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
        setAIWarning(
          data.message ??
            "Os dados foram importados, mas a análise automática não pôde ser concluída.",
        );

        setStatus(
          "completed",
        );

        return;
      }

      setAIResult(
        data.ai as AIResult,
      );

      setStatus(
        "completed",
      );
    } catch {
      setAIWarning(
        "Os dados foram importados, mas não foi possível concluir a análise automática.",
      );

      setStatus(
        "completed",
      );
    }
  }

  /* =======================================================
     CONTINUAR ANÁLISE

     Não reimporta a planilha.

     Apenas chama novamente o classificador para pegar
     os próximos padrões ainda pendentes.
  ======================================================= */

  async function continueAnalysis() {
    if (
      !activeImportId ||
      status !== "completed"
    ) {
      return;
    }

    await runAI(
      activeImportId,
    );
  }

  /* =======================================================
     PROCESSAMENTO
  ======================================================= */

  async function processFile() {
    if (
      !file ||
      !preview?.valid ||
      status !== "ready"
    ) {
      return;
    }

    setError("");

    setAIWarning("");

    setResult(null);

    setAIResult(null);

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
        await response.json();

      /* ===================================================
         JÁ IMPORTADA

         Não duplicamos dados.

         Recuperamos o ID existente e continuamos a análise.
      =================================================== */

      if (
        response.status ===
          409 &&
        data.importId
      ) {
        const importId =
          Number(
            data.importId,
          );

        setActiveImportId(
          importId,
        );

        await runAI(
          importId,
        );

        return;
      }

      /* ===================================================
         ERRO
      =================================================== */

      if (
        !response.ok ||
        !data.success
      ) {
        setError(
          data.message ??
            "Não foi possível processar a planilha.",
        );

        setStatus(
          "error",
        );

        return;
      }

      const importData =
        data.import as ImportResult;

      setResult(
        importData,
      );

      setActiveImportId(
        importData.id,
      );

      /* ===================================================
         IA AUTOMÁTICA
      =================================================== */

      await runAI(
        importData.id,
      );
    } catch {
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
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selectedFile =
      event.target.files?.[0];

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
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setDragging(true);
  }

  function handleDragLeave(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setDragging(false);
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();

    setDragging(false);

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
     CONTADORES
  ======================================================= */

  const importedCount =
    result?.processedRows ??
    aiResult?.totalEvents ??
    0;

  const classifiedCount =
    aiResult
      ?.classifiedEvents ??
    0;

  const pendingCount =
    aiResult
      ?.pendingEvents ??
    0;

  const hasPending =
    Boolean(
      aiResult &&
        aiResult.pendingEvents >
          0,
    );

  /* =======================================================
     INTERFACE
  ======================================================= */

  return (
    <main className="min-h-screen bg-white">

      {/* ===================================================
          HEADER
      ==================================================== */}

      <header className="border-b border-[#E8E9EB] bg-white">

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

      <section className="mx-auto w-full max-w-[920px] px-6 pb-20 pt-12 sm:px-8 lg:px-12 lg:pt-16">

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-[#81868C] transition-colors hover:text-[#282B2F]"
        >
          <ArrowLeft
            size={15}
            strokeWidth={1.8}
          />

          Voltar
        </Link>

        <div className="mt-10">

          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.045em] text-[#191B1E] sm:text-[40px]">
            Importar dados
          </h1>

          <p className="mt-3 max-w-[590px] text-[14px] leading-7 text-[#7D8288]">
            Selecione a planilha com os apontamentos de manutenção que serão processados pela plataforma.
          </p>

        </div>

        {/* =================================================
            UPLOAD
        ================================================== */}

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
              inputRef.current?.click()
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
                inputRef.current?.click();
              }
            }}
            className={`mt-10 flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed px-8 text-center outline-none transition-all duration-200 ${
              dragging
                ? "border-[#F40009] bg-[#FFF9F9]"
                : "border-[#CED1D5] bg-[#FBFBFC] hover:border-[#AEB2B7]"
            }`}
          >

            <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-white text-[#42464C] shadow-[0_2px_10px_rgba(0,0,0,0.05)]">

              <Upload
                size={21}
                strokeWidth={1.8}
              />

            </div>

            <h2 className="mt-6 text-[16px] font-semibold text-[#292C30]">
              Arraste a planilha aqui
            </h2>

            <p className="mt-2 text-[13px] text-[#8B9096]">
              ou clique para selecionar
            </p>

            <p className="mt-5 text-[11px] text-[#A1A5AA]">
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

        {/* =================================================
            ARQUIVO
        ================================================== */}

        {file && (
          <div className="mt-10">

            <div className="flex items-center justify-between rounded-[16px] border border-[#E1E3E6] px-5 py-4">

              <div className="flex min-w-0 items-center gap-4">

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#F4F5F6] text-[#3E4247]">

                  <FileSpreadsheet
                    size={20}
                    strokeWidth={1.8}
                  />

                </div>

                <div className="min-w-0">

                  <p className="truncate text-[13px] font-medium text-[#292C30]">
                    {file.name}
                  </p>

                  <p className="mt-1 text-[11px] text-[#999DA2]">
                    {formatFileSize(
                      file.size,
                    )}
                  </p>

                </div>

              </div>

              {![
                "validating",
                "processing",
                "analyzing",
              ].includes(
                status,
              ) && (
                <button
                  type="button"
                  onClick={
                    clearFile
                  }
                  className="ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#94989D] transition-colors hover:bg-[#F4F5F6] hover:text-[#373B3F]"
                  aria-label="Remover arquivo"
                >
                  <X
                    size={17}
                    strokeWidth={1.8}
                  />
                </button>
              )}

            </div>

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

                <p className="text-[13px] text-[#74797F]">
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

                      <p className="text-[14px] font-medium text-[#292C30]">
                        Planilha pronta para processamento
                      </p>

                      <p className="mt-1 text-[12px] text-[#868B91]">
                        A estrutura necessária foi identificada corretamente.
                      </p>

                    </div>

                  </div>

                  <div className="mt-7 grid border-y border-[#EBEDEF] py-6 sm:grid-cols-3">

                    <div>

                      <p className="text-[11px] text-[#969BA1]">
                        Registros
                      </p>

                      <p className="mt-1.5 text-[17px] font-medium text-[#2D3034]">
                        {formatNumber(
                          preview.totalRows,
                        )}
                      </p>

                    </div>

                    <div className="border-t border-[#EBEDEF] py-4 sm:border-l sm:border-t-0 sm:px-6 sm:py-0">

                      <p className="text-[11px] text-[#969BA1]">
                        Aba identificada
                      </p>

                      <p className="mt-1.5 truncate text-[14px] font-medium text-[#2D3034]">
                        {preview.sheetName}
                      </p>

                    </div>

                    <div className="border-t border-[#EBEDEF] pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">

                      <p className="text-[11px] text-[#969BA1]">
                        Colunas
                      </p>

                      <p className="mt-1.5 text-[17px] font-medium text-[#2D3034]">
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

                </div>
              )}

            {/* =============================================
                ESTRUTURANDO
            ============================================== */}

            {status ===
              "processing" && (
              <div className="flex items-center gap-3 py-10">

                <LoaderCircle
                  size={19}
                  className="animate-spin text-[#F40009]"
                />

                <div>

                  <p className="text-[14px] font-medium text-[#292C30]">
                    Estruturando dados
                  </p>

                  <p className="mt-1 text-[12px] text-[#868B91]">
                    Os apontamentos estão sendo preparados e armazenados.
                  </p>

                </div>

              </div>
            )}

            {/* =============================================
                IA
            ============================================== */}

            {status ===
              "analyzing" && (
              <div className="flex items-center gap-3 py-10">

                <LoaderCircle
                  size={19}
                  className="animate-spin text-[#F40009]"
                />

                <div>

                  <p className="text-[14px] font-medium text-[#292C30]">
                    Analisando apontamentos
                  </p>

                  <p className="mt-1 text-[12px] text-[#868B91]">
                    Identificando e classificando os próximos padrões pendentes.
                  </p>

                </div>

              </div>
            )}

            {/* =============================================
                CONCLUÍDO
            ============================================== */}

            {status ===
              "completed" && (
              <div className="mt-8">

                <div className="flex items-start gap-3">

                  <Check
                    size={19}
                    strokeWidth={2}
                    className="mt-0.5 text-[#238636]"
                  />

                  <div>

                    <p className="text-[14px] font-medium text-[#292C30]">
                      Processamento concluído
                    </p>

                    <p className="mt-1 text-[12px] leading-6 text-[#868B91]">
                      Os dados processados estão disponíveis para análise.
                    </p>

                  </div>

                </div>

                {/* =========================================
                    CONTADORES
                ========================================== */}

                <div className="mt-7 grid border-y border-[#EBEDEF] py-6 sm:grid-cols-3">

                  <div>

                    <p className="text-[11px] text-[#969BA1]">
                      Registros
                    </p>

                    <p className="mt-1.5 text-[17px] font-medium text-[#2D3034]">
                      {formatNumber(
                        importedCount,
                      )}
                    </p>

                  </div>

                  <div className="border-t border-[#EBEDEF] py-4 sm:border-l sm:border-t-0 sm:px-6 sm:py-0">

                    <p className="text-[11px] text-[#969BA1]">
                      Classificados
                    </p>

                    <p className="mt-1.5 text-[17px] font-medium text-[#2D3034]">
                      {formatNumber(
                        classifiedCount,
                      )}
                    </p>

                  </div>

                  <div className="border-t border-[#EBEDEF] pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">

                    <p className="text-[11px] text-[#969BA1]">
                      Pendentes
                    </p>

                    <p className="mt-1.5 text-[17px] font-medium text-[#2D3034]">
                      {formatNumber(
                        pendingCount,
                      )}
                    </p>

                  </div>

                </div>

                {/* =========================================
                    AVISO
                ========================================== */}

                {aiWarning && (
                  <div className="mt-5 flex items-start gap-3">

                    <AlertCircle
                      size={17}
                      className="mt-0.5 shrink-0 text-[#D1242F]"
                    />

                    <p className="text-[12px] leading-6 text-[#7D8288]">
                      {aiWarning}
                    </p>

                  </div>
                )}

                {/* =========================================
                    PENDÊNCIAS
                ========================================== */}

                {hasPending && (
                  <div className="mt-6">

                    <p className="text-[12px] leading-6 text-[#7D8288]">
                      Ainda existem apontamentos pendentes de classificação.
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
                    className="text-left text-[12px] font-medium text-[#777C82] transition-colors hover:text-[#292C30]"
                  >
                    Importar outro arquivo
                  </button>

                  <div className="flex flex-col gap-3 sm:flex-row">

                    {hasPending &&
                      activeImportId && (
                        <button
                          type="button"
                          onClick={() =>
                            void continueAnalysis()
                          }
                          className="rounded-[10px] border border-[#D9DCE0] bg-white px-6 py-3 text-[13px] font-semibold text-[#3D4146] transition-colors hover:border-[#BFC3C8] hover:bg-[#FAFAFA]"
                        >
                          Continuar análise
                        </button>
                      )}

                    {aiWarning &&
                      !aiResult &&
                      activeImportId && (
                        <button
                          type="button"
                          onClick={() =>
                            void continueAnalysis()
                          }
                          className="rounded-[10px] border border-[#D9DCE0] bg-white px-6 py-3 text-[13px] font-semibold text-[#3D4146] transition-colors hover:border-[#BFC3C8] hover:bg-[#FAFAFA]"
                        >
                          Tentar novamente
                        </button>
                      )}

                    <Link
                      href="/dashboard/historico"
                      className="rounded-[10px] bg-[#F40009] px-6 py-3 text-center text-[13px] font-semibold text-white transition-colors hover:bg-[#D90008]"
                    >
                      Ver histórico
                    </Link>

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
                <div className="mt-8 flex items-start gap-3 border-t border-[#ECEDEF] pt-7">

                  <AlertCircle
                    size={18}
                    className="mt-0.5 text-[#D1242F]"
                  />

                  <div>

                    <p className="text-[14px] font-medium text-[#292C30]">
                      Estrutura incompatível
                    </p>

                    <p className="mt-1 text-[12px] text-[#868B91]">
                      A planilha não contém todas as colunas necessárias.
                    </p>

                  </div>

                </div>
              )}

            {/* =============================================
                ERRO
            ============================================== */}

            {status ===
              "error" && (
              <div className="mt-8 flex items-start gap-3 border-t border-[#ECEDEF] pt-7">

                <AlertCircle
                  size={18}
                  className="mt-0.5 shrink-0 text-[#D1242F]"
                />

                <div>

                  <p className="text-[14px] font-medium text-[#292C30]">
                    Não foi possível concluir o processamento
                  </p>

                  <p className="mt-1 text-[12px] leading-6 text-[#868B91]">
                    {error}
                  </p>

                </div>

              </div>
            )}

          </div>
        )}

      </section>

    </main>
  );
}