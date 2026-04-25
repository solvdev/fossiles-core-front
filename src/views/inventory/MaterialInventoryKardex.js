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
  getMaterialKardex,
  getMaterialKardexByMovementType,
} from "services/inventoryService";
import { getMaterials } from "services/materialService";
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

function MaterialInventoryKardex({
  lockedMaterialId,
  lockedMaterialLabel,
  embedded = false,
  /** Sin título grande duplicado (p. ej. dentro de modal que ya muestra el ítem) */
  embeddedCompact = false,
} = {}) {
  const materialLocked =
    lockedMaterialId !== undefined &&
    lockedMaterialId !== null &&
    String(lockedMaterialId).trim() !== "";

  const [selectedMaterial, setSelectedMaterial] = useState(() =>
    materialLocked ? String(lockedMaterialId) : ""
  );
  const [selectedMovementType, setSelectedMovementType] = useState("");
  const [movements, setMovements] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (materialLocked) {
      setSelectedMaterial(String(lockedMaterialId));
    }
  }, [lockedMaterialId, materialLocked]);

  useEffect(() => {
    if (!materialLocked) {
      loadMaterials();
    }
  }, [materialLocked]);

  useEffect(() => {
    if (selectedMaterial || selectedMovementType) {
      loadKardex();
    } else {
      setMovements([]);
    }
  }, [selectedMaterial, selectedMovementType]);

  const loadMaterials = async () => {
    try {
      const data = await getMaterials();
      setMaterials(data || []);
    } catch (err) {
      console.error("Error loading materials:", err);
    }
  };

  const loadKardex = async () => {
    try {
      setLoading(true);
      setError("");
      let data = [];

      if (selectedMovementType) {
        data = await getMaterialKardexByMovementType(selectedMovementType);
        // Si también hay material seleccionado, filtrar en el frontend
        if (selectedMaterial) {
          data = data.filter(m => m.materialId === parseInt(selectedMaterial));
        }
      } else if (selectedMaterial) {
        data = await getMaterialKardex(selectedMaterial);
      }

      setMovements(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar el kardex de materiales");
      showError(err.message || "Error al cargar el kardex de materiales");
      setMovements([]);
    } finally {
      setLoading(false);
    }
  };

  const getMovementTypeBadge = (type) => {
    const typeMap = {
      ENTRY: { color: "success", text: "Entrada" },
      EXIT: { color: "danger", text: "Salida" },
      ADJUSTMENT: { color: "secondary", text: "Ajuste" },
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
        Header: "SKU",
        accessor: "materialSku",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Material",
        accessor: "materialName",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Tipo",
        accessor: "movementType",
        Cell: ({ value }) => getMovementTypeBadge(value),
        Filter: ({ column: { filterValue, setFilter, preFilteredRows } }) => {
          const options = ["ENTRY", "EXIT", "ADJUSTMENT"];
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
                <option value="ENTRY">Entrada</option>
                <option value="EXIT">Salida</option>
                <option value="ADJUSTMENT">Ajuste</option>
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
    <Row>
        <Col md="12">
          <Card className={embedded ? "mb-0 border-0 shadow-none" : ""}>
            {!embeddedCompact && (
              <CardHeader className={embedded ? "px-0 pt-0 border-0" : ""}>
                <CardTitle tag={embedded ? "h5" : "h4"}>
                  {materialLocked && lockedMaterialLabel
                    ? `Kardex — ${lockedMaterialLabel}`
                    : "Kardex de Materiales (Materia Prima)"}
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
                  Movimientos y valuación <strong>FIFO</strong> del material indicado arriba (sin salir de esta ventana).
                </small>
              )}
              <Row className="mb-3">
                {!materialLocked && (
                  <Col md="4">
                    <Label>Filtrar por Material</Label>
                    <Input
                      type="select"
                      value={selectedMaterial}
                      onChange={(e) => setSelectedMaterial(e.target.value)}
                      disabled={loading}
                    >
                      <option value="">Todos los materiales</option>
                      {materials.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.sku} - {material.name}
                        </option>
                      ))}
                    </Input>
                  </Col>
                )}
                <Col md={materialLocked ? 6 : 4}>
                  <Label>Filtrar por Tipo de Movimiento</Label>
                  <Input
                    type="select"
                    value={selectedMovementType}
                    onChange={(e) => setSelectedMovementType(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Todos los tipos</option>
                    <option value="ENTRY">Entrada</option>
                    <option value="EXIT">Salida</option>
                    <option value="ADJUSTMENT">Ajuste</option>
                  </Input>
                </Col>
                {!materialLocked && (
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
              ) : !selectedMaterial && !selectedMovementType ? (
                <Alert color="info" className="mt-3">
                  Por favor selecciona al menos un filtro (Material o Tipo de Movimiento) para ver los movimientos.
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
                          placeholder="Buscar por SKU, material, referencia..."
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
  );
}

export default MaterialInventoryKardex;

