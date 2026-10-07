// Progresso em memória de uma importação em andamento, consultado pela tela
// enquanto o POST /api/imports/process ainda não respondeu.
//
// Fica em globalThis porque o Next.js pode carregar este módulo mais de uma
// vez (um bundle por rota), e as duas rotas precisam ver o mesmo Map.

export type ImportProgressStage =
  | "importing"
  | "classifying";

export interface ImportProgress {
  stage: ImportProgressStage;
  done: number;
  total: number;
  updatedAt: number;
}

const STALE_AFTER_MS = 60 * 60 * 1000;

const PROGRESS_ID_PATTERN = /^[\w-]{8,64}$/;

const globalForProgress = globalThis as typeof globalThis & {
  importProgress?: Map<string, ImportProgress>;
};

const store =
  globalForProgress.importProgress ??
  (globalForProgress.importProgress = new Map());

function storeKey(userId: number, progressId: string): string {
  return `${userId}:${progressId}`;
}

export function isValidProgressId(value: unknown): value is string {
  return typeof value === "string" && PROGRESS_ID_PATTERN.test(value);
}

export function setImportProgress(
  userId: number,
  progressId: string,
  progress: Omit<ImportProgress, "updatedAt">,
): void {
  const now = Date.now();

  for (const [key, value] of store) {
    if (now - value.updatedAt > STALE_AFTER_MS) store.delete(key);
  }

  store.set(storeKey(userId, progressId), { ...progress, updatedAt: now });
}

export function getImportProgress(
  userId: number,
  progressId: string,
): ImportProgress | null {
  return store.get(storeKey(userId, progressId)) ?? null;
}

export function clearImportProgress(userId: number, progressId: string): void {
  store.delete(storeKey(userId, progressId));
}
