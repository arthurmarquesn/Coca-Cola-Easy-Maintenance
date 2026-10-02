"use client";

<<<<<<< HEAD
import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";

import {
  ArrowLeft,
  UserPlus,
} from "lucide-react";

import {
  useCallback,
  useState,
} from "react";

=======
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

>>>>>>> origin/marques
import type {
  FormEvent,
} from "react";

<<<<<<< HEAD
import type {
  UnitItem,
  UserItem,
} from "@/lib/users";

import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
} from "@/lib/roles";

interface UsersPageProps {
  currentUserId: number;

  initialUsers: UserItem[];

  initialUnits: UnitItem[];

  user: {
    name: string;
  };

  unit: {
    city: string | null;
  };
}

interface ApiResult {
  success: boolean;
  message?: string;
  users?: UserItem[];
  units?: UnitItem[];
}

const inputClass =
  "h-11 w-full rounded-xl border border-border-theme bg-surface-elevated px-3 text-[14px] text-text-primary outline-none transition-colors focus:border-accent-primary";

const labelClass =
  "mb-1.5 block text-[12px] font-medium text-text-secondary";

export function UsersPage({
  currentUserId,
  initialUsers,
  initialUnits,
  user,
  unit,
}: UsersPageProps) {
  const [users, setUsers] =
    useState<UserItem[]>(
      initialUsers,
    );

  const [units, setUnits] =
    useState<UnitItem[]>(
      initialUnits,
    );

  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [role, setRole] =
    useState<string>("MAINTENANCE");

  const [unitId, setUnitId] =
    useState(
      initialUnits[0]
        ? String(
            initialUnits[0].id,
          )
        : "",
    );

  const [saving, setSaving] =
    useState(false);

  const [busyId, setBusyId] =
    useState<number | null>(null);

  const [message, setMessage] =
    useState<{
      type: "error" | "success";
      text: string;
    } | null>(null);

  const load = useCallback(
    async () => {
      try {
        const response =
          await fetch(
            "/api/users",
            {
              cache: "no-store",
            },
          );

        const data =
          (await response.json()) as ApiResult;

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ??
              "Não foi possível carregar os usuários.",
          );
        }

        setUsers(data.users ?? []);

        setUnits(data.units ?? []);
      } catch (error) {
        setMessage({
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "Erro ao carregar usuários.",
        });
      }
    },
    [],
  );

  async function handleSubmit(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (saving) {
      return;
    }

    setSaving(true);
    setMessage(null);
=======
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

>>>>>>> origin/marques

    try {
      const response =
        await fetch(
          "/api/users",
          {
<<<<<<< HEAD
            method: "POST",
=======
            method:
              "POST",

>>>>>>> origin/marques
            headers: {
              "Content-Type":
                "application/json",
            },
<<<<<<< HEAD
            body: JSON.stringify({
              name,
              email,
              password,
              role,
              unitId:
                Number(unitId),
            }),
          },
        );

      const data =
        (await response.json()) as ApiResult;
=======

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

>>>>>>> origin/marques

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ??
<<<<<<< HEAD
            "Não foi possível cadastrar o usuário.",
        );
      }

      setName("");
      setEmail("");
      setPassword("");
      setRole("MAINTENANCE");

      setMessage({
        type: "success",
        text: "Usuário cadastrado com sucesso.",
      });

      await load();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Erro ao cadastrar usuário.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateUser(
    id: number,
    changes: {
      role?: string;
      active?: boolean;
    },
  ) {
    setBusyId(id);
    setMessage(null);

    try {
      const response =
        await fetch(
          `/api/users/${id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              changes,
            ),
          },
        );

      const data =
        (await response.json()) as ApiResult;

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ??
            "Não foi possível atualizar o usuário.",
        );
      }

      await load();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar usuário.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(
    item: UserItem,
  ) {
    if (
      !window.confirm(
        `Remover o usuário ${item.name}? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    setBusyId(item.id);
    setMessage(null);

    try {
      const response =
        await fetch(
          `/api/users/${item.id}`,
          {
            method: "DELETE",
          },
        );

      const data =
        (await response.json()) as ApiResult;

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ??
            "Não foi possível remover o usuário.",
        );
      }

      setMessage({
        type: "success",
        text: "Usuário removido.",
      });

      await load();
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Erro ao remover usuário.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background-secondary transition-colors">
      <AppHeader userName={user.name} city={unit.city} />

      <div className="mx-auto w-full max-w-[1280px] px-6 pb-20 pt-12 sm:px-8 lg:px-10">
        <Link
          href="/dashboard"
          className="mb-8 inline-flex items-center gap-2 rounded-[10px] border border-[#F40009] bg-[#F40009] px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:border-[#B90007] hover:bg-[#B90007]"
        >
          <ArrowLeft size={15} />

          Voltar
        </Link>

        <h1 className="text-[38px] font-semibold leading-[1.04] tracking-[-0.045em] text-text-title sm:text-[46px]">
          Usuários
        </h1>

        <p className="mt-4 max-w-[560px] text-[14px] leading-6 text-text-body">
          Cadastre novos usuários e defina a função de
          cada um. Apenas Admins têm acesso a esta página.
        </p>

        {message && (
          <div
            role="status"
            className={`mt-8 rounded-2xl px-5 py-3 text-[13px] ${
              message.type ===
              "error"
                ? "bg-[#FDECEE] text-[#B4141F]"
                : "bg-[#E9F6EE] text-[#1E6B3A]"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-[380px_1fr]">
          <form
            onSubmit={(event) =>
              void handleSubmit(
                event,
              )
            }
            className="h-fit rounded-[30px] border border-border-theme bg-surface transition-colors p-7"
          >
            <UserPlus
              size={24}
              strokeWidth={1.7}
              className="text-text-secondary"
            />

            <h2 className="mt-12 text-[30px] font-semibold leading-[1.08] tracking-[-0.04em] text-text-title">
              Novo usuário
            </h2>

            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="user-name"
                  className={labelClass}
                >
                  Nome
                </label>

                <input
                  id="user-name"
                  required
                  maxLength={150}
                  value={name}
                  onChange={(event) =>
                    setName(
                      event.target.value,
                    )
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="user-email"
                  className={labelClass}
                >
                  E-mail
                </label>

                <input
                  id="user-email"
                  type="email"
                  required
                  maxLength={191}
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value,
                    )
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="user-password"
                  className={labelClass}
                >
                  Senha (mín. 8 caracteres)
                </label>

                <input
                  id="user-password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value,
                    )
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="user-role"
                  className={labelClass}
                >
                  Função
                </label>

                <select
                  id="user-role"
                  value={role}
                  onChange={(event) =>
                    setRole(
                      event.target.value,
                    )
                  }
                  className={inputClass}
                >
                  {ASSIGNABLE_ROLES.map(
                    (item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {
                          ROLE_LABELS[
                            item
                          ]
                        }
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="user-unit"
                  className={labelClass}
                >
                  Unidade
                </label>

                <select
                  id="user-unit"
                  required
                  value={unitId}
                  onChange={(event) =>
                    setUnitId(
                      event.target.value,
                    )
                  }
                  className={inputClass}
                >
                  {units.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={
                saving ||
                !unitId
              }
              className="mt-7 h-11 w-full rounded-xl bg-[#E41E2B] text-[13px] font-semibold text-white transition-colors hover:bg-[#CF1925] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Cadastrando..."
                : "Cadastrar usuário"}
            </button>
          </form>

          <section className="overflow-hidden rounded-[30px] border border-black/[0.07] bg-background-primary transition-colors">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[#EEEEEC] text-[11px] uppercase tracking-wide text-text-body">
                    <th className="px-6 py-4 font-medium">
                      Usuário
                    </th>

                    <th className="px-4 py-4 font-medium">
                      Função
                    </th>

                    <th className="px-4 py-4 font-medium">
                      Unidade
                    </th>

                    <th className="px-4 py-4 text-right font-medium">
                      Status
                    </th>

                    <th className="px-6 py-4 text-right font-medium">
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((item) => {
                      const isSelf =
                        item.id ===
                        currentUserId;

                      const busy =
                        busyId ===
                        item.id;

                      return (
                        <tr
                          key={item.id}
                          className="border-b border-[#F3F3F1] last:border-0"
                        >
                          <td className="px-6 py-4">
                            <p className="font-medium text-text-title">
                              {item.name}
                            </p>

                            <p className="mt-0.5 text-[12px] text-text-body">
                              {item.email}
                            </p>
                          </td>

                          <td className="px-4 py-4">
                            <select
                              aria-label={`Função de ${item.name}`}
                              value={
                                item.role
                              }
                              disabled={
                                busy ||
                                isSelf
                              }
                              onChange={(
                                event,
                              ) =>
                                void updateUser(
                                  item.id,
                                  {
                                    role: event
                                      .target
                                      .value,
                                  },
                                )
                              }
                              className="h-9 rounded-lg border border-black/[0.1] bg-background-primary transition-colors px-2 text-[13px] disabled:opacity-60"
                            >
                              {!(
                                ASSIGNABLE_ROLES as readonly string[]
                              ).includes(
                                item.role,
                              ) && (
                                <option
                                  value={
                                    item.role
                                  }
                                  disabled
                                >
                                  {ROLE_LABELS[
                                    item
                                      .role
                                  ] ??
                                    item.role}
                                </option>
                              )}

                              {ASSIGNABLE_ROLES.map(
                                (
                                  option,
                                ) => (
                                  <option
                                    key={
                                      option
                                    }
                                    value={
                                      option
                                    }
                                  >
                                    {
                                      ROLE_LABELS[
                                        option
                                      ]
                                    }
                                  </option>
                                ),
                              )}
                            </select>
                          </td>

                          <td className="px-4 py-4 text-text-body">
                            {item.unitName ??
                              "—"}
                          </td>

                          <td className="px-4 py-4 text-right">
                            <button
                              type="button"
                              disabled={
                                busy ||
                                isSelf
                              }
                              onClick={() =>
                                void updateUser(
                                  item.id,
                                  {
                                    active:
                                      !item.active,
                                  },
                                )
                              }
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                item.active
                                  ? "bg-[#22E06B] text-[#052E16] shadow-[0_0_14px_rgba(34,224,107,0.85),inset_0_0_0_1px_rgba(255,255,255,0.35)] hover:bg-[#4DEB89]"
                                  : "bg-[#FF3B47] text-white shadow-[0_0_14px_rgba(255,59,71,0.85),inset_0_0_0_1px_rgba(255,255,255,0.35)] hover:bg-[#FF5A64]"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  item.active
                                    ? "bg-[#052E16]"
                                    : "bg-white"
                                }`}
                              />

                              {item.active
                                ? "Ativo"
                                : "Inativo"}
                            </button>
                          </td>

                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              disabled={
                                busy ||
                                isSelf
                              }
                              onClick={() =>
                                void removeUser(
                                  item,
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-full bg-[#FF3B47] px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_0_14px_rgba(255,59,71,0.85),inset_0_0_0_1px_rgba(255,255,255,0.35)] transition-colors hover:bg-[#FF5A64] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
=======
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
>>>>>>> origin/marques
