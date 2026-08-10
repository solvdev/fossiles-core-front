import {
  addWorkDurationSkippingLunch,
  formatProductionDuration,
} from "./productionTimeHelper";

function localAt(year, monthIndex, day, hour, minute) {
  return new Date(year, monthIndex, day, hour, minute, 0, 0);
}

function timeParts(date) {
  return {
    hours: date.getHours(),
    minutes: date.getMinutes(),
  };
}

describe("productionTimeHelper", () => {
  describe("formatProductionDuration", () => {
    it("muestra solo minutos cuando es menor a 60 minutos (0.75h)", () => {
      expect(formatProductionDuration(0.75)).toBe("45 min");
    });

    it("muestra forma en horas cuando es >= 60 minutos (1.5h)", () => {
      expect(formatProductionDuration(1.5)).toBe("1h 30m");
    });

    it("muestra horas enteras sin minutos", () => {
      expect(formatProductionDuration(2)).toBe("2h");
    });

    it("muestra minutos exactos bajo una hora", () => {
      expect(formatProductionDuration(0.5)).toBe("30 min");
    });
  });

  describe("addWorkDurationSkippingLunch", () => {
    it("start 12:30 + 2h → end 15:30 (salta almuerzo 13-14)", () => {
      const start = localAt(2026, 7, 9, 12, 30);
      const end = addWorkDurationSkippingLunch(start, 2);
      expect(timeParts(end)).toEqual({ hours: 15, minutes: 30 });
    });

    it("start 13:30 + 1h → end 15:00 (inicia en almuerzo)", () => {
      const start = localAt(2026, 7, 9, 13, 30);
      const end = addWorkDurationSkippingLunch(start, 1);
      expect(timeParts(end)).toEqual({ hours: 15, minutes: 0 });
    });

    it("no altera el fin si no cruza almuerzo", () => {
      const start = localAt(2026, 7, 9, 9, 0);
      const end = addWorkDurationSkippingLunch(start, 2);
      expect(timeParts(end)).toEqual({ hours: 11, minutes: 0 });
    });
  });
});
