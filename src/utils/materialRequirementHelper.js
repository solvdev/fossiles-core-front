export const isProductLeatherOnly = (product) => {
  if (!product) return false;
  return product.requiresMaterials === false;
};

const getTaskItems = (task) => {
  if (Array.isArray(task?.items) && task.items.length > 0) {
    return task.items;
  }
  if (Array.isArray(task?.products) && task.products.length > 0) {
    return task.products;
  }
  return [{
    productId: task?.productId,
    productCode: task?.productCode,
  }];
};

export const taskSkipsMaterials = (task) => {
  if (task?.requiresMaterials === false) return true;
  const items = getTaskItems(task).filter((item) => item?.productId || item?.productCode);
  if (items.length === 0) return false;
  return items.every((item) => item.requiresMaterials === false);
};

export const taskMaterialsReady = (task) => {
  if (taskSkipsMaterials(task)) return true;
  return Boolean(task?.materialsDelivered);
};

