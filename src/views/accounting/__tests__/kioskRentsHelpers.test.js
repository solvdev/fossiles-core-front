import {
  buildOtherRentPayload,
  importChangeKey,
  importRowCaption,
  isOtherRent,
  matchesTypeFilter,
  monthlyAmountOf,
  otherFormFromRow,
  rentTypeOf,
  rowKey,
  typeBadgeLabel,
  validateOtherRentForm,
} from "../kioskRentsHelpers";

const validForm = {
  name: " Oficina central ",
  category: "OFICINA",
  description: " piso 2 ",
  landlordName: " Inmobiliaria ",
  monthlyAmount: "1500.50",
  paymentDay: "15",
  contractStart: "2026-01-01",
  contractEnd: "2026-12-31",
  note: "  ",
};

test("validateOtherRentForm exige nombre, monto, día 1-31 y fechas coherentes", () => {
  expect(validateOtherRentForm({ ...validForm, name: "  " })).toBe("Indique el nombre de la renta.");
  expect(validateOtherRentForm({ ...validForm, category: "KIOSK" })).toBe("Indique el tipo de renta.");
  expect(validateOtherRentForm({ ...validForm, monthlyAmount: "" })).toBe("Indique el monto mensual.");
  expect(validateOtherRentForm({ ...validForm, monthlyAmount: "-1" })).toBe("Indique el monto mensual.");
  expect(validateOtherRentForm({ ...validForm, paymentDay: "0" })).toBe("El día de pago debe estar entre 1 y 31.");
  expect(validateOtherRentForm({ ...validForm, paymentDay: "32" })).toBe("El día de pago debe estar entre 1 y 31.");
  expect(validateOtherRentForm({ ...validForm, paymentDay: "15.5" })).toBe("El día de pago debe estar entre 1 y 31.");
  expect(validateOtherRentForm({ ...validForm, contractStart: "" })).toBe("Indique desde cuándo y hasta cuándo dura el contrato.");
  expect(validateOtherRentForm({ ...validForm, contractEnd: "2025-12-01" })).toBe(
    "«Contrato hasta» no puede ser anterior a «Contrato desde»."
  );
  expect(validateOtherRentForm(validForm)).toBeNull();
});

test("buildOtherRentPayload recorta textos y manda null en opcionales vacíos", () => {
  expect(buildOtherRentPayload(validForm)).toEqual({
    name: "Oficina central",
    description: "piso 2",
    category: "OFICINA",
    landlordName: "Inmobiliaria",
    monthlyAmount: 1500.5,
    paymentDay: 15,
    contractStart: "2026-01-01",
    contractEnd: "2026-12-31",
    note: null,
  });
});

test("una fila sin rentType se trata como kiosco", () => {
  const kiosk = { locationId: 4, name: "Centro", code: "K4" };
  const other = { rentType: "OTHER", rentId: 9, name: "Bodega zona 4", category: "BODEGA" };
  expect(rentTypeOf(kiosk)).toBe("KIOSK");
  expect(isOtherRent(kiosk)).toBe(false);
  expect(isOtherRent(other)).toBe(true);
  expect(rowKey(kiosk)).toBe("kiosk-4");
  expect(rowKey(other)).toBe("other-9");
  expect(typeBadgeLabel(kiosk)).toBe("Kiosco");
  expect(typeBadgeLabel(other)).toBe("Bodega");
  expect(matchesTypeFilter(kiosk, "ALL")).toBe(true);
  expect(matchesTypeFilter(kiosk, "KIOSK")).toBe(true);
  expect(matchesTypeFilter(kiosk, "OTHER")).toBe(false);
  expect(matchesTypeFilter(other, "OTHER")).toBe(true);
});

test("monthlyAmountOf prefiere monthlyRent y otherFormFromRow rellena el modal", () => {
  expect(monthlyAmountOf({ monthlyRent: 800, monthlyAmount: 1 })).toBe(800);
  expect(monthlyAmountOf({ monthlyAmount: 1200 })).toBe(1200);
  const form = otherFormFromRow({
    name: "Oficina",
    category: "OFICINA",
    description: "X",
    landlordName: "Ana",
    monthlyAmount: 900,
    paymentDay: 5,
    contractStart: "2026-02-01",
    contractEnd: "2027-02-01",
    note: "n",
  });
  expect(form.monthlyAmount).toBe(900);
  expect(form.category).toBe("OFICINA");
});

test("el import muestra tipo e ID cuando el back los manda", () => {
  expect(importRowCaption({ row: 4, name: "Oficina", rentType: "OTHER", rentId: 12 })).toBe(
    "Fila 4 · Oficina · Otra · ID 12"
  );
  expect(importRowCaption({ row: 2, name: "Centro", rentType: "KIOSK" })).toBe("Fila 2 · Centro · Kiosco");
  expect(importChangeKey({ locationId: 3 }, 0)).toBe("kiosk-3");
  expect(importChangeKey({ rentId: 8 }, 1)).toBe("other-8");
});
