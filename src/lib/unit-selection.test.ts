import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRows: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ executeRows: mocks.executeRows }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookie }),
}));

import { getAuthorizedUnits, getUnitSelection } from "./unit-selection";

const unitA = { id: 1, code: "A", name: "Unidade A", city: null, state: null, is_default: 1 };

describe("unit selection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("only lists units linked to the user in user_units", async () => {
    mocks.executeRows.mockResolvedValue([unitA]);
    const units = await getAuthorizedUnits(5);
    const [sql, values] = mocks.executeRows.mock.calls[0];
    expect(sql).toMatch(/INNER JOIN\s+user_units uu/);
    expect(sql).not.toContain("LEFT JOIN");
    expect(values).toEqual([5]);
    expect(units).toEqual([{ id: 1, code: "A", name: "Unidade A", city: null, state: null, isDefault: true }]);
  });

  it("drops cookie unit ids the user is not linked to", async () => {
    mocks.executeRows.mockResolvedValue([unitA]);
    mocks.cookie.mockReturnValue({ value: "1,2" });
    const selection = await getUnitSelection({ userId: 5, defaultUnitId: 1 });
    expect(selection.selectedUnitIds).toEqual([1]);
  });

  it("falls back to the session unit when the cookie only has foreign units", async () => {
    mocks.executeRows.mockResolvedValue([unitA]);
    mocks.cookie.mockReturnValue({ value: "2" });
    const selection = await getUnitSelection({ userId: 5, defaultUnitId: 1 });
    expect(selection.selectedUnitIds).toEqual([1]);
  });

  it("selects nothing for a user without linked units", async () => {
    mocks.executeRows.mockResolvedValue([]);
    mocks.cookie.mockReturnValue({ value: "1" });
    const selection = await getUnitSelection({ userId: 5, defaultUnitId: 1 });
    expect(selection).toEqual({ units: [], selectedUnitIds: [] });
  });
});
