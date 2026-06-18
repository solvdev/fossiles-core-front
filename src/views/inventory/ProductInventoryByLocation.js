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
  Button,
  ButtonGroup,
  FormGroup,
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
  getProductInventoryByLocation, 
  getProductInventoryByLocationVariants,
  getAllProductInventory, 
  initializeMissingProductInventory, 
  getProductInventoryByCategory, 
  getAggregatedProductInventoryByCategory 
} from "services/productInventoryService";
import { getLocations } from "services/locationService";
import { getProductCategories } from "services/productCategoryService";
import { showError, showSuccess } from "utils/notificationHelper";
import * as XLSX from "xlsx";
import InventoryKardex from "views/inventory/InventoryKardex";
import EmbeddedInventoryTransferModal from "components/inventory/EmbeddedInventoryTransferModal";
import ProductInventoryOutflowReportModal from "components/inventory/ProductInventoryOutflowReportModal";
import { useAuth } from "contexts/AuthContext";
import {
  formatInventorySizesLine,
  hasInventorySizeBreakdown,
  flattenInventoryVariantsToSizeRows,
} from "utils/inventoryVariantHelper";

const PRODUCT_INVENTORY_EXCEL_COLS = 8;

function stockStatusLabelForExcel(currentStock, min) {
  if (currentStock === 0) return "Sin stock";
  const minimum = parseFloat(min || 0);
  if (currentStock < minimum) return "Bajo";
  return "Normal";
}

function itemToExcelInventoryRow(item) {
  const qty = parseFloat(item.quantity || 0);
  return {
    "Código": item.productCode || "N/A",
    "Producto": item.productName || "N/A",
    "Categoría": item.productCategoryName || "—",
    "Color": item.colorName || (item.colorId ? `Color #${item.colorId}` : "Sin color"),
    "Tallas": formatInventorySizesLine(item.sizes) || "—",
    "Stock Actual": qty.toFixed(3),
    "Stock Mínimo": item.min ?? "N/A",
    "Estado": stockStatusLabelForExcel(qty, item.min),
  };
}

function VariantsColorSizeTable({ variants }) {
  const filtered = (variants || []).filter((v) => {
    const qty = parseFloat(v.quantity || 0);
    const isNoColor = !v.colorId && !v.colorName;
    return !(isNoColor && qty === 0 && !hasInventorySizeBreakdown(v.sizes));
  });
  const sizeRows = flattenInventoryVariantsToSizeRows(filtered);
  if (sizeRows.some((r) => r.size)) {
    return (
      <div className="table-responsive">
        <Table striped size="sm" className="mb-0">
          <thead>
            <tr>
              <th>Color</th>
              <th>Talla</th>
              <th className="text-right">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            {sizeRows.map((r) => (
              <tr key={r.key}>
                <td>{r.colorName}</td>
                <td>
                  <strong>{r.size}</strong>
                </td>
                <td className="text-right">{r.quantity.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ backgroundColor: "#f8f9fa", fontWeight: "700" }}>
              <td colSpan={2} className="text-right">
                TOTAL:
              </td>
              <td className="text-right">{sizeRows.reduce((s, r) => s + r.quantity, 0).toFixed(3)}</td>
            </tr>
          </tfoot>
        </Table>
      </div>
    );
  }
  return (
    <div className="table-responsive">
      <Table striped size="sm">
        <thead>
          <tr>
            <th>Color</th>
            <th>Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((v) => (
            <tr key={v.id || `${v.productId}-${v.locationId}-${v.colorId || "null"}`}>
              <td>{v.colorName || <span className="text-muted">Sin color</span>}</td>
              <td>
                <strong>{parseFloat(v.quantity || 0).toFixed(3)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ backgroundColor: "#f8f9fa", fontWeight: "700" }}>
            <td className="text-right">TOTAL:</td>
            <td>{filtered.reduce((sum, v) => sum + (parseFloat(v.quantity || 0) || 0), 0).toFixed(3)}</td>
          </tr>
        </tfoot>
      </Table>
    </div>
  );
}

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

function ProductInventoryByLocation() {
  const { hasPermission } = useAuth();
  const canProductKardex = hasPermission("INVENTARIOS.KARDEX_PRODUCTOS.VER");
  const canTransferProduct = hasPermission("INVENTARIOS.TRANSFERENCIAS.CREAR");

  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedKiosk, setSelectedKiosk] = useState("");
  const [inventory, setInventory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [kiosks, setKiosks] = useState([]);
  const [min, setMin] = useState(0);
  const [otherLocations, setOtherLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState("");
  const [showVariantsModal, setShowVariantsModal] = useState(false);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState("");
  const [selectedVariantsProduct, setSelectedVariantsProduct] = useState(null);
  const [selectedVariantsLocation, setSelectedVariantsLocation] = useState(null);
  const [variants, setVariants] = useState([]);
  const [productKardexContext, setProductKardexContext] = useState(null);
  const [productTransferContext, setProductTransferContext] = useState(null);
  const [showExcelExportModal, setShowExcelExportModal] = useState(false);
  const [showOutflowReportModal, setShowOutflowReportModal] = useState(false);
  const [excelCategoryList, setExcelCategoryList] = useState([]);
  const [excelExportCategoryId, setExcelExportCategoryId] = useState("");
  const [excelExporting, setExcelExporting] = useState(false);
  /** Kiosko/ubicación concreta: filas por color (+ tallas en sizes). */
  const [inventoryByColorVariant, setInventoryByColorVariant] = useState(false);

  useEffect(() => {
    // Permite abrir esta vista prefiltrada desde otras pantallas
    // Ej: /admin/product-inventory-by-location?category=DEVOLUCION
    try {
      const params = new URLSearchParams(window.location.search || "");
      const category = String(params.get("category") || "").trim().toUpperCase();
      if (category && !selectedCategory) {
        setSelectedCategory(category);
      }
    } catch (_err) {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    // Cuando cambia la categoría, separar ubicaciones.
    // KIOSKO es una categoría/tipo de ubicación, no cualquier ubicación del sistema.
    if (locations.length > 0) {
      const kioskList = locations.filter(loc => {
        const categoriaUpper = String(loc.categoria || "").toUpperCase().trim();
        return categoriaUpper === "KIOSKO";
      });
      setKiosks(kioskList);
      
      // Separar otras ubicaciones (para otras categorías si es necesario)
      const othersList = locations.filter(loc => {
        if (!loc.categoria) return false;
        const categoriaUpper = loc.categoria.toUpperCase().trim();
        // Excluir solo las que son explícitamente otras categorías
        return categoriaUpper !== "BODEGA_PT" && 
               categoriaUpper !== "BODEGA_MP" &&
               categoriaUpper !== "VENDEDOR" &&
               categoriaUpper !== "DEVOLUCION" &&
               categoriaUpper !== "ONLINE";
      });
      setOtherLocations(othersList);
    }
  }, [locations]);

  useEffect(() => {
    // Resetear selección de kiosko cuando cambia la categoría
    if (selectedCategory !== "KIOSKO") {
      setSelectedKiosk("");
    }
  }, [selectedCategory]);

  useEffect(() => {
    // Cargar inventario según la selección
    if (selectedCategory === "KIOSKO") {
      if (selectedKiosk === "ALL") {
        // Inventario agregado de todos los kioskos
        loadAggregatedKiosksInventory();
      } else if (selectedKiosk) {
        // Inventario de un kiosko específico
        loadInventory(selectedKiosk);
      } else {
        setInventory([]);
      }
    } else if (selectedCategory && selectedCategory !== "KIOSKO") {
      // Para Bodega PT, Vendedor, Online: cargar automáticamente
      loadCategoryInventory();
    } else {
      setInventory([]);
    }
  }, [selectedCategory, selectedLocation, selectedKiosk]);

  const loadLocations = async () => {
    try {
      const data = await getLocations();
      setLocations(data || []);
    } catch (err) {
      console.error("Error loading locations:", err);
    }
  };

  const loadInventory = async (locationId) => {
    try {
      setLoading(true);
      setError("");
      const loc =
        locations.find((l) => String(l.id) === String(locationId)) ||
        kiosks.find((l) => String(l.id) === String(locationId));
      const variantRows = await getProductInventoryByLocationVariants(locationId);
      const enriched = (variantRows || []).map((r) => ({
        ...r,
        locationId: r.locationId || locationId,
        locationName: r.locationName || loc?.name || loc?.code || "",
        locationCode: r.locationCode || loc?.code || "",
      }));
      setInventoryByColorVariant(true);
      setInventory(enriched);
    } catch (err) {
      setError(err.message || "Error al cargar el inventario de productos");
      showError(err.message || "Error al cargar el inventario de productos");
      setInventory([]);
    } finally {
      setLoading(false);
    }
  };

  const openVariants = async (productId, locationId, productName, colorIdFilter = null) => {
    try {
      setShowVariantsModal(true);
      setVariantsLoading(true);
      setVariantsError("");
      setVariants([]);
      setSelectedVariantsProduct({ productId, productName, colorIdFilter });
      setSelectedVariantsLocation(locationId);

      const data = await getProductInventoryByLocationVariants(locationId);
      let rows = (data || []).filter((r) => r.productId === productId);
      if (colorIdFilter != null && String(colorIdFilter).trim() !== "") {
        rows = rows.filter((r) => String(r.colorId || "") === String(colorIdFilter));
      }
      // Ordenar: sin color al final, luego por nombre
      rows.sort((a, b) => {
        const aName = a.colorName || "ZZZ";
        const bName = b.colorName || "ZZZ";
        return aName.localeCompare(bName);
      });
      setVariants(rows);
    } catch (err) {
      setVariantsError(err.message || "Error al cargar variantes");
    } finally {
      setVariantsLoading(false);
    }
  };

  const loadCategoryInventory = async () => {
    try {
      setLoading(true);
      setError("");
      setInventoryByColorVariant(false);
      const data = await getProductInventoryByCategory(selectedCategory);
      setInventory(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar el inventario de productos");
      showError(err.message || "Error al cargar el inventario de productos");
      setInventory([]);
    } finally {
      setLoading(false);
    }
  };

  const loadAggregatedKiosksInventory = async () => {
    try {
      setLoading(true);
      setError("");
      setInventoryByColorVariant(false);
      const data = await getAggregatedProductInventoryByCategory("KIOSKO");
      setInventory(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar el inventario agregado");
      showError(err.message || "Error al cargar el inventario agregado");
      setInventory([]);
    } finally {
      setLoading(false);
    }
  };

  const getStockStatus = (currentStock, min) => {
    if (currentStock === 0) return { color: "danger", text: "Sin stock" };
    const minimum = parseFloat(min || 0);
    if (currentStock < minimum) return { color: "warning", text: "Bajo" };
    return { color: "success", text: "Normal" };
  };

  // Calcular totales por producto cuando hay múltiples ubicaciones
  const inventoryWithTotals = useMemo(() => {
    if (!inventory || inventory.length === 0) return [];
    
    // Agrupar por producto
    const grouped = inventory.reduce((acc, item) => {
      const key = item.productId;
      if (!acc[key]) {
        acc[key] = {
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          locations: [],
          totalQuantity: 0,
        };
      }
      acc[key].locations.push(item);
      acc[key].totalQuantity += parseFloat(item.quantity || 0);
      return acc;
    }, {});

    // Si hay múltiples ubicaciones para un producto, agregar fila de total
    const result = [];
    Object.values(grouped).forEach((group) => {
      if (group.locations.length > 1) {
        // Agregar todas las ubicaciones
        group.locations.forEach((loc) => {
          result.push({
            ...loc,
            isTotalRow: false,
            productTotal: group.totalQuantity,
            hasMultipleLocations: true,
          });
        });
        // Agregar fila de total
        result.push({
          productId: group.productId,
          productCode: group.productCode,
          productName: group.productName,
          locationName: "TOTAL GENERAL",
          locationCode: "",
          quantity: group.totalQuantity,
          min: group.locations[0]?.min || 0,
          isTotalRow: true,
          hasMultipleLocations: true,
        });
      } else {
        // Solo una ubicación, agregar normalmente
        result.push({
          ...group.locations[0],
          isTotalRow: false,
          hasMultipleLocations: false,
        });
      }
    });

    return result;
  }, [inventory]);

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
      ...(inventoryByColorVariant
        ? [
            {
              Header: "Color",
              accessor: "colorName",
              Cell: ({ value, row }) => {
                const item = row.original;
                if (item.isTotalRow) return null;
                return value ? (
                  <Badge color="dark" style={{ fontSize: "11px" }}>
                    {value}
                  </Badge>
                ) : (
                  <span className="text-muted small">Sin color</span>
                );
              },
              Filter: DefaultColumnFilter,
              filter: "fuzzyText",
            },
          ]
        : []),
      {
        Header: "Ubicación",
        accessor: "locationName",
        Cell: ({ row }) => {
          const item = row.original;
          return (
            <span className={item.isTotalRow ? "font-weight-bold" : ""}>
              {item.locationName || "N/A"}
              {item.locationCode && !item.isTotalRow && ` (${item.locationCode})`}
            </span>
          );
        },
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Stock Actual",
        accessor: "quantity",
        Cell: ({ row }) => {
          const item = row.original;
          const numValue = parseFloat(item.quantity || 0);
          const isTotal = item.isTotalRow;
          const sizesLine = !isTotal ? formatInventorySizesLine(item.sizes) : null;
          return (
            <strong className={numValue === 0 ? "text-muted" : isTotal ? "text-primary" : ""}>
              {numValue.toFixed(3)}
              {sizesLine && (
                <span className="d-block small font-weight-normal text-muted" title="Por talla">
                  {sizesLine}
                </span>
              )}
              {numValue === 0 && !isTotal && (
                <small className="text-muted d-block">Sin stock</small>
              )}
            </strong>
          );
        },
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.quantity || 0);
          const b = parseFloat(rowB.original.quantity || 0);
          return a - b;
        },
      },
      {
        Header: "Stock Mínimo",
        accessor: "min",
        Cell: ({ value }) => value || "N/A",
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.min || 0);
          const b = parseFloat(rowB.original.min || 0);
          return a - b;
        },
      },
      {
        Header: "Estado",
        id: "status",
        Cell: ({ row }) => {
          if (row.original.isTotalRow) return null;
          const status = getStockStatus(
            parseFloat(row.original.quantity || 0),
            row.original.min || 0
          );
          return <Badge color={status.color}>{status.text}</Badge>;
        },
        disableSortBy: true,
        disableFilters: true,
      },
      {
        Header: "Variantes",
        id: "variants",
        Cell: ({ row }) => {
          const item = row.original;
          if (item.isTotalRow) return null;
          const locationId = item.locationId || selectedKiosk || selectedLocation;
          if (!locationId) return null;
          const hasSizes = hasInventorySizeBreakdown(item.sizes);
          if (inventoryByColorVariant) {
            if (!hasSizes) return <span className="text-muted small">—</span>;
            return (
              <Button
                color="link"
                size="sm"
                style={{ padding: 0 }}
                onClick={() => openVariants(item.productId, locationId, item.productName, item.colorId)}
                title="Ver desglose por talla"
              >
                Tallas
              </Button>
            );
          }
          return (
            <Button
              color="link"
              size="sm"
              style={{ padding: 0 }}
              onClick={() => openVariants(item.productId, locationId, item.productName)}
              title="Ver detalle por color y talla"
            >
              Ver
            </Button>
          );
        },
        disableSortBy: true,
        disableFilters: true,
      },
      {
        Header: "Acciones",
        id: "rowActions",
        Cell: ({ row }) => {
          const item = row.original;
          if (item.isTotalRow) return null;
          const locationId =
            item.locationId ||
            (selectedKiosk && selectedKiosk !== "ALL" ? selectedKiosk : null) ||
            selectedLocation ||
            null;
          const label = `${item.productCode || ""} — ${item.productName || ""}`.trim();
          return (
            <ButtonGroup size="sm" className="flex-wrap">
              {canProductKardex && (
                <Button
                  color="secondary"
                  outline
                  title="Kardex del producto"
                  onClick={() =>
                    setProductKardexContext({
                      productId: item.productId,
                      productCode: item.productCode,
                      productName: item.productName,
                      colorId: item.colorId,
                      colorName: item.colorName,
                      quantity: item.quantity,
                      locationId,
                      label: [label, item.colorName].filter(Boolean).join(" · "),
                      locationName: item.locationName,
                    })
                  }
                >
                  <i className="nc-icon nc-chart-bar-32 mr-1" />
                  Kardex
                </Button>
              )}
              {canTransferProduct && (
                <Button
                  color="primary"
                  outline
                  title="Transferir stock"
                  onClick={() =>
                    setProductTransferContext({
                      productId: item.productId,
                      productCode: item.productCode,
                      productName: item.productName,
                      colorId: item.colorId,
                      colorName: item.colorName,
                      quantity: item.quantity,
                      fromLocationId: locationId,
                      label: [label, item.colorName].filter(Boolean).join(" · "),
                      locationName: item.locationName,
                    })
                  }
                >
                  <i className="nc-icon nc-share-66 mr-1" />
                  Transferir
                </Button>
              )}
            </ButtonGroup>
          );
        },
        disableSortBy: true,
        disableFilters: true,
      },
    ],
    [inventoryByColorVariant, selectedKiosk, selectedLocation, canProductKardex, canTransferProduct]
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
      data: inventoryWithTotals,
      defaultColumn,
      filterTypes,
      initialState: {
        pageSize: 10,
        pageIndex: 0,
        sortBy: [{ id: "productCode", desc: false }],
      },
    },
    useFilters,
    useGlobalFilter,
    useSortBy,
    usePagination
  );

  const { globalFilter, pageIndex, pageSize } = state;

  const handleInitializeInventory = async () => {
    if (!selectedCategory) {
      showError("Debe seleccionar un tipo de ubicación primero");
      return;
    }

    // Para KIOSKO, puede seleccionar un kiosko específico o "Todos los Kioskos"
    let locationIdToUse = null;
    if (selectedCategory === "KIOSKO") {
      if (!selectedKiosk) {
        showError("Debe seleccionar un kiosko específico o 'Todos los Kioskos' para actualizar el inventario");
        return;
      }
      if (selectedKiosk !== "ALL") {
        locationIdToUse = selectedKiosk;
      }
      // Si es "ALL", locationIdToUse queda null y se usarán todas las ubicaciones de la categoría
    }

    const categoryName = selectedCategory === "KIOSKO" ? "kioskos" :
                        selectedCategory === "BODEGA_PT" ? "Bodega Producto Terminado" :
                        selectedCategory === "VENDEDOR" ? "Vendedores" :
                        selectedCategory === "DEVOLUCION" ? "Devoluciones" :
                        selectedCategory === "ONLINE" ? "Online" : selectedCategory;

    // Determinar el nombre de la ubicación seleccionada para el mensaje
    const selectedLocationName = selectedCategory === "KIOSKO" && selectedKiosk && selectedKiosk !== "ALL"
      ? kiosks.find(k => k.id === parseInt(selectedKiosk))?.name || "este kiosko"
      : null;

    if (!window.confirm(
      selectedCategory === "KIOSKO" && selectedKiosk === "ALL"
        ? `¿Desea actualizar el inventario de productos para TODOS los kioskos? Se compararán todos los productos existentes con los que están en inventario y se crearán registros con cantidad 0 para los productos faltantes en todas las ubicaciones de kioskos (${kiosks.length} ubicaciones).`
        : selectedCategory === "KIOSKO" && selectedKiosk && selectedKiosk !== "ALL"
        ? `¿Desea actualizar el inventario de productos para el kiosko "${selectedLocationName}"? Se compararán todos los productos existentes con los que están en inventario y se crearán registros con cantidad 0 para los productos faltantes SOLO en esta ubicación.`
        : `¿Desea actualizar el inventario de productos para ${categoryName}? Se compararán todos los productos existentes con los que están en inventario y se crearán registros con cantidad 0 para los productos faltantes en todas las ubicaciones de esta categoría.`
    )) {
      return;
    }

    try {
      setInitializing(true);
      setError("");
      
      // Enviar categoría y locationId (si aplica)
      const result = await initializeMissingProductInventory(selectedCategory, locationIdToUse);
      
      showSuccess(
        `Inventario de productos actualizado correctamente. Se crearon ${result.createdCount} registros nuevos para ${categoryName}.`
      );
      
      // Recargar inventario según el tipo
      if (selectedCategory === "KIOSKO") {
        if (selectedKiosk === "ALL") {
          await loadAggregatedKiosksInventory();
        } else {
          await loadInventory(selectedKiosk);
        }
      } else if (selectedCategory && selectedCategory !== "KIOSKO") {
        await loadCategoryInventory();
      }
    } catch (err) {
      const errorMessage = err.message || "Error al actualizar inventario de productos";
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setInitializing(false);
    }
  };

  const getCurrentLocationId = () => {
    if (selectedCategory === "KIOSKO") {
      return selectedKiosk && selectedKiosk !== "ALL" ? selectedKiosk : null;
    } else if (selectedCategory && selectedCategory !== "KIOSKO") {
      return selectedCategory;
    }
    return selectedLocation;
  };

  const getLocationIdForInitialize = () => {
    // El botón está habilitado si hay una categoría seleccionada
    if (!selectedCategory) return false;
    
    // Para KIOSKO, necesita seleccionar una opción (específico o "ALL")
    if (selectedCategory === "KIOSKO") {
      return selectedKiosk && selectedKiosk !== "";
    }
    
    // Para otras categorías, el botón está habilitado
    return true;
  };

  const openExcelExportModal = async () => {
    if (inventory.length === 0) {
      showError("No hay datos para exportar");
      return;
    }
    try {
      if (!excelCategoryList.length) {
        const list = await getProductCategories();
        setExcelCategoryList(Array.isArray(list) ? list : []);
      }
    } catch (e) {
      showError(e.message || "No se pudieron cargar las categorías");
      return;
    }
    setExcelExportCategoryId("");
    setShowExcelExportModal(true);
  };

  const resolveRowsForExcelExport = async (sourceRows) => {
    const hasColorInRows = sourceRows.some(
      (r) => r.colorId != null || (r.colorName && String(r.colorName).trim())
    );
    if (inventoryByColorVariant || hasColorInRows) {
      return sourceRows;
    }

    const locationIds = [
      ...new Set(sourceRows.map((r) => r.locationId).filter((id) => id != null && id !== "")),
    ];
    if (!locationIds.length) {
      return sourceRows;
    }

    const locMeta = new Map();
    sourceRows.forEach((r) => {
      if (r.locationId != null) {
        locMeta.set(String(r.locationId), {
          locationName: r.locationName,
          locationCode: r.locationCode,
        });
      }
    });

    const batches = await Promise.all(
      locationIds.map(async (locationId) => {
        const rows = await getProductInventoryByLocationVariants(locationId);
        const meta = locMeta.get(String(locationId)) || {};
        return (rows || []).map((r) => ({
          ...r,
          locationId: r.locationId || locationId,
          locationName: r.locationName || meta.locationName || "",
          locationCode: r.locationCode || meta.locationCode || "",
        }));
      })
    );

    let merged = batches.flat();
    if (excelExportCategoryId !== "") {
      const cid = Number(excelExportCategoryId);
      merged = merged.filter((it) => Number(it.productCategoryId) === cid);
    }
    return merged;
  };

  const executeExcelExport = async () => {
    let sourceRows = [...inventory];
    if (excelExportCategoryId !== "") {
      const cid = Number(excelExportCategoryId);
      sourceRows = inventory.filter((it) => Number(it.productCategoryId) === cid);
    }
    if (sourceRows.length === 0) {
      showError("No hay datos para exportar con la categoría elegida");
      return;
    }

    setExcelExporting(true);
    try {
      const exportRows = await resolveRowsForExcelExport(sourceRows);
      if (!exportRows.length) {
        showError("No hay datos para exportar con la categoría elegida");
        return;
      }

      const workbook = XLSX.utils.book_new();

      // Agrupar inventario por ubicación (una fila por producto + color)
      const inventoryByLocation = exportRows.reduce((acc, item) => {
        const locationKey = item.locationId || "SIN_UBICACION";
        const locationName = item.locationName || "Sin Ubicación";
        
        if (!acc[locationKey]) {
          acc[locationKey] = {
            locationName: locationName,
            locationCode: item.locationCode || "",
            items: [],
          };
        }
        
        acc[locationKey].items.push(itemToExcelInventoryRow(item));
        
        return acc;
      }, {});

      // Crear una hoja por cada ubicación
      Object.values(inventoryByLocation).forEach((locationData) => {
        const worksheet = XLSX.utils.json_to_sheet(locationData.items);
        
        // Agregar encabezado con información de la ubicación
        const headerRow = Array.from({ length: PRODUCT_INVENTORY_EXCEL_COLS }, (_, i) =>
          i === 0 ? { v: `Inventario - ${locationData.locationName}`, t: "s" } : { v: "", t: "s" }
        );
        XLSX.utils.sheet_add_aoa(worksheet, [headerRow], { origin: "A1" });
        
        // Agregar fila de totales
        const totalStock = locationData.items.reduce(
          (sum, item) => sum + parseFloat(item["Stock Actual"] || 0),
          0
        );
        const totalRow = [
          { v: "TOTAL", t: "s" },
          { v: "", t: "s" },
          { v: "", t: "s" },
          { v: "", t: "s" },
          { v: "", t: "s" },
          { v: totalStock.toFixed(3), t: "n" },
          { v: "", t: "s" },
          { v: "", t: "s" },
        ];
        XLSX.utils.sheet_add_aoa(worksheet, [totalRow], {
          origin: `A${locationData.items.length + 3}`,
        });

        // Ajustar ancho de columnas
        worksheet["!cols"] = [
          { wch: 15 }, // Código
          { wch: 36 }, // Producto
          { wch: 22 }, // Categoría
          { wch: 18 }, // Color
          { wch: 28 }, // Tallas
          { wch: 15 }, // Stock Actual
          { wch: 15 }, // Stock Mínimo
          { wch: 12 }, // Estado
        ];

        // Nombre de la hoja (máximo 31 caracteres)
        const sheetName = locationData.locationName.length > 31
          ? locationData.locationName.substring(0, 28) + "..."
          : locationData.locationName;
        
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      });

      // Crear hoja resumen con totales por ubicación
      const summaryData = Object.values(inventoryByLocation).map((locationData) => {
        const totalStock = locationData.items.reduce(
          (sum, item) => sum + parseFloat(item["Stock Actual"] || 0),
          0
        );
        return {
          "Ubicación": locationData.locationName,
          "Código Ubicación": locationData.locationCode || "",
          "Total Productos": locationData.items.length,
          "Stock Total": totalStock.toFixed(3),
        };
      });

      // Agregar fila de gran total
      const grandTotal = summaryData.reduce(
        (sum, row) => sum + parseFloat(row["Stock Total"] || 0),
        0
      );
      summaryData.push({
        "Ubicación": "TOTAL GENERAL",
        "Código Ubicación": "",
        "Total Productos": exportRows.length,
        "Stock Total": grandTotal.toFixed(3),
      });

      const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData);
      summaryWorksheet["!cols"] = [
        { wch: 30 }, // Ubicación
        { wch: 20 }, // Código Ubicación
        { wch: 15 }, // Total Productos
        { wch: 15 }, // Stock Total
      ];
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, "Resumen");

      const iso = new Date().toISOString().slice(0, 10);
      const catSlug = excelExportCategoryId ? `cat-${excelExportCategoryId}` : "cat-todas";
      const fileName = `inventario_productos_${selectedCategory || "general"}_${catSlug}_${iso}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      showSuccess(
        `Archivo Excel descargado correctamente con ${Object.keys(inventoryByLocation).length} ubicaciones`
      );
      setShowExcelExportModal(false);
    } catch (err) {
      showError("Error al generar el archivo Excel");
      console.error(err);
    } finally {
      setExcelExporting(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Inventario de Productos por Ubicación</CardTitle>
                  <small className="text-muted d-block">
                    Kardex y transferencias se abren en una ventana emergente con la fila seleccionada (no navega a otra página).
                  </small>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="info"
                    size="sm"
                    onClick={() => setShowOutflowReportModal(true)}
                    className="mt-2 mr-2"
                  >
                    <i className="nc-icon nc-paper mr-1" />
                    Reporte de salidas
                  </Button>
                  <Button
                    color="success"
                    size="sm"
                    onClick={openExcelExportModal}
                    disabled={loading || inventory.length === 0}
                    className="mt-2 mr-2"
                  >
                    <i className="nc-icon nc-cloud-download-93 mr-1" />
                    Descargar Excel
                  </Button>
                  <Button
                    color="primary"
                    size="sm"
                    onClick={handleInitializeInventory}
                    disabled={initializing || loading || !getLocationIdForInitialize() || !selectedCategory}
                    className="mt-2"
                  >
                        {initializing ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Actualizando...
                      </>
                    ) : (
                      <>
                        <i className="nc-icon nc-refresh-69 mr-1" />
                        Actualizar Inventario
                      </>
                    )}
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              <Row className="mb-3">
                <Col md="4">
                  <Label>Tipo de Ubicación</Label>
                  <Input
                    type="select"
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setSelectedLocation("");
                      setSelectedKiosk("");
                    }}
                    disabled={loading || initializing}
                  >
                    <option value="">Seleccione un tipo</option>
                    <option value="BODEGA_PT">Bodega Producto Terminado</option>
                    <option value="VENDEDOR">Vendedor</option>
                    <option value="ONLINE">Online</option>
                    <option value="KIOSKO">Kiosko</option>
                    <option value="DEVOLUCION">Devoluciones</option>
                  </Input>
                </Col>

                {selectedCategory === "KIOSKO" && (
                  <Col md="4">
                    <Label>Seleccionar Kiosko</Label>
                    <Input
                      type="select"
                      value={selectedKiosk}
                      onChange={(e) => setSelectedKiosk(e.target.value)}
                      disabled={loading || initializing}
                    >
                      <option value="">Seleccione una opción</option>
                      <option value="ALL">Todos los Kioskos (Inventario General)</option>
                      {kiosks.map((kiosk) => (
                        <option key={kiosk.id} value={kiosk.id}>
                          {kiosk.name} ({kiosk.code})
                        </option>
                      ))}
                    </Input>
                  </Col>
                )}

                <Col md={selectedCategory === "KIOSKO" ? "4" : selectedCategory ? "8" : "12"} className="d-flex align-items-end">
                  <small className="text-muted">
                    {selectedCategory === "KIOSKO" && selectedKiosk === "ALL"
                      ? `Inventario general de todos los kioskos (${inventory.length} productos)`
                      : getCurrentLocationId()
                      ? `Mostrando todos los productos (${inventory.length} productos)`
                      : selectedCategory && selectedCategory !== "KIOSKO"
                      ? "Cargando inventario..."
                      : "Selecciona una opción para ver el inventario"}
                  </small>
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
                  <p className="mt-2">Cargando inventario de productos...</p>
                </div>
              ) : !selectedCategory ? (
                <Alert color="info" className="mt-3">
                  Por favor selecciona un tipo de ubicación para ver el inventario de productos.
                </Alert>
              ) : selectedCategory === "KIOSKO" && !selectedKiosk ? (
                <Alert color="info" className="mt-3">
                  Por favor selecciona "Todos los Kioskos" o un kiosko específico para ver el inventario de productos.
                </Alert>
              ) : selectedCategory && selectedCategory !== "KIOSKO" && inventory.length === 0 && !loading ? (
                <Alert color="warning" className="mt-3">
                  No hay productos registrados en inventario. Haz clic en "Actualizar Inventario" para comparar todos los productos existentes con los que están en inventario y crear registros con cantidad 0 para los productos faltantes.
                </Alert>
              ) : !getCurrentLocationId() && selectedCategory === "KIOSKO" ? (
                <Alert color="info" className="mt-3">
                  Por favor selecciona una opción de kiosko para ver el inventario de productos.
                </Alert>
              ) : inventory.length === 0 ? (
                <Alert color="warning" className="mt-3">
                  No hay productos registrados en inventario. Haz clic en "Actualizar Inventario" para comparar todos los productos existentes con los que están en inventario y crear registros con cantidad 0 para los productos faltantes.
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
                        Mostrando {page.length} de {inventoryWithTotals.length} registros
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
                          const isTotalRow = row.original.isTotalRow;
                          return (
                            <tr
                              {...row.getRowProps()}
                              className={isTotalRow ? "table-info font-weight-bold" : ""}
                            >
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

      <Modal isOpen={showExcelExportModal} toggle={() => setShowExcelExportModal(false)}>
        <ModalHeader toggle={() => setShowExcelExportModal(false)}>Exportar Excel</ModalHeader>
        <ModalBody>
          <p className="text-muted small mb-3">
            Se exportan las líneas del inventario actual, desglosadas por color y tallas cuando aplica
            (Kiosko, Bodega PT, etc.).
            Puedes acotar por categoría de catálogo de producto.
          </p>
          <FormGroup>
            <Label>Categoría de producto</Label>
            <Input
              type="select"
              bsSize="sm"
              value={excelExportCategoryId}
              onChange={(e) => setExcelExportCategoryId(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {(excelCategoryList || [])
                .slice()
                .sort((a, b) =>
                  String(a.name || "").localeCompare(String(b.name || ""), "es", {
                    sensitivity: "base",
                  })
                )
                .map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name || c.code || `#${c.id}`}
                  </option>
                ))}
            </Input>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline size="sm" onClick={() => setShowExcelExportModal(false)}>
            Cancelar
          </Button>
          <Button color="success" size="sm" onClick={() => void executeExcelExport()} disabled={excelExporting}>
            {excelExporting ? (
              <>
                <Spinner size="sm" className="mr-1" /> Preparando…
              </>
            ) : (
              "Descargar"
            )}
          </Button>
        </ModalFooter>
      </Modal>

      <ProductInventoryOutflowReportModal
        isOpen={showOutflowReportModal}
        toggle={() => setShowOutflowReportModal(false)}
      />

      {/* Modal: Variantes por Color */}
      <Modal
        isOpen={showVariantsModal}
        toggle={() => setShowVariantsModal(false)}
        size="lg"
      >
        <ModalHeader toggle={() => setShowVariantsModal(false)}>
          {selectedVariantsProduct?.colorIdFilter != null &&
          String(selectedVariantsProduct.colorIdFilter).trim() !== ""
            ? "Desglose por talla"
            : "Variantes por color y talla"}
          {selectedVariantsProduct?.productName ? ` — ${selectedVariantsProduct.productName}` : ""}
        </ModalHeader>
        <ModalBody>
          {variantsError && <Alert color="danger">{variantsError}</Alert>}
          {variantsLoading ? (
            <div className="text-center py-4">
              <Spinner color="primary" />
              <p className="mt-2">Cargando variantes...</p>
            </div>
        ) : variants.length === 0 ? (
            <Alert color="info">
              No hay variantes registradas para este producto en esta ubicación.
            </Alert>
          ) : (
            <VariantsColorSizeTable variants={variants} />
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowVariantsModal(false)}>
            Cerrar
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={!!productKardexContext}
        toggle={() => setProductKardexContext(null)}
        size="xl"
        backdrop="static"
        scrollable
      >
        <ModalHeader toggle={() => setProductKardexContext(null)}>
          {productKardexContext
            ? `Kardex — ${productKardexContext.label}${
                productKardexContext.locationName
                  ? ` · ${productKardexContext.locationName}`
                  : ""
              }`
            : "Kardex de producto"}
        </ModalHeader>
        <ModalBody>
          {productKardexContext && (
            <>
              <Alert color="light" className="border mb-3">
                <div className="small font-weight-bold text-muted mb-2">
                  Consultando en esta ventana (no cambia de página)
                </div>
                <div className="small mb-0">
                  <strong>Producto:</strong> {productKardexContext.label}
                  <br />
                  <span className="text-muted">ID:</span> {productKardexContext.productId}
                  <span className="text-muted"> · Código:</span>{" "}
                  {productKardexContext.productCode || "—"}
                  <span className="text-muted"> · Nombre:</span>{" "}
                  {productKardexContext.productName || "—"}
                  <br />
                  <span className="text-muted">Ubicación (filtro kardex):</span>{" "}
                  {productKardexContext.locationName ||
                    (productKardexContext.locationId
                      ? `ID ${productKardexContext.locationId}`
                      : "Todas las ubicaciones")}
                  <br />
                  {productKardexContext.colorName && (
                    <>
                      <span className="text-muted">Color:</span> {productKardexContext.colorName}
                      <br />
                    </>
                  )}
                  <span className="text-muted">Stock en esta fila:</span>{" "}
                  {productKardexContext.quantity != null
                    ? parseFloat(productKardexContext.quantity).toFixed(3)
                    : "—"}
                </div>
              </Alert>
              <InventoryKardex
                key={`${productKardexContext.productId}-${productKardexContext.locationId || "all"}`}
                embedded
                embeddedCompact
                lockedProductId={productKardexContext.productId}
                lockedLocationId={productKardexContext.locationId || undefined}
                narrowToProductOnly={!productKardexContext.locationId}
                lockedTitle={`Kardex — ${productKardexContext.label}${
                  productKardexContext.locationName
                    ? ` · ${productKardexContext.locationName}`
                    : ""
                }`}
              />
            </>
          )}
        </ModalBody>
      </Modal>

      <EmbeddedInventoryTransferModal
        isOpen={!!productTransferContext}
        toggle={() => setProductTransferContext(null)}
        transferMode="product"
        lockTransferMode
        initialProductId={productTransferContext?.productId}
        initialColorId={productTransferContext?.colorId || undefined}
        initialFromLocationId={productTransferContext?.fromLocationId || undefined}
        title={
          productTransferContext
            ? `Transferir — ${productTransferContext.label}`
            : "Transferir producto"
        }
        selectionSummary={
          productTransferContext ? (
            <>
              <strong>{productTransferContext.label}</strong>
              <br />
              <span className="text-muted">
                ID producto: {productTransferContext.productId}
                {productTransferContext.quantity != null &&
                  ` · Stock en esta fila: ${parseFloat(productTransferContext.quantity).toFixed(3)}`}
                {productTransferContext.locationName &&
                  ` · Ubicación origen sugerida: ${productTransferContext.locationName}`}
                {!productTransferContext.locationName &&
                  !productTransferContext.fromLocationId &&
                  " · Elija ubicación de origen en el formulario"}
              </span>
            </>
          ) : null
        }
        onCreated={() => {
          if (selectedCategory === "KIOSKO") {
            if (selectedKiosk === "ALL") loadAggregatedKiosksInventory();
            else if (selectedKiosk) loadInventory(selectedKiosk);
          } else if (selectedCategory) {
            loadCategoryInventory();
          }
        }}
      />
    </div>
  );
}

export default ProductInventoryByLocation;

