import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Alert,
  Badge,
  FormGroup,
  Label,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
} from "reactstrap";
import { getMaterials, deleteMaterial, getMaterialById } from "services/materialService";
import { getUoms } from "services/uomService";
import { getMaterialColors } from "services/materialColorService";
import { getSuppliers } from "services/supplierService";
import MaterialsForm from "./MaterialsForm";

function MaterialsList() {
  const [materials, setMaterials] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [materialColors, setMaterialColors] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterColor, setFilterColor] = useState("all");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterUom, setFilterUom] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedMaterialDetails, setSelectedMaterialDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);


  const [sortConfig, setSortConfig] = useState({
    key: null,       // "id" | "uom" | "supplier"
    direction: "asc" // "asc" | "desc"
  });

  useEffect(() => {
    loadMaterials();
    loadUoms();
    loadMaterialColors();
    loadSuppliers();
  }, []);

  const handleNew = () => {
    setSelectedMaterialId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedMaterialId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadMaterials();
    setShowForm(false);
    setSelectedMaterialId(null);
  };

  const loadMaterials = async () => {
    try {
      setLoading(true);
      const data = await getMaterials();
      setMaterials(data);
    } catch (err) {
      setError(err.message || "Error al cargar los materiales");
    } finally {
      setLoading(false);
    }
  };

  const loadUoms = async () => {
    try {
      const data = await getUoms();
      setUoms(data || []);
    } catch (err) {
      console.error("Error al cargar UOMs:", err);
    }
  };

  const loadMaterialColors = async () => {
    try {
      const data = await getMaterialColors();
      setMaterialColors(data || []);
    } catch (err) {
      console.error("Error al cargar colores de materiales:", err);
    }
  };

  const loadSuppliers = async () => {
    try {
      const data = await getSuppliers();
      setSuppliers(data || []);
    } catch (err) {
      console.error("Error al cargar proveedores:", err);
    }
  };

  const getUomName = (uomId) => {
    if (!uomId) return "-";
    const uom = uoms.find((u) => u.id === uomId);
    return uom ? `${uom.name}` : `ID: ${uomId}`;
  };

  const getMaterialColorName = (colorId) => {
    if (!colorId) return "-";
    const color = materialColors.find((c) => c.id === colorId);
    return color ? color.name : `ID: ${colorId}`;
  };

  const getSupplierName = (supplierId) => {
    if (!supplierId) return "-";
    const supplier = suppliers.find((s) => s.id === supplierId);
    return supplier ? supplier.name : `ID: ${supplierId}`;
  };

  const getUomCode = (uomId) => {
    if (!uomId) return "";
    const uom = uoms.find((u) => u.id === uomId);
    return uom ? uom.code : "";
  };

  const calculateUnitCost = (purchasePrice, quantity) => {
    if (!purchasePrice || !quantity || quantity === 0) return null;
    return parseFloat(purchasePrice) / parseFloat(quantity);
  };

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return "↕";
    return sortConfig.direction === "asc" ? "▲" : "▼";
  };


  const filteredMaterials = materials.filter((material) => {
    // Filtro de búsqueda por texto
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      const searchText = `${material.sku || ""} ${material.name || ""}`.toLowerCase();
      if (!searchText.includes(term)) return false;
    }

    // Filtro por estado
    if (filterStatus !== "all") {
      const materialStatus = material.status === "active" ? "active" : "inactive";
      if (materialStatus !== filterStatus) return false;
    }

    // Filtro por color
    if (filterColor !== "all") {
      if (material.materialColorId?.toString() !== filterColor) return false;
    }

    // Filtro por proveedor
    if (filterSupplier !== "all") {
      if (material.supplierId?.toString() !== filterSupplier) return false;
    }

    // Filtro por UOM
    if (filterUom !== "all") {
      if (material.uomId?.toString() !== filterUom) return false;
    }

    return true;
  })
    .sort((a, b) => {
      if (!sortConfig.key) return 0;

      let aVal, bVal;

      if (sortConfig.key === "id") {
        aVal = a.id;
        bVal = b.id;
      }

      if (sortConfig.key === "uom") {
        aVal = getUomName(a.uomId);
        bVal = getUomName(b.uomId);
      }

      if (sortConfig.key === "supplier") {
        aVal = getSupplierName(a.supplierId);
        bVal = getSupplierName(b.supplierId);
      }

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar este material?")) {
      try {
        await deleteMaterial(id);
        loadMaterials();
      } catch (err) {
        setError(err.message || "Error al eliminar el material");
      }
    }
  };

  const handleViewDetails = async (id) => {
    try {
      setLoadingDetails(true);
      const material = await getMaterialById(id);
      setSelectedMaterialDetails(material);
      setShowDetailsModal(true);
    } catch (err) {
      setError(err.message || "Error al cargar los detalles del material");
    } finally {
      setLoadingDetails(false);
    }
  };

  const getStatusBadge = (status) => {
    return status === "active" ? (
      <Badge color="success">Activo</Badge>
    ) : (
      <Badge color="secondary">Inactivo</Badge>
    );
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Materiales (Materia Prima)</CardTitle>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Buscar por nombre o código</Label>
                    <Input
                      type="search"
                      placeholder="Ej: SKU-001, Tela..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="3" className="text-right">
                  <FormGroup>
                    <Label>&nbsp;</Label>
                    <div>
                      <Button color="primary" onClick={handleNew} className="btn-round" block>
                        <i className="nc-icon nc-simple-add" /> Nuevo Material
                      </Button>
                    </div>
                  </FormGroup>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {/* Filtros */}
              <Row className="mb-3">
                <Col md="3">
                  <FormGroup>
                    <Label>Estado</Label>
                    <Input
                      type="select"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Color</Label>
                    <Input
                      type="select"
                      value={filterColor}
                      onChange={(e) => setFilterColor(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      {materialColors.map((color) => (
                        <option key={color.id} value={color.id.toString()}>
                          {color.name}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Proveedor</Label>
                    <Input
                      type="select"
                      value={filterSupplier}
                      onChange={(e) => setFilterSupplier(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id.toString()}>
                          {supplier.name}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Unidad de Medida</Label>
                    <Input
                      type="select"
                      value={filterUom}
                      onChange={(e) => setFilterUom(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      {uoms.map((uom) => (
                        <option key={uom.id} value={uom.id.toString()}>
                          {uom.name} ({uom.code})
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
              </Row>
              {(filterStatus !== "all" || filterColor !== "all" || filterSupplier !== "all" || filterUom !== "all") && (
                <Row className="mb-2">
                  <Col>
                    <Button
                      color="secondary"
                      size="sm"
                      onClick={() => {
                        setFilterStatus("all");
                        setFilterColor("all");
                        setFilterSupplier("all");
                        setFilterUom("all");
                      }}
                    >
                      <i className="fa fa-times" /> Limpiar Filtros
                    </Button>
                    <Badge color="info" className="ml-2">
                      {filteredMaterials.length} resultado(s)
                    </Badge>
                  </Col>
                </Row>
              )}
              {error && <Alert color="danger">{error}</Alert>}
              {loading ? (
                <div className="text-center"><p>Cargando materiales...</p></div>
              ) : filteredMaterials.length === 0 ? (
                <div className="text-center">
                  <p>{materials.length === 0 ? "No hay materiales registrados." : "No se encontraron materiales que coincidan con la búsqueda."}</p>
                </div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Imagen</th>
                      <th onClick={() => handleSort("id")} style={{ cursor: "pointer" }}>
                        ID {getSortIcon("id")}
                      </th>
                      <th>SKU</th>
                      <th>Nombre</th>
                      <th>Color</th>
                      <th onClick={() => handleSort("supplier")} style={{ cursor: "pointer" }}>
                        Proveedor {getSortIcon("supplier")}
                      </th>
                      <th>Precio de Compra</th>
                      <th>Cantidad</th>
                      <th onClick={() => handleSort("uom")} style={{ cursor: "pointer" }}>
                        UOM {getSortIcon("uom")}
                      </th>
                      <th>Costo Unitario</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMaterials.map((material) => {
                      const unitCost = material.cost || calculateUnitCost(material.purchasePrice, material.quantity);
                      const uomCode = getUomCode(material.uomId);

                      return (
                        <tr key={material.id}>
                          <td>
                            {material.imageUrl ? (
                              <img
                                src={material.imageUrl}
                                alt="img"
                                style={{ height: 50, width: 50, objectFit: "cover", borderRadius: 6 }}
                              />
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td>{material.id}</td>
                          <td>
                            <Badge color="info">{material.sku}</Badge>
                          </td>
                          <td>{material.name}</td>
                          <td>{getMaterialColorName(material.materialColorId)}</td>
                          <td>{getSupplierName(material.supplierId)}</td>
                          <td>
                            {material.purchasePrice ? (
                              <strong>Q {parseFloat(material.purchasePrice).toFixed(2)}</strong>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td>
                            {material.quantity ? (
                              <>
                                <strong>{parseFloat(material.quantity).toFixed(2)}</strong>

                              </>
                            ) : (
                              <span className="text-muted">-</span>
                            )}
                          </td>
                          <td>{getUomName(material.uomId)}</td>
                          <td>
                            {unitCost ? (
                              <strong className="text-success">Q {unitCost.toFixed(2)}</strong>
                            ) : (
                              <span className="text-muted">-</span>
                            )}

                          </td>
                          <td className="text-right">
                            <Button
                              onClick={() => handleViewDetails(material.id)}
                              color="info"
                              size="sm"
                              className="btn-icon btn-link mr-1"
                              title="Ver Detalles"
                            >
                              <i className="fa fa-eye" />
                            </Button>
                            <Button
                              onClick={() => handleEdit(material.id)}
                              color="warning"
                              size="sm"
                              className="btn-icon btn-link edit mr-1"
                              title="Editar"
                            >
                              <i className="fa fa-edit" />
                            </Button>
                            <Button
                              onClick={() => handleDelete(material.id)}
                              color="danger"
                              size="sm"
                              className="btn-icon btn-link remove"
                              title="Eliminar"
                            >
                              <i className="fa fa-times" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
      <MaterialsForm
        materialId={selectedMaterialId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedMaterialId(null);
        }}
        onSuccess={handleFormSuccess}
      />
      
      {/* Modal de Detalles del Material */}
      <Modal isOpen={showDetailsModal} toggle={() => setShowDetailsModal(false)} size="lg">
        <ModalHeader toggle={() => setShowDetailsModal(false)}>
          Detalles del Material
        </ModalHeader>
        <ModalBody>
          {loadingDetails ? (
            <div className="text-center">
              <p>Cargando detalles...</p>
            </div>
          ) : selectedMaterialDetails ? (
            <div>
              <Row className="mb-3">
                <Col md="12">
                  <h5 className="text-primary">
                    {selectedMaterialDetails.sku} - {selectedMaterialDetails.name}
                  </h5>
                </Col>
              </Row>
              
              {/* Información General */}
              <Row className="mb-3">
                <Col md="12">
                  <Card>
                    <CardHeader>
                      <h6 className="mb-0">Información General</h6>
                    </CardHeader>
                    <CardBody>
                      <Row>
                        <Col md="6">
                          <p><strong>ID:</strong> {selectedMaterialDetails.id}</p>
                          <p><strong>SKU:</strong> <Badge color="info">{selectedMaterialDetails.sku}</Badge></p>
                          <p><strong>Nombre:</strong> {selectedMaterialDetails.name}</p>
                          <p><strong>Estado:</strong> {selectedMaterialDetails.status === 'active' ? 
                            <Badge color="success">Activo</Badge> : 
                            <Badge color="secondary">Inactivo</Badge>}
                          </p>
                        </Col>
                        <Col md="6">
                          <p><strong>Color:</strong> {getMaterialColorName(selectedMaterialDetails.materialColorId) || '-'}</p>
                          <p><strong>Días de Entrega:</strong> {selectedMaterialDetails.deliveryDays || '-'}</p>
                          <p><strong>Stock Mínimo:</strong> {selectedMaterialDetails.min || '-'}</p>
                          <p><strong>Stock Máximo:</strong> {selectedMaterialDetails.max || '-'}</p>
                        </Col>
                      </Row>
                      {selectedMaterialDetails.description && (
                        <Row>
                          <Col md="12">
                            <p><strong>Descripción:</strong> {selectedMaterialDetails.description}</p>
                          </Col>
                        </Row>
                      )}
                    </CardBody>
                  </Card>
                </Col>
              </Row>

              {/* Información de Proveedor y Costos */}
              <Row className="mb-3">
                <Col md="12">
                  <Card>
                    <CardHeader>
                      <h6 className="mb-0">Información de Proveedor y Costos</h6>
                    </CardHeader>
                    <CardBody>
                      <Row>
                        <Col md="6">
                          <p><strong>Proveedor:</strong> 
                            {selectedMaterialDetails.supplierName ? (
                              <Badge color="primary" className="ml-2">{selectedMaterialDetails.supplierName}</Badge>
                            ) : (
                              <span className="text-muted ml-2">No asignado</span>
                            )}
                          </p>
                          {selectedMaterialDetails.supplierId && (
                            <p><strong>ID Proveedor:</strong> {selectedMaterialDetails.supplierId}</p>
                          )}
                        </Col>
                        <Col md="6">
                          {selectedMaterialDetails.deliveryDays && (
                            <p><strong>Tiempo de Entrega:</strong> {selectedMaterialDetails.deliveryDays} días</p>
                          )}
                        </Col>
                      </Row>
                      
                      {/* Información de Compra */}
                      <hr />
                      <h6 className="text-info">Información de Compra</h6>
                      <Row>
                        <Col md="6">
                          <p><strong>Unidad de Compra:</strong> 
                            {selectedMaterialDetails.purchaseUomName ? (
                              <span className="ml-2">
                                {selectedMaterialDetails.purchaseUomName} 
                                {selectedMaterialDetails.purchaseUomCode && ` (${selectedMaterialDetails.purchaseUomCode})`}
                              </span>
                            ) : (
                              <span className="text-muted ml-2">-</span>
                            )}
                          </p>
                          <p><strong>Precio de Compra:</strong> 
                            {selectedMaterialDetails.purchasePrice ? (
                              <strong className="text-success ml-2">
                                Q {parseFloat(selectedMaterialDetails.purchasePrice).toFixed(2)}
                              </strong>
                            ) : (
                              <span className="text-muted ml-2">-</span>
                            )}
                          </p>
                          <p><strong>Cantidad por Unidad de Compra:</strong> 
                            {selectedMaterialDetails.purchaseQuantity ? (
                              <span className="ml-2">
                                {parseFloat(selectedMaterialDetails.purchaseQuantity).toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-muted ml-2">-</span>
                            )}
                          </p>
                        </Col>
                        <Col md="6">
                          <p><strong>Unidad de Manufactura:</strong> 
                            {selectedMaterialDetails.manufacturingUomName ? (
                              <span className="ml-2">
                                {selectedMaterialDetails.manufacturingUomName}
                                {selectedMaterialDetails.manufacturingUomCode && ` (${selectedMaterialDetails.manufacturingUomCode})`}
                              </span>
                            ) : (
                              <span className="text-muted ml-2">-</span>
                            )}
                          </p>
                          <p><strong>Costo Unitario:</strong> 
                            {selectedMaterialDetails.unitCost ? (
                              <strong className="text-success ml-2">
                                Q {parseFloat(selectedMaterialDetails.unitCost).toFixed(4)}
                              </strong>
                            ) : (
                              <span className="text-muted ml-2">-</span>
                            )}
                          </p>
                          {selectedMaterialDetails.conversionText && (
                            <p><strong>Conversión:</strong> 
                              <Badge color="info" className="ml-2">{selectedMaterialDetails.conversionText}</Badge>
                            </p>
                          )}
                        </Col>
                      </Row>
                      
                      {selectedMaterialDetails.priceBreakdown && (
                        <Row className="mt-2">
                          <Col md="12">
                            <div className="alert alert-info mb-0">
                              <strong>Desglose de Precio:</strong> {selectedMaterialDetails.priceBreakdown}
                            </div>
                          </Col>
                        </Row>
                      )}
                      
                      {/* Información para Compras y Contabilidad */}
                      <hr />
                      <h6 className="text-warning">Información para Compras y Contabilidad</h6>
                      <Row>
                        <Col md="12">
                          <Table size="sm" bordered>
                            <thead>
                              <tr>
                                <th>Concepto</th>
                                <th className="text-right">Valor</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td>Precio por Unidad de Compra</td>
                                <td className="text-right">
                                  {selectedMaterialDetails.purchasePrice ? (
                                    <strong>Q {parseFloat(selectedMaterialDetails.purchasePrice).toFixed(2)}</strong>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                              </tr>
                              <tr>
                                <td>Costo por Unidad de Manufactura</td>
                                <td className="text-right">
                                  {selectedMaterialDetails.unitCost ? (
                                    <strong className="text-success">Q {parseFloat(selectedMaterialDetails.unitCost).toFixed(4)}</strong>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                              </tr>
                              {selectedMaterialDetails.purchaseQuantity && selectedMaterialDetails.purchasePrice && (
                                <tr>
                                  <td>Cantidad en Unidad de Compra</td>
                                  <td className="text-right">
                                    <strong>{parseFloat(selectedMaterialDetails.purchaseQuantity).toFixed(2)}</strong>
                                  </td>
                                </tr>
                              )}
                              {selectedMaterialDetails.lossPercentage && (
                                <tr>
                                  <td>Porcentaje de Pérdida</td>
                                  <td className="text-right">
                                    <strong>{parseFloat(selectedMaterialDetails.lossPercentage).toFixed(2)}%</strong>
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </Table>
                        </Col>
                      </Row>
                    </CardBody>
                  </Card>
                </Col>
              </Row>
            </div>
          ) : (
            <div className="text-center">
              <p>No se pudo cargar la información del material</p>
            </div>
          )}
        </ModalBody>
      </Modal>
    </div>
  );
}

export default MaterialsList;

