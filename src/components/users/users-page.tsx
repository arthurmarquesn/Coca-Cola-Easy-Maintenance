"use client";

import { useInitialRequest } from "@/lib/use-initial-request";

import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  Building2,
  LoaderCircle,
  Pencil,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

import type {
  FormEvent,
} from "react";

import {
  useCallback,
  useState,
} from "react";

import {
  ThemeSwitcher,
} from "@/components/theme/theme-switcher";

import {
  EditUserDialog,
} from "@/components/users/edit-user-dialog";

import {
  UnitAccessPicker,
} from "@/components/users/unit-access-picker";


/* =========================================================
   TYPES
========================================================= */

type UserRole =
  | "MANAGER"
  | "MAINTENANCE";


interface UnitItem {
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


interface UserItem {
  id: number;

  name: string;

  email: string;

  role:
    UserRole;

  active:
    boolean;

  lastLoginAt:
    | string
    | null;

  createdAt:
    | string
    | null;

  /* Unidades de acesso visíveis para quem administra. */
  unitIds:
    number[];

  representativeUnit:
    | UnitItem
    | null;
}


interface UsersResponse {
  success:
    boolean;

  message?:
    string;

  users?:
    UserItem[];

  units?:
    UnitItem[];
}


interface UsersPageProps {
  user: {
    name:
      string;

    email:
      string;

    role:
      UserRole;
  };
}


/* =========================================================
   HELPERS
========================================================= */

function unitLabel(
  unit:
    UnitItem,
): string {
  return (
    unit.name?.trim() ||
    unit.code?.trim() ||
    `Unidade ${unit.id}`
  );
}


function unitDescription(
  unit:
    UnitItem,
): string {
  return [
    unit.code,
    unit.name !==
    unitLabel(
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


function roleLabel(
  role:
    UserRole,
): string {
  return role ===
    "MANAGER"
    ? "Gestor"
    : "Analista";
}


function formatDateTime(
  value:
    | string
    | null,
): string {
  if (
    !value
  ) {
    return "Nunca acessou";
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


/* =========================================================
   COMPONENT
========================================================= */

export function UsersPage({
  user,
}: UsersPageProps) {
  /* =======================================================
     DATA
  ======================================================= */

  const [
    users,
    setUsers,
  ] =
    useState<
      UserItem[]
    >(
      [],
    );


  const [
    units,
    setUnits,
  ] =
    useState<
      UnitItem[]
    >(
      [],
    );


  /* =======================================================
     STATES
  ======================================================= */

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
    error,
    setError,
  ] =
    useState(
      "",
    );


  const [
    success,
    setSuccess,
  ] =
    useState(
      "",
    );


  /* =======================================================
     FORM
  ======================================================= */

  const [
    name,
    setName,
  ] =
    useState(
      "",
    );


  const [
    email,
    setEmail,
  ] =
    useState(
      "",
    );


  const [
    password,
    setPassword,
  ] =
    useState(
      "",
    );


  const [
    passwordConfirmation,
    setPasswordConfirmation,
  ] =
    useState(
      "",
    );


  const [
    role,
    setRole,
  ] =
    useState<
      UserRole
    >(
      "MAINTENANCE",
    );


  const [
    representativeUnitId,
    setRepresentativeUnitId,
  ] =
    useState<
      number | null
    >(
      null,
    );


  /* Unidades extras: só para o Analista. */
  const [
    extraUnitIds,
    setExtraUnitIds,
  ] =
    useState<
      number[]
    >(
      [],
    );


  const [
    editingUser,
    setEditingUser,
  ] =
    useState<
      UserItem | null
    >(
      null,
    );


  /* =======================================================
     LOAD USERS
  ======================================================= */

  const loadUsers =
    useCallback(
      async (signal?: AbortSignal) => {
        setLoading(
          true,
        );


        setError(
          "",
        );


        try {
          const response =
            await fetch(
              "/api/users",
              {
                cache:
                  "no-store",
                signal,
              },
            );


          const data =
            (await response.json()) as
              UsersResponse;


          if (signal?.aborted) return;

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.message ??
              "Não foi possível carregar os usuários.",
            );
          }


          const loadedUsers =
            Array.isArray(
              data.users,
            )
              ? data.users
              : [];


          const loadedUnits =
            Array.isArray(
              data.units,
            )
              ? data.units
              : [];


          setUsers(
            loadedUsers,
          );


          setUnits(
            loadedUnits,
          );


          /*
           * Se existe apenas uma unidade,
           * ela já é selecionada automaticamente.
           *
           * Quando houver várias unidades,
           * o usuário deverá escolher qual representa.
           */
          setRepresentativeUnitId(
            (
              current,
            ) => {
              if (
                loadedUnits.length ===
                1
              ) {
                return loadedUnits[0]
                  .id;
              }


              if (
                current !==
                  null &&
                loadedUnits.some(
                  (
                    unit,
                  ) =>
                    unit.id ===
                    current,
                )
              ) {
                return current;
              }


              return null;
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
              : "Não foi possível carregar os usuários.",
          );
        } finally {
          if (!signal?.aborted) setLoading(
            false,
          );
        }
      },
      [],
    );


  useInitialRequest(loadUsers);


  /* =======================================================
     RESET FORM
  ======================================================= */

  function resetForm() {
    setName(
      "",
    );


    setEmail(
      "",
    );


    setPassword(
      "",
    );


    setPasswordConfirmation(
      "",
    );


    setRole(
      "MAINTENANCE",
    );


    setExtraUnitIds(
      [],
    );


    if (
      units.length ===
      1
    ) {
      setRepresentativeUnitId(
        units[0].id,
      );
    } else {
      setRepresentativeUnitId(
        null,
      );
    }
  }


  /* =======================================================
     CREATE USER
  ======================================================= */

  async function handleSubmit(
    event:
      FormEvent,
  ) {
    event.preventDefault();


    if (
      saving
    ) {
      return;
    }


    setError(
      "",
    );


    setSuccess(
      "",
    );


    /* =====================================================
       PASSWORD CONFIRMATION
    ===================================================== */

    if (
      password !==
      passwordConfirmation
    ) {
      setError(
        "As senhas informadas não são iguais.",
      );


      return;
    }


    /* =====================================================
       REPRESENTATIVE UNIT
    ===================================================== */

    if (
      representativeUnitId ===
      null
    ) {
      setError(
        "Selecione a unidade do usuário.",
      );


      return;
    }


    /* =====================================================
       REQUEST
    ===================================================== */

    setSaving(
      true,
    );


    try {
      const response =
        await fetch(
          "/api/users",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                name,

                email,

                password,

                role,

                representativeUnitId,

                extraUnitIds:
                  role ===
                  "MANAGER"
                    ? []
                    : extraUnitIds.filter(
                        (
                          unitId,
                        ) =>
                          unitId !==
                          representativeUnitId,
                      ),
              }),
          },
        );


      const data =
        (await response.json()) as
          UsersResponse;


      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ??
          "Não foi possível cadastrar o usuário.",
        );
      }


      setSuccess(
        "Usuário cadastrado com sucesso.",
      );


      resetForm();


      await loadUsers();
    } catch (
      submitError
    ) {
      setError(
        submitError instanceof
          Error
          ? submitError.message
          : "Não foi possível cadastrar o usuário.",
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

      <header className="border-b border-border-theme/[0.05] bg-surface">

        <div className="mx-auto flex min-h-[76px] w-full max-w-[1280px] items-center justify-between gap-6 px-6 py-2 sm:px-8 lg:px-10">

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

            <p className="text-[13px] font-medium text-text-primary">
              {user.name}
            </p>


            <p className="mt-0.5 text-[10px] text-text-secondary">
              {roleLabel(
                user.role,
              )} · Administração de usuários
            </p>

          </div>

          <div className="hidden h-8 w-px bg-border-theme sm:block" />

          <ThemeSwitcher />

        </div>

      </header>


      {/* ===================================================
          CONTENT
      ==================================================== */}

      <div className="mx-auto w-full max-w-[1280px] px-6 pb-20 pt-10 sm:px-8 lg:px-10">

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
            TITLE
        ================================================== */}

        <div className="mt-9">

          <div className="flex items-start gap-4">

            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent-soft text-accent-primary">

              <Users
                size={21}
                strokeWidth={1.8}
              />

            </div>


            <div>

              <h1 className="text-[34px] font-semibold tracking-[-0.045em] text-text-primary sm:text-[40px]">
                Usuários
              </h1>


              <p className="mt-2 max-w-[680px] text-[13px] leading-6 text-text-secondary">
                Cadastre os usuários das suas unidades.
                O Gestor consulta somente a unidade principal;
                o Analista pode receber unidades de acesso
                adicionais.
              </p>

            </div>

          </div>

        </div>


        {/* =================================================
            GRID
        ================================================== */}

        <div className="mt-10 grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">

          {/* =================================================
              CREATE USER
          ================================================== */}

          <section className="rounded-[26px] border border-border-theme/[0.07] bg-surface p-6 sm:p-7">

            <div className="flex items-center gap-3">

              <UserPlus
                size={19}
                strokeWidth={1.8}
                className="text-accent-primary"
              />


              <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-primary">
                Novo usuário
              </h2>

            </div>


            <form
              onSubmit={
                handleSubmit
              }
              className="mt-7"
            >

              {/* =============================================
                  NAME
              ============================================== */}

              <div>

                <label className="text-[11px] font-medium text-text-secondary">
                  Nome completo
                </label>


                <input
                  value={
                    name
                  }
                  onChange={(
                    event,
                  ) =>
                    setName(
                      event.target
                        .value,
                    )
                  }
                  required
                  maxLength={150}
                  placeholder="Nome do colaborador"
                  className="mt-2 h-12 w-full rounded-[12px] border border-border-theme bg-surface px-3.5 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-theme"
                />

              </div>


              {/* =============================================
                  EMAIL
              ============================================== */}

              <div className="mt-5">

                <label className="text-[11px] font-medium text-text-secondary">
                  E-mail
                </label>


                <input
                  type="email"
                  value={
                    email
                  }
                  onChange={(
                    event,
                  ) =>
                    setEmail(
                      event.target
                        .value,
                    )
                  }
                  required
                  maxLength={191}
                  autoComplete="email"
                  placeholder="nome@kof.com"
                  className="mt-2 h-12 w-full rounded-[12px] border border-border-theme bg-surface px-3.5 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-theme"
                />

              </div>


              {/* =============================================
                  ROLE
              ============================================== */}

              <div className="mt-5">

                <label className="text-[11px] font-medium text-text-secondary">
                  Perfil
                </label>


                <select
                  value={
                    role
                  }
                  onChange={(
                    event,
                  ) => {
                    const nextRole =
                      event.target
                        .value as
                        UserRole;

                    setRole(
                      nextRole,
                    );

                    if (
                      nextRole ===
                      "MANAGER"
                    ) {
                      setExtraUnitIds(
                        [],
                      );
                    }
                  }}
                  className="mt-2 h-12 w-full rounded-[12px] border border-border-theme bg-surface px-3.5 text-[13px] text-text-primary outline-none transition-colors focus:border-border-theme"
                >

                  <option value="MAINTENANCE">
                    Analista
                  </option>


                  <option value="MANAGER">
                    Gestor
                  </option>

                </select>


                <p className="mt-2 text-[10px] leading-4 text-text-secondary">
                  O perfil define as responsabilidades
                  do usuário dentro da aplicação.
                </p>

              </div>


              {/* =============================================
                  PASSWORD
              ============================================== */}

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">

                <div>

                  <label className="text-[11px] font-medium text-text-secondary">
                    Senha
                  </label>


                  <input
                    type="password"
                    value={
                      password
                    }
                    onChange={(
                      event,
                    ) =>
                      setPassword(
                        event.target
                          .value,
                      )
                    }
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="Mínimo de 8 caracteres"
                    className="mt-2 h-12 w-full rounded-[12px] border border-border-theme bg-surface px-3.5 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-theme"
                  />

                </div>


                <div>

                  <label className="text-[11px] font-medium text-text-secondary">
                    Confirmar senha
                  </label>


                  <input
                    type="password"
                    value={
                      passwordConfirmation
                    }
                    onChange={(
                      event,
                    ) =>
                      setPasswordConfirmation(
                        event.target
                          .value,
                      )
                    }
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="Repita a senha"
                    className="mt-2 h-12 w-full rounded-[12px] border border-border-theme bg-surface px-3.5 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-theme"
                  />

                </div>

              </div>


              {/* =============================================
                  REPRESENTATIVE UNIT
              ============================================== */}

              <div className="mt-7 border-t border-border-theme pt-6">

                <div className="flex items-center gap-3">

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-surface-elevated text-text-secondary">

                    <Building2
                      size={17}
                      strokeWidth={1.8}
                    />

                  </div>


                  <div>

                    <p className="text-[12px] font-semibold text-text-primary">
                      Unidade
                    </p>

                    <p className="mt-0.5 text-[10px] text-text-secondary">
                      Unidade principal deste usuário.
                    </p>

                  </div>

                </div>


                <select
                  value={
                    representativeUnitId ??
                    ""
                  }
                  onChange={(
                    event,
                  ) => {
                    const value =
                      event.target
                        .value;


                    const nextUnitId =
                      value
                        ? Number(
                            value,
                          )
                        : null;

                    setRepresentativeUnitId(
                      nextUnitId,
                    );

                    setExtraUnitIds(
                      (
                        current,
                      ) =>
                        current.filter(
                          (
                            unitId,
                          ) =>
                            unitId !==
                            nextUnitId,
                        ),
                    );


                    setError(
                      "",
                    );


                    setSuccess(
                      "",
                    );
                  }}
                  required
                  disabled={
                    loading ||
                    units.length ===
                      0
                  }
                  className="mt-4 h-12 w-full rounded-[12px] border border-border-theme bg-surface px-3.5 text-[13px] text-text-primary outline-none transition-colors focus:border-border-theme disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-text-secondary"
                >

                  <option value="">
                    Selecione a unidade
                  </option>


                  {units.map(
                    (
                      currentUnit,
                    ) => (
                      <option
                        key={
                          currentUnit.id
                        }
                        value={
                          currentUnit.id
                        }
                      >
                        {unitLabel(
                          currentUnit,
                        )}

                        {currentUnit.code
                          ? ` — ${currentUnit.code}`
                          : ""}
                      </option>
                    ),
                  )}

                </select>


                {units.length ===
                  0 &&
                  !loading && (
                    <p className="mt-2 text-[10px] text-accent-primary">
                      Nenhuma unidade ativa está disponível.
                    </p>
                  )}

              </div>


              {/* =============================================
                  ACCESS UNITS
              ============================================== */}

              {role ===
              "MANAGER" ? (
                <div className="mt-5 rounded-[16px] border border-border-theme bg-surface-elevated p-4">
                  <p className="text-[11px] font-semibold text-text-primary">
                    Acesso restrito à unidade
                  </p>

                  <p className="mt-1 text-[10px] leading-5 text-text-secondary">
                    O Gestor consulta somente os dados
                    da unidade selecionada acima.
                  </p>
                </div>
              ) : (
                <div className="mt-5">
                  <p className="text-[11px] font-medium text-text-secondary">
                    Unidades de acesso adicionais (opcional)
                  </p>

                  <UnitAccessPicker
                    units={
                      units
                    }
                    primaryUnitId={
                      representativeUnitId
                    }
                    selectedIds={
                      extraUnitIds
                    }
                    onChange={
                      setExtraUnitIds
                    }
                    disabled={
                      loading ||
                      saving
                    }
                  />
                </div>
              )}


              {/* =============================================
                  FEEDBACK
              ============================================== */}

              {error && (
                <div className="mt-5 rounded-[12px] border border-accent-primary/30 bg-surface-elevated px-4 py-3">

                  <p className="text-[11px] leading-5 text-accent-primary">
                    {error}
                  </p>

                </div>
              )}


              {success && (
                <div className="mt-5 rounded-[12px] border border-success/30 bg-surface-elevated px-4 py-3">

                  <p className="text-[11px] leading-5 text-success">
                    {success}
                  </p>

                </div>
              )}


              {/* =============================================
                  SUBMIT
              ============================================== */}

              <button
                type="submit"
                disabled={
                  saving ||
                  loading ||
                  units.length ===
                    0
                }
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-accent-primary px-5 text-[12px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >

                {saving ? (
                  <LoaderCircle
                    size={16}
                    className="animate-spin"
                  />
                ) : (
                  <UserPlus
                    size={16}
                  />
                )}


                {saving
                  ? "Cadastrando..."
                  : "Cadastrar usuário"}

              </button>

            </form>

          </section>


          {/* =================================================
              USERS LIST
          ================================================== */}

          <section className="min-w-0 overflow-hidden rounded-[26px] border border-border-theme/[0.07] bg-surface">

            <div className="flex items-start justify-between gap-5 border-b border-border-theme px-6 py-6 sm:px-7">

              <div>

                <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-primary">
                  Usuários cadastrados
                </h2>


                <p className="mt-1 text-[11px] text-text-secondary">
                  Representantes cadastrados no sistema.
                </p>

              </div>


              <span className="rounded-full bg-surface-elevated px-3 py-1.5 text-[10px] font-semibold text-text-secondary">
                {users.length}
              </span>

            </div>


            {/* ===============================================
                LOADING
            ================================================ */}

            {loading ? (
              <div className="flex min-h-[300px] items-center justify-center">

                <LoaderCircle
                  size={21}
                  className="animate-spin text-accent-primary"
                />

              </div>
            ) : users.length ===
              0 ? (
              /* =============================================
                 EMPTY
              ============================================== */

              <div className="flex min-h-[300px] flex-col items-center justify-center px-8 text-center">

                <Users
                  size={24}
                  strokeWidth={1.6}
                  className="text-text-secondary"
                />


                <p className="mt-4 text-[13px] font-medium text-text-primary">
                  Nenhum usuário encontrado
                </p>


                <p className="mt-1 max-w-[280px] text-[10px] leading-5 text-text-secondary">
                  Cadastre o primeiro representante
                  utilizando o formulário ao lado.
                </p>

              </div>
            ) : (
              /* =============================================
                 USERS
              ============================================== */

              <div className="divide-y divide-border-theme">

                {users.map(
                  (
                    item,
                  ) => (
                    <div
                      key={
                        item.id
                      }
                      className="px-6 py-5 sm:px-7"
                    >

                      {/* =====================================
                          NAME / ROLE
                      ====================================== */}

                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">

                        <div className="min-w-0">

                          <div className="flex flex-wrap items-center gap-2">

                            <p className="truncate text-[13px] font-semibold text-text-primary">
                              {item.name}
                            </p>


                            {!item.active && (
                              <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[8px] font-semibold uppercase text-text-secondary">
                                Inativo
                              </span>
                            )}

                          </div>


                          <p className="mt-1 truncate text-[11px] text-text-secondary">
                            {item.email}
                          </p>

                        </div>


                        <div
                          className={[
                            "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-semibold",
                            item.role ===
                              "MANAGER"
                              ? "bg-surface-elevated text-text-primary"
                              : "bg-accent-soft text-accent-primary",
                          ].join(
                            " ",
                          )}
                        >

                          <ShieldCheck
                            size={11}
                          />


                          {roleLabel(
                            item.role,
                          )}

                        </div>

                      </div>


                      {/* =====================================
                          REPRESENTATIVE UNIT
                      ====================================== */}

                      <div className="mt-4">

                        <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-text-secondary">
                          Unidade principal
                        </p>


                        {item.representativeUnit ? (
                          <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-[11px] border border-border-theme bg-surface-elevated px-3 py-2">

                            <Building2
                              size={13}
                              strokeWidth={1.8}
                              className="shrink-0 text-text-secondary"
                            />


                            <div className="min-w-0">

                              <p className="truncate text-[10px] font-semibold text-text-primary">
                                {unitLabel(
                                  item.representativeUnit,
                                )}
                              </p>


                              {unitDescription(
                                item.representativeUnit,
                              ) && (
                                <p className="mt-0.5 truncate text-[8px] text-text-secondary">
                                  {unitDescription(
                                    item.representativeUnit,
                                  )}
                                </p>
                              )}

                            </div>

                          </div>
                        ) : (
                          <p className="mt-2 text-[10px] text-text-secondary">
                            Nenhuma unidade representada.
                          </p>
                        )}

                      </div>


                      {/* =====================================
                          ACCESS
                      ====================================== */}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[9px] text-text-secondary">
                          {item.role ===
                          "MANAGER"
                            ? "Acesso somente à unidade principal"
                            : item.unitIds.length >
                                1
                              ? `Acesso a ${item.unitIds.length} unidades`
                              : "Acesso à unidade principal"}
                        </p>

                        <button
                          type="button"
                          onClick={() =>
                            setEditingUser(
                              item,
                            )
                          }
                          className="inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-border-theme px-3 text-[10px] font-semibold text-text-primary transition-colors hover:bg-surface-hover"
                        >
                          <Pencil
                            size={12}
                          />

                          Editar
                        </button>
                      </div>


                      {/* =====================================
                          LAST LOGIN
                      ====================================== */}

                      <div className="mt-4 border-t border-border-theme pt-3">

                        <p className="text-[9px] text-text-secondary">
                          Último acesso:{" "}
                          {formatDateTime(
                            item.lastLoginAt,
                          )}
                        </p>

                      </div>

                    </div>
                  ),
                )}

              </div>
            )}

          </section>
        </div>
      </div>


      {editingUser && (
        <EditUserDialog
          key={
            editingUser.id
          }
          user={
            editingUser
          }
          units={
            units
          }
          isSelf={
            editingUser.email ===
            user.email
          }
          onClose={() =>
            setEditingUser(
              null,
            )
          }
          onSaved={async () => {
            setSuccess(
              "Usuário atualizado com sucesso.",
            );

            await loadUsers();
          }}
        />
      )}
    </main>
  );
}