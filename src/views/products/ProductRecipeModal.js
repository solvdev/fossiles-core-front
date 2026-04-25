import React, { useState, useEffect } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Table,
  Alert,
  Row,
  Col,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Badge,
  Input,
  Label,
} from "reactstrap";
import { getProductById, updateProduct } from "services/productService";
import { getBomsByProductId } from "services/bomService";
import { getMaterials } from "services/materialService";
import { getUoms } from "services/uomService";
import { getProductCategories } from "services/productCategoryService";
import { getCurrentManufacturingCosts } from "services/systemConfigService";
import { isProductLeatherOnly } from "utils/materialRequirementHelper";

/** Debe coincidir con PurchaseReportService.LEATHER_COST_PER_SQFT */
const LEATHER_COST_PER_SQFT = 7.75;

/** Subtotal materiales (excluye cuero primario); misma lógica que PurchaseReportService. Retorna -1 si no hay ítems. */
function bomMaterialsSubtotalForReport(bom, materialsList) {
  if (!bom?.items?.length) return -1;
  let sub = 0;
  for (const item of bom.items) {
    const material = materialsList.find((m) => Number(m.id) === Number(item.materialId));
    if (material?.isPrimaryLeather) continue;
    const unitCostRaw = material?.unitCost != null ? parseFloat(material.unitCost) : NaN;
    const costRaw = material?.cost != null ? parseFloat(material.cost) : NaN;
    const unit =
      Number.isFinite(unitCostRaw) && unitCostRaw > 0
        ? unitCostRaw
        : (Number.isFinite(costRaw) && costRaw > 0 ? costRaw : 0);
    const quantity = parseFloat(item.quantity) || 0;
    const measurementRaw =
      item.measurement != null && `${item.measurement}`.trim() !== ""
        ? parseFloat(item.measurement)
        : 1;
    const measurement =
      Number.isFinite(measurementRaw) && measurementRaw > 0 ? measurementRaw : 1;
    if (unit <= 0 || quantity <= 0) continue;
    let line = quantity * unit;
    if (measurement !== 1) line *= measurement;
    sub += line;
  }
  return sub;
}

/** Activas si existen; si no, todas. Elige la BOM con mayor costo en materiales; empate → mayor id. */
function pickBomAlignedWithCostReport(bomList, materialsList) {
  if (!bomList?.length) return null;
  const actives = bomList.filter((b) => b.status === "A");
  const pool = actives.length ? actives : bomList;
  let best = null;
  let bestSub = null;
  for (const b of pool) {
    const sub = bomMaterialsSubtotalForReport(b, materialsList);
    if (sub < 0) continue;
    if (
      best == null ||
      sub > bestSub ||
      (sub === bestSub && Number(b.id) > Number(best.id))
    ) {
      best = b;
      bestSub = sub;
    }
  }
  if (best) return best;
  return pool.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
}

function ProductRecipeModal({ productId, productName, isOpen, toggle }) {
  const [product, setProduct] = useState(null);
  const [boms, setBoms] = useState([]);
  const [selectedBom, setSelectedBom] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [costoHoraCinchos, setCostoHoraCinchos] = useState(0);
  const [costoHoraMesas, setCostoHoraMesas] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editableSalePrice, setEditableSalePrice] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [leatherOnly, setLeatherOnly] = useState(false);

  useEffect(() => {
    if (isOpen && productId) {
      loadProductDetails();
      loadBoms();
      loadMaterials();
      loadUoms();
      loadCategories();
      loadManufacturingConfig();
    }
  }, [isOpen, productId]);

  // Recargar costos cuando cambian las categorías (por si se actualiza la configuración)
  useEffect(() => {
    if (isOpen && categories.length > 0) {
      loadManufacturingConfig();
    }
  }, [categories.length]);

  useEffect(() => {
    setSelectedBom(null);
  }, [productId]);

  useEffect(() => {
    if (!productId || boms.length === 0 || materials.length === 0) return;
    if (!boms.every((b) => Number(b.productId) === Number(productId))) return;
    setSelectedBom((prev) => {
      if (prev && boms.some((b) => Number(b.id) === Number(prev.id))) return prev;
      return pickBomAlignedWithCostReport(boms, materials);
    });
  }, [boms, materials, productId]);

  const loadProductDetails = async () => {
    try {
      setLoading(true);
      setError("");
      const productData = await getProductById(productId);
      setProduct(productData);
      setEditableSalePrice(productData?.salePrice ? productData.salePrice.toString() : "");
      setLeatherOnly(isProductLeatherOnly(productData));
    } catch (err) {
      setError(err.message || "Error al cargar los detalles del producto");
    } finally {
      setLoading(false);
    }
  };

  const loadBoms = async () => {
    try {
      const data = await getBomsByProductId(productId);
      setBoms(data || []);
    } catch (err) {
      console.error("Error al cargar BOMs:", err);
      setBoms([]);
    }
  };

  const loadMaterials = async () => {
    try {
      const data = await getMaterials();
      setMaterials(data || []);
    } catch (err) {
      console.error("Error al cargar materiales:", err);
      setMaterials([]);
    }
  };

  const loadUoms = async () => {
    try {
      const data = await getUoms();
      setUoms(data || []);
    } catch (err) {
      console.error("Error al cargar UOMs:", err);
      setUoms([]);
    }
  };

  const loadCategories = async () => {
    try {
      const data = await getProductCategories();
      setCategories(data || []);
    } catch (err) {
      console.error("Error al cargar categorías:", err);
      setCategories([]);
    }
  };

  const loadManufacturingConfig = async () => {
    try {
      const costs = await getCurrentManufacturingCosts();
      console.log("Costos cargados del backend:", costs);
      setCostoHoraCinchos(costs.costoHoraCinchos || 0);
      setCostoHoraMesas(costs.costoHoraMesas || 0);
      
      // Log para debugging
      if ((costs.costoHoraCinchos === 0 || !costs.costoHoraCinchos) && (costs.costoHoraMesas === 0 || !costs.costoHoraMesas)) {
        console.warn("Los costos de manufactura están en 0. Verifique la configuración en SystemSettings.");
      }
    } catch (err) {
      console.error("Error al cargar costos de manufactura:", err);
      setCostoHoraCinchos(0);
      setCostoHoraMesas(0);
    }
  };

  const getManufacturingCostInfo = () => {
    if (!product?.prdTime) {
      return {
        hourlyCost: 0,
        totalCost: 0,
        time: 0,
        source: "N/A",
        usingCategory: false
      };
    }

    // Buscar si la categoría tiene costo específico
    const category = categories.find(cat => cat.id === product.categoryId);
    const isCinchos = category?.code?.toUpperCase?.() === "FOSS";

    let hourlyCost = 0;
    let source = "N/A";
    let usingCategory = false;

    if (category && isCinchos) {
      // Producto FOSS (cinchos): usar costo de cinchos del backend
      // Prioridad 1: Si la categoría tiene planilla, minutos y mesas configuradas, usar esa
      const categoryPayroll = category.payrollTotal ? parseFloat(category.payrollTotal) : null;
      const categoryMinutes = category.availableHours ? parseFloat(category.availableHours) : null; // Nota: contiene minutos
      const categoryTables = category.numberOfTables ? parseInt(category.numberOfTables, 10) : null;

      if (categoryPayroll && categoryPayroll > 0 && categoryMinutes && categoryMinutes > 0 && categoryTables && categoryTables > 0) {
        // Costo por minuto por mesa = Planilla ÷ (Minutos × Número de Mesas)
        const minuteCostPerTable = categoryPayroll / (categoryMinutes * categoryTables);
        // Costo por hora por mesa = Costo por minuto × 60
        hourlyCost = minuteCostPerTable * 60;
        source = `${category.name} (Planilla: Q${categoryPayroll.toFixed(2)} ÷ (${categoryMinutes.toFixed(0)} min × ${categoryTables} mesas) × 60)`;
        usingCategory = true;
      }
      // Prioridad 2: Si tiene costo manual, usar ese
      else if (category.hourlyCost && parseFloat(category.hourlyCost) > 0) {
        hourlyCost = parseFloat(category.hourlyCost);
        source = `${category.name} (Costo Manual)`;
        usingCategory = true;
      }
      // Prioridad 3: Usar costo de cinchos del backend
      else {
        hourlyCost = costoHoraCinchos || 0;
        source = costoHoraCinchos > 0 
          ? `Costo Cinchos (Configuración del sistema)` 
          : `Costo Cinchos (No configurado - Configure en Configuración del Sistema)`;
      }
    } else {
      // Producto NO FOSS: usar costo de mesas del backend
      hourlyCost = costoHoraMesas || 0;
      source = costoHoraMesas > 0
        ? (category ? `Costo Mesas (${category.name} - Configuración del sistema)` : "Costo Mesas (Configuración del sistema)")
        : (category ? `Costo Mesas (${category.name} - No configurado)` : "Costo Mesas (No configurado - Configure en Configuración del Sistema)");
    }

    // Costo total = Tiempo del producto × Costo por hora
    const totalCost = product.prdTime * hourlyCost;

    return {
      hourlyCost: hourlyCost,
      totalCost,
      time: product.prdTime,
      source,
      usingCategory,
      categoryName: category?.name || "Sin categoría"
    };
  };

  const getManufacturingCost = () => {
    return getManufacturingCostInfo().totalCost;
  };

  const getMaterialName = (materialId) => {
    if (!materialId) return "-";
    const material = materials.find((m) => m.id === materialId);
    if (!material) return `ID: ${materialId}`;
    const sku = material.sku || "";
    const name = material.name || "";
    if (sku && name) {
      return `${sku} - ${name}`;
    } else if (name) {
      return name;
    } else if (sku) {
      return sku;
    }
    return `ID: ${materialId}`;
  };

  const getUomName = (uomId) => {
    if (!uomId) return "-";
    const uom = uoms.find((u) => u.id === uomId);
    return uom ? uom.name || uom.code || `ID: ${uomId}` : `ID: ${uomId}`;
  };

  const recipeItems = selectedBom?.items?.map(item => {
    const material = materials.find((m) => m.id === item.materialId);
    const uomId = material?.uomId;
    const isUnitType = uomId === 3;
    const skipForLeatherSqFt = Boolean(material?.isPrimaryLeather);

    const unitCostRaw = material?.unitCost != null ? parseFloat(material.unitCost) : NaN;
    const costRaw = material?.cost != null ? parseFloat(material.cost) : NaN;
    const materialCost =
      Number.isFinite(unitCostRaw) && unitCostRaw > 0
        ? unitCostRaw
        : (Number.isFinite(costRaw) && costRaw > 0 ? costRaw : 0);

    const quantity = parseFloat(item.quantity) || 0;
    const measurementRaw =
      item.measurement != null && `${item.measurement}`.trim() !== ""
        ? parseFloat(item.measurement)
        : 1;
    const measurement =
      Number.isFinite(measurementRaw) && measurementRaw > 0 ? measurementRaw : 1;

    let itemTotalCost = 0;
    if (!skipForLeatherSqFt && materialCost > 0 && quantity > 0) {
      itemTotalCost = quantity * materialCost;
      if (measurement !== 1) {
        itemTotalCost *= measurement;
      }
    }

    return {
      materialId: item.materialId,
      materialName: getMaterialName(item.materialId),
      materialSku: material?.sku || "-",
      quantity: quantity,
      measurement: item.measurement != null && `${item.measurement}`.trim() !== "" ? parseFloat(item.measurement) : null,
      measurementUnit: item.measurementUnit || "",
      isUnitType: isUnitType,
      materialCost: materialCost,
      totalCost: itemTotalCost,
      skipForLeatherSqFt,
      uom: getUomName(uomId),
      uomCode: uoms.find(u => u.id === uomId)?.code || "",
      description: material?.description || ""
    };
  }) || [];

  const calculateMaterialCost = () => {
    return recipeItems.reduce((total, item) => {
      return total + (item.totalCost || 0);
    }, 0);
  };

  const materialCost = calculateMaterialCost();
  const manufacturingCostInfo = getManufacturingCostInfo();
  const manufacturingCost = manufacturingCostInfo.totalCost;
  const leatherSqFtRaw =
    product?.leatherConsumption != null && `${product.leatherConsumption}`.trim() !== ""
      ? parseFloat(product.leatherConsumption)
      : 0;
  const leatherSqFt = Number.isFinite(leatherSqFtRaw) ? Math.max(0, leatherSqFtRaw) : 0;
  const leatherCost = leatherSqFt * LEATHER_COST_PER_SQFT;
  const totalProductionCost = materialCost + leatherCost + manufacturingCost;
  // Usar precio editable si está siendo editado, sino usar precio del producto, sino usar costo total como referencia
  const currentSalePrice = editableSalePrice && editableSalePrice !== ""
    ? parseFloat(editableSalePrice)
    : (product?.salePrice ? parseFloat(product.salePrice) : totalProductionCost);
  const salePrice = currentSalePrice;
  const profit = salePrice - totalProductionCost;
  const profitMarginActual = totalProductionCost > 0 ? (profit / totalProductionCost * 100) : 0;

  const handleSavePrice = async () => {
    if (!productId) return;

    try {
      setSavingPrice(true);
      setError("");
      const priceValue = editableSalePrice ? parseFloat(editableSalePrice) : null;

      const updateData = {
        code: product.code,
        name: product.name,
        categoryId: product.categoryId,
        prdTime: product.prdTime,
        salePrice: priceValue,
        requiresMaterials: product.requiresMaterials ?? true,
        status: product.status,
      };

      const updatedProduct = await updateProduct(productId, updateData);
      setProduct(updatedProduct);
      setEditableSalePrice(updatedProduct?.salePrice ? updatedProduct.salePrice.toString() : "");
    } catch (err) {
      setError(err.message || "Error al guardar el precio");
    } finally {
      setSavingPrice(false);
    }
  };

  const handleLeatherOnlyToggle = async (checked) => {
    if (!product) return;
    try {
      setSavingPrice(true);
      setError("");
      const updateData = {
        code: product.code,
        name: product.name,
        categoryId: product.categoryId,
        prdTime: product.prdTime,
        salePrice: product.salePrice,
        discountedPrice: product.discountedPrice,
        imageUrl: product.imageUrl,
        leatherConsumption: product.leatherConsumption,
        requiresMaterials: !checked,
        status: product.status,
      };
      const updatedProduct = await updateProduct(productId, updateData);
      setProduct(updatedProduct);
      setLeatherOnly(isProductLeatherOnly(updatedProduct));
    } catch (err) {
      setError(err.message || "Error al guardar indicador solo cuero");
    } finally {
      setSavingPrice(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>
        Detalles del Producto: {productName || product?.name || "Producto"}
      </ModalHeader>
      <ModalBody>
        {loading ? (
          <div className="text-center"><p>Cargando detalles...</p></div>
        ) : error ? (
          <Alert color="danger">{error}</Alert>
        ) : (
          <>
            {product?.imageUrl && (
              <div className="text-center mb-3">
                <img
                  src={product.imageUrl}
                  alt="Producto"
                  style={{ maxHeight: 220, maxWidth: "100%", objectFit: "contain", borderRadius: 8 }}
                />
              </div>
            )}
            {/* Información General del Producto */}
            <Row className="mb-3">
              <Col md="12">
                <Card>
                  <CardBody>
                    <Row className="align-items-center">
                      <Col md="8">
                        <h4 className="mb-2">{product?.name || "Producto"}</h4>
                        <Row>
                          <Col md="4">
                            <small className="text-muted">Código:</small>
                            <p className="mb-1"><strong>{product?.code || "-"}</strong></p>
                          </Col>
                          <Col md="3">
                            <small className="text-muted">Tiempo de Producción:</small>
                            <p className="mb-1"><strong>{product?.prdTime || 0} horas</strong></p>
                          </Col>
                          <Col md="3">
                            <small className="text-muted">Consumo Cuero:</small>
                            <p className="mb-1"><strong>{product?.leatherConsumption ? `${product.leatherConsumption} ft²` : "—"}</strong></p>
                          </Col>
                          <Col md="2">
                            <small className="text-muted">Estado:</small>
                            <p className="mb-1">
                              {product?.status === "A" ? (
                                <Badge color="success">Activo</Badge>
                              ) : (
                                <Badge color="secondary">Inactivo</Badge>
                              )}
                            </p>
                          </Col>
                        </Row>
                      </Col>
                    </Row>
                  </CardBody>
                </Card>
              </Col>
            </Row>

            {/* Receta / BOM */}
            <Row className="mb-4">
              <Col md="12">
                <Card>
                  <CardHeader>
                    <CardTitle tag="h5" className="mb-0">Receta (BOM) - Lista de Materiales</CardTitle>
                  </CardHeader>
                  <CardBody>
                    {boms.length > 0 && (
                      <Row className="mb-3">
                        <Col md="6">
                          <Label>Seleccionar BOM</Label>
                          <Input
                            type="select"
                            value={selectedBom?.id || ""}
                            onChange={(e) => {
                              const bom = boms.find(b => b.id === parseInt(e.target.value));
                              setSelectedBom(bom);
                            }}
                          >
                            {boms.map((bom) => (
                              <option key={bom.id} value={bom.id}>
                                {bom.bomName || `BOM #${bom.id}`} {bom.status === "A" ? "(Activa)" : ""}
                              </option>
                            ))}
                          </Input>
                        </Col>
                        {selectedBom && (
                          <Col md="6">
                            <Label>Estado BOM</Label>
                            <div className="mt-2">
                              {selectedBom.status === "A" ? (
                                <Badge color="success">Activa</Badge>
                              ) : (
                                <Badge color="secondary">Inactiva</Badge>
                              )}
                            </div>
                          </Col>
                        )}
                      </Row>
                    )}
                    {recipeItems.length === 0 ? (
                      <Alert color="info">
                        <p className="mb-0">
                          {boms.length === 0
                            ? "No hay BOMs registradas para este producto."
                            : "No hay materiales registrados en la BOM seleccionada."}
                        </p>
                      </Alert>
                    ) : (
                      <Table responsive>
                        <thead className="text-primary">
                          <tr>
                            <th>Material</th>
                            <th>SKU</th>
                            <th>Medida</th>
                            <th>Cantidad</th>
                            <th>Costo Unit.</th>
                            <th>Costo Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recipeItems.map((item, index) => (
                            <tr key={index}>
                              <td>{item.materialName}</td>
                              <td>{item.materialSku}</td>
                              <td>
                                {!item.isUnitType && item.measurement ? (
                                  <span className="badge badge-info">
                                    {item.measurement.toFixed(3)} {item.measurementUnit}
                                  </span>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td>
                                <strong>{item.quantity.toFixed(0)}</strong>
                                {item.isUnitType && item.uomCode && (
                                  <span className="text-muted ml-1">({item.uomCode})</span>
                                )}
                                {!item.isUnitType && (
                                  <span className="text-muted ml-1">(piezas)</span>
                                )}
                              </td>
                              <td>
                                {item.materialCost ? (
                                  <>
                                    <span className="text-info">Q {item.materialCost.toFixed(2)}</span>
                                    <span className="text-muted small d-block">por {item.uomCode}</span>
                                  </>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td>
                                {item.skipForLeatherSqFt ? (
                                  <span className="text-muted small">Incluido en cuero (ft²)</span>
                                ) : item.totalCost ? (
                                  <strong className="text-success">Q {item.totalCost.toFixed(2)}</strong>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                          <tr className="table-info">
                            <td colSpan="5" className="text-right"><strong>Total Costo Materiales:</strong></td>
                            <td><strong>Q {materialCost.toFixed(2)}</strong></td>
                          </tr>
                        </tbody>
                      </Table>
                    )}
                    <hr />
                    <Row className="align-items-center">
                      <Col md="8">
                        <Label check style={{ cursor: "pointer", marginBottom: 0 }}>
                          <Input
                            type="checkbox"
                            checked={leatherOnly}
                            onChange={(e) => handleLeatherOnlyToggle(e.target.checked)}
                          />
                          {" "}
                          <strong>Este producto es solo cuero (omitir entrega de materiales)</strong>
                        </Label>
                        <small className="d-block text-muted mt-1">
                          Si está activo, las tareas de producción de este producto avanzan sin pasar por la fase de Materiales.
                        </small>
                      </Col>
                      <Col md="4" className="text-right">
                        {leatherOnly ? (
                          <Badge color="warning">Solo cuero activo</Badge>
                        ) : (
                          <Badge color="secondary">Usa materiales</Badge>
                        )}
                      </Col>
                    </Row>
                  </CardBody>
                </Card>
              </Col>
            </Row>

            {/* Resumen de Costos */}
            <Row className="mb-4">
              <Col md="12">
                <Card>
                  <CardHeader>
                    <CardTitle tag="h5" className="mb-0">Resumen de Costos</CardTitle>
                  </CardHeader>
                  <CardBody>
                    {/* Costos */}
                    <Row className="mb-3">
                      <Col md="12">
                        <h6 className="text-muted mb-3">Costos de Producción</h6>
                      </Col>
                      <Col md="6" lg="3" className="mb-3 mb-lg-0">
                        <div className="d-flex align-items-start">
                          <div className="me-3 mt-1">
                            <i className="nc-icon nc-box text-warning" style={{ fontSize: '24px' }} />
                          </div>
                          <div>
                            <small className="text-muted d-block mb-1">Materiales (receta)</small>
                            <h5 className="mb-0">Q {materialCost.toFixed(2)}</h5>
                          </div>
                        </div>
                      </Col>
                      <Col md="6" lg="3" className="mb-3 mb-lg-0">
                        <div className="d-flex align-items-start">
                          <div className="me-3 mt-1">
                            <i className="nc-icon nc-ruler-pencil text-secondary" style={{ fontSize: '24px' }} />
                          </div>
                          <div>
                            <small className="text-muted d-block mb-1">Cuero</small>
                            <h5 className="mb-0">Q {leatherCost.toFixed(2)}</h5>
                            {leatherSqFt > 0 ? (
                              <small className="text-muted d-block mt-1">
                                {leatherSqFt.toFixed(2)} ft² × Q{LEATHER_COST_PER_SQFT.toFixed(2)}/ft²
                              </small>
                            ) : (
                              <small className="text-muted d-block mt-1">Sin consumo de cuero en el producto</small>
                            )}
                          </div>
                        </div>
                      </Col>
                      <Col md="6" lg="3" className="mb-3 mb-lg-0">
                        <div className="d-flex align-items-start">
                          <div className="me-3 mt-1">
                            <i className="nc-icon nc-settings text-info" style={{ fontSize: '24px' }} />
                          </div>
                          <div>
                            <small className="text-muted d-block mb-1">Manufactura</small>
                            <h5 className="mb-0">Q {manufacturingCost.toFixed(2)}</h5>
                            {manufacturingCostInfo.time > 0 && (
                              <small className="text-muted d-block mt-1">
                                {manufacturingCostInfo.time} hrs × Q{manufacturingCostInfo.hourlyCost.toFixed(2)}/hr
                              </small>
                            )}
                            {manufacturingCostInfo.hourlyCost === 0 && (
                              <small className="text-warning d-block mt-1">
                                ⚠ Configure los costos en Configuración del Sistema
                              </small>
                            )}
                          </div>
                        </div>
                      </Col>
                      <Col md="6" lg="3">
                        <div className="d-flex align-items-start">
                          <div className="me-3 mt-1">
                            <i className="nc-icon nc-money-coins text-success" style={{ fontSize: '24px' }} />
                          </div>
                          <div>
                            <small className="text-muted d-block mb-1">Costo total final</small>
                            <h5 className="mb-0 text-success">Q {totalProductionCost.toFixed(2)}</h5>
                            <small className="text-muted d-block mt-1">
                              Materiales + cuero + manufactura
                            </small>
                          </div>
                        </div>
                      </Col>
                    </Row>

                    <hr />

                    {/* Precio y Utilidad */}
                    <Row>
                      <Col md="6">
                        <h6 className="text-muted mb-3">Precio de Venta</h6>
                        <Row className="align-items-center mb-2">
                          <Col md="8">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editableSalePrice}
                              onChange={(e) => setEditableSalePrice(e.target.value)}
                              placeholder={totalProductionCost > 0 ? `Costo: Q${totalProductionCost.toFixed(2)}` : "Ingrese precio"}
                              disabled={savingPrice || loading}
                              className="mb-2"
                            />
                          </Col>
                          <Col md="4">
                            <Button
                              color="primary"
                              size="sm"
                              onClick={handleSavePrice}
                              disabled={savingPrice || loading}
                              className="w-100"
                            >
                              {savingPrice ? "Guardando..." : "Guardar Precio"}
                            </Button>
                          </Col>
                        </Row>
                        <div className="ps-2">
                          <p className="mb-1">
                            <small className="text-muted">Precio actual: </small>
                            <strong className="text-primary">Q {salePrice.toFixed(2)}</strong>
                          </p>
                          {product?.salePrice ? (
                            <p className="mb-1 text-info small">
                              ✓ Precio establecido
                            </p>
                          ) : (
                            <p className="mb-1 text-warning small">
                              ⚠ No hay precio establecido
                            </p>
                          )}
                          <p className="mb-0">
                            <small className="text-muted">Margen de ganancia: </small>
                            <strong className={profitMarginActual >= 0 ? "text-success" : "text-danger"}>
                              {profitMarginActual.toFixed(1)}%
                            </strong>
                          </p>
                        </div>
                      </Col>
                      <Col md="6">
                        <h6 className="text-muted mb-3">Utilidad</h6>
                        <div className="text-center">
                          <h2 className={profit >= 0 ? "text-success mb-2" : "text-danger mb-2"}>
                            Q {profit.toFixed(2)}
                          </h2>
                          <p className="text-muted small mb-2">Por unidad producida</p>
                          {profit < 0 && (
                            <Alert color="danger" className="py-2 px-3 mb-0">
                              <small>⚠ El precio de venta es menor al costo de producción</small>
                            </Alert>
                          )}
                          {profit >= 0 && profitMarginActual > 0 && (
                            <Alert color="success" className="py-2 px-3 mb-0">
                              <small>✓ Producto rentable</small>
                            </Alert>
                          )}
                        </div>
                      </Col>
                    </Row>
                  </CardBody>
                </Card>
              </Col>
            </Row>

            {/* Detalles de Manufactura */}
            {manufacturingCostInfo.time > 0 && (
              <Row className="mb-4">
                <Col md="12">
                  <Card>
                    <CardHeader>
                      <CardTitle tag="h5" className="mb-0">Detalles de Manufactura</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <Row>
                        <Col md="6">
                          <p className="mb-2">
                            <strong>Categoría:</strong> {manufacturingCostInfo.categoryName}
                          </p>
                          <p className="mb-2">
                            <strong>Tiempo de Producción:</strong> {manufacturingCostInfo.time} horas
                          </p>
                          <p className="mb-2">
                            <strong>Costo por Hora:</strong> Q {manufacturingCostInfo.hourlyCost.toFixed(2)}/hora
                          </p>
                        </Col>
                        <Col md="6">
                          <p className="mb-2">
                            <strong>Fuente de Costo:</strong>
                            <br />
                            <small className="text-muted">{manufacturingCostInfo.source}</small>
                          </p>
                          <p className="mb-0">
                            <strong>Cálculo:</strong>
                            <br />
                            <small className="text-muted">
                              {manufacturingCostInfo.time} hrs × Q{manufacturingCostInfo.hourlyCost.toFixed(2)}/hr = <strong>Q {manufacturingCost.toFixed(2)}</strong>
                            </small>
                          </p>
                        </Col>
                      </Row>
                    </CardBody>
                  </Card>
                </Col>
              </Row>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default ProductRecipeModal;