import {
  addWorkingTime,
  workingMinutesBetween,
  formatProductionDuration,
  WORK_MINUTES_PER_DAY,
} from "./productionTimeHelper";

/**
 * Fechas ancla de las pruebas. La jornada es de lunes a viernes, así que todos
 * los casos parten de un día laboral salvo los que prueban el fin de semana.
 */
const LUNES = [2026, 7, 10]; // 10 de agosto de 2026, lunes
const VIERNES = [2026, 7, 14]; // 14 de agosto de 2026, viernes
const SABADO = [2026, 7, 15];

function localAt([year, monthIndex, day], hour, minute) {
  return new Date(year, monthIndex, day, hour, minute, 0, 0);
}

function partes(date) {
  return { dia: date.getDate(), hora: date.getHours(), min: date.getMinutes() };
}

describe("productionTimeHelper", () => {
  it("la jornada son 9 horas efectivas", () => {
    expect(WORK_MINUTES_PER_DAY).toBe(540);
  });

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

  describe("addWorkingTime", () => {
    it("no altera el fin si no cruza almuerzo", () => {
      const end = addWorkingTime(localAt(LUNES, 9, 0), 2);
      expect(partes(end)).toEqual({ dia: 10, hora: 11, min: 0 });
    });

    it("start 12:30 + 2h → 15:30, saltando el almuerzo", () => {
      const end = addWorkingTime(localAt(LUNES, 12, 30), 2);
      expect(partes(end)).toEqual({ dia: 10, hora: 15, min: 30 });
    });

    it("start dentro del almuerzo 13:30 + 1h → 15:00", () => {
      const end = addWorkingTime(localAt(LUNES, 13, 30), 1);
      expect(partes(end)).toEqual({ dia: 10, hora: 15, min: 0 });
    });

    it("start 14:00 + 5h → 09:00 del día siguiente (no cabe en la jornada)", () => {
      const end = addWorkingTime(localAt(LUNES, 14, 0), 5);
      expect(partes(end)).toEqual({ dia: 11, hora: 9, min: 0 });
    });

    it("viernes 16:00 + 2h → lunes 08:00, saltando el fin de semana", () => {
      const end = addWorkingTime(localAt(VIERNES, 16, 0), 2);
      expect(partes(end)).toEqual({ dia: 17, hora: 8, min: 0 });
    });

    it("antes de abrir: 06:00 + 1h cuenta desde las 07:00", () => {
      const end = addWorkingTime(localAt(LUNES, 6, 0), 1);
      expect(partes(end)).toEqual({ dia: 10, hora: 8, min: 0 });
    });

    it("después de cerrar: 18:00 + 1h cae al día siguiente", () => {
      const end = addWorkingTime(localAt(LUNES, 18, 0), 1);
      expect(partes(end)).toEqual({ dia: 11, hora: 8, min: 0 });
    });

    it("una jornada completa desde la apertura llega al cierre", () => {
      const end = addWorkingTime(localAt(LUNES, 7, 0), WORK_MINUTES_PER_DAY / 60);
      expect(partes(end)).toEqual({ dia: 10, hora: 17, min: 0 });
    });
  });

  describe("workingMinutesBetween", () => {
    it("dentro del mismo tramo cuenta el tiempo tal cual", () => {
      const min = workingMinutesBetween(localAt(LUNES, 9, 0), localAt(LUNES, 11, 0));
      expect(min).toBe(120);
    });

    it("descuenta el almuerzo", () => {
      const min = workingMinutesBetween(localAt(LUNES, 12, 30), localAt(LUNES, 15, 30));
      expect(min).toBe(120);
    });

    it("descuenta la noche: lunes 14:00 a martes 09:00 son 5 h de trabajo", () => {
      const min = workingMinutesBetween(localAt(LUNES, 14, 0), localAt(LUNES[0], 7, 11, 9, 0));
      expect(min).toBe(300);
    });

    it("descuenta el fin de semana: viernes 16:00 a lunes 08:00 son 2 h", () => {
      const min = workingMinutesBetween(localAt(VIERNES, 16, 0), localAt(LUNES[0], 7, 17, 8, 0));
      expect(min).toBe(120);
    });

    it("lo trabajado en sábado no cuenta", () => {
      const min = workingMinutesBetween(localAt(SABADO, 8, 0), localAt(SABADO, 12, 0));
      expect(min).toBe(0);
    });

    it("un fin anterior al inicio da cero, no negativo", () => {
      const min = workingMinutesBetween(localAt(LUNES, 15, 0), localAt(LUNES, 9, 0));
      expect(min).toBe(0);
    });

    it("es la inversa de addWorkingTime", () => {
      const inicio = localAt(LUNES, 14, 0);
      const fin = addWorkingTime(inicio, 5);
      expect(workingMinutesBetween(inicio, fin)).toBe(300);
    });
  });
});
