import {
  buildAccountEntryPayload,
  createClientRequestId,
  createCustomerAccountEntry,
  endSingleFlight,
  tryBeginSingleFlight,
  voidCustomerAccountEntry,
} from "services/customerAccountService";

jest.mock("services/authService", () => ({
  getAuthHeader: () => ({ Authorization: "Bearer test-token" }),
}));

const screenForm = (overrides = {}) => ({
  entryDate: "2026-10-09",
  collectionDate: "2026-10-09",
  amount: "25.5",
  reference: "",
  description: "desde la pantalla",
  paymentMethod: "EFECTIVO",
  receiptNumber: "RC-1",
  productionOrderId: "77",
  orderKind: "OPC",
  partialReleaseId: "3",
  productShipmentId: "8",
  vendorShipmentNumber: "ENVP-PANTALLA",
  appliedToEntryId: "50",
  ...overrides,
});

const selectedCharge = {
  id: 50,
  entryType: "CHARGE",
  status: "ACTIVE",
  productionOrderId: 10,
  orderKind: "OPV",
  productionOrderCode: "OP-100",
  invoiceNumber: "ENVP-100",
};

describe("buildAccountEntryPayload", () => {
  test.each(["PAYMENT", "CREDIT_NOTE", "RETURN"])(
    "%s copia orden y tipo del cargo elegido, no de la pantalla",
    (entryType) => {
      const payload = buildAccountEntryPayload({
        entryType,
        conceptCode: entryType === "RETURN" ? "RETURN" : entryType === "CREDIT_NOTE" ? "2" : "4",
        form: screenForm(),
        charge: selectedCharge,
      });

      expect(payload.appliedToEntryId).toBe(50);
      expect(payload.productionOrderId).toBe(10);
      expect(payload.orderKind).toBe("OPV");
      expect(payload).not.toHaveProperty("partialReleaseId");
      expect(payload).not.toHaveProperty("productShipmentId");
      expect(payload).not.toHaveProperty("vendorShipmentNumber");
    }
  );

  test("el alta de cargo usa el monto cotizado y no manda el parcial", () => {
    const payload = buildAccountEntryPayload({
      entryType: "CHARGE",
      conceptCode: "1",
      form: screenForm({ appliedToEntryId: "", amount: "1500.00" }),
      charge: selectedCharge,
    });

    expect(payload.amount).toBe(1500);
    expect(payload.productionOrderId).toBe(77);
    expect(payload.vendorShipmentNumber).toBe("ENVP-PANTALLA");
    expect(payload).not.toHaveProperty("partialReleaseId");
    expect(payload).not.toHaveProperty("productShipmentId");
    expect(payload).not.toHaveProperty("orderKind");
    expect(payload).not.toHaveProperty("appliedToEntryId");
  });
});

describe("solicitud en curso", () => {
  test("la segunda entrada mientras hay una petición no dispara otra", async () => {
    const gate = { current: false };
    const calls = [];
    let release;
    const run = async () => {
      const requestId = tryBeginSingleFlight(gate);
      if (!requestId) return;
      calls.push(requestId);
      try {
        await new Promise((resolve) => {
          release = resolve;
        });
      } finally {
        endSingleFlight(gate);
      }
    };

    const first = run();
    const second = run();
    expect(calls).toHaveLength(1);
    expect(tryBeginSingleFlight(gate)).toBeNull();
    release();
    await first;
    await second;
    expect(tryBeginSingleFlight(gate)).toEqual(expect.any(String));
    endSingleFlight(gate);
  });

  test("createClientRequestId arma un id si el navegador no tiene randomUUID", () => {
    const previous = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    try {
      const id = createClientRequestId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        writable: true,
        value: previous,
      });
    }
  });
});

describe("X-Request-Id", () => {
  const ok = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue(ok({ id: 1 }));
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("el alta envía un id por acción y no lo manda si no hay", async () => {
    await createCustomerAccountEntry(223, { entryType: "CHARGE" }, { requestId: "req-1" });
    expect(global.fetch.mock.calls[0][1].headers["X-Request-Id"]).toBe("req-1");

    await createCustomerAccountEntry(223, { entryType: "CHARGE" });
    expect(global.fetch.mock.calls[1][1].headers).not.toHaveProperty("X-Request-Id");
  });

  test("la anulación envía el id de esa acción", async () => {
    await voidCustomerAccountEntry(8, "duplicado", { requestId: "req-void" });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe("PUT");
    expect(options.headers["X-Request-Id"]).toBe("req-void");
    expect(JSON.parse(options.body)).toEqual({ voidReason: "duplicado" });
  });

  test("la anulación incluye reassignToChargeId solo cuando hay destino", async () => {
    await voidCustomerAccountEntry(8, "error de captura", { requestId: "req-move", reassignToChargeId: "15" });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      voidReason: "error de captura",
      reassignToChargeId: 15,
    });
  });
});
