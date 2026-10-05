import { describe, expect, it } from "vitest";
import { isAnalystRole, normalizeSessionRole } from "./roles";

describe("normalizeSessionRole", () => {
  it("keeps assignable roles", () => {
    expect(normalizeSessionRole("MAINTENANCE")).toBe("MAINTENANCE");
    expect(normalizeSessionRole("MANAGER")).toBe("MANAGER");
  });

  it("maps legacy ADMIN to analyst so pre-migration databases keep access", () => {
    const role = normalizeSessionRole("ADMIN");
    expect(role).toBe("MAINTENANCE");
    expect(isAnalystRole(role)).toBe(true);
  });

  it.each(["VIEWER", "", null, undefined, 1])("rejects %s", (value) => {
    expect(normalizeSessionRole(value)).toBeNull();
  });
});
