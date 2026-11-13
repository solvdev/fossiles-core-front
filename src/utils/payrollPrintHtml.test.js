import {
  buildPayrollChequesHtml,
  buildPayrollConcept,
  buildPayrollVouchersHtml,
  chequeLines,
  formatPlaceDate,
  payeeFontSize,
  payrollConceptLines,
} from "./payrollPrintHtml";

const run = {
  id: 7,
  payDate: "2025-12-03",
  periodStart: "2025-11-16",
  periodEnd: "2025-11-30",
  bankName: "BANCO G Y T CONTINENTAL",
  lines: [
    { id: 1, employeeName: "Ana <Prueba>", position: "Auxiliar de contabilidad", employmentType: "PLANILLA",
      paymentMethod: "CHEQUE", chequeNumber: "99645508/GCF", netPay: 7200 },
    { id: 2, employeeName: "Beto", employmentType: "SERVICIOS", paymentMethod: "TRANSFERENCIA BANCARIA", netPay: 1500 },
    { id: 3, employeeName: "Carla", employmentType: "PLANILLA", paymentMethod: "CHEQUE", chequeNumber: "99645509/GCF", netPay: 0 },
  ],
};

describe("payrollPrintHtml", () => {
  it("arma el concepto como en el voucher actual: puesto y luego el pago de la quincena", () => {
    expect(payrollConceptLines(run.lines[0], run)).toEqual([
      "AUXILIAR DE CONTABILIDAD",
      "PAGO DE SUELDO MAS BONIFICACION DECTO. LEY DE LA SEGUNDA QUINCENA DE NOVIEMBRE 2025",
    ]);
    expect(buildPayrollConcept(run.lines[1], { ...run, periodStart: "2026-10-01" })).toBe(
      "PAGO DE SERVICIOS DE LA PRIMERA QUINCENA DE OCTUBRE 2026");
  });

  it("escribe lugar y fecha como cada formato: DE en el cheque, DEL en el voucher", () => {
    expect(formatPlaceDate("2025-12-30")).toBe("GUATEMALA, 30 DE DICIEMBRE DE 2025");
    expect(formatPlaceDate("2025-12-03", "GUATEMALA", "DEL")).toBe("GUATEMALA, 03 DE DICIEMBRE DEL 2025");
  });

  it("el cheque lleva fecha, monto con comas y dos decimales, nombre y monto en letras", () => {
    expect(chequeLines(run).map((line) => line.id)).toEqual([1]);
    const cheques = buildPayrollChequesHtml(run);
    expect(cheques).toContain("GUATEMALA, 03 DE DICIEMBRE DE 2025");
    expect(cheques).toContain(">7,200.00<");
    expect(cheques).toContain("ANA &lt;PRUEBA&gt;");
    expect(cheques).toContain("SIETE MIL DOSCIENTOS QUETZALES EXACTOS");
    expect(cheques).toContain("size: 165mm 70mm");
  });

  it("el beneficiario no pasa de su renglón: los nombres largos bajan de tamaño", () => {
    expect(payeeFontSize("ANA PRUEBA")).toBe(11);
    expect(payeeFontSize("MARIA DE LOS ANGELES GUADALUPE HERNANDEZ")).toBe(11);
    expect(payeeFontSize("MARIA DE LOS ANGELES GUADALUPE HERNANDEZ LOPEZ")).toBe(10);
    expect(payeeFontSize("MARIA DE LOS ANGELES GUADALUPE HERNANDEZ DE LA CRUZ")).toBe(9);
    expect(payeeFontSize("MARIA DE LOS ANGELES GUADALUPE HERNANDEZ DE LA CRUZ LOPEZ")).toBe(8);
    const name = "MARIA DE LOS ANGELES GUADALUPE HERNANDEZ DE LA CRUZ";
    const cheques = buildPayrollChequesHtml({ ...run, lines: [{ ...run.lines[0], employeeName: name }] });
    expect(cheques).toContain("font-size:9pt;width:115mm;overflow:hidden;\">" + name + "<");
  });

  it("el voucher sigue los renglones del formato y solo sale para cheques", () => {
    const vouchers = buildPayrollVouchersHtml(run);
    ["ANA &lt;PRUEBA&gt;", "CONCEPTO:", "AUXILIAR DE CONTABILIDAD",
      "PAGO DE SUELDO MAS BONIFICACION DECTO. LEY DE LA SEGUNDA QUINCENA DE NOVIEMBRE 2025",
      "Q&nbsp;&nbsp;7,200.00", "TOTAL, EN LETRAS:", "SIETE MIL DOSCIENTOS QUETZALES EXACTOS",
      "GUATEMALA, 03 DE DICIEMBRE DEL 2025", "BANCO G Y T CONTINENTAL", "99645508/GCF", "size: 210mm 136mm"]
      .forEach((text) => expect(vouchers).toContain(text));
    expect(vouchers.indexOf("CONCEPTO:")).toBeLessThan(vouchers.indexOf("TOTAL, EN LETRAS:"));
    expect(vouchers.indexOf("TOTAL, EN LETRAS:")).toBeLessThan(vouchers.indexOf("DEL 2025"));
    expect(vouchers).not.toContain("Beto");
    expect(vouchers).not.toContain("99645509/GCF");
  });
});
