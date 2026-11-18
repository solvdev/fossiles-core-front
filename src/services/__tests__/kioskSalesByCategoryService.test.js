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

test("omite kioskIds cuando no hay kioscos elegidos", async () => {
  await getKioskSalesByCategory({ from: "2026-02-01", to: "2026-02-28" });
  expect(lastRequest().path).toMatch(/\/reports\/kiosk-sales-by-category$/);
  expect(lastRequest().params).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  expect(lastRequest().params).not.toHaveProperty("kioskIds");
});

test("envía kioskIds como lista separada por comas", async () => {
  await getKioskSalesByCategory({ from: "2026-11-01", to: "2026-11-30", kioskIds: "1,3" });
  expect(lastRequest().params).toEqual({ from: "2026-11-01", to: "2026-11-30", kioskIds: "1,3" });
  await getKioskSalesByCategory({ from: "2026-11-01", to: "2026-11-30", kioskIds: [1, 3] });
  expect(lastRequest().params.kioskIds).toBe("1,3");
});

test("un 400 sube con el message del backend", async () => {
  global.fetch.mockResolvedValue({
    ok: false,
    status: 400,
    json: () => Promise.resolve({ message: "La fecha inicial no puede ser posterior a la fecha final" }),
  });
  await expect(getKioskSalesByCategory({ from: "2026-11-30", to: "2026-11-01" })).rejects.toThrow(
    "La fecha inicial no puede ser posterior a la fecha final"
  );
});
