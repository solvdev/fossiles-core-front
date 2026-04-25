import React, { useState, useEffect } from "react";
import {
  Button,
  Label,
  FormGroup,
  Input,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Table,
  Row,
  Col,
  Badge,
  Card,
  CardHeader,
  CardBody,
} from "reactstrap";
import { getPurchaseOrderById, createPurchaseOrder, cancelPurchaseOrder } from "services/purchaseOrderService";
import { getMaterialRequests } from "services/materialRequestService";
import { getSuppliers } from "services/supplierService";
import { getMaterials } from "services/materialService";
import { getCostCenters } from "services/costCenterService";
import { getAccountingEntriesByDocument } from "services/accountingService";
import { showSuccess, showError } from "utils/notificationHelper";
import { formatNowGt } from "utils/dateTimeHelper";
import * as XLSX from "xlsx";

function PurchaseOrderDetail({ orderId, isOpen, toggle, onSuccess }) {
  const [order, setOrder] = useState(null);
  const [formData, setFormData] = useState({
    supplierId: "",
    orderDate: new Date().toISOString().split("T")[0],
    items: [],
    materialRequestIds: [],
    observations: "",
    costCenterId: "",
  });
  const [suppliers, setSuppliers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [selectedRequestDetails, setSelectedRequestDetails] = useState(null);
  const [itemForm, setItemForm] = useState({
    materialId: "",
    quantity: "",
    unitPrice: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(!orderId);
  const [accountingEntries, setAccountingEntries] = useState([]);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadSuppliers();
      loadMaterials();
      loadApprovedRequests();
      loadCostCenters();
      if (orderId) {
        loadOrder();
        setIsCreating(false);
      } else {
        resetForm();
        setIsCreating(true);
      }
    }
  }, [isOpen, orderId]);

  const handlePrintOrder = (order) => {
    if (!order || !order.items || order.items.length === 0) {
      showError("No hay datos para imprimir");
      return;
    }

    const printContent = generateOrderPrintContent(order);
    
    const printWindow = window.open("", "_blank");
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const generateOrderPrintContent = (order) => {
    const orderDate = order.orderDate
      ? new Date(order.orderDate).toLocaleDateString('es-GT', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : new Date().toLocaleDateString('es-GT');
    
    let itemsHtml = "";
    order.items.forEach((item, idx) => {
      itemsHtml += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">${idx + 1}</td>
          <td style="border: 1px solid #ddd; padding: 8px;"><strong>${item.materialSku || "N/A"}</strong><br/><small>${item.materialName || "N/A"}</small></td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.quantity?.toFixed(3) || "0.000"}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">Q ${item.unitPrice?.toFixed(2) || "0.00"}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">Q ${item.subtotal?.toFixed(2) || "0.00"}</td>
        </tr>
      `;
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Orden de Compra ${order.code}</title>
          <style>
            @media print {
              @page {
                margin: 1cm;
              }
              body {
                margin: 0;
                padding: 20px;
                font-family: Arial, sans-serif;
              }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #333;
              padding-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              color: #333;
            }
            .info-section {
              margin-bottom: 20px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 10px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th {
              background-color: #f5f5f5;
              border: 1px solid #ddd;
              padding: 10px;
              text-align: left;
              font-weight: bold;
            }
            .total-row {
              background-color: #f9f9f9;
              font-weight: bold;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              text-align: center;
              font-size: 0.9em;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Orden de Compra</h1>
            <p style="margin: 5px 0;">Orden ${order.code}</p>
          </div>
          
          <div class="info-section">
            <div class="info-row">
              <span><strong>Proveedor:</strong> ${order.supplierName || "N/A"}</span>
              <span><strong>Fecha:</strong> ${orderDate}</span>
            </div>
            <div class="info-row">
              <span><strong>Estado:</strong> ${order.status || "N/A"}</span>
              <span><strong>Total:</strong> Q ${order.total?.toFixed(2) || "0.00"}</span>
            </div>
            ${order.observations ? `<div class="info-row"><span><strong>Observaciones:</strong> ${order.observations}</span></div>` : ""}
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 50%;">Material</th>
                <th style="width: 15%; text-align: center;">Cantidad</th>
                <th style="width: 15%; text-align: right;">Precio Unit.</th>
                <th style="width: 15%; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="4" style="text-align: right; padding: 10px; border: 1px solid #ddd;"><strong>TOTAL:</strong></td>
                <td style="text-align: right; padding: 10px; border: 1px solid #ddd; font-size: 1.2em; color: #28a745;"><strong>Q ${order.total?.toFixed(2) || "0.00"}</strong></td>
              </tr>
            </tfoot>
          </table>

          <div class="footer">
            <p>Documento generado el ${formatNowGt()}</p>
          </div>
        </body>
      </html>
    `;
  };

  const handleDownloadOrderExcel = (order) => {
    if (!order || !order.items || order.items.length === 0) {
      showError("No hay datos para exportar");
      return;
    }

    try {
      const excelData = order.items.map((item, idx) => ({
        "#": idx + 1,
        "SKU": item.materialSku || "N/A",
        "Material": item.materialName || "N/A",
        "Cantidad": item.quantity || 0,
        "Precio Unitario": item.unitPrice || 0,
        "Subtotal": item.subtotal || 0
      }));

      excelData.push({
        "#": "",
        "SKU": "",
        "Material": "",
        "Cantidad": "",
        "Precio Unitario": "TOTAL:",
        "Subtotal": order.total || 0
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Orden");

      worksheet['!cols'] = [
        { wch: 5 },
        { wch: 15 },
        { wch: 30 },
        { wch: 12 },
        { wch: 15 },
        { wch: 12 }
      ];

      XLSX.writeFile(workbook, `Orden_${order.code}_${new Date().toISOString().split('T')[0]}.xlsx`);
      showSuccess("Archivo Excel descargado correctamente");
    } catch (err) {
      console.error("Error al exportar a Excel:", err);
      showError("Error al exportar a Excel: " + err.message);
    }
  };

  const loadOrder = async () => {
    try {
      setLoading(true);
      const data = await getPurchaseOrderById(orderId);
      setOrder(data);
      
      // Cargar asientos contables
      if (data?.id) {
        try {
          const entries = await getAccountingEntriesByDocument("PURCHASE_ORDER", data.id);
          setAccountingEntries(entries || []);
        } catch (err) {
          console.error("Error al cargar asientos contables:", err);
        }
      }
    } catch (err) {
      setError(err.message || "Error al cargar la orden de compra");
    } finally {
      setLoading(false);
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

  const loadMaterials = async () => {
    try {
      const data = await getMaterials();
      setMaterials(data || []);
    } catch (err) {
      console.error("Error al cargar materiales:", err);
    }
  };

  const loadApprovedRequests = async () => {
    try {
      // Cargar todas las solicitudes aprobadas
      const data = await getMaterialRequests("APROBADA");
      // Filtrar solo las que NO están compradas (pendientes de crear orden)
      // El backend marca las solicitudes como "COMPRADA" cuando se crea una orden de compra
      // Por lo tanto, solo mostramos las que tienen status "APROBADA" (aún no compradas)
      const pendingRequests = (data || []).filter(request => 
        request.status === "APROBADA"
      );
      setApprovedRequests(pendingRequests);
    } catch (err) {
      console.error("Error al cargar solicitudes aprobadas:", err);
    }
  };

  const loadCostCenters = async () => {
    try {
      const data = await getCostCenters();
      setCostCenters(data || []);
    } catch (err) {
      console.error("Error al cargar centros de costo:", err);
    }
  };

  const resetForm = () => {
    setFormData({
      supplierId: "",
      orderDate: new Date().toISOString().split("T")[0],
      items: [],
      materialRequestIds: [],
      observations: "",
      costCenterId: "", // Mantener en estado pero no se usa
    });
    setItemForm({
      materialId: "",
      quantity: "",
      unitPrice: "",
    });
    setErrors({});
    setError("");
    setSelectedRequestDetails(null);
  };

  const handleSelectApprovedRequest = (requestId) => {
    if (!requestId) {
      setFormData({ ...formData, materialRequestIds: [], items: [], supplierId: "" });
      setSelectedRequestDetails(null);
      return;
    }

    const request = approvedRequests.find((r) => r.id === parseInt(requestId));
    if (request) {
      setSelectedRequestDetails(request);
      
      if (request.items) {
        // Pre-cargar items desde la solicitud
        const preloadedItems = request.items.map((item) => {
          // Buscar el material para obtener su precio de compra
          const material = materials.find((m) => m.id === item.materialId);
          const purchasePrice = material?.purchasePrice || 0;
          
          // Usar supplierId del item, o si no tiene, usar el del material como fallback
          const supplierIdToUse = item.supplierId || (material?.supplierId || null);
          
          return {
            materialId: item.materialId,
            quantity: parseFloat(item.quantityRequested || 0),
            unitPrice: parseFloat(purchasePrice) || 0, // Precio de compra del material
            supplierId: supplierIdToUse, // Incluir supplierId en el item
          };
        });

        // Determinar el proveedor a pre-seleccionar
        // Si todos los items tienen el mismo proveedor, usar ese
        // Si hay múltiples proveedores, usar el más común o el primero
        const supplierIds = preloadedItems
          .map(item => item.supplierId)
          .filter(id => id != null);
        
        let selectedSupplierId = "";
        if (supplierIds.length > 0) {
          // Contar ocurrencias de cada proveedor
          const supplierCounts = {};
          supplierIds.forEach(id => {
            supplierCounts[id] = (supplierCounts[id] || 0) + 1;
          });
          
          // Si todos son del mismo proveedor, usar ese
          const uniqueSuppliers = Object.keys(supplierCounts);
          if (uniqueSuppliers.length === 1) {
            selectedSupplierId = uniqueSuppliers[0].toString();
          } else {
            // Si hay múltiples proveedores, usar el más común
            const mostCommonSupplier = Object.keys(supplierCounts).reduce((a, b) => 
              supplierCounts[a] > supplierCounts[b] ? a : b
            );
            selectedSupplierId = mostCommonSupplier.toString();
          }
        }

        setFormData({
          ...formData,
          supplierId: selectedSupplierId, // Pre-seleccionar el proveedor
          materialRequestIds: [parseInt(requestId)],
          items: preloadedItems,
        });
      } else {
        setFormData({
          ...formData,
          materialRequestIds: [parseInt(requestId)],
        });
      }
    }
  };

  const handleAddItem = () => {
    if (!itemForm.materialId || !itemForm.quantity || !itemForm.unitPrice) {
      setErrors({
        ...errors,
        itemForm: "Complete todos los campos del item",
      });
      showError("Complete todos los campos del item");
      return;
    }

    const quantity = parseFloat(itemForm.quantity);
    const unitPrice = parseFloat(itemForm.unitPrice);

    if (quantity <= 0) {
      setErrors({
        ...errors,
        itemForm: "La cantidad debe ser mayor a 0",
      });
      showError("La cantidad debe ser mayor a 0");
      return;
    }

    if (unitPrice <= 0) {
      setErrors({
        ...errors,
        itemForm: "El precio unitario debe ser mayor a 0",
      });
      showError("El precio unitario debe ser mayor a 0");
      return;
    }

    // Obtener el supplierId: primero del proveedor seleccionado en el formulario,
    // luego del material como fallback
    const material = materials.find((m) => m.id === parseInt(itemForm.materialId));
    const supplierIdToUse = formData.supplierId 
      ? parseInt(formData.supplierId) 
      : (material?.supplierId || null);

    const newItem = {
      materialId: parseInt(itemForm.materialId),
      quantity: quantity,
      unitPrice: unitPrice,
      supplierId: supplierIdToUse, // Incluir supplierId en el item
    };

    setFormData({
      ...formData,
      items: [...formData.items, newItem],
    });

    setItemForm({
      materialId: "",
      quantity: "",
      unitPrice: "",
    });
    setErrors({ ...errors, itemForm: "" });
  };

  const handleRemoveItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData({ ...formData, items: newItems });
  };

  const validateForm = () => {
    const newErrors = {};

    // Si no viene de una solicitud, el proveedor es requerido
    if (formData.materialRequestIds.length === 0 && !formData.supplierId) {
      newErrors.supplierId = "El proveedor es requerido";
    }

    if (formData.items.length === 0) {
      newErrors.items = "Debe agregar al menos un item";
    }

    formData.items.forEach((item, index) => {
      if (!item.materialId) {
        newErrors[`item_${index}_material`] = "Material requerido";
      }
      if (!item.quantity || item.quantity <= 0) {
        newErrors[`item_${index}_quantity`] = "Cantidad debe ser mayor a 0";
      }
      if (!item.unitPrice || item.unitPrice <= 0) {
        newErrors[`item_${index}_price`] = "Precio debe ser mayor a 0";
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      const firstError = Object.values(errors)[0];
      if (firstError) {
        showError(firstError);
      }
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Asegurar que todos los items tengan supplierId
      // Priorizar el supplierId de cada item individual
      // Si un item no tiene supplierId, intentar obtenerlo del material
      // Solo usar el supplierId de la orden como último recurso
      const itemsWithSupplier = formData.items.map(item => {
        let supplierId = item.supplierId;
        
        // Si el item no tiene supplierId, intentar obtenerlo del material
        if (!supplierId) {
          const material = materials.find((m) => m.id === item.materialId);
          supplierId = material?.supplierId || null;
        }
        
        // Solo usar el supplierId de la orden como último recurso si no hay otro
        if (!supplierId && formData.supplierId) {
          supplierId = parseInt(formData.supplierId);
        }
        
        return {
          ...item,
          supplierId: supplierId,
        };
      });

      // Determinar el supplierId de la orden (para la orden en sí, no para los items)
      // Usar el más común de los items, o el del formulario
      let supplierIdToUse = formData.supplierId;
      if (!supplierIdToUse && itemsWithSupplier.length > 0) {
        const supplierCounts = {};
        itemsWithSupplier.forEach(item => {
          if (item.supplierId) {
            supplierCounts[item.supplierId] = (supplierCounts[item.supplierId] || 0) + 1;
          }
        });
        if (Object.keys(supplierCounts).length > 0) {
          const mostCommonSupplier = Object.keys(supplierCounts).reduce((a, b) => 
            supplierCounts[a] > supplierCounts[b] ? a : b
          );
          supplierIdToUse = mostCommonSupplier;
        }
      }

      const submitData = {
        supplierId: parseInt(supplierIdToUse),
        orderDate: formData.orderDate,
        items: itemsWithSupplier,
        materialRequestIds:
          formData.materialRequestIds.length > 0
            ? formData.materialRequestIds.map((id) => parseInt(id))
            : null,
        observations: formData.observations || null,
        costCenterId: null, // Ya no se usa centro de costo
      };

      await createPurchaseOrder(submitData);
      showSuccess("Orden de compra creada correctamente");
      resetForm();
      onSuccess();
      toggle();
    } catch (err) {
      const errorMessage = err.message || "Error al guardar la orden de compra";
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getTotal = () => {
    if (isCreating) {
      return formData.items.reduce(
        (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
        0
      );
    }
    if (!order || !order.items) return 0;
    return order.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  };

  const handleCancelOrder = async () => {
    // Validación: Solo se pueden cancelar órdenes en estado CREADA
    if (order && order.status !== "CREADA") {
      let message = "";
      if (order.status === "RECIBIDA") {
        message = "No se puede cancelar una orden que ya ha sido recibida. Solo se pueden cancelar órdenes en estado CREADA.";
      } else if (order.status === "CANCELADA") {
        message = "Esta orden ya ha sido cancelada anteriormente.";
      } else {
        message = `No se puede cancelar una orden en estado ${order.status}. Solo se pueden cancelar órdenes en estado CREADA.`;
      }
      showError(message);
      setShowCancelModal(false);
      return;
    }

    if (!cancelReason.trim()) {
      showError("Debe ingresar un motivo de cancelación");
      return;
    }

    try {
      setLoading(true);
      await cancelPurchaseOrder(order.id);
      showSuccess("Orden de compra cancelada correctamente");
      setShowCancelModal(false);
      setCancelReason("");
      onSuccess();
      toggle();
    } catch (err) {
      showError(err.message || "Error al cancelar la orden de compra");
    } finally {
      setLoading(false);
    }
  };

  const getMaterialName = (materialId) => {
    if (!materialId) return "-";
    const material = materials.find((m) => m.id === materialId);
    return material ? `${material.sku} - ${material.name}` : `ID: ${materialId}`;
  };

  if (isCreating) {
    return (
      <Modal isOpen={isOpen} toggle={toggle} size="xl">
        <ModalHeader toggle={toggle}>Nueva Orden de Compra</ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            {error && <Alert color="danger">{error}</Alert>}

            <Row>
              <Col md="6">
                <FormGroup>
                  <Label>Fecha de Orden</Label>
                  <Input
                    type="date"
                    value={formData.orderDate}
                    onChange={(e) =>
                      setFormData({ ...formData, orderDate: e.target.value })
                    }
                    disabled={loading}
                  />
                </FormGroup>
              </Col>
            </Row>
            
            {formData.materialRequestIds.length > 0 && selectedRequestDetails && (
              <Row>
                <Col md="12">
                  <Alert color="info" className="py-2">
                    <i className="fa fa-info-circle mr-2" />
                    <strong>Proveedor:</strong> La solicitud seleccionada ya incluye la información del proveedor para cada material.
                  </Alert>
                </Col>
              </Row>
            )}

            <hr />
            <h5>Solicitud de Materiales (Opcional)</h5>
            <Row>
              <Col md="12">
                <FormGroup>
                  <Label>Seleccionar Solicitud Aprobada</Label>
                  <Input
                    type="select"
                    value={formData.materialRequestIds[0] || ""}
                    onChange={(e) => handleSelectApprovedRequest(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Sin solicitud (Orden manual)</option>
                    {approvedRequests.map((request) => (
                      <option key={request.id} value={request.id}>
                        Solicitud #{request.id} - {request.requestDate ? new Date(request.requestDate).toLocaleDateString() : ""} ({request.items?.length || 0} materiales)
                      </option>
                    ))}
                  </Input>
                  <small className="text-muted">
                    Al seleccionar una solicitud aprobada, los items se pre-cargarán automáticamente
                  </small>
                </FormGroup>
              </Col>
            </Row>

            <hr />
            <h5>Agregar Items</h5>
            {errors.items && (
              <Alert color="danger">{errors.items}</Alert>
            )}
            <Row>
              <Col md="4">
                <FormGroup>
                  <Label>Material</Label>
                  <Input
                    type="select"
                    value={itemForm.materialId}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, materialId: e.target.value })
                    }
                  >
                    <option value="">Seleccione</option>
                    {materials.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.sku} - {material.name}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              </Col>
              <Col md="3">
                <FormGroup>
                  <Label>Cantidad</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={itemForm.quantity}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, quantity: e.target.value })
                    }
                  />
                </FormGroup>
              </Col>
              <Col md="3">
                <FormGroup>
                  <Label>Precio Unitario</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={itemForm.unitPrice}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, unitPrice: e.target.value })
                    }
                  />
                </FormGroup>
              </Col>
              <Col md="2">
                <FormGroup>
                  <Label>&nbsp;</Label>
                  <Button color="primary" block onClick={handleAddItem}>
                    Agregar
                  </Button>
                </FormGroup>
              </Col>
            </Row>

            {formData.items.length > 0 && (
              <div>
                {(() => {
                  // Si viene de una solicitud, agrupar por proveedor
                  if (selectedRequestDetails && formData.materialRequestIds.length > 0) {
                    const itemsBySupplier = {};
                    formData.items.forEach((item, index) => {
                      const supplierIdToUse = item.supplierId || formData.supplierId || null;
                      let supplierNameToUse = "Sin Proveedor";
                      
                      if (supplierIdToUse) {
                        const supplier = suppliers.find((s) => s.id === supplierIdToUse);
                        supplierNameToUse = supplier ? supplier.name : "Sin Proveedor";
                      } else {
                        // Buscar en los items de la solicitud original
                        const originalItem = selectedRequestDetails.items?.find(
                          (ri) => ri.materialId === item.materialId
                        );
                        if (originalItem?.supplierName) {
                          supplierNameToUse = originalItem.supplierName;
                        } else if (originalItem?.supplierId) {
                          const supplier = suppliers.find((s) => s.id === originalItem.supplierId);
                          supplierNameToUse = supplier ? supplier.name : "Sin Proveedor";
                        }
                      }
                      
                      const supplierKey = supplierIdToUse || 'sin-proveedor';
                      if (!itemsBySupplier[supplierKey]) {
                        itemsBySupplier[supplierKey] = {
                          supplierId: supplierIdToUse,
                          supplierName: supplierNameToUse,
                          items: [],
                          totalCost: 0
                        };
                      }
                      const itemCost = item.quantity * item.unitPrice;
                      itemsBySupplier[supplierKey].items.push({ ...item, index, itemCost });
                      itemsBySupplier[supplierKey].totalCost += itemCost;
                    });

                    return Object.values(itemsBySupplier).map((supplierGroup, supplierIdx) => (
                      <Card key={supplierIdx} className="mt-2 mb-2">
                        <CardHeader className="bg-info text-white py-2">
                          <h6 className="mb-0" style={{ fontSize: '0.9rem' }}>
                            <i className="fa fa-truck mr-2" />
                            Proveedor: <strong>{supplierGroup.supplierName}</strong>
                            {supplierGroup.supplierId && (
                              <Badge color="light" className="ml-2" style={{ fontSize: '0.75rem' }}>
                                ID: {supplierGroup.supplierId}
                              </Badge>
                            )}
                          </h6>
                        </CardHeader>
                        <CardBody className="p-2">
                          <Table responsive size="sm" className="mb-0">
                            <thead>
                              <tr>
                                <th>Material</th>
                                <th>Cantidad</th>
                                <th>Precio Unit.</th>
                                <th className="text-right">Subtotal</th>
                                <th>Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {supplierGroup.items.map((item) => (
                                <tr key={item.index}>
                                  <td>{getMaterialName(item.materialId)}</td>
                                  <td>{item.quantity}</td>
                                  <td>Q {item.unitPrice.toFixed(2)}</td>
                                  <td className="text-right">
                                    <strong>Q {item.itemCost.toFixed(2)}</strong>
                                  </td>
                                  <td>
                                    <Button
                                      color="danger"
                                      size="sm"
                                      onClick={() => handleRemoveItem(item.index)}
                                    >
                                      Eliminar
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan="3" className="text-right">
                                  <strong>Subtotal Proveedor:</strong>
                                </td>
                                <td className="text-right">
                                  <strong style={{ fontSize: "1.1em", color: "#007bff" }}>
                                    Q {supplierGroup.totalCost.toFixed(2)}
                                  </strong>
                                </td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </Table>
                        </CardBody>
                      </Card>
                    ));
                  } else {
                    // Si no viene de solicitud, también agrupar por proveedor
                    const itemsBySupplier = {};
                    formData.items.forEach((item, index) => {
                      const supplierIdToUse = item.supplierId || formData.supplierId || null;
                      let supplierNameToUse = "Sin Proveedor";
                      
                      if (supplierIdToUse) {
                        const supplier = suppliers.find((s) => s.id === supplierIdToUse);
                        supplierNameToUse = supplier ? supplier.name : "Sin Proveedor";
                      } else {
                        // Buscar supplierId del material
                        const material = materials.find((m) => m.id === item.materialId);
                        if (material?.supplierId) {
                          const supplier = suppliers.find((s) => s.id === material.supplierId);
                          supplierNameToUse = supplier ? supplier.name : "Sin Proveedor";
                        }
                      }
                      
                      const supplierKey = supplierIdToUse || (materials.find((m) => m.id === item.materialId)?.supplierId || 'sin-proveedor');
                      if (!itemsBySupplier[supplierKey]) {
                        itemsBySupplier[supplierKey] = {
                          supplierId: supplierIdToUse || materials.find((m) => m.id === item.materialId)?.supplierId || null,
                          supplierName: supplierNameToUse,
                          items: [],
                          totalCost: 0
                        };
                      }
                      const itemCost = item.quantity * item.unitPrice;
                      itemsBySupplier[supplierKey].items.push({ ...item, index, itemCost });
                      itemsBySupplier[supplierKey].totalCost += itemCost;
                    });

                    return Object.values(itemsBySupplier).map((supplierGroup, supplierIdx) => (
                      <Card key={supplierIdx} className="mt-2 mb-2">
                        <CardHeader className="bg-info text-white py-2">
                          <h6 className="mb-0" style={{ fontSize: '0.9rem' }}>
                            <i className="fa fa-truck mr-2" />
                            Proveedor: <strong>{supplierGroup.supplierName}</strong>
                            {supplierGroup.supplierId && (
                              <Badge color="light" className="ml-2" style={{ fontSize: '0.75rem' }}>
                                ID: {supplierGroup.supplierId}
                              </Badge>
                            )}
                          </h6>
                        </CardHeader>
                        <CardBody className="p-2">
                          <Table responsive size="sm" className="mb-0">
                            <thead>
                              <tr>
                                <th>Material</th>
                                <th>Cantidad</th>
                                <th>Precio Unit.</th>
                                <th className="text-right">Subtotal</th>
                                <th>Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {supplierGroup.items.map((item) => (
                                <tr key={item.index}>
                                  <td>{getMaterialName(item.materialId)}</td>
                                  <td>{item.quantity}</td>
                                  <td>Q {item.unitPrice.toFixed(2)}</td>
                                  <td className="text-right">
                                    <strong>Q {item.itemCost.toFixed(2)}</strong>
                                  </td>
                                  <td>
                                    <Button
                                      color="danger"
                                      size="sm"
                                      onClick={() => handleRemoveItem(item.index)}
                                    >
                                      Eliminar
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan="3" className="text-right">
                                  <strong>Subtotal Proveedor:</strong>
                                </td>
                                <td className="text-right">
                                  <strong style={{ fontSize: "1.1em", color: "#007bff" }}>
                                    Q {supplierGroup.totalCost.toFixed(2)}
                                  </strong>
                                </td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </Table>
                        </CardBody>
                      </Card>
                    ));
                  }
                })()}
                
                {/* Total General - siempre mostrar cuando hay items */}
                {formData.items.length > 0 && (
                  <Card className="mt-3 bg-light">
                    <CardBody className="py-2">
                      <Row>
                        <Col md="12" className="text-right">
                          <strong>Total General: </strong>
                          <span style={{ fontSize: "1.2em", color: "#28a745" }}>
                            Q {getTotal().toFixed(2)}
                          </span>
                        </Col>
                      </Row>
                    </CardBody>
                  </Card>
                )}
              </div>
            )}

            <FormGroup>
              <Label>Observaciones</Label>
              <Input
                type="textarea"
                rows="3"
                value={formData.observations}
                onChange={(e) =>
                  setFormData({ ...formData, observations: e.target.value })
                }
                disabled={loading}
              />
            </FormGroup>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={toggle} disabled={loading}>
              Cancelar
            </Button>
            <Button color="primary" type="submit" disabled={loading}>
              {loading ? "Guardando..." : "Crear Orden"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    );
  }

  return (
    <>
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>
        Orden de Compra: {order?.code}
      </ModalHeader>
      <ModalBody>
        {loading ? (
          <p>Cargando...</p>
        ) : order ? (
          <>
            {(() => {
              // Agrupar items por proveedor primero para determinar si hay múltiples
              const itemsBySupplier = {};
              order.items?.forEach((item) => {
                // Usar supplierId del item, o buscar en suppliers si no está presente
                let supplierIdToUse = item.supplierId;
                let supplierNameToUse = item.supplierName;
                
                if (!supplierIdToUse) {
                  // Si no tiene supplierId, intentar obtenerlo del material
                  const material = materials.find((m) => m.id === item.materialId);
                  if (material?.supplierId) {
                    supplierIdToUse = material.supplierId;
                    const supplier = suppliers.find((s) => s.id === supplierIdToUse);
                    supplierNameToUse = supplier ? supplier.name : 'Sin Proveedor';
                  } else {
                    // Fallback al proveedor de la orden
                    supplierIdToUse = order.supplierId;
                    supplierNameToUse = order.supplierName || 'Sin Proveedor';
                  }
                } else if (!supplierNameToUse) {
                  // Si tiene supplierId pero no nombre, buscarlo en la lista
                  const supplier = suppliers.find((s) => s.id === supplierIdToUse);
                  supplierNameToUse = supplier ? supplier.name : 'Sin Proveedor';
                }
                
                const supplierKey = supplierIdToUse || 'sin-proveedor';
                if (!itemsBySupplier[supplierKey]) {
                  itemsBySupplier[supplierKey] = {
                    supplierId: supplierIdToUse,
                    supplierName: supplierNameToUse,
                    items: [],
                    totalCost: 0
                  };
                }
                itemsBySupplier[supplierKey].items.push(item);
                itemsBySupplier[supplierKey].totalCost += parseFloat(item.subtotal || 0);
              });

              const supplierGroups = Object.values(itemsBySupplier);
              const hasMultipleSuppliers = supplierGroups.length > 1;
              const displaySupplierName = hasMultipleSuppliers 
                ? `Múltiples Proveedores (${supplierGroups.length})` 
                : (supplierGroups[0]?.supplierName || order.supplierName || 'Sin Proveedor');

              return (
                <>
                  <Row>
                    <Col md="6">
                      <Label>
                        <strong>Proveedor:</strong>{" "}
                        {hasMultipleSuppliers && (
                          <Badge color="warning" className="ml-2">
                            Múltiples
                          </Badge>
                        )}
                        {displaySupplierName}
                      </Label>
                    </Col>
                    <Col md="6">
                      <Label>
                        <strong>Fecha:</strong>{" "}
                        {order.orderDate
                          ? new Date(order.orderDate).toLocaleDateString()
                          : "-"}
                      </Label>
                    </Col>
                  </Row>
                  <Row>
                    <Col md="6">
                      <Label>
                        <strong>Estado:</strong>{" "}
                        <Badge
                          color={
                            order.status === "RECIBIDA"
                              ? "success"
                              : order.status === "CANCELADA"
                              ? "danger"
                              : "info"
                          }
                        >
                          {order.status}
                        </Badge>
                      </Label>
                    </Col>
                    <Col md="6">
                      <Label>
                        <strong>Total:</strong> Q {order.total?.toFixed(2) || "0.00"}
                      </Label>
                    </Col>
                  </Row>

                  <hr />
                  <h5>Items</h5>
                  {hasMultipleSuppliers && (
                    <Alert color="info" className="mb-3">
                      <i className="fa fa-info-circle mr-2" />
                      Esta orden contiene materiales de <strong>{supplierGroups.length} proveedores diferentes</strong>. 
                      Los items están agrupados por proveedor a continuación.
                    </Alert>
                  )}

                  {supplierGroups.map((supplierGroup, supplierIdx) => (
                    <div key={supplierIdx} className="mb-4">
                      <Card className="mb-2">
                        <CardHeader className="bg-primary text-white">
                          <h6 className="mb-0">
                            <i className="fa fa-truck mr-2" />
                            Proveedor {hasMultipleSuppliers ? `${supplierIdx + 1}:` : ":"} <strong>{supplierGroup.supplierName}</strong>
                            {supplierGroup.supplierId && (
                              <Badge color="light" className="ml-2">ID: {supplierGroup.supplierId}</Badge>
                            )}
                          </h6>
                        </CardHeader>
                    <CardBody>
                      <Table responsive size="sm">
                        <thead>
                          <tr>
                            <th>Material</th>
                            <th>Cantidad</th>
                            <th>Precio Unit.</th>
                            <th className="text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {supplierGroup.items.map((item) => (
                            <tr key={item.id}>
                              <td>
                                {item.materialSku} - {item.materialName}
                              </td>
                              <td>{item.quantity}</td>
                              <td>Q {item.unitPrice?.toFixed(2)}</td>
                              <td className="text-right">
                                <strong>Q {item.subtotal?.toFixed(2)}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan="3" className="text-right">
                              <strong>Subtotal Proveedor:</strong>
                            </td>
                            <td className="text-right">
                              <strong style={{ fontSize: "1.1em", color: "#007bff" }}>
                                Q {supplierGroup.totalCost.toFixed(2)}
                              </strong>
                            </td>
                          </tr>
                        </tfoot>
                      </Table>
                    </CardBody>
                  </Card>
                </div>
              ))}

              {/* Total General */}
              <Card className="mt-3">
                <CardBody>
                  <Row>
                    <Col md="12" className="text-right">
                      <h5>
                        <strong>Total General: </strong>
                        <span style={{ fontSize: "1.3em", color: "#28a745" }}>
                          Q {order.total?.toFixed(2) || "0.00"}
                        </span>
                      </h5>
                    </Col>
                  </Row>
                </CardBody>
              </Card>
            </>
          );
        })()}

            {order.observations && (
              <>
                <hr />
                <Label>
                  <strong>Observaciones:</strong>
                </Label>
                <p>{order.observations}</p>
              </>
            )}

            {accountingEntries.length > 0 && (
              <>
                <hr />
                <h5>Asientos Contables</h5>
                <Table responsive size="sm">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cuenta</th>
                      <th>Descripción</th>
                      <th>Debe</th>
                      <th>Haber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountingEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          {entry.entryDate
                            ? new Date(entry.entryDate).toLocaleDateString()
                            : "-"}
                        </td>
                        <td>{entry.accountCode} - {entry.accountName}</td>
                        <td>{entry.description}</td>
                        <td>
                          {entry.debitAmount > 0
                            ? `Q ${parseFloat(entry.debitAmount).toFixed(2)}`
                            : "-"}
                        </td>
                        <td>
                          {entry.creditAmount > 0
                            ? `Q ${parseFloat(entry.creditAmount).toFixed(2)}`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}
          </>
        ) : (
          <p>No se pudo cargar la orden de compra</p>
        )}
      </ModalBody>
      <ModalFooter>
        {order && (
          <>
            <Button 
              color="info" 
              onClick={() => handlePrintOrder(order)}
              className="mr-2"
            >
              🖨️ Imprimir
            </Button>
            <Button 
              color="success" 
              onClick={() => handleDownloadOrderExcel(order)}
              className="mr-2"
            >
              📥 Excel
            </Button>
          </>
        )}
        {order && order.status === "CREADA" ? (
          <Button
            color="danger"
            onClick={() => setShowCancelModal(true)}
            disabled={loading}
            title="Cancelar orden de compra"
            className="mr-2"
          >
            Cancelar Orden
          </Button>
        ) : order && order.status !== "CREADA" ? (
          <Button
            color="secondary"
            disabled
            title={
              order.status === "RECIBIDA"
                ? "No se puede cancelar una orden recibida"
                : order.status === "CANCELADA"
                ? "Esta orden ya está cancelada"
                : `No se puede cancelar una orden en estado ${order.status}`
            }
            className="mr-2"
          >
            Cancelar Orden
          </Button>
        ) : null}
        <Button color="secondary" onClick={toggle}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>

    {/* Modal de Confirmación para Cancelar Orden */}
    <Modal isOpen={showCancelModal} toggle={() => setShowCancelModal(false)}>
      <ModalHeader toggle={() => setShowCancelModal(false)}>
        Confirmar Cancelación de Orden
      </ModalHeader>
      <ModalBody>
        <p>
          ¿Está seguro de cancelar la orden de compra <strong>{order?.code}</strong>?
        </p>
        <p className="text-muted">
          Esta acción no se puede deshacer. Se generarán asientos contables de reversión.
        </p>
        <FormGroup>
          <Label>Motivo de Cancelación *</Label>
          <Input
            type="textarea"
            rows="3"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Ingrese el motivo de la cancelación..."
          />
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button
          color="secondary"
          onClick={() => {
            setShowCancelModal(false);
            setCancelReason("");
          }}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button
          color="danger"
          onClick={handleCancelOrder}
          disabled={loading || !cancelReason.trim()}
        >
          {loading ? "Cancelando..." : "Confirmar Cancelación"}
        </Button>
      </ModalFooter>
    </Modal>
    </>
  );
}

export default PurchaseOrderDetail;

