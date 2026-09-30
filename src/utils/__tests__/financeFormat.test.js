import {
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtDelta,
  fmtDeltaPct,
  growthTone,
  growthArrow,
  growthBadgeColor,
  fmtDateEs,
  daysInMonth,
  isoDate,
  MONTHS_ES,
  MONTHS_ES_SHORT,
  EMPTY_VALUE,
} from "utils/financeFormat";

describe("financeFormat", () => {
  it("fmtMoney en es-GT", () => {
    expect(fmtMoney(1234.5)).toBe("Q 1,234.50");
    expect(fmtMoney(1090923.3)).toBe("Q 1,090,923.30");
    expect(fmtMoney(0)).toBe("Q 0.00");
    expect(fmtMoney(-500)).toBe("-Q 500.00");
    expect(fmtMoney(-0.001)).toBe("Q 0.00");
    expect(fmtMoney(1500, { decimals: 0 })).toBe("Q 1,500");
    expect(fmtMoney(null)).toBe(EMPTY_VALUE);
    expect(fmtMoney(undefined)).toBe(EMPTY_VALUE);
    expect(fmtMoney("12.3")).toBe("Q 12.30");
  });

  it("fmtNumber", () => {
    expect(fmtNumber(1234567.891, 2)).toBe("1,234,567.89");
    expect(fmtNumber(999.995, 0)).toBe("1,000");
  });

  it("fmtPct desde decimal", () => {
    expect(fmtPct(0.18)).toBe("18.0%");
    expect(fmtPct(0.3101, 2)).toBe("31.01%");
    expect(fmtPct(null)).toBe(EMPTY_VALUE);
    expect(fmtPct(-0.05)).toBe("-5.0%");
  });

  it("fmtDelta con signo", () => {
    expect(fmtDelta(500)).toBe("+Q 500.00");
    expect(fmtDelta(-200.5)).toBe("-Q 200.50");
    expect(fmtDelta(0)).toBe("Q 0.00");
    expect(fmtDeltaPct(0.125)).toBe("+12.5%");
    expect(fmtDeltaPct(-0.1)).toBe("-10.0%");
    expect(fmtDeltaPct(0)).toBe("0.0%");
    expect(fmtDeltaPct(null)).toBe(EMPTY_VALUE);
  });

  it("growth helpers", () => {
    expect(growthTone(0.2)).toBe("up");
    expect(growthTone(-0.2)).toBe("down");
    expect(growthTone(0)).toBe("flat");
    expect(growthTone(null)).toBe("na");
    expect(growthArrow("up")).toBe("▲");
    expect(growthArrow("down")).toBe("▼");
    expect(growthBadgeColor("down")).toBe("danger");
  });

  it("fechas y meses", () => {
    expect(MONTHS_ES).toHaveLength(12);
    expect(MONTHS_ES_SHORT[0]).toBe("Ene");
    expect(fmtDateEs("2025-08-21")).toBe("21/08/2025");
    expect(fmtDateEs(null)).toBe(EMPTY_VALUE);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(isoDate(2025, 8, 5)).toBe("2025-08-05");
  });
});

describe("fmtAmount (montos de tablas y grillas)", () => {
  test("siempre con quetzales", () => {
    const { fmtAmount } = require("../financeFormat");
    expect(fmtAmount(1234.5)).toBe("Q 1,234.50");
    expect(fmtAmount(0)).toBe("Q 0.00");
    expect(fmtAmount(-200)).toBe("-Q 200.00");
    expect(fmtAmount(130000, 0)).toBe("Q 130,000");
  });
});
