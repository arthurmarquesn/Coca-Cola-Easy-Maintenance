import { describe, expect, it } from "vitest";

import { canonicalizeRowKeys, normalizeHeader } from "./headers";

describe("import headers", () => {
  it("ignores accents, case, punctuation and repeated spaces", () => {
    expect(normalizeHeader(" Descrição   do Material ")).toBe("descricao do material");
    expect(normalizeHeader("Pros. Efi. Perdid.")).toBe(normalizeHeader("PROS EFI PERDID"));
  });

  it("maps header variants to the canonical key", () => {
    const [row] = canonicalizeRowKeys(
      [{ "MINUTOS DE PARADAS ": 15, "Observacoes": "x", Extra: 1 }],
      ["Minutos de paradas", "Observações"],
    );
    expect(row).toEqual({ "Minutos de paradas": 15, "Observações": "x", Extra: 1 });
  });

  it("keeps the first filled value when two columns collapse to the same header", () => {
    const [row] = canonicalizeRowKeys(
      [{ Turno: null, TURNO: "A" }],
      ["Turno"],
    );
    expect(row).toEqual({ Turno: "A" });
  });
});
