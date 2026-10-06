import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  session: vi.fn(),
  unitSelection: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getConnection: mocks.getConnection }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/unit-selection", () => ({ getUnitSelection: mocks.unitSelection }));

import { DELETE } from "./route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = () =>
  new Request("http://localhost/api/imports/5", { method: "DELETE" }) as unknown as NextRequest;

describe("imports/[id] DELETE", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("answers 401 without a session", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await DELETE(request(), params("5"));
    expect(response.status).toBe(401);
    expect(mocks.getConnection).not.toHaveBeenCalled();
  });

  it("refuses managers before touching the database", async () => {
    mocks.session.mockResolvedValue({ userId: 1, unitId: 7, role: "MANAGER" });
    const response = await DELETE(request(), params("5"));
    expect(response.status).toBe(403);
    expect(mocks.getConnection).not.toHaveBeenCalled();
    expect(mocks.unitSelection).not.toHaveBeenCalled();
  });
});
