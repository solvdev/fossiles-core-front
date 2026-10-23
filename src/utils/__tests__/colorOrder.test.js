import { colorRank, compareColorNames } from "../colorOrder";

describe("orden de colores en las hojas", () => {
  test("Negro, Café, Tostado y Whisky primero; luego los demás alfabéticos", () => {
    const colors = ["Rojo", "Whisky", "Azul", "TOSTADO", "café", "Negro", "Coñac"];
    expect([...colors].sort(compareColorNames)).toEqual(["Negro", "café", "TOSTADO", "Whisky", "Azul", "Coñac", "Rojo"]);
  });

  test("las variantes van con su color base, después del color exacto", () => {
    const colors = ["Café medio acabado", "Rojo acabado flores", "Café", "Negro mate", "Negro"];
    expect([...colors].sort(compareColorNames))
      .toEqual(["Negro", "Negro mate", "Café", "Café medio acabado", "Rojo acabado flores"]);
  });

  test("sin tildes ni mayúsculas, y Whiskey cuenta como Whisky", () => {
    expect(colorRank("CAFÉ")).toBe(1);
    expect(colorRank("whiskey")).toBe(3);
    expect(colorRank("Miel")).toBe(4);
    expect(colorRank("")).toBe(4);
  });
});
