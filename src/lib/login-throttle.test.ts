import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  query: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  executeQuery: vi.fn(),
  getConnection: async () => mocks,
}));

import { consumeLoginAttempt, getTrustedClientIp } from "./login-throttle";

describe("login throttle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores forwarded headers unless a trusted header is configured", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" });
    expect(getTrustedClientIp(headers)).toBeNull();
    vi.stubEnv("LOGIN_TRUSTED_IP_HEADER", "x-real-ip");
    expect(getTrustedClientIp(headers)).toBe("5.6.7.8");
  });

  it("blocks when the IP counter is over its limit even if the account is not", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ attempts: 1, retry_after: 900 }]])
      .mockResolvedValueOnce([[{ attempts: 51, retry_after: 300 }]])
      .mockResolvedValueOnce([[]]);
    expect(await consumeLoginAttempt("a@b.com", "5.6.7.8")).toBe(300);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("does not fail a valid attempt when cleanup of expired rows fails", async () => {
    mocks.query
      .mockResolvedValueOnce([[{ attempts: 1, retry_after: 900 }]])
      .mockRejectedValueOnce(new Error("deadlock"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await consumeLoginAttempt("a@b.com")).toBe(0);
    expect(mocks.commit).toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
