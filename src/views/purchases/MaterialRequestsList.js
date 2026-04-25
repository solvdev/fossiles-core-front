import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
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
  Spinner,
  Table,
} from "reactstrap";
import {
  useTable,
  useFilters,
  useGlobalFilter,
  useSortBy,
  usePagination,
} from "react-table";
import { matchSorter } from "match-sorter";
import {
  getMaterialRequests,
  deleteMaterialRequest,
} from "services/materialRequestService";
import { getMaterials } from "services/materialService";
import { getSuppliers } from "services/supplierService";
import MaterialRequestForm from "./MaterialRequestForm";
import { showSuccess, showError } from "utils/notificationHelper";
import { formatDateGt, formatNowGt } from "utils/dateTimeHelper";
import * as XLSX from "xlsx";

// Componente de filtro por defecto
function DefaultColumnFilter({
  column: { filterValue, preFilteredRows, setFilter },
}) {
  return (
    <FormGroup className="mb-0">
      <Input
        type="text"
        value={filterValue || ""}
        onChange={(e) => {
          setFilter(e.target.value || undefined);
        }}
        placeholder={`Buscar...`}
        size="sm"
      />
    </FormGroup>
  );
}

function MaterialRequestsList() {
  const [requests, setRequests] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
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
      const data = await getMaterialRequests(filterStatus || null);
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

  const handleDownloadPDF = (request) => {
    handlePrint(request); // Por ahora usamos la impresión, que puede guardarse como PDF
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

  const handleDelete = async (id) => {
    const request = requests.find((r) => r.id === id);
    
    // Validación: No se pueden eliminar solicitudes compradas
    if (request && request.status === "COMPRADA") {
      showError("No se pueden eliminar solicitudes que ya han sido compradas. Solo se pueden eliminar solicitudes en estado PENDIENTE, RECHAZADA o CANCELADA.");
      return;
    }

    // Validación: No se pueden eliminar solicitudes aprobadas (deben cancelarse primero)
    if (request && request.status === "APROBADA") {
      showError("No se pueden eliminar solicitudes aprobadas. Si desea cancelarla, debe rechazarla primero desde la revisión de solicitudes.");
      return;
    }

    if (!window.confirm("¿Está seguro de eliminar esta solicitud? Esta acción no se puede deshacer.")) {
      return;
    }
    
    try {
      await deleteMaterialRequest(id);
      showSuccess("Solicitud eliminada correctamente");
      loadRequests();
    } catch (err) {
      showError(err.message || "Error al eliminar la solicitud");
    }
  };

  const handleEdit = (request) => {
    // Validación: Solo se pueden editar solicitudes pendientes o rechazadas
    if (request.status !== "PENDIENTE" && request.status !== "RECHAZADA") {
      let message = "";
      if (request.status === "COMPRADA") {
        message = "No se puede editar una solicitud que ya ha sido comprada.";
      } else if (request.status === "APROBADA") {
        message = "No se puede editar una solicitud aprobada. Si necesita cambios, debe rechazarla primero desde la revisión de solicitudes.";
      } else {
        message = `No se puede editar una solicitud en estado ${request.status}. Solo se pueden editar solicitudes en estado PENDIENTE o RECHAZADA.`;
      }
      showError(message);
      return;
    }

    setSelectedRequestId(request.id);
    setShowForm(true);
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

  // Filtrar requests por estado antes de pasar a react-table
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      if (!filterStatus) return true;
      return req.status === filterStatus;
    });
  }, [requests, filterStatus]);

  // Función de filtro global mejorada
  const fuzzyTextFilterFn = (rows, id, filterValue) => {
    return matchSorter(rows, filterValue, {
      keys: [(row) => row.values[id]],
    });
  };
  fuzzyTextFilterFn.autoRemove = (val) => !val || !val.length;

  // Definición de columnas para react-table
  const columns = useMemo(
    () => [
      {
        Header: "ID",
        accessor: "id",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Materiales",
        id: "materials",
        Cell: ({ row }) => {
          const req = row.original;
          return (
            <div>
              {req.items && req.items.length > 0 ? (
                <>
                  <Badge color="info">
                    {req.items.length} {req.items.length === 1 ? "material" : "materiales"}
                  </Badge>
                  <Button
                    color="link"
                    size="sm"
                    className="p-0 ml-2"
                    onClick={() => handleViewDetails(req)}
                    style={{ fontSize: "0.85em" }}
                  >
                    Ver detalles
                  </Button>
                </>
              ) : (
                "-"
              )}
            </div>
          );
        },
        disableSortBy: true,
        disableFilters: true,
      },
      {
        Header: "Origen",
        accessor: "origin",
        Cell: ({ value }) => value || "Reposición",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Estado",
        accessor: "status",
        Cell: ({ value }) => getStatusBadge(value),
        Filter: ({ column: { filterValue, setFilter } }) => {
          return (
            <FormGroup className="mb-0">
              <Input
                type="select"
                value={filterValue || ""}
                onChange={(e) => {
                  setFilter(e.target.value || undefined);
                }}
                size="sm"
              >
                <option value="">Todos</option>
                <option value="PENDIENTE">Pendiente</option>
                <option value="APROBADA">Aprobada</option>
                <option value="COMPRADA">Comprada</option>
                <option value="RECHAZADA">Rechazada</option>
                <option value="CANCELADA">Cancelada</option>
              </Input>
            </FormGroup>
          );
        },
      },
      {
        Header: "Costo Total",
        id: "totalCost",
        Cell: ({ row }) => {
          const totalCost = calculateTotalCost(row.original);
          return (
            <strong style={{ fontSize: "1.1em", color: "#28a745" }}>
              Q {totalCost.toFixed(2)}
            </strong>
          );
        },
        sortType: (rowA, rowB) => {
          const a = calculateTotalCost(rowA.original);
          const b = calculateTotalCost(rowB.original);
          return a - b;
        },
        disableFilters: true,
      },
      {
        Header: "Fecha Solicitud",
        accessor: "requestDate",
        Cell: ({ value }) => {
          if (!value) return "-";
          try {
            return formatDateGt(value);
          } catch (e) {
            return value;
          }
        },
        sortType: (rowA, rowB) => {
          const a = new Date(rowA.original.requestDate || 0);
          const b = new Date(rowB.original.requestDate || 0);
          return a - b;
        },
      },
      {
        Header: "Comentarios/Rechazo",
        id: "comments",
        Cell: ({ row }) => {
          const req = row.original;
          return (
            <div>
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
            </div>
          );
        },
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Creado por",
        accessor: "createdByName",
        Cell: ({ value, row }) => {
          const createdByName = value || row.original.createdByName || "N/A";
          const updatedByName = row.original.updatedByName;
          if (updatedByName && updatedByName !== createdByName) {
            return (
              <div>
                <div>{createdByName}</div>
                <small className="text-muted">Editado por: {updatedByName}</small>
              </div>
            );
          }
          return createdByName;
        },
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Acciones",
        id: "actions",
        Cell: ({ row }) => {
          const req = row.original;
          return (
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
              {(req.status === "PENDIENTE" || req.status === "RECHAZADA") ? (
                <Button
                  color="primary"
                  size="sm"
                  onClick={() => handleEdit(req)}
                  title="Editar solicitud"
                >
                  Editar
                </Button>
              ) : (
                <Button
                  color="secondary"
                  size="sm"
                  disabled
                  title={
                    req.status === "COMPRADA"
                      ? "No se puede editar una solicitud comprada"
                      : req.status === "APROBADA"
                      ? "No se puede editar una solicitud aprobada"
                      : `No se puede editar una solicitud en estado ${req.status}`
                  }
                >
                  Editar
                </Button>
              )}
              {req.status !== "COMPRADA" && req.status !== "APROBADA" ? (
                <Button
                  color="danger"
                  size="sm"
                  onClick={() => handleDelete(req.id)}
                  title="Eliminar solicitud"
                >
                  Eliminar
                </Button>
              ) : (
                <Button
                  color="secondary"
                  size="sm"
                  disabled
                  title={
                    req.status === "COMPRADA"
                      ? "No se pueden eliminar solicitudes compradas"
                      : "No se pueden eliminar solicitudes aprobadas"
                  }
                >
                  Eliminar
                </Button>
              )}
            </div>
          );
        },
        disableSortBy: true,
        disableFilters: true,
      },
    ],
    [materials]
  );

  // Configuración de react-table
  const filterTypes = useMemo(
    () => ({
      fuzzyText: fuzzyTextFilterFn,
      text: (rows, id, filterValue) => {
        return rows.filter((row) => {
          const rowValue = row.values[id];
          return rowValue !== undefined
            ? String(rowValue)
                .toLowerCase()
                .includes(String(filterValue).toLowerCase())
            : true;
        });
      },
    }),
    []
  );

  const defaultColumn = useMemo(
    () => ({
      Filter: DefaultColumnFilter,
    }),
    []
  );

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    page,
    prepareRow,
    state,
    setGlobalFilter,
    canPreviousPage,
    canNextPage,
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
  } = useTable(
    {
      columns,
      data: filteredRequests,
      defaultColumn,
      filterTypes,
      initialState: {
        pageSize: 10,
        pageIndex: 0,
        sortBy: [{ id: "requestDate", desc: true }],
      },
    },
    useFilters,
    useGlobalFilter,
    useSortBy,
    usePagination
  );

  const { globalFilter, pageIndex, pageSize } = state;

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <CardTitle tag="h4">Mis Solicitudes de Materiales</CardTitle>
          <Button color="primary" onClick={() => {
            setSelectedRequestId(null);
            setShowForm(true);
          }}>
            <i className="nc-icon nc-simple-add" /> Nueva Solicitud
          </Button>
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
              <option value="">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="APROBADA">Aprobada</option>
              <option value="COMPRADA">Comprada</option>
              <option value="RECHAZADA">Rechazada</option>
              <option value="CANCELADA">Cancelada</option>
            </Input>
          </FormGroup>

          {loading && filteredRequests.length === 0 ? (
            <div className="text-center py-5">
              <Spinner color="primary" />
              <p className="mt-2">Cargando solicitudes...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <Alert color="info">
              No hay solicitudes de materiales registradas.
            </Alert>
          ) : (
            <>
              {/* Filtro global */}
              <Row className="mb-3">
                <Col md="4">
                  <FormGroup>
                    <Label>Buscar en todos los campos:</Label>
                    <Input
                      type="text"
                      value={globalFilter || ""}
                      onChange={(e) => setGlobalFilter(e.target.value || undefined)}
                      placeholder="Buscar por ID, origen, comentarios..."
                    />
                  </FormGroup>
                </Col>
                <Col md="4" className="d-flex align-items-end">
                  <small className="text-muted">
                    Mostrando {page.length} de {filteredRequests.length} solicitudes
                  </small>
                </Col>
              </Row>

              {/* Tabla con react-table */}
              <div className="table-responsive">
                <table {...getTableProps()} className="table table-striped">
                  <thead className="text-primary">
                    {headerGroups.map((headerGroup) => (
                      <tr {...headerGroup.getHeaderGroupProps()}>
                        {headerGroup.headers.map((column) => (
                          <th
                            {...column.getHeaderProps(column.getSortByToggleProps())}
                            className={
                              column.canSort
                                ? column.isSorted
                                  ? column.isSortedDesc
                                    ? "sort-desc"
                                    : "sort-asc"
                                  : "sortable"
                                : ""
                            }
                          >
                            {column.render("Header")}
                            <span>
                              {column.isSorted
                                ? column.isSortedDesc
                                  ? " ▼"
                                  : " ▲"
                                : column.canSort
                                ? " ⇅"
                                : ""}
                            </span>
                            <div>
                              {column.canFilter ? column.render("Filter") : null}
                            </div>
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody {...getTableBodyProps()}>
                    {page.map((row) => {
                      prepareRow(row);
                      return (
                        <tr {...row.getRowProps()}>
                          {row.cells.map((cell) => (
                            <td {...cell.getCellProps()}>{cell.render("Cell")}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              <Row className="mt-3">
                <Col md="6">
                  <div className="d-flex align-items-center">
                    <span className="mr-2">Mostrar:</span>
                    <Input
                      type="select"
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                      }}
                      style={{ width: "auto" }}
                    >
                      {[5, 10, 20, 25, 50, 100].map((pageSize) => (
                        <option key={pageSize} value={pageSize}>
                          {pageSize}
                        </option>
                      ))}
                    </Input>
                    <span className="ml-2">registros por página</span>
                  </div>
                </Col>
                <Col md="6" className="text-right">
                  <div className="d-flex align-items-center justify-content-end">
                    <span className="mr-3">
                      Página{" "}
                      <strong>
                        {pageIndex + 1} de {pageOptions.length}
                      </strong>
                    </span>
                    <Button
                      color="primary"
                      size="sm"
                      onClick={() => gotoPage(0)}
                      disabled={!canPreviousPage}
                      className="mr-1"
                    >
                      {"<<"}
                    </Button>
                    <Button
                      color="primary"
                      size="sm"
                      onClick={() => previousPage()}
                      disabled={!canPreviousPage}
                      className="mr-1"
                    >
                      {"<"}
                    </Button>
                    <Button
                      color="primary"
                      size="sm"
                      onClick={() => nextPage()}
                      disabled={!canNextPage}
                      className="mr-1"
                    >
                      {">"}
                    </Button>
                    <Button
                      color="primary"
                      size="sm"
                      onClick={() => gotoPage(pageCount - 1)}
                      disabled={!canNextPage}
                    >
                      {">>"}
                    </Button>
                  </div>
                </Col>
              </Row>
            </>
          )}
        </CardBody>
      </Card>

      <MaterialRequestForm
        requestId={selectedRequestId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedRequestId(null);
        }}
        onSuccess={() => {
          loadRequests();
          setShowForm(false);
          setSelectedRequestId(null);
        }}
      />

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

    </div>
  );
}

export default MaterialRequestsList;

