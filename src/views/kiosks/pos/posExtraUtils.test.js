import {
  applyExtraStatuses,
  extraCheckoutBlockReason,
  lineTotalWithExtra,
  mergeExtraBack,
  parseHeldCart,
  serializeHeldCart,
  siblingQty,
  splitLineForExtra,
} from "./posExtraUtils";

const base = { key: "1:none:NUEVO", productId: 1, quantity: 3, unitPrice: 250, availableQty: 5 };
const request = { id: 9, requestNumber: "CEX-00009", status: "PENDING", description: "Grabado", extraAmount: 15 };

describe("posExtraUtils", () => {
  it("separa solo las piezas con complemento y suma el extra por pieza", () => {
    const cart = splitLineForExtra([base], base.key, 2, request);
    expect(cart).toHaveLength(2);
    expect(cart[0].quantity).toBe(1);
    expect(cart[1]).toMatchObject({ key: "1:none:NUEVO|cx9", baseKey: base.key, quantity: 2 });
    expect(lineTotalWithExtra(cart[0])).toBe(250);
    expect(lineTotalWithExtra(cart[1])).toBe(2 * 265);
    expect(siblingQty(cart, cart[0])).toBe(2);
  });

  it("convierte la línea completa cuando todas las piezas llevan complemento", () => {
    const cart = splitLineForExtra([base], base.key, 3, request);
    expect(cart).toHaveLength(1);
    expect(cart[0].extraRequest.id).toBe(9);
  });

  it("bloquea el cobro mientras haya complementos pendientes o rechazados", () => {
    let cart = splitLineForExtra([base], base.key, 2, request);
    expect(extraCheckoutBlockReason(cart)).toMatch(/pendiente/);
    cart = applyExtraStatuses(cart, { 9: { id: 9, status: "APPROVED" } });
    expect(extraCheckoutBlockReason(cart)).toBeNull();
    cart = applyExtraStatuses(cart, { 9: { id: 9, status: "REJECTED", rejectionReason: "no" } });
    expect(extraCheckoutBlockReason(cart)).toMatch(/rechazados/);
  });

  it("devuelve las piezas a la línea normal al quitar el complemento", () => {
    const cart = splitLineForExtra([base], base.key, 2, request);
    const merged = mergeExtraBack(cart, cart[1].key);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
    expect(merged[0].extraRequest).toBeUndefined();

    const whole = splitLineForExtra([base], base.key, 3, request);
    const restored = mergeExtraBack(whole, whole[0].key);
    expect(restored[0]).toMatchObject({ key: base.key, quantity: 3 });
    expect(restored[0].extraRequest).toBeUndefined();
  });

  it("serializa y restaura el carrito en espera", () => {
    const whole = splitLineForExtra([base], base.key, 3, request);
    const parsed = parseHeldCart(serializeHeldCart({ cart: whole, notes: "n" }));
    expect(parsed.cart).toHaveLength(1);
    expect(parsed.notes).toBe("n");
    expect(parseHeldCart("no es json").cart).toEqual([]);
  });
});
