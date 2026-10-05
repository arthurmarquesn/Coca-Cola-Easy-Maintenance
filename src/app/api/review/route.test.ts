import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  release: vi.fn(),
  getConnection: vi.fn(),
  session: vi.fn(),
  applyReview: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getConnection: mocks.getConnection }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/unit-selection", () => ({
  getUnitSelection: async () => ({ selectedUnitIds: [7] }),
}));
vi.mock("@/lib/maintenance/apply-review", () => ({
  applyReview: mocks.applyReview,
  parseTopPredictions: () => [],
}));

import { GET, PATCH } from "./route";
import { POST as bulkReview } from "./bulk/route";

describe("review API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ userId: 1, unitId: 7, role: "MAINTENANCE" });
    mocks.getConnection.mockResolvedValue({ execute: mocks.execute, release: mocks.release });
  });

  it("scopes the progress summary to its category without the table's status filter", async () => {
    mocks.execute
      .mockResolvedValueOnce([[{ total: 4, pending: 1, confirmed: 2, corrected: 1, rejected: 0 }]])
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[]]);
    const response = await GET(new NextRequest("http://localhost/api/review?category=sensores&status=PENDENTE_REVISAO&line=L1"));
    expect(response.status).toBe(200);
    expect((await response.json()).summary).toMatchObject({ total: 4, pending: 1, reviewed: 3 });
    const [summarySql, summaryValues] = mocks.execute.mock.calls[0];
    expect(summarySql).toContain("me.unit_id IN (?)");
    expect(summarySql).toContain("TRIM(me.source_line_name) = ?");
    expect(summarySql.slice(summarySql.indexOf("WHERE"))).not.toContain("cs.status = ?");
    expect(summarySql).toMatch(/END\s*\) = \?/);
    expect(summaryValues).toEqual([7, "L1", "sensores"]);
    expect(mocks.execute.mock.calls[1][1]).toEqual([7, "PENDENTE_REVISAO", "L1", "sensores"]);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  for (const [name, handler, method] of [["individual", PATCH, "PATCH"], ["bulk", bulkReview, "POST"]] as const) {
    it.each(["null", "[]", '"text"', "{"])(`${name} rejects invalid body %s before opening a transaction`, async (body) => {
      const response = await handler(new NextRequest("http://localhost/api/review", { method, body }));
      expect(response.status).toBe(400);
      expect(mocks.getConnection).not.toHaveBeenCalled();
    });
    it(`${name} forbids writes by a manager`, async () => {
      mocks.session.mockResolvedValue({ userId: 2, role: "MANAGER" });
      const response = await handler(new NextRequest("http://localhost/api/review", { method, body: "{}" }));
      expect(response.status).toBe(403);
      expect(mocks.applyReview).not.toHaveBeenCalled();
    });
  }
});
