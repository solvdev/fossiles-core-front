import { createSupplierPayment, generateRentPayables, getPayables } from "services/supplierPaymentService";

jest.mock("services/authService", () => ({
  getAuthHeader: () => ({ Authorization: "Bearer test-token" }),
}));

const ok = (body) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
});

const fail = (status, body) => ({
  ok: false,
  status,
  json: () => Promise.resolve(body),
});

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(ok({ rows: [] }));
});

afterEach(() => {
  delete global.fetch;
});

test("getPayables manda scope como query y sin scope no lo agrega", async () => {
  await getPayables("SUPPLIERS");
  expect(global.fetch.mock.calls[0][0]).toMatch(/\/supplier-payments\/payables\?scope=SUPPLIERS$/);

  await getPayables("RENTS");
  expect(global.fetch.mock.calls[1][0]).toMatch(/\/supplier-payments\/payables\?scope=RENTS$/);

  await getPayables();
  expect(global.fetch.mock.calls[2][0]).toMatch(/\/supplier-payments\/payables$/);
  expect(global.fetch.mock.calls[2][0]).not.toContain("scope=");
});

test("createSupplierPayment 400 sube el message del backend", async () => {
  global.fetch.mockResolvedValueOnce(
    fail(400, { message: "Un pago no puede combinar rentas con pagos a proveedores." })
  );
  await expect(createSupplierPayment({ allocations: [] })).rejects.toThrow(
    "Un pago no puede combinar rentas con pagos a proveedores."
  );
});

test("createSupplierPayment no-400 sube el message o el fallback", async () => {
  global.fetch.mockResolvedValueOnce(fail(500, { message: "La base de datos no responde." }));
  await expect(createSupplierPayment({ allocations: [] })).rejects.toThrow("La base de datos no responde.");

  global.fetch.mockResolvedValueOnce(fail(503, {}));
  await expect(createSupplierPayment({ allocations: [] })).rejects.toThrow("No se pudo registrar el pago.");
});

test("generateRentPayables POST manda exactamente { month }", async () => {
  global.fetch.mockResolvedValueOnce(ok({ created: 1, createdTotal: 2500, alreadyExisting: 0, skipped: [] }));
  await generateRentPayables("2026-11");
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/payable-documents\/generate-rents$/);
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toEqual({ month: "2026-11" });
});
