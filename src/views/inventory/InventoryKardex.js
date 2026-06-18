import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Input,
  Label,
  Badge,
  Alert,
  Spinner,
  FormGroup,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
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
  getProductKardexByProduct, 
  getProductKardexByLocation,
  getProductKardexByProductAndLocation 
} from "services/productInventoryService";
import { getProducts } from "services/productService";
import { getLocations } from "services/locationService";
import { getInventoryTransferById } from "services/inventoryService";
import { showError } from "utils/notificationHelper";

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

function InventoryKardex({
  lockedProductId,
  lockedLocationId,
  lockedTitle,
  embedded = false,
  /** Solo movimientos del producto en todas las ubicaciones (sin selector de ubicación) */
  narrowToProductOnly = false,
  embeddedCompact = false,
} = {}) {
  const productLocked =
    lockedProductId !== undefined &&
    lockedProductId !== null &&
    String(lockedProductId).trim() !== "";
  const locationLocked =
    !narrowToProductOnly &&
    lockedLocationId !== undefined &&
    lockedLocationId !== null &&
    String(lockedLocationId).trim() !== "";

  const [selectedProduct, setSelectedProduct] = useState(() =>
    productLocked ? String(lockedProductId) : ""
  );
  const [selectedLocation, setSelectedLocation] = useState(() =>
    locationLocked ? String(lockedLocationId) : ""
  );
  const [movements, setMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [loadingTransfer, setLoadingTransfer] = useState(false);

  useEffect(() => {
    if (productLocked) setSelectedProduct(String(lockedProductId));
  }, [lockedProductId, productLocked]);

  useEffect(() => {
    if (narrowToProductOnly) {
      setSelectedLocation("");
    } else if (locationLocked) {
      setSelectedLocation(String(lockedLocationId));
    }
  }, [lockedLocationId, locationLocked, narrowToProductOnly]);

  useEffect(() => {
    if (!productLocked) loadProducts();
    if (!locationLocked) loadLocations();
  }, [productLocked, locationLocked]);

  useEffect(() => {
    if (selectedProduct || selectedLocation) {
      loadKardex();
    } else {
      setMovements([]);
    }
  }, [selectedProduct, selectedLocation]);

  const loadProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data || []);
    } catch (err) {
      console.error("Error loading products:", err);
    }
  };

  const loadLocations = async () => {
    try {
      const data = await getLocations();
      setLocations(data || []);
    } catch (err) {
      console.error("Error loading locations:", err);
    }
  };

  const loadKardex = async () => {
    try {
      setLoading(true);
      setError("");
      let data = [];

      if (selectedProduct && selectedLocation) {
        data = await getProductKardexByProductAndLocation(selectedProduct, selectedLocation);
      } else if (selectedProduct) {
        data = await getProductKardexByProduct(selectedProduct);
      } else if (selectedLocation) {
        data = await getProductKardexByLocation(selectedLocation);
      }

      setMovements(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar el kardex de productos");
      showError(err.message || "Error al cargar el kardex de productos");
      setMovements([]);
    } finally {
      setLoading(false);
    }
  };

  const getMovementTypeBadge = (type) => {
    const typeMap = {
      PRODUCTION_ENTRY: { color: "success", text: "Entrada por Producción" },
      SALE_EXIT: { color: "danger", text: "Salida por Venta" },
      TRANSFER_IN: { color: "info", text: "Transferencia Entrada" },
      TRANSFER_OUT: { color: "warning", text: "Transferencia Salida" },
      ADJUSTMENT: { color: "secondary", text: "Ajuste" },
      RETURN: { color: "primary", text: "Devolución" },
    };

    const config = typeMap[type] || { color: "default", text: type };
    return <Badge color={config.color}>{config.text}</Badge>;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("es-GT", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  };

  const handleViewTransferDetails = async (transferId) => {
    try {
      setLoadingTransfer(true);
      const transfer = await getInventoryTransferById(transferId);
      setSelectedTransfer(transfer);
      setShowTransferModal(true);
    } catch (err) {
      showError(err.message || "Error al cargar los detalles de la transferencia");
    } finally {
      setLoadingTransfer(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      PENDING: { color: "warning", text: "Pendiente" },
      COMPLETED: { color: "success", text: "Completada" },
      CANCELLED: { color: "danger", text: "Cancelada" },
    };
    const statusInfo = statusMap[status] || { color: "secondary", text: status };
    return <Badge color={statusInfo.color}>{statusInfo.text}</Badge>;
  };

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
        Header: "Fecha",
        accessor: "movementDate",
        Cell: ({ value }) => formatDate(value),
        sortType: (rowA, rowB) => {
          const a = new Date(rowA.original.movementDate || 0);
          const b = new Date(rowB.original.movementDate || 0);
          return a - b;
        },
      },
      {
        Header: "Código",
        accessor: "productCode",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Producto",
        accessor: "productName",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Color",
        accessor: "colorName",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
        Cell: ({ value }) =>
          value ? (
            <span>{value}</span>
          ) : (
            <span className="text-muted" style={{ fontStyle: "italic" }}>
              —
            </span>
          ),
      },
      {
        Header: "Tipo",
        accessor: "movementType",
        Cell: ({ value }) => getMovementTypeBadge(value),
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
                <option value="PRODUCTION_ENTRY">Entrada por Producción</option>
                <option value="SALE_EXIT">Salida por Venta</option>
                <option value="TRANSFER_IN">Transferencia Entrada</option>
                <option value="TRANSFER_OUT">Transferencia Salida</option>
                <option value="ADJUSTMENT">Ajuste</option>
                <option value="RETURN">Devolución</option>
              </Input>
            </FormGroup>
          );
        },
      },
      {
        Header: "INGRESOS - COMPRAS",
        columns: [
          {
            Header: "Cantidad",
            accessor: "cantidadEntrada",
            Cell: ({ value }) => {
              if (!value || parseFloat(value) === 0) {
                return <span className="text-muted" style={{ fontStyle: "italic" }}>-</span>;
              }
              return (
                <span className="text-success" style={{ fontWeight: "500", display: "inline-block", width: "100%" }}>
                  {parseFloat(value).toFixed(3)}
                </span>
              );
            },
            sortType: (rowA, rowB) => {
              const a = parseFloat(rowA.original.cantidadEntrada || 0);
              const b = parseFloat(rowB.original.cantidadEntrada || 0);
              return a - b;
            },
          },
          {
            Header: "Costo Unitario",
            accessor: "costoUnitarioEntrada",
            Cell: ({ value }) => {
              if (!value || parseFloat(value) === 0) {
                return <span className="text-muted" style={{ fontStyle: "italic" }}>-</span>;
              }
              return <span className="text-success" style={{ display: "inline-block", width: "100%" }}>Q {parseFloat(value).toFixed(2)}</span>;
            },
            sortType: (rowA, rowB) => {
              const a = parseFloat(rowA.original.costoUnitarioEntrada || 0);
              const b = parseFloat(rowB.original.costoUnitarioEntrada || 0);
              return a - b;
            },
          },
          {
            Header: "Total",
            accessor: "totalEntrada",
            Cell: ({ value }) => {
              if (!value || parseFloat(value) === 0) {
                return <span className="text-muted" style={{ fontStyle: "italic" }}>-</span>;
              }
              return (
                <strong className="text-success" style={{ display: "inline-block", width: "100%" }}>Q {parseFloat(value).toFixed(2)}</strong>
              );
            },
            sortType: (rowA, rowB) => {
              const a = parseFloat(rowA.original.totalEntrada || 0);
              const b = parseFloat(rowB.original.totalEntrada || 0);
              return a - b;
            },
          },
        ],
      },
      {
        Header: "EGRESOS - VENTAS",
        columns: [
          {
            Header: "Cantidad",
            accessor: "cantidadSalida",
            Cell: ({ value }) => {
              if (!value || parseFloat(value) === 0) {
                return <span className="text-muted" style={{ fontStyle: "italic" }}>-</span>;
              }
              return (
                <span className="text-danger" style={{ fontWeight: "500", display: "inline-block", width: "100%" }}>
                  {parseFloat(value).toFixed(3)}
                </span>
              );
            },
            sortType: (rowA, rowB) => {
              const a = parseFloat(rowA.original.cantidadSalida || 0);
              const b = parseFloat(rowB.original.cantidadSalida || 0);
              return a - b;
            },
          },
          {
            Header: "Costo Unitario (FIFO)",
            accessor: "costoUnitarioSalida",
            Cell: ({ value }) => {
              if (!value || parseFloat(value) === 0) {
                return <span className="text-muted" style={{ fontStyle: "italic" }}>-</span>;
              }
              return (
                <span style={{ display: "inline-block", width: "100%" }}>
                  <span className="text-danger">Q {parseFloat(value).toFixed(2)}</span>
                  <Badge color="info" className="ml-1" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>
                    FIFO
                  </Badge>
                </span>
              );
            },
            sortType: (rowA, rowB) => {
              const a = parseFloat(rowA.original.costoUnitarioSalida || 0);
              const b = parseFloat(rowB.original.costoUnitarioSalida || 0);
              return a - b;
            },
          },
          {
            Header: "Total (FIFO)",
            accessor: "totalSalida",
            Cell: ({ value }) => {
              if (!value || parseFloat(value) === 0) {
                return <span className="text-muted" style={{ fontStyle: "italic" }}>-</span>;
              }
              return (
                <span style={{ display: "inline-block", width: "100%" }}>
                  <strong className="text-danger">Q {parseFloat(value).toFixed(2)}</strong>
                  <Badge color="info" className="ml-1" style={{ fontSize: "0.65rem", padding: "2px 6px" }}>
                    FIFO
                  </Badge>
                </span>
              );
            },
            sortType: (rowA, rowB) => {
              const a = parseFloat(rowA.original.totalSalida || 0);
              const b = parseFloat(rowB.original.totalSalida || 0);
              return a - b;
            },
          },
        ],
      },
      {
        Header: "SALDO",
        accessor: "lotesFifo",
        Cell: ({ value, row }) => {
          const lotes = value || [];
          if (lotes.length === 0) {
            return <span className="text-muted" style={{ fontStyle: "italic" }}>-</span>;
          }
          return (
            <div style={{ minWidth: "200px" }}>
              {lotes.map((lote, idx) => (
                <div 
                  key={idx} 
                  className="mb-2 p-2" 
                  style={{ 
                    fontSize: "0.8rem",
                    backgroundColor: idx % 2 === 0 ? "#f8f9fa" : "#ffffff",
                    borderRadius: "4px",
                    borderLeft: "3px solid #5e72e4"
                  }}
                >
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-primary" style={{ fontWeight: "500" }}>
                      {new Date(lote.fechaEntrada).toLocaleDateString('es-GT', { 
                        day: '2-digit', 
                        month: '2-digit', 
                        year: 'numeric' 
                      })}
                    </span>
                    <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                      Lote #{idx + 1}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span style={{ fontWeight: "500" }}>{parseFloat(lote.cantidad || 0).toFixed(3)}</span>
                    <span className="text-muted mx-1">@</span>
                    <span className="text-info" style={{ fontWeight: "500" }}>Q{parseFloat(lote.costoUnitario || 0).toFixed(2)}</span>
                    <span className="text-muted mx-1">=</span>
                    <strong className="text-success">Q{parseFloat(lote.total || 0).toFixed(2)}</strong>
                  </div>
                </div>
              ))}
            </div>
          );
        },
      },
      {
        Header: "Ubicación",
        accessor: "locationName",
        Cell: ({ row }) => {
          const locationName = row.original.locationName || "N/A";
          const locationCode = row.original.locationCode;
          return (
            <span>
              {locationName}
              {locationCode && ` (${locationCode})`}
            </span>
          );
        },
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Costo Unitario (FIFO)",
        accessor: "unitCost",
        Cell: ({ value, row }) => {
          const isExit = row.original.movementType === "SALE_EXIT" || 
                        row.original.movementType === "TRANSFER_OUT" ||
                        (row.original.movementType && row.original.movementType.includes("OUT"));
          return value ? (
            <span>
              Q {parseFloat(value).toFixed(2)}
              {isExit && (
                <Badge color="info" className="ml-1" style={{ fontSize: "0.7rem" }}>
                  FIFO
                </Badge>
              )}
            </span>
          ) : "N/A";
        },
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.unitCost || 0);
          const b = parseFloat(rowB.original.unitCost || 0);
          return a - b;
        },
      },
      {
        Header: "Costo Total (FIFO)",
        accessor: "totalCost",
        Cell: ({ value, row }) => {
          const isExit = row.original.movementType === "SALE_EXIT" || 
                        row.original.movementType === "TRANSFER_OUT" ||
                        (row.original.movementType && row.original.movementType.includes("OUT"));
          return value ? (
            <span>
              <strong>Q {parseFloat(value).toFixed(2)}</strong>
              {isExit && (
                <Badge color="info" className="ml-1" style={{ fontSize: "0.7rem" }}>
                  FIFO
                </Badge>
              )}
            </span>
          ) : "N/A";
        },
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.totalCost || 0);
          const b = parseFloat(rowB.original.totalCost || 0);
          return a - b;
        },
      },
      {
        Header: "Referencia",
        accessor: "referenceNumber",
        Cell: ({ row }) =>
          row.original.referenceNumber || row.original.referenceType || "N/A",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Descripción",
        accessor: "description",
        Cell: ({ value, row }) => {
          const movementType = row.original.movementType;
          const isTransfer = movementType === "TRANSFER_IN" || movementType === "TRANSFER_OUT";
          const referenceId = row.original.referenceId;
          const referenceType = row.original.referenceType;
          
          if (isTransfer && referenceId && referenceType === "TRANSFER") {
            return (
              <Button
                color="info"
                size="sm"
                onClick={() => handleViewTransferDetails(referenceId)}
                style={{ fontSize: "0.75rem", padding: "2px 8px" }}
              >
                <i className="nc-icon nc-zoom-split mr-1" />
                Ver Detalles
              </Button>
            );
          }
          
          const desc = value || "N/A";
          const isFifo = desc.includes("[FIFO:");
          return (
            <small>
              {isFifo ? (
                <span>
                  {desc.split("[FIFO:")[0]}
                  <Badge color="info" className="ml-1" style={{ fontSize: "0.7rem" }}>
                    {desc.match(/\[FIFO:.*?\]/)?.[0]}
                  </Badge>
                </span>
              ) : (
                desc
              )}
            </small>
          );
        },
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
    ],
    []
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
      data: movements,
      defaultColumn,
      filterTypes,
      initialState: {
        pageSize: 10,
        pageIndex: 0,
        sortBy: [{ id: "movementDate", desc: true }],
      },
    },
    useFilters,
    useGlobalFilter,
    useSortBy,
    usePagination
  );

  const { globalFilter, pageIndex, pageSize } = state;

  const wrap = (node) => (embedded ? <div className="p-0">{node}</div> : <div className="content">{node}</div>);

  return wrap(
    <>
    <Row>
        <Col md="12">
          <Card className={embedded ? "mb-0 border-0 shadow-none" : ""}>
            {!embeddedCompact && (
              <CardHeader className={embedded ? "px-0 pt-0 border-0" : ""}>
                <CardTitle tag={embedded ? "h5" : "h4"}>
                  {lockedTitle || "Kardex de Productos (Productos Terminados)"}
                </CardTitle>
                <Badge color="info" className="mt-2">
                  Método: FIFO (First In, First Out)
                </Badge>
                <small className="text-muted d-block mt-1">
                  Los costos de salida se calculan usando el método FIFO (los lotes más antiguos se consumen primero)
                </small>
              </CardHeader>
            )}
            <CardBody className={embedded ? "px-0 pb-0" : ""}>
              {embeddedCompact && (
                <small className="text-muted d-block mb-2">
                  Movimientos y valuación <strong>FIFO</strong> del producto indicado arriba (sin salir de esta ventana).
                </small>
              )}
              <Row className="mb-3">
                {!productLocked && (
                  <Col md="4">
                    <Label>Filtrar por Producto</Label>
                    <Input
                      type="select"
                      value={selectedProduct}
                      onChange={(e) => setSelectedProduct(e.target.value)}
                      disabled={loading}
                    >
                      <option value="">Todos los productos</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.code} - {product.name}
                        </option>
                      ))}
                    </Input>
                  </Col>
                )}
                {!locationLocked && !narrowToProductOnly && (
                  <Col md="4">
                    <Label>Filtrar por Ubicación</Label>
                    <Input
                      type="select"
                      value={selectedLocation}
                      onChange={(e) => setSelectedLocation(e.target.value)}
                      disabled={loading}
                    >
                      <option value="">Todas las ubicaciones</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name} ({location.code})
                        </option>
                      ))}
                    </Input>
                  </Col>
                )}
                {!productLocked && !locationLocked && !narrowToProductOnly && (
                  <Col md="4" className="d-flex align-items-end">
                    <small className="text-muted">
                      Selecciona al menos un filtro para ver movimientos
                    </small>
                  </Col>
                )}
              </Row>

              {error && (
                <Alert color="danger" className="mt-3">
                  {error}
                </Alert>
              )}

              {loading ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-2">Cargando movimientos...</p>
                </div>
              ) : !selectedProduct && !selectedLocation ? (
                <Alert color="info" className="mt-3">
                  Por favor selecciona al menos un filtro (Producto o Ubicación) para ver los movimientos.
                </Alert>
              ) : movements.length === 0 ? (
                <Alert color="warning" className="mt-3">
                  No hay movimientos registrados para los filtros seleccionados.
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
                          placeholder="Buscar por código, producto, ubicación..."
                        />
                      </FormGroup>
                    </Col>
                    <Col md="4" className="d-flex align-items-end">
                      <small className="text-muted">
                        Mostrando {page.length} de {movements.length} movimientos
                      </small>
                    </Col>
                  </Row>

                  {/* Tabla con react-table */}
                  <div className="table-responsive">
                    <style>{`
                      .table thead th {
                        background-color: #f8f9fa;
                        border-bottom: 2px solid #dee2e6;
                        font-weight: 600;
                        text-align: center;
                        vertical-align: middle;
                        white-space: nowrap;
                      }
                      .table thead th[colspan] {
                        background-color: #e9ecef;
                        color: #495057;
                        font-size: 0.9rem;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        text-align: center;
                        font-weight: 600;
                      }
                      .table tbody td {
                        vertical-align: middle;
                        text-align: center;
                      }
                      .table tbody td:first-child {
                        text-align: left;
                      }
                      .table tbody tr:hover {
                        background-color: #f8f9fa;
                      }
                      .table {
                        table-layout: auto;
                      }
                      .table th, .table td {
                        padding: 8px 12px;
                      }
                    `}</style>
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
        </Col>
      </Row>

      {/* Modal para ver detalles de transferencia */}
      <Modal 
        isOpen={showTransferModal} 
        toggle={() => {
          setShowTransferModal(false);
          setSelectedTransfer(null);
        }} 
        size="lg"
      >
        <ModalHeader toggle={() => {
          setShowTransferModal(false);
          setSelectedTransfer(null);
        }} style={{ borderBottom: "2px solid #e9ecef", padding: "1.25rem 1.5rem" }}>
          <div className="d-flex justify-content-between align-items-center w-100">
            <div className="d-flex align-items-center">
              <i className="nc-icon nc-delivery-fast mr-2" style={{ fontSize: "1.5rem", color: "#007bff" }} />
              <div>
                <h5 className="mb-0" style={{ fontWeight: "600", color: "#212529" }}>
                  Detalle de Transferencia
                </h5>
                <small className="text-muted">Código: TRF-{selectedTransfer?.id || "N/A"}</small>
              </div>
            </div>
            {selectedTransfer && (
              <Badge
                color={
                  selectedTransfer.status === "COMPLETED"
                    ? "success"
                    : selectedTransfer.status === "PENDING"
                    ? "warning"
                    : "danger"
                }
                style={{
                  fontSize: "0.875rem",
                  padding: "0.5rem 1rem",
                  borderRadius: "20px",
                  fontWeight: "600",
                }}
              >
                {selectedTransfer.status === "COMPLETED" ? (
                  <>
                    <i className="nc-icon nc-check-2 mr-1" />
                    Completada
                  </>
                ) : selectedTransfer.status === "PENDING" ? (
                  <>
                    <i className="nc-icon nc-time-alarm mr-1" />
                    Pendiente
                  </>
                ) : (
                  <>
                    <i className="nc-icon nc-simple-remove mr-1" />
                    Cancelada
                  </>
                )}
              </Badge>
            )}
          </div>
        </ModalHeader>
        <ModalBody style={{ padding: "1.5rem" }}>
          {loadingTransfer ? (
            <div className="text-center py-5">
              <Spinner color="primary" />
              <p className="mt-2">Cargando detalles de la transferencia...</p>
            </div>
          ) : selectedTransfer ? (
            <div>
              {/* SECCIÓN 1: Información General */}
              <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6", padding: "0.75rem 1rem" }}>
                  <div className="d-flex align-items-center">
                    <i className="nc-icon nc-single-copy-04 mr-2" style={{ color: "#007bff", fontSize: "1.25rem" }} />
                    <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                      Información General
                    </h6>
                  </div>
                </CardHeader>
                <CardBody style={{ padding: "1.25rem" }}>
                  <Row>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-tag mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Código
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            TRF-{selectedTransfer.id || "N/A"}
                          </p>
                        </div>
                      </div>
                    </Col>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-box mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Tipo
                          </label>
                          <p style={{ margin: 0 }}>
                            <Badge color={selectedTransfer.productId ? "info" : "primary"}>
                              {selectedTransfer.productId ? "Producto" : "Material"}
                            </Badge>
                          </p>
                        </div>
                      </div>
                    </Col>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-calendar-60 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Fecha de Transferencia
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {formatDate(selectedTransfer.transferDate)}
                          </p>
                        </div>
                      </div>
                    </Col>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-check-2 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Estado
                          </label>
                          <p style={{ margin: 0 }}>
                            {getStatusBadge(selectedTransfer.status)}
                          </p>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </CardBody>
              </Card>

              {/* SECCIÓN 2: Ubicaciones */}
              <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6", padding: "0.75rem 1rem" }}>
                  <div className="d-flex align-items-center">
                    <i className="nc-icon nc-pin-3 mr-2" style={{ color: "#17a2b8", fontSize: "1.25rem" }} />
                    <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                      Ubicaciones
                    </h6>
                  </div>
                </CardHeader>
                <CardBody style={{ padding: "1.25rem" }}>
                  <Row>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-pin-3 mr-2 mt-1" style={{ color: "#dc3545", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Ubicación Origen
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedTransfer.fromLocationName || "N/A"}
                            {selectedTransfer.fromLocationCode && ` (${selectedTransfer.fromLocationCode})`}
                          </p>
                        </div>
                      </div>
                    </Col>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-pin-3 mr-2 mt-1" style={{ color: "#28a745", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Ubicación Destino
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedTransfer.toLocationName || "N/A"}
                            {selectedTransfer.toLocationCode && ` (${selectedTransfer.toLocationCode})`}
                          </p>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </CardBody>
              </Card>

              {/* SECCIÓN 3: Detalles del Item */}
              <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6", padding: "0.75rem 1rem" }}>
                  <div className="d-flex align-items-center">
                    <i className="nc-icon nc-box-2 mr-2" style={{ color: "#ffc107", fontSize: "1.25rem" }} />
                    <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                      Detalles del Item
                    </h6>
                  </div>
                </CardHeader>
                <CardBody style={{ padding: "1.25rem" }}>
                  <Row>
                    <Col md="12" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-box-2 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Item
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedTransfer.productName || selectedTransfer.materialName || "N/A"}
                          </p>
                        </div>
                      </div>
                    </Col>
                    {selectedTransfer.productCode && (
                      <Col md="6" className="mb-3">
                        <div className="d-flex align-items-start">
                          <i className="nc-icon nc-tag mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                              Código Producto
                            </label>
                            <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                              {selectedTransfer.productCode}
                            </p>
                          </div>
                        </div>
                      </Col>
                    )}
                    {selectedTransfer.materialSku && (
                      <Col md="6" className="mb-3">
                        <div className="d-flex align-items-start">
                          <i className="nc-icon nc-tag mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                              SKU Material
                            </label>
                            <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                              {selectedTransfer.materialSku}
                            </p>
                          </div>
                        </div>
                      </Col>
                    )}
                    <Col md="12" className="mb-3">
                      <div style={{ 
                        backgroundColor: "#e7f3ff", 
                        padding: "1rem", 
                        borderRadius: "5px", 
                        borderLeft: "4px solid #007bff"
                      }}>
                        <div className="d-flex justify-content-between align-items-center">
                          <div className="d-flex align-items-center">
                            <i className="nc-icon nc-ruler-pencil mr-2" style={{ color: "#007bff", fontSize: "1.5rem" }} />
                            <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#004085", margin: 0 }}>
                              Cantidad Transferida
                            </label>
                          </div>
                          <span style={{ fontSize: "1.5rem", fontWeight: "700", color: "#004085" }}>
                            {parseFloat(selectedTransfer.quantity || 0).toFixed(3)}
                          </span>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </CardBody>
              </Card>

              {/* SECCIÓN 4: Motivo */}
              {selectedTransfer.reason && (
                <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6", padding: "0.75rem 1rem" }}>
                    <div className="d-flex align-items-center">
                      <i className="nc-icon nc-align-left-2 mr-2" style={{ color: "#007bff", fontSize: "1.25rem" }} />
                      <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                        Motivo
                      </h6>
                    </div>
                  </CardHeader>
                  <CardBody style={{ padding: "1.25rem", backgroundColor: "#f8f9fa" }}>
                    <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0, lineHeight: "1.6" }}>
                      {selectedTransfer.reason}
                    </p>
                  </CardBody>
                </Card>
              )}

              {/* SECCIÓN 5: Información de Auditoría */}
              <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6", padding: "0.75rem 1rem" }}>
                  <div className="d-flex align-items-center">
                    <i className="nc-icon nc-single-02 mr-2" style={{ color: "#6c757d", fontSize: "1.25rem" }} />
                    <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                      Información de Auditoría
                    </h6>
                  </div>
                </CardHeader>
                <CardBody style={{ padding: "1.25rem" }}>
                  <Row>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-single-02 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Creado por
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedTransfer.createdByName || "N/A"}
                          </p>
                        </div>
                      </div>
                    </Col>
                    {selectedTransfer.createdAt && (
                      <Col md="6" className="mb-3">
                        <div className="d-flex align-items-start">
                          <i className="nc-icon nc-calendar-60 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                              Fecha de Creación
                            </label>
                            <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                              {formatDate(selectedTransfer.createdAt)}
                            </p>
                          </div>
                        </div>
                      </Col>
                    )}
                    {selectedTransfer.updatedByName && selectedTransfer.updatedByName !== selectedTransfer.createdByName && (
                      <Col md="6" className="mb-3">
                        <div className="d-flex align-items-start">
                          <i className="nc-icon nc-single-02 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                              Actualizado por
                            </label>
                            <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                              {selectedTransfer.updatedByName}
                            </p>
                          </div>
                        </div>
                      </Col>
                    )}
                    {selectedTransfer.updatedAt && (
                      <Col md="6" className="mb-3">
                        <div className="d-flex align-items-start">
                          <i className="nc-icon nc-calendar-60 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                              Fecha de Actualización
                            </label>
                            <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                              {formatDate(selectedTransfer.updatedAt)}
                            </p>
                          </div>
                        </div>
                      </Col>
                    )}
                  </Row>
                </CardBody>
              </Card>
            </div>
          ) : (
            <Alert color="warning">
              No se pudieron cargar los detalles de la transferencia.
            </Alert>
          )}
        </ModalBody>
        <ModalFooter style={{ borderTop: "2px solid #e9ecef", padding: "1rem 1.5rem" }}>
          <Button 
            color="secondary" 
            onClick={() => {
              setShowTransferModal(false);
              setSelectedTransfer(null);
            }}
            style={{ padding: "0.5rem 1.5rem", fontWeight: "500" }}
          >
            Cerrar
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

export default InventoryKardex;
