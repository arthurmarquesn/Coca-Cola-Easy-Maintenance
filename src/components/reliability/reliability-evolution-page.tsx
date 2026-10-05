"use client";



import Image from "next/image";

import Link from "next/link";



import {

  ArrowLeft,

  LoaderCircle,

} from "lucide-react";



import {

  useCallback,

  useEffect,

  useMemo,

  useState,

} from "react";



import {

  ReliabilityTimeline,

} from "@/components/reliability/reliability-timeline";



import {

  ReliabilityToolbar,

} from "@/components/reliability/reliability-toolbar";


import {

  useReliabilityFilters,

} from "@/components/reliability/reiliability-filters-provider";



import {

  UnitFilter,

} from "@/components/units/unit-filter";



/* =========================================================

   TIPOS

========================================================= */



interface ReliabilityEvolutionPageProps {

  user: {

    name: string;

  };



  unit: {

    city: string | null;

  };

}



interface ReliabilityUnit {

  id: number;

  code: string | null;

  name: string;

  city: string | null;

  state: string | null;

}



interface ReliabilityEvolutionData {

  success?: boolean;

  message?: string;



  filters: {

    selectedUnitIds: number[];

    selectedUnits: ReliabilityUnit[];



    startDate: string | null;

    endDate: string | null;



    line: string | null;

    equipment: string | null;



    options: {

      lines: string[];

      equipments: string[];

    };

  };



  summary: {

    events: number;

    downtimeMinutes: number;

    groups: number;

  };

}



/* =========================================================

   HELPERS

========================================================= */



function parseNumber(

  value: unknown,

): number {

  if (

    typeof value ===

    "number"

  ) {

    return Number.isFinite(

      value,

    )

      ? value

      : Number.NaN;

  }



  if (

    typeof value !==

    "string"

  ) {

    return Number.NaN;

  }



  let text =

    value

      .trim()

      .replace(

        /\s+/g,

        "",

      );



  if (!text) {

    return Number.NaN;

  }



  if (

    text.includes(",")

  ) {

    if (

      text.includes(".")

    ) {

      text =

        text.replace(

          /\./g,

          "",

        );

    }



    text =

      text.replace(

        ",",

        ".",

      );

  }



  const parsed =

    Number(

      text,

    );



  return Number.isFinite(

    parsed,

  )

    ? parsed

    : Number.NaN;

}



function safeNonNegative(

  value: unknown,

  fallback = 0,

): number {

  const parsed =

    parseNumber(

      value,

    );



  if (

    !Number.isFinite(

      parsed,

    ) ||

    parsed < 0

  ) {

    return fallback;

  }



  return parsed;

}



function normalizeUnit(

  value: unknown,

): ReliabilityUnit | null {

  if (

    !value ||

    typeof value !==

      "object"

  ) {

    return null;

  }



  const source =

    value as Record<

      string,

      unknown

    >;



  const id =

    Number(

      source.id,

    );



  if (

    !Number.isInteger(

      id,

    ) ||

    id <= 0

  ) {

    return null;

  }



  const name =

    typeof source.name ===

      "string"

      ? source.name.trim()

      : "";



  if (!name) {

    return null;

  }



  return {

    id,



    code:

      typeof source.code ===

        "string"

        ? source.code.trim() ||

          null

        : null,



    name,



    city:

      typeof source.city ===

        "string"

        ? source.city.trim() ||

          null

        : null,



    state:

      typeof source.state ===

        "string"

        ? source.state.trim() ||

          null

        : null,

  };

}



function getUnitLabel(

  unit: ReliabilityUnit,

): string {

  return (

    unit.city?.trim() ||

    unit.name?.trim() ||

    unit.code?.trim() ||

    `Unidade ${unit.id}`

  );

}



/* =========================================================

   NORMALIZAÇÃO

========================================================= */



function normalizeData(

  raw: unknown,

): ReliabilityEvolutionData {

  const source =

    raw &&

    typeof raw ===

      "object"

      ? raw as Record<

          string,

          unknown

        >

      : {};



  const filtersRaw =

    source.filters &&

    typeof source.filters ===

      "object"

      ? source.filters as Record<

          string,

          unknown

        >

      : {};



  const optionsRaw =

    filtersRaw.options &&

    typeof filtersRaw.options ===

      "object"

      ? filtersRaw.options as Record<

          string,

          unknown

        >

      : {};



  const summaryRaw =

    source.summary &&

    typeof source.summary ===

      "object"

      ? source.summary as Record<

          string,

          unknown

        >

      : {};



  const selectedUnitIds =

    Array.isArray(

      filtersRaw.selectedUnitIds,

    )

      ? [

          ...new Set(

            filtersRaw.selectedUnitIds

              .map(

                (

                  value,

                ) =>

                  Number(

                    value,

                  ),

              )

              .filter(

                (

                  value,

                ) =>

                  Number.isInteger(

                    value,

                  ) &&

                  value >

                    0,

              ),

          ),

        ]

      : [];



  const selectedUnits =

    Array.isArray(

      filtersRaw.selectedUnits,

    )

      ? filtersRaw.selectedUnits

          .map(

            normalizeUnit,

          )

          .filter(

            (

              value,

            ): value is ReliabilityUnit =>

              value !==

              null,

          )

      : [];



  const lines =

    Array.isArray(

      optionsRaw.lines,

    )

      ? optionsRaw.lines.filter(

          (

            value,

          ): value is string =>

            typeof value ===

            "string",

        )

      : [];



  const equipments =

    Array.isArray(

      optionsRaw.equipments,

    )

      ? optionsRaw.equipments.filter(

          (

            value,

          ): value is string =>

            typeof value ===

            "string",

        )

      : [];



  return {

    success:

      source.success ===

      true,



    message:

      typeof source.message ===

        "string"

        ? source.message

        : undefined,



    filters: {

      selectedUnitIds,



      selectedUnits,



      startDate:

        typeof filtersRaw.startDate ===

          "string"

          ? filtersRaw.startDate

          : null,



      endDate:

        typeof filtersRaw.endDate ===

          "string"

          ? filtersRaw.endDate

          : null,



      line:

        typeof filtersRaw.line ===

          "string"

          ? filtersRaw.line

          : null,



      equipment:

        typeof filtersRaw.equipment ===

          "string"

          ? filtersRaw.equipment

          : null,



      options: {

        lines,

        equipments,

      },

    },



    summary: {

      events:

        safeNonNegative(

          summaryRaw.events,

        ),



      downtimeMinutes:

        safeNonNegative(

          summaryRaw.downtimeMinutes,

        ),



      groups:

        safeNonNegative(

          summaryRaw.groups,

        ),

    },

  };

}



/* =========================================================

   PÁGINA

========================================================= */



export function ReliabilityEvolutionPage({

  user,

  unit,

}: ReliabilityEvolutionPageProps) {

  const {

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

  } =

    useReliabilityFilters();



  const [

    data,

    setData,

  ] =

    useState<

      ReliabilityEvolutionData | null

    >(null);



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

    useState("");



  /* =======================================================

     CARREGAMENTO DA BASE GLOBAL



     A timeline possui carregamento próprio.



     Esta chamada existe para:

     - toolbar;

     - unidades;

     - linhas;

     - equipamentos;

     - indicadores globais.

  ======================================================= */



  const loadData =

    useCallback(

      async (

        signal?: AbortSignal,

      ) => {

        setLoading(

          true,

        );



        setError(

          "",

        );



        try {

          const params =

            new URLSearchParams();



          if (

            startDate

          ) {

            params.set(

              "startDate",

              startDate,

            );

          }



          if (

            endDate

          ) {

            params.set(

              "endDate",

              endDate,

            );

          }



          if (

            line

          ) {

            params.set(

              "line",

              line,

            );

          }



          if (

            equipment

          ) {

            params.set(

              "equipment",

              equipment,

            );

          }



          const response =

            await fetch(

              `/api/analytics/reliability?${params.toString()}`,

              {

                cache:

                  "no-store",



                signal,

              },

            );



          const raw =

            await response.json();



          if (

            !response.ok ||

            !raw?.success

          ) {

            throw new Error(

              raw?.message ??

                "Não foi possível carregar os dados de confiabilidade.",

            );

          }



          setData(

            normalizeData(

              raw,

            ),

          );

        } catch (

          requestError

        ) {

          if (

            requestError instanceof

              DOMException &&

            requestError.name ===

              "AbortError"

          ) {

            return;

          }



          setError(

            requestError instanceof

              Error

              ? requestError.message

              : "Não foi possível carregar os dados de confiabilidade.",

          );

        } finally {

          if (

            !signal

              ?.aborted

          ) {

            setLoading(

              false,

            );

          }

        }

      },

      [

        startDate,

        endDate,

        line,

        equipment,

      ],

    );



  useEffect(() => {

    const controller =

      new AbortController();



    const timeoutId =

      window.setTimeout(

        () => {

          void loadData(

            controller.signal,

          );

        },

        0,

      );



    return () => {

      window.clearTimeout(

        timeoutId,

      );



      controller.abort();

    };

  }, [

    loadData,

  ]);



  /* =======================================================

     TROCA DE UNIDADE

  ======================================================= */



  const handleUnitSelectionApplied =

    useCallback(

      async () => {

        if (

          line ||

          equipment

        ) {

          clearAssetFilters();

          return;

        }



        await loadData();

      },

      [

        clearAssetFilters,

        loadData,

        line,

        equipment,

      ],

    );



  /* =======================================================

     LABEL DA UNIDADE

  ======================================================= */



  const selectedUnitsLabel =

    useMemo(

      () => {

        const selectedUnits =

          data

            ?.filters

            .selectedUnits ??

          [];



        if (

          selectedUnits.length ===

            0

        ) {

          return (

            unit.city ??

            "Unidade atual"

          );

        }



        if (

          selectedUnits.length ===

            1

        ) {

          return getUnitLabel(

            selectedUnits[

              0

            ],

          );

        }



        return `${selectedUnits.length} unidades selecionadas`;

      },

      [

        data,

        unit.city,

      ],

    );



  /* =======================================================

     FILTROS

  ======================================================= */



  const lines =

    data

      ?.filters

      .options

      .lines ??

    [];



  const equipments =

    data

      ?.filters

      .options

      .equipments ??

    [];



  /* =======================================================

     RENDER

  ======================================================= */



  return (

    <main className="min-h-screen bg-[#F7F7F6]">

      {/* ===================================================

          HEADER GLOBAL

      ==================================================== */}



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



          <div className="flex items-center gap-3 sm:gap-5">

            <UnitFilter

              fallbackLabel={

                unit.city

              }

              onSelectionApplied={

                handleUnitSelectionApplied

              }

            />



            <div className="hidden h-8 w-px bg-black/[0.07] sm:block" />



            <div className="hidden text-right sm:block">

              <p className="text-[13px] font-medium text-[#25272A]">

                {user.name}

              </p>



              <p className="mt-0.5 text-[10px] text-[#999DA2]">

                Análise de confiabilidade

              </p>

            </div>

          </div>

        </div>

      </header>



      {/* ===================================================

          CONTEÚDO

      ==================================================== */}



      <div className="mx-auto w-full max-w-[1380px] px-6 pb-16 pt-7 sm:px-8 lg:px-12">

        <Link

          href="/dashboard"

          className="inline-flex items-center gap-2 text-[12px] font-medium text-[#81868C] transition-colors hover:text-[#282B2F]"

        >

          <ArrowLeft

            size={15}

          />



          Voltar

        </Link>



        {/* =================================================

            TÍTULO

        ================================================== */}



        <div className="mt-6">

          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A2A6AB]">

            Engenharia de confiabilidade

          </p>



          <h1 className="mt-2 text-[34px] font-semibold tracking-[-0.045em] text-[#191B1E] sm:text-[40px]">

            Confiabilidade

          </h1>

        </div>



        {/* =================================================

            NAVEGAÇÃO

        ================================================== */}



        <nav

          aria-label="Navegação da confiabilidade"

          className="mt-6 overflow-x-auto border-b border-black/[0.055]"

        >

          <div className="flex min-w-max items-center gap-7">

            <Link

              href="/dashboard/confiabilidade"

              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"

            >

              Visão geral

            </Link>



            <Link

              href="/dashboard/confiabilidade/origens"

              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"

            >

              Origens

            </Link>



            <Link

              href="/dashboard/confiabilidade/evolucao"

              aria-current="page"

              className="relative pb-3 text-[11px] font-semibold text-[#202327]"

            >

              Evolução



              <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#E41E2B]" />

            </Link>



            <Link

              href="/dashboard/confiabilidade/falhas"

              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"

            >

              Falhas recorrentes

            </Link>



            <Link

              href="/dashboard/confiabilidade/linhas"

              className="pb-3 text-[11px] font-medium text-[#92979D] transition-colors hover:text-[#34383D]"

            >

              Linhas

            </Link>

          </div>

        </nav>



        {/* =================================================

            TOOLBAR

        ================================================== */}



        {data && (

          <ReliabilityToolbar

            selectedUnitsLabel={

              selectedUnitsLabel

            }

            startDate={

              startDate

            }

            endDate={

              endDate

            }

            line={

              line

            }

            equipment={

              equipment

            }

            lines={

              lines

            }

            equipments={

              equipments

            }

            events={

              data.summary.events

            }

            downtimeMinutes={

              data.summary.downtimeMinutes

            }

            loading={

              loading

            }

            onStartDateChange={

              setStartDate

            }

            onEndDateChange={

              setEndDate

            }

            onLineChange={

              setLine

            }

            onEquipmentChange={

              setEquipment

            }

            onResetFilters={

              resetFilters

            }

          />

        )}



        {/* =================================================

            ERRO

        ================================================== */}



        {error && (

          <div className="mt-8 rounded-[14px] border border-[#F0D2D5] bg-[#FFF8F8] px-4 py-3 text-[12px] text-[#BF2C35]">

            {error}

          </div>

        )}



        {/* =================================================

            LOADING INICIAL

        ================================================== */}



        {loading &&

          !data && (

            <div className="flex min-h-[420px] items-center justify-center">

              <LoaderCircle

                size={22}

                className="animate-spin text-[#E41E2B]"

              />

            </div>

          )}



        {/* =================================================

            EVOLUÇÃO TEMPORAL

        ================================================== */}



        {data && (

          <ReliabilityTimeline

            startDate={

              startDate

            }

            endDate={

              endDate

            }

            line={

              line ||

              null

            }

            equipment={

              equipment ||

              null

            }

          />

        )}

      </div>

    </main>

  );

}