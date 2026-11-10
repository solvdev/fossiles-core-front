import {
  NEXT_ACTION,
  canApproveInternalShipment,
  canAuthorizeProduction,
  resolveNextAction,
} from "./standaloneInternalShipmentHelper";

describe("resolveNextAction", () => {
  it("usa la acción que calcula el backend según stock", () => {
    const base = { status: "PENDIENTE", requestType: "PLANILLA" };
    expect(resolveNextAction({ ...base, nextAction: "AUTORIZAR_ENVIO" })).toBe(NEXT_ACTION.SHIP);
    expect(resolveNextAction({ ...base, nextAction: "AUTORIZAR_PRODUCCION" })).toBe(NEXT_ACTION.PRODUCE);
    expect(resolveNextAction({ ...base, nextAction: "ESPERAR_PRODUCCION" })).toBe(NEXT_ACTION.WAIT);
  });

  it("solo autoriza envío cuando hay stock", () => {
    const withStock = { status: "PENDIENTE", nextAction: "AUTORIZAR_ENVIO" };
    const noStock = { status: "PENDIENTE", nextAction: "AUTORIZAR_PRODUCCION" };
    expect(canApproveInternalShipment(withStock)).toBe(true);
    expect(canAuthorizeProduction(withStock)).toBe(false);
    expect(canApproveInternalShipment(noStock)).toBe(false);
    expect(canAuthorizeProduction(noStock)).toBe(true);
  });

  it("sin nextAction cae a la OPI vinculada (borrador => autorizar producción)", () => {
    expect(
      resolveNextAction({
        status: "PENDIENTE",
        requestType: "OPI",
        productionOrderId: 3,
        productionOrderStatus: "DRAFT",
      })
    ).toBe(NEXT_ACTION.PRODUCE);
    expect(resolveNextAction({ status: "PENDIENTE", requestType: "DEFECTOS" })).toBe(NEXT_ACTION.SHIP);
  });

  it("no hay acción en solicitudes ya resueltas", () => {
    expect(resolveNextAction({ status: "APROBADA", nextAction: "AUTORIZAR_ENVIO" })).toBeNull();
    expect(resolveNextAction({ status: "RECHAZADA" })).toBeNull();
  });
});
