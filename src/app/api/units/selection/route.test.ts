import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), authorizedUnits: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ SESSION_DURATION_SECONDS: 28800 }));
vi.mock("@/lib/db", () => ({ executeRows: vi.fn() }));
vi.mock("@/lib/unit-selection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/unit-selection")>()),
  getAuthorizedUnits: mocks.authorizedUnits,
}));

import { POST } from "./route";

const select = (unitIds: unknown) =>
  POST(new NextRequest("http://localhost/api/units/selection", {
    method: "POST",
    body: JSON.stringify({ unitIds }),
  }));

describe("POST /api/units/selection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ userId: 5, unitId: 7, role: "MANAGER" });
    // Gestor de MARILIA: só a unidade 7 é autorizada.
    mocks.authorizedUnits.mockResolvedValue([{ id: 7 }]);
  });

  it("lets the manager select MARILIA", async () => {
    const response = await select([7]);
    expect(response.status).toBe(200);
    expect(response.cookies.get("coca_unit_selection")?.value).toBe("7");
  });

  it("forbids JUNDIAÍ", async () => {
    const response = await select([8]);
    expect(response.status).toBe(403);
    expect(response.cookies.get("coca_unit_selection")).toBeUndefined();
  });

  it("forbids MARILIA + JUNDIAÍ without storing any of them", async () => {
    const response = await select([7, 8]);
    expect(response.status).toBe(403);
    expect(response.cookies.get("coca_unit_selection")).toBeUndefined();
  });

  it("requires a session", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await select([7])).status).toBe(401);
  });
});
