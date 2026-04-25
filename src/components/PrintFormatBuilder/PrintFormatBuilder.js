import React, { useState, useCallback } from "react";
import {
  Row,
  Col,
  Card,
  CardBody,
  CardHeader,
  Button,
  Input,
  Label,
  FormGroup,
  Badge,
  Alert,
} from "reactstrap";
import classnames from "classnames";

const ELEMENT_TYPES = {
  TEXT: {
    id: "text",
    name: "Texto",
    icon: "nc-icon nc-single-copy-04",
    defaultProps: { content: "Texto de ejemplo", fontSize: "14px", fontWeight: "normal", align: "left" },
    generateHTML: (props) => `<p style="font-size: ${props.fontSize}; font-weight: ${props.fontWeight}; text-align: ${props.align}; margin: 5px 0;">${props.content}</p>`,
  },
  HEADING: {
    id: "heading",
    name: "Título",
    icon: "nc-icon nc-paper",
    defaultProps: { content: "Título", level: "h2", fontSize: "24px", fontWeight: "bold", align: "left" },
    generateHTML: (props) => `<${props.level} style="font-size: ${props.fontSize}; font-weight: ${props.fontWeight}; text-align: ${props.align}; margin: 10px 0;">${props.content}</${props.level}>`,
  },
  VARIABLE: {
    id: "variable",
    name: "Variable",
    icon: "nc-icon nc-tag-content",
    defaultProps: { variableName: "{{documentNumber}}", fontSize: "14px", fontWeight: "normal", align: "left" },
    generateHTML: (props) => `<span style="font-size: ${props.fontSize}; font-weight: ${props.fontWeight}; text-align: ${props.align};">${props.variableName}</span>`,
  },
  TABLE: {
    id: "table",
    name: "Tabla",
    icon: "nc-icon nc-bullet-list-67",
    defaultProps: { 
      columns: 3, 
      rows: 3, 
      headers: ["Columna 1", "Columna 2", "Columna 3"],
      border: "1px solid #ddd",
      width: "100%"
    },
    generateHTML: (props) => {
      const headers = props.headers || Array(props.columns).fill("Columna");
      const rows = Array(props.rows).fill(null).map(() => Array(props.columns).fill(""));
      return `
        <table style="width: ${props.width}; border-collapse: collapse; margin: 10px 0;">
          <thead>
            <tr>
              ${headers.map(h => `<th style="border: ${props.border}; padding: 8px; text-align: left; background-color: #f5f5f5;">${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                ${row.map(cell => `<td style="border: ${props.border}; padding: 8px;">${cell}</td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    },
  },
  DIVIDER: {
    id: "divider",
    name: "Divisor",
    icon: "nc-icon nc-align-center",
    defaultProps: { style: "solid", color: "#ddd", width: "100%" },
    generateHTML: (props) => {
      const borderStyle = props.style === "dashed" ? "dashed" : props.style === "dotted" ? "dotted" : "solid";
      return `<hr style="border: none; border-top: 1px ${borderStyle} ${props.color}; width: ${props.width}; margin: 15px 0;" />`;
    },
  },
  IMAGE: {
    id: "image",
    name: "Imagen",
    icon: "nc-icon nc-image",
    defaultProps: { src: "{{logo}}", width: "200px", height: "auto", align: "left" },
    generateHTML: (props) => {
      const alignStyle = props.align === "center" ? "margin: 0 auto; display: block;" : props.align === "right" ? "margin-left: auto; display: block;" : "";
      return `<img src="${props.src}" style="width: ${props.width}; height: ${props.height}; ${alignStyle} margin: 10px 0;" alt="" />`;
    },
  },
  CONTAINER: {
    id: "container",
    name: "Contenedor",
    icon: "nc-icon nc-layout-11",
    defaultProps: { padding: "10px", backgroundColor: "transparent", border: "none" },
    generateHTML: (props, children) => {
      return `<div style="padding: ${props.padding}; background-color: ${props.backgroundColor}; border: ${props.border}; margin: 5px 0;">${children || ""}</div>`;
    },
  },
};

function PrintFormatBuilder({ value, onChange, availableVariables = [] }) {
  const [elements, setElements] = useState([]);
  const [selectedElement, setSelectedElement] = useState(null);
  const [draggedElement, setDraggedElement] = useState(null);
  const [showHTML, setShowHTML] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  React.useEffect(() => {
    if (value && typeof value === 'string' && value.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          setElements(parsed);
        }
      } catch {
        setElements([]);
      }
    }
  }, []);

  const generateHTML = useCallback(() => {
    const generateElementHTML = (element) => {
      const elementType = ELEMENT_TYPES[element.type];
      if (!elementType) return "";

      if (element.type === "CONTAINER") {
        const childrenHTML = (element.children || []).map(generateElementHTML).join("");
        return elementType.generateHTML(element.props, childrenHTML);
      }

      return elementType.generateHTML(element.props);
    };

    return elements.map(generateElementHTML).join("\n");
  }, [elements]);

  React.useEffect(() => {
    const html = generateHTML();
    if (onChange) {
      onChange(html);
    }
  }, [elements, generateHTML, onChange]);

  const handleDragStart = (e, elementType) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", elementType);
    e.dataTransfer.setData("application/json", JSON.stringify({ type: elementType }));
    setDraggedElement(elementType);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setIsDraggingOver(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = (e, insertIndex = null) => {
    e.preventDefault();
    e.stopPropagation();
    
    let elementTypeId = draggedElement;
    
    if (!elementTypeId) {
      try {
        const data = e.dataTransfer.getData("application/json");
        if (data) {
          const parsed = JSON.parse(data);
          elementTypeId = parsed.type;
        } else {
          elementTypeId = e.dataTransfer.getData("text/plain");
        }
      } catch (err) {
        elementTypeId = e.dataTransfer.getData("text/plain");
      }
    }

    if (!elementTypeId) return;

    const elementType = ELEMENT_TYPES[elementTypeId];
    if (!elementType) return;

    const newElement = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type: elementTypeId,
      props: { ...elementType.defaultProps },
    };

    if (insertIndex !== null) {
      const newElements = [...elements];
      newElements.splice(insertIndex, 0, newElement);
      setElements(newElements);
    } else {
      setElements([...elements, newElement]);
    }

    setDraggedElement(null);
    setSelectedElement(newElement.id);
    setIsDraggingOver(false);
  };

  const handleDeleteElement = (id) => {
    setElements(elements.filter(el => el.id !== id));
    if (selectedElement === id) {
      setSelectedElement(null);
    }
  };

  const handleUpdateElement = (id, newProps) => {
    setElements(elements.map(el => 
      el.id === id ? { ...el, props: { ...el.props, ...newProps } } : el
    ));
  };

  const handleMoveElement = (id, direction) => {
    const index = elements.findIndex(el => el.id === id);
    if (index === -1) return;

    const newElements = [...elements];
    if (direction === "up" && index > 0) {
      [newElements[index - 1], newElements[index]] = [newElements[index], newElements[index - 1]];
    } else if (direction === "down" && index < elements.length - 1) {
      [newElements[index], newElements[index + 1]] = [newElements[index + 1], newElements[index]];
    }
    setElements(newElements);
  };

  const selectedElementData = elements.find(el => el.id === selectedElement);
  const selectedElementType = selectedElementData ? ELEMENT_TYPES[selectedElementData.type] : null;

  return (
    <Row>
      <Col md="3">
        <Card>
          <CardHeader>
            <h5 className="mb-0">Elementos</h5>
            <small className="text-muted">Arrastra para agregar</small>
          </CardHeader>
          <CardBody style={{ maxHeight: "600px", overflowY: "auto" }}>
            {Object.values(ELEMENT_TYPES).map((elementType) => (
              <div
                key={elementType.id}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, elementType.id)}
                onDragEnd={() => {
                  setDraggedElement(null);
                  setIsDraggingOver(false);
                }}
                className="mb-2 p-2 border rounded"
                style={{ 
                  cursor: "grab", 
                  backgroundColor: "#f8f9fa",
                  userSelect: "none",
                  transition: "all 0.2s ease",
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.cursor = "grabbing";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.cursor = "grab";
                }}
              >
                <i className={`${elementType.icon} mr-2`} />
                {elementType.name}
              </div>
            ))}
          </CardBody>
        </Card>

        {availableVariables.length > 0 && (
          <Card className="mt-3">
            <CardHeader>
              <h6 className="mb-0">Variables Disponibles</h6>
            </CardHeader>
            <CardBody style={{ maxHeight: "300px", overflowY: "auto" }}>
              {availableVariables.map((variable, idx) => (
                <Badge
                  key={idx}
                  color="info"
                  className="mr-1 mb-1"
                  style={{ cursor: "pointer", fontSize: "11px" }}
                  onClick={() => {
                    if (selectedElementData && selectedElementData.type === "VARIABLE") {
                      handleUpdateElement(selectedElement, { variableName: variable.name });
                    } else {
                      const newElement = {
                        id: Date.now().toString(),
                        type: "VARIABLE",
                        props: { ...ELEMENT_TYPES.VARIABLE.defaultProps, variableName: variable.name },
                      };
                      setElements([...elements, newElement]);
                      setSelectedElement(newElement.id);
                    }
                  }}
                >
                  {variable.name}
                </Badge>
              ))}
            </CardBody>
          </Card>
        )}
      </Col>

      <Col md="6">
        <Card>
          <CardHeader className="d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Área de Construcción</h5>
            <div>
              <Button
                color="link"
                size="sm"
                onClick={() => setShowHTML(!showHTML)}
                className="mr-2"
              >
                {showHTML ? "Ocultar" : "Ver"} HTML
              </Button>
              <Button
                color="danger"
                size="sm"
                onClick={() => {
                  if (window.confirm("¿Eliminar todos los elementos?")) {
                    setElements([]);
                    setSelectedElement(null);
                  }
                }}
              >
                Limpiar
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            <div
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                minHeight: "400px",
                padding: "20px",
                border: `2px dashed ${isDraggingOver ? "#007bff" : "#ddd"}`,
                backgroundColor: isDraggingOver ? "#e7f3ff" : "#fafafa",
                borderRadius: "4px",
                transition: "all 0.2s ease",
              }}
            >
              {elements.length === 0 ? (
                <div className="text-center text-muted" style={{ padding: "50px" }}>
                  <i className="nc-icon nc-layout-11" style={{ fontSize: "48px", opacity: 0.3 }} />
                  <p className="mt-3">Arrastra elementos aquí para comenzar</p>
                </div>
              ) : (
                elements.map((element, index) => {
                  const elementType = ELEMENT_TYPES[element.type];
                  if (!elementType) return null;

                  const isSelected = selectedElement === element.id;
                  const html = elementType.generateHTML(element.props, element.children);

                  return (
                    <div
                      key={element.id}
                      onClick={() => setSelectedElement(element.id)}
                      className={classnames("mb-2 p-2 position-relative", {
                        "border border-primary": isSelected,
                      })}
                      style={{
                        cursor: "pointer",
                        backgroundColor: isSelected ? "#e7f3ff" : "white",
                        borderRadius: "4px",
                      }}
                    >
                      {isSelected && (
                        <div className="position-absolute" style={{ top: "-10px", right: "5px" }}>
                          <Button
                            color="primary"
                            size="sm"
                            className="btn-round mr-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveElement(element.id, "up");
                            }}
                            disabled={index === 0}
                          >
                            <i className="nc-icon nc-minimal-up" />
                          </Button>
                          <Button
                            color="primary"
                            size="sm"
                            className="btn-round mr-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveElement(element.id, "down");
                            }}
                            disabled={index === elements.length - 1}
                          >
                            <i className="nc-icon nc-minimal-down" />
                          </Button>
                          <Button
                            color="danger"
                            size="sm"
                            className="btn-round"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteElement(element.id);
                            }}
                          >
                            <i className="nc-icon nc-simple-remove" />
                          </Button>
                        </div>
                      )}
                      <div
                        dangerouslySetInnerHTML={{ __html: html }}
                        onClick={(e) => e.stopPropagation()}
                        onDragOver={(e) => e.stopPropagation()}
                        onDrop={(e) => e.stopPropagation()}
                      />
                    </div>
                  );
                })
              )}

              {showHTML && (
                <Alert color="light" className="mt-3">
                  <pre style={{ fontSize: "11px", maxHeight: "200px", overflow: "auto" }}>
                    {generateHTML()}
                  </pre>
                </Alert>
              )}
            </div>
          </CardBody>
        </Card>
      </Col>

      <Col md="3">
        <Card>
          <CardHeader>
            <h5 className="mb-0">Propiedades</h5>
          </CardHeader>
          <CardBody style={{ maxHeight: "600px", overflowY: "auto" }}>
            {selectedElementData && selectedElementType ? (
              <ElementPropertiesEditor
                element={selectedElementData}
                elementType={selectedElementType}
                availableVariables={availableVariables}
                onUpdate={(newProps) => handleUpdateElement(selectedElement, newProps)}
              />
            ) : (
              <p className="text-muted text-center">Selecciona un elemento para editar sus propiedades</p>
            )}
          </CardBody>
        </Card>
      </Col>
    </Row>
  );
}

function ElementPropertiesEditor({ element, elementType, availableVariables, onUpdate }) {
  const [props, setProps] = useState(element.props || {});

  React.useEffect(() => {
    setProps(element.props || {});
  }, [element.id]);

  const handleChange = (key, value) => {
    const newProps = { ...props, [key]: value };
    setProps(newProps);
    onUpdate(newProps);
  };

  const renderPropertyEditor = () => {
    switch (element.type) {
      case "TEXT":
        return (
          <>
            <FormGroup>
              <Label>Contenido</Label>
              <Input
                type="textarea"
                rows="3"
                value={props.content || ""}
                onChange={(e) => handleChange("content", e.target.value)}
              />
            </FormGroup>
            <FormGroup>
              <Label>Tamaño de Fuente</Label>
              <Input
                type="select"
                value={props.fontSize || "14px"}
                onChange={(e) => handleChange("fontSize", e.target.value)}
              >
                <option value="10px">10px</option>
                <option value="12px">12px</option>
                <option value="14px">14px</option>
                <option value="16px">16px</option>
                <option value="18px">18px</option>
                <option value="20px">20px</option>
                <option value="24px">24px</option>
              </Input>
            </FormGroup>
            <FormGroup>
              <Label>Peso de Fuente</Label>
              <Input
                type="select"
                value={props.fontWeight || "normal"}
                onChange={(e) => handleChange("fontWeight", e.target.value)}
              >
                <option value="normal">Normal</option>
                <option value="bold">Negrita</option>
                <option value="lighter">Ligera</option>
              </Input>
            </FormGroup>
            <FormGroup>
              <Label>Alineación</Label>
              <Input
                type="select"
                value={props.align || "left"}
                onChange={(e) => handleChange("align", e.target.value)}
              >
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </Input>
            </FormGroup>
          </>
        );

      case "HEADING":
        return (
          <>
            <FormGroup>
              <Label>Contenido</Label>
              <Input
                type="text"
                value={props.content || ""}
                onChange={(e) => handleChange("content", e.target.value)}
              />
            </FormGroup>
            <FormGroup>
              <Label>Nivel</Label>
              <Input
                type="select"
                value={props.level || "h2"}
                onChange={(e) => handleChange("level", e.target.value)}
              >
                <option value="h1">H1</option>
                <option value="h2">H2</option>
                <option value="h3">H3</option>
                <option value="h4">H4</option>
              </Input>
            </FormGroup>
            <FormGroup>
              <Label>Tamaño de Fuente</Label>
              <Input
                type="select"
                value={props.fontSize || "24px"}
                onChange={(e) => handleChange("fontSize", e.target.value)}
              >
                <option value="18px">18px</option>
                <option value="20px">20px</option>
                <option value="24px">24px</option>
                <option value="28px">28px</option>
                <option value="32px">32px</option>
              </Input>
            </FormGroup>
            <FormGroup>
              <Label>Alineación</Label>
              <Input
                type="select"
                value={props.align || "left"}
                onChange={(e) => handleChange("align", e.target.value)}
              >
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </Input>
            </FormGroup>
          </>
        );

      case "VARIABLE":
        return (
          <>
            <FormGroup>
              <Label>Variable</Label>
              <Input
                type="select"
                value={props.variableName || "{{documentNumber}}"}
                onChange={(e) => handleChange("variableName", e.target.value)}
              >
                {availableVariables.map((v, idx) => (
                  <option key={idx} value={v.name}>{v.name}</option>
                ))}
              </Input>
            </FormGroup>
            <FormGroup>
              <Label>Tamaño de Fuente</Label>
              <Input
                type="select"
                value={props.fontSize || "14px"}
                onChange={(e) => handleChange("fontSize", e.target.value)}
              >
                <option value="10px">10px</option>
                <option value="12px">12px</option>
                <option value="14px">14px</option>
                <option value="16px">16px</option>
                <option value="18px">18px</option>
              </Input>
            </FormGroup>
            <FormGroup>
              <Label>Peso de Fuente</Label>
              <Input
                type="select"
                value={props.fontWeight || "normal"}
                onChange={(e) => handleChange("fontWeight", e.target.value)}
              >
                <option value="normal">Normal</option>
                <option value="bold">Negrita</option>
              </Input>
            </FormGroup>
          </>
        );

      case "TABLE":
        return (
          <>
            <FormGroup>
              <Label>Columnas</Label>
              <Input
                type="number"
                min="1"
                max="10"
                value={props.columns || 3}
                onChange={(e) => {
                  const cols = parseInt(e.target.value) || 3;
                  const currentHeaders = props.headers || [];
                  const newHeaders = Array(cols).fill(null).map((_, i) => currentHeaders[i] || `Columna ${i + 1}`);
                  handleChange("columns", cols);
                  handleChange("headers", newHeaders);
                }}
              />
            </FormGroup>
            <FormGroup>
              <Label>Filas</Label>
              <Input
                type="number"
                min="1"
                max="20"
                value={props.rows || 3}
                onChange={(e) => handleChange("rows", parseInt(e.target.value) || 3)}
              />
            </FormGroup>
            <FormGroup>
              <Label>Ancho</Label>
              <Input
                type="select"
                value={props.width || "100%"}
                onChange={(e) => handleChange("width", e.target.value)}
              >
                <option value="100%">100%</option>
                <option value="75%">75%</option>
                <option value="50%">50%</option>
                <option value="auto">Auto</option>
              </Input>
            </FormGroup>
            {(props.headers || []).map((header, idx) => (
              <FormGroup key={idx}>
                <Label>Encabezado {idx + 1}</Label>
                <Input
                  type="text"
                  value={header}
                  onChange={(e) => {
                    const newHeaders = [...(props.headers || [])];
                    newHeaders[idx] = e.target.value;
                    handleChange("headers", newHeaders);
                  }}
                />
              </FormGroup>
            ))}
          </>
        );

      case "DIVIDER":
        return (
          <>
            <FormGroup>
              <Label>Estilo</Label>
              <Input
                type="select"
                value={props.style || "solid"}
                onChange={(e) => handleChange("style", e.target.value)}
              >
                <option value="solid">Sólido</option>
                <option value="dashed">Guiones</option>
                <option value="dotted">Puntos</option>
              </Input>
            </FormGroup>
            <FormGroup>
              <Label>Color</Label>
              <Input
                type="color"
                value={props.color || "#ddd"}
                onChange={(e) => handleChange("color", e.target.value)}
              />
            </FormGroup>
            <FormGroup>
              <Label>Ancho</Label>
              <Input
                type="select"
                value={props.width || "100%"}
                onChange={(e) => handleChange("width", e.target.value)}
              >
                <option value="100%">100%</option>
                <option value="75%">75%</option>
                <option value="50%">50%</option>
              </Input>
            </FormGroup>
          </>
        );

      case "IMAGE":
        return (
          <>
            <FormGroup>
              <Label>URL o Variable</Label>
              <Input
                type="text"
                value={props.src || "{{logo}}"}
                onChange={(e) => handleChange("src", e.target.value)}
                placeholder="{{logo}} o URL"
              />
            </FormGroup>
            <FormGroup>
              <Label>Ancho</Label>
              <Input
                type="text"
                value={props.width || "200px"}
                onChange={(e) => handleChange("width", e.target.value)}
                placeholder="200px o 50%"
              />
            </FormGroup>
            <FormGroup>
              <Label>Alto</Label>
              <Input
                type="text"
                value={props.height || "auto"}
                onChange={(e) => handleChange("height", e.target.value)}
                placeholder="auto o 100px"
              />
            </FormGroup>
            <FormGroup>
              <Label>Alineación</Label>
              <Input
                type="select"
                value={props.align || "left"}
                onChange={(e) => handleChange("align", e.target.value)}
              >
                <option value="left">Izquierda</option>
                <option value="center">Centro</option>
                <option value="right">Derecha</option>
              </Input>
            </FormGroup>
          </>
        );

      case "CONTAINER":
        return (
          <>
            <FormGroup>
              <Label>Padding</Label>
              <Input
                type="text"
                value={props.padding || "10px"}
                onChange={(e) => handleChange("padding", e.target.value)}
                placeholder="10px o 10px 20px"
              />
            </FormGroup>
            <FormGroup>
              <Label>Color de Fondo</Label>
              <Input
                type="color"
                value={props.backgroundColor || "#ffffff"}
                onChange={(e) => handleChange("backgroundColor", e.target.value)}
              />
            </FormGroup>
            <FormGroup>
              <Label>Borde</Label>
              <Input
                type="text"
                value={props.border || "none"}
                onChange={(e) => handleChange("border", e.target.value)}
                placeholder="1px solid #ddd"
              />
            </FormGroup>
          </>
        );

      default:
        return <p className="text-muted">No hay propiedades editables para este elemento</p>;
    }
  };

  return (
    <div>
      <h6 className="mb-3">{elementType.name}</h6>
      {renderPropertyEditor()}
    </div>
  );
}

export default PrintFormatBuilder;

