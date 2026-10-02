"use client";

import Image from "next/image";
import Link from "next/link";

import {
  ArrowLeft,
  Building2,
  Globe2,
  LoaderCircle,
  ShieldCheck,
  UserPlus,
  Users,
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
   TYPES
========================================================= */

type UserRole =
  | "GESTOR"
  | "ANALISTA";


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
    unit.city?.trim() ||
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
    "GESTOR"
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
      "ANALISTA",
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


  /* =======================================================
     LOAD USERS
  ======================================================= */

  const loadUsers =
    useCallback(
      async () => {
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
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Não foi possível carregar os usuários.",
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );


  useEffect(
    () => {
      void loadUsers();
    },
    [
      loadUsers,
    ],
  );


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
      "ANALISTA",
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
        "Selecione a unidade representada pelo usuário.",
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
    <main className="min-h-screen bg-[#F7F7F6]">

      {/* ===================================================
          HEADER
      ==================================================== */}

      <header className="border-b border-black/[0.05] bg-white">

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

            <p className="text-[13px] font-medium text-[#25272A]">
              {user.name}
            </p>


            <p className="mt-0.5 text-[10px] text-[#A0A4A9]">
              {roleLabel(
                user.role,
              )} · Administração de usuários
            </p>

          </div>

        </div>

      </header>


      {/* ===================================================
          CONTENT
      ==================================================== */}

      <div className="mx-auto w-full max-w-[1280px] px-6 pb-20 pt-10 sm:px-8 lg:px-10">

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
            TITLE
        ================================================== */}

        <div className="mt-9">

          <div className="flex items-start gap-4">

            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#FDEBEC] text-[#E41E2B]">

              <Users
                size={21}
                strokeWidth={1.8}
              />

            </div>


            <div>

              <h1 className="text-[34px] font-semibold tracking-[-0.045em] text-[#191B1E] sm:text-[40px]">
                Usuários
              </h1>


              <p className="mt-2 max-w-[680px] text-[13px] leading-6 text-[#7D8288]">
                Cadastre os representantes das unidades.
                Cada usuário possui uma unidade principal,
                mas pode consultar os dados de todas as
                unidades ativas do sistema.
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

          <section className="rounded-[26px] border border-black/[0.07] bg-white p-6 sm:p-7">

            <div className="flex items-center gap-3">

              <UserPlus
                size={19}
                strokeWidth={1.8}
                className="text-[#E41E2B]"
              />


              <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#25282C]">
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

                <label className="text-[11px] font-medium text-[#70757B]">
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
                  className="mt-2 h-12 w-full rounded-[12px] border border-[#DDE0E3] bg-white px-3.5 text-[13px] text-[#303438] outline-none transition-colors placeholder:text-[#B0B4B8] focus:border-[#BABFC5]"
                />

              </div>


              {/* =============================================
                  EMAIL
              ============================================== */}

              <div className="mt-5">

                <label className="text-[11px] font-medium text-[#70757B]">
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
                  placeholder="nome@empresa.com"
                  className="mt-2 h-12 w-full rounded-[12px] border border-[#DDE0E3] bg-white px-3.5 text-[13px] text-[#303438] outline-none transition-colors placeholder:text-[#B0B4B8] focus:border-[#BABFC5]"
                />

              </div>


              {/* =============================================
                  ROLE
              ============================================== */}

              <div className="mt-5">

                <label className="text-[11px] font-medium text-[#70757B]">
                  Perfil
                </label>


                <select
                  value={
                    role
                  }
                  onChange={(
                    event,
                  ) =>
                    setRole(
                      event.target
                        .value as
                        UserRole,
                    )
                  }
                  className="mt-2 h-12 w-full rounded-[12px] border border-[#DDE0E3] bg-white px-3.5 text-[13px] text-[#303438] outline-none transition-colors focus:border-[#BABFC5]"
                >

                  <option value="ANALISTA">
                    Analista
                  </option>


                  <option value="GESTOR">
                    Gestor
                  </option>

                </select>


                <p className="mt-2 text-[10px] leading-4 text-[#9A9FA5]">
                  O perfil define as responsabilidades
                  do usuário dentro da aplicação.
                </p>

              </div>


              {/* =============================================
                  PASSWORD
              ============================================== */}

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">

                <div>

                  <label className="text-[11px] font-medium text-[#70757B]">
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
                    className="mt-2 h-12 w-full rounded-[12px] border border-[#DDE0E3] bg-white px-3.5 text-[13px] text-[#303438] outline-none transition-colors placeholder:text-[#B0B4B8] focus:border-[#BABFC5]"
                  />

                </div>


                <div>

                  <label className="text-[11px] font-medium text-[#70757B]">
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
                    className="mt-2 h-12 w-full rounded-[12px] border border-[#DDE0E3] bg-white px-3.5 text-[13px] text-[#303438] outline-none transition-colors placeholder:text-[#B0B4B8] focus:border-[#BABFC5]"
                  />

                </div>

              </div>


              {/* =============================================
                  REPRESENTATIVE UNIT
              ============================================== */}

              <div className="mt-7 border-t border-[#ECEDEF] pt-6">

                <div className="flex items-center gap-3">

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#F4F4F3] text-[#666B70]">

                    <Building2
                      size={17}
                      strokeWidth={1.8}
                    />

                  </div>


                  <div>

                    <p className="text-[12px] font-semibold text-[#34383D]">
                      Unidade representada
                    </p>


                    <p className="mt-0.5 text-[10px] text-[#989DA3]">
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


                    setRepresentativeUnitId(
                      value
                        ? Number(
                            value,
                          )
                        : null,
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
                  className="mt-4 h-12 w-full rounded-[12px] border border-[#DDE0E3] bg-white px-3.5 text-[13px] text-[#303438] outline-none transition-colors focus:border-[#BABFC5] disabled:cursor-not-allowed disabled:bg-[#F7F7F6] disabled:text-[#9A9FA5]"
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
                          ? ` · ${currentUnit.code}`
                          : ""}
                      </option>
                    ),
                  )}

                </select>


                {units.length ===
                  0 &&
                  !loading && (
                    <p className="mt-2 text-[10px] text-[#B04C52]">
                      Nenhuma unidade ativa está disponível.
                    </p>
                  )}

              </div>


              {/* =============================================
                  GLOBAL ACCESS INFORMATION
              ============================================== */}

              <div className="mt-5 rounded-[16px] border border-[#E7E9EA] bg-[#F8F8F7] p-4">

                <div className="flex items-start gap-3">

                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#73787D] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">

                    <Globe2
                      size={15}
                      strokeWidth={1.8}
                    />

                  </div>


                  <div>

                    <p className="text-[11px] font-semibold text-[#4D5257]">
                      Acesso a todas as unidades
                    </p>


                    <p className="mt-1 text-[10px] leading-5 text-[#8B9096]">
                      A unidade representada define apenas
                      a unidade principal do usuário.
                      Ele poderá consultar e comparar dados
                      de todas as unidades ativas através
                      do filtro global.
                    </p>

                  </div>

                </div>

              </div>


              {/* =============================================
                  FEEDBACK
              ============================================== */}

              {error && (
                <div className="mt-5 rounded-[12px] border border-[#F0D2D4] bg-[#FFF8F8] px-4 py-3">

                  <p className="text-[11px] leading-5 text-[#A5484D]">
                    {error}
                  </p>

                </div>
              )}


              {success && (
                <div className="mt-5 rounded-[12px] border border-[#D7E9DA] bg-[#F7FBF7] px-4 py-3">

                  <p className="text-[11px] leading-5 text-[#3E7650]">
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
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#E41E2B] px-5 text-[12px] font-semibold text-white transition-colors hover:bg-[#CF1925] disabled:cursor-not-allowed disabled:opacity-50"
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

          <section className="min-w-0 overflow-hidden rounded-[26px] border border-black/[0.07] bg-white">

            <div className="flex items-start justify-between gap-5 border-b border-[#ECEDEF] px-6 py-6 sm:px-7">

              <div>

                <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#25282C]">
                  Usuários cadastrados
                </h2>


                <p className="mt-1 text-[11px] text-[#969BA1]">
                  Representantes cadastrados no sistema.
                </p>

              </div>


              <span className="rounded-full bg-[#F4F4F3] px-3 py-1.5 text-[10px] font-semibold text-[#74797F]">
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
                  className="animate-spin text-[#E41E2B]"
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
                  className="text-[#B0B4B8]"
                />


                <p className="mt-4 text-[13px] font-medium text-[#555A60]">
                  Nenhum usuário encontrado
                </p>


                <p className="mt-1 max-w-[280px] text-[10px] leading-5 text-[#9A9FA5]">
                  Cadastre o primeiro representante
                  utilizando o formulário ao lado.
                </p>

              </div>
            ) : (
              /* =============================================
                 USERS
              ============================================== */

              <div className="divide-y divide-[#EEF0F1]">

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

                            <p className="truncate text-[13px] font-semibold text-[#33373B]">
                              {item.name}
                            </p>


                            {!item.active && (
                              <span className="rounded-full bg-[#F1F1F1] px-2 py-0.5 text-[8px] font-semibold uppercase text-[#8D9297]">
                                Inativo
                              </span>
                            )}

                          </div>


                          <p className="mt-1 truncate text-[11px] text-[#8F949A]">
                            {item.email}
                          </p>

                        </div>


                        <div
                          className={[
                            "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-semibold",
                            item.role ===
                              "GESTOR"
                              ? "bg-[#F2F3F3] text-[#555B61]"
                              : "bg-[#FDEBEC] text-[#C72B34]",
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

                        <p className="text-[9px] font-medium uppercase tracking-[0.07em] text-[#A0A4AA]">
                          Unidade representada
                        </p>


                        {item.representativeUnit ? (
                          <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-[11px] border border-[#E4E6E8] bg-[#FAFAFA] px-3 py-2">

                            <Building2
                              size={13}
                              strokeWidth={1.8}
                              className="shrink-0 text-[#858A90]"
                            />


                            <div className="min-w-0">

                              <p className="truncate text-[10px] font-semibold text-[#5D6268]">
                                {unitLabel(
                                  item.representativeUnit,
                                )}
                              </p>


                              {unitDescription(
                                item.representativeUnit,
                              ) && (
                                <p className="mt-0.5 truncate text-[8px] text-[#A0A4A9]">
                                  {unitDescription(
                                    item.representativeUnit,
                                  )}
                                </p>
                              )}

                            </div>

                          </div>
                        ) : (
                          <p className="mt-2 text-[10px] text-[#A0A4A9]">
                            Nenhuma unidade representada.
                          </p>
                        )}

                      </div>


                      {/* =====================================
                          ACCESS
                      ====================================== */}

                      <div className="mt-4 flex items-center gap-2 text-[9px] text-[#8C9197]">

                        <Globe2
                          size={11}
                          strokeWidth={1.8}
                        />


                        <span>
                          Acesso aos dados de todas as unidades ativas
                        </span>

                      </div>


                      {/* =====================================
                          LAST LOGIN
                      ====================================== */}

                      <div className="mt-4 border-t border-[#F0F1F2] pt-3">

                        <p className="text-[9px] text-[#A1A5AA]">
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

    </main>
  );
}