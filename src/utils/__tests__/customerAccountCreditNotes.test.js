import { creditNotesAmount, formatAccountMoney } from "services/customerAccountService";

describe("totalCreditNotes en el resumen", () => {
  test("si el API no manda el campo, se muestra como cero", () => {
    expect(creditNotesAmount(undefined)).toBe(0);
    expect(creditNotesAmount(null)).toBe(0);
    expect(formatAccountMoney(creditNotesAmount(undefined))).toBe("Q 0.00");
  });

  test("usa el monto del resumen con el mismo formato que el resto", () => {
    expect(creditNotesAmount(12.5)).toBe(12.5);
    expect(creditNotesAmount("12.5")).toBe(12.5);
    expect(formatAccountMoney(creditNotesAmount(12.5))).toBe("Q 12.50");
  });
});
