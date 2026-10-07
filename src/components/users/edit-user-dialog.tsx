"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { LoaderCircle, X } from "lucide-react";

import {
  UnitAccessPicker,
  type PickerUnit,
} from "@/components/users/unit-access-picker";

type UserRole = "MANAGER" | "MAINTENANCE";

export interface EditableUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  unitIds: number[];
  representativeUnit: PickerUnit | null;
}

interface EditUserDialogProps {
  user: EditableUser;
  /* Unidades de quem administra: as únicas que pode atribuir. */
  units: PickerUnit[];
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const fieldClassName =
  "mt-2 h-11 w-full rounded-[12px] border border-border-theme bg-surface px-3.5 text-[13px] text-text-primary outline-none transition-colors focus:border-accent-primary disabled:cursor-not-allowed disabled:bg-surface-elevated disabled:text-text-secondary";

function sameIds(a: number[], b: number[]) {
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);

  return (
    sortedA.length === sortedB.length &&
    sortedA.every((id, index) => id === sortedB[index])
  );
}

export function EditUserDialog({
  user,
  units,
  isSelf,
  onClose,
  onSaved,
}: EditUserDialogProps) {
  const visibleUnitIds = new Set(units.map((unit) => unit.id));
  const initialUnitId = user.representativeUnit?.id ?? null;
  const initialExtras = user.unitIds.filter(
    (unitId) => unitId !== initialUnitId && visibleUnitIds.has(unitId),
  );

  const [role, setRole] = useState<UserRole>(user.role);
  const [active, setActive] = useState(user.active);
  const [unitId, setUnitId] = useState<number | null>(initialUnitId);
  const [extraUnitIds, setExtraUnitIds] = useState<number[]>(initialExtras);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, saving]);

  /* A unidade principal atual pode estar fora do escopo de
     quem edita; ela continua como opção para não ser trocada
     sem querer. */
  const unitOptions =
    user.representativeUnit &&
    !visibleUnitIds.has(user.representativeUnit.id)
      ? [user.representativeUnit, ...units]
      : units;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (saving) {
      return;
    }

    if (unitId === null) {
      setError("Selecione a unidade principal.");
      return;
    }

    const body: Record<string, unknown> = {};

    if (role !== user.role) body.role = role;
    if (active !== user.active) body.active = active;
    if (unitId !== initialUnitId) body.unitId = unitId;

    const extras =
      role === "MANAGER"
        ? []
        : extraUnitIds.filter((id) => id !== unitId);

    if (role !== "MANAGER" && !sameIds(extras, initialExtras)) {
      body.extraUnitIds = extras;
    }

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(
          data.message ?? "Não foi possível atualizar o usuário.",
        );
      }

      await onSaved();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível atualizar o usuário.",
      );
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-user-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[22px] border border-border-theme bg-surface p-6 shadow-[0_24px_70px_rgba(0,0,0,0.25)] sm:max-w-[460px] sm:rounded-[22px]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="edit-user-title"
              className="text-[17px] font-semibold tracking-[-0.02em] text-text-primary"
            >
              Editar usuário
            </h2>
            <p className="mt-1 truncate text-[11px] text-text-secondary">
              {user.name} · {user.email}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-40"
          >
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <label className="block text-[11px] font-medium text-text-secondary">
            Perfil
            <select
              value={role}
              disabled={isSelf || saving}
              onChange={(event) => {
                const nextRole = event.target.value as UserRole;
                setRole(nextRole);
                if (nextRole === "MANAGER") setExtraUnitIds([]);
              }}
              className={fieldClassName}
            >
              <option value="MAINTENANCE">Analista</option>
              <option value="MANAGER">Gestor</option>
            </select>
          </label>

          <label className="mt-5 block text-[11px] font-medium text-text-secondary">
            Unidade principal
            <select
              value={unitId ?? ""}
              required
              disabled={saving}
              onChange={(event) => {
                const value = event.target.value ? Number(event.target.value) : null;
                setUnitId(value);
                setExtraUnitIds((current) => current.filter((id) => id !== value));
              }}
              className={fieldClassName}
            >
              <option value="">Selecione a unidade</option>
              {unitOptions.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.code ? `${unit.name} — ${unit.code}` : unit.name}
                </option>
              ))}
            </select>
          </label>

          {role === "MANAGER" ? (
            <p className="mt-2 text-[10px] leading-4 text-text-secondary">
              O Gestor consulta somente os dados da unidade principal.
            </p>
          ) : (
            <div className="mt-5">
              <p className="text-[11px] font-medium text-text-secondary">
                Unidades de acesso adicionais
              </p>
              <UnitAccessPicker
                units={units}
                primaryUnitId={unitId}
                selectedIds={extraUnitIds}
                onChange={setExtraUnitIds}
                disabled={saving}
              />
            </div>
          )}

          <label className="mt-5 flex items-center justify-between gap-4 rounded-[12px] border border-border-theme bg-surface-elevated px-4 py-3">
            <span>
              <span className="block text-[12px] font-semibold text-text-primary">
                Usuário ativo
              </span>
              <span className="mt-0.5 block text-[10px] text-text-secondary">
                Usuários inativos não conseguem entrar.
              </span>
            </span>
            <input
              type="checkbox"
              checked={active}
              disabled={isSelf || saving}
              onChange={(event) => setActive(event.target.checked)}
              className="h-4 w-4 accent-accent-primary"
            />
          </label>

          {isSelf && (
            <p className="mt-2 text-[10px] leading-4 text-text-secondary">
              Você não pode alterar o próprio perfil nem se desativar.
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-[12px] border border-error/30 bg-error/10 px-4 py-3 text-[11px] leading-5 text-error"
            >
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-11 rounded-[11px] border border-border-theme bg-surface px-5 text-[12px] font-semibold text-text-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-[11px] bg-button-primary px-5 text-[12px] font-semibold text-white transition-colors hover:bg-button-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <LoaderCircle size={15} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
