"use client";

import { useInitialRequest } from "@/lib/use-initial-request";

import {
  Building2,
  Check,
  ChevronDown,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";


/* =========================================================
   TYPES
========================================================= */

interface UnitOption {
  id: number;

  code:
    | string
    | null;

  name:
    string;

  city:
    | string
    | null;

  state:
    | string
    | null;

  isDefault:
    boolean;

  selected:
    boolean;
}


interface UnitsResponse {
  success:
    boolean;

  message?:
    string;

  selectedUnitIds?:
    number[];

  totalSelected?:
    number;

  totalAvailable?:
    number;

  allSelected?:
    boolean;

  units?:
    UnitOption[];
}


interface SelectionResponse {
  success:
    boolean;

  message?:
    string;

  selectedUnitIds?:
    number[];

  totalSelected?:
    number;
}


interface UnitFilterProps {
  fallbackLabel?:
    | string
    | null;

  onSelectionApplied?: (
    selectedUnitIds:
      number[],
  ) =>
    | void
    | Promise<void>;
}


/* =========================================================
   HELPERS
========================================================= */

function getUnitLabel(
  unit:
    UnitOption,
): string {
  return (
    unit.city?.trim() ||
    unit.name?.trim() ||
    unit.code?.trim() ||
    `Unidade ${unit.id}`
  );
}


function getUnitDescription(
  unit:
    UnitOption,
): string {
  return [
    unit.code,

    unit.name !==
    getUnitLabel(
      unit,
    )
      ? unit.name
      : null,

    unit.state,
  ]
    .filter(
      Boolean,
    )
    .join(
      " · ",
    );
}


/* =========================================================
   COMPONENT
========================================================= */

export function UnitFilter({
  fallbackLabel,
  onSelectionApplied,
}: UnitFilterProps) {
  const router =
    useRouter();


  const containerRef =
    useRef<HTMLDivElement>(
      null,
    );


  /* =======================================================
     STATE
  ======================================================= */

  const [
    units,
    setUnits,
  ] =
    useState<
      UnitOption[]
    >(
      [],
    );


  const [
    selectedUnitIds,
    setSelectedUnitIds,
  ] =
    useState<
      number[]
    >(
      [],
    );


  const [
    draftUnitIds,
    setDraftUnitIds,
  ] =
    useState<
      number[]
    >(
      [],
    );


  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );


  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );


  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );


  const [
    loadError,
    setLoadError,
  ] =
    useState(
      "",
    );


  const [
    actionError,
    setActionError,
  ] =
    useState(
      "",
    );


  /* =======================================================
     LOAD UNITS
  ======================================================= */

  const loadUnits =
    useCallback(
      async (signal?: AbortSignal) => {
        setLoading(
          true,
        );


        setLoadError(
          "",
        );


        try {
          const response =
            await fetch(
              "/api/units",
              {
                method:
                  "GET",

                cache:
                  "no-store",
                signal,

                credentials:
                  "same-origin",
              },
            );


          let data:
            UnitsResponse;


          try {
            data =
              (await response.json()) as
                UnitsResponse;
          } catch {
            throw new Error(
              `A rota /api/units respondeu com HTTP ${response.status}, mas não retornou JSON válido.`,
            );
          }


          if (signal?.aborted) return;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.message ??
              `Não foi possível carregar as unidades. HTTP ${response.status}.`,
            );
          }


          const loadedUnits =
            Array.isArray(
              data.units,
            )
              ? data.units
              : [];


          const loadedSelection =
            Array.isArray(
              data.selectedUnitIds,
            )
              ? data.selectedUnitIds
              : loadedUnits
                  .filter(
                    (
                      unit,
                    ) =>
                      unit.selected,
                  )
                  .map(
                    (
                      unit,
                    ) =>
                      unit.id,
                  );


          setUnits(
            loadedUnits,
          );


          setSelectedUnitIds(
            loadedSelection,
          );


          setDraftUnitIds(
            loadedSelection,
          );


          if (
            loadedUnits.length ===
            0
          ) {
            setLoadError(
              "Nenhuma unidade ativa foi retornada pelo sistema.",
            );
          }
        } catch (
          error
        ) {
          if (signal?.aborted) return;
          console.error(
            "Erro ao carregar filtro de unidades:",
            error,
          );


          setUnits(
            [],
          );


          setSelectedUnitIds(
            [],
          );


          setDraftUnitIds(
            [],
          );


          setLoadError(
            error instanceof
              Error
              ? error.message
              : "Não foi possível carregar as unidades.",
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

  useInitialRequest(loadUnits);


  /* =======================================================
     CLOSE OUTSIDE / ESC
  ======================================================= */

  useEffect(
    () => {
      if (
        !open
      ) {
        return;
      }


      function handleMouseDown(
        event:
          MouseEvent,
      ) {
        const target =
          event.target;


        if (
          !(
            target instanceof
            Node
          )
        ) {
          return;
        }


        if (
          containerRef.current &&
          !containerRef.current.contains(
            target,
          )
        ) {
          setOpen(
            false,
          );


          setDraftUnitIds(
            selectedUnitIds,
          );


          setActionError(
            "",
          );
        }
      }


      function handleKeyDown(
        event:
          KeyboardEvent,
      ) {
        if (
          event.key !==
          "Escape"
        ) {
          return;
        }


        setOpen(
          false,
        );


        setDraftUnitIds(
          selectedUnitIds,
        );


        setActionError(
          "",
        );
      }


      document.addEventListener(
        "mousedown",
        handleMouseDown,
      );


      window.addEventListener(
        "keydown",
        handleKeyDown,
      );


      return () => {
        document.removeEventListener(
          "mousedown",
          handleMouseDown,
        );


        window.removeEventListener(
          "keydown",
          handleKeyDown,
        );
      };
    },
    [
      open,
      selectedUnitIds,
    ],
  );


  /* =======================================================
     COMPUTED
  ======================================================= */

  const selectedSet =
    useMemo(
      () =>
        new Set(
          selectedUnitIds,
        ),
      [
        selectedUnitIds,
      ],
    );


  const draftSet =
    useMemo(
      () =>
        new Set(
          draftUnitIds,
        ),
      [
        draftUnitIds,
      ],
    );


  const selectedUnits =
    useMemo(
      () =>
        units.filter(
          (
            unit,
          ) =>
            selectedSet.has(
              unit.id,
            ),
        ),
      [
        units,
        selectedSet,
      ],
    );


  const allDraftSelected =
    units.length >
      0 &&
    draftUnitIds.length ===
      units.length;


  const selectionChanged =
    useMemo(
      () => {
        if (
          selectedUnitIds.length !==
          draftUnitIds.length
        ) {
          return true;
        }


        const currentSet =
          new Set(
            selectedUnitIds,
          );


        return draftUnitIds.some(
          (
            unitId,
          ) =>
            !currentSet.has(
              unitId,
            ),
        );
      },
      [
        draftUnitIds,
        selectedUnitIds,
      ],
    );


  const label =
    useMemo(
      () => {
        if (
          loading
        ) {
          return (
            fallbackLabel ||
            "Carregando unidades..."
          );
        }


        if (
          loadError
        ) {
          return (
            fallbackLabel ||
            "Unidades"
          );
        }


        if (
          selectedUnits.length ===
          0
        ) {
          return (
            fallbackLabel ||
            "Selecionar unidades"
          );
        }


        if (
          selectedUnits.length ===
          units.length &&
          units.length >
            1
        ) {
          return "Todas as unidades";
        }


        if (
          selectedUnits.length ===
          1
        ) {
          return getUnitLabel(
            selectedUnits[0],
          );
        }


        return `${selectedUnits.length} unidades`;
      },
      [
        fallbackLabel,
        loading,
        loadError,
        selectedUnits,
        units.length,
      ],
    );


  /* =======================================================
     OPEN
  ======================================================= */

  function toggleDropdown() {
    if (
      open
    ) {
      setOpen(
        false,
      );


      setDraftUnitIds(
        selectedUnitIds,
      );


      setActionError(
        "",
      );


      return;
    }


    setDraftUnitIds(
      selectedUnitIds,
    );


    setActionError(
      "",
    );


    /*
     * IMPORTANTE:
     *
     * O dropdown abre mesmo durante loading
     * ou em caso de erro.
     *
     * Dessa forma ele nunca fica com aparência
     * de botão sem responder.
     */
    setOpen(
      true,
    );
  }


  /* =======================================================
     UNIT ACTIONS
  ======================================================= */

  function toggleUnit(
    unitId:
      number,
  ) {
    setActionError(
      "",
    );


    setDraftUnitIds(
      (
        current,
      ) => {
        if (
          current.includes(
            unitId,
          )
        ) {
          if (
            current.length ===
            1
          ) {
            setActionError(
              "Pelo menos uma unidade deve permanecer selecionada.",
            );


            return current;
          }


          return current.filter(
            (
              currentUnitId,
            ) =>
              currentUnitId !==
              unitId,
          );
        }


        return [
          ...current,
          unitId,
        ];
      },
    );
  }


  function selectAll() {
    setDraftUnitIds(
      units.map(
        (
          unit,
        ) =>
          unit.id,
      ),
    );


    setActionError(
      "",
    );
  }


  function selectMyUnit() {
    const defaultUnit =
      units.find(
        (
          unit,
        ) =>
          unit.isDefault,
      );


    if (
      !defaultUnit
    ) {
      setActionError(
        "A unidade representada pelo usuário não foi identificada.",
      );


      return;
    }


    setDraftUnitIds(
      [
        defaultUnit.id,
      ],
    );


    setActionError(
      "",
    );
  }


  function cancelSelection() {
    setDraftUnitIds(
      selectedUnitIds,
    );


    setOpen(
      false,
    );


    setActionError(
      "",
    );
  }


  /* =======================================================
     APPLY
  ======================================================= */

  async function applySelection() {
    if (
      saving
    ) {
      return;
    }


    if (
      draftUnitIds.length ===
      0
    ) {
      setActionError(
        "Selecione pelo menos uma unidade.",
      );


      return;
    }


    setSaving(
      true,
    );


    setActionError(
      "",
    );


    try {
      const response =
        await fetch(
          "/api/units/selection",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            credentials:
              "same-origin",

            body:
              JSON.stringify({
                unitIds:
                  draftUnitIds,
              }),
          },
        );


      let data:
        SelectionResponse;


      try {
        data =
          (await response.json()) as
            SelectionResponse;
      } catch {
        throw new Error(
          `A rota de seleção respondeu com HTTP ${response.status}, mas não retornou JSON válido.`,
        );
      }


      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ??
          "Não foi possível aplicar o filtro.",
        );
      }


      const finalSelection =
        Array.isArray(
          data.selectedUnitIds,
        )
          ? data.selectedUnitIds
          : draftUnitIds;


      setSelectedUnitIds(
        finalSelection,
      );


      setDraftUnitIds(
        finalSelection,
      );


      setOpen(
        false,
      );


      if (
        onSelectionApplied
      ) {
        await onSelectionApplied(
          finalSelection,
        );
      }


      router.refresh();
    } catch (
      error
    ) {
      console.error(
        "Erro ao aplicar filtro de unidades:",
        error,
      );


      setActionError(
        error instanceof
          Error
          ? error.message
          : "Não foi possível aplicar o filtro.",
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
    <div
      ref={
        containerRef
      }
      className="relative"
    >

      {/* ===================================================
          TRIGGER
      ==================================================== */}

      <button
        type="button"
        onClick={
          toggleDropdown
        }
        aria-expanded={
          open
        }
        aria-haspopup="menu"
        className={[
          "flex min-w-[185px] items-center gap-3 rounded-[13px] px-3 py-2 text-left transition-colors",
          open
            ? "bg-surface-elevated"
            : "hover:bg-surface-hover",
        ].join(
          " ",
        )}
      >

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-text-secondary">

          {loading ? (
            <LoaderCircle
              size={15}
              className="animate-spin"
            />
          ) : (
            <Building2
              size={15}
              strokeWidth={1.8}
            />
          )}

        </div>


        <div className="min-w-0 flex-1">

          <p className="text-[9px] font-medium uppercase tracking-[0.08em] text-text-secondary">
            Filtro de unidades
          </p>


          <p className="mt-0.5 max-w-[170px] truncate text-[11px] font-semibold text-text-primary">
            {label}
          </p>

        </div>


        <ChevronDown
          size={14}
          strokeWidth={1.8}
          className={[
            "shrink-0 text-text-secondary transition-transform duration-200",
            open
              ? "rotate-180"
              : "",
          ].join(
            " ",
          )}
        />

      </button>


      {/* ===================================================
          DROPDOWN
      ==================================================== */}

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[100] mt-3 w-[360px] overflow-hidden rounded-[20px] border border-border-theme/[0.08] bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.14)]"
        >

          {/* ===============================================
              HEADER
          ================================================ */}

          <div className="border-b border-border-theme px-5 py-4">

            <div className="flex items-start justify-between gap-4">

              <div>

                <p className="text-[13px] font-semibold text-text-primary">
                  Filtrar unidades
                </p>


                <p className="mt-1 text-[10px] leading-4 text-text-secondary">
                  Escolha uma ou mais unidades para
                  compor as análises.
                </p>

              </div>


              {!loading &&
                units.length >
                  0 && (
                  <span className="shrink-0 rounded-full bg-surface-elevated px-2.5 py-1 text-[9px] font-semibold text-text-secondary">
                    {draftUnitIds.length}/
                    {units.length}
                  </span>
                )}

            </div>

          </div>


          {/* ===============================================
              LOADING
          ================================================ */}

          {loading && (
            <div className="flex min-h-[180px] flex-col items-center justify-center px-6">

              <LoaderCircle
                size={22}
                className="animate-spin text-[#E41E2B]"
              />


              <p className="mt-3 text-[11px] text-text-secondary">
                Carregando unidades...
              </p>

            </div>
          )}


          {/* ===============================================
              LOAD ERROR
          ================================================ */}

          {!loading &&
            loadError && (
              <div className="px-5 py-6">

                <div className="rounded-[14px] border border-[#F0D4D6] bg-[#FFF8F8] px-4 py-4">

                  <p className="text-[11px] font-semibold text-[#9F4147]">
                    Não foi possível carregar as unidades
                  </p>


                  <p className="mt-2 text-[10px] leading-5 text-[#A86166]">
                    {loadError}
                  </p>

                </div>


                <button
                  type="button"
                  onClick={() =>
                    void loadUnits()
                  }
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-border-theme text-[11px] font-semibold text-text-primary transition-colors hover:bg-surface-hover"
                >

                  <RefreshCw
                    size={14}
                  />

                  Tentar novamente

                </button>

              </div>
            )}


          {/* ===============================================
              CHECKLIST
          ================================================ */}

          {!loading &&
            !loadError &&
            units.length >
              0 && (
              <>
                <div className="flex items-center justify-between border-b border-border-theme px-5 py-3">

                  <button
                    type="button"
                    onClick={
                      selectAll
                    }
                    disabled={
                      allDraftSelected
                    }
                    className="text-[10px] font-semibold text-[#E41E2B] disabled:cursor-default disabled:opacity-35"
                  >
                    Selecionar todas
                  </button>


                  <button
                    type="button"
                    onClick={
                      selectMyUnit
                    }
                    className="text-[10px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                  >
                    Minha unidade
                  </button>

                </div>


                <div className="max-h-[390px] overflow-y-auto p-2">

                  {units.map(
                    (
                      unit,
                    ) => {
                      const checked =
                        draftSet.has(
                          unit.id,
                        );


                      return (
                        <button
                          key={
                            unit.id
                          }
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={
                            checked
                          }
                          onClick={() =>
                            toggleUnit(
                              unit.id,
                            )
                          }
                          className="flex w-full items-center gap-3 rounded-[13px] px-3 py-3 text-left transition-colors hover:bg-surface-hover"
                        >

                          {/* CHECKBOX */}

                          <span
                            className={[
                              "flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                              checked
                                ? "border-[#E41E2B] bg-[#E41E2B] text-white"
                                : "border-border-theme bg-surface text-transparent",
                            ].join(
                              " ",
                            )}
                          >

                            <Check
                              size={12}
                              strokeWidth={2.6}
                            />

                          </span>


                          {/* UNIT INFO */}

                          <div className="min-w-0 flex-1">

                            <div className="flex items-center gap-2">

                              <p className="truncate text-[11px] font-semibold text-text-primary">
                                {getUnitLabel(
                                  unit,
                                )}
                              </p>


                              {unit.isDefault && (
                                <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.03em] text-text-secondary">
                                  Minha unidade
                                </span>
                              )}

                            </div>


                            <p className="mt-1 truncate text-[9px] text-text-secondary">
                              {getUnitDescription(
                                unit,
                              )}
                            </p>

                          </div>

                        </button>
                      );
                    },
                  )}

                </div>


                {/* ===========================================
                    ACTION ERROR
                ============================================ */}

                {actionError && (
                  <div className="border-t border-[#F1D7D9] bg-[#FFF8F8] px-5 py-3">

                    <p className="text-[10px] leading-4 text-[#A84A50]">
                      {actionError}
                    </p>

                  </div>
                )}


                {/* ===========================================
                    FOOTER
                ============================================ */}

                <div className="flex items-center justify-between border-t border-border-theme bg-surface-elevated px-4 py-3">

                  <p className="pl-1 text-[9px] text-text-secondary">
                    {draftUnitIds.length ===
                    1
                      ? "1 unidade selecionada"
                      : `${draftUnitIds.length} unidades selecionadas`}
                  </p>


                  <div className="flex items-center gap-2">

                    <button
                      type="button"
                      onClick={
                        cancelSelection
                      }
                      disabled={
                        saving
                      }
                      className="rounded-[9px] px-4 py-2 text-[10px] font-semibold text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
                    >
                      Cancelar
                    </button>


                    <button
                      type="button"
                      onClick={() =>
                        void applySelection()
                      }
                      disabled={
                        saving ||
                        !selectionChanged ||
                        draftUnitIds.length ===
                          0
                      }
                      className="inline-flex min-w-[90px] items-center justify-center gap-2 rounded-[9px] bg-[#E41E2B] px-4 py-2 text-[10px] font-semibold text-white transition-colors hover:bg-[#CD1925] disabled:cursor-not-allowed disabled:opacity-40"
                    >

                      {saving && (
                        <LoaderCircle
                          size={12}
                          className="animate-spin"
                        />
                      )}


                      Aplicar

                    </button>

                  </div>

                </div>

              </>
            )}

        </div>
      )}

    </div>
  );
}