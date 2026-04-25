import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Badge,
  Alert,
  Spinner,
  Input,
  Label,
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
import { getCriticalInventory } from "services/inventoryService";
import { getLocations } from "services/locationService";
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

function CriticalInventory() {
  const [alerts, setAlerts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    loadCriticalInventory();
  }, [selectedLocation]);

  const loadLocations = async () => {
    try {
      const data = await getLocations();
      setLocations(data || []);
    } catch (err) {
      console.error("Error loading locations:", err);
    }
  };

  const loadCriticalInventory = async () => {
    try {
      setLoading(true);
      setError("");
      const locationId = selectedLocation || null;
      const data = await getCriticalInventory(locationId);
      setAlerts(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar el inventario crítico");
      showError(err.message || "Error al cargar el inventario crítico");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case "CRITICAL":
        return <Badge color="danger">Crítico</Badge>;
      case "WARNING":
        return <Badge color="warning">Advertencia</Badge>;
      default:
        return <Badge color="info">Normal</Badge>;
    }
  };

  const getReasonText = (reason) => {
    switch (reason) {
      case "BELOW_MIN":
        return "Por debajo del mínimo";
      case "BELOW_THRESHOLD":
        return "Por debajo del umbral";
      case "BELOW_REORDER_POINT":
        return "Por debajo del punto de reorden";
      case "STOCK_ZERO":
        return "Stock en cero";
      case "LOW_STOCK_NO_MIN":
        return "Stock muy bajo (sin mínimo definido)";
      default:
        return reason || "N/A";
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
        Header: "SKU",
        accessor: "materialSku",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Material",
        accessor: "materialName",
        Cell: ({ value }) => <strong>{value || "N/A"}</strong>,
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
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
        Header: "Stock Actual",
        accessor: "currentStock",
        Cell: ({ value }) => (
          <strong>{parseFloat(value || 0).toFixed(3)}</strong>
        ),
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.currentStock || 0);
          const b = parseFloat(rowB.original.currentStock || 0);
          return a - b;
        },
      },
      {
        Header: "Stock Mínimo",
        accessor: "minStock",
        Cell: ({ value }) => value || "N/A",
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.minStock || 0);
          const b = parseFloat(rowB.original.minStock || 0);
          return a - b;
        },
      },
      {
        Header: "Stock Máximo",
        accessor: "maxStock",
        Cell: ({ value }) => value || "N/A",
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.maxStock || 0);
          const b = parseFloat(rowB.original.maxStock || 0);
          return a - b;
        },
      },
      {
        Header: "Déficit",
        accessor: "deficit",
        Cell: ({ value }) => (
          <strong className="text-danger">
            {parseFloat(value || 0).toFixed(3)}
          </strong>
        ),
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.deficit || 0);
          const b = parseFloat(rowB.original.deficit || 0);
          return a - b;
        },
      },
      {
        Header: "Prioridad",
        accessor: "priority",
        Cell: ({ value }) => getPriorityBadge(value),
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
                <option value="">Todas</option>
                <option value="CRITICAL">Crítico</option>
                <option value="WARNING">Advertencia</option>
              </Input>
            </FormGroup>
          );
        },
      },
      {
        Header: "Razón",
        accessor: "reason",
        Cell: ({ value }) => getReasonText(value),
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
      data: alerts,
      defaultColumn,
      filterTypes,
      initialState: {
        pageSize: 10,
        pageIndex: 0,
        sortBy: [{ id: "priority", desc: false }, { id: "deficit", desc: true }],
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
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Inventario Crítico</CardTitle>
            </CardHeader>
            <CardBody>
              <Row className="mb-3">
                <Col md="4">
                  <Label>Filtrar por Ubicación</Label>
                  <Input
                    type="select"
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                  >
                    <option value="">Todas las ubicaciones</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name} ({location.code})
                      </option>
                    ))}
                  </Input>
                </Col>
              </Row>

              {error && (
                <Alert color="danger" className="mt-3">
                  {error}
                </Alert>
              )}

              {loading ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-2">Cargando inventario crítico...</p>
                </div>
              ) : alerts.length === 0 ? (
                <Alert color="success">
                  No hay alertas de inventario crítico. Todos los productos tienen stock suficiente.
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
                          placeholder="Buscar por SKU, material, ubicación..."
                        />
                      </FormGroup>
                    </Col>
                    <Col md="4" className="d-flex align-items-end">
                      <small className="text-muted">
                        Mostrando {page.length} de {alerts.length} alertas críticas
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
        </Col>
      </Row>
    </div>
  );
}

export default CriticalInventory;
