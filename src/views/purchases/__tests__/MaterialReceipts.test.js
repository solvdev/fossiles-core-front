import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import MaterialReceipts from '../MaterialReceipts';
import { getMaterialReceipts, updateMaterialReceipt, cancelMaterialReceipt } from 'services/materialReceiptService';
import { getPurchaseOrders, getPurchaseOrderById } from 'services/purchaseOrderService';
import { getSuppliers } from 'services/supplierService';
import { getMaterials } from 'services/materialService';
import { showError } from 'utils/notificationHelper';

jest.mock('services/materialReceiptService');
jest.mock('services/purchaseOrderService');
jest.mock('services/materialRequestService');
jest.mock('services/supplierService');
jest.mock('services/materialService');
jest.mock('utils/notificationHelper');
jest.mock('xlsx', () => ({}));

const receipt = { id: 7, purchaseOrderId: 1, purchaseOrderCode: 'CP-1', status: 'ACTIVE',
  orderStatus: 'RECIBIDA', orderTotal: 100, receiptDate: '2026-10-13',
  items: [{ materialId: 2, quantityReceived: 10, unitPriceReceived: 10 }] };
const order = { id: 1, code: 'CP-1', status: 'RECIBIDA', total: 100,
  items: [{ materialId: 2, materialSku: 'M-2', materialName: 'Material', quantity: 10, unitPrice: 10 }] };

beforeEach(() => {
  jest.resetAllMocks();
  getMaterialReceipts.mockResolvedValue([receipt]);
  getPurchaseOrders.mockResolvedValue([]);
  getPurchaseOrderById.mockResolvedValue(order);
  getSuppliers.mockResolvedValue([]);
  getMaterials.mockResolvedValue([]);
});
afterEach(cleanup);

test('permite corregir una recepción de una compra completamente recibida', async () => {
  updateMaterialReceipt.mockResolvedValue(receipt);
  render(<MaterialReceipts />);
  fireEvent.click(await screen.findByRole('button', { name: /Editar/ }));
  const update = await screen.findByRole('button', { name: 'Actualizar Recepción' });
  await act(async () => { fireEvent.click(update); });
  await waitFor(() => expect(updateMaterialReceipt).toHaveBeenCalledWith(7, expect.objectContaining({
    purchaseOrderId: 1, items: [expect.objectContaining({ materialId: 2, quantityReceived: 10 })],
  })));
  expect(showError).not.toHaveBeenCalled();
});

test('anula con motivo y conserva visible la recepción sin acciones de edición', async () => {
  cancelMaterialReceipt.mockResolvedValue({ ...receipt, status: 'CANCELLED' });
  render(<MaterialReceipts />);
  fireEvent.click(await screen.findByRole('button', { name: 'Anular' }));
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Devolución al proveedor' } });
  getMaterialReceipts.mockResolvedValue([{ ...receipt, status: 'CANCELLED' }]);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Anular recepción' })); });
  await waitFor(() => expect(cancelMaterialReceipt).toHaveBeenCalledWith(7, 'Devolución al proveedor'));
  expect(await screen.findByText('RECEPCIÓN ANULADA')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument();
});
