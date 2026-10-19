import {
  bulkSummary, canBulkReconcile, defaultFilters, describeDifference, describeImport, formatQ, loadFilters, monthRange, saveFilters,
  shortcutAction, toQueryParams, toQueryString,
} from "../reconciliationHelper";

describe("reconciliationHelper", () => {
  describe("formatQ", () => {
    it("da formato de quetzales con dos decimales", () => {
      expect(formatQ(480)).toBe("Q480.00");
      expect(formatQ("1234.5")).toBe("Q1,234.50");
      expect(formatQ(null)).toBe("—");
      expect(formatQ("abc")).toBe("—");
    });
  });

  describe("describeDifference", () => {
    it("Q100 cobrados y Q95 recibidos es una diferencia de Q5 y no depende solo del color", () => {
      const d = describeDifference({ status: "CON_DIFERENCIAS", hasReceipts: true, difference: -5 });
      expect(d).toEqual({ text: "-Q5.00", tone: "short", symbol: "▼" });
    });

    it("sin diferencia lleva el signo igual; sobrante lleva flecha arriba", () => {
      expect(describeDifference({ status: "CONCILIADO_AUTO", hasReceipts: true, difference: 0 })).toMatchObject({ text: "Q0.00", tone: "zero", symbol: "=" });
      expect(describeDifference({ status: "CON_DIFERENCIAS", hasReceipts: true, difference: 20 })).toMatchObject({ text: "+Q20.00", tone: "over", symbol: "▲" });
    });

    it("sin fondo aplicado se dice con texto, y un caso excluido no muestra diferencia", () => {
      expect(describeDifference({ status: "INFORMACION_INCOMPLETA", hasReceipts: false, difference: 0 })).toMatchObject({ text: "Sin fondo", symbol: "◌" });
      expect(describeDifference({ status: "EXCLUIDO", hasReceipts: false })).toMatchObject({ text: "—", tone: "none" });
    });
  });

  describe("acciones masivas seguras", () => {
    const pendiente = { id: 1, status: "PENDIENTE_REVISION", difference: 0, batchId: null };
    const conDiferencia = { id: 2, status: "PENDIENTE_REVISION", difference: -5, batchId: null };
    const enLote = { id: 3, status: "PENDIENTE_REVISION", difference: 0, batchId: 9 };
    const conciliado = { id: 4, status: "CONCILIADO_AUTO", difference: 0, batchId: null };

    it("solo se concilian en bloque los pendientes sin diferencia de monto y sin lote", () => {
      expect([pendiente, conDiferencia, enLote, conciliado].map(canBulkReconcile)).toEqual([true, false, false, false]);
    });

    it("resume cuántos se omitirán antes de ejecutar", () => {
      const rows = [pendiente, conDiferencia, enLote, conciliado];
      expect(bulkSummary(rows, new Set([1, 2, 3, 4]))).toEqual({ selected: 4, safe: 1, skipped: 3 });
      expect(bulkSummary(rows, new Set([1]))).toEqual({ selected: 1, safe: 1, skipped: 0 });
    });
  });

  describe("filtros", () => {
    it("el período por defecto es el mes en curso hasta hoy", () => {
      expect(defaultFilters("2026-10-19")).toMatchObject({ from: "2026-10-01", to: "2026-10-19", status: "", q: "" });
    });

    it("lo vacío no se envía a la API y 'sin lote' se traduce", () => {
      const params = toQueryParams({ from: "2026-10-01", to: "2026-10-14", method: "", status: "CON_DIFERENCIAS", q: "  58123  ", batch: "NONE" }, { page: 2, sort: undefined });
      expect(params).toEqual({ from: "2026-10-01", to: "2026-10-14", status: "CON_DIFERENCIAS", q: "58123", withoutBatch: true, page: 2 });
      expect(toQueryString(params)).toContain("withoutBatch=true");
      expect(toQueryString({})).toBe("");
    });

    it("un lote concreto se envía como batchId", () => {
      expect(toQueryParams({ batch: "7" })).toEqual({ batchId: "7" });
    });

    it("los filtros se recuerdan al volver, y sin almacenamiento todo sigue funcionando", () => {
      const store = {};
      const storage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
      const fallback = defaultFilters("2026-10-19");
      saveFilters(storage, { ...fallback, carrier: "GUATEX", desconocido: "x" });
      const restored = loadFilters(storage, fallback);
      expect(restored.carrier).toBe("GUATEX");
      expect(restored.desconocido).toBeUndefined();
      expect(loadFilters(null, fallback)).toEqual(fallback);
      const broken = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
      expect(loadFilters(broken, fallback)).toEqual(fallback);
      expect(() => saveFilters(broken, fallback)).not.toThrow();
    });

    it("el último día del mes respeta meses de 28, 30 y 31 días", () => {
      expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
      expect(monthRange("2024-02").to).toBe("2024-02-29");
      expect(monthRange("2026-09").to).toBe("2026-09-30");
      expect(monthRange("2026-10").to).toBe("2026-10-31");
      expect(monthRange("")).toEqual({ from: "", to: "" });
    });
  });

  describe("importación", () => {
    it("describe el resultado sin ruido", () => {
      expect(describeImport({ duplicateFile: true })).toContain("ya se había importado");
      expect(describeImport({ imported: 10, autoApplied: 8, ambiguous: 1, unmatched: 1, blocked: 0, duplicatedRows: 0, rejectedRows: 0 }))
        .toBe("10 filas importadas · 8 aplicadas solas · 1 ambiguas · 1 sin coincidencia");
    });
  });

  describe("atajos de teclado", () => {
    it("no roban teclas mientras se escribe, salvo Escape", () => {
      expect(shortcutAction("j", { typing: true, hasOpen: false })).toBeNull();
      expect(shortcutAction("Escape", { typing: true, hasOpen: true })).toBe("close");
      expect(shortcutAction("Escape", { typing: false, hasOpen: false })).toBeNull();
    });

    it("mapea las teclas de la bandeja", () => {
      const ctx = { typing: false, hasOpen: true };
      expect(["/", "j", "k", "Enter", "c", "x"].map((k) => shortcutAction(k, ctx))).toEqual(["search", "next", "prev", "open", "reconcile", null]);
    });
  });
});
