import { getKioskSalesByCategory } from "../kioskSalesByCategoryService";

jest.mock("services/authService", () => ({
  getAuthHeader: () => ({ Authorization: "Bearer test-token" }),
}));

const ok = (body) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
});

const lastRequest = () => {
  const [url, options] = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  const parsed = new URL(url, "http://localhost");
  return { url, path: parsed.pathname, params: Object.fromEntries(parsed.searchParams.entries()), options };
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(ok({ rows: [], totals: {} }));
});

afterEach(() => {
  delete global.fetch;
});

test("kioskIds vacío no se manda ni como kioskIds=", async () => {
  await getKioskSalesByCategory({ from: "2026-02-01", to: "2026-02-28", kioskIds: "" });
  expect(lastRequest().url).not.toMatch(/kioskIds=/);
  expect(lastRequest().params).not.toHaveProperty("kioskIds");
  expect(lastRequest().options.method).toBe("GET");

  await getKioskSalesByCategory({ from: "2026-02-01", to: "2026-02-28", kioskIds: [] });
  expect(lastRequest().url).not.toMatch(/kioskIds=/);

  await getKioskSalesByCategory({ from: "2026-02-01", to: "2026-02-28", kioskIds: "   " });
  expect(lastRequest().url).not.toMatch(/kioskIds=/);
});

test("un 403 sin cuerpo JSON igual entrega el mensaje de acceso en español", async () => {
  global.fetch.mockResolvedValue({
    ok: false,
    status: 403,
    json: () => Promise.reject(new Error("no json")),
  });
  await expect(getKioskSalesByCategory({ from: "2026-02-01", to: "2026-02-28" })).rejects.toThrow(
    "No tienes acceso a este reporte."
  );
});
