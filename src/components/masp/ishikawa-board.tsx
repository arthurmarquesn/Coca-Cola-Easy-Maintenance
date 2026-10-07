"use client";

import {
  Download,
  LoaderCircle,
} from "lucide-react";

import {
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type MaspCategory,
} from "@/lib/masp/domain";


export interface IshikawaHypothesis {
  id: number;
  category: MaspCategory;
  description: string;
  status: string;
  source: string;
  support_count: number;
}


interface BranchLayout {
  category: MaspCategory;
  anchorX: number;
  tipX: number;
  tipY: number;
  side:
    | "TOP"
    | "BOTTOM";
}


const LABELS:
Record<MaspCategory, string> = {
  MAQUINA:
    "Máquina",
  METODO:
    "Método",
  MAO_DE_OBRA:
    "Mão de obra",
  MATERIAL:
    "Material",
  MEDICAO:
    "Medição",
  MEIO_AMBIENTE:
    "Meio ambiente",
};


const SOURCE_LABELS:
Record<string, string> = {
  HISTORY:
    "Histórico local",
  RULE:
    "Regra local",
  ANALYST:
    "Analista",
};


const STATUS_LABELS:
Record<string, string> = {
  OPEN:
    "Aberta",
  PROBABLE:
    "Provável",
  CONFIRMED:
    "Confirmada",
  DISCARDED:
    "Descartada",
};


const STATUS_COLORS:
Record<string, string> = {
  OPEN:
    "#8A9096",
  PROBABLE:
    "#C48A16",
  CONFIRMED:
    "#2F8A57",
  DISCARDED:
    "#B8BDC2",
};


const BRANCHES:
BranchLayout[] = [
  {
    category:
      "MAQUINA",
    anchorX:
      390,
    tipX:
      170,
    tipY:
      105,
    side:
      "TOP",
  },
  {
    category:
      "METODO",
    anchorX:
      700,
    tipX:
      480,
    tipY:
      105,
    side:
      "TOP",
  },
  {
    category:
      "MATERIAL",
    anchorX:
      1010,
    tipX:
      790,
    tipY:
      105,
    side:
      "TOP",
  },
  {
    category:
      "MAO_DE_OBRA",
    anchorX:
      390,
    tipX:
      170,
    tipY:
      675,
    side:
      "BOTTOM",
  },
  {
    category:
      "MEDICAO",
    anchorX:
      700,
    tipX:
      480,
    tipY:
      675,
    side:
      "BOTTOM",
  },
  {
    category:
      "MEIO_AMBIENTE",
    anchorX:
      1010,
    tipX:
      790,
    tipY:
      675,
    side:
      "BOTTOM",
  },
];


const MOBILE_ORDER:
MaspCategory[] = [
  "MAQUINA",
  "METODO",
  "MATERIAL",
  "MAO_DE_OBRA",
  "MEDICAO",
  "MEIO_AMBIENTE",
];


const VISIBLE_CAUSES =
  3;


function truncateText(
  value: string,
  maxLength: number,
): string {
  const cleaned =
    value.trim();

  return cleaned.length <=
    maxLength
    ? cleaned
    : `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}


function wrapText(
  value: string,
  maxCharacters: number,
  maxLines: number,
): string[] {
  const words =
    value
      .trim()
      .split(
        /\s+/,
      );

  const lines:
    string[] = [];

  for (
    const word
    of words
  ) {
    const current =
      lines[
        lines.length - 1
      ];

    if (
      !current
    ) {
      lines.push(
        word,
      );
    } else if (
      `${current} ${word}`
        .length <=
      maxCharacters
    ) {
      lines[
        lines.length - 1
      ] =
        `${current} ${word}`;
    } else if (
      lines.length <
      maxLines
    ) {
      lines.push(
        word,
      );
    } else {
      lines[
        lines.length - 1
      ] =
        truncateText(
          `${current} ${word}`,
          maxCharacters,
        );

      break;
    }
  }

  return lines.slice(
    0,
    maxLines,
  );
}


function sourceLabel(
  value: string,
): string {
  return SOURCE_LABELS[
    value
  ] ??
    value;
}


function statusLabel(
  value: string,
): string {
  return STATUS_LABELS[
    value
  ] ??
    value;
}


function statusColor(
  value: string,
): string {
  return STATUS_COLORS[
    value
  ] ??
    "var(--text-secondary)";
}


function downloadBlob(
  blob: Blob,
  filename: string,
) {
  const url =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    document.createElement(
      "a",
    );

  anchor.href =
    url;

  anchor.download =
    filename;

  document.body.appendChild(
    anchor,
  );

  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(
    url,
  );
}


export function IshikawaBoard({
  maspId,
  problem,
  hypotheses,
  onSelect,
}: {
  maspId: number;
  problem: string;
  hypotheses:
    IshikawaHypothesis[];
  onSelect?: (
    hypothesis:
      IshikawaHypothesis,
  ) => void;
}) {
  const svgRef =
    useRef<
      SVGSVGElement | null
    >(null);

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
    useState("");

  const visibleHypotheses =
    useMemo(
      () =>
        hypotheses.filter(
          (
            item,
          ) =>
            item.status !==
            "DISCARDED",
        ),
      [
        hypotheses,
      ],
    );

  const byCategory =
    useMemo(
      () =>
        new Map(
          MOBILE_ORDER.map(
            (
              category,
            ) => [
              category,
              visibleHypotheses.filter(
                (
                  item,
                ) =>
                  item.category ===
                  category,
              ),
            ],
          ),
        ),
      [
        visibleHypotheses,
      ],
    );

  const problemLines =
    wrapText(
      problem,
      31,
      5,
    );

  async function exportPng() {
    const svg =
      svgRef.current;

    if (
      !svg
    ) {
      setExportError(
        "O gráfico ainda não está disponível para exportação.",
      );

      return;
    }

    setExporting(
      true,
    );

    setExportError("");

    let sourceUrl:
      string | null =
      null;

    try {
      const serialized =
        new XMLSerializer()
          .serializeToString(
            svg,
          );

      const sourceBlob =
        new Blob(
          [
            serialized,
          ],
          {
            type:
              "image/svg+xml;charset=utf-8",
          },
        );

      sourceUrl =
        URL.createObjectURL(
          sourceBlob,
        );

      const image =
        new Image();

      await new Promise<void>(
        (
          resolve,
          reject,
        ) => {
          image.onload =
            () =>
              resolve();

          image.onerror =
            () =>
              reject(
                new Error(
                  "Não foi possível renderizar o SVG.",
                ),
              );

          image.src =
            sourceUrl as string;
        },
      );

      const scale =
        2;

      const canvas =
        document.createElement(
          "canvas",
        );

      canvas.width =
        1400 *
        scale;

      canvas.height =
        780 *
        scale;

      const context =
        canvas.getContext(
          "2d",
        );

      if (
        !context
      ) {
        throw new Error(
          "O navegador não disponibilizou o Canvas.",
        );
      }

      context.fillStyle =
        "#FCFCFB";

      context.fillRect(
        0,
        0,
        canvas.width,
        canvas.height,
      );

      context.drawImage(
        image,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      const png =
        await new Promise<
          Blob | null
        >(
          (
            resolve,
          ) =>
            canvas.toBlob(
              resolve,
              "image/png",
            ),
        );

      if (
        !png ||
        png.size ===
          0
      ) {
        throw new Error(
          "O arquivo PNG gerado está vazio.",
        );
      }

      downloadBlob(
        png,
        `ishikawa-masp-${maspId}.png`,
      );
    } catch (
      error
    ) {
      setExportError(
        error instanceof
          Error
          ? error.message
          : "Não foi possível exportar o Ishikawa.",
      );
    } finally {
      if (
        sourceUrl
      ) {
        URL.revokeObjectURL(
          sourceUrl,
        );
      }

      setExporting(
        false,
      );
    }
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-border-theme bg-surface-elevated">
      <div className="flex flex-col gap-4 border-b border-border-theme px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-text-secondary">
            Diagrama de causa e efeito
          </p>

          <p className="mt-1 text-[12px] text-text-primary">
            Hipóteses organizadas pelos 6M
          </p>
        </div>

        <button
          type="button"
          disabled={
            exporting
          }
          onClick={() =>
            void exportPng()
          }
          className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-[11px] border border-border-theme bg-surface px-4 text-[11px] font-semibold text-text-primary hover:border-border-theme hover:bg-surface-hover disabled:opacity-60 sm:self-auto"
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

          Exportar Ishikawa
        </button>
      </div>

      {exportError && (
        <p className="mx-5 mt-4 rounded-[12px] border border-accent-primary/30 bg-accent-soft px-3.5 py-3 text-[11px] text-accent-primary sm:mx-7">
          {exportError}
        </p>
      )}

      <div className="hidden p-5 lg:block xl:p-7">
        <svg
          ref={
            svgRef
          }
          viewBox="0 0 1400 780"
          role="img"
          aria-labelledby={`ishikawa-title-${maspId} ishikawa-description-${maspId}`}
          className="h-auto w-full"
          style={{
            fontFamily:
              "Arial, sans-serif",
          }}
        >
          <title
            id={`ishikawa-title-${maspId}`}
          >
            Diagrama de Ishikawa do MASP #{maspId}
          </title>

          <desc
            id={`ishikawa-description-${maspId}`}
          >
            Hipóteses dos seis grupos de causa ligadas ao problema observado.
          </desc>

          <rect
            width="1400"
            height="780"
            rx="24"
            fill="var(--surface)"
          />

          <line
            x1="115"
            y1="390"
            x2="1135"
            y2="390"
            stroke="var(--text-secondary)"
            strokeWidth="5"
            strokeLinecap="round"
          />

          <path
            d="M 115 390 L 55 320 M 115 390 L 55 460"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="4"
            strokeLinecap="round"
          />

          <path
            d="M 1135 390 L 1108 374 L 1108 406 Z"
            fill="var(--text-secondary)"
          />

          {BRANCHES.map(
            (
              branch,
            ) => {
              const items =
                byCategory.get(
                  branch.category,
                ) ??
                [];

              const shown =
                items.slice(
                  0,
                  VISIBLE_CAUSES,
                );

              const remaining =
                items.length -
                shown.length;

              const spineY =
                390;

              return (
                <g
                  key={
                    branch.category
                  }
                >
                  <line
                    x1={
                      branch.tipX
                    }
                    y1={
                      branch.tipY
                    }
                    x2={
                      branch.anchorX
                    }
                    y2={
                      spineY
                    }
                    stroke="var(--text-body)"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />

                  <circle
                    cx={
                      branch.anchorX
                    }
                    cy={
                      spineY
                    }
                    r="7"
                    fill="var(--accent-primary)"
                  />

                  <text
                    x={
                      branch.tipX
                    }
                    y={
                      branch.side ===
                        "TOP"
                        ? branch.tipY -
                          22
                        : branch.tipY +
                          34
                    }
                    fontSize="19"
                    fontWeight="700"
                    fill="var(--text-primary)"
                  >
                    {LABELS[
                      branch.category
                    ]}
                  </text>

                  <text
                    x={
                      branch.tipX
                    }
                    y={
                      branch.side ===
                        "TOP"
                        ? branch.tipY +
                          2
                        : branch.tipY +
                          56
                    }
                    fontSize="12"
                    fontWeight="600"
                    fill="var(--text-secondary)"
                  >
                    {items.length}{" "}
                    {items.length ===
                      1
                      ? "causa"
                      : "causas"}
                  </text>

                  {shown.map(
                    (
                      item,
                      index,
                    ) => {
                      const ratio =
                        0.27 +
                        index *
                          0.22;

                      const x =
                        branch.tipX +
                        (
                          branch.anchorX -
                          branch.tipX
                        ) *
                          ratio;

                      const y =
                        branch.tipY +
                        (
                          spineY -
                          branch.tipY
                        ) *
                          ratio;

                      const textY =
                        branch.side ===
                          "TOP"
                          ? y -
                            10
                          : y +
                            22;

                      const metaY =
                        branch.side ===
                          "TOP"
                          ? y +
                            7
                          : y +
                            39;

                      return (
                        <g
                          key={
                            item.id
                          }
                          role="button"
                          tabIndex={
                            onSelect
                              ? 0
                              : undefined
                          }
                          aria-label={`${item.description}. ${sourceLabel(item.source)}. ${statusLabel(item.status)}.`}
                          onClick={() =>
                            onSelect?.(
                              item,
                            )
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
                              event.preventDefault();

                              onSelect?.(
                                item,
                              );
                            }
                          }}
                          className={
                            onSelect
                              ? "cursor-pointer outline-none"
                              : undefined
                          }
                        >
                          <line
                            x1={
                              x -
                              176
                            }
                            y1={
                              y
                            }
                            x2={
                              x
                            }
                            y2={
                              y
                            }
                            stroke="var(--text-muted)"
                            strokeWidth="2"
                          />

                          <circle
                            cx={
                              x -
                              168
                            }
                            cy={
                              y
                            }
                            r="5"
                            fill={
                              statusColor(
                                item.status,
                              )
                            }
                          />

                          <text
                            x={
                              x -
                              158
                            }
                            y={
                              textY
                            }
                            fontSize="13"
                            fontWeight="600"
                            fill="var(--text-primary)"
                          >
                            {truncateText(
                              item.description,
                              27,
                            )}
                          </text>

                          <text
                            x={
                              x -
                              158
                            }
                            y={
                              metaY
                            }
                            fontSize="9"
                            fontWeight="600"
                            fill="var(--text-secondary)"
                          >
                            {sourceLabel(
                              item.source,
                            )}
                            {" · "}
                            {statusLabel(
                              item.status,
                            )}
                          </text>
                        </g>
                      );
                    },
                  )}

                  {remaining >
                    0 && (
                    <text
                      x={
                        branch.anchorX -
                        118
                      }
                      y={
                        branch.side ===
                          "TOP"
                          ? 350
                          : 445
                      }
                      fontSize="11"
                      fontWeight="700"
                      fill="var(--accent-primary)"
                    >
                      +{remaining} causas
                    </text>
                  )}
                </g>
              );
            },
          )}

          <g>
            <rect
              x="1138"
              y="275"
              width="242"
              height="230"
              rx="24"
              fill="var(--accent-primary)"
            />

            <text
              x="1164"
              y="314"
              fontSize="11"
              fontWeight="700"
              letterSpacing="1.6"
              fill="var(--surface)"
              opacity="0.7"
            >
              EFEITO OBSERVADO
            </text>

            {problemLines.map(
              (
                line,
                index,
              ) => (
                <text
                  key={`${line}-${index}`}
                  x="1164"
                  y={
                    354 +
                    index *
                      28
                  }
                  fontSize="16"
                  fontWeight="700"
                  fill="var(--surface)"
                >
                  {line}
                </text>
              ),
            )}
          </g>
        </svg>
      </div>

      <div className="space-y-3 p-4 lg:hidden">
        <div className="rounded-[15px] bg-accent-primary p-4 text-white">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-white/65">
            Efeito observado
          </p>
          <p className="mt-2 text-[13px] font-semibold leading-5">
            {problem}
          </p>
        </div>

        {MOBILE_ORDER.map(
          (
            category,
          ) => {
            const items =
              byCategory.get(
                category,
              ) ??
              [];

            return (
              <details
                key={
                  category
                }
                className="group rounded-[15px] border border-border-theme bg-surface"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
                  <span className="text-[11px] font-semibold text-text-primary">
                    {LABELS[
                      category
                    ]}
                  </span>

                  <span className="rounded-full bg-surface-elevated px-2.5 py-1 text-[9px] font-semibold text-text-secondary">
                    {items.length}
                  </span>
                </summary>

                <div className="space-y-2 border-t border-border-theme p-3">
                  {items.length ===
                    0 ? (
                    <p className="py-3 text-center text-[10px] text-text-secondary">
                      Sem hipóteses
                    </p>
                  ) : (
                    items.map(
                      (
                        item,
                      ) => (
                        <button
                          key={
                            item.id
                          }
                          type="button"
                          onClick={() =>
                            onSelect?.(
                              item,
                            )
                          }
                          className="w-full rounded-[11px] bg-surface-elevated px-3 py-2.5 text-left hover:bg-accent-primary/10"
                        >
                          <span className="flex items-start gap-2">
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  statusColor(
                                    item.status,
                                  ),
                              }}
                            />

                            <span className="text-[11px] font-medium leading-5 text-text-primary">
                              {item.description}
                            </span>
                          </span>

                          <span className="mt-1 block pl-4 text-[8px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
                            {sourceLabel(
                              item.source,
                            )}
                            {" · "}
                            {statusLabel(
                              item.status,
                            )}
                          </span>
                        </button>
                      ),
                    )
                  )}
                </div>
              </details>
            );
          },
        )}
      </div>
    </section>
  );
}
