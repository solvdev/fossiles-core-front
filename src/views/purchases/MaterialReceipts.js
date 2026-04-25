import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormGroup,
  Label,
  Input,
  Row,
  Col,
  Badge,
} from "reactstrap";
import { getMaterialReceipts, createMaterialReceipt, updateMaterialReceipt } from "services/materialReceiptService";
import { getPurchaseOrders, getPurchaseOrderById } from "services/purchaseOrderService";
import { getMaterialRequestById } from "services/materialRequestService";
import { getSuppliers } from "services/supplierService";
import { getMaterials } from "services/materialService";
import { showSuccess, showError } from "utils/notificationHelper";
import { formatDateGt, formatDateTimeGt, formatNowGt } from "utils/dateTimeHelper";
import * as XLSX from "xlsx";

function MaterialReceipts() {
  const [receipts, setReceipts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingReceiptId, setEditingReceiptId] = useState(null);
  const [formData, setFormData] = useState({
    purchaseOrderId: "",
    receiptDate: new Date().toISOString().split("T")[0],
    observations: "",
    items: [], // Items con cantidades y precios recibidos
  });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showComparison, setShowComparison] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [relatedRequests, setRelatedRequests] = useState([]);

  useEffect(() => {
    loadReceipts();
    loadPurchaseOrders();
    loadSuppliers();
    loadMaterials();
  }, []);

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

  const loadReceipts = async () => {
    try {
      setLoading(true);
      const data = await getMaterialReceipts();
      setReceipts(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar las recepciones");
    } finally {
      setLoading(false);
    }
  };

  const loadPurchaseOrders = async () => {
    try {
      // Cargar órdenes CREADA y PARCIALMENTE_RECIBIDA
      const [created, partial] = await Promise.all([
        getPurchaseOrders("CREADA").catch(() => []),
        getPurchaseOrders("PARCIALMENTE_RECIBIDA").catch(() => []),
      ]);
      setPurchaseOrders([...created, ...partial]);
    } catch (err) {
      console.error("Error al cargar órdenes de compra:", err);
    }
  };

  const handleOrderSelect = async (orderId) => {
    if (orderId) {
      try {
        const order = await getPurchaseOrderById(orderId);
        
        // Validación: Solo se pueden recibir órdenes en estado CREADA o PARCIALMENTE_RECIBIDA
        if (order.status === "RECIBIDA") {
          showError("Esta orden ya ha sido recibida completamente. No se puede registrar otra recepción.");
          setFormData((prev) => ({ ...prev, purchaseOrderId: "" }));
          setSelectedOrder(null);
          setShowComparison(false);
          return;
        }
        
        if (order.status === "CANCELADA") {
          showError("No se puede recibir una orden cancelada.");
          setFormData((prev) => ({ ...prev, purchaseOrderId: "" }));
          setSelectedOrder(null);
          setShowComparison(false);
          return;
        }
        
        if (order.status !== "CREADA" && order.status !== "PARCIALMENTE_RECIBIDA") {
          showError(`No se puede recibir una orden en estado ${order.status}. Solo se pueden recibir órdenes en estado CREADA o PARCIALMENTE_RECIBIDA.`);
          setFormData((prev) => ({ ...prev, purchaseOrderId: "" }));
          setSelectedOrder(null);
          setShowComparison(false);
          return;
        }
        
        setSelectedOrder(order);
        setShowComparison(true);
        
        // Inicializar items con cantidades y precios de la orden, incluyendo supplierId y fecha
        if (order.items) {
          const initialItems = order.items.map((item) => {
            // Obtener supplierId: primero del item de la orden, luego del material
            let supplierId = item.supplierId || null;
            
            // Si no tiene supplierId, obtenerlo del material
            if (!supplierId) {
              const material = materials.find((m) => m.id === item.materialId);
              if (material?.supplierId) {
                supplierId = material.supplierId;
              }
            }
            
            // Si aún no tiene supplierId pero tiene supplierName, buscar el proveedor por nombre
            if (!supplierId && item.supplierName) {
              const supplierByName = suppliers.find((s) => s.name === item.supplierName);
              if (supplierByName) {
                supplierId = supplierByName.id;
              }
            }
            
            return {
              materialId: item.materialId,
              quantityReceived: item.quantityReceived || item.quantity,
              unitPriceReceived: item.unitPriceReceived || item.unitPrice,
              supplierId: supplierId, // Incluir supplierId del item, material o encontrado por nombre
              receiptDate: formData.receiptDate, // Fecha por defecto, editable por item
              isReceived: false, // Por defecto no está marcado como recibido
            };
          });
          setFormData((prev) => ({ ...prev, items: initialItems }));
        }
      } catch (err) {
        console.error("Error al cargar orden:", err);
        showError(err.message || "Error al cargar la orden de compra");
      }
    } else {
      setSelectedOrder(null);
      setShowComparison(false);
      setFormData((prev) => ({ ...prev, items: [] }));
    }
  };

  const handleItemChange = (materialId, field, value) => {
    const newItems = formData.items.map((item) => {
      if (item.materialId === materialId) {
        // Si es un campo booleano (checkbox), mantener el valor booleano
        if (field === "isReceived") {
          return {
            ...item,
            [field]: value,
          };
        }
        // Si es un campo numérico, parsear; si es fecha, mantener como string
        const newValue = (field === "receiptDate") ? value : (parseFloat(value) || 0);
        return {
          ...item,
          [field]: newValue,
          // Preservar supplierId si no se está cambiando
          supplierId: item.supplierId || null,
        };
      }
      return item;
    });
    setFormData({ ...formData, items: newItems });
  };

  const getVariation = (orderItem, receivedItem) => {
    if (!orderItem || !receivedItem) return null;
    const quantityDiff = receivedItem.quantityReceived - parseFloat(orderItem.quantity);
    const priceDiff = receivedItem.unitPriceReceived - parseFloat(orderItem.unitPrice);
    return { quantity: quantityDiff, price: priceDiff };
  };

  const handleEditReceipt = async (receipt) => {
    try {
      setError("");
      setIsEditing(true);
      setEditingReceiptId(receipt.id);
      
      // Cargar la orden de compra asociada
      const order = await getPurchaseOrderById(receipt.purchaseOrderId);
      setSelectedOrder(order);
      
      // Preparar items: combinar items ya recibidos con items de la orden que faltan
      const receivedItemsMap = new Map();
      if (receipt.items && receipt.items.length > 0) {
        receipt.items.forEach(item => {
          receivedItemsMap.set(item.materialId, {
            materialId: item.materialId,
            quantityReceived: parseFloat(item.quantityReceived) || 0,
            unitPriceReceived: parseFloat(item.unitPriceReceived) || 0,
            supplierId: item.supplierId || null,
            receiptDate: item.receiptDate || receipt.receiptDate,
            isReceived: parseFloat(item.quantityReceived) > 0, // Marcar como recibido si tiene cantidad
          });
        });
      }
      
      // Agregar todos los items de la orden, usando valores recibidos si existen
      const allItems = order.items.map(orderItem => {
        const receivedItem = receivedItemsMap.get(orderItem.materialId);
        if (receivedItem) {
          return receivedItem;
        } else {
          // Item no recibido aún - inicializar con 0
          return {
            materialId: orderItem.materialId,
            quantityReceived: 0,
            unitPriceReceived: parseFloat(orderItem.unitPrice) || 0,
            supplierId: orderItem.supplierId || null,
            receiptDate: receipt.receiptDate || new Date().toISOString().split("T")[0],
            isReceived: false, // No recibido aún
          };
        }
      });
      
      setFormData({
        purchaseOrderId: receipt.purchaseOrderId.toString(),
        receiptDate: receipt.receiptDate || new Date().toISOString().split("T")[0],
        observations: receipt.observations || "",
        items: allItems,
      });
      
      setShowComparison(true);
      setShowForm(true);
    } catch (err) {
      const errorMessage = err.message || "Error al cargar la recepción para editar";
      setError(errorMessage);
      showError(errorMessage);
    }
  };

  const handlePrintReceipt = (receipt) => {
    if (!receipt || !receipt.items || receipt.items.length === 0) {
      showError("No hay datos para imprimir");
      return;
    }

    const printContent = generateReceiptPrintContent(receipt);
    
    const printWindow = window.open("", "_blank");
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const generateReceiptPrintContent = (receipt) => {
    const receiptDate = receipt.receiptDate
      ? new Date(receipt.receiptDate).toLocaleDateString('es-GT', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : new Date().toLocaleDateString('es-GT');
    
    const orderDate = receipt.orderDate
      ? new Date(receipt.orderDate).toLocaleDateString('es-GT', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : "-";
    
    let itemsHtml = "";
    receipt.items.forEach((item, idx) => {
      itemsHtml += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">${idx + 1}</td>
          <td style="border: 1px solid #ddd; padding: 8px;"><strong>${item.materialSku || "N/A"}</strong><br/><small>${item.materialName || "N/A"}</small></td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.quantityOrdered?.toFixed(3) || "0.000"}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.quantityReceived?.toFixed(3) || "0.000"}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">Q ${item.unitPriceOrdered?.toFixed(2) || "0.00"}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">Q ${item.unitPriceReceived?.toFixed(2) || "0.00"}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">Q ${item.subtotal?.toFixed(2) || "0.00"}</td>
        </tr>
      `;
    });

    const total = receipt.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recepción de Materiales #${receipt.id}</title>
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
            <h1>Recepción de Materiales</h1>
            <p style="margin: 5px 0;">Recepción #${receipt.id}</p>
          </div>
          
          <div class="info-section">
            <div class="info-row">
              <span><strong>Orden de Compra:</strong> ${receipt.purchaseOrderCode || "N/A"}</span>
              <span><strong>Fecha Recepción:</strong> ${receiptDate}</span>
            </div>
            <div class="info-row">
              <span><strong>Proveedor:</strong> ${receipt.supplierName || "N/A"}</span>
              <span><strong>Fecha Orden:</strong> ${orderDate}</span>
            </div>
            <div class="info-row">
              <span><strong>Estado:</strong> ${receipt.orderStatus || "N/A"}</span>
            </div>
            ${receipt.observations ? `<div class="info-row"><span><strong>Observaciones:</strong> ${receipt.observations}</span></div>` : ""}
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 30%;">Material</th>
                <th style="width: 12%; text-align: center;">Cant. Ordenada</th>
                <th style="width: 12%; text-align: center;">Cant. Recibida</th>
                <th style="width: 12%; text-align: right;">Precio Orden</th>
                <th style="width: 12%; text-align: right;">Precio Recibido</th>
                <th style="width: 17%; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="6" style="text-align: right; padding: 10px; border: 1px solid #ddd;"><strong>TOTAL:</strong></td>
                <td style="text-align: right; padding: 10px; border: 1px solid #ddd; font-size: 1.2em; color: #28a745;"><strong>Q ${total.toFixed(2)}</strong></td>
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

  const handleDownloadReceiptExcel = (receipt) => {
    if (!receipt || !receipt.items || receipt.items.length === 0) {
      showError("No hay datos para exportar");
      return;
    }

    try {
      const excelData = receipt.items.map((item, idx) => ({
        "#": idx + 1,
        "SKU": item.materialSku || "N/A",
        "Material": item.materialName || "N/A",
        "Cantidad Ordenada": item.quantityOrdered || 0,
        "Cantidad Recibida": item.quantityReceived || 0,
        "Precio Orden": item.unitPriceOrdered || 0,
        "Precio Recibido": item.unitPriceReceived || 0,
        "Subtotal": item.subtotal || 0
      }));

      const total = receipt.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
      excelData.push({
        "#": "",
        "SKU": "",
        "Material": "",
        "Cantidad Ordenada": "",
        "Cantidad Recibida": "",
        "Precio Orden": "",
        "Precio Recibido": "TOTAL:",
        "Subtotal": total
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Recepción");

      worksheet['!cols'] = [
        { wch: 5 },
        { wch: 15 },
        { wch: 30 },
        { wch: 15 },
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 }
      ];

      XLSX.writeFile(workbook, `Recepcion_${receipt.purchaseOrderCode || receipt.id}_${new Date().toISOString().split('T')[0]}.xlsx`);
      showSuccess("Archivo Excel descargado correctamente");
    } catch (err) {
      console.error("Error al exportar a Excel:", err);
      showError("Error al exportar a Excel: " + err.message);
    }
  };

  const handleViewDetail = async (receipt) => {
    try {
      setSelectedReceipt(receipt);
      setShowDetailModal(true);
      
      // Cargar información de solicitudes relacionadas
      if (receipt.materialRequestIds && receipt.materialRequestIds.length > 0) {
        const requests = await Promise.all(
          receipt.materialRequestIds.map((id) => 
            getMaterialRequestById(id).catch(() => null)
          )
        );
        setRelatedRequests(requests.filter(r => r !== null));
      } else {
        setRelatedRequests([]);
      }
    } catch (err) {
      console.error("Error al cargar detalles:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.purchaseOrderId) {
      showError("Debe seleccionar una orden de compra");
      return;
    }

    // Validación: Verificar que la orden seleccionada esté en estado válido
    if (!selectedOrder) {
      showError("Debe seleccionar una orden de compra válida");
      return;
    }

    if (selectedOrder.status === "RECIBIDA") {
      showError("Esta orden ya ha sido recibida completamente. No se puede registrar otra recepción.");
      return;
    }

    if (selectedOrder.status === "CANCELADA") {
      showError("No se puede recibir una orden cancelada.");
      return;
    }

    if (selectedOrder.status !== "CREADA" && selectedOrder.status !== "PARCIALMENTE_RECIBIDA") {
      showError(`No se puede recibir una orden en estado ${selectedOrder.status}. Solo se pueden recibir órdenes en estado CREADA o PARCIALMENTE_RECIBIDA.`);
      return;
    }

    try {
      setLoading(true);
      setError("");

      // Truncar observations si excede el límite de 5000 caracteres
      const observations = formData.observations 
        ? (formData.observations.length > 5000 
            ? formData.observations.substring(0, 5000) 
            : formData.observations)
        : null;

      const submitData = {
        purchaseOrderId: parseInt(formData.purchaseOrderId),
        receiptDate: formData.receiptDate, // Fecha general (fallback)
        observations: observations,
        items: formData.items
          .filter((item) => item.isReceived === true) // Solo enviar items marcados como recibidos
          .map((item) => {
            // Asegurar que supplierId se obtenga del item, con fallback al orderItem si no está presente
            const orderItem = selectedOrder.items.find(oi => oi.materialId === item.materialId);
            const supplierIdToUse = item.supplierId || orderItem?.supplierId || null;
            
            return {
              materialId: item.materialId,
              quantityReceived: item.quantityReceived,
              unitPriceReceived: item.unitPriceReceived,
              supplierId: supplierIdToUse, // Incluir supplierId del item o del orderItem
              receiptDate: item.receiptDate || formData.receiptDate, // Fecha específica del item o fecha general
            };
          }),
      };

      if (isEditing && editingReceiptId) {
        // Actualizar recepción existente
        await updateMaterialReceipt(editingReceiptId, submitData);
        showSuccess("Recepción de materiales actualizada correctamente");
      } else {
        // Crear nueva recepción
        await createMaterialReceipt(submitData);
        showSuccess("Recepción de materiales registrada correctamente");
      }
      
      // Resetear formulario
      setFormData({
        purchaseOrderId: "",
        receiptDate: new Date().toISOString().split("T")[0],
        observations: "",
        items: [],
      });
      setSelectedOrder(null);
      setShowComparison(false);
      setIsEditing(false);
      setEditingReceiptId(null);
      setShowForm(false);
      loadReceipts();
      loadPurchaseOrders();
    } catch (err) {
      const errorMessage = err.message || "Error al registrar la recepción";
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <CardTitle tag="h4">Recepción de Materiales</CardTitle>
          <Button color="primary" onClick={() => setShowForm(true)}>
            <i className="nc-icon nc-simple-add" /> Nueva Recepción
          </Button>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}

          {loading ? (
            <p>Cargando recepciones...</p>
          ) : receipts.length === 0 ? (
            <p>No hay recepciones de materiales registradas.</p>
          ) : (
            <Table responsive>
              <thead className="text-primary">
                <tr>
                  <th>ID</th>
                  <th>Orden de Compra</th>
                  <th>Proveedor</th>
                  <th>Fecha Orden</th>
                  <th>Fecha Recepción</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => {
                  // Determinar si se puede editar: cualquier estado que no sea RECIBIDA
                  const canEdit = receipt.orderStatus && receipt.orderStatus !== "RECIBIDA";
                  
                  return (
                    <tr key={receipt.id}>
                      <td>{receipt.id}</td>
                      <td>
                        <strong>{receipt.purchaseOrderCode}</strong>
                      </td>
                      <td>
                        {receipt.items && receipt.items.length > 0 ? (() => {
                          const uniqueSuppliers = new Set();
                          receipt.items.forEach(item => {
                            if (item.supplierId) {
                              uniqueSuppliers.add(item.supplierId);
                            }
                          });
                          const hasMultiple = uniqueSuppliers.size > 1;
                          return (
                            <span>
                              {hasMultiple && (
                                <Badge color="warning" className="mr-2" style={{ fontSize: '0.75rem' }}>
                                  Múltiples
                                </Badge>
                              )}
                              {hasMultiple 
                                ? `Múltiples (${uniqueSuppliers.size})`
                                : (receipt.supplierName || "-")}
                            </span>
                          );
                        })() : (receipt.supplierName || "-")}
                      </td>
                      <td>
                        {receipt.orderDate
                          ? new Date(receipt.orderDate).toLocaleDateString()
                          : "-"}
                      </td>
                      <td>
                        {receipt.receiptDate
                          ? new Date(receipt.receiptDate).toLocaleDateString()
                          : "-"}
                      </td>
                      <td>Q {receipt.orderTotal?.toFixed(2) || "0.00"}</td>
                      <td>
                        <Badge
                          color={
                            receipt.orderStatus === "RECIBIDA"
                              ? "success"
                              : receipt.orderStatus === "PARCIALMENTE_RECIBIDA"
                              ? "warning"
                              : "info"
                          }
                        >
                          {receipt.orderStatus || "N/A"}
                        </Badge>
                      </td>
                      <td>
                        <Button
                          color="info"
                          size="sm"
                          onClick={() => handleViewDetail(receipt)}
                          className="mr-1"
                        >
                          <i className="nc-icon nc-zoom-split" /> Ver Detalle
                        </Button>
                        {canEdit && (
                          <Button
                            color="warning"
                            size="sm"
                            onClick={() => handleEditReceipt(receipt)}
                            className="mr-1"
                          >
                            <i className="nc-icon nc-settings" /> Editar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal isOpen={showForm} toggle={() => {
        setShowForm(false);
        setIsEditing(false);
        setEditingReceiptId(null);
        setSelectedOrder(null);
        setShowComparison(false);
        setFormData({
          purchaseOrderId: "",
          receiptDate: new Date().toISOString().split("T")[0],
          observations: "",
          items: [],
        });
      }} size="xl">
        <ModalHeader toggle={() => {
          setShowForm(false);
          setIsEditing(false);
          setEditingReceiptId(null);
          setSelectedOrder(null);
          setShowComparison(false);
          setFormData({
            purchaseOrderId: "",
            receiptDate: new Date().toISOString().split("T")[0],
            observations: "",
            items: [],
          });
        }}>
          {isEditing ? "Editar Recepción de Materiales" : "Nueva Recepción de Materiales"}
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            {error && <Alert color="danger">{error}</Alert>}

            <FormGroup>
              <Label>Orden de Compra *</Label>
              <Input
                type="select"
                value={formData.purchaseOrderId}
                onChange={(e) => {
                  setFormData({ ...formData, purchaseOrderId: e.target.value });
                  handleOrderSelect(e.target.value);
                }}
                disabled={loading || isEditing}
              >
                <option value="">Seleccione una orden de compra</option>
                {purchaseOrders
                  .filter((order) => order.status === "CREADA" || order.status === "PARCIALMENTE_RECIBIDA")
                  .map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.code} - {order.supplierName} - Q {order.total?.toFixed(2)} - {order.status}
                    </option>
                  ))}
              </Input>
              <small className="text-muted">
                {isEditing 
                  ? "No se puede cambiar la orden de compra al editar una recepción"
                  : "Solo se muestran órdenes en estado CREADA o PARCIALMENTE_RECIBIDA"}
              </small>
            </FormGroup>

            {/* Información Detallada de la Orden */}
            {showComparison && selectedOrder && (
              <div className="mt-3">
                {(() => {
                  // Detectar si hay múltiples proveedores en los items
                  const uniqueSuppliers = new Set();
                  selectedOrder.items?.forEach((item) => {
                    let supplierId = item.supplierId;
                    if (!supplierId) {
                      const material = materials.find((m) => m.id === item.materialId);
                      supplierId = material?.supplierId;
                    }
                    if (supplierId) {
                      uniqueSuppliers.add(supplierId);
                    }
                  });
                  const hasMultipleSuppliers = uniqueSuppliers.size > 1;
                  const displaySupplierName = hasMultipleSuppliers 
                    ? `Múltiples Proveedores (${uniqueSuppliers.size})` 
                    : (selectedOrder.supplierName || "-");

                  return (
                    <Card className="bg-light mb-3">
                      <CardBody>
                        <Row>
                          <Col md="6">
                            <h6>Información de la Orden</h6>
                            <p>
                              <strong>Código:</strong> {selectedOrder.code}
                            </p>
                            <p>
                              <strong>Proveedor:</strong>{" "}
                              {hasMultipleSuppliers && (
                                <Badge color="warning" className="ml-2">Múltiples</Badge>
                              )}
                              {displaySupplierName}
                            </p>
                            <p>
                              <strong>Fecha Orden:</strong>{" "}
                              {selectedOrder.orderDate
                                ? new Date(selectedOrder.orderDate).toLocaleDateString()
                                : "-"}
                            </p>
                            <p>
                              <strong>Estado:</strong>{" "}
                              <Badge
                                color={
                                  selectedOrder.status === "RECIBIDA"
                                    ? "success"
                                    : selectedOrder.status === "PARCIALMENTE_RECIBIDA"
                                    ? "warning"
                                    : "info"
                                }
                              >
                                {selectedOrder.status}
                              </Badge>
                            </p>
                          </Col>
                          <Col md="6">
                            <h6>Información Adicional</h6>
                            <p>
                              <strong>Total Orden:</strong> Q {selectedOrder.total?.toFixed(2) || "0.00"}
                            </p>
                            {selectedOrder.materialRequestIds && selectedOrder.materialRequestIds.length > 0 && (
                              <p>
                                <strong>Solicitudes Relacionadas:</strong>{" "}
                                <Badge color="info">{selectedOrder.materialRequestIds.length} solicitud(es)</Badge>
                                <br />
                                <small className="text-muted">
                                  {selectedOrder.materialRequestIds.map((id, idx) => (
                                    <span key={id}>
                                      Solicitud #{id}
                                      {idx < selectedOrder.materialRequestIds.length - 1 ? ", " : ""}
                                    </span>
                                  ))}
                                </small>
                              </p>
                            )}
                            {selectedOrder.observations && (
                              <p>
                                <strong>Observaciones Orden:</strong>
                                <br />
                                <small className="text-muted">{selectedOrder.observations}</small>
                              </p>
                            )}
                          </Col>
                        </Row>
                      </CardBody>
                    </Card>
                  );
                })()}
              </div>
            )}

            {/* Información Detallada de la Orden */}
            {showComparison && selectedOrder && (
              <div className="mt-3">
                {(() => {
                  // Detectar si hay múltiples proveedores en los items
                  const uniqueSuppliers = new Set();
                  selectedOrder.items?.forEach((item) => {
                    let supplierId = item.supplierId;
                    if (!supplierId) {
                      const material = materials.find((m) => m.id === item.materialId);
                      supplierId = material?.supplierId;
                    }
                    if (supplierId) {
                      uniqueSuppliers.add(supplierId);
                    }
                  });
                  const hasMultipleSuppliers = uniqueSuppliers.size > 1;
                  const displaySupplierName = hasMultipleSuppliers 
                    ? `Múltiples Proveedores (${uniqueSuppliers.size})` 
                    : (selectedOrder.supplierName || "-");

                  return (
                    <Card className="bg-light mb-3">
                      <CardHeader>
                        <CardTitle tag="h6">📋 Información Completa de la Orden de Compra</CardTitle>
                      </CardHeader>
                      <CardBody>
                        <Row>
                          <Col md="6">
                            <h6>Datos de la Orden</h6>
                            <p>
                              <strong>Código:</strong> <Badge color="primary">{selectedOrder.code}</Badge>
                            </p>
                            <p>
                              <strong>Proveedor:</strong>{" "}
                              {hasMultipleSuppliers && (
                                <Badge color="warning" className="ml-2">Múltiples</Badge>
                              )}
                              {displaySupplierName}
                            </p>
                            <p>
                              <strong>Fecha Orden:</strong>{" "}
                              {selectedOrder.orderDate
                                ? new Date(selectedOrder.orderDate).toLocaleDateString()
                                : "-"}
                            </p>
                            <p>
                              <strong>Estado:</strong>{" "}
                              <Badge
                                color={
                                  selectedOrder.status === "RECIBIDA"
                                    ? "success"
                                    : selectedOrder.status === "PARCIALMENTE_RECIBIDA"
                                    ? "warning"
                                    : "info"
                                }
                              >
                                {selectedOrder.status}
                              </Badge>
                            </p>
                            <p>
                              <strong>Total Orden:</strong> <strong className="text-primary">Q {selectedOrder.total?.toFixed(2) || "0.00"}</strong>
                            </p>
                          </Col>
                          <Col md="6">
                            <h6>Origen y Destino</h6>
                            {selectedOrder.materialRequestIds && selectedOrder.materialRequestIds.length > 0 ? (
                              <>
                                <p>
                                  <strong>Solicitudes Relacionadas:</strong>{" "}
                                  <Badge color="info">{selectedOrder.materialRequestIds.length} solicitud(es)</Badge>
                                </p>
                                <p>
                                  <small className="text-muted">
                                    <strong>IDs:</strong> {selectedOrder.materialRequestIds.join(", ")}
                                  </small>
                                </p>
                                <p>
                                  <small className="text-muted">
                                    <strong>Propósito:</strong> Estas solicitudes indican para qué se necesitan los materiales
                                  </small>
                                </p>
                              </>
                            ) : (
                              <p>
                                <Badge color="secondary">Orden Manual (Sin solicitud relacionada)</Badge>
                              </p>
                            )}
                            {selectedOrder.observations && (
                              <p>
                                <strong>Observaciones:</strong>
                                <br />
                                <small className="text-muted">{selectedOrder.observations}</small>
                              </p>
                            )}
                          </Col>
                        </Row>
                      </CardBody>
                    </Card>
                  );
                })()}
              </div>
            )}

            {/* Comparación Orden vs. Recepción - Agrupado por Proveedor */}
            {showComparison && selectedOrder && selectedOrder.items && selectedOrder.items.length > 0 && (
              <div className="mt-3">
                {(() => {
                  // Agrupar items por proveedor
                  const itemsBySupplier = {};
                  
                  selectedOrder.items.forEach((orderItem) => {
                    const receivedItem = formData.items.find((item) => item.materialId === orderItem.materialId);
                    
                    // Obtener supplierId: primero del receivedItem, luego del orderItem, luego del material
                    let supplierIdToUse = receivedItem?.supplierId || orderItem.supplierId || null;
                    
                    // Si no tiene supplierId, obtenerlo del material
                    if (!supplierIdToUse) {
                      const material = materials.find((m) => m.id === orderItem.materialId);
                      if (material?.supplierId) {
                        supplierIdToUse = material.supplierId;
                      }
                    }
                    
                    let supplierNameToUse = orderItem.supplierName || null;
                    
                    // Si tenemos supplierId pero no supplierName, buscarlo en la lista
                    if (supplierIdToUse && !supplierNameToUse) {
                      const supplier = suppliers.find((s) => s.id === supplierIdToUse);
                      supplierNameToUse = supplier ? supplier.name : null;
                    }
                    // Si tenemos supplierName pero no supplierId, buscar el ID
                    else if (!supplierIdToUse && supplierNameToUse) {
                      const supplierByName = suppliers.find((s) => s.name === supplierNameToUse);
                      if (supplierByName) {
                        supplierIdToUse = supplierByName.id;
                        supplierNameToUse = supplierByName.name;
                      }
                    }
                    // Si aún no tenemos nada, intentar obtener el nombre del material
                    else if (!supplierIdToUse && !supplierNameToUse) {
                      const material = materials.find((m) => m.id === orderItem.materialId);
                      if (material?.supplierId) {
                        supplierIdToUse = material.supplierId;
                        const supplier = suppliers.find((s) => s.id === supplierIdToUse);
                        supplierNameToUse = supplier ? supplier.name : null;
                      }
                    }
                    
                    // Si aún no tenemos información, usar "Sin Proveedor"
                    if (!supplierNameToUse) {
                      supplierNameToUse = "Sin Proveedor";
                    }
                    
                    // Usar supplierId como clave principal si está disponible
                    // Si no hay supplierId, usar el nombre del proveedor como clave
                    // Esto asegura que items con el mismo proveedor se agrupen juntos
                    const supplierKey = supplierIdToUse 
                      ? supplierIdToUse.toString()
                      : (supplierNameToUse !== "Sin Proveedor" ? supplierNameToUse : 'sin-proveedor');
                    
                    if (!itemsBySupplier[supplierKey]) {
                      itemsBySupplier[supplierKey] = {
                        supplierId: supplierIdToUse,
                        supplierName: supplierNameToUse,
                        items: [],
                        totalOrdered: 0,
                        totalReceived: 0
                      };
                    }
                    
                    const isReceived = receivedItem?.isReceived || false;
                    const itemCost = isReceived && receivedItem 
                      ? (receivedItem.quantityReceived * receivedItem.unitPriceReceived)
                      : 0;
                    const actualItemCost = isReceived ? itemCost : 0;
                    
                    itemsBySupplier[supplierKey].items.push({
                      orderItem,
                      receivedItem,
                      itemCost: actualItemCost
                    });
                    itemsBySupplier[supplierKey].totalOrdered += orderItem.quantity * orderItem.unitPrice;
                    itemsBySupplier[supplierKey].totalReceived += actualItemCost;
                  });

                  const supplierGroups = Object.values(itemsBySupplier);
                  const hasMultipleSuppliers = supplierGroups.length > 1;

                  return (
                    <>
                      <Alert color="info">
                        <strong>Items de la Orden - Editar Cantidades, Precios y Fechas de Recepción por Proveedor:</strong>
                        {hasMultipleSuppliers && (
                          <Badge color="warning" className="ml-2">
                            Múltiples Proveedores ({supplierGroups.length})
                          </Badge>
                        )}
                      </Alert>
                      {hasMultipleSuppliers && (
                        <Alert color="warning" className="mt-2">
                          <i className="fa fa-info-circle mr-2" />
                          Esta orden contiene materiales de <strong>{supplierGroups.length} proveedores diferentes</strong>. 
                          Los items están agrupados por proveedor a continuación.
                        </Alert>
                      )}

                      {supplierGroups.map((supplierGroup, supplierIdx) => (
                        <Card key={supplierIdx} className="mt-2 mb-2">
                          <CardHeader className="bg-info text-white py-2">
                            <h6 className="mb-0" style={{ fontSize: '0.9rem' }}>
                              <i className="fa fa-truck mr-2" />
                              Proveedor {hasMultipleSuppliers ? `${supplierIdx + 1}:` : ":"} <strong>{supplierGroup.supplierName}</strong>
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
                              <th style={{ width: '5%' }}>Recibido</th>
                              <th>Material</th>
                              <th>Cant. Ordenada</th>
                              <th>Cant. Recibida *</th>
                              <th>Precio Orden</th>
                              <th>Precio Recibido *</th>
                              <th>Fecha Recepción *</th>
                              <th>Variación</th>
                              <th className="text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {supplierGroup.items.map(({ orderItem, receivedItem, itemCost }, idx) => {
                              const variation = receivedItem ? getVariation(orderItem, receivedItem) : null;
                              const hasExcess = variation && variation.quantity > 0;
                              const isPartial = variation && variation.quantity < 0;
                              
                              const isReceived = receivedItem?.isReceived || false;
                              
                              return (
                                <tr key={idx} style={{ opacity: isReceived ? 1 : 0.6 }}>
                                  <td className="text-center">
                                    <Input
                                      type="checkbox"
                                      checked={isReceived}
                                      onChange={(e) => handleItemChange(orderItem.materialId, "isReceived", e.target.checked)}
                                    />
                                  </td>
                                  <td>
                                    <small>
                                      <strong>{orderItem.materialSku}</strong> - {orderItem.materialName}
                                    </small>
                                  </td>
                                  <td>{orderItem.quantity}</td>
                                  <td>
                                    <Input
                                      type="number"
                                      step="0.001"
                                      min="0"
                                      value={receivedItem?.quantityReceived || orderItem.quantity}
                                      onChange={(e) => handleItemChange(orderItem.materialId, "quantityReceived", e.target.value)}
                                      invalid={isPartial}
                                      disabled={!isReceived}
                                      style={{ width: "100px" }}
                                      size="sm"
                                    />
                                    {isPartial && (
                                      <small className="text-warning d-block">Parcial</small>
                                    )}
                                    {hasExcess && (
                                      <small className="text-danger d-block">Exceso: +{variation.quantity.toFixed(2)}</small>
                                    )}
                                  </td>
                                  <td>Q {orderItem.unitPrice?.toFixed(2) || "0.00"}</td>
                                  <td>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={receivedItem?.unitPriceReceived || orderItem.unitPrice}
                                      onChange={(e) => handleItemChange(orderItem.materialId, "unitPriceReceived", e.target.value)}
                                      disabled={!isReceived}
                                      style={{ width: "100px" }}
                                      size="sm"
                                    />
                                    {variation && variation.price !== 0 && (
                                      <small className={variation.price > 0 ? "text-danger" : "text-success"} style={{ display: "block" }}>
                                        {variation.price > 0 ? "+" : ""}{variation.price.toFixed(2)}
                                      </small>
                                    )}
                                  </td>
                                  <td>
                                    <Input
                                      type="date"
                                      value={receivedItem?.receiptDate || formData.receiptDate}
                                      onChange={(e) => handleItemChange(orderItem.materialId, "receiptDate", e.target.value)}
                                      disabled={!isReceived}
                                      style={{ width: "140px" }}
                                      size="sm"
                                    />
                                  </td>
                                  <td>
                                    {variation && (
                                      <>
                                        {variation.quantity !== 0 && (
                                          <Badge color={variation.quantity > 0 ? "danger" : "warning"} style={{ fontSize: '0.7rem' }}>
                                            Cant: {variation.quantity > 0 ? "+" : ""}{variation.quantity.toFixed(2)}
                                          </Badge>
                                        )}
                                        {variation.price !== 0 && (
                                          <Badge color={variation.price > 0 ? "danger" : "success"} className="ml-1" style={{ fontSize: '0.7rem' }}>
                                            Precio: {variation.price > 0 ? "+" : ""}{variation.price.toFixed(2)}
                                          </Badge>
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="text-right">
                                    <strong>Q {isReceived ? itemCost.toFixed(2) : "0.00"}</strong>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan="8" className="text-right">
                                <strong>Subtotal Proveedor:</strong>
                              </td>
                              <td className="text-right">
                                <strong style={{ fontSize: "1.1em", color: "#007bff" }}>
                                  Q {supplierGroup.totalReceived.toFixed(2)}
                                </strong>
                              </td>
                            </tr>
                          </tfoot>
                        </Table>
                        </CardBody>
                      </Card>
                    ))}
                    </>
                  );
                })()}
                
                {/* Total General */}
                <Card className="mt-3 bg-light">
                  <CardBody className="py-2">
                    <Row>
                      <Col md="6" className="text-right">
                        <strong>Total Orden:</strong> Q {selectedOrder.total?.toFixed(2) || "0.00"}
                      </Col>
                      <Col md="6" className="text-right">
                        <strong>Total Recibido:</strong>{" "}
                        <span style={{ fontSize: "1.2em", color: "#28a745" }}>
                          Q {formData.items
                            .filter(item => item.isReceived === true)
                            .reduce((sum, item) => 
                              sum + (item.quantityReceived * item.unitPriceReceived), 0).toFixed(2)}
                        </span>
                        <br />
                        <small className="text-muted">
                          {formData.items.filter(item => item.isReceived === true).length} de {formData.items.length} materiales marcados como recibidos
                        </small>
                      </Col>
                    </Row>
                  </CardBody>
                </Card>
                
                {/* Alertas de variaciones */}
                {formData.items.some((item, idx) => {
                  const orderItem = selectedOrder.items[idx];
                  const variation = getVariation(orderItem, item);
                  return variation && (variation.quantity > 0 || variation.price !== 0);
                }) && (
                  <Alert color="warning" className="mt-2">
                    <strong>⚠️ Atención:</strong> Hay variaciones en cantidades o precios. Se registrarán las diferencias.
                  </Alert>
                )}
              </div>
            )}

            <FormGroup>
              <Label>Fecha de Recepción</Label>
              <Input
                type="date"
                value={formData.receiptDate}
                onChange={(e) =>
                  setFormData({ ...formData, receiptDate: e.target.value })
                }
                disabled={loading}
              />
            </FormGroup>

            <FormGroup>
              <Label>Observaciones</Label>
              <Input
                type="textarea"
                rows="3"
                maxLength={5000}
                value={formData.observations}
                onChange={(e) =>
                  setFormData({ ...formData, observations: e.target.value })
                }
                disabled={loading}
              />
              <small className="text-muted">
                {formData.observations.length}/5000 caracteres
              </small>
            </FormGroup>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={() => setShowForm(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button color="primary" type="submit" disabled={loading}>
              {loading ? "Guardando..." : (isEditing ? "Actualizar Recepción" : "Registrar Recepción")}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal de Detalle de Recepción */}
      <Modal isOpen={showDetailModal} toggle={() => setShowDetailModal(false)} size="xl">
        <ModalHeader toggle={() => setShowDetailModal(false)}>
          Detalle de Recepción #{selectedReceipt?.id} - {selectedReceipt?.purchaseOrderCode}
        </ModalHeader>
        <ModalBody>
          {selectedReceipt ? (
            <>
              {/* Información General */}
              <Row className="mb-3">
                <Col md="6">
                  <Card className="bg-light">
                    <CardBody>
                      <h6>📋 Información de la Orden de Compra</h6>
                      <p>
                        <strong>Código:</strong> <Badge color="primary">{selectedReceipt.purchaseOrderCode}</Badge>
                      </p>
                      <p>
                        <strong>Proveedor:</strong>{" "}
                        {selectedReceipt.items && selectedReceipt.items.length > 0 ? (() => {
                          const uniqueSuppliers = new Set();
                          selectedReceipt.items.forEach(item => {
                            let supplierId = item.supplierId;
                            // Si no tiene supplierId, obtenerlo del material
                            if (!supplierId) {
                              const material = materials.find((m) => m.id === item.materialId);
                              supplierId = material?.supplierId;
                            }
                            if (supplierId) {
                              uniqueSuppliers.add(supplierId);
                            }
                          });
                          const hasMultiple = uniqueSuppliers.size > 1;
                          return (
                            <span>
                              {hasMultiple && (
                                <Badge color="warning" className="mr-2">Múltiples</Badge>
                              )}
                              {hasMultiple 
                                ? `Múltiples Proveedores (${uniqueSuppliers.size})`
                                : (selectedReceipt.supplierName || "-")}
                            </span>
                          );
                        })() : (selectedReceipt.supplierName || "-")}
                      </p>
                      <p>
                        <strong>Fecha Orden:</strong>{" "}
                        {selectedReceipt.orderDate
                          ? new Date(selectedReceipt.orderDate).toLocaleDateString()
                          : "-"}
                      </p>
                      <p>
                        <strong>Estado:</strong>{" "}
                        <Badge
                          color={
                            selectedReceipt.orderStatus === "RECIBIDA"
                              ? "success"
                              : selectedReceipt.orderStatus === "PARCIALMENTE_RECIBIDA"
                              ? "warning"
                              : "info"
                          }
                        >
                          {selectedReceipt.orderStatus}
                        </Badge>
                      </p>
                      <p>
                        <strong>Total Orden:</strong> <strong className="text-primary">Q {selectedReceipt.orderTotal?.toFixed(2) || "0.00"}</strong>
                      </p>
                      {selectedReceipt.materialRequestIds && selectedReceipt.materialRequestIds.length > 0 && (
                        <p>
                          <strong>Solicitudes Relacionadas:</strong>{" "}
                          <Badge color="info">{selectedReceipt.materialRequestIds.length} solicitud(es)</Badge>
                        </p>
                      )}
                    </CardBody>
                  </Card>
                </Col>
                <Col md="6">
                  <Card className="bg-light">
                    <CardBody>
                      <h6>📥 Información de Recepción</h6>
                      <p>
                        <strong>Fecha Recepción:</strong>{" "}
                        {selectedReceipt.receiptDate
                          ? formatDateGt(selectedReceipt.receiptDate)
                          : "-"}
                      </p>
                      <p>
                        <strong>Registrado:</strong>{" "}
                        {selectedReceipt.createdAt
                          ? formatDateTimeGt(selectedReceipt.createdAt)
                          : "-"}
                      </p>
                      {selectedReceipt.orderObservations && (
                        <p>
                          <strong>Observaciones Orden:</strong>
                          <br />
                          <small className="text-muted">{selectedReceipt.orderObservations}</small>
                        </p>
                      )}
                      {selectedReceipt.observations && (
                        <p>
                          <strong>Observaciones Recepción:</strong>
                          <br />
                          <small className="text-muted">{selectedReceipt.observations}</small>
                        </p>
                      )}
                    </CardBody>
                  </Card>
                </Col>
              </Row>

              {/* Solicitudes Relacionadas - Origen y Destino */}
              {relatedRequests.length > 0 && (
                <Card className="mb-3">
                  <CardHeader>
                    <CardTitle tag="h6">📦 Solicitudes Relacionadas - Origen y Propósito de los Materiales</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <Table responsive size="sm">
                      <thead>
                        <tr>
                          <th>ID Solicitud</th>
                          <th>Origen / Propósito</th>
                          <th>Referencia</th>
                          <th>Fecha</th>
                          <th>Estado</th>
                          <th>Materiales</th>
                          <th>Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {relatedRequests.map((request) => (
                          <tr key={request.id}>
                            <td>
                              <strong>Solicitud #{request.id}</strong>
                            </td>
                            <td>
                              {request.origin === "REPOSICION_MATERIALES" && (
                                <Badge color="info">🔄 Reposición de Materiales</Badge>
                              )}
                              {request.origin === "ORDEN_PRODUCCION" && (
                                <Badge color="primary">
                                  🏭 Orden Producción #{request.originReferenceId}
                                </Badge>
                              )}
                              {request.origin === "AUTO_REORDEN" && (
                                <Badge color="success">🤖 Auto Reorden (Stock Inteligente)</Badge>
                              )}
                              {!request.origin && <Badge color="secondary">✋ Manual</Badge>}
                            </td>
                            <td>
                              {request.originReferenceId ? (
                                <Badge color="secondary">Ref: #{request.originReferenceId}</Badge>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td>
                              {request.requestDate
                                ? new Date(request.requestDate).toLocaleDateString()
                                : "-"}
                            </td>
                            <td>
                              <Badge
                                color={
                                  request.status === "APROBADA"
                                    ? "success"
                                    : request.status === "PENDIENTE"
                                    ? "warning"
                                    : request.status === "COMPRADA"
                                    ? "info"
                                    : "secondary"
                                }
                              >
                                {request.status}
                              </Badge>
                            </td>
                            <td>
                              <Badge color="info">{request.items?.length || 0} material(es)</Badge>
                            </td>
                            <td>
                              {request.observations ? (
                                <small className="text-muted">{request.observations}</small>
                              ) : (
                                "-"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                    <Alert color="info" className="mt-2">
                      <strong>💡 Información:</strong> Estas solicitudes indican el <strong>origen</strong> y <strong>propósito</strong> de los materiales recibidos. 
                      Los materiales se destinarán según lo especificado en las solicitudes relacionadas.
                    </Alert>
                  </CardBody>
                </Card>
              )}
              
              {selectedReceipt.materialRequestIds && selectedReceipt.materialRequestIds.length > 0 && relatedRequests.length === 0 && (
                <Alert color="warning" className="mb-3">
                  <strong>⚠️ Nota:</strong> Esta orden tiene {selectedReceipt.materialRequestIds.length} solicitud(es) relacionada(s), 
                  pero no se pudo cargar la información detallada. IDs: {selectedReceipt.materialRequestIds.join(", ")}
                </Alert>
              )}
              
              {(!selectedReceipt.materialRequestIds || selectedReceipt.materialRequestIds.length === 0) && (
                <Alert color="secondary" className="mb-3">
                  <strong>ℹ️ Información:</strong> Esta orden fue creada manualmente sin solicitud de materiales relacionada.
                </Alert>
              )}

              {/* Items Recibidos - Agrupados por Proveedor */}
              {selectedReceipt.items && selectedReceipt.items.length > 0 && (
                <div>
                  {/* Agrupar por proveedor */}
                  {(() => {
                    const itemsBySupplier = {};
                    selectedReceipt.items.forEach((item) => {
                      // CRÍTICO: Usar supplierId del item de recepción (viene del backend)
                      // NO usar el supplierId del receipt general
                      let supplierIdToUse = item.supplierId;
                      let supplierNameToUse = item.supplierName;
                      
                      // Si el item tiene supplierId, usarlo
                      if (supplierIdToUse) {
                        // Si tiene supplierId pero no nombre, buscarlo en la lista
                        if (!supplierNameToUse) {
                          const supplier = suppliers.find((s) => s.id === supplierIdToUse);
                          supplierNameToUse = supplier ? supplier.name : 'Sin Proveedor';
                        }
                      } else {
                        // Si no tiene supplierId, intentar obtenerlo del material como último recurso
                        // Pero esto no debería pasar si el backend está guardando correctamente
                        console.warn(`Item de recepción sin supplierId: materialId=${item.materialId}`);
                        supplierIdToUse = null;
                        supplierNameToUse = 'Sin Proveedor';
                      }
                      
                      // Usar supplierId como clave, o 'sin-proveedor' si no hay
                      const supplierKey = supplierIdToUse || 'sin-proveedor';
                      if (!itemsBySupplier[supplierKey]) {
                        itemsBySupplier[supplierKey] = {
                          supplierId: supplierIdToUse,
                          supplierName: supplierNameToUse,
                          items: [],
                          totalPaid: 0
                        };
                      }
                      itemsBySupplier[supplierKey].items.push(item);
                      itemsBySupplier[supplierKey].totalPaid += parseFloat(item.subtotal || 0);
                    });

                    const supplierGroups = Object.values(itemsBySupplier);
                    const hasMultipleSuppliers = supplierGroups.length > 1;

                    return (
                      <>
                        {hasMultipleSuppliers && (
                          <Alert color="info" className="mb-3">
                            <i className="fa fa-info-circle mr-2" />
                            Esta recepción contiene materiales de <strong>{supplierGroups.length} proveedores diferentes</strong>. 
                            Los items están agrupados por proveedor a continuación.
                          </Alert>
                        )}

                        {supplierGroups.map((supplierGroup, supplierIdx) => (
                          <Card key={supplierIdx} className="mb-3">
                            <CardHeader className="bg-success text-white">
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
                                <th>Cant. Ordenada</th>
                                <th>Cant. Recibida</th>
                                <th>Precio Orden</th>
                                <th>Precio Recibido</th>
                                <th>Fecha Recepción</th>
                                <th>Variación</th>
                                <th className="text-right">Subtotal (Pagado)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {supplierGroup.items.map((item, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <strong>{item.materialSku}</strong>
                                    <br />
                                    <small>{item.materialName}</small>
                                  </td>
                                  <td>{item.quantityOrdered?.toFixed(3) || "0.000"}</td>
                                  <td>
                                    {item.quantityReceived?.toFixed(3) || "0.000"}
                                    {item.quantityVariation && parseFloat(item.quantityVariation) !== 0 && (
                                      <Badge
                                        color={parseFloat(item.quantityVariation) > 0 ? "danger" : "warning"}
                                        className="ml-1"
                                      >
                                        {parseFloat(item.quantityVariation) > 0 ? "+" : ""}
                                        {parseFloat(item.quantityVariation).toFixed(2)}
                                      </Badge>
                                    )}
                                  </td>
                                  <td>Q {item.unitPriceOrdered?.toFixed(2) || "0.00"}</td>
                                  <td>
                                    Q {item.unitPriceReceived?.toFixed(2) || "0.00"}
                                    {item.priceVariation && parseFloat(item.priceVariation) !== 0 && (
                                      <Badge
                                        color={parseFloat(item.priceVariation) > 0 ? "danger" : "success"}
                                        className="ml-1"
                                      >
                                        {parseFloat(item.priceVariation) > 0 ? "+" : ""}
                                        {parseFloat(item.priceVariation).toFixed(2)}
                                      </Badge>
                                    )}
                                  </td>
                                  <td>
                                    <small>
                                      {item.receiptDate 
                                        ? new Date(item.receiptDate).toLocaleDateString()
                                        : (selectedReceipt.receiptDate 
                                            ? new Date(selectedReceipt.receiptDate).toLocaleDateString()
                                            : "-")}
                                    </small>
                                  </td>
                                  <td>
                                    {item.quantityVariation && parseFloat(item.quantityVariation) !== 0 && (
                                      <Badge color={parseFloat(item.quantityVariation) > 0 ? "danger" : "warning"}>
                                        Cant: {parseFloat(item.quantityVariation) > 0 ? "+" : ""}
                                        {parseFloat(item.quantityVariation).toFixed(2)}
                                      </Badge>
                                    )}
                                    {item.priceVariation && parseFloat(item.priceVariation) !== 0 && (
                                      <Badge
                                        color={parseFloat(item.priceVariation) > 0 ? "danger" : "success"}
                                        className="ml-1"
                                      >
                                        Precio: {parseFloat(item.priceVariation) > 0 ? "+" : ""}
                                        {parseFloat(item.priceVariation).toFixed(2)}
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="text-right">
                                    <strong className="text-success">Q {item.subtotal?.toFixed(2) || "0.00"}</strong>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan="8" className="text-right">
                                  <strong>Total Pagado a este Proveedor:</strong>
                                </td>
                                <td className="text-right">
                                  <strong style={{ fontSize: "1.1em", color: "#28a745" }}>
                                    Q {supplierGroup.totalPaid.toFixed(2)}
                                  </strong>
                                </td>
                              </tr>
                            </tfoot>
                          </Table>
                        </CardBody>
                          </Card>
                        ))}
                      </>
                    );
                  })()}
                  
                  {/* Total General */}
                  <Card className="mt-3">
                    <CardBody>
                      <Row>
                        <Col md="12" className="text-right">
                          <h5>
                            <strong>Total General Pagado: </strong>
                            <span style={{ fontSize: "1.3em", color: "#28a745" }}>
                              Q {selectedReceipt.items
                                .reduce((sum, item) => sum + (item.subtotal || 0), 0)
                                .toFixed(2)}
                            </span>
                          </h5>
                        </Col>
                      </Row>
                    </CardBody>
                  </Card>
                </div>
              )}
            </>
          ) : (
            <p>Cargando detalles...</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button 
            color="info" 
            onClick={() => handlePrintReceipt(selectedReceipt)}
            className="mr-2"
          >
            🖨️ Imprimir
          </Button>
          <Button 
            color="success" 
            onClick={() => handleDownloadReceiptExcel(selectedReceipt)}
            className="mr-2"
          >
            📥 Excel
          </Button>
          <Button color="secondary" onClick={() => setShowDetailModal(false)}>
            Cerrar
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default MaterialReceipts;

