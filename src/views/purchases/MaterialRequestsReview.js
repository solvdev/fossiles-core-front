import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Alert,
  Badge,
  FormGroup,
  Label,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Row,
  Col,
} from "reactstrap";
import {
  getMaterialRequests,
  approveMaterialRequest,
  rejectMaterialRequest,
  addReviewComments,
} from "services/materialRequestService";
import { getMaterials } from "services/materialService";
import { getSuppliers } from "services/supplierService";
import { showSuccess, showError } from "utils/notificationHelper";
import { formatDateGt, formatNowGt } from "utils/dateTimeHelper";
import * as XLSX from "xlsx";

function MaterialRequestsReview() {
  const [requests, setRequests] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("PENDIENTE");
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [reviewAction, setReviewAction] = useState(""); // approve, reject, comment
  const [reviewComments, setReviewComments] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedRequestDetails, setSelectedRequestDetails] = useState(null);

  useEffect(() => {
    loadRequests();
    loadMaterials();
    loadSuppliers();
  }, [filterStatus]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      // Para revisión, mostrar solo PENDIENTE y RECHAZADA por defecto
      const status = filterStatus || "PENDIENTE";
      const data = await getMaterialRequests(status);
      setRequests(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar las solicitudes de materiales");
    } finally {
      setLoading(false);
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

  const loadSuppliers = async () => {
    try {
      const data = await getSuppliers();
      setSuppliers(data || []);
    } catch (err) {
      console.error("Error al cargar proveedores:", err);
    }
  };

  const calculateTotalCost = (request) => {
    if (!request.items || request.items.length === 0) return 0;
    
    return request.items.reduce((total, item) => {
      const material = materials.find((m) => m.id === item.materialId);
      if (material && material.purchasePrice) {
        return total + (item.quantityRequested * material.purchasePrice);
      }
      return total;
    }, 0);
  };

  const handleViewDetails = (request) => {
    setSelectedRequestDetails(request);
    setShowDetailsModal(true);
  };

  const handlePrint = (request) => {
    if (!request || !request.items || request.items.length === 0) {
      showError("No hay datos para imprimir");
      return;
    }

    const totalCost = calculateTotalCost(request);
    const printContent = generatePrintContent(request, totalCost);
    
    const printWindow = window.open("", "_blank");
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const generatePrintContent = (request, totalCost) => {
    const date = request.requestDate 
      ? formatDateGt(request.requestDate, { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : formatDateGt(new Date());
    
    let itemsHtml = "";
    request.items.forEach((item, idx) => {
      const material = materials.find((m) => m.id === item.materialId);
      const purchaseQuantity = material?.purchaseQuantity || material?.quantity || 1;
      const equivalentQty = material
        ? (item.quantityRequested * purchaseQuantity).toFixed(3)
        : "-";
      const itemCost = material && material.purchasePrice
        ? (item.quantityRequested * material.purchasePrice).toFixed(2)
        : "-";
      
      itemsHtml += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">${idx + 1}</td>
          <td style="border: 1px solid #ddd; padding: 8px;"><strong>${item.materialSku}</strong><br/><small>${item.materialName}</small></td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.quantityRequested} ${material?.purchaseUomName || material?.purchaseUomCode || ""}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${equivalentQty} ${material?.manufacturingUomName || material?.manufacturingUomCode || ""}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">Q ${itemCost}</td>
        </tr>
      `;
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Solicitud de Materiales #${request.id}</title>
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
            <h1>Solicitud de Materiales</h1>
            <p style="margin: 5px 0;">Solicitud #${request.id}</p>
          </div>
          
          <div class="info-section">
            <div class="info-row">
              <span><strong>Fecha:</strong> ${date}</span>
              <span><strong>Estado:</strong> ${request.status || "PENDIENTE"}</span>
            </div>
            <div class="info-row">
              <span><strong>Origen:</strong> ${request.origin || "Reposición"}</span>
            </div>
            ${request.observations ? `<div class="info-row"><span><strong>Observaciones:</strong> ${request.observations}</span></div>` : ""}
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 35%;">Material</th>
                <th style="width: 20%; text-align: center;">Cantidad (Compra)</th>
                <th style="width: 20%; text-align: center;">Equivale a (Manufactura)</th>
                <th style="width: 20%; text-align: right;">Costo</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="4" style="text-align: right; padding: 10px; border: 1px solid #ddd;"><strong>TOTAL:</strong></td>
                <td style="text-align: right; padding: 10px; border: 1px solid #ddd; font-size: 1.2em; color: #28a745;"><strong>Q ${totalCost.toFixed(2)}</strong></td>
              </tr>
            </tfoot>
          </table>

          <div class="footer">
            <p>Generado el ${formatNowGt()}</p>
          </div>
        </body>
      </html>
    `;
  };

  const handleDownloadExcel = (request) => {
    if (!request || !request.items || request.items.length === 0) {
      showError("No hay datos para exportar");
      return;
    }

    try {
      const excelData = request.items.map((item, idx) => {
        const material = materials.find((m) => m.id === item.materialId);
        const purchaseQuantity = material?.purchaseQuantity || material?.quantity || 1;
        const equivalentQty = material
          ? (item.quantityRequested * purchaseQuantity).toFixed(3)
          : "-";
        const itemCost = material && material.purchasePrice
          ? (item.quantityRequested * material.purchasePrice)
          : 0;

        return {
          "#": idx + 1,
          "SKU": item.materialSku || "N/A",
          "Material": item.materialName || "N/A",
          "Cantidad (Compra)": item.quantityRequested,
          "Unidad Compra": material?.purchaseUomName || material?.purchaseUomCode || "",
          "Equivale a (Manufactura)": equivalentQty,
          "Unidad Manufactura": material?.manufacturingUomName || material?.manufacturingUomCode || "",
          "Costo": itemCost
        };
      });

      // Agregar fila de total
      const totalCost = calculateTotalCost(request);
      excelData.push({
        "#": "",
        "SKU": "",
        "Material": "",
        "Cantidad (Compra)": "",
        "Unidad Compra": "",
        "Equivale a (Manufactura)": "",
        "Unidad Manufactura": "TOTAL:",
        "Costo": totalCost
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Solicitud");

      // Ajustar ancho de columnas
      worksheet['!cols'] = [
        { wch: 5 },  // #
        { wch: 15 }, // SKU
        { wch: 40 }, // Material
        { wch: 15 }, // Cantidad
        { wch: 15 }, // Unidad Compra
        { wch: 15 }, // Equivale a
        { wch: 15 }, // Unidad Manufactura
        { wch: 12 }  // Costo
      ];

      const fileName = `solicitud_materiales_${request.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      showSuccess("Archivo Excel descargado correctamente");
    } catch (err) {
      showError("Error al generar el archivo Excel");
      console.error(err);
    }
  };

  const handleApprove = (request) => {
    setSelectedRequest(request);
    setReviewAction("approve");
    setReviewComments("");
    setRejectionReason("");
    setShowReviewModal(true);
  };

  const handleReject = (request) => {
    setSelectedRequest(request);
    setReviewAction("reject");
    setReviewComments("");
    setRejectionReason("");
    setShowReviewModal(true);
  };

  const handleComment = (request) => {
    setSelectedRequest(request);
    setReviewAction("comment");
    setReviewComments(request.reviewComments || "");
    setRejectionReason("");
    setShowReviewModal(true);
  };

  const handleReviewSubmit = async () => {
    if (!selectedRequest) return;

    try {
      if (reviewAction === "approve") {
        await approveMaterialRequest(selectedRequest.id);
        showSuccess("Solicitud aprobada correctamente");
      } else if (reviewAction === "reject") {
        if (!rejectionReason.trim()) {
          showError("Debe proporcionar una razón para el rechazo");
          return;
        }
        await rejectMaterialRequest(selectedRequest.id, null, rejectionReason);
        showSuccess("Solicitud rechazada correctamente");
      } else if (reviewAction === "comment") {
        await addReviewComments(selectedRequest.id, reviewComments);
        showSuccess("Comentarios agregados correctamente");
      }
      setShowReviewModal(false);
      setSelectedRequest(null);
      loadRequests();
    } catch (err) {
      showError(err.message || "Error al procesar la acción");
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      PENDIENTE: { color: "warning", text: "Pendiente" },
      APROBADA: { color: "success", text: "Aprobada" },
      COMPRADA: { color: "info", text: "Comprada" },
      RECHAZADA: { color: "danger", text: "Rechazada" },
      CANCELADA: { color: "danger", text: "Cancelada" },
    };
    const statusInfo = statusMap[status] || { color: "secondary", text: status };
    return <Badge color={statusInfo.color}>{statusInfo.text}</Badge>;
  };

  const filteredRequests = requests.filter((req) => {
    if (!filterStatus) return true;
    return req.status === filterStatus;
  });

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <CardTitle tag="h4">Revisión de Solicitudes de Materiales</CardTitle>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}

          <FormGroup>
            <Label>Filtrar por Estado</Label>
            <Input
              type="select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="PENDIENTE">Pendiente</option>
              <option value="RECHAZADA">Rechazada</option>
              <option value="APROBADA">Aprobada</option>
              <option value="COMPRADA">Comprada</option>
              <option value="">Todas</option>
            </Input>
          </FormGroup>

          {loading ? (
            <p>Cargando solicitudes...</p>
          ) : filteredRequests.length === 0 ? (
            <p>No hay solicitudes de materiales para revisar.</p>
          ) : (
            <Table responsive>
              <thead className="text-primary">
                <tr>
                  <th>ID</th>
                  <th>Materiales</th>
                  <th>Origen</th>
                  <th>Estado</th>
                  <th>Costo Total</th>
                  <th>Fecha Solicitud</th>
                  <th>Comentarios/Rechazo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req) => {
                  const totalCost = calculateTotalCost(req);
                  return (
                    <tr key={req.id}>
                      <td>{req.id}</td>
                      <td>
                        {req.items && req.items.length > 0 ? (
                          <div>
                            <Badge color="info">{req.items.length} {req.items.length === 1 ? 'material' : 'materiales'}</Badge>
                            <Button
                              color="link"
                              size="sm"
                              className="p-0 ml-2"
                              onClick={() => handleViewDetails(req)}
                              style={{ fontSize: "0.85em" }}
                            >
                              Ver detalles
                            </Button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{req.origin || "Reposición"}</td>
                      <td>{getStatusBadge(req.status)}</td>
                      <td>
                        <strong style={{ fontSize: "1.1em", color: "#28a745" }}>
                          Q {totalCost.toFixed(2)}
                        </strong>
                      </td>
                      <td>
                        {req.requestDate
                          ? formatDateGt(req.requestDate)
                          : "-"}
                      </td>
                      <td>
                        {req.reviewComments && (
                          <div style={{ fontSize: "0.85em", color: "#17a2b8" }}>
                            <strong>Comentarios:</strong> {req.reviewComments}
                          </div>
                        )}
                        {req.rejectionReason && (
                          <div style={{ fontSize: "0.85em", color: "#dc3545" }}>
                            <strong>Razón Rechazo:</strong> {req.rejectionReason}
                          </div>
                        )}
                        {!req.reviewComments && !req.rejectionReason && "-"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                          <Button
                            color="info"
                            size="sm"
                            onClick={() => handlePrint(req)}
                            title="Imprimir"
                          >
                            <i className="nc-icon nc-paper" />
                          </Button>
                          <Button
                            color="success"
                            size="sm"
                            onClick={() => handleDownloadExcel(req)}
                            title="Descargar Excel"
                          >
                            <i className="nc-icon nc-single-copy-04" />
                          </Button>
                          {req.status === "PENDIENTE" && (
                            <>
                              <Button
                                color="success"
                                size="sm"
                                onClick={() => handleApprove(req)}
                              >
                                Aprobar
                              </Button>
                              <Button
                                color="danger"
                                size="sm"
                                onClick={() => handleReject(req)}
                              >
                                Rechazar
                              </Button>
                              <Button
                                color="info"
                                size="sm"
                                onClick={() => handleComment(req)}
                              >
                                Comentar
                              </Button>
                            </>
                          )}
                          {req.status !== "PENDIENTE" && (
                            <Button
                              color="info"
                              size="sm"
                              onClick={() => handleComment(req)}
                            >
                              {req.reviewComments ? "Editar Comentarios" : "Comentar"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Modal de detalles de materiales */}
      <Modal isOpen={showDetailsModal} toggle={() => setShowDetailsModal(false)} size="xl">
        <ModalHeader toggle={() => setShowDetailsModal(false)}>
          Detalles de Materiales - Solicitud #{selectedRequestDetails?.id}
        </ModalHeader>
        <ModalBody>
          {selectedRequestDetails && selectedRequestDetails.items && selectedRequestDetails.items.length > 0 ? (
            <div>
              {/* Agrupar por proveedor */}
              {(() => {
                const itemsBySupplier = {};
                selectedRequestDetails.items.forEach((item) => {
                  // Si el item no tiene supplierId, usar el del material como fallback
                  const material = materials.find((m) => m.id === item.materialId);
                  const supplierIdToUse = item.supplierId || (material?.supplierId || null);
                  
                  // Obtener el nombre del proveedor: primero del item, luego del material, luego buscar en suppliers
                  let supplierNameToUse = item.supplierName;
                  if (!supplierNameToUse && material?.supplierName) {
                    supplierNameToUse = material.supplierName;
                  }
                  if (!supplierNameToUse && supplierIdToUse) {
                    const supplier = suppliers.find((s) => s.id === supplierIdToUse);
                    supplierNameToUse = supplier ? supplier.name : null;
                  }
                  if (!supplierNameToUse) {
                    supplierNameToUse = 'Sin Proveedor';
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
                  const itemCost = material && material.purchasePrice
                    ? item.quantityRequested * material.purchasePrice
                    : 0;
                  itemsBySupplier[supplierKey].items.push({ ...item, itemCost });
                  itemsBySupplier[supplierKey].totalCost += itemCost;
                });

                return Object.values(itemsBySupplier).map((supplierGroup, supplierIdx) => (
                  <div key={supplierIdx} className="mb-4">
                    <Card className="mb-2">
                      <CardHeader className="bg-primary text-white">
                        <h6 className="mb-0">
                          <i className="fa fa-truck mr-2" />
                          Proveedor: <strong>{supplierGroup.supplierName}</strong>
                          {supplierGroup.supplierId && (
                            <Badge color="light" className="ml-2">ID: {supplierGroup.supplierId}</Badge>
                          )}
                        </h6>
                      </CardHeader>
                      <CardBody>
                        <Table responsive size="sm">
                          <thead>
                            <tr>
                              <th style={{ width: '30%' }}>Material</th>
                              <th style={{ width: '20%' }}>Cantidad (Compra)</th>
                              <th style={{ width: '25%' }}>Equivale a (Manufactura)</th>
                              <th className="text-right" style={{ width: '25%', minWidth: '150px' }}>Costo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {supplierGroup.items.map((item, idx) => {
                              const material = materials.find((m) => m.id === item.materialId);
                              const purchaseQuantity = material?.purchaseQuantity || material?.quantity || 1;
                              const equivalentQty = material
                                ? (item.quantityRequested * purchaseQuantity).toFixed(2)
                                : "-";
                              return (
                                <tr key={idx}>
                                  <td>
                                    <strong>{item.materialSku}</strong>
                                    <br />
                                    <small className="text-muted">{item.materialName}</small>
                                  </td>
                                  <td>
                                    {item.quantityRequested} {material?.purchaseUomName || material?.purchaseUomCode || ""}
                                  </td>
                                  <td>
                                    {equivalentQty} {material?.manufacturingUomName || material?.manufacturingUomCode || ""}
                                  </td>
                                  <td className="text-right" style={{ minWidth: '150px' }}>
                                    <strong style={{ fontSize: '1.1em' }}>Q {item.itemCost.toFixed(2)}</strong>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <td colSpan="3" className="text-right">
                                <strong>Subtotal Proveedor:</strong>
                              </td>
                              <td className="text-right" style={{ minWidth: '150px' }}>
                                <strong style={{ fontSize: "1.2em", color: "#007bff" }}>
                                  Q {supplierGroup.totalCost.toFixed(2)}
                                </strong>
                              </td>
                            </tr>
                          </tfoot>
                        </Table>
                      </CardBody>
                    </Card>
                  </div>
                ));
              })()}
              
              {/* Total General */}
              <Card className="mt-3">
                <CardBody>
                  <Row>
                    <Col md="12" className="text-right">
                      <h5>
                        <strong>Total General: </strong>
                        <span style={{ fontSize: "1.3em", color: "#28a745" }}>
                          Q {calculateTotalCost(selectedRequestDetails).toFixed(2)}
                        </span>
                      </h5>
                    </Col>
                  </Row>
                </CardBody>
              </Card>
            </div>
          ) : (
            <p>No hay materiales en esta solicitud.</p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            color="info"
            onClick={() => {
              if (selectedRequestDetails) {
                handlePrint(selectedRequestDetails);
              }
            }}
          >
            <i className="nc-icon nc-paper" /> Imprimir
          </Button>
          <Button
            color="success"
            onClick={() => {
              if (selectedRequestDetails) {
                handleDownloadExcel(selectedRequestDetails);
              }
            }}
          >
            <i className="nc-icon nc-single-copy-04" /> Descargar Excel
          </Button>
          <Button color="secondary" onClick={() => setShowDetailsModal(false)}>
            Cerrar
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal de revisión (aprobar/rechazar/comentar) */}
      <Modal isOpen={showReviewModal} toggle={() => setShowReviewModal(false)} size="xl">
        <ModalHeader toggle={() => setShowReviewModal(false)}>
          {reviewAction === "approve" && "Aprobar Solicitud"}
          {reviewAction === "reject" && "Rechazar Solicitud"}
          {reviewAction === "comment" && "Agregar Comentarios"}
        </ModalHeader>
        <ModalBody>
          {selectedRequest && (
            <>
              <div className="mb-3">
                <p>
                  <strong>Solicitud ID:</strong> {selectedRequest.id}
                </p>
                <p>
                  <strong>Origen:</strong> {selectedRequest.origin || "Reposición"}
                </p>
                <p>
                  <strong>Costo Total:</strong>{" "}
                  <strong style={{ color: "#28a745" }}>
                    Q {calculateTotalCost(selectedRequest).toFixed(2)}
                  </strong>
                </p>
              </div>
              
              {selectedRequest.items && selectedRequest.items.length > 0 && (
                <div className="mb-3">
                  <strong>Materiales ({selectedRequest.items.length}):</strong>
                  
                  {/* Agrupar por proveedor */}
                  {(() => {
                    const itemsBySupplier = {};
                    selectedRequest.items.forEach((item) => {
                      // Si el item no tiene supplierId, usar el del material como fallback
                      const material = materials.find((m) => m.id === item.materialId);
                      const supplierIdToUse = item.supplierId || (material?.supplierId || null);
                      
                      // Obtener el nombre del proveedor: primero del item, luego del material, luego buscar en suppliers
                      let supplierNameToUse = item.supplierName;
                      if (!supplierNameToUse && material?.supplierName) {
                        supplierNameToUse = material.supplierName;
                      }
                      if (!supplierNameToUse && supplierIdToUse) {
                        const supplier = suppliers.find((s) => s.id === supplierIdToUse);
                        supplierNameToUse = supplier ? supplier.name : null;
                      }
                      if (!supplierNameToUse) {
                        supplierNameToUse = 'Sin Proveedor';
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
                      const itemCost = material && material.purchasePrice
                        ? item.quantityRequested * material.purchasePrice
                        : 0;
                      itemsBySupplier[supplierKey].items.push({ ...item, itemCost });
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
                                <th style={{ width: '40%' }}>Material</th>
                                <th style={{ width: '25%' }}>Cantidad</th>
                                <th className="text-right" style={{ width: '35%', minWidth: '120px' }}>Costo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {supplierGroup.items.map((item, idx) => {
                                const material = materials.find((m) => m.id === item.materialId);
                                return (
                                  <tr key={idx}>
                                    <td>
                                      <small>
                                        <strong>{item.materialSku}</strong> - {item.materialName}
                                      </small>
                                    </td>
                                    <td>
                                      <small>
                                        {item.quantityRequested} {material?.purchaseUomName || material?.purchaseUomCode || ""}
                                      </small>
                                    </td>
                                    <td className="text-right" style={{ minWidth: '120px' }}>
                                      <small><strong>Q {item.itemCost.toFixed(2)}</strong></small>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr>
                                <td colSpan="2" className="text-right">
                                  <small><strong>Subtotal:</strong></small>
                                </td>
                                <td className="text-right" style={{ minWidth: '120px' }}>
                                  <small>
                                    <strong style={{ color: "#007bff" }}>
                                      Q {supplierGroup.totalCost.toFixed(2)}
                                    </strong>
                                  </small>
                                </td>
                              </tr>
                            </tfoot>
                          </Table>
                        </CardBody>
                      </Card>
                    ));
                  })()}
                  
                  {/* Total General */}
                  <Card className="mt-2 bg-light">
                    <CardBody className="py-2">
                      <Row>
                        <Col md="12" className="text-right">
                          <strong>Total General: </strong>
                          <span style={{ fontSize: "1.2em", color: "#28a745" }}>
                            Q {calculateTotalCost(selectedRequest).toFixed(2)}
                          </span>
                        </Col>
                      </Row>
                    </CardBody>
                  </Card>
                </div>
              )}

              {reviewAction === "reject" && (
                <FormGroup>
                  <Label>Razón del Rechazo *</Label>
                  <Input
                    type="textarea"
                    rows="3"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explique por qué se rechaza esta solicitud..."
                  />
                </FormGroup>
              )}

              {(reviewAction === "comment" || reviewAction === "approve") && (
                <FormGroup>
                  <Label>
                    {reviewAction === "comment" ? "Comentarios" : "Comentarios (opcional)"}
                  </Label>
                  <Input
                    type="textarea"
                    rows="4"
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    placeholder={
                      reviewAction === "comment"
                        ? "Agregue comentarios sobre esta solicitud..."
                        : "Comentarios adicionales sobre la aprobación..."
                    }
                  />
                </FormGroup>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowReviewModal(false)}>
            Cancelar
          </Button>
          <Button
            color={
              reviewAction === "approve"
                ? "success"
                : reviewAction === "reject"
                ? "danger"
                : "primary"
            }
            onClick={handleReviewSubmit}
          >
            {reviewAction === "approve" && "Aprobar"}
            {reviewAction === "reject" && "Rechazar"}
            {reviewAction === "comment" && "Guardar Comentarios"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default MaterialRequestsReview;

