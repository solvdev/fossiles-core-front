import { hasPortfolioBalance } from "services/customerAccountService";

const customer = (overrides = {}) => ({
  customerId: 1,
  balance: 0,
  balanceDue: 0,
  creditBalance: 0,
  balanceDueOpv: 0,
  balanceDueOpc: 0,
  ...overrides,
});

describe("hasPortfolioBalance (qué clientes siguen en la cartera)", () => {
  it("un cliente en cero ya no debe nada: no sale en ninguna cartera", () => {
    expect(hasPortfolioBalance(customer(), "OPV")).toBe(false);
    expect(hasPortfolioBalance(customer(), "OPC")).toBe(false);
  });

  it("sale en la cartera donde debe y no en la otra", () => {
    const row = customer({ balance: 250, balanceDue: 250, balanceDueOpc: 250 });
    expect(hasPortfolioBalance(row, "OPC")).toBe(true);
    expect(hasPortfolioBalance(row, "OPV")).toBe(false);
  });

  it("cliente saldado en Fossiles pero con deuda en GCF solo aparece en GCF", () => {
    const row = customer({ balance: 100, balanceDue: 100, balanceDueOpv: 0, balanceDueOpc: 100 });
    expect(hasPortfolioBalance(row, "OPV")).toBe(false);
    expect(hasPortfolioBalance(row, "OPC")).toBe(true);
  });

  it("un residuo menor a medio centavo cuenta como cero", () => {
    expect(hasPortfolioBalance(customer({ balanceDueOpv: 0.004 }), "OPV")).toBe(false);
    expect(hasPortfolioBalance(customer({ balanceDueOpv: 0.01 }), "OPV")).toBe(true);
  });

  it("un cliente con crédito a favor se mantiene visible", () => {
    const row = customer({ balance: -80, creditBalance: 80 });
    expect(hasPortfolioBalance(row, "OPV")).toBe(true);
    expect(hasPortfolioBalance(row, "OPC")).toBe(true);
  });

  it("calcula el crédito desde el saldo neto cuando el backend no manda creditBalance", () => {
    const row = { customerId: 2, balance: -30, balanceDueOpv: 0, balanceDueOpc: 0 };
    expect(hasPortfolioBalance(row, "OPV")).toBe(true);
  });

  it("con dueOnly quedan solo los que deben (el crédito a favor no cuenta)", () => {
    const credit = customer({ balance: -80, creditBalance: 80 });
    const debtor = customer({ balance: 90, balanceDue: 90, balanceDueOpv: 90 });
    expect(hasPortfolioBalance(credit, "OPV", { dueOnly: true })).toBe(false);
    expect(hasPortfolioBalance(debtor, "OPV", { dueOnly: true })).toBe(true);
    expect(hasPortfolioBalance(debtor, "OPC", { dueOnly: true })).toBe(false);
  });

  it("tolera filas vacías", () => {
    expect(hasPortfolioBalance(undefined, "OPV")).toBe(false);
    expect(hasPortfolioBalance(null, "OPC", { dueOnly: true })).toBe(false);
  });
});
