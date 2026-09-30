"use client";

import Image from "next/image";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";

import {
  ArrowLeft,
  UserPlus,
} from "lucide-react";

import {
  useCallback,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

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

    try {
      const response =
        await fetch(
          "/api/users",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
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

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ??
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
      <header className="border-b border-black/[0.05] bg-background-primary transition-colors">
        <div className="mx-auto flex h-[76px] w-full max-w-[1280px] items-center justify-between px-6 sm:px-8 lg:px-10">
          <Image
            src="/logo.webp"
            alt="Coca-Cola FEMSA"
            width={180}
            height={64}
            priority
            className="h-auto max-h-[42px] w-auto object-contain"
          />

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-5">
            <ThemeSwitcher />
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium text-text-title">
                {user.name}
              </p>

              <p className="mt-0.5 text-[11px] text-text-body">
                {unit.city}
              </p>
            </div>

            <div className="h-8 w-px bg-black/[0.07]" />

            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-[12px] font-medium text-text-body transition-colors hover:text-[#E41E2B]"
            >
              <ArrowLeft
                size={16}
                strokeWidth={1.8}
              />

              <span>Voltar</span>
            </Link>
          </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1280px] px-6 pb-20 pt-12 sm:px-8 lg:px-10">
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

            -text-title">
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
                              className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                item.active
                                  ? "bg-[#E9F6EE] text-[#1E6B3A] hover:bg-[#DCF0E4]"
                                  : "bg-[#F1F1EF] text-text-body hover:bg-[#E8E8E5]"
                              }`}
                            >
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
                              className="rounded-full px-3 py-1.5 text-[12px] font-medium text-[#B4141F] transition-colors hover:bg-[#FDECEE] disabled:cursor-not-allowed disabled:opacity-40"
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
