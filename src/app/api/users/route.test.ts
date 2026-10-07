import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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

import { POST } from "./route";

const MARILIA = { id: 7, code: "BAAK", name: "MARILIA", city: null, state: null, isDefault: true };
const JUNDIAI = { id: 8, code: "BAAD", name: "JUNDIAÍ", city: null, state: null, isDefault: false };

async function create(body: Record<string, unknown>): Promise<Response> {
  const response = await POST(new NextRequest("http://localhost/api/users", {
    method: "POST",
    body: JSON.stringify({
      name: "Carlos",
      email: "carlos@kof.com",
      password: "SenhaForte1",
      ...body,
    }),
  }));
  if (!response) throw new Error("POST /api/users não respondeu.");
  return response;
}

describe("POST /api/users", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ userId: 1, unitId: 7, role: "MAINTENANCE" });
    mocks.authorizedUnits.mockResolvedValue([MARILIA, JUNDIAI]);
  });

  it.each(["carlos@gmail.com", "carlos@kof.com.br", "carlos@mail.kof.com"])("refuses %s outside the corporate domain", async (email) => {
    const response = await create({ email, role: "MANAGER", representativeUnitId: 7 });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain("@kof.com");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("refuses a manager without a unit", async () => {
    const response = await create({ role: "MANAGER", representativeUnitId: null });
    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("refuses a unit that does not exist for the analyst", async () => {
    const response = await create({ role: "MANAGER", representativeUnitId: 999 });
    expect(response.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("refuses extra units for a manager", async () => {
    const response = await create({ role: "MANAGER", representativeUnitId: 7, extraUnitIds: [8] });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain("Gestor");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("refuses malformed extra units", async () => {
    const response = await create({ role: "MAINTENANCE", representativeUnitId: 7, extraUnitIds: ["BAAD"] });
    expect(response.status).toBe(400);
  });

  it("forbids a manager from creating users", async () => {
    mocks.session.mockResolvedValue({ userId: 2, unitId: 7, role: "MANAGER" });
    const response = await create({ role: "MANAGER", representativeUnitId: 7 });
    expect(response.status).toBe(403);
  });

  it("creates a manager linked only to the chosen unit", async () => {
    mocks.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);
    mocks.execute.mockResolvedValueOnce([{ insertId: 42 }]).mockResolvedValue([{}]);
    const response = await create({ role: "MANAGER", representativeUnitId: 7 });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.user.unitIds).toEqual([7]);
    expect(body.user.representativeUnit.code).toBe("BAAK");
    const insertUser = mocks.execute.mock.calls[0];
    expect(insertUser[1][0]).toBe(7);
    const insertLinks = mocks.query.mock.calls[1];
    expect(insertLinks[1]).toEqual([42, 7]);
    expect(mocks.commit).toHaveBeenCalled();
  });

  it("creates an analyst with extra access units", async () => {
    mocks.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);
    mocks.execute.mockResolvedValueOnce([{ insertId: 43 }]).mockResolvedValue([{}]);
    const response = await create({ role: "MAINTENANCE", representativeUnitId: 7, extraUnitIds: [8] });
    expect(response.status).toBe(201);
    expect((await response.json()).user.unitIds).toEqual([7, 8]);
    expect(mocks.query.mock.calls[1][1]).toEqual([43, 7, 43, 8]);
  });
});
