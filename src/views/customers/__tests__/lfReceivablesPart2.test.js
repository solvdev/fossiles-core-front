import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CustomerAccountStatement from "views/customers/CustomerAccountStatement";
import CustomerAccountChargeDetailModal from "components/customers/CustomerAccountChargeDetailModal";
import CustomersForm from "views/customers/CustomersForm";
import OpvShipmentsPage from "views/sales/OpvShipmentsPage";
import {
  createCustomerAccountEntry,
  getCustomerAccountStatement,
  getLfSalesDocuments,
  getOrderChargeQuote,
  getReceivableDocuments,
  voidCustomerAccountEntry,
} from "services/customerAccountService";
import { createCustomer } from "services/customerService";
import { getOpvShipments } from "services/salesDashboardService";
import { showError } from "utils/notificationHelper";

jest.mock("services/customerAccountService", () => {
  const actual = jest.requireActual("services/customerAccountService");
  return {
    ...actual,
    getCustomerAccountStatement: jest.fn(),
    getLfSalesDocuments: jest.fn(),
    getOrderChargeQuote: jest.fn(),
    getReceivableDocuments: jest.fn(),
    createCustomerAccountEntry: jest.fn(),
    voidCustomerAccountEntry: jest.fn(),
    getCustomerAccountSummary: jest.fn(),
    searchReceivableDocuments: jest.fn(),
  };
});

jest.mock("services/salesDashboardService", () => ({
  getOpvShipments: jest.fn(),
}));

jest.mock("services/customerService", () => {
  const actual = jest.requireActual("services/customerService");
  return {
    ...actual,
    getCustomerById: jest.fn(),
    createCustomer: jest.fn(),
    updateCustomer: jest.fn(),
    getCustomersByNit: jest.fn(),
  };
});

jest.mock("services/kioskPosService", () => ({
  lookupTaxpayerByNit: jest.fn(),
}));

jest.mock("utils/notificationHelper", () => ({
  showError: jest.fn(),
  showSuccess: jest.fn(),
}));

jest.mock("utils/customerAccountReportPrintHtml", () => ({
  buildSingleCustomerReportPrintHtml: jest.fn(() => ""),
  openCustomerAccountReportPrintWindow: jest.fn(),
}));

const setValue = (element, value) => {
  const proto =
    element.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : element.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const click = (element) => {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
};

const buttonsByText = (label) =>
  [...document.body.querySelectorAll("button")].filter((button) => button.textContent.trim() === label);

let container;
let root;

const mount = async (node) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root.unmount();
    });
  }
  container?.remove();
  document.body.innerHTML = "";
  root = undefined;
  container = undefined;
});

const chargeWithPayment = {
  customerName: "Cliente TEST",
  legacyCode: "TEST",
  openingBalance: 0,
  closingBalance: 60,
  closingBalanceDue: 60,
  lines: [
    {
      id: 1,
      entryType: "CHARGE",
      status: "ACTIVE",
      entryDate: "2026-10-01",
      debit: 100,
      credit: 0,
      productionOrderId: 10,
      invoiceNumber: "FAC-1",
      documentNumber: "OP-1",
      orderKind: "OPV",
    },
    {
      id: 2,
      entryType: "PAYMENT",
      status: "ACTIVE",
      entryDate: "2026-10-02",
      debit: 0,
      credit: 40,
      appliedToEntryId: 1,
      productionOrderId: 10,
    },
    {
      id: 4,
      entryType: "CHARGE_ADJUSTMENT",
      status: "ACTIVE",
      entryDate: "2026-10-02",
      debit: 15,
      credit: 0,
      appliedToEntryId: 1,
      productShipmentId: 1,
      productionOrderId: 10,
    },
    {
      id: 8,
      entryType: "CHARGE",
      status: "VOID",
      entryDate: "2026-09-01",
      debit: 50,
      credit: 0,
      invoiceNumber: "FAC-ORIG",
    },
    {
      id: 3,
      entryType: "PAYMENT",
      status: "ACTIVE",
      entryDate: "2026-10-03",
      debit: 0,
      credit: 10,
      appliedToEntryId: null,
      reassignedFromEntryId: 8,
    },
    {
      id: 6,
      entryType: "PAYMENT",
      status: "ACTIVE",
      entryDate: "2026-10-04",
      debit: 0,
      credit: 5,
      appliedToEntryId: null,
      reassignedFromEntryId: null,
    },
  ],
};

const renderStatement = (statement = chargeWithPayment) => {
  getCustomerAccountStatement.mockResolvedValue(statement);
  getLfSalesDocuments.mockResolvedValue([]);
  return mount(
    <MemoryRouter initialEntries={["/admin/customer-accounts/223"]}>
      <Routes>
        <Route path="/admin/customer-accounts/:customerId" element={<CustomerAccountStatement />} />
      </Routes>
    </MemoryRouter>
  );
};

describe("anulación con destino", () => {
  beforeEach(() => {
    voidCustomerAccountEntry.mockResolvedValue({ id: 1 });
    getReceivableDocuments.mockResolvedValue([
      {
        chargeEntryId: 1,
        productionOrderId: 10,
        orderKind: "OPV",
        orderCode: "OP-1",
        invoiceNumber: "FAC-1",
        balanceDue: 60,
      },
      {
        chargeEntryId: 5,
        productionOrderId: 10,
        orderKind: "OPC",
        orderCode: "OP-5",
        invoiceNumber: "ENVP-5",
        balanceDue: 80,
      },
    ]);
  });

  test("un cargo con abonos pide destino, lo excluye a sí mismo y lo manda en la anulación", async () => {
    await renderStatement();
    const anularCargo = buttonsByText("Anular")[0];
    await act(async () => {
      click(anularCargo);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(document.body.textContent).toContain("Mover pagos/abonos a");
    expect(document.body.textContent).toContain("Total a mover");
    expect(document.body.textContent).toContain("ENVP-5");

    const select = document.body.querySelector("select");
    const optionValues = [...select.options].map((option) => option.value);
    expect(optionValues).toContain("5");
    expect(optionValues).not.toContain("1");

    const confirm = buttonsByText("Confirmar anulación")[0];
    expect(confirm.disabled).toBe(true);
    await act(async () => {
      setValue(select, "5");
    });
    expect(confirm.disabled).toBe(false);

    const reason = document.body.querySelector("textarea");
    await act(async () => {
      setValue(reason, "error de captura");
    });
    await act(async () => {
      click(confirm);
    });

    expect(voidCustomerAccountEntry).toHaveBeenCalledWith(1, "error de captura", {
      requestId: expect.any(String),
      reassignToChargeId: "5",
    });
  });

  test("si el destino es de otra orden avisa que hay que anular los ajustes primero", async () => {
    getReceivableDocuments.mockResolvedValue([
      {
        chargeEntryId: 5,
        productionOrderId: 99,
        orderKind: "OPC",
        orderCode: "OP-9",
        invoiceNumber: "ENVP-9",
        balanceDue: 200,
      },
    ]);
    await renderStatement();
    await act(async () => {
      click(buttonsByText("Anular")[0]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => {
      setValue(document.body.querySelector("select"), "5");
    });
    expect(document.body.textContent).toContain("Anúlelos primero");
    expect(buttonsByText("Confirmar anulación")[0].disabled).toBe(true);
    expect(voidCustomerAccountEntry).not.toHaveBeenCalled();
  });

  test("un cargo sin abonos se anula sin selector", async () => {
    getReceivableDocuments.mockClear();
    await renderStatement({
      customerName: "Cliente TEST",
      openingBalance: 0,
      closingBalanceDue: 100,
      lines: [
        {
          id: 7,
          entryType: "CHARGE",
          status: "ACTIVE",
          entryDate: "2026-10-01",
          debit: 100,
          credit: 0,
          productionOrderId: 10,
          invoiceNumber: "FAC-LIBRE",
        },
      ],
    });
    await act(async () => {
      click(buttonsByText("Anular")[0]);
    });
    expect(document.body.textContent).not.toContain("Mover pagos/abonos a");
    const reason = document.body.querySelector("textarea");
    await act(async () => {
      setValue(reason, "cargo de más");
    });
    await act(async () => {
      click(buttonsByText("Confirmar anulación")[0]);
    });
    expect(voidCustomerAccountEntry).toHaveBeenCalledWith(7, "cargo de más", {
      requestId: expect.any(String),
      reassignToChargeId: undefined,
    });
    expect(getReceivableDocuments).not.toHaveBeenCalled();
  });

  test("muestra el 400 del servidor tal cual", async () => {
    voidCustomerAccountEntry.mockRejectedValueOnce(
      new Error("El monto movido supera el saldo del cargo destino.")
    );
    await renderStatement({
      customerName: "Cliente TEST",
      openingBalance: 0,
      closingBalanceDue: 100,
      lines: [
        {
          id: 7,
          entryType: "CHARGE",
          status: "ACTIVE",
          entryDate: "2026-10-01",
          debit: 100,
          credit: 0,
          invoiceNumber: "FAC-LIBRE",
        },
      ],
    });
    await act(async () => {
      click(buttonsByText("Anular")[0]);
    });
    await act(async () => {
      setValue(document.body.querySelector("textarea"), "error");
    });
    await act(async () => {
      click(buttonsByText("Confirmar anulación")[0]);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(showError).toHaveBeenCalledWith("El monto movido supera el saldo del cargo destino.");
  });
});

describe("nota de abono movido y envío por agregar", () => {
  test("el estado de cuenta muestra desde qué cargo se movió el abono", async () => {
    await renderStatement();
    expect(document.body.textContent).toContain("Movido desde cargo #8 (FAC-ORIG)");
    const looseWithoutOrigin = document.body.textContent.split("Movido desde cargo #");
    expect(looseWithoutOrigin.length).toBe(2);
  });

  test("Agregar envío solo aparece en el envío que no tiene ajuste", async () => {
    getOrderChargeQuote.mockResolvedValue({
      amount: 100,
      productsTotal: 100,
      shippingTotal: 115,
      orderTotal: 215,
      shippingLines: [
        { productShipmentId: 1, shipmentNumber: "ENV-1", shippingCost: 40 },
        { productShipmentId: 2, shipmentNumber: "ENV-2", shippingCost: 75 },
      ],
    });
    createCustomerAccountEntry.mockResolvedValue({ id: 20 });
    await mount(
      <CustomerAccountChargeDetailModal
        isOpen
        customerId={223}
        onChanged={jest.fn()}
        chargeLine={{
          id: 1,
          entryType: "CHARGE",
          productionOrderId: 10,
          entryDate: "2026-10-01",
          debit: 100,
          chargeBalanceDue: 100,
          invoiceNumber: "FAC-1",
          childEntries: [
            {
              id: 4,
              entryType: "CHARGE_ADJUSTMENT",
              status: "ACTIVE",
              productShipmentId: 1,
              debit: 40,
              credit: 0,
              entryDate: "2026-10-02",
            },
          ],
        }}
      />
    );
    expect(buttonsByText("Agregar envío")).toHaveLength(1);
    expect(document.body.textContent).toContain("ENV-2");
    await act(async () => {
      click(buttonsByText("Agregar envío")[0]);
    });
    const payload = createCustomerAccountEntry.mock.calls[0][1];
    expect(payload.entryType).toBe("CHARGE_ADJUSTMENT");
    expect(payload.productShipmentId).toBe(2);
    expect(payload.amount).toBe(75);
  });
});

describe("catálogo OPV", () => {
  test("Generar cargo no sale si ya hay cargo, ni en el parcial, y el estimado nulo no es un monto", async () => {
    getOpvShipments.mockResolvedValue([
      {
        productionOrderId: 1,
        productionOrderCode: "OP-1",
        customerId: 1,
        customerName: "Con cargo",
        hasCharge: true,
        chargeStatus: "CHARGED",
        documentLevel: "ORDER",
        estimatedTotal: 40,
        itemsSubtotal: 40,
      },
      {
        productionOrderId: 2,
        productionOrderCode: "OP-2",
        customerId: 1,
        customerName: "Sin cargo",
        hasCharge: false,
        chargeStatus: "NONE",
        documentLevel: "ORDER",
        estimatedTotal: null,
        itemsSubtotal: null,
        packingSubtotal: null,
        shippingCost: null,
      },
      {
        productionOrderId: 3,
        productionOrderCode: "OP-3",
        customerId: 1,
        customerName: "Parcial",
        hasCharge: false,
        chargeStatus: "NONE",
        documentLevel: "SHIPMENT",
        partialReleaseId: 9,
        estimatedTotal: null,
      },
    ]);
    await mount(
      <MemoryRouter>
        <OpvShipmentsPage />
      </MemoryRouter>
    );
    expect(buttonsByText("Generar cargo")).toHaveLength(1);
    expect(document.body.textContent).toContain("Sin envío");
    expect(document.body.textContent).not.toMatch(/Q\s+0\.00/);
  });
});

describe("días de crédito en el formulario", () => {
  test("valida 0 a 60 y lo envía al crear", async () => {
    createCustomer.mockResolvedValue({ id: 1 });
    await mount(<CustomersForm isOpen toggle={jest.fn()} onSuccess={jest.fn()} />);
    const inputs = [...document.body.querySelectorAll("input")];
    const name = inputs.find((input) => input.placeholder === "Persona o tienda");
    const nit = inputs.find((input) => input.placeholder === "NIT o CF");
    const days = document.body.querySelector('input[type="number"]');
    expect(days.value).toBe("0");

    const submit = () => {
      document.body.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    };
    await act(async () => {
      setValue(name, "Cliente TEST");
      setValue(nit, "CF");
      setValue(days, "61");
    });
    await act(async () => {
      submit();
    });
    expect(document.body.textContent).toContain("entre 0 y 60");
    expect(createCustomer).not.toHaveBeenCalled();

    await act(async () => {
      setValue(days, "60");
    });
    await act(async () => {
      submit();
    });
    expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ creditDays: 60, name: "Cliente TEST" }));
  });
});
