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
  Row,
  Col,
  Spinner,
} from "reactstrap";
import {
  useTable,
  useFilters,
  useGlobalFilter,
  useSortBy,
  usePagination,
} from "react-table";
import { matchSorter } from "match-sorter";
import { getPurchaseOrders } from "services/purchaseOrderService";
import PurchaseOrderDetail from "./PurchaseOrderDetail";
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

function PurchaseOrdersList() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchCode, setSearchCode] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadOrders();
  }, [filterStatus]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await getPurchaseOrders(filterStatus || null);
      setOrders(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar las órdenes de compra");
      showError(err.message || "Error al cargar las órdenes de compra");
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = (id) => {
    setSelectedOrderId(id);
    setShowDetail(true);
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      CREADA: { color: "info", text: "Creada" },
      RECIBIDA: { color: "success", text: "Recibida" },
      CANCELADA: { color: "danger", text: "Cancelada" },
    };
    const statusInfo = statusMap[status] || { color: "secondary", text: status };
    return <Badge color={statusInfo.color}>{statusInfo.text}</Badge>;
  };

  // Filtrar orders por estado antes de pasar a react-table
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Filtro por estado
      if (filterStatus && order.status !== filterStatus) {
        return false;
      }
      // Búsqueda por código
      if (searchCode && !order.code?.toLowerCase().includes(searchCode.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [orders, filterStatus, searchCode]);

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
        Header: "Código",
        accessor: "code",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Proveedor",
        accessor: "supplierName",
        Cell: ({ row }) => {
          const order = row.original;
          // Verificar si hay múltiples proveedores en los items
          if (order.items && Array.isArray(order.items) && order.items.length > 0) {
            const uniqueSuppliers = new Set();
            order.items.forEach(item => {
              if (item.supplierId != null) {
                uniqueSuppliers.add(item.supplierId);
              }
            });
            
            if (uniqueSuppliers.size > 1) {
              return (
                <span>
                  <Badge color="warning" className="mr-2" style={{ fontSize: '0.75rem' }}>
                    Múltiples
                  </Badge>
                  <span style={{ display: 'inline-block' }}>
                    {order.supplierName || `ID: ${order.supplierId}`}
                    <small className="text-muted d-block" style={{ fontSize: '0.7rem' }}>
                      ({uniqueSuppliers.size} proveedores)
                    </small>
                  </span>
                </span>
              );
            }
          }
          return <span>{order.supplierName || `ID: ${order.supplierId}`}</span>;
        },
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Fecha",
        accessor: "orderDate",
        Cell: ({ value }) => {
          if (!value) return "-";
          try {
            return new Date(value).toLocaleDateString("es-GT");
          } catch (e) {
            return value;
          }
        },
        sortType: (rowA, rowB) => {
          const a = new Date(rowA.original.orderDate || 0);
          const b = new Date(rowB.original.orderDate || 0);
          return a - b;
        },
      },
      {
        Header: "Total",
        accessor: "total",
        Cell: ({ value }) => (
          <strong>Q {parseFloat(value || 0).toFixed(2)}</strong>
        ),
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.total || 0);
          const b = parseFloat(rowB.original.total || 0);
          return a - b;
        },
        disableFilters: true,
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
                <option value="CREADA">Creada</option>
                <option value="RECIBIDA">Recibida</option>
                <option value="CANCELADA">Cancelada</option>
              </Input>
            </FormGroup>
          );
        },
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
        Cell: ({ row }) => (
          <Button
            color="info"
            size="sm"
            onClick={() => handleViewDetail(row.original.id)}
            title="Ver detalle de la orden"
          >
            Ver Detalle
          </Button>
        ),
        disableSortBy: true,
        disableFilters: true,
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
      data: filteredOrders,
      defaultColumn,
      filterTypes,
      initialState: {
        pageSize: 10,
        pageIndex: 0,
        sortBy: [{ id: "orderDate", desc: true }],
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
          <Row>
            <Col md="8">
              <CardTitle tag="h4">Órdenes de Compra</CardTitle>
            </Col>
            <Col md="4" className="text-right">
              <Button
                color="primary"
                size="sm"
                onClick={() => {
                  setSelectedOrderId(null);
                  setShowCreateModal(true);
                }}
              >
                <i className="nc-icon nc-simple-add" /> Nueva Orden
              </Button>
            </Col>
          </Row>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}

          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Filtrar por Estado</Label>
                <Input
                  type="select"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="">Todas</option>
                  <option value="CREADA">Creada</option>
                  <option value="RECIBIDA">Recibida</option>
                  <option value="CANCELADA">Cancelada</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Buscar por Código</Label>
                <Input
                  type="text"
                  placeholder="Ej: OC-00001"
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>&nbsp;</Label>
                <div>
                  <Button
                    color="secondary"
                    size="sm"
                    onClick={() => {
                      setFilterStatus("");
                      setSearchCode("");
                    }}
                  >
                    Limpiar Filtros
                  </Button>
                </div>
              </FormGroup>
            </Col>
          </Row>

          {loading && filteredOrders.length === 0 ? (
            <div className="text-center py-5">
              <Spinner color="primary" />
              <p className="mt-2">Cargando órdenes de compra...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <Alert color="info">
              {searchCode || filterStatus
                ? "No se encontraron órdenes con los filtros aplicados."
                : "No hay órdenes de compra registradas."}
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
                      placeholder="Buscar por código, proveedor..."
                    />
                  </FormGroup>
                </Col>
                <Col md="4" className="d-flex align-items-end">
                  <small className="text-muted">
                    Mostrando {page.length} de {filteredOrders.length} órdenes
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

      <PurchaseOrderDetail
        orderId={selectedOrderId}
        isOpen={showDetail || showCreateModal}
        toggle={() => {
          setShowDetail(false);
          setShowCreateModal(false);
          setSelectedOrderId(null);
        }}
        onSuccess={() => {
          loadOrders();
          setShowDetail(false);
          setShowCreateModal(false);
        }}
      />
    </div>
  );
}

export default PurchaseOrdersList;

