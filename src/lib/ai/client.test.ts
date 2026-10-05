import { afterEach, describe, expect, it, vi } from "vitest";

describe("optional Groq integration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("can be imported without credentials and reports missing configuration only when used", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const { getGroqClient } = await import("./client");
    expect(() => getGroqClient()).toThrow("GROQ_API_KEY");
  });
  it("reuses the configured client", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key-no-network-request");
    const { getGroqClient } = await import("./client");
    expect(getGroqClient()).toBe(getGroqClient());
  });
});
