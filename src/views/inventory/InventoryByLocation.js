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
  Button,
  ButtonGroup,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Label,
  Input,
  FormGroup,
} from "reactstrap";
import {
  useTable,
  useFilters,
  useGlobalFilter,
  useSortBy,
  usePagination,
} from "react-table";
import { matchSorter } from "match-sorter";
import { getAggregatedMaterialInventory, initializeMissingInventory } from "services/inventoryService";
import { createMaterial } from "services/materialService";
import { getSuppliers } from "services/supplierService";
import { getUoms } from "services/uomService";
import { showError, showSuccess } from "utils/notificationHelper";
import * as XLSX from "xlsx";
import MaterialStickerModal from "components/MaterialStickerModal";
import MaterialInventoryKardex from "views/inventory/MaterialInventoryKardex";
import EmbeddedInventoryTransferModal from "components/inventory/EmbeddedInventoryTransferModal";
import { useAuth } from "contexts/AuthContext";

// Componente de filtro por defecto
function DefaultColumnFilter({
  column: { filterValue, preFilteredRows, setFilter },
}) {
  const count = preFilteredRows.length;

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

function InventoryByLocation() {
  const { hasPermission } = useAuth();
  const canMaterialKardex = hasPermission("INVENTARIOS.KARDEX_MATERIALES.VER");
  const canTransferMaterial = hasPermission("INVENTARIOS.TRANSFERENCIAS.CREAR");

  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState("");
  const [selectedMaterialIds, setSelectedMaterialIds] = useState([]);
  const [showStickerModal, setShowStickerModal] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [showBulkPrintModal, setShowBulkPrintModal] = useState(false);
  const [bulkPrintMode, setBulkPrintMode] = useState("normal");
  const [bulkTargetMode, setBulkTargetMode] = useState("selected");
  const [bulkCategoryMode, setBulkCategoryMode] = useState("ALL");
  const [bulkIdListInput, setBulkIdListInput] = useState("");
  const [bulkSelectorMaterialId, setBulkSelectorMaterialId] = useState("");
  const [bulkSelectorSearchTerm, setBulkSelectorSearchTerm] = useState("");
  const [bulkSelectorIds, setBulkSelectorIds] = useState([]);
  const [bulkSelectorCopies, setBulkSelectorCopies] = useState({});
  const [printingBulk, setPrintingBulk] = useState(false);
  const [showQuickCreateModal, setShowQuickCreateModal] = useState(false);
  const [creatingMaterial, setCreatingMaterial] = useState(false);
  const [availableUoms, setAvailableUoms] = useState([]);
  const [quickCreateForm, setQuickCreateForm] = useState({
    sku: "",
    name: "",
    purchaseUomId: "",
    manufacturingUomId: "",
    purchaseQuantity: "1",
    min: "",
  });
  const [materialKardexContext, setMaterialKardexContext] = useState(null);
  const [materialTransferContext, setMaterialTransferContext] = useState(null);
  const [showExcelExportModal, setShowExcelExportModal] = useState(false);
  const [excelSupplierList, setExcelSupplierList] = useState([]);
  const [excelExportSupplierId, setExcelExportSupplierId] = useState("");

  useEffect(() => {
    // Cargar inventario global de materiales (sin ubicación)
    loadAllInventory();
    loadUoms();
  }, []);

  const loadAllInventory = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getAggregatedMaterialInventory();
      
      // El backend ya devuelve el inventario agregado
      // Solo necesitamos mapear los campos para mantener compatibilidad
      const mappedInventory = data.map(item => ({
        materialId: item.materialId,
        materialSku: item.materialSku,
        materialName: item.materialName,
        quantity: item.totalQuantity || 0,
        materialMin: item.materialMin,
        supplierId: item.supplierId != null ? item.supplierId : null,
        supplierName: item.supplierName || "",
      }));
      
      setInventory(mappedInventory);
      setSelectedMaterialIds((prev) =>
        prev.filter((id) => mappedInventory.some((item) => item.materialId === id))
      );
    } catch (err) {
      setError(err.message || "Error al cargar el inventario de materiales");
      showError(err.message || "Error al cargar el inventario de materiales");
      setInventory([]);
    } finally {
      setLoading(false);
    }
  };

  const loadUoms = async () => {
    try {
      const uoms = await getUoms();
      setAvailableUoms(uoms || []);
    } catch (err) {
      setAvailableUoms([]);
      showError(err.message || "No se pudieron cargar las unidades de medida");
    }
  };

  const getStockStatus = (currentStock, minStock) => {
    if (!minStock || minStock === 0) return { color: "info", text: "Sin mínimo" };
    if (currentStock < minStock) return { color: "danger", text: "Crítico" };
    return { color: "success", text: "Normal" };
  };

  const getMaterialCategoryKey = (material) => {
    const currentStock = parseFloat(material.quantity || 0);
    const minStock = material.materialMin || 0;
    const status = getStockStatus(currentStock, minStock);
    if (status.text === "Crítico") return "CRITICAL";
    if (status.text === "Sin mínimo") return "NO_MIN";
    return "NORMAL";
  };

  const applyCategoryFilter = (materials, categoryMode) => {
    if (categoryMode === "ALL") return materials;
    return materials.filter((item) => getMaterialCategoryKey(item) === categoryMode);
  };

  const getCategoryCount = (sourceMaterials, categoryMode) => {
    if (categoryMode === "ALL") return sourceMaterials.length;
    return sourceMaterials.filter((item) => getMaterialCategoryKey(item) === categoryMode).length;
  };

  const parseIdList = (rawValue) => {
    const chunks = String(rawValue || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const idSet = new Set();

    chunks.forEach((chunk) => {
      if (chunk.includes("-")) {
        const [startRaw, endRaw] = chunk.split("-").map((v) => parseInt(v.trim(), 10));
        if (Number.isInteger(startRaw) && Number.isInteger(endRaw) && endRaw >= startRaw) {
          for (let id = startRaw; id <= endRaw; id += 1) {
            idSet.add(id);
          }
        }
        return;
      }

      const single = parseInt(chunk, 10);
      if (Number.isInteger(single)) {
        idSet.add(single);
      }
    });

    return Array.from(idSet);
  };

  const parsePositiveInt = (value) => {
    const parsed = parseInt(String(value || "").trim(), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };

  const addBulkSelectorItem = () => {
    const id = parsePositiveInt(bulkSelectorMaterialId);
    if (!id) {
      showError("Seleccione un material válido");
      return;
    }
    if (!inventory.some((item) => item.materialId === id)) {
      showError("Ese material no está disponible en la lista actual");
      return;
    }
    setBulkSelectorIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setBulkSelectorCopies((prev) => (prev[id] ? prev : { ...prev, [id]: 1 }));
    setBulkSelectorMaterialId("");
  };

  const removeBulkSelectorItem = (materialId) => {
    setBulkSelectorIds((prev) => prev.filter((id) => id !== materialId));
    setBulkSelectorCopies((prev) => {
      const next = { ...prev };
      delete next[materialId];
      return next;
    });
  };

  const updateBulkSelectorCopies = (materialId, rawValue) => {
    setBulkSelectorCopies((prev) => ({
      ...prev,
      [materialId]: rawValue,
    }));
  };

  const getCopiesForMaterial = (materialId) => {
    const parsed = parsePositiveInt(bulkSelectorCopies[materialId]);
    return parsed || 0;
  };

  const getSelectorTotalCopies = () =>
    bulkSelectorIds.reduce((sum, materialId) => sum + getCopiesForMaterial(materialId), 0);

  const resetQuickCreateForm = () => {
    setQuickCreateForm({
      sku: "",
      name: "",
      purchaseUomId: "",
      manufacturingUomId: "",
      purchaseQuantity: "1",
      min: "",
    });
  };

  const getQuickCreateValidationError = () => {
    if (!quickCreateForm.sku.trim()) return "El SKU es requerido";
    if (!quickCreateForm.name.trim()) return "El nombre es requerido";
    if (!parsePositiveInt(quickCreateForm.purchaseUomId)) return "Seleccione unidad de compra";
    if (!parsePositiveInt(quickCreateForm.manufacturingUomId)) return "Seleccione unidad de manufactura";
    const qty = parseFloat(quickCreateForm.purchaseQuantity);
    if (!Number.isFinite(qty) || qty <= 0) return "La cantidad por unidad debe ser mayor a 0";
    return "";
  };

  const handleQuickCreateMaterial = async () => {
    const validationError = getQuickCreateValidationError();
    if (validationError) {
      showError(validationError);
      return;
    }

    try {
      setCreatingMaterial(true);
      setError("");

      const payload = {
        sku: quickCreateForm.sku.trim(),
        name: quickCreateForm.name.trim(),
        purchaseUomId: parsePositiveInt(quickCreateForm.purchaseUomId),
        manufacturingUomId: parsePositiveInt(quickCreateForm.manufacturingUomId),
        uomId: parsePositiveInt(quickCreateForm.manufacturingUomId),
        purchaseQuantity: parseFloat(quickCreateForm.purchaseQuantity),
        purchasePrice: 0,
        quantity: parseFloat(quickCreateForm.purchaseQuantity),
        cost: 0,
        min: quickCreateForm.min ? parseInt(quickCreateForm.min, 10) : null,
        status: "active",
      };

      const created = await createMaterial(payload);
      await initializeMissingInventory(null);
      await loadAllInventory();

      setSelectedMaterialIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setBulkSelectorIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
      setSelectedMaterialId(created.id);
      setShowQuickCreateModal(false);
      resetQuickCreateForm();
      setShowStickerModal(true);
      showSuccess(`Material ${created.sku || created.id} creado y listo para sticker/inventario`);
    } catch (err) {
      const errorMessage = err.message || "Error al crear material rápido";
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setCreatingMaterial(false);
    }
  };

  const toggleMaterialSelection = (materialId) => {
    setSelectedMaterialIds((prev) =>
      prev.includes(materialId)
        ? prev.filter((id) => id !== materialId)
        : [...prev, materialId]
    );
  };

  const toggleSelectAll = (targetIds = []) => {
    if (!targetIds.length) return;
    const allSelected = targetIds.every((id) => selectedMaterialIds.includes(id));
    if (allSelected) {
      setSelectedMaterialIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      return;
    }
    setSelectedMaterialIds((prev) => [...new Set([...prev, ...targetIds])]);
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
        Header: () => (
          <Input
            type="checkbox"
            checked={filteredMaterialIds.length > 0 && filteredMaterialIds.every((id) => selectedMaterialIds.includes(id))}
            onChange={() => toggleSelectAll(filteredMaterialIds)}
          />
        ),
        id: "select",
        Cell: ({ row }) => (
          <Input
            type="checkbox"
            checked={selectedMaterialIds.includes(row.original.materialId)}
            onChange={() => toggleMaterialSelection(row.original.materialId)}
          />
        ),
        disableSortBy: true,
        disableFilters: true,
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
        Header: "Stock Total",
        accessor: "quantity",
        Cell: ({ value }) => {
          const numValue = parseFloat(value || 0);
          return (
            <strong className={numValue === 0 ? "text-muted" : ""}>
              {parseInt(numValue)}
              {numValue === 0 && (
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
        accessor: "materialMin",
        Cell: ({ value }) => value || "N/A",
        sortType: (rowA, rowB) => {
          const a = parseFloat(rowA.original.materialMin || 0);
          const b = parseFloat(rowB.original.materialMin || 0);
          return a - b;
        },
      },
      {
        Header: "Estado",
        id: "status",
        Cell: ({ row }) => {
          const status = getStockStatus(
            parseFloat(row.original.quantity || 0),
            row.original.materialMin || 0
          );
          return <Badge color={status.color}>{status.text}</Badge>;
        },
        disableSortBy: true,
        disableFilters: true,
      },
      {
        Header: "Acciones",
        id: "actions",
        Cell: ({ row }) => (
          <ButtonGroup size="sm" className="flex-wrap">
            <Button
              color="info"
              onClick={() => {
                setSelectedMaterialId(row.original.materialId);
                setShowStickerModal(true);
              }}
              className="btn-round"
              title="Sticker"
            >
              <i className="nc-icon nc-paper" />
            </Button>
            {canMaterialKardex && (
              <Button
                color="secondary"
                outline
                onClick={() =>
                  setMaterialKardexContext({
                    materialId: row.original.materialId,
                    materialSku: row.original.materialSku,
                    materialName: row.original.materialName,
                    quantity: row.original.quantity,
                    materialMin: row.original.materialMin,
                    label: `${row.original.materialSku || ""} — ${row.original.materialName || ""}`.trim(),
                  })
                }
                title="Kardex"
              >
                <i className="nc-icon nc-chart-bar-32 mr-1" />
                Kardex
              </Button>
            )}
            {canTransferMaterial && (
              <Button
                color="primary"
                outline
                onClick={() =>
                  setMaterialTransferContext({
                    materialId: row.original.materialId,
                    materialSku: row.original.materialSku,
                    materialName: row.original.materialName,
                    quantity: row.original.quantity,
                    label: `${row.original.materialSku || ""} — ${row.original.materialName || ""}`.trim(),
                  })
                }
                title="Transferir"
              >
                <i className="nc-icon nc-share-66 mr-1" />
                Transferir
              </Button>
            )}
          </ButtonGroup>
        ),
        disableSortBy: true,
        disableFilters: true,
      },
    ],
    [inventory, selectedMaterialIds, canMaterialKardex, canTransferMaterial]
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
    rows,
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
      data: inventory,
      defaultColumn,
      filterTypes,
      initialState: {
        pageSize: 10,
        pageIndex: 0,
        sortBy: [{ id: "materialSku", desc: false }],
      },
    },
    useFilters,
    useGlobalFilter,
    useSortBy,
    usePagination
  );

  const { globalFilter, pageIndex, pageSize } = state;
  const filteredMaterialIds = rows.map((row) => row.original.materialId);
  const allFilteredSelected =
    filteredMaterialIds.length > 0 &&
    filteredMaterialIds.every((id) => selectedMaterialIds.includes(id));
  const selectorSearch = bulkSelectorSearchTerm.trim().toLowerCase();
  const filteredSelectorInventory = useMemo(() => {
    const base = inventory.slice().sort((a, b) => a.materialId - b.materialId);
    if (!selectorSearch) {
      return base;
    }
    return base.filter((item) => {
      const idText = String(item.materialId || "");
      const skuText = String(item.materialSku || "").toLowerCase();
      const nameText = String(item.materialName || "").toLowerCase();
      return (
        idText.includes(selectorSearch) ||
        skuText.includes(selectorSearch) ||
        nameText.includes(selectorSearch)
      );
    });
  }, [inventory, selectorSearch]);

  const handleInitializeInventory = async () => {
    if (!window.confirm(
      "¿Desea actualizar el inventario de materiales? Se compararán todos los materiales existentes con los que están en inventario y se crearán registros con cantidad 0 para los materiales faltantes (sin ubicación, solo en la planta)."
    )) {
      return;
    }

    try {
      setInitializing(true);
      setError("");
      
      // Pasar null para que inicialice en TODAS las ubicaciones
      const result = await initializeMissingInventory(null);
      
      showSuccess(
        `Inventario de materiales actualizado correctamente. Se crearon ${result.createdCount} registros nuevos.`
      );
      
      // Recargar inventario
      await loadAllInventory();
    } catch (err) {
      const errorMessage = err.message || "Error al actualizar inventario de materiales";
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setInitializing(false);
    }
  };

  const handleBulkPrint = async () => {
    if (inventory.length === 0) {
      showError("No hay materiales para imprimir");
      return;
    }
    setBulkTargetMode(selectedMaterialIds.length > 0 ? "selected" : "all");
    setBulkCategoryMode("ALL");
    setBulkIdListInput("");
    setBulkSelectorMaterialId("");
    setBulkSelectorSearchTerm("");
    setShowBulkPrintModal(true);
  };

  const generateZPLForMaterial = (materialData) => {
    const sku = materialData.sku || "N/A";
    const name = materialData.name || "Sin nombre";
    const qrData = materialData.qrUrl || "";
    const cleanName = name.length > 30 ? name.substring(0, 27) + "..." : name;

    return `
^XA
^PW600
^LL400
^FO40,30^A0N,40,40^FD${sku}^FS
^FO40,80^A0N,25,25^FD${cleanName}^FS
^FO40,120^BQN,2,5^FDLA,${qrData}^FS
^FO40,300^A0N,20,20^FDEscanee para ver kardex^FS
^XZ
`;
  };

  const handleBulkPrintExecute = async () => {
    if (inventory.length === 0) {
      showError("No hay materiales para imprimir");
      return;
    }

    try {
      setPrintingBulk(true);
      setError("");

      const selectedInventory = inventory.filter((item) =>
        selectedMaterialIds.includes(item.materialId)
      );
      const idsFromList = parseIdList(bulkIdListInput);
      const listInventory = inventory.filter((item) => idsFromList.includes(item.materialId));
      const selectorHasInvalidCopies =
        bulkTargetMode === "selector_list" &&
        bulkSelectorIds.some((materialId) => getCopiesForMaterial(materialId) <= 0);
      if (selectorHasInvalidCopies) {
        showError("Cada material de la lista debe tener al menos 1 copia");
        return;
      }
      const selectorInventory = inventory.filter((item) => bulkSelectorIds.includes(item.materialId));
      const sourceInventory =
        bulkTargetMode === "selected"
          ? selectedInventory
          : bulkTargetMode === "id_list"
            ? listInventory
            : bulkTargetMode === "selector_list"
              ? selectorInventory
            : inventory;
      const targetInventory = applyCategoryFilter(sourceInventory, bulkCategoryMode);
      const orderedInventory = [...targetInventory].sort((a, b) => a.materialId - b.materialId);

      if (orderedInventory.length === 0) {
        showError("No hay materiales para imprimir con el filtro seleccionado");
        return;
      }

      // Usar los datos que ya tenemos del inventario, sin hacer requests adicionales
      const configuredFrontendUrl = process.env.REACT_APP_FRONTEND_URL;
      const frontendUrl =
        configuredFrontendUrl &&
        !configuredFrontendUrl.includes("localhost") &&
        !configuredFrontendUrl.includes("127.0.0.1")
          ? configuredFrontendUrl
          : window.location.origin;
      const materialRowsForPrint =
        bulkTargetMode === "selector_list"
          ? orderedInventory.flatMap((item) => {
              const copies = getCopiesForMaterial(item.materialId);
              return Array.from({ length: copies }, () => item);
            })
          : orderedInventory;

      const stickersData = materialRowsForPrint.map((item) => ({
        materialId: item.materialId,
        sku: item.materialSku || "N/A",
        name: item.materialName || "Sin nombre",
        qrUrl: `${frontendUrl}/admin/materials-kardex/${item.materialId}`,
      }));

      if (stickersData.length === 0) {
        showError("No se pudieron generar los datos de los stickers");
        return;
      }

      if (bulkPrintMode === "normal") {
        // Descargar HTML con el mismo formato visual del sticker individual
        handleBulkNormalPrint(stickersData);
      } else {
        // Imprimir todos en Zebra
        handleBulkZebraPrint(stickersData);
      }

      setShowBulkPrintModal(false);
    } catch (err) {
      const errorMessage = err.message || "Error al imprimir stickers";
      setError(errorMessage);
      showError(errorMessage);
    } finally {
      setPrintingBulk(false);
    }
  };

  const handleBulkNormalPrint = (stickersData) => {
    // Crear HTML con todos los stickers en una grilla
    const stickersHTML = stickersData.map((data, index) => `
      <div style="
        display: inline-block;
        width: 400px;
        border: 2px solid #000;
        padding: 20px;
        margin: 10px;
        text-align: center;
        page-break-inside: avoid;
        background-color: white;
      ">
        <h4 style="margin: 0 0 10px 0; font-size: 18px; font-weight: bold;">
          ${data.sku || "N/A"}
        </h4>
        <p style="margin: 0; font-size: 14px; word-wrap: break-word;">
          ${data.name || "Sin nombre"}
        </p>
        <div style="margin: 20px 0; display: flex; justify-content: center;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.qrUrl)}" alt="QR Code" style="width: 150px; height: 150px;" />
        </div>
        <div style="margin-top: 10px; font-size: 10px; color: #666;">
          Escanee para ver kardex
        </div>
      </div>
    `).join("");

    const printHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Stickers de Materiales</title>
          <style>
            @media print {
              @page {
                margin: 1cm;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
            }
          </style>
        </head>
        <body>
          ${stickersHTML}
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showError("No se pudo abrir la ventana de impresión");
      return;
    }
    printWindow.document.write(printHTML);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
    showSuccess(`Se enviaron ${stickersData.length} stickers a impresión`);
  };

  const handleBulkZebraPrint = (stickersData) => {
    if (!window.BrowserPrint) {
      // Si no hay BrowserPrint, descargar archivo ZPL
      const allZPL = stickersData.map(data => generateZPLForMaterial(data)).join("\n");
      downloadBulkZPLFile(allZPL);
      return;
    }

    // Enviar todos los stickers a la impresora Zebra
    window.BrowserPrint.getDefaultDevice(
      "printer",
      (printer) => {
        let index = 0;
        const sendNext = () => {
          if (index >= stickersData.length) {
            showSuccess(`Se imprimieron ${stickersData.length} stickers en la impresora Zebra`);
            return;
          }

          const zpl = generateZPLForMaterial(stickersData[index]);
          printer.send(
            zpl,
            () => {
              index++;
              setTimeout(sendNext, 500); // Pequeña pausa entre etiquetas
            },
            () => {
              showError(`Error al imprimir sticker ${index + 1}`);
              index++;
              setTimeout(sendNext, 500);
            }
          );
        };
        sendNext();
      },
      () => {
        // Si no hay impresora, descargar archivo
        const allZPL = stickersData.map(data => generateZPLForMaterial(data)).join("\n");
        downloadBulkZPLFile(allZPL);
      }
    );
  };

  const downloadBulkZPLFile = (zpl) => {
    const blob = new Blob([zpl], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stickers_materiales_${new Date().toISOString().slice(0, 10)}.zpl`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess("Archivo ZPL con todos los stickers descargado");
  };

  const openExcelExportModal = async () => {
    if (inventory.length === 0) {
      showError("No hay datos para exportar");
      return;
    }
    try {
      if (!excelSupplierList.length) {
        const list = await getSuppliers();
        setExcelSupplierList(Array.isArray(list) ? list : []);
      }
    } catch (e) {
      showError(e.message || "No se pudieron cargar los proveedores");
      return;
    }
    setExcelExportSupplierId("");
    setShowExcelExportModal(true);
  };

  const executeExcelExport = () => {
    let rows = [...inventory];
    if (excelExportSupplierId !== "" && excelExportSupplierId !== "ALL") {
      const sid = Number(excelExportSupplierId);
      rows = inventory.filter(it => Number(it.supplierId) === sid);
    }
    if (rows.length === 0) {
      showError("No hay datos para exportar con el filtro elegido");
      return;
    }

    try {
      const excelData = rows.map(item => ({
        "SKU": item.materialSku || "N/A",
        "Material": item.materialName || "N/A",
        "Proveedor": item.supplierName || "—",
        "Stock Total": parseFloat(item.quantity || 0),
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");

      const columnWidths = [
        { wch: 15 },
        { wch: 40 },
        { wch: 28 },
        { wch: 14 },
      ];
      worksheet["!cols"] = columnWidths;

      const iso = new Date().toISOString().slice(0, 10);
      const suffix =
        excelExportSupplierId && excelExportSupplierId !== "ALL"
          ? `prov-${excelExportSupplierId}`
          : "todos";
      const fileName = `inventario_materiales_${suffix}_${iso}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      showSuccess("Archivo Excel descargado correctamente");
      setShowExcelExportModal(false);
    } catch (err) {
      showError("Error al generar el archivo Excel");
      console.error(err);
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
                  <CardTitle tag="h4">Inventario de Materiales (Materia Prima)</CardTitle>
                  <small className="text-muted d-block">
                    Kardex y transferencias se abren en una ventana emergente con el material que elija (no navega a otra página).
                  </small>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="info"
                    size="sm"
                    onClick={() => setShowQuickCreateModal(true)}
                    className="mt-2 mr-2"
                  >
                    <i className="nc-icon nc-simple-add mr-1" />
                    Crear Material Rapido
                  </Button>
                  <Button
                    color="secondary"
                    size="sm"
                    onClick={() => toggleSelectAll(filteredMaterialIds)}
                    disabled={loading || inventory.length === 0}
                    className="mt-2 mr-2"
                  >
                    {allFilteredSelected ? "Quitar filtrados" : "Seleccionar filtrados"}
                  </Button>
                  <Button
                    color="warning"
                    size="sm"
                    onClick={handleBulkPrint}
                    disabled={loading || inventory.length === 0 || printingBulk}
                    className="mt-2 mr-2"
                  >
                    <i className="nc-icon nc-paper mr-1" />
                    Imprimir Stickers
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
                    disabled={initializing || loading}
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
              {error && (
                <Alert color="danger" className="mt-3">
                  {error}
                </Alert>
              )}

              {loading ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-2">Cargando inventario de materiales...</p>
                </div>
              ) : inventory.length === 0 ? (
                <Alert color="warning" className="mt-3">
                  No hay materiales registrados en inventario. Haz clic en "Actualizar Inventario" para comparar todos los materiales existentes con los que están en inventario y crear registros con cantidad 0 para los materiales faltantes (sin ubicación, solo en la planta).
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
                          placeholder="Buscar por SKU, nombre, stock..."
                        />
                      </FormGroup>
                    </Col>
                    <Col md="4" className="d-flex align-items-end">
                      <small className="text-muted">
                        Mostrando {page.length} de {inventory.length} materiales
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
      <MaterialStickerModal
        isOpen={showStickerModal}
        toggle={() => {
          setShowStickerModal(false);
          setSelectedMaterialId(null);
        }}
        materialId={selectedMaterialId}
      />

      <Modal
        isOpen={!!materialKardexContext}
        toggle={() => setMaterialKardexContext(null)}
        size="xl"
        backdrop="static"
        scrollable
        className="inventory-kardex-modal"
      >
        <ModalHeader toggle={() => setMaterialKardexContext(null)}>
          {materialKardexContext
            ? `Kardex — ${materialKardexContext.label}`
            : "Kardex de material"}
        </ModalHeader>
        <ModalBody>
          {materialKardexContext && (
            <>
              <Alert color="light" className="border mb-3">
                <div className="small font-weight-bold text-muted mb-2">
                  Consultando en esta ventana (no cambia de página)
                </div>
                <div className="small mb-0">
                  <strong>Material:</strong> {materialKardexContext.label}
                  <br />
                  <span className="text-muted">ID:</span> {materialKardexContext.materialId}
                  <span className="text-muted"> · SKU:</span>{" "}
                  {materialKardexContext.materialSku || "—"}
                  <span className="text-muted"> · Nombre:</span>{" "}
                  {materialKardexContext.materialName || "—"}
                  <br />
                  <span className="text-muted">Stock en esta lista:</span>{" "}
                  {materialKardexContext.quantity != null
                    ? parseInt(materialKardexContext.quantity, 10)
                    : "—"}
                  <span className="text-muted"> · Mínimo:</span>{" "}
                  {materialKardexContext.materialMin != null && materialKardexContext.materialMin !== ""
                    ? materialKardexContext.materialMin
                    : "—"}
                </div>
              </Alert>
              <MaterialInventoryKardex
                key={materialKardexContext.materialId}
                embedded
                embeddedCompact
                lockedMaterialId={materialKardexContext.materialId}
                lockedMaterialLabel={materialKardexContext.label}
              />
            </>
          )}
        </ModalBody>
      </Modal>

      <EmbeddedInventoryTransferModal
        isOpen={!!materialTransferContext}
        toggle={() => setMaterialTransferContext(null)}
        transferMode="material"
        lockTransferMode
        initialMaterialId={materialTransferContext?.materialId}
        title={
          materialTransferContext
            ? `Transferir — ${materialTransferContext.label}`
            : "Transferir material"
        }
        selectionSummary={
          materialTransferContext ? (
            <>
              <strong>{materialTransferContext.label}</strong>
              <br />
              <span className="text-muted">
                ID: {materialTransferContext.materialId}
                {materialTransferContext.quantity != null &&
                  ` · Stock en esta lista: ${parseInt(materialTransferContext.quantity, 10)}`}
              </span>
            </>
          ) : null
        }
        onCreated={() => loadAllInventory()}
      />

      <Modal isOpen={showExcelExportModal} toggle={() => setShowExcelExportModal(false)}>
        <ModalHeader toggle={() => setShowExcelExportModal(false)}>Exportar Excel</ModalHeader>
        <ModalBody>
          <p className="text-muted small mb-3">
            Solo se incluyen materiales cargados actualmente en esta pantalla. Elige proveedor para acotar el archivo.
          </p>
          <FormGroup>
            <Label>Proveedor</Label>
            <Input
              type="select"
              bsSize="sm"
              value={excelExportSupplierId}
              onChange={(e) => setExcelExportSupplierId(e.target.value)}
            >
              <option value="">Todos los proveedores</option>
              {(excelSupplierList || []).map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name || `#${s.id}`}
                </option>
              ))}
            </Input>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline size="sm" onClick={() => setShowExcelExportModal(false)}>
            Cancelar
          </Button>
          <Button color="success" size="sm" onClick={executeExcelExport}>
            Descargar
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal para impresión masiva */}
      <Modal isOpen={showBulkPrintModal} toggle={() => setShowBulkPrintModal(false)}>
        <ModalHeader toggle={() => setShowBulkPrintModal(false)}>
          Imprimir Stickers
        </ModalHeader>
        <ModalBody>
          <div className="mb-3">
            <Label>¿Qué stickers desea incluir?</Label>
            <ButtonGroup className="d-block mt-2">
              <Button
                color={bulkTargetMode === "selected" ? "primary" : "secondary"}
                onClick={() => setBulkTargetMode("selected")}
                disabled={selectedMaterialIds.length === 0}
                className="mr-2"
              >
                Seleccionados ({selectedMaterialIds.length})
              </Button>
              <Button
                color={bulkTargetMode === "all" ? "primary" : "secondary"}
                onClick={() => setBulkTargetMode("all")}
                className="mr-2"
              >
                Todos ({inventory.length})
              </Button>
              <Button
                color={bulkTargetMode === "id_list" ? "primary" : "secondary"}
                onClick={() => setBulkTargetMode("id_list")}
                className="mr-2"
              >
                Por IDs
              </Button>
              <Button
                color={bulkTargetMode === "selector_list" ? "primary" : "secondary"}
                onClick={() => setBulkTargetMode("selector_list")}
              >
                Lista selector ({bulkSelectorIds.length} materiales)
              </Button>
            </ButtonGroup>
          </div>
          {bulkTargetMode === "id_list" && (
            <div className="mb-3">
              <Label>Listado de IDs a imprimir</Label>
              <Input
                type="text"
                value={bulkIdListInput}
                onChange={(e) => setBulkIdListInput(e.target.value)}
                placeholder="Ej: 12,15,20-30"
              />
              <small className="text-muted">
                Puedes usar comas y rangos. Se imprimen ordenados por ID.
              </small>
            </div>
          )}
          {bulkTargetMode === "selector_list" && (
            <div className="mb-3">
              <Label>Lista por selector</Label>
              <FormGroup>
                <Input
                  type="text"
                  value={bulkSelectorSearchTerm}
                  onChange={(e) => setBulkSelectorSearchTerm(e.target.value)}
                  placeholder="Buscar por ID, SKU o nombre..."
                />
              </FormGroup>
              <Row>
                <Col md="8">
                  <Input
                    type="select"
                    value={bulkSelectorMaterialId}
                    onChange={(e) => setBulkSelectorMaterialId(e.target.value)}
                  >
                    <option value="">Seleccione material...</option>
                    {filteredSelectorInventory.map((item) => (
                        <option key={item.materialId} value={item.materialId}>
                          #{item.materialId} - {item.materialSku || "N/A"} - {item.materialName || "Sin nombre"}
                        </option>
                      ))}
                  </Input>
                </Col>
                <Col md="4">
                  <Button color="primary" block onClick={addBulkSelectorItem}>
                    Agregar a lista
                  </Button>
                </Col>
              </Row>
              <div className="mt-2">
                {bulkSelectorIds.length === 0 ? (
                  <small className="text-muted">No hay materiales agregados.</small>
                ) : (
                  bulkSelectorIds.slice().sort((a, b) => a - b).map((id) => {
                    const material = inventory.find((item) => item.materialId === id);
                    return (
                      <Row key={id} className="align-items-center mb-2">
                        <Col md="7">
                          <small>
                            #{id} - {material?.materialSku || "N/A"} - {material?.materialName || "Sin nombre"}
                          </small>
                        </Col>
                        <Col md="3">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={bulkSelectorCopies[id] || 1}
                            onChange={(e) => updateBulkSelectorCopies(id, e.target.value)}
                          />
                        </Col>
                        <Col md="2">
                          <Button color="danger" size="sm" block onClick={() => removeBulkSelectorItem(id)}>
                            Quitar
                          </Button>
                        </Col>
                      </Row>
                    );
                  })
                )}
              </div>
              {bulkSelectorIds.length > 0 && (
                <small className="text-muted d-block mt-2">
                  Total copias a imprimir: {getSelectorTotalCopies()}
                </small>
              )}
              {filteredSelectorInventory.length === 0 && (
                <small className="text-danger d-block mt-2">
                  No hay resultados para la búsqueda.
                </small>
              )}
            </div>
          )}
          <div className="mb-3">
            <Label>Filtrar por categoría de inventario:</Label>
            <ButtonGroup className="d-block mt-2">
              <Button
                color={bulkCategoryMode === "ALL" ? "primary" : "secondary"}
                onClick={() => setBulkCategoryMode("ALL")}
                className="mr-2"
              >
                Todos (
                {getCategoryCount(
                  bulkTargetMode === "selected"
                    ? inventory.filter((i) => selectedMaterialIds.includes(i.materialId))
                    : bulkTargetMode === "id_list"
                      ? inventory.filter((i) => parseIdList(bulkIdListInput).includes(i.materialId))
                      : bulkTargetMode === "selector_list"
                        ? inventory.filter((i) => bulkSelectorIds.includes(i.materialId))
                    : inventory,
                  "ALL"
                )}
                )
              </Button>
              <Button
                color={bulkCategoryMode === "CRITICAL" ? "primary" : "secondary"}
                onClick={() => setBulkCategoryMode("CRITICAL")}
                className="mr-2"
              >
                Críticos (
                {getCategoryCount(
                  bulkTargetMode === "selected"
                    ? inventory.filter((i) => selectedMaterialIds.includes(i.materialId))
                    : bulkTargetMode === "id_list"
                      ? inventory.filter((i) => parseIdList(bulkIdListInput).includes(i.materialId))
                      : bulkTargetMode === "selector_list"
                        ? inventory.filter((i) => bulkSelectorIds.includes(i.materialId))
                    : inventory,
                  "CRITICAL"
                )}
                )
              </Button>
              <Button
                color={bulkCategoryMode === "NORMAL" ? "primary" : "secondary"}
                onClick={() => setBulkCategoryMode("NORMAL")}
                className="mr-2"
              >
                Normales (
                {getCategoryCount(
                  bulkTargetMode === "selected"
                    ? inventory.filter((i) => selectedMaterialIds.includes(i.materialId))
                    : bulkTargetMode === "id_list"
                      ? inventory.filter((i) => parseIdList(bulkIdListInput).includes(i.materialId))
                      : bulkTargetMode === "selector_list"
                        ? inventory.filter((i) => bulkSelectorIds.includes(i.materialId))
                    : inventory,
                  "NORMAL"
                )}
                )
              </Button>
              <Button
                color={bulkCategoryMode === "NO_MIN" ? "primary" : "secondary"}
                onClick={() => setBulkCategoryMode("NO_MIN")}
              >
                Sin mínimo (
                {getCategoryCount(
                  bulkTargetMode === "selected"
                    ? inventory.filter((i) => selectedMaterialIds.includes(i.materialId))
                    : bulkTargetMode === "id_list"
                      ? inventory.filter((i) => parseIdList(bulkIdListInput).includes(i.materialId))
                      : bulkTargetMode === "selector_list"
                        ? inventory.filter((i) => bulkSelectorIds.includes(i.materialId))
                    : inventory,
                  "NO_MIN"
                )}
                )
              </Button>
            </ButtonGroup>
          </div>
          <div className="mb-3">
            <Label>Seleccione el formato:</Label>
            <ButtonGroup className="d-block mt-2">
              <Button
                color={bulkPrintMode === "normal" ? "primary" : "secondary"}
                onClick={() => setBulkPrintMode("normal")}
                className="mr-2"
              >
                Impresión Normal
              </Button>
              <Button
                color={bulkPrintMode === "zebra" ? "primary" : "secondary"}
                onClick={() => setBulkPrintMode("zebra")}
              >
                Impresora Zebra (ZPL)
              </Button>
            </ButtonGroup>
          </div>
          {bulkPrintMode === "zebra" && !window.BrowserPrint && (
            <Alert color="info">
              <small>
                Zebra Browser Print no detectado. Se descargará un archivo ZPL con todos los stickers.
              </small>
            </Alert>
          )}
          {printingBulk && (
            <div className="text-center py-3">
              <Spinner color="primary" />
              <p className="mt-2">Cargando datos de los stickers...</p>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowBulkPrintModal(false)} disabled={printingBulk}>
            Cancelar
          </Button>
          <Button
            color="primary"
            onClick={handleBulkPrintExecute}
            disabled={
              printingBulk ||
              inventory.length === 0 ||
              (bulkTargetMode === "selected" && selectedMaterialIds.length === 0) ||
              (bulkTargetMode === "id_list" && parseIdList(bulkIdListInput).length === 0) ||
              (bulkTargetMode === "selector_list" &&
                (bulkSelectorIds.length === 0 || getSelectorTotalCopies() === 0))
            }
          >
            {printingBulk ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Procesando...
              </>
            ) : (
              <>
                <i className="nc-icon nc-paper mr-1" />
                Imprimir{" "}
                {bulkTargetMode === "selected"
                  ? selectedMaterialIds.length
                  : bulkTargetMode === "id_list"
                    ? parseIdList(bulkIdListInput).length
                    : bulkTargetMode === "selector_list"
                      ? getSelectorTotalCopies()
                    : inventory.length} Stickers
              </>
            )}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={showQuickCreateModal} toggle={() => setShowQuickCreateModal(false)}>
        <ModalHeader toggle={() => setShowQuickCreateModal(false)}>
          Crear Material Rapido
        </ModalHeader>
        <ModalBody>
          <Alert color="info">
            Completa lo basico para crear el material, generar sticker y habilitar inventario en cero.
          </Alert>
          <FormGroup>
            <Label>SKU *</Label>
            <Input
              type="text"
              value={quickCreateForm.sku}
              onChange={(e) => setQuickCreateForm((prev) => ({ ...prev, sku: e.target.value }))}
              placeholder="Ej: MP-CUERO-NEGRO"
            />
          </FormGroup>
          <FormGroup>
            <Label>Nombre *</Label>
            <Input
              type="text"
              value={quickCreateForm.name}
              onChange={(e) => setQuickCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Ej: Cuero Negro"
            />
          </FormGroup>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>UOM Compra *</Label>
                <Input
                  type="select"
                  value={quickCreateForm.purchaseUomId}
                  onChange={(e) => setQuickCreateForm((prev) => ({ ...prev, purchaseUomId: e.target.value }))}
                >
                  <option value="">Seleccione</option>
                  {availableUoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.code} - {uom.name}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>UOM Manufactura *</Label>
                <Input
                  type="select"
                  value={quickCreateForm.manufacturingUomId}
                  onChange={(e) =>
                    setQuickCreateForm((prev) => ({ ...prev, manufacturingUomId: e.target.value }))
                  }
                >
                  <option value="">Seleccione</option>
                  {availableUoms.map((uom) => (
                    <option key={uom.id} value={uom.id}>
                      {uom.code} - {uom.name}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Cantidad por unidad *</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={quickCreateForm.purchaseQuantity}
                  onChange={(e) =>
                    setQuickCreateForm((prev) => ({ ...prev, purchaseQuantity: e.target.value }))
                  }
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Stock minimo</Label>
                <Input
                  type="number"
                  min="0"
                  value={quickCreateForm.min}
                  onChange={(e) => setQuickCreateForm((prev) => ({ ...prev, min: e.target.value }))}
                  placeholder="Opcional"
                />
              </FormGroup>
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowQuickCreateModal(false)} disabled={creatingMaterial}>
            Cancelar
          </Button>
          <Button color="primary" onClick={handleQuickCreateMaterial} disabled={creatingMaterial}>
            {creatingMaterial ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creando...
              </>
            ) : (
              "Crear y generar sticker"
            )}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default InventoryByLocation;