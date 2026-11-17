import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import VersionFooter from "./VersionFooter";
import { resetVersionCache } from "services/versionService";

const originalFetch = global.fetch;

beforeEach(() => {
  resetVersionCache();
  process.env.REACT_APP_VERSION = "1.2.3";
  process.env.REACT_APP_COMMIT = "abc1234";
  global.fetch = jest.fn();
});

afterEach(() => {
  cleanup();
  resetVersionCache();
  global.fetch = originalFetch;
  delete process.env.REACT_APP_VERSION;
  delete process.env.REACT_APP_COMMIT;
});

test("muestra front y back cuando GET /api/public/version responde", async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      version: "1.0.7",
      commit: "a1b2c3d",
      buildTime: "2026-11-17T19:16:00Z",
    }),
  });

  render(<VersionFooter />);

  expect(await screen.findByText("Fossiles ERP · Front v1.2.3 · Back v1.0.7")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/public\/version$/),
    expect.objectContaining({ method: "GET" })
  );
  expect(screen.getByTitle(/Front abc1234/)).toHaveAttribute(
    "title",
    expect.stringContaining("Back a1b2c3d · 2026-11-17T19:16:00Z")
  );
});

test("si el back falla, deja solo el front y no muestra Back", async () => {
  global.fetch.mockRejectedValue(new Error("network down"));

  render(<VersionFooter />);

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(await screen.findByText("Fossiles ERP · Front v1.2.3")).toBeInTheDocument();
  expect(screen.queryByText(/Back/)).not.toBeInTheDocument();
});

test("si la versión es dev, se muestra sin prefijo v", async () => {
  process.env.REACT_APP_VERSION = "";
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ version: "dev", commit: "unknown", buildTime: "2026-11-17T19:16:00Z" }),
  });

  render(<VersionFooter />);

  expect(await screen.findByText("Fossiles ERP · Front dev · Back dev")).toBeInTheDocument();
});

function mockBackOk(body) {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

async function expectFrontOnly() {
  expect(await screen.findByText("Fossiles ERP · Front v1.2.3")).toBeInTheDocument();
  expect(screen.queryByText(/Back/)).not.toBeInTheDocument();
}

test("llama GET /api/public/version exactamente una vez por sesión al remount", async () => {
  mockBackOk({ version: "1.0.7", commit: "a1b2c3d", buildTime: "2026-11-17T19:16:00Z" });

  const { unmount } = render(<VersionFooter />);
  expect(await screen.findByText("Fossiles ERP · Front v1.2.3 · Back v1.0.7")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);

  unmount();
  render(<VersionFooter />);
  expect(await screen.findByText("Fossiles ERP · Front v1.2.3 · Back v1.0.7")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test("la URL del back es exactamente /api/public/version", async () => {
  mockBackOk({ version: "1.0.7", commit: "a1b2c3d", buildTime: "2026-11-17T19:16:00Z" });

  render(<VersionFooter />);
  expect(await screen.findByText("Fossiles ERP · Front v1.2.3 · Back v1.0.7")).toBeInTheDocument();

  const requested = global.fetch.mock.calls[0][0];
  const url = new URL(requested, "http://localhost");
  expect(url.pathname).toBe("/api/public/version");
});

test("timeout o abort muestra solo el Front", async () => {
  const abortError = new Error("Aborted");
  abortError.name = "AbortError";
  global.fetch.mockRejectedValue(abortError);

  render(<VersionFooter />);

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  await expectFrontOnly();
});

test("non-200 muestra solo el Front", async () => {
  global.fetch.mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({ version: "9.9.9" }),
  });

  render(<VersionFooter />);

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  await expectFrontOnly();
});

test("JSON inválido muestra solo el Front", async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => {
      throw new SyntaxError("Unexpected token");
    },
  });

  render(<VersionFooter />);

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  await expectFrontOnly();
});

test("sin campo version muestra solo el Front", async () => {
  mockBackOk({ commit: "a1b2c3d", buildTime: "2026-11-17T19:16:00Z" });

  render(<VersionFooter />);

  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  await expectFrontOnly();
});

test("una versión rc se muestra como v1.312.1-rc.1", async () => {
  process.env.REACT_APP_VERSION = "1.312.1-rc.1";
  mockBackOk({ version: "1.312.1-rc.1", commit: "a1b2c3d", buildTime: "2026-11-17T19:16:00Z" });

  render(<VersionFooter />);

  expect(await screen.findByText("Fossiles ERP · Front v1.312.1-rc.1 · Back v1.312.1-rc.1")).toBeInTheDocument();
});

test("REACT_APP_VERSION ausente se muestra como Front dev sin lanzar", async () => {
  delete process.env.REACT_APP_VERSION;
  mockBackOk({ version: "1.0.7", commit: "a1b2c3d", buildTime: "2026-11-17T19:16:00Z" });

  expect(() => render(<VersionFooter />)).not.toThrow();
  expect(await screen.findByText("Fossiles ERP · Front dev · Back v1.0.7")).toBeInTheDocument();
});

test("un fallo del back no lanza ni escribe en consola", async () => {
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  global.fetch.mockRejectedValue(new Error("network down"));

  expect(() => render(<VersionFooter />)).not.toThrow();
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  await expectFrontOnly();
  expect(errorSpy).not.toHaveBeenCalled();
  expect(warnSpy).not.toHaveBeenCalled();

  errorSpy.mockRestore();
  warnSpy.mockRestore();
});
