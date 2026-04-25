const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const parseResponse = async (response, fallbackMessage) => {
  if (!response.ok) {
    if (response.status === 413) {
      throw new Error("La imagen es demasiado grande. Toma una foto con menor tamaño.");
    }
    const errorData = await response
      .json()
      .catch(() => ({ message: fallbackMessage }));
    throw new Error(errorData.message || fallbackMessage);
  }

  return response.json();
};

export const getPublicMaterialById = async (materialId) => {
  const response = await fetch(`${API_URL}/public/materials/${materialId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return parseResponse(response, "Error al obtener material");
};

export const getPublicMaterialInventory = async (materialId) => {
  const response = await fetch(`${API_URL}/public/inventory/materials/${materialId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return parseResponse(response, "Error al obtener inventario del material");
};

export const getPublicMaterialKardex = async (materialId) => {
  const response = await fetch(`${API_URL}/public/inventory/materials/${materialId}/kardex`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return parseResponse(response, "Error al obtener kardex del material");
};

export const createPublicMaterialMovement = async (materialId, movementData) => {
  const response = await fetch(`${API_URL}/public/inventory/materials/${materialId}/movements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(movementData),
  });

  return parseResponse(response, "Error al registrar movimiento");
};

export const uploadPublicMaterialImage = async (materialId, file) => {
  if (!file) {
    throw new Error("No se selecciono imagen");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/public/materials/${materialId}/image`, {
    method: "POST",
    body: formData,
  });

  return parseResponse(response, "Error al subir imagen del material");
};

export const searchPublicMaterials = async (query) => {
  const response = await fetch(
    `${API_URL}/public/materials/search?query=${encodeURIComponent(query)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return parseResponse(response, "Error al buscar materiales");
};
