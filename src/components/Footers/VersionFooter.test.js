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
