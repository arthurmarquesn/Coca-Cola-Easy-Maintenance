import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  session: vi.fn(),
  authorizedUnits: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  getConnection: async () => ({
    query: mocks.query,
    execute: mocks.execute,
    beginTransaction: mocks.beginTransaction,
    commit: mocks.commit,
    rollback: mocks.rollback,
    release: mocks.release,
  }),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/unit-selection", () => ({ getAuthorizedUnits: mocks.authorizedUnits }));

import { DELETE, PATCH } from "./route";

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const patch = (body: unknown) =>
  new Request("http://localhost/api/users/9", { method: "PATCH", body: JSON.stringify(body) });

describe("users/[id] API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ userId: 1, unitId: 7, role: "MAINTENANCE" });
    // Analista com acesso às unidades 7 (MARILIA) e 8 (JUNDIAÍ).
    mocks.authorizedUnits.mockResolvedValue([{ id: 7 }, { id: 8 }]);
  });

  it("answers 404 for a user outside the analyst's units", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1 }]])
      .mockResolvedValueOnce([[]]);
    const response = await PATCH(patch({ active: false }), params(9));
    expect(response.status).toBe(404);
    const [targetSql, targetValues] = mocks.query.mock.calls[1];
    expect(targetSql).toContain("actor_unit.user_id = ?");
    expect(targetValues).toEqual([9, 1]);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.rollback).toHaveBeenCalled();
  });

  it("refuses to demote the last active analyst of a unit", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1 }]])
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1 }]])
      .mockResolvedValueOnce([[{ name: "Unidade B" }]]);
    const response = await PATCH(patch({ role: "MANAGER" }), params(9));
    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain("Unidade B");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("updates a manager in a shared unit", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1 }]])
      .mockResolvedValueOnce([[{ role: "MANAGER", active: 1 }]]);
    const response = await PATCH(patch({ role: "MAINTENANCE" }), params(9));
    expect(response.status).toBe(200);
    expect(mocks.execute.mock.calls[0][1]).toEqual(["MAINTENANCE", 9]);
    expect(mocks.commit).toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalled();
  });

  it("forbids an actor who lost analyst access after the session was read", async () => {
    mocks.query.mockResolvedValueOnce([[{ role: "MANAGER", active: 1 }]]);
    const response = await DELETE(new Request("http://localhost"), params(9));
    expect(response.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("refuses to delete the last active analyst of a unit", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1 }]])
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1 }]])
      .mockResolvedValueOnce([[{ name: "Unidade B" }]]);
    const response = await DELETE(new Request("http://localhost"), params(9));
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects extra units for a manager", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1 }]])
      .mockResolvedValueOnce([[{ role: "MANAGER", active: 1, unit_id: 7 }]])
      .mockResolvedValueOnce([[{ unit_id: 7 }]]);
    const response = await PATCH(patch({ extraUnitIds: [8] }), params(9));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain("Gestor");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.rollback).toHaveBeenCalled();
  });

  it("rejects a unit outside the analyst's units", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1 }]])
      .mockResolvedValueOnce([[{ role: "MANAGER", active: 1, unit_id: 7 }]])
      .mockResolvedValueOnce([[{ unit_id: 7 }]]);
    const response = await PATCH(patch({ unitId: 99 }), params(9));
    expect(response.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects a malformed unit id", async () => {
    const response = await PATCH(patch({ unitId: "BAAD" }), params(9));
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("moves a manager to another unit and drops the old link", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1 }]])
      .mockResolvedValueOnce([[{ role: "MANAGER", active: 1, unit_id: 7 }]])
      .mockResolvedValueOnce([[{ unit_id: 7 }]])
      .mockResolvedValueOnce([{}]);
    const response = await PATCH(patch({ unitId: 8 }), params(9));
    expect(response.status).toBe(200);
    const statements = mocks.execute.mock.calls.map(([sql, values]) => [String(sql).replace(/\s+/g, " ").trim(), values]);
    expect(statements[0]).toEqual(["UPDATE users SET unit_id = ? WHERE id = ?", [8, 9]]);
    expect(statements[1][0]).toContain("DELETE FROM user_units");
    expect(statements[1][1]).toEqual([9, 8]);
    expect(mocks.query.mock.calls[3][1]).toEqual([9, 8]);
    expect(mocks.commit).toHaveBeenCalled();
  });

  it("demoting an analyst to manager keeps only the primary unit", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1 }]])
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1, unit_id: 7 }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ unit_id: 7 }, { unit_id: 8 }]])
      .mockResolvedValueOnce([{}]);
    const response = await PATCH(patch({ role: "MANAGER" }), params(9));
    expect(response.status).toBe(200);
    const deleteCall = mocks.execute.mock.calls.find(([sql]) => String(sql).includes("DELETE FROM user_units"));
    expect(deleteCall?.[1]).toEqual([9, 7]);
  });

  it("refuses to remove the only analyst from a unit link", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1 }]])
      .mockResolvedValueOnce([[{ role: "MAINTENANCE", active: 1, unit_id: 7 }]])
      .mockResolvedValueOnce([[{ unit_id: 7 }, { unit_id: 8 }]])
      .mockResolvedValueOnce([[{ name: "JUNDIAÍ" }]]);
    const response = await PATCH(patch({ extraUnitIds: [] }), params(9));
    expect(response.status).toBe(409);
    expect(mocks.query.mock.calls[3][1]).toEqual([9, 8]);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
