import {
  isLuisFelipeOpcOrder,
  isLuisFelipeSeller,
  isLuisFelipeVendorFlow,
  orderAllowsKioskDestination,
} from "../luisFelipeVendorHelper";

describe("luisFelipeVendorHelper", () => {
  test("isLuisFelipeSeller ignora mayúsculas, espacios y tildes", () => {
    expect(isLuisFelipeSeller("LUIS FELIPE")).toBe(true);
    expect(isLuisFelipeSeller("  luis felipe ")).toBe(true);
    expect(isLuisFelipeSeller("Luis Felipe Pérez")).toBe(true);
    expect(isLuisFelipeSeller("MADELYN")).toBe(false);
    expect(isLuisFelipeSeller("")).toBe(false);
    expect(isLuisFelipeSeller(null)).toBe(false);
  });

  test("isLuisFelipeVendorFlow depende solo del vendedor", () => {
    expect(isLuisFelipeVendorFlow("NORMAL", "LUIS FELIPE")).toBe(true);
    expect(isLuisFelipeVendorFlow("CINCHOS_FOSSILES", "MADELYN")).toBe(false);
  });

  test("isLuisFelipeOpcOrder: solo cinchos con vendedor Luis Felipe", () => {
    expect(isLuisFelipeOpcOrder("CINCHOS_FOSSILES", "LUIS FELIPE")).toBe(true);
    expect(isLuisFelipeOpcOrder("CINCHOS", "luis felipe")).toBe(true);
    expect(isLuisFelipeOpcOrder("CINCHOS_MARCAS", "LUIS FELIPE")).toBe(true);
    expect(isLuisFelipeOpcOrder("CINCHOS_FOSSILES", "MADELYN")).toBe(false);
    expect(isLuisFelipeOpcOrder("CINCHOS_FOSSILES", "")).toBe(false);
    expect(isLuisFelipeOpcOrder("NORMAL", "LUIS FELIPE")).toBe(false);
    expect(isLuisFelipeOpcOrder("MARCAS", "LUIS FELIPE")).toBe(false);
  });

  test("orderAllowsKioskDestination: las OPC de Luis Felipe no pueden ir a kiosco", () => {
    // OPC de otros vendedores (o sin vendedor): sí pueden ir a kiosco.
    expect(orderAllowsKioskDestination("CINCHOS_FOSSILES", "")).toBe(true);
    expect(orderAllowsKioskDestination("CINCHOS_FOSSILES", "MADELYN")).toBe(true);
    // OPC de Luis Felipe: no.
    expect(orderAllowsKioskDestination("CINCHOS_FOSSILES", "LUIS FELIPE")).toBe(false);
    expect(orderAllowsKioskDestination("CINCHOS", "Luis Felipe")).toBe(false);
    // OP normal (OPK): sin cambios, con o sin vendedor.
    expect(orderAllowsKioskDestination("NORMAL", "")).toBe(true);
    expect(orderAllowsKioskDestination("normal", "LUIS FELIPE")).toBe(true);
    // Otros tipos nunca llevan el indicador de kiosco.
    expect(orderAllowsKioskDestination("MARCAS", "")).toBe(false);
    expect(orderAllowsKioskDestination("INTERNA", "")).toBe(false);
    expect(orderAllowsKioskDestination("CLIENTE_KIOSKO", "")).toBe(false);
    expect(orderAllowsKioskDestination(undefined, undefined)).toBe(false);
  });
});
