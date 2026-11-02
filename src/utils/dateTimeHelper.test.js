import { formatGuatemalaDateTime, formatPosSaleDateTime } from "./dateTimeHelper";

describe("formatGuatemalaDateTime", () => {
  test("Z timestamp converts the instant to America/Guatemala", () => {
    expect(formatGuatemalaDateTime("2026-11-02T03:30:00Z")).toBe("01/11/2026 21:30");
  });

  test("naive LocalDateTime is Guatemala wall-clock as-is", () => {
    expect(formatGuatemalaDateTime("2026-11-02T09:13:00")).toBe("02/11/2026 09:13");
  });

  test("offset string converts the instant to America/Guatemala", () => {
    expect(formatGuatemalaDateTime("2026-11-02T15:13:00+00:00")).toBe("02/11/2026 09:13");
    expect(formatGuatemalaDateTime("2026-11-02T09:13:00-06:00")).toBe("02/11/2026 09:13");
  });

  test("null/empty returns a safe fallback", () => {
    expect(formatGuatemalaDateTime(null)).toBe("-");
    expect(formatGuatemalaDateTime(undefined)).toBe("-");
    expect(formatGuatemalaDateTime("")).toBe("-");
    expect(formatGuatemalaDateTime("   ")).toBe("-");
  });

  test("date-only does not invent a time", () => {
    expect(formatGuatemalaDateTime("2026-11-02")).toBe("02/11/2026");
  });

  test("result does not depend on process timezone", () => {
    // This file is run with TZ=Asia/Tokyo. new Date(naive) would shift 09:13
    // to Guatemala 13:13 (01/11/2026 19:13 UTC). Wall-clock must stay 09:13.
    expect(process.env.TZ || "").toMatch(/Asia\/Tokyo/i);
    expect(formatGuatemalaDateTime("2026-11-02T09:13:00")).toBe("02/11/2026 09:13");
    expect(formatGuatemalaDateTime("2026-11-02T03:30:00Z")).toBe("01/11/2026 21:30");
  });
});

describe("formatPosSaleDateTime", () => {
  test("prefers soldAt over createdAt and saleDate", () => {
    expect(
      formatPosSaleDateTime({
        soldAt: "2026-11-02T09:13:00",
        createdAt: "2026-11-02T08:00:00",
        saleDate: "2026-11-02",
      })
    ).toBe("02/11/2026 09:13");
  });

  test("falls back to header createdAt when soldAt is missing", () => {
    expect(
      formatPosSaleDateTime({
        createdAt: "2026-11-02T08:00:00",
        saleDate: "2026-11-02",
      })
    ).toBe("02/11/2026 08:00");
  });

  test("saleDate-only shows the date without a time", () => {
    expect(formatPosSaleDateTime({ saleDate: "2026-11-02" })).toBe("02/11/2026");
  });
});
