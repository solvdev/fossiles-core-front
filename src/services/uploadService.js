import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

export const uploadImage = async (file) => {
  if (!file) {
    throw new Error("No se seleccionó archivo");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/uploads/images`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Error al subir imagen" }));
    throw new Error(errorData.message || "Error al subir imagen");
  }

  return await response.json(); // { url, key }
};

export const uploadPDF = async (file) => {
  if (!file) {
    throw new Error("No se seleccionó archivo");
  }

  if (file.type !== "application/pdf") {
    throw new Error("El archivo debe ser un PDF");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/uploads/pdf`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Error al subir PDF" }));
    throw new Error(errorData.message || "Error al subir PDF");
  }

  return await response.json(); // { url, key }
};

export const uploadDOCX = async (file) => {
  if (!file) {
    throw new Error("No se seleccionó archivo");
  }

  const validTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword"
  ];
  
  if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.docx') && !file.name.toLowerCase().endsWith('.doc')) {
    throw new Error("El archivo debe ser un documento Word (.docx o .doc)");
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_URL}/uploads/docx`, {
    method: "POST",
    headers: {
      ...getAuthHeader(),
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Error al subir documento Word" }));
    throw new Error(errorData.message || "Error al subir documento Word");
  }

  return await response.json(); // { url, key }
};

export const downloadFile = async (url) => {
  try {
    // Si es una URL pública de S3 (o cualquier URL https), hacer fetch sin headers de autenticación
    // para evitar problemas de CORS
    const isPublicUrl = url.startsWith('https://') || url.startsWith('http://');
    
    const fetchOptions = {
      method: "GET",
    };

    // Solo agregar headers de autenticación si no es una URL pública
    if (!isPublicUrl) {
      fetchOptions.headers = {
        ...getAuthHeader(),
      };
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error("Error al descargar el archivo");
    }

    const blob = await response.blob();
    return blob;
  } catch (error) {
    console.error("Download file error:", error);
    throw error;
  }
};

