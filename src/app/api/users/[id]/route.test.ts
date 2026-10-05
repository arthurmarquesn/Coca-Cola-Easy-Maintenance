import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  session: vi.fn(),
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

import { DELETE, PATCH } from "./route";

const params = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const patch = (body: unknown) =>
  new Request("http://localhost/api/users/9", { method: "PATCH", body: JSON.stringify(body) });

describe("users/[id] API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ userId: 1, unitId: 7, role: "MAINTENANCE" });
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
});
