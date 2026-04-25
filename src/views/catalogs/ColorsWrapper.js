import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import ColorsList from "./ColorsList";
import MaterialColorsList from "../materials/MaterialColorsList";

function ColorsWrapper() {
  const [colorType, setColorType] = useState("product");
  const navigate = useNavigate();

  const handleTypeChange = (type) => {
    setColorType(type);
    if (type === "material") {
      navigate("/admin/material-colors");
    } else {
      navigate("/admin/colors");
    }
  };

  // Este componente no se renderiza directamente, pero podemos usarlo como base
  // En su lugar, cada lista manejará su propio selector y redirigirá
  return colorType === "product" ? <ColorsList /> : <MaterialColorsList />;
}

export default ColorsWrapper;

