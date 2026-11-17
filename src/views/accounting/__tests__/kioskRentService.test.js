import {
  createOtherRent,
  deactivateOtherRent,
  getKioskRents,
  saveKioskRent,
  saveOtherRent,
} from "services/kioskRentService";

jest.mock("services/authService", () => ({
  getAuthHeader: () => ({ Authorization: "Bearer test-token" }),
}));

const ok = (body, status = 200) => ({
  ok: true,
  status,
  json: () => Promise.resolve(body),
});

const fail = (status, body) => ({
  ok: false,
  status,
  json: () => Promise.resolve(body),
});

const lastCall = () => {
  const [url, options] = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  return { url, options, body: options.body ? JSON.parse(options.body) : null };
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(ok({ rows: [] }));
});

afterEach(() => {
  delete global.fetch;
});

test("GET /kiosk-rents no manda rentType: el filtro es en el cliente", async () => {
  await getKioskRents();
  expect(lastCall().url).toMatch(/\/kiosk-rents$/);
  expect(lastCall().url).not.toContain("rentType");
});

test("PUT de kiosco sigue yendo a /kiosk-rents/{locationId} con el body de contrato", async () => {
  const body = {
    landlordName: "Ana",
    paymentDay: 10,
    contractStart: "2026-01-01",
    contractEnd: "2026-12-31",
    note: null,
  };
  await saveKioskRent(4, body);
  const req = lastCall();
  expect(req.options.method).toBe("PUT");
  expect(req.url).toMatch(/\/kiosk-rents\/4$/);
  expect(req.body).toEqual(body);
});

test("crear / actualizar / desactivar otra renta usa /kiosk-rents/others", async () => {
  const body = {
    name: "Oficina central",
    description: null,
    category: "OFICINA",
    landlordName: "Ana",
    monthlyAmount: 1500,
    paymentDay: 5,
    contractStart: "2026-01-01",
    contractEnd: "2026-12-31",
    note: null,
  };

  await createOtherRent(body);
  let req = lastCall();
  expect(req.options.method).toBe("POST");
  expect(req.url).toMatch(/\/kiosk-rents\/others$/);
  expect(req.body).toEqual(body);
  expect(req.options.headers.Authorization).toBe("Bearer test-token");

  await saveOtherRent(12, body);
  req = lastCall();
  expect(req.options.method).toBe("PUT");
  expect(req.url).toMatch(/\/kiosk-rents\/others\/12$/);
  expect(req.body).toEqual(body);

  await deactivateOtherRent(12);
  req = lastCall();
  expect(req.options.method).toBe("DELETE");
  expect(req.url).toMatch(/\/kiosk-rents\/others\/12$/);
});

test("POST 201 y PUT 200 devuelven la fila; DELETE 204 no tiene cuerpo", async () => {
  const row = { rentId: 12, rentType: "OTHER", name: "Oficina central", monthlyRent: 1500 };
  global.fetch.mockResolvedValueOnce(ok(row, 201));
  await expect(createOtherRent({ name: "Oficina central" })).resolves.toEqual(row);

  global.fetch.mockResolvedValueOnce(ok(row, 200));
  await expect(saveOtherRent(12, { name: "Oficina central" })).resolves.toEqual(row);

  global.fetch.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.reject(new Error("no body")) });
  await expect(deactivateOtherRent(12)).resolves.toBeNull();
});

test("409 duplicado y 400 de validación suben el message en español", async () => {
  global.fetch.mockResolvedValueOnce(
    fail(409, { status: 409, error: "Conflict", message: "Ya existe una renta activa con esa categoría y nombre." })
  );
  await expect(createOtherRent({ name: "Oficina", category: "OFICINA" })).rejects.toThrow(
    "Ya existe una renta activa con esa categoría y nombre."
  );

  global.fetch.mockResolvedValueOnce(
    fail(400, { status: 400, error: "Bad Request", message: "El día de pago debe estar entre 1 y 31." })
  );
  await expect(saveOtherRent(12, { name: "Oficina", paymentDay: 40 })).rejects.toThrow(
    "El día de pago debe estar entre 1 y 31."
  );
});
