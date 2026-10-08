/**
 * Consultas del dashboard de ventas: qué parámetros viajan a /api/sales/dashboard/* (fetch simulado).
 * Kioskos filtra por `siteId` (sitio de Finanzas kioscos), ya no por `kioskLocationId`.
 */
import {
  getSalesConsolidated,
  getSalesKiosks,
  getSalesOnline,
  getSalesVendor,
  getUnifiedSales,
} from "services/salesDashboardService";

jest.mock("services/authService", () => ({
  getAuthHeader: () => ({ Authorization: "Bearer test-token" }),
}));

const okResponse = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

/** URL y opciones de la última llamada a fetch. */
const lastRequest = () => {
  const [url, options] = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  const parsed = new URL(url, "http://localhost");
  return { url, path: parsed.pathname, params: Object.fromEntries(parsed.searchParams.entries()), options };
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(okResponse({ ok: true }));
});

afterEach(() => {
  delete global.fetch;
});

describe("getSalesKiosks", () => {
  test("envía siteId (no kioskLocationId) cuando se filtra por un kiosko", async () => {
    await getSalesKiosks({ startDate: "2026-09-01", endDate: "2026-09-30", siteId: "5" });
    const { path, params, options } = lastRequest();
    expect(path).toMatch(/\/sales\/dashboard\/kiosks$/);
    expect(params).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30", siteId: "5" });
    expect(params).not.toHaveProperty("kioskLocationId");
    expect(options.headers.Authorization).toBe("Bearer test-token");
  });

  test("sin kiosko elegido no manda siteId ni kioskLocationId", async () => {
    await getSalesKiosks({ startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(lastRequest().params).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    await getSalesKiosks({ startDate: "2026-09-01", endDate: "2026-09-30", siteId: "" });
    expect(lastRequest().params).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    await getSalesKiosks({ startDate: "2026-09-01", endDate: "2026-09-30", siteId: undefined });
    expect(lastRequest().params).not.toHaveProperty("siteId");
  });

  test("ya no reenvía un kioskLocationId (el filtro del dashboard es por sitio)", async () => {
    await getSalesKiosks({ startDate: "2026-09-01", endDate: "2026-09-30", kioskLocationId: "12" });
    expect(lastRequest().params).not.toHaveProperty("kioskLocationId");
    expect(lastRequest().params).not.toHaveProperty("siteId");
  });

  test("refresh viaja como refresh=true solo cuando se pide", async () => {
    await getSalesKiosks({ startDate: "2026-09-01", endDate: "2026-09-30", siteId: "5", refresh: true });
    expect(lastRequest().params).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30", siteId: "5", refresh: "true" });
    await getSalesKiosks({ startDate: "2026-09-01", endDate: "2026-09-30", siteId: "5", refresh: false });
    expect(lastRequest().params).not.toHaveProperty("refresh");
  });

  test("pasa la señal de cancelación y devuelve el JSON", async () => {
    global.fetch.mockResolvedValue(okResponse({ channel: "KIOSKO" }));
    const controller = new AbortController();
    const data = await getSalesKiosks({ startDate: "2026-09-01", endDate: "2026-09-30", signal: controller.signal });
    expect(data).toEqual({ channel: "KIOSKO" });
    expect(lastRequest().options.signal).toBe(controller.signal);
  });

  test("un error del backend sube con su mensaje (p. ej. kiosko no incluido en los reportes)", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: "El kiosko seleccionado no existe o no está incluido en los reportes." }),
    });
    await expect(getSalesKiosks({ startDate: "2026-09-01", endDate: "2026-09-30", siteId: "99" })).rejects.toThrow(
      "El kiosko seleccionado no existe o no está incluido en los reportes."
    );
    global.fetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error("no json")) });
    await expect(getSalesKiosks({ startDate: "2026-09-01", endDate: "2026-09-30" })).rejects.toThrow(
      "No se pudo cargar las ventas de kioskos."
    );
  });
});

describe("las demás fuentes", () => {
  test("consolidado, online y vendedor no mandan siteId aunque se les pase", async () => {
    const range = { startDate: "2026-09-01", endDate: "2026-09-30", siteId: "5", kioskLocationId: "12" };
    await getSalesConsolidated(range);
    expect(lastRequest().path).toMatch(/\/sales\/dashboard\/consolidated$/);
    expect(lastRequest().params).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    await getSalesOnline(range);
    expect(lastRequest().path).toMatch(/\/sales\/dashboard\/online$/);
    expect(lastRequest().params).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    await getSalesVendor({ ...range, refresh: true });
    expect(lastRequest().path).toMatch(/\/sales\/dashboard\/vendor$/);
    expect(lastRequest().params).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30", refresh: "true" });
  });
});

describe("ventas unificadas (Ventas totales)", () => {
  test("getUnifiedSales conserva kioskLocationId: esa pantalla filtra por ubicación del POS", async () => {
    await getUnifiedSales({ startDate: "2026-09-01", endDate: "2026-09-30", channel: "kiosko", kioskLocationId: "12", limit: 50 });
    const { path, params } = lastRequest();
    expect(path).toMatch(/\/sales\/unified$/);
    expect(params).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30", channel: "kiosko", kioskLocationId: "12", limit: "50" });
  });
});
