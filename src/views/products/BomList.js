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
} from "reactstrap";
import ReactTable from "components/ReactTable/ReactTable.js";
import { getBoms, deleteBom } from "services/bomService";
import { getProducts } from "services/productService";
import { getColors } from "services/colorService";
import BomForm from "./BomForm";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { showSuccess, showError } from "utils/notificationHelper";

function BomList() {
  const [boms, setBoms] = useState([]);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedBomId, setSelectedBomId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [bomToDelete, setBomToDelete] = useState(null);

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

  const getStatusBadge = (status) => {
    return status === "A" ? (
      <Badge color="success">Activo</Badge>
    ) : (
      <Badge color="secondary">Inactivo</Badge>
    );
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
                <Col md="6" className="text-right">
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nueva BOM
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {loading ? (
                <div className="text-center"><p>Cargando BOMs...</p></div>
              ) : boms.length === 0 ? (
                <div className="text-center"><p>No hay BOMs registradas.</p></div>
              ) : (
                <ReactTable
                  data={tableData}
                  columns={columns}
                  className="-striped -highlight primary-pagination"
                />
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
    </div>
  );
}

export default BomList;

