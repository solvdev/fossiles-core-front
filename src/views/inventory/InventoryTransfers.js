import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Badge,
  Alert,
  Spinner,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormGroup,
  Label,
  Input,
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
  getInventoryTransfers,
  createInventoryTransfer,
  createBulkInventoryTransfer,
} from "services/inventoryService";
import { getLocations } from "services/locationService";
import { getProducts } from "services/productService";
import { getMaterials } from "services/materialService";
import { getColors } from "services/colorService";
import { showError, showSuccess } from "utils/notificationHelper";
import {
  buildInventoryTransfersPrintHtml,
  openInventoryTransferPrintWindow,
} from "utils/inventoryTransferPrintHtml";

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
        bsSize="sm"
      />
    </FormGroup>
  );
}

function InventoryTransfers() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [transferMode, setTransferMode] = useState("product"); // "product" o "material"
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [colors, setColors] = useState([]);
  /** @type {Record<number, boolean>} */
  const [selectedIds, setSelectedIds] = useState({});

  // Formulario de transferencia individual
  const [formData, setFormData] = useState({
    fromLocationId: "",
    toLocationId: "",
    productId: "",
    colorId: "",
    materialId: "",
    quantity: "",
    reason: "",
  });
  
  // Formulario de transferencia masiva
  const [bulkItems, setBulkItems] = useState([]);
  const [bulkFormData, setBulkFormData] = useState({
    fromLocationId: "",
    toLocationId: "",
    reason: "",
  });

  useEffect(() => {
    loadTransfers();
    loadLocations();
    loadProducts();
    loadMaterials();
    loadColors();
  }, []);

  const loadTransfers = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getInventoryTransfers();
      setTransfers(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar las transferencias");
      showError(err.message || "Error al cargar las transferencias");
      setTransfers([]);
    } finally {
      setLoading(false);
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

  const loadProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data || []);
    } catch (err) {
      console.error("Error loading products:", err);
    }
  };

  const loadMaterials = async () => {
    try {
      const data = await getMaterials();
      setMaterials(data || []);
    } catch (err) {
      console.error("Error loading materials:", err);
    }
  };

  const loadColors = async () => {
    try {
      const data = await getColors();
      setColors(data || []);
    } catch (err) {
      console.error("Error loading colors:", err);
    }
  };

  const handleCreateTransfer = async () => {
    // Validaciones
    if (!formData.fromLocationId || !formData.toLocationId) {
      showError("Debe seleccionar ubicación origen y destino");
      return;
    }
    
    if (formData.fromLocationId === formData.toLocationId) {
      showError("La ubicación origen y destino deben ser diferentes");
      return;
    }

    if (transferMode === "product" && !formData.productId) {
      showError("Debe seleccionar un producto");
      return;
    }

    if (transferMode === "material" && !formData.materialId) {
      showError("Debe seleccionar un material");
      return;
    }

    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      showError("Debe ingresar una cantidad válida mayor a cero");
      return;
    }

    try {
      setLoading(true);
      const transferData = {
        fromLocationId: parseInt(formData.fromLocationId),
        toLocationId: parseInt(formData.toLocationId),
        quantity: parseFloat(formData.quantity),
        reason: formData.reason || "Transferencia manual",
        ...(transferMode === "product" 
          ? { 
              productId: parseInt(formData.productId),
              colorId: formData.colorId ? parseInt(formData.colorId) : null,
            }
          : { materialId: parseInt(formData.materialId) }
        ),
      };

      await createInventoryTransfer(transferData);
      showSuccess("Transferencia creada exitosamente");
      setShowCreateModal(false);
      resetForm();
      await loadTransfers();
    } catch (err) {
      showError(err.message || "Error al crear la transferencia");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBulkTransfer = async () => {
    if (!bulkFormData.fromLocationId || !bulkFormData.toLocationId) {
      showError("Debe seleccionar ubicación origen y destino");
      return;
    }
    
    if (bulkFormData.fromLocationId === bulkFormData.toLocationId) {
      showError("La ubicación origen y destino deben ser diferentes");
      return;
    }

    if (bulkItems.length === 0) {
      showError("Debe agregar al menos un ítem a la transferencia");
      return;
    }

    // Validar que todos los ítems tengan cantidad válida
    const invalidItems = bulkItems.filter(
      (item) => !item.quantity || parseFloat(item.quantity) <= 0
    );
    if (invalidItems.length > 0) {
      showError("Todos los ítems deben tener una cantidad válida mayor a cero");
      return;
    }

    try {
      setLoading(true);
      const bulkTransferData = {
        fromLocationId: parseInt(bulkFormData.fromLocationId),
        toLocationId: parseInt(bulkFormData.toLocationId),
        reason: bulkFormData.reason || "Transferencia masiva",
        items: bulkItems.map((item) => ({
          ...(transferMode === "product"
            ? { 
                productId: parseInt(item.productId),
                colorId: item.colorId ? parseInt(item.colorId) : null,
              }
            : { materialId: parseInt(item.materialId) }
          ),
          quantity: parseFloat(item.quantity),
        })),
      };

      await createBulkInventoryTransfer(bulkTransferData);
      showSuccess(`Transferencia masiva creada exitosamente (${bulkItems.length} ítems)`);
      setShowBulkModal(false);
      resetBulkForm();
      await loadTransfers();
    } catch (err) {
      showError(err.message || "Error al crear la transferencia masiva");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      fromLocationId: "",
      toLocationId: "",
      productId: "",
      colorId: "",
      materialId: "",
      quantity: "",
      reason: "",
    });
  };

  const resetBulkForm = () => {
    setBulkFormData({
      fromLocationId: "",
      toLocationId: "",
      reason: "",
    });
    setBulkItems([]);
  };

  const addBulkItem = () => {
    setBulkItems([
      ...bulkItems,
      {
        productId: transferMode === "product" ? "" : null,
        colorId: transferMode === "product" ? "" : null,
        materialId: transferMode === "material" ? "" : null,
        quantity: "",
      },
    ]);
  };

  const removeBulkItem = (index) => {
    setBulkItems(bulkItems.filter((_, i) => i !== index));
  };

  const updateBulkItem = (index, field, value) => {
    const updated = [...bulkItems];
    updated[index] = { ...updated[index], [field]: value };
    setBulkItems(updated);
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

  const printTransferSlips = (rows) => {
    const html = buildInventoryTransfersPrintHtml(rows);
    if (!openInventoryTransferPrintWindow(html)) {
      showError("Permita ventanas emergentes para imprimir.");
    }
  };

  const toggleSelectTransfer = (id) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const clearTransferSelection = () => setSelectedIds({});

  const printSelectedTransferSlips = () => {
    const rows = transfers.filter((t) => selectedIds[t.id]);
    if (!rows.length) {
      showError("Seleccione al menos una transferencia (columna Sel.).");
      return;
    }
    printTransferSlips(rows);
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
        Header: "Sel.",
        id: "_select",
        disableFilters: true,
        Cell: ({ row }) => (
          <Input
            type="checkbox"
            bsSize="sm"
            className="mt-0"
            checked={!!selectedIds[row.original.id]}
            onChange={() => toggleSelectTransfer(row.original.id)}
            title="Incluir en impresión múltiple"
          />
        ),
      },
      {
        Header: "Código",
        accessor: "code",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Tipo",
        accessor: "transferType",
        Cell: ({ value }) => (
          <Badge color={value === "PRODUCT" ? "info" : "primary"}>
            {value === "PRODUCT" ? "Producto" : "Material"}
          </Badge>
        ),
      },
      {
        Header: "Item",
        id: "itemName",
        Cell: ({ row }) => {
          return row.original.productName || row.original.materialName || "N/A";
        },
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Color",
        accessor: "colorName",
        Cell: ({ value }) =>
          value ? <Badge color="secondary">{value}</Badge> : <span className="text-muted">-</span>,
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Cantidad",
        accessor: "quantity",
        Cell: ({ value }) => parseFloat(value || 0).toFixed(3),
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.quantity || 0);
          const b = parseFloat(rowB.original.quantity || 0);
          return a - b;
        },
      },
      {
        Header: "Desde",
        accessor: "fromLocationName",
        Cell: ({ row }) => {
          const locationName = row.original.fromLocationName || "N/A";
          const locationCode = row.original.fromLocationCode;
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
        Header: "Hacia",
        accessor: "toLocationName",
        Cell: ({ row }) => {
          const locationName = row.original.toLocationName || "N/A";
          const locationCode = row.original.toLocationCode;
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
        Header: "Fecha",
        accessor: "transferDate",
        Cell: ({ value }) => {
          if (!value) return "N/A";
          try {
            const date = new Date(value);
            return date.toLocaleString("es-GT", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
          } catch (e) {
            return value;
          }
        },
        sortType: (rowA, rowB) => {
          const a = new Date(rowA.original.transferDate || 0);
          const b = new Date(rowB.original.transferDate || 0);
          return a - b;
        },
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
                bsSize="sm"
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendiente</option>
                <option value="COMPLETED">Completada</option>
                <option value="CANCELLED">Cancelada</option>
              </Input>
            </FormGroup>
          );
        },
      },
      {
        Header: "Motivo",
        accessor: "reason",
        Cell: ({ value }) => <small>{value || "N/A"}</small>,
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
        Header: "Boleta",
        id: "_slip",
        disableFilters: true,
        Cell: ({ row }) => (
          <Button
            color="info"
            outline
            size="sm"
            onClick={() => printTransferSlips([row.original])}
          >
            Imprimir
          </Button>
        ),
      },
    ],
    [selectedIds]
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
      data: transfers,
      defaultColumn,
      filterTypes,
      initialState: {
        pageSize: 10,
        pageIndex: 0,
        sortBy: [{ id: "transferDate", desc: true }],
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
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Transferencias de Inventario</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="dark"
                    outline
                    size="sm"
                    onClick={printSelectedTransferSlips}
                    className="mr-2"
                    disabled={loading}
                  >
                    Imprimir selección
                  </Button>
                  <Button
                    color="secondary"
                    outline
                    size="sm"
                    onClick={clearTransferSelection}
                    className="mr-2"
                    disabled={loading}
                  >
                    Quitar selección
                  </Button>
                  <Button
                    color="success"
                    size="sm"
                    onClick={() => setShowBulkModal(true)}
                    className="mr-2"
                    disabled={loading}
                  >
                    <i className="nc-icon nc-simple-add mr-1" />
                    Transferencia Masiva
                  </Button>
                  <Button
                    color="primary"
                    size="sm"
                    onClick={() => setShowCreateModal(true)}
                    disabled={loading}
                  >
                    <i className="nc-icon nc-simple-add mr-1" />
                    Nueva Transferencia
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && (
                <Alert color="danger" className="mt-3">
                  {error}
                </Alert>
              )}

              {loading && transfers.length === 0 ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-2">Cargando transferencias...</p>
                </div>
              ) : transfers.length === 0 ? (
                <Alert color="info" className="mt-3">
                  No hay transferencias registradas. Haz clic en "Nueva Transferencia" para crear una.
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
                          placeholder="Buscar por código, item, ubicación..."
                        />
                      </FormGroup>
                    </Col>
                    <Col md="4" className="d-flex align-items-end">
                      <small className="text-muted">
                        Mostrando {page.length} de {transfers.length} transferencias
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

      {/* Modal para crear transferencia individual */}
      <Modal isOpen={showCreateModal} toggle={() => setShowCreateModal(false)} size="lg">
        <ModalHeader toggle={() => setShowCreateModal(false)}>
          Nueva Transferencia de Inventario
        </ModalHeader>
        <ModalBody>
          <Row>
            <Col md="12" className="mb-3">
              <FormGroup>
                <Label>Tipo de Transferencia</Label>
                <Input
                  type="select"
                  value={transferMode}
                  onChange={(e) => {
                    setTransferMode(e.target.value);
                    setFormData({ ...formData, productId: "", colorId: "", materialId: "" });
                  }}
                >
                  <option value="product">Producto</option>
                  <option value="material">Material</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Ubicación Origen *</Label>
                <Input
                  type="select"
                  value={formData.fromLocationId}
                  onChange={(e) =>
                    setFormData({ ...formData, fromLocationId: e.target.value })
                  }
                >
                  <option value="">Seleccione...</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Ubicación Destino *</Label>
                <Input
                  type="select"
                  value={formData.toLocationId}
                  onChange={(e) =>
                    setFormData({ ...formData, toLocationId: e.target.value })
                  }
                >
                  <option value="">Seleccione...</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>{transferMode === "product" ? "Producto *" : "Material *"}</Label>
                <Input
                  type="select"
                  value={
                    transferMode === "product"
                      ? formData.productId
                      : formData.materialId
                  }
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      [transferMode === "product" ? "productId" : "materialId"]:
                        e.target.value,
                    })
                  }
                >
                  <option value="">Seleccione...</option>
                  {transferMode === "product"
                    ? products.map((prod) => (
                        <option key={prod.id} value={prod.id}>
                          {prod.code} - {prod.name}
                        </option>
                      ))
                    : materials.map((mat) => (
                        <option key={mat.id} value={mat.id}>
                          {mat.sku} - {mat.name}
                        </option>
                      ))}
                </Input>
              </FormGroup>
            </Col>
            {transferMode === "product" && (
              <Col md="6">
                <FormGroup>
                  <Label>Color (opcional)</Label>
                  <Input
                    type="select"
                    value={formData.colorId}
                    onChange={(e) => setFormData({ ...formData, colorId: e.target.value })}
                    disabled={!formData.productId}
                  >
                    <option value="">Sin color</option>
                    {colors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Input>
                  <small className="text-muted">
                    Si el producto maneja variantes, selecciona el color para transferir la variante correcta.
                  </small>
                </FormGroup>
              </Col>
            )}
            <Col md="6">
              <FormGroup>
                <Label>Cantidad *</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: e.target.value })
                  }
                  placeholder="0.000"
                />
              </FormGroup>
            </Col>
            <Col md="12">
              <FormGroup>
                <Label>Motivo</Label>
                <Input
                  type="textarea"
                  rows="3"
                  value={formData.reason}
                  onChange={(e) =>
                    setFormData({ ...formData, reason: e.target.value })
                  }
                  placeholder="Motivo de la transferencia..."
                />
              </FormGroup>
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowCreateModal(false)}>
            Cancelar
          </Button>
          <Button color="primary" onClick={handleCreateTransfer} disabled={loading}>
            {loading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creando...
              </>
            ) : (
              "Crear Transferencia"
            )}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal para transferencia masiva */}
      <Modal isOpen={showBulkModal} toggle={() => setShowBulkModal(false)} size="xl">
        <ModalHeader toggle={() => setShowBulkModal(false)}>
          Transferencia Masiva de Inventario
        </ModalHeader>
        <ModalBody>
          <Row>
            <Col md="12" className="mb-3">
              <FormGroup>
                <Label>Tipo de Transferencia</Label>
                <Input
                  type="select"
                  value={transferMode}
                  onChange={(e) => {
                    setTransferMode(e.target.value);
                    setBulkItems([]);
                  }}
                >
                  <option value="product">Producto</option>
                  <option value="material">Material</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Ubicación Origen *</Label>
                <Input
                  type="select"
                  value={bulkFormData.fromLocationId}
                  onChange={(e) =>
                    setBulkFormData({
                      ...bulkFormData,
                      fromLocationId: e.target.value,
                    })
                  }
                >
                  <option value="">Seleccione...</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Ubicación Destino *</Label>
                <Input
                  type="select"
                  value={bulkFormData.toLocationId}
                  onChange={(e) =>
                    setBulkFormData({
                      ...bulkFormData,
                      toLocationId: e.target.value,
                    })
                  }
                >
                  <option value="">Seleccione...</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col md="12">
              <FormGroup>
                <Label>Motivo</Label>
                <Input
                  type="textarea"
                  rows="2"
                  value={bulkFormData.reason}
                  onChange={(e) =>
                    setBulkFormData({ ...bulkFormData, reason: e.target.value })
                  }
                  placeholder="Motivo de la transferencia masiva..."
                />
              </FormGroup>
            </Col>
            <Col md="12">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <Label>
                  <strong>Ítems ({bulkItems.length})</strong>
                </Label>
                <Button color="success" size="sm" onClick={addBulkItem}>
                  <i className="nc-icon nc-simple-add mr-1" />
                  Agregar Ítem
                </Button>
              </div>
              {bulkItems.length === 0 ? (
                <Alert color="info">
                  No hay ítems agregados. Haz clic en "Agregar Ítem" para comenzar.
                </Alert>
              ) : (
                <div className="table-responsive">
                  <Table size="sm" bordered>
                    <thead>
                      <tr>
                        <th>{transferMode === "product" ? "Producto" : "Material"}</th>
                        {transferMode === "product" && <th>Color</th>}
                      <th>Cantidad</th>
                        <th width="80">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                      {bulkItems.map((item, index) => (
                        <tr key={index}>
                          <td>
                            <Input
                              type="select"
                              value={
                                transferMode === "product"
                                  ? item.productId || ""
                                  : item.materialId || ""
                              }
                              onChange={(e) =>
                                updateBulkItem(
                                  index,
                                  transferMode === "product"
                                    ? "productId"
                                    : "materialId",
                                  e.target.value
                                )
                              }
                            >
                              <option value="">Seleccione...</option>
                              {transferMode === "product"
                                ? products.map((prod) => (
                                    <option key={prod.id} value={prod.id}>
                                      {prod.code} - {prod.name}
                                    </option>
                                  ))
                                : materials.map((mat) => (
                                    <option key={mat.id} value={mat.id}>
                                      {mat.sku} - {mat.name}
                                    </option>
                                  ))}
                            </Input>
                          </td>
                          {transferMode === "product" && (
                            <td>
                              <Input
                                type="select"
                                value={item.colorId || ""}
                                onChange={(e) => updateBulkItem(index, "colorId", e.target.value)}
                                disabled={!item.productId}
                              >
                                <option value="">Sin color</option>
                                {colors.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </Input>
                            </td>
                          )}
                          <td>
                            <Input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={item.quantity}
                              onChange={(e) =>
                                updateBulkItem(index, "quantity", e.target.value)
                              }
                              placeholder="0.000"
                            />
                          </td>
                          <td>
                            <Button
                              color="danger"
                              size="sm"
                              onClick={() => removeBulkItem(index)}
                            >
                              <i className="nc-icon nc-simple-remove" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                </div>
              )}
        </Col>
      </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowBulkModal(false)}>
            Cancelar
          </Button>
          <Button
            color="primary"
            onClick={handleCreateBulkTransfer}
            disabled={loading || bulkItems.length === 0}
          >
            {loading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creando...
              </>
            ) : (
              `Crear Transferencia (${bulkItems.length} ítems)`
            )}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default InventoryTransfers;
