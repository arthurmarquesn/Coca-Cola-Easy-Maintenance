import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ consume: vi.fn(), executeRows: vi.fn() }));
vi.mock("@/lib/login-throttle", () => ({ consumeLoginAttempt: mocks.consume, clearLoginAttempts: vi.fn(), getTrustedClientIp: () => null }));
vi.mock("@/lib/db", () => ({ executeRows: mocks.executeRows, executeQuery: vi.fn() }));
vi.mock("@/lib/auth", () => ({ createSessionToken: vi.fn(), SESSION_COOKIE_NAME: "session", SESSION_DURATION_SECONDS: 28800 }));
vi.mock("@/lib/unit-selection", () => ({ serializeUnitSelection: vi.fn(), UNIT_SELECTION_COOKIE_NAME: "units" }));
import { POST } from "./route";

describe("login validation", () => {
  it.each(["null", "[]", '"text"', "{", "{}"])("returns 400 for %s without querying the database", async (body) => {
    const response = await POST(new Request("http://localhost/api/auth/login", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.executeRows).not.toHaveBeenCalled();
  });
});
