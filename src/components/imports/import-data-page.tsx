"use client";

import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";

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

  fileHash?: string;

  sourceRows: number;

  importedRows: number;

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
    useState(false);


  /* =======================================================
     HELPERS
  ======================================================= */

  function formatFileSize(
    bytes: number,
  ) {
    if (
      bytes < 1024
    ) {
      return `${bytes} B`;
    }


    if (
      bytes <
      1024 * 1024
    ) {
      return `${(
        bytes / 1024
      ).toFixed(
        1,
      )} KB`;
    }


    return `${(
      bytes /
      (
        1024 * 1024
      )
    ).toFixed(
      1,
    )} MB`;
  }


  function formatNumber(
    value: number,
  ) {
    return new Intl.NumberFormat(
      "pt-BR",
    ).format(
      value,
    );
  }


  /* =======================================================
     LIMPAR
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
        (await response.json()) as
          ProcessResponse;


      /* ===================================================
         PLANILHA DUPLICADA
      =================================================== */

      if (
        response.status ===
        409
      ) {
        setError(
          data.error ??
            "Essa planilha já foi importada anteriormente.",
        );


        setStatus(
          "error",
        );


        return;
      }


      /* ===================================================
         ERRO
      =================================================== */

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


      /* ===================================================
         IMPORTAÇÃO CONCLUÍDA
      =================================================== */

      setResult(
        data.import,
      );


      const ml =
        data.ml ??
        null;


      setMlResult(
        ml,
      );


      /* ===================================================
         STATUS DO MODELO ML
      =================================================== */

      if (!ml) {
        setWarning(
          "A importação foi concluída, mas não foi possível obter o resultado do Modelo ML. Os dados permanecem salvos e podem ser analisados posteriormente.",
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
        ml.failed > 0
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
     CONTADORES
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
     INTERFACE
  ======================================================= */

  return (
    <main className="min-h-screen bg-background-primary transition-colors">

      {/* ===================================================
          HEADER
      ==================================================== */}

      <AppHeader userName={user.name} city={unit.city} />


      {/* ===================================================
          CONTEÚDO
      ==================================================== */}

      <section className="mx-auto w-full max-w-[920px] px-6 pb-20 pt-12 sm:px-8 lg:px-12 lg:pt-16">

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-[10px] border border-[#F40009] bg-[#F40009] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:border-[#B90007] hover:bg-[#B90007]"
        >
          <ArrowLeft
            size={15}
            strokeWidth={1.8}
          />

          Voltar
        </Link>


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
            className={`mt-10 flex min-h-[300px] cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed px-8 text-center outline-none transition-all duration-200 ${
              dragging
                ? "border-[#F40009] bg-[#FFF9F9]"
                : "border-[#CED1D5] bg-[#FBFBFC] hover:border-[#AEB2B7]"
            }`}
          >

            <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-background-primary transition-colors text-[#42464C] shadow-[0_2px_10px_rgba(0,0,0,0.05)]">

              <Upload
                size={21}
                strokeWidth={1.8}
              />

            </div>


            <h2 className="mt-6 text-[16px] font-semibold text-[#292C30]">
              Arraste a planilha aqui
            </h2>


            <p className="mt-4 text-[14px] leading-6 text-text-body">
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


                      <p className="mt-1.5 text-[17px] font-medium text-text-primary">
                        {formatNumber(
                          preview.totalRows,
                        )}
                      </p>

                    </div>


                    <div className="border-t border-[#EBEDEF] py-4 sm:border-l sm:border-t-0 sm:px-6 sm:py-0">

                      <p className="text-[11px] text-[#969BA1]">
                        Aba identificada
                      </p>


                      <p className="mt-1.5 truncate text-[14px] font-medium text-text-primary">
                        {preview.sheetName}
                      </p>

                    </div>


                    <div className="border-t border-[#EBEDEF] pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">

                      <p className="text-[11px] text-[#969BA1]">
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

                </div>
              )}


            {/* =============================================
                PROCESSANDO + MODELO ML
            ============================================== */}

            {status ===
              "processing" && (
              <div className="py-10">

                <div className="flex items-start gap-3">

                  <LoaderCircle
                    size={19}
                    className="mt-0.5 animate-spin text-[#F40009]"
                  />


                  <div>

                    <p className="text-[14px] font-medium text-[#292C30]">
                      Importando e analisando dados
                    </p>


                    <p className="mt-1 max-w-[590px] text-[12px] leading-6 text-[#868B91]">
                      Os apontamentos estão sendo armazenados.
                      Em seguida, as ocorrências elegíveis são
                      analisadas automaticamente pelo Modelo ML.
                    </p>

                  </div>

                </div>


                <div className="mt-7 overflow-hidden rounded-full bg-[#ECEEEF]">

                  <div className="h-[5px] w-1/2 animate-pulse rounded-full bg-[#F40009]" />

                </div>


                <p className="mt-4 text-[11px] leading-5 text-[#A0A4A9]">
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

                      <p className="text-[14px] font-medium text-[#292C30]">
                        Importação concluída
                      </p>


                      <p className="mt-1 text-[12px] leading-6 text-[#868B91]">
                        {mlCompleted
                          ? "Os registros foram armazenados e as sugestões do Modelo ML estão prontas para revisão."
                          : "Os registros foram armazenados com sucesso."}
                      </p>

                    </div>

                  </div>


                  {/* =========================================
                      RESUMO PRINCIPAL
                  ========================================== */}

                  <div className="mt-7 grid border-y border-[#EBEDEF] py-6 sm:grid-cols-3">

                    <div>

                      <p className="text-[11px] text-[#969BA1]">
                        Importados
                      </p>


                      <p className="mt-1.5 text-[20px] font-medium text-text-primary">
                        {formatNumber(
                          importedCount,
                        )}
                      </p>


                      {ignoredCount >
                        0 && (
                        <p className="mt-1 text-[10px] text-[#A0A4A9]">
                          {formatNumber(
                            ignoredCount,
                          )}{" "}
                          ignorado(s)
                        </p>
                      )}

                    </div>


                    <div className="border-t border-[#EBEDEF] py-4 sm:border-l sm:border-t-0 sm:px-6 sm:py-0">

                      <p className="text-[11px] text-[#969BA1]">
                        Analisados pelo ML
                      </p>


                      <p className="mt-1.5 text-[20px] font-medium text-text-primary">
                        {formatNumber(
                          mlProcessedCount,
                        )}
                      </p>


                      {mlAvailable && (
                        <p className="mt-1 text-[10px] text-[#A0A4A9]">
                          de{" "}
                          {formatNumber(
                            mlEligibleCount,
                          )}{" "}
                          elegíveis
                        </p>
                      )}

                    </div>


                    <div className="border-t border-[#EBEDEF] pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">

                      <p className="text-[11px] text-[#969BA1]">
                        Aguardando revisão
                      </p>


                      <p className="mt-1.5 text-[20px] font-medium text-text-primary">
                        {formatNumber(
                          suggestionsCount,
                        )}
                      </p>


                      <p className="mt-1 text-[10px] text-[#A0A4A9]">
                        sugestões geradas
                      </p>

                    </div>

                  </div>


                  {/* =========================================
                      MODELO ML
                  ========================================== */}

                  {mlResult && (
                    <div className="mt-6 rounded-[14px] bg-[#F7F8F9] px-5 py-4">

                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                        <div>

                          <p className="text-[11px] font-medium text-[#777C82]">
                            Modelo ML
                          </p>


                          <p className="mt-1 text-[12px] font-medium text-text-primary">
                            {mlResult.modelVersion ??
                              "Indisponível"}
                          </p>

                        </div>


                        <div className="sm:text-right">

                          <p className="text-[11px] text-[#969BA1]">
                            Status
                          </p>


                          <div className="mt-1 flex items-center gap-2 sm:justify-end">

                            <span
                              className={`h-2 w-2 rounded-full ${
                                mlCompleted
                                  ? "bg-[#238636]"
                                  : mlAvailable
                                    ? "bg-[#D29922]"
                                    : "bg-[#D1242F]"
                              }`}
                            />


                            <p className="text-[12px] font-medium text-text-body">
                              {mlCompleted
                                ? "Concluído"
                                : mlResult.status ===
                                    "PARTIAL"
                                  ? "Concluído parcialmente"
                                  : "Indisponível"}
                            </p>

                          </div>

                        </div>

                      </div>


                      {mlFailedCount >
                        0 && (
                        <p className="mt-4 border-t border-border-theme transition-colors pt-4 text-[11px] text-[#868B91]">
                          {formatNumber(
                            mlFailedCount,
                          )}{" "}
                          apontamento(s) apresentaram erro durante a análise.
                        </p>
                      )}

                    </div>
                  )}


                  {/* =========================================
                      AVISO
                  ========================================== */}

                  {warning && (
                    <div className="mt-5 flex items-start gap-3 rounded-[12px] border border-[#F0D7D9] bg-[#FFF8F8] px-4 py-3">

                      <AlertCircle
                        size={17}
                        className="mt-0.5 shrink-0 text-[#D1242F]"
                      />


                      <p className="text-[12px] leading-6 text-[#6F747A]">
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
                      className="text-left text-[12px] font-medium text-[#777C82] transition-colors hover:text-[#292C30]"
                    >
                      Importar outro arquivo
                    </button>


                    <div className="flex flex-col gap-3 sm:flex-row">

                      <Link
                        href="/dashboard/historico"
                        className="rounded-[10px] border border-[#D9DCE0] bg-background-primary transition-colors px-6 py-3 text-center text-[13px] font-semibold text-[#3D4146] transition-colors hover:border-[#BFC3C8] hover:bg-surface-elevated transition-colors"
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


                    {preview
                      .missingColumns
                      .length >
                      0 && (
                      <div className="mt-4">

                        <p className="text-[11px] font-medium text-[#777C82]">
                          Colunas ausentes
                        </p>


                        <p className="mt-2 text-[11px] leading-6 text-[#969BA1]">
                          {preview
                            .missingColumns
                            .join(
                              ", ",
                            )}
                        </p>

                      </div>
                    )}

                  </div>

                </div>
              )}


            {/* =============================================
                ERRO
            ============================================== */}

            {status ===
              "error" && (
                <div className="mt-8 border-t border-[#ECEDEF] pt-7">

                  <div className="flex items-start gap-3">

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


                  <div className="mt-6">

                    <button
                      type="button"
                      onClick={
                        clearFile
                      }
                      className="text-[12px] font-medium text-[#777C82] transition-colors hover:text-[#292C30]"
                    >
                      Selecionar outro arquivo
                    </button>

                  </div>

                </div>
              )}

          </div>
        )}

      </section>

    </main>
  );
}