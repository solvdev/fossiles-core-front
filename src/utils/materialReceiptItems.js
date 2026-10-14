// Una recepción tiene un renglón por material, aunque la compra repita ese material.
export const groupPurchaseMaterials = (items = []) => {
  const grouped = new Map();
  items.forEach((item) => {
    const quantity = Number(item.quantity) || 0;
    const total = quantity * (Number(item.unitPrice) || 0);
    const previous = grouped.get(item.materialId);
    if (!previous) {
      grouped.set(item.materialId, { ...item, quantity, total });
    } else {
      previous.quantity += quantity;
      previous.total += total;
      if (previous.supplierId !== item.supplierId) previous.supplierId = null;
    }
  });
  return Array.from(grouped.values()).map(({ total, ...item }) => ({
    ...item, unitPrice: item.quantity > 0 ? Number((total / item.quantity).toFixed(2)) : 0,
  }));
};
