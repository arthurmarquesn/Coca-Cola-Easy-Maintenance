import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRows: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ executeRows: mocks.executeRows }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookie }),
}));

import { getAuthorizedUnits, getUnitSelection, USER_UNIT_SCOPE_CONDITION } from "./unit-selection";

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
    expect(sql).toContain(USER_UNIT_SCOPE_CONDITION);
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

  it("limits a manager to the primary unit in SQL", () => {
    expect(USER_UNIT_SCOPE_CONDITION).toMatch(/u\.role <> 'MANAGER' OR uu\.unit_id = u\.unit_id/);
  });

  describe("manager of MARILIA (BAAK)", () => {
    // getAuthorizedUnits devolve só a unidade principal do Gestor.
    const marilia = { id: 7, code: "BAAK", name: "MARILIA", city: null, state: null, is_default: 1 };

    beforeEach(() => {
      mocks.executeRows.mockResolvedValue([marilia]);
    });

    it("selects MARILIA", async () => {
      mocks.cookie.mockReturnValue({ value: "7" });
      expect((await getUnitSelection({ userId: 5, defaultUnitId: 7 })).selectedUnitIds).toEqual([7]);
    });

    it("never selects JUNDIAÍ (BAAD) sent in the cookie", async () => {
      mocks.cookie.mockReturnValue({ value: "8" });
      expect((await getUnitSelection({ userId: 5, defaultUnitId: 7 })).selectedUnitIds).toEqual([7]);
    });

    it("drops JUNDIAÍ from MARILIA + JUNDIAÍ", async () => {
      mocks.cookie.mockReturnValue({ value: "7,8" });
      expect((await getUnitSelection({ userId: 5, defaultUnitId: 7 })).selectedUnitIds).toEqual([7]);
    });
  });

  it("keeps exactly the three units chosen by a multi-unit user", async () => {
    mocks.executeRows.mockResolvedValue([1, 2, 3, 4].map((id) => ({ ...unitA, id, is_default: id === 1 ? 1 : 0 })));
    mocks.cookie.mockReturnValue({ value: "2,3,4" });
    expect((await getUnitSelection({ userId: 5, defaultUnitId: 1 })).selectedUnitIds).toEqual([2, 3, 4]);
  });
});
