import { afterEach, describe, expect, it, vi } from "vitest";

import { emailDomainMessage, getAllowedEmailDomains, isAllowedEmailDomain } from "./email-domain";

describe("email domain", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts only kof.com by default", () => {
    expect(getAllowedEmailDomains()).toEqual(["kof.com"]);
    expect(isAllowedEmailDomain("exemplo@kof.com")).toBe(true);
    expect(isAllowedEmailDomain("Exemplo@KOF.COM")).toBe(true);
  });

  it.each([
    "exemplo@gmail.com",
    "exemplo@kof.com.br",
    "exemplo@mail.kof.com",
    "exemplo@notkof.com",
    "kof.com",
    "@kof.com",
    "exemplo@",
  ])("refuses %s", (email) => {
    expect(isAllowedEmailDomain(email)).toBe(false);
  });

  it("reads extra domains from ALLOWED_EMAIL_DOMAINS", () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", " kof.com , @Example.com ");
    expect(getAllowedEmailDomains()).toEqual(["kof.com", "example.com"]);
    expect(isAllowedEmailDomain("analista.teste@example.com")).toBe(true);
    expect(emailDomainMessage()).toBe("Use seu e-mail corporativo @kof.com.");
  });
});
