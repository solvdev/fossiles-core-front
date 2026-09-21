import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Label,
  FormGroup,
  Input,
} from "reactstrap";
import ReactTable from "components/ReactTable/ReactTable.js";
import { getBoms, deleteBom, getBomById, copyBomItemsFrom } from "services/bomService";
import { getProducts } from "services/productService";
import { getColors } from "services/colorService";
import { getMaterials } from "services/materialService";
import BomForm from "./BomForm";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { showSuccess, showError } from "utils/notificationHelper";
import { buildBomRecipesDocumentInnerHtml, openBomRecipesPrintWindow } from "utils/bomRecipesPrintHtml";

function BomList() {
  const [boms, setBoms] = useState([]);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedBomId, setSelectedBomId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [bomToDelete, setBomToDelete] = useState(null);

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourceSearch, setCopySourceSearch] = useState("");
  const [copyDestSearch, setCopyDestSearch] = useState("");
  const [copySourceId, setCopySourceId] = useState(null);
  const [copyDestId, setCopyDestId] = useState(null);
  const [copySubmitting, setCopySubmitting] = useState(false);
  const [printRecipesLoading, setPrintRecipesLoading] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printProductSearch, setPrintProductSearch] = useState("");
  const [printSelectedProductIds, setPrintSelectedProductIds] = useState({});

  useEffect(() => {
    loadProducts();
    loadColors();
    loadBoms();
  }, []);

  const loadProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data || []);
    } catch (err) {
      console.error("Error al cargar productos:", err);
    }
  };

  const loadColors = async () => {
    try {
      const data = await getColors();
      setColors(data || []);
    } catch (err) {
      console.error("Error al cargar colores:", err);
    }
  };

  const handleNew = () => {
    setSelectedBomId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedBomId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadBoms();
    setShowForm(false);
    setSelectedBomId(null);
  };

  const loadBoms = async () => {
    try {
      setLoading(true);
      const data = await getBoms();
      setBoms(data);
    } catch (err) {
      showError(err.message || "Error al cargar las BOMs");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id) => {
    const bom = boms.find((b) => b.id === id);
    setBomToDelete({ id, name: bom?.bomName || "esta BOM" });
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!bomToDelete) return;

    try {
      await deleteBom(bomToDelete.id);
      showSuccess("BOM eliminada correctamente");
      loadBoms();
    } catch (err) {
      showError(err.message || "Error al eliminar la BOM");
    } finally {
      setBomToDelete(null);
    }
  };

  const getProductName = (productId) => {
    if (!productId) return "-";
    const product = products.find((p) => p.id === productId);
    return product ? `${product.code} - ${product.name}` : `ID: ${productId}`;
  };

  const getColorName = (colorId) => {
    if (!colorId) return "-";
    const color = colors.find((c) => c.id === colorId);
    return color ? color.name : `ID: ${colorId}`;
  };

  const bomSummaryLine = useCallback(
    (bom) => {
      if (!bom) return "";
      return `${bom.bomName || ""} · ${getProductName(bom.productId)} · ${getColorName(bom.colorId)}`;
    },
    [products, colors]
  );

  const filterBomsForCopy = useCallback(
    (query) => {
      const q = String(query || "").trim().toLowerCase();
      return boms.filter((b) => {
        if (!q) return true;
        const line = bomSummaryLine(b).toLowerCase();
        return line.includes(q) || String(b.id).includes(q);
      });
    },
    [boms, bomSummaryLine]
  );

  const openCopyModal = () => {
    setCopySourceSearch("");
    setCopyDestSearch("");
    setCopySourceId(null);
    setCopyDestId(null);
    setCopyModalOpen(true);
  };

  const handleCopyConfirm = async () => {
    if (!copySourceId || !copyDestId) {
      showError("Seleccione BOM origen y BOM destino.");
      return;
    }
    if (Number(copySourceId) === Number(copyDestId)) {
      showError("Origen y destino deben ser distintos.");
      return;
    }
    try {
      setCopySubmitting(true);
      await copyBomItemsFrom(copyDestId, copySourceId);
      showSuccess("Líneas de BOM copiadas correctamente");
      setCopyModalOpen(false);
      loadBoms();
    } catch (err) {
      showError(err.message || "No se pudo copiar la BOM");
    } finally {
      setCopySubmitting(false);
    }
  };

  const printableProducts = useMemo(() => {
    const countByProductId = new Map();
    (boms || []).forEach((b) => {
      if (b.status !== "A" || b.productId == null) return;
      const id = Number(b.productId);
      countByProductId.set(id, (countByProductId.get(id) || 0) + 1);
    });
    const byId = new Map((products || []).map((p) => [Number(p.id), p]));
    return [...countByProductId.entries()]
      .map(([id, activeBomCount]) => {
        const p = byId.get(id);
        return {
          id,
          code: p?.code || "",
          name: p?.name || `ID ${id}`,
          activeBomCount,
        };
      })
      .sort((a, b) =>
        String(a.code || a.name).localeCompare(String(b.code || b.name), "es", {
          numeric: true,
          sensitivity: "base",
        })
      );
  }, [boms, products]);

  const filteredPrintProducts = useMemo(() => {
    const q = String(printProductSearch || "").trim().toLowerCase();
    if (!q) return printableProducts;
    return printableProducts.filter((p) => {
      const hay = `${p.code || ""} ${p.name || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [printableProducts, printProductSearch]);

  const selectedPrintCount = Object.keys(printSelectedProductIds).filter((k) => printSelectedProductIds[k]).length;
  const allVisiblePrintSelected =
    filteredPrintProducts.length > 0
    && filteredPrintProducts.every((p) => printSelectedProductIds[String(p.id)]);

  const openPrintModal = () => {
    setPrintProductSearch("");
    setPrintSelectedProductIds({});
    setPrintModalOpen(true);
  };

  const togglePrintProduct = (productId) => {
    const k = String(productId);
    setPrintSelectedProductIds((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const setVisiblePrintSelection = (checked) => {
    setPrintSelectedProductIds((prev) => {
      const next = { ...prev };
      filteredPrintProducts.forEach((p) => {
        next[String(p.id)] = checked;
      });
      return next;
    });
  };

  const handlePrintSelectedRecipes = async () => {
    const selectedIds = new Set(
      Object.entries(printSelectedProductIds)
        .filter(([, on]) => on)
        .map(([id]) => Number(id))
    );
    if (selectedIds.size === 0) {
      showError("Seleccione al menos un producto.");
      return;
    }
    const active = (boms || []).filter(
      (b) => b.status === "A" && selectedIds.has(Number(b.productId))
    );
    if (active.length === 0) {
      showError("No hay BOMs activas para los productos seleccionados.");
      return;
    }
    try {
      setPrintRecipesLoading(true);
      const [materials, ...details] = await Promise.all([
        getMaterials(),
        ...active.map((b) => getBomById(b.id)),
      ]);
      const materialById = {};
      (materials || []).forEach((m) => {
        materialById[m.id] = m;
      });
      const inner = buildBomRecipesDocumentInnerHtml(
        details,
        materialById,
        (bom) => getProductName(bom.productId),
        (bom) => getColorName(bom.colorId)
      );
      openBomRecipesPrintWindow(inner, "Recetas BOM (selección)");
      setPrintModalOpen(false);
    } catch (err) {
      showError(err.message || "Error al generar el PDF de recetas");
    } finally {
      setPrintRecipesLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    return status === "A" ? (
      <Badge color="success">Activo</Badge>
    ) : (
      <Badge color="secondary">Inactivo</Badge>
    );
  };

  const tableData = useMemo(() => {
    return boms.map((bom) => ({
      id: bom.id,
      bomName: bom.bomName,
      product: getProductName(bom.productId),
      color: getColorName(bom.colorId),
      status: bom.status,
      statusBadge: getStatusBadge(bom.status),
      itemsCount: bom.items ? bom.items.length : 0,
      actions: (
        <div className="actions-right">
          <Button
            onClick={() => handleEdit(bom.id)}
            color="warning"
            size="sm"
            className="btn-icon btn-link edit mr-1"
            title="Editar"
          >
            <i className="fa fa-edit" />
          </Button>
          <Button
            onClick={() => handleDeleteClick(bom.id)}
            color="danger"
            size="sm"
            className="btn-icon btn-link remove"
            title="Eliminar"
          >
            <i className="fa fa-times" />
          </Button>
        </div>
      ),
    }));
  }, [boms, products, colors]);

  const columns = useMemo(
    () => [
      {
        Header: "Nombre",
        accessor: "bomName",
      },
      {
        Header: "Producto",
        accessor: "product",
      },
      {
        Header: "Color",
        accessor: "color",
      },
      {
        Header: "Items",
        accessor: "itemsCount",
      },
      {
        Header: "Estado",
        accessor: "statusBadge",
        sortable: false,
        filterable: false,
      },
      {
        Header: "Acciones",
        accessor: "actions",
        sortable: false,
        filterable: false,
      },
    ],
    []
  );

  const sourceOptions = filterBomsForCopy(copySourceSearch);
  const destOptions = filterBomsForCopy(copyDestSearch);

  const sourceBom = boms.find((b) => b.id === copySourceId);
  const destBom = boms.find((b) => b.id === copyDestId);
  const sourceLineCount = sourceBom?.items?.length ?? 0;
  const destLineCount = destBom?.items?.length ?? 0;

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">BOM (Bill of Materials)</CardTitle>
                </Col>
                <Col md="6" className="text-right d-flex flex-wrap justify-content-end" style={{ gap: 8 }}>
                  <Button color="secondary" outline className="btn-round" onClick={openCopyModal}>
                    <i className="fa fa-copy" /> Copiar BOM…
                  </Button>
                  <Button color="info" outline className="btn-round" onClick={openPrintModal} disabled={printRecipesLoading || loading}>
                    <i className="nc-icon nc-paper" /> {printRecipesLoading ? "…" : "Imprimir recetas (PDF)"}
                  </Button>
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nueva BOM
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {loading ? (
                <div className="text-center">
                  <p>Cargando BOMs...</p>
                </div>
              ) : boms.length === 0 ? (
                <div className="text-center">
                  <p>No hay BOMs registradas.</p>
                </div>
              ) : (
                <ReactTable data={tableData} columns={columns} className="-striped -highlight primary-pagination" />
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
      <BomForm
        bomId={selectedBomId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedBomId(null);
        }}
        onSuccess={handleFormSuccess}
      />
      <ConfirmModal
        isOpen={showDeleteModal}
        toggle={() => {
          setShowDeleteModal(false);
          setBomToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Eliminar BOM"
        message={`¿Está seguro de eliminar la BOM "${bomToDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        confirmColor="danger"
      />

      <Modal isOpen={copyModalOpen} toggle={() => !copySubmitting && setCopyModalOpen(false)} size="lg">
        <ModalHeader toggle={() => !copySubmitting && setCopyModalOpen(false)}>Copiar líneas de una BOM a otra</ModalHeader>
        <ModalBody>
          <p className="text-muted small">
            Se <strong>reemplazarán</strong> todas las líneas de materiales de la BOM destino por una copia de las de la origen. El producto, color y nombre de la BOM destino no cambian.
          </p>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>BOM origen (buscar)</Label>
                <Input
                  type="search"
                  placeholder="Nombre, producto, color…"
                  value={copySourceSearch}
                  onChange={(e) => setCopySourceSearch(e.target.value)}
                  disabled={copySubmitting}
                />
                <div
                  className="border rounded mt-1 p-1"
                  style={{ maxHeight: 200, overflowY: "auto", fontSize: 12, background: "#fafafa" }}
                >
                  {sourceOptions.map((b) => (
                    <div
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      className="p-1 rounded"
                      style={{
                        cursor: "pointer",
                        background: copySourceId === b.id ? "#dbeafe" : "transparent",
                      }}
                      onClick={() => setCopySourceId(b.id)}
                      onKeyDown={(e) => e.key === "Enter" && setCopySourceId(b.id)}
                    >
                      <strong>#{b.id}</strong> {bomSummaryLine(b)}
                    </div>
                  ))}
                </div>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>BOM destino (buscar)</Label>
                <Input
                  type="search"
                  placeholder="Nombre, producto, color…"
                  value={copyDestSearch}
                  onChange={(e) => setCopyDestSearch(e.target.value)}
                  disabled={copySubmitting}
                />
                <div
                  className="border rounded mt-1 p-1"
                  style={{ maxHeight: 200, overflowY: "auto", fontSize: 12, background: "#fafafa" }}
                >
                  {destOptions.map((b) => (
                    <div
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      className="p-1 rounded"
                      style={{
                        cursor: "pointer",
                        background: copyDestId === b.id ? "#fef3c7" : "transparent",
                      }}
                      onClick={() => setCopyDestId(b.id)}
                      onKeyDown={(e) => e.key === "Enter" && setCopyDestId(b.id)}
                    >
                      <strong>#{b.id}</strong> {bomSummaryLine(b)}
                    </div>
                  ))}
                </div>
              </FormGroup>
            </Col>
          </Row>
          {copySourceId && copyDestId && (
            <p className="mb-0 mt-2 small">
              Se reemplazarán <strong>{destLineCount}</strong> línea(s) en destino <strong>#{copyDestId}</strong> por{" "}
              <strong>{sourceLineCount}</strong> línea(s) copiadas desde origen <strong>#{copySourceId}</strong>.
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setCopyModalOpen(false)} disabled={copySubmitting}>
            Cancelar
          </Button>
          <Button color="primary" onClick={handleCopyConfirm} disabled={copySubmitting}>
            {copySubmitting ? "Copiando…" : "Confirmar copia"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={printModalOpen} toggle={() => !printRecipesLoading && setPrintModalOpen(false)}>
        <ModalHeader toggle={() => !printRecipesLoading && setPrintModalOpen(false)}>
          Imprimir recetas
        </ModalHeader>
        <ModalBody>
          <p className="text-muted small">
            Elija uno o más productos. Se imprimirán todas las recetas activas de cada uno (todos los colores).
          </p>
          <FormGroup>
            <Label>Producto</Label>
            <Input
              type="search"
              placeholder="Buscar por código o nombre…"
              value={printProductSearch}
              onChange={(e) => setPrintProductSearch(e.target.value)}
              disabled={printRecipesLoading}
            />
          </FormGroup>
          <div className="d-flex flex-wrap align-items-center mb-2" style={{ gap: 8 }}>
            <span className="text-muted small">
              {filteredPrintProducts.length} producto(s) · marcados: <strong>{selectedPrintCount}</strong>
            </span>
            <Button
              color="secondary"
              outline
              size="sm"
              onClick={() => setVisiblePrintSelection(!allVisiblePrintSelected)}
              disabled={printRecipesLoading || filteredPrintProducts.length === 0}
            >
              {allVisiblePrintSelected ? "Quitar visibles" : "Marcar visibles"}
            </Button>
            <Button
              color="secondary"
              outline
              size="sm"
              onClick={() => setPrintSelectedProductIds({})}
              disabled={printRecipesLoading || selectedPrintCount === 0}
            >
              Limpiar
            </Button>
          </div>
          <div className="border rounded p-1" style={{ maxHeight: 280, overflowY: "auto", background: "#fafafa" }}>
            {filteredPrintProducts.length === 0 ? (
              <div className="text-muted small text-center py-3">
                {printableProducts.length === 0
                  ? "No hay productos con BOM activa."
                  : "Ningún producto coincide con la búsqueda."}
              </div>
            ) : (
              filteredPrintProducts.map((p) => {
                const checked = Boolean(printSelectedProductIds[String(p.id)]);
                return (
                  <label
                    key={p.id}
                    className="d-flex align-items-start p-1 rounded mb-0"
                    style={{
                      cursor: printRecipesLoading ? "default" : "pointer",
                      background: checked ? "#dbeafe" : "transparent",
                      gap: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      disabled={printRecipesLoading}
                      onChange={() => togglePrintProduct(p.id)}
                    />
                    <span style={{ fontSize: 13, lineHeight: 1.35 }}>
                      <strong>{p.code || "—"}</strong> — {p.name || "—"}
                      <span className="text-muted">
                        {" "}· {p.activeBomCount} receta{p.activeBomCount === 1 ? "" : "s"}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setPrintModalOpen(false)} disabled={printRecipesLoading}>
            Cancelar
          </Button>
          <Button
            color="primary"
            onClick={handlePrintSelectedRecipes}
            disabled={printRecipesLoading || selectedPrintCount === 0}
          >
            {printRecipesLoading ? "Generando…" : `Imprimir (${selectedPrintCount})`}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default BomList;
