import { describe, expect, it } from "vitest";

import { publicErrorMessage } from "./errors";

describe("publicErrorMessage", () => {
  it("keeps messages the application wrote for the user", () => {
    expect(publicErrorMessage(new Error("A unidade BAAK não foi encontrada."), "x")).toBe("A unidade BAAK não foi encontrada.");
  });

  it("hides database and runtime errors", () => {
    const mysql = Object.assign(new Error("Unknown column 'foo' in 'field list'"), { code: "ER_BAD_FIELD_ERROR", errno: 1054 });
    expect(publicErrorMessage(mysql, "Falhou.")).toBe("Falhou.");
    expect(publicErrorMessage(new TypeError("Cannot read properties of undefined"), "Falhou.")).toBe("Falhou.");
    expect(publicErrorMessage("texto", "Falhou.")).toBe("Falhou.");
  });
});
