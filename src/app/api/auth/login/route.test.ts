import { beforeEach, describe, expect, it, vi } from "vitest";
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

  describe("corporate e-mail domain", () => {
    const login = (email: string) => POST(new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "SenhaForte1" }),
    }));

    beforeEach(() => {
      vi.resetAllMocks();
      vi.unstubAllEnvs();
    });

    it.each(["joao@gmail.com", "joao@kof.com.br", "joao@example.com"])("refuses %s before touching the database", async (email) => {
      const response = await login(email);
      expect(response.status).toBe(400);
      expect((await response.json()).message).toBe("Use seu e-mail corporativo @kof.com.");
      expect(mocks.consume).not.toHaveBeenCalled();
      expect(mocks.executeRows).not.toHaveBeenCalled();
    });

    it("lets a @kof.com e-mail reach the credential check", async () => {
      mocks.consume.mockResolvedValue(0);
      mocks.executeRows.mockResolvedValue([]);
      const response = await login("Joao@KOF.com");
      expect(response.status).toBe(401);
      expect(mocks.executeRows.mock.calls[0][1]).toEqual(["joao@kof.com"]);
    });

    it("accepts extra development domains from ALLOWED_EMAIL_DOMAINS", async () => {
      vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "kof.com,example.com");
      mocks.consume.mockResolvedValue(0);
      mocks.executeRows.mockResolvedValue([]);
      expect((await login("analista.teste@example.com")).status).toBe(401);
    });
  });
});
