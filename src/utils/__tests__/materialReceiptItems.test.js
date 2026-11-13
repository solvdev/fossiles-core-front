import { groupPurchaseMaterials } from '../materialReceiptItems';

test('recibe un material repetido sin duplicar cantidades y conserva su valor acordado', () => {
  const items = [{ materialId: 1, quantity: 10, unitPrice: 10, supplierId: 2 },
    { materialId: 1, quantity: 5, unitPrice: 20, supplierId: 3 },
    { materialId: 2, quantity: 2, unitPrice: 4, supplierId: 2 }];
  expect(groupPurchaseMaterials(items)).toEqual([
    expect.objectContaining({ materialId: 1, quantity: 15, unitPrice: 13.33, supplierId: null }),
    expect.objectContaining({ materialId: 2, quantity: 2, unitPrice: 4, supplierId: 2 }),
  ]);
  expect(items[0].quantity).toBe(10);
});

test('una compra sin materiales produce un detalle vacío', () => {
  expect(groupPurchaseMaterials()).toEqual([]);
});
