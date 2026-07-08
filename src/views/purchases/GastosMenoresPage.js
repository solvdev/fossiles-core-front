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
  getMinorExpenses,
  createMinorExpense,
  updateMinorExpense,
  deleteMinorExpense,
  getPendingReimbursements,
  markReimbursementAsPaid,
  getMinorExpenseSummary,
  uploadInvoiceFile,
  getAvailablePurchaseNumbers,
  getAllPurchaseNumbers,
  createPurchaseNumber,
  getPurchaseNumberById,
  getPurchaseNumberExpenses,
  updatePurchaseNumber,
  closePurchaseNumber,
  finalizePurchaseNumber,
  getPurchaseNumberItems,
  createPurchaseNumberItem,
  updatePurchaseNumberItem,
  deletePurchaseNumberItem,
  getCompensationsByPurchase,
  createCompensation,
  deleteCompensation,
} from "services/minorExpenseService";
import { getUsers } from "services/userService";
import { showSuccess, showError } from "utils/notificationHelper";
import { downloadPurchaseSummaryPdf } from "utils/purchaseSummaryPdf";
import * as XLSX from "xlsx";

const PURCHASE_STATUS_LABELS = {
  PENDIENTE: { color: "warning", text: "Abierta" },
  TERMINADO: { color: "info", text: "Artículos cerrados" },
  PAGADO: { color: "success", text: "Finalizada" },
};

const getPurchaseStatusLabel = (status) => (
  PURCHASE_STATUS_LABELS[status] || { color: "secondary", text: status || "N/A" }
);

const canModifyPurchaseItems = (purchase) => (
  purchase?.itemsEditable ?? purchase?.status === "PENDIENTE"
);

const canEditPurchaseExpenses = (purchase) => (
  purchase?.status !== "PAGADO" && (purchase?.editable ?? true)
);

const canEditPurchaseExpense = (purchase, expense) => (
  canEditPurchaseExpenses(purchase) && expense?.reimbursementStatus !== "PAGADO"
);

// Componente de filtro por defecto
function DefaultColumnFilter({
  column: { filterValue, preFilteredRows, setFilter },
}) {
  return (
    <Input
      type="text"
      value={filterValue || ""}
      onChange={(e) => {
        setFilter(e.target.value || undefined);
      }}
      placeholder="Buscar..."
      size="sm"
      style={{ fontSize: "0.875rem", padding: "0.25rem 0.5rem" }}
    />
  );
}

function GastosMenoresPage() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [showSummary, setShowSummary] = useState(true);
  const [summary, setSummary] = useState(null);
  const [pendingReimbursements, setPendingReimbursements] = useState([]);
  const [showReimbursementModal, setShowReimbursementModal] = useState(false);
  const [selectedReimbursement, setSelectedReimbursement] = useState(null);
  const [purchaseNumbers, setPurchaseNumbers] = useState([]);
  const [allPurchaseNumbers, setAllPurchaseNumbers] = useState([]); // Para filtros
  const [purchaseNumberMode, setPurchaseNumberMode] = useState("new"); // "new" o "existing"
  const [expensePurchaseLink, setExpensePurchaseLink] = useState(null);
  const [expenseFormReturnToPurchase, setExpenseFormReturnToPurchase] = useState(false);
  const [newPurchaseNumberDescription, setNewPurchaseNumberDescription] = useState("");
  const [newPurchaseNumberTotalAmount, setNewPurchaseNumberTotalAmount] = useState("");
  const [showPurchaseDetailModal, setShowPurchaseDetailModal] = useState(false);
  const [selectedPurchaseNumber, setSelectedPurchaseNumber] = useState(null);
  const [purchaseExpenses, setPurchaseExpenses] = useState([]);
  const [loadingPurchaseDetail, setLoadingPurchaseDetail] = useState(false);
  const [viewMode, setViewMode] = useState("list"); // "list" o "grouped"
  const [groupedExpenses, setGroupedExpenses] = useState({});
  const [reimbursementAdjustments, setReimbursementAdjustments] = useState({}); // { expenseId: adjustmentValue }
  const [savingAdjustments, setSavingAdjustments] = useState(false);
  const [editingPurchaseNumber, setEditingPurchaseNumber] = useState(false);
  const [purchaseNumberEditData, setPurchaseNumberEditData] = useState({
    description: "",
    totalAmount: "",
  });
  const [showCreatePurchaseModal, setShowCreatePurchaseModal] = useState(false);
  const [newPurchaseDescription, setNewPurchaseDescription] = useState("");
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemFormData, setItemFormData] = useState({
    itemName: "",
    description: "",
    estimatedPrice: "",
    quantity: "1",
  });
  const [pendingItemDrafts, setPendingItemDrafts] = useState([]);

  const EMPTY_ITEM_FORM = {
    itemName: "",
    description: "",
    estimatedPrice: "",
    quantity: "1",
  };

  const ITEM_MODAL_LABEL_STYLE = { fontWeight: 600, color: "#212529" };
  const ITEM_MODAL_TEXT_STYLE = { fontWeight: 500, color: "#212529" };

  const parseItemUnitPrice = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const normalized = String(value).replace(/,/g, "").trim();
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const parseItemQuantity = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const normalized = String(value).replace(/,/g, "").trim();
    const parsed = parseInt(normalized, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const calcItemLineTotal = (unitPrice, quantity) => {
    const price = parseItemUnitPrice(unitPrice);
    const qty = parseItemQuantity(quantity);
    if (price === null || qty === null) return null;
    return Math.round(price * qty * 100) / 100;
  };

  const resetItemModal = () => {
    setShowItemModal(false);
    setEditingItem(null);
    setItemFormData({ ...EMPTY_ITEM_FORM });
    setPendingItemDrafts([]);
  };

  const buildItemPayload = (data) => ({
    itemName: data.itemName.trim(),
    description: data.description?.trim() || null,
    estimatedPrice: parseItemUnitPrice(data.estimatedPrice),
    quantity: parseItemQuantity(data.quantity) || 1,
  });

  const validateItemForm = (data) => {
    if (!data.itemName?.trim() || !data.estimatedPrice || !data.quantity) {
      showError("Por favor complete todos los campos requeridos del artículo");
      return false;
    }
    const unitPrice = parseItemUnitPrice(data.estimatedPrice);
    const quantity = parseItemQuantity(data.quantity);
    if (unitPrice === null || unitPrice <= 0) {
      showError("El precio estimado debe ser mayor a 0");
      return false;
    }
    if (quantity === null || quantity <= 0) {
      showError("La cantidad debe ser al menos 1");
      return false;
    }
    return true;
  };

  // Compensaciones
  const [purchaseCompensations, setPurchaseCompensations] = useState([]);
  const [showCompensationModal, setShowCompensationModal] = useState(false);
  const [compensationForm, setCompensationForm] = useState({
    sourcePurchaseId: "",
    targetPurchaseId: "",
    amount: "",
    description: "",
  });

  // Filtros
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    supplier: "",
    purchaserName: "",
    reimbursementStatus: "",
    invoiceNumber: "",
    description: "",
    purchaseNumberId: "",
  });

  const [formData, setFormData] = useState({
    invoiceNumber: "",
    purchaseDate: new Date().toISOString().split("T")[0],
    description: "",
    supplier: "",
    totalAmount: "",
    purchaserName: "Mensajero",
    authorizerName: "Gilberto Minas",
    companyAmount: "",
    messengerAmount: "",
    initialAmountGiven: "",
    returnedAmount: "",
    reimbursementStatus: "NO_APLICA",
    reimbursementDate: "",
    reimbursementPaymentMethod: "",
    initialPaymentMethod: "EMPRESA",
    observations: "",
    invoiceFileUrl: "",
    purchaseNumberId: null,
    purchaseNumberItemId: null,
    estimatedPrice: null,
  });
  const [invoiceFile, setInvoiceFile] = useState(null);

  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    loadExpenses();
    loadSummary();
    loadPendingReimbursements();
    loadPurchaseNumbers();
    loadAllPurchaseNumbers();
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [filters]);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const filterParams = {};
      if (filters.startDate) filterParams.startDate = filters.startDate;
      if (filters.endDate) filterParams.endDate = filters.endDate;
      if (filters.supplier) filterParams.supplier = filters.supplier;
      if (filters.purchaserName) filterParams.purchaserName = filters.purchaserName;
      if (filters.reimbursementStatus) filterParams.reimbursementStatus = filters.reimbursementStatus;
      if (filters.invoiceNumber) filterParams.invoiceNumber = filters.invoiceNumber;
      if (filters.description) filterParams.description = filters.description;
      if (filters.purchaseNumberId) filterParams.purchaseNumberId = parseInt(filters.purchaseNumberId);

      const data = await getMinorExpenses(filterParams);
      setExpenses(data || []);

      // Agrupar gastos por número de compra
      const grouped = {};
      const withoutPurchase = [];

      (data || []).forEach(expense => {
        if (expense.purchaseNumberId && expense.purchaseNumber) {
          if (!grouped[expense.purchaseNumberId]) {
            grouped[expense.purchaseNumberId] = {
              purchaseNumber: expense.purchaseNumber,
              purchaseNumberDescription: expense.purchaseNumberDescription || null,
              purchaseNumberId: expense.purchaseNumberId,
              expenses: [],
              total: 0,
            };
          }
          grouped[expense.purchaseNumberId].expenses.push(expense);
          grouped[expense.purchaseNumberId].total += parseFloat(expense.totalAmount || 0);
        } else {
          withoutPurchase.push(expense);
        }
      });

      // Agregar gastos sin número de compra si existen
      if (withoutPurchase.length > 0) {
        grouped._withoutPurchase = withoutPurchase;
      }

      setGroupedExpenses(grouped);
    } catch (err) {
      setError(err.message || "Error al cargar los gastos");
    } finally {
      setLoading(false);
    }
  };


  const loadSummary = async () => {
    try {
      const data = await getMinorExpenseSummary(
        filters.startDate || null,
        filters.endDate || null
      );
      setSummary(data);
    } catch (err) {
      console.error("Error al cargar resumen:", err);
    }
  };

  const loadPendingReimbursements = async () => {
    try {
      const data = await getPendingReimbursements();
      setPendingReimbursements(data || []);
    } catch (err) {
      console.error("Error al cargar reembolsos pendientes:", err);
    }
  };

  const loadPurchaseNumbers = async () => {
    try {
      const data = await getAvailablePurchaseNumbers();
      setPurchaseNumbers(data || []);
    } catch (err) {
      console.error("Error al cargar números de compra:", err);
    }
  };

  const loadAllPurchaseNumbers = async () => {
    try {
      const data = await getAllPurchaseNumbers();
      // Ordenar por fecha de creación descendente (más recientes primero)
      const sorted = (data || []).sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      setAllPurchaseNumbers(sorted);
    } catch (err) {
      console.error("Error al cargar todos los números de compra:", err);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters({ ...filters, [field]: value });
  };

  const handleFormChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
    // Limpiar error del campo
    if (formErrors[field]) {
      setFormErrors({ ...formErrors, [field]: null });
    }

    // Si cambia el método de pago inicial, ajustar reembolso y cálculos
    if (field === "initialPaymentMethod") {
      if (value === "EMPRESA") {
        // Si la empresa paga, calcular el vuelto a recibir
        const total = parseFloat(formData.totalAmount) || 0;
        const initialGiven = parseFloat(formData.initialAmountGiven) || 0;
        const vuelto = initialGiven > 0 && total > 0 ? initialGiven - total : 0;

        setFormData((prev) => ({
          ...prev,
          initialPaymentMethod: value,
          reimbursementStatus: "NO_APLICA",
          messengerAmount: vuelto > 0 ? vuelto.toFixed(2) : "",
          companyAmount: total > 0 ? total.toString() : "",
        }));
      } else if (value === "MENSAJERO") {
        setFormData((prev) => ({
          ...prev,
          initialPaymentMethod: value,
          reimbursementStatus: "PENDIENTE",
          messengerAmount: prev.totalAmount || "",
          companyAmount: "",
          initialAmountGiven: "",
          returnedAmount: "",
        }));
      }
    }

    // Si cambia el total y el método de pago es EMPRESA, actualizar companyAmount y vuelto
    if (field === "totalAmount" && formData.initialPaymentMethod === "EMPRESA") {
      const total = parseFloat(value) || 0;
      const initialGiven = parseFloat(formData.initialAmountGiven) || 0;
      const vuelto = initialGiven > 0 && total > 0 ? initialGiven - total : 0;

      setFormData((prev) => ({
        ...prev,
        totalAmount: value,
        companyAmount: total > 0 ? total.toString() : "",
        messengerAmount: vuelto > 0 ? vuelto.toFixed(2) : "",
      }));
    }

    // Calcular automáticamente el monto faltante
    if (field === "totalAmount" || field === "companyAmount" || field === "messengerAmount") {
      const total = parseFloat(formData.totalAmount) || 0;
      const company = parseFloat(field === "companyAmount" ? value : formData.companyAmount) || 0;
      const messenger = parseFloat(field === "messengerAmount" ? value : formData.messengerAmount) || 0;

      if (field === "totalAmount") {
        // Si cambia el total, ajustar el mensajero si es necesario
        if (formData.initialPaymentMethod === "MENSAJERO") {
          setFormData((prev) => ({
            ...prev,
            totalAmount: value,
            messengerAmount: (total - company).toString(),
          }));
        }
      } else if (field === "companyAmount") {
        // Si cambia el monto de empresa, ajustar el mensajero
        setFormData((prev) => ({
          ...prev,
          companyAmount: value,
          messengerAmount: (total - company).toString(),
        }));
      } else if (field === "messengerAmount") {
        // Si cambia el monto del mensajero, ajustar el de empresa
        setFormData((prev) => ({
          ...prev,
          messengerAmount: value,
          companyAmount: (total - messenger).toString(),
        }));
      }
    }

    // Calcular automáticamente el monto devuelto (caja chica) y vuelto a recibir
    if (field === "initialAmountGiven" || field === "totalAmount") {
      const initialGiven = parseFloat(field === "initialAmountGiven" ? value : formData.initialAmountGiven) || 0;
      const total = parseFloat(field === "totalAmount" ? value : formData.totalAmount) || 0;

      if (initialGiven > 0 && total > 0) {
        const calculatedReturned = initialGiven - total;
        if (calculatedReturned >= 0) {
          setFormData((prev) => {
            const newData = {
              ...prev,
              [field]: value,
              returnedAmount: calculatedReturned.toFixed(2),
            };
            // Si la empresa paga, el vuelto a recibir es el mismo que el monto devuelto
            if (prev.initialPaymentMethod === "EMPRESA") {
              newData.messengerAmount = calculatedReturned.toFixed(2);
              newData.companyAmount = total.toString();
            }
            return newData;
          });
        } else {
          setFormData((prev) => ({
            ...prev,
            [field]: value,
            returnedAmount: "",
            messengerAmount: prev.initialPaymentMethod === "EMPRESA" ? "" : prev.messengerAmount,
          }));
        }
      } else if (field === "initialAmountGiven" && initialGiven === 0) {
        setFormData((prev) => ({
          ...prev,
          initialAmountGiven: value,
          returnedAmount: "",
          messengerAmount: prev.initialPaymentMethod === "EMPRESA" ? "" : prev.messengerAmount,
        }));
      }
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.invoiceNumber) errors.invoiceNumber = "Número de factura es requerido";
    if (!formData.purchaseDate) errors.purchaseDate = "Fecha de compra es requerida";
    if (!formData.description) errors.description = "Descripción es requerida";
    if (!formData.supplier) errors.supplier = "Proveedor es requerido";
    if (!formData.totalAmount || parseFloat(formData.totalAmount) <= 0) {
      errors.totalAmount = "Monto total debe ser mayor a 0";
    }
    if (!formData.purchaserName) {
      errors.purchaserName = "Persona que compró es requerida";
    }
    if (!formData.initialPaymentMethod) errors.initialPaymentMethod = "Forma de pago inicial es requerida";

    // Validar monto inicial dado cuando el método de pago es EMPRESA (caja chica)
    if (formData.initialPaymentMethod === "EMPRESA") {
      if (!formData.initialAmountGiven || parseFloat(formData.initialAmountGiven) <= 0) {
        errors.initialAmountGiven = "El monto inicial dado al mensajero es requerido cuando el método de pago es Empresa";
      } else {
        const initialGiven = parseFloat(formData.initialAmountGiven);
        const total = parseFloat(formData.totalAmount) || 0;
        if (initialGiven < total) {
          errors.initialAmountGiven = `El monto inicial dado (${initialGiven.toFixed(2)}) no puede ser menor al monto total gastado (${total.toFixed(2)})`;
        }
      }
    }

    // Validar montos según el método de pago
    const total = parseFloat(formData.totalAmount) || 0;
    const company = parseFloat(formData.companyAmount) || 0;
    const messenger = parseFloat(formData.messengerAmount) || 0;

    if (formData.initialPaymentMethod === "EMPRESA") {
      // Cuando la empresa paga: companyAmount debe ser igual a totalAmount
      // messengerAmount es el vuelto a recibir (no se suma al total)
      if (Math.abs(company - total) > 0.01) {
        errors.companyAmount = `El monto empresa (${company.toFixed(2)}) debe ser igual al monto total (${total.toFixed(2)}) cuando la empresa paga`;
      }
    } else {
      // Cuando el mensajero paga: companyAmount + messengerAmount = totalAmount
      const sum = company + messenger;
      if (Math.abs(sum - total) > 0.01) {
        errors.totalAmount = `La suma de monto empresa (${company.toFixed(2)}) y monto mensajero (${messenger.toFixed(2)}) debe ser igual al monto total (${total.toFixed(2)})`;
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      showError("Por favor corrija los errores en el formulario");
      return;
    }

    try {
      setLoading(true);

      // Manejar número de compra
      let purchaseNumberId = null;
      if (purchaseNumberMode === "existing") {
        if (!formData.purchaseNumberId) {
          showError("Debe seleccionar un número de compra existente");
          setLoading(false);
          return;
        }
        purchaseNumberId = formData.purchaseNumberId;
      } else if (purchaseNumberMode === "new") {
        // Validar que se haya ingresado el total a liquidar
        if (!newPurchaseNumberTotalAmount || parseFloat(newPurchaseNumberTotalAmount) <= 0) {
          showError("Debe ingresar la cantidad total a liquidar para crear un nuevo número de compra");
          setLoading(false);
          return;
        }
        // Crear nuevo número de compra
        try {
          const newPurchaseNumber = await createPurchaseNumber({
            description: newPurchaseNumberDescription || null,
            totalAmount: parseFloat(newPurchaseNumberTotalAmount),
          });
          purchaseNumberId = newPurchaseNumber.id;
        } catch (err) {
          showError(err.message || "Error al crear número de compra");
          setLoading(false);
          return;
        }
      }
      // Si purchaseNumberMode === "none", purchaseNumberId permanece null

      // Preparar datos según el método de pago
      const total = parseFloat(formData.totalAmount);
      let companyAmount = 0;
      let messengerAmount = 0;

      if (formData.initialPaymentMethod === "EMPRESA") {
        // Cuando la empresa paga: companyAmount = totalAmount, messengerAmount = vuelto
        companyAmount = total;
        messengerAmount = parseFloat(formData.messengerAmount) || 0; // Vuelto a recibir
      } else {
        // Cuando el mensajero paga: companyAmount + messengerAmount = totalAmount
        companyAmount = parseFloat(formData.companyAmount) || 0;
        messengerAmount = parseFloat(formData.messengerAmount) || 0;
      }

      const expenseData = {
        invoiceNumber: formData.invoiceNumber,
        purchaseDate: formData.purchaseDate,
        description: formData.description,
        supplier: formData.supplier,
        totalAmount: total,
        purchaserName: formData.purchaserName,
        authorizerName: formData.authorizerName || null,
        companyAmount: companyAmount,
        messengerAmount: messengerAmount,
        initialAmountGiven: formData.initialAmountGiven ? parseFloat(formData.initialAmountGiven) : null,
        returnedAmount: formData.returnedAmount ? parseFloat(formData.returnedAmount) : null,
        reimbursementStatus: formData.reimbursementStatus,
        reimbursementDate: formData.reimbursementDate || null,
        reimbursementPaymentMethod: formData.reimbursementPaymentMethod || null,
        initialPaymentMethod: formData.initialPaymentMethod,
        observations: formData.observations || null,
        invoiceFileUrl: formData.invoiceFileUrl || null,
        purchaseNumberId: purchaseNumberId,
        purchaseNumberItemId: formData.purchaseNumberItemId || null,
        estimatedPrice: formData.estimatedPrice || null,
      };

      let savedExpense;
      if (isEditing && selectedExpenseId) {
        savedExpense = await updateMinorExpense(selectedExpenseId, expenseData);
        showSuccess("Gasto actualizado correctamente");
      } else {
        savedExpense = await createMinorExpense(expenseData);
        showSuccess("Gasto registrado correctamente");
      }

      // Si hay un archivo para subir, subirlo después de crear/actualizar
      if (invoiceFile && savedExpense?.id) {
        try {
          setUploadingFile(true);
          const updatedExpense = await uploadInvoiceFile(savedExpense.id, invoiceFile);
          setFormData(prev => ({ ...prev, invoiceFileUrl: updatedExpense.invoiceFileUrl }));
          showSuccess("Archivo de factura subido correctamente");
        } catch (uploadErr) {
          showError(uploadErr.message || "Error al subir archivo de factura");
        } finally {
          setUploadingFile(false);
        }
      }

      await closeExpenseForm();
      loadExpenses();
      loadSummary();
      loadPendingReimbursements();
    } catch (err) {
      showError(err.message || "Error al guardar el gasto");
    } finally {
      setLoading(false);
    }
  };

  const populateExpenseFormFromExpense = (expense) => {
    setFormData({
      invoiceNumber: expense.invoiceNumber || "",
      purchaseDate: expense.purchaseDate || new Date().toISOString().split("T")[0],
      description: expense.description || "",
      supplier: expense.supplier || "",
      totalAmount: expense.totalAmount?.toString() || "",
      purchaserName: expense.purchaserName || "Mensajero",
      authorizerName: expense.authorizerName || "Contabilidad",
      companyAmount: expense.companyAmount?.toString() || "",
      messengerAmount: expense.messengerAmount?.toString() || "",
      initialAmountGiven: expense.initialAmountGiven?.toString() || "",
      returnedAmount: expense.returnedAmount?.toString() || "",
      reimbursementStatus: expense.reimbursementStatus || "NO_APLICA",
      reimbursementDate: expense.reimbursementDate || "",
      reimbursementPaymentMethod: expense.reimbursementPaymentMethod || "",
      initialPaymentMethod: expense.initialPaymentMethod || "EMPRESA",
      observations: expense.observations || "",
      invoiceFileUrl: expense.invoiceFileUrl || "",
      purchaseNumberId: expense.purchaseNumberId || null,
      purchaseNumberItemId: expense.purchaseNumberItemId || null,
      estimatedPrice: expense.estimatedPrice || null,
    });
    setInvoiceFile(null);
    setIsEditing(true);
    setSelectedExpenseId(expense.id);
    setPurchaseNumberMode(expense.purchaseNumberId ? "existing" : "new");
  };

  const buildExpensePurchaseLink = (purchase, { expense, item } = {}) => {
    if (!purchase) return null;
    const linkedItem = item || (
      expense?.purchaseNumberItemId
        ? purchaseItems.find((i) => i.id === expense.purchaseNumberItemId)
        : null
    );
    return {
      purchaseNumberId: purchase.id,
      purchaseNumber: purchase.purchaseNumber,
      description: purchase.description || "",
      itemId: linkedItem?.id || expense?.purchaseNumberItemId || null,
      itemName: linkedItem?.itemName || null,
    };
  };

  const handleEdit = (expense) => {
    populateExpenseFormFromExpense(expense);
    setExpensePurchaseLink(null);
    setExpenseFormReturnToPurchase(false);
    setShowForm(true);
    loadPurchaseNumbers();
  };

  const openEditExpenseFormFromPurchase = (expense, item = null) => {
    if (!selectedPurchaseNumber) return;
    setExpensePurchaseLink(buildExpensePurchaseLink(selectedPurchaseNumber, { expense, item }));
    setExpenseFormReturnToPurchase(true);
    populateExpenseFormFromExpense(expense);
    setShowForm(true);
    loadPurchaseNumbers();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Está seguro de eliminar este gasto?")) {
      return;
    }

    try {
      setLoading(true);
      await deleteMinorExpense(id);
      showSuccess("Gasto eliminado correctamente");
      loadExpenses();
      loadSummary();
    } catch (err) {
      showError(err.message || "Error al eliminar el gasto");
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (expense) => {
    setSelectedExpense(expense);
    setShowDetailsModal(true);
  };

  const refreshPurchaseDetailModal = async (purchaseNumberId) => {
    if (!purchaseNumberId) return;

    try {
      setLoadingPurchaseDetail(true);
      const [purchaseData, expenses, items, compensations] = await Promise.all([
        getPurchaseNumberById(purchaseNumberId),
        getPurchaseNumberExpenses(purchaseNumberId),
        getPurchaseNumberItems(purchaseNumberId),
        getCompensationsByPurchase(purchaseNumberId)
      ]);
      setSelectedPurchaseNumber(purchaseData);
      setPurchaseExpenses(expenses || []);
      setPurchaseItems(items || []);
      setPurchaseCompensations(compensations || []);
      const adjustments = {};
      (expenses || []).forEach((exp) => {
        if (exp.reimbursementAdjustment != null) {
          adjustments[exp.id] = exp.reimbursementAdjustment.toString();
        }
      });
      setReimbursementAdjustments(adjustments);
    } catch (err) {
      showError(err.message || "Error al cargar los detalles de la compra");
    } finally {
      setLoadingPurchaseDetail(false);
    }
  };

  const handleViewPurchaseDetails = async (purchaseNumberId) => {
    if (!purchaseNumberId) return;
    await refreshPurchaseDetailModal(purchaseNumberId);
    setShowPurchaseDetailModal(true);
  };

  const handleAdjustmentChange = (expenseId, value) => {
    setReimbursementAdjustments(prev => ({
      ...prev,
      [expenseId]: value
    }));
  };

  const handleSaveAdjustments = async () => {
    try {
      setSavingAdjustments(true);
      const pendingExpenses = purchaseExpenses.filter(e => e.reimbursementStatus === "PENDIENTE");

      // Guardar ajustes para cada factura pendiente
      const updatePromises = pendingExpenses.map(expense => {
        const adjustment = reimbursementAdjustments[expense.id];
        const adjustmentValue = adjustment && adjustment !== "" ? parseFloat(adjustment) : null;

        // Obtener los datos actuales de la factura
        return updateMinorExpense(expense.id, {
          invoiceNumber: expense.invoiceNumber,
          purchaseDate: expense.purchaseDate,
          description: expense.description,
          supplier: expense.supplier,
          totalAmount: expense.totalAmount,
          purchaserName: expense.purchaserName,
          authorizerName: expense.authorizerName,
          companyAmount: expense.companyAmount,
          messengerAmount: expense.messengerAmount,
          initialAmountGiven: expense.initialAmountGiven,
          returnedAmount: expense.returnedAmount,
          reimbursementStatus: expense.reimbursementStatus,
          reimbursementDate: expense.reimbursementDate,
          reimbursementPaymentMethod: expense.reimbursementPaymentMethod,
          reimbursementAdjustment: adjustmentValue,
          initialPaymentMethod: expense.initialPaymentMethod,
          observations: expense.observations,
          invoiceFileUrl: expense.invoiceFileUrl,
          purchaseNumberId: expense.purchaseNumberId,
          purchaseNumberItemId: expense.purchaseNumberItemId,
          estimatedPrice: expense.estimatedPrice,
        });
      });

      await Promise.all(updatePromises);
      showSuccess("Ajustes de reembolso guardados correctamente");

      // Recargar los datos
      const [purchaseData, expenses] = await Promise.all([
        getPurchaseNumberById(selectedPurchaseNumber.id),
        getPurchaseNumberExpenses(selectedPurchaseNumber.id)
      ]);
      setSelectedPurchaseNumber(purchaseData);
      setPurchaseExpenses(expenses || []);

      // Actualizar ajustes
      const adjustments = {};
      expenses.forEach(exp => {
        if (exp.reimbursementAdjustment != null) {
          adjustments[exp.id] = exp.reimbursementAdjustment.toString();
        }
      });
      setReimbursementAdjustments(adjustments);
    } catch (err) {
      showError(err.message || "Error al guardar los ajustes");
    } finally {
      setSavingAdjustments(false);
    }
  };

  const closePurchaseDetailModal = () => {
    if (showForm) {
      setShowForm(false);
      setExpensePurchaseLink(null);
      setExpenseFormReturnToPurchase(false);
      setIsEditing(false);
      setSelectedExpenseId(null);
      setFormErrors({});
    }
    setShowPurchaseDetailModal(false);
    setSelectedPurchaseNumber(null);
    setPurchaseExpenses([]);
    setPurchaseCompensations([]);
    setEditingPurchaseNumber(false);
    setPurchaseNumberEditData({
      description: "",
      totalAmount: "",
    });
  };

  const handleDownloadPurchaseSummary = () => {
    try {
      downloadPurchaseSummaryPdf({
        purchase: selectedPurchaseNumber,
        items: purchaseItems,
        expenses: purchaseExpenses,
      });
      showSuccess("Resumen de compra descargado correctamente");
    } catch (err) {
      showError(err.message || "Error al descargar el resumen de la compra");
    }
  };

  const handleClosePurchaseArticles = async () => {
    if (!selectedPurchaseNumber) return;

    if (purchaseItems.length === 0) {
      showError("Agregue al menos un artículo antes de cerrar la lista");
      return;
    }

    if (!window.confirm(
      "¿Cerrar la lista de artículos?\n\nYa no se podrán agregar ni modificar artículos. Podrá seguir registrando y editando gastos hasta finalizar la compra."
    )) {
      return;
    }

    try {
      setLoading(true);
      const updatedPurchase = await closePurchaseNumber(selectedPurchaseNumber.id);
      setSelectedPurchaseNumber(updatedPurchase);
      showSuccess("Lista de artículos cerrada correctamente");
      loadPurchaseNumbers();
    } catch (err) {
      showError(err.message || "Error al cerrar la lista de artículos");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizePurchase = async () => {
    if (!selectedPurchaseNumber) return;

    if (!window.confirm(
      "¿Finalizar esta compra?\n\nYa no se podrán crear ni editar gastos asociados."
    )) {
      return;
    }

    try {
      setLoading(true);
      const updatedPurchase = await finalizePurchaseNumber(selectedPurchaseNumber.id);
      setSelectedPurchaseNumber(updatedPurchase);
      showSuccess("Compra finalizada correctamente");
      loadPurchaseNumbers();
    } catch (err) {
      showError(err.message || "Error al finalizar la compra");
    } finally {
      setLoading(false);
    }
  };

  const handleEditPurchaseExpense = (expense, item = null) => {
    openEditExpenseFormFromPurchase(expense, item);
  };

  const handleCreatePurchase = async () => {
    try {
      setLoading(true);
      const newPurchase = await createPurchaseNumber({
        description: newPurchaseDescription || null,
        totalAmount: null, // Se calculará automáticamente desde los items
      });

      showSuccess("Compra creada correctamente");
      setShowCreatePurchaseModal(false);
      setNewPurchaseDescription("");

      // Recargar números de compra ANTES de abrir el modal
      await Promise.all([
        loadAllPurchaseNumbers(),
        loadPurchaseNumbers()
      ]);

      // Abrir la compra recién creada para agregar artículos
      await handleViewPurchaseDetails(newPurchase.id, newPurchase.purchaseNumber);
    } catch (err) {
      showError(err.message || "Error al crear la compra");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePurchaseNumber = async () => {
    try {
      setLoading(true);
      const updated = await updatePurchaseNumber(selectedPurchaseNumber.id, {
        description: purchaseNumberEditData.description || null,
        totalAmount: purchaseNumberEditData.totalAmount ? parseFloat(purchaseNumberEditData.totalAmount) : null,
      });

      showSuccess("Compra actualizada correctamente");
      setEditingPurchaseNumber(false);

      // Recargar los datos
      const [purchaseData, expenses, items] = await Promise.all([
        getPurchaseNumberById(selectedPurchaseNumber.id),
        getPurchaseNumberExpenses(selectedPurchaseNumber.id),
        getPurchaseNumberItems(selectedPurchaseNumber.id)
      ]);
      setSelectedPurchaseNumber(purchaseData);
      setPurchaseExpenses(expenses || []);
      setPurchaseItems(items || []);
    } catch (err) {
      showError(err.message || "Error al actualizar la compra");
    } finally {
      setLoading(false);
    }
  };

  // ========== PURCHASE NUMBER ITEMS ==========

  const handleCreateItem = async () => {
    try {
      if (editingItem) {
        if (!validateItemForm(itemFormData)) return;
        setLoading(true);
        await updatePurchaseNumberItem(
          selectedPurchaseNumber.id,
          editingItem.id,
          buildItemPayload(itemFormData)
        );
        showSuccess("Artículo actualizado correctamente");
        resetItemModal();
        const [purchaseData, items] = await Promise.all([
          getPurchaseNumberById(selectedPurchaseNumber.id),
          getPurchaseNumberItems(selectedPurchaseNumber.id),
        ]);
        setSelectedPurchaseNumber(purchaseData);
        setPurchaseItems(items || []);
        return;
      }

      const drafts = [...pendingItemDrafts];
      const formFilled = itemFormData.itemName?.trim()
        && itemFormData.estimatedPrice
        && itemFormData.quantity;
      if (formFilled) {
        if (!validateItemForm(itemFormData)) return;
        drafts.push({
          tempId: `form-${Date.now()}`,
          ...buildItemPayload(itemFormData),
        });
      }

      if (drafts.length === 0) {
        showError("Agregue al menos un artículo a la lista o complete el formulario");
        return;
      }

      setLoading(true);
      for (const draft of drafts) {
        await createPurchaseNumberItem(selectedPurchaseNumber.id, {
          itemName: draft.itemName,
          description: draft.description,
          estimatedPrice: draft.estimatedPrice,
          quantity: draft.quantity,
        });
      }

      showSuccess(
        drafts.length === 1
          ? "Artículo agregado correctamente"
          : `${drafts.length} artículos agregados correctamente`
      );
      resetItemModal();

      const [purchaseData, items] = await Promise.all([
        getPurchaseNumberById(selectedPurchaseNumber.id),
        getPurchaseNumberItems(selectedPurchaseNumber.id),
      ]);
      setSelectedPurchaseNumber(purchaseData);
      setPurchaseItems(items || []);
    } catch (err) {
      showError(err.message || "Error al guardar el artículo");
    } finally {
      setLoading(false);
    }
  };

  const handleAddItemToList = () => {
    if (!validateItemForm(itemFormData)) return;
    setPendingItemDrafts((prev) => [
      ...prev,
      {
        tempId: `${Date.now()}-${prev.length}`,
        ...buildItemPayload(itemFormData),
      },
    ]);
    setItemFormData({ ...EMPTY_ITEM_FORM });
  };

  const handleRemovePendingItem = (tempId) => {
    setPendingItemDrafts((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setPendingItemDrafts([]);
    setItemFormData({
      itemName: item.itemName || "",
      description: item.description || "",
      estimatedPrice: item.estimatedPrice?.toString() || "",
      quantity: item.quantity?.toString() || "1",
    });
    setShowItemModal(true);
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm("¿Está seguro de eliminar este artículo?")) {
      return;
    }

    try {
      setLoading(true);
      await deletePurchaseNumberItem(selectedPurchaseNumber.id, itemId);
      showSuccess("Artículo eliminado correctamente");

      // Recargar items y compra
      const [purchaseData, items] = await Promise.all([
        getPurchaseNumberById(selectedPurchaseNumber.id),
        getPurchaseNumberItems(selectedPurchaseNumber.id)
      ]);
      setSelectedPurchaseNumber(purchaseData);
      setPurchaseItems(items || []);
    } catch (err) {
      showError(err.message || "Error al eliminar el artículo");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExpenseFromItem = (item) => {
    if (!selectedPurchaseNumber) return;

    const estimatedTotal = calcItemLineTotal(item.estimatedPrice, item.quantity) || 0;
    setExpensePurchaseLink(buildExpensePurchaseLink(selectedPurchaseNumber, { item }));
    setExpenseFormReturnToPurchase(true);
    setFormData({
      invoiceNumber: "",
      purchaseDate: new Date().toISOString().split("T")[0],
      description: item.description || item.itemName || "",
      supplier: "",
      totalAmount: estimatedTotal.toFixed(2),
      purchaserName: "Mensajero",
      authorizerName: "Contabilidad",
      companyAmount: "",
      messengerAmount: "",
      initialAmountGiven: "",
      returnedAmount: "",
      reimbursementStatus: "NO_APLICA",
      reimbursementDate: "",
      reimbursementPaymentMethod: "",
      initialPaymentMethod: "EMPRESA",
      observations: "",
      invoiceFileUrl: "",
      purchaseNumberId: selectedPurchaseNumber.id,
      purchaseNumberItemId: item.id,
      estimatedPrice: parseFloat(item.estimatedPrice),
    });
    setPurchaseNumberMode("existing");
    setIsEditing(false);
    setSelectedExpenseId(null);
    setShowForm(true);
  };

  const handleMarkReimbursementPaid = (expense) => {
    setSelectedReimbursement(expense);
    setShowReimbursementModal(true);
  };

  const handleConfirmReimbursementPayment = async (paymentDate, paymentMethod) => {
    try {
      setLoading(true);
      await markReimbursementAsPaid(
        selectedReimbursement.id,
        paymentDate,
        paymentMethod
      );
      showSuccess("Reembolso marcado como pagado");
      setShowReimbursementModal(false);
      setSelectedReimbursement(null);
      loadExpenses();
      loadSummary();
      loadPendingReimbursements();
    } catch (err) {
      showError(err.message || "Error al marcar reembolso como pagado");
    } finally {
      setLoading(false);
    }
  };

  const closeExpenseForm = async () => {
    const shouldReturn = expenseFormReturnToPurchase;
    const purchaseId = selectedPurchaseNumber?.id;

    setFormData({
      invoiceNumber: "",
      purchaseDate: new Date().toISOString().split("T")[0],
      description: "",
      supplier: "",
      totalAmount: "",
      purchaserName: "Mensajero",
      authorizerName: "Contabilidad",
      companyAmount: "",
      messengerAmount: "",
      initialAmountGiven: "",
      returnedAmount: "",
      reimbursementStatus: "NO_APLICA",
      reimbursementDate: "",
      reimbursementPaymentMethod: "",
      initialPaymentMethod: "EMPRESA",
      observations: "",
      invoiceFileUrl: "",
      purchaseNumberId: null,
      purchaseNumberItemId: null,
      estimatedPrice: null,
    });
    setInvoiceFile(null);
    setExpensePurchaseLink(null);
    setExpenseFormReturnToPurchase(false);
    setPurchaseNumberMode("new");
    setNewPurchaseNumberDescription("");
    setNewPurchaseNumberTotalAmount("");
    setIsEditing(false);
    setSelectedExpenseId(null);
    setFormErrors({});
    setShowForm(false);
    loadPurchaseNumbers();

    if (shouldReturn && purchaseId) {
      await refreshPurchaseDetailModal(purchaseId);
      setShowPurchaseDetailModal(true);
    }
  };

  const resetForm = () => {
    closeExpenseForm();
  };

  const exportToExcel = () => {
    if (expenses.length === 0) {
      showError("No hay datos para exportar");
      return;
    }

    const excelData = expenses.map((expense, idx) => ({
      "#": idx + 1,
      "Número Factura": expense.invoiceNumber,
      "Fecha Compra": expense.purchaseDate,
      "Descripción": expense.description,
      "Proveedor": expense.supplier,
      "Monto Total": expense.totalAmount?.toFixed(2) || "0.00",
      "Comprador": expense.purchaserName || "N/A",
      "Autorizador": expense.authorizerName || "N/A",
      "Autorizador": expense.authorizerName || "N/A",
      "Monto Empresa": expense.companyAmount?.toFixed(2) || "0.00",
      "Monto Mensajero": expense.messengerAmount?.toFixed(2) || "0.00",
      "Monto Inicial Dado (Caja Chica)": expense.initialAmountGiven?.toFixed(2) || "0.00",
      "Monto Devuelto": expense.returnedAmount?.toFixed(2) || "0.00",
      "Estado Reembolso": expense.reimbursementStatus || "N/A",
      "Fecha Reembolso": expense.reimbursementDate || "N/A",
      "Método Pago Reembolso": expense.reimbursementPaymentMethod || "N/A",
      "Forma Pago Inicial": expense.initialPaymentMethod || "N/A",
      "Observaciones": expense.observations || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Gastos Menores");

    XLSX.writeFile(workbook, `Gastos_Menores_${new Date().toISOString().split("T")[0]}.xlsx`);
    showSuccess("Archivo Excel descargado correctamente");
  };

  // Configuración de columnas para la tabla
  const columns = useMemo(
    () => [
      {
        Header: "#",
        accessor: "id",
        Cell: ({ row }) => row.index + 1,
      },
      {
        Header: "Número Factura",
        accessor: "invoiceNumber",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Número Compra",
        accessor: "purchaseNumber",
        Cell: ({ value, row }) => {
          if (!value) {
            return <span className="text-muted">-</span>;
          }
          return (
            <Button
              color="link"
              size="sm"
              onClick={() => handleViewPurchaseDetails(row.original.purchaseNumberId, value)}
              style={{ padding: 0, textDecoration: "none" }}
            >
              <Badge color="info" style={{ cursor: "pointer" }}>
                {value}{row.original.purchaseNumberDescription ? ` - ${row.original.purchaseNumberDescription}` : ""}
              </Badge>
            </Button>
          );
        },
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Fecha",
        accessor: "purchaseDate",
        Cell: ({ value }) => (value ? new Date(value).toLocaleDateString() : "-"),
      },
      {
        Header: "Descripción",
        accessor: "description",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
        Cell: ({ value }) => (
          <span style={{ maxWidth: "200px", display: "inline-block" }}>
            {value && value.length > 50 ? value.substring(0, 50) + "..." : value}
          </span>
        ),
      },
      {
        Header: "Proveedor",
        accessor: "supplier",
        Filter: DefaultColumnFilter,
        filter: "fuzzyText",
      },
      {
        Header: "Monto Total",
        accessor: "totalAmount",
        Cell: ({ value }) => `Q ${value?.toFixed(2) || "0.00"}`,
      },
      {
        Header: "Comprador",
        accessor: "purchaserName",
      },
      {
        Header: "Estado Reembolso",
        accessor: "reimbursementStatus",
        Cell: ({ value }) => {
          const statusMap = {
            PENDIENTE: { color: "warning", text: "Pendiente" },
            PAGADO: { color: "success", text: "Pagado" },
            NO_APLICA: { color: "info", text: "COMPLETO" },
          };
          const status = statusMap[value] || { color: "secondary", text: value || "N/A" };
          return <Badge color={status.color} style={{ border: "1px solid #6c757d" }}>{status.text}</Badge>;
        },
      },
      {
        Header: "Acciones",
        Cell: ({ row }) => (
          <div className="d-flex flex-wrap" style={{ gap: "0.25rem" }}>
            <Button
              color="info"
              size="sm"
              onClick={() => handleViewDetails(row.original)}
            >
              <i className="nc-icon nc-zoom-split" /> Ver
            </Button>
            {row.original.reimbursementStatus !== "PAGADO" && (
              <>
                <Button
                  color="warning"
                  size="sm"
                  onClick={() => handleEdit(row.original)}
                >
                  <i className="nc-icon nc-settings" /> Editar
                </Button>
                <Button
                  color="danger"
                  size="sm"
                  onClick={() => handleDelete(row.original.id)}
                >
                  <i className="nc-icon nc-simple-remove" /> Eliminar
                </Button>
              </>
            )}
          </div>
        ),
        disableSortBy: true,
        disableFilters: true,
      },
    ],
    []
  );

  const defaultColumn = useMemo(
    () => ({
      Filter: DefaultColumnFilter,
    }),
    []
  );

  const fuzzyTextFilterFn = (rows, id, filterValue) => {
    return matchSorter(rows, filterValue, {
      keys: [(row) => row.values[id]],
    });
  };

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    page,
    prepareRow,
    canPreviousPage,
    canNextPage,
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    state: { pageIndex, pageSize },
  } = useTable(
    {
      columns,
      data: expenses,
      defaultColumn,
      filterTypes: {
        fuzzyText: fuzzyTextFilterFn,
      },
      initialState: { pageIndex: 0, pageSize: 10 },
    },
    useFilters,
    useGlobalFilter,
    useSortBy,
    usePagination
  );

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <CardTitle tag="h4">Control de Compras Menores y Gastos de Mensajería</CardTitle>
          <div className="d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>
              <Button
                color={viewMode === "list" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <i className="nc-icon nc-bullet-list-67 mr-1" /> Lista
              </Button>
              <Button
                color={viewMode === "grouped" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setViewMode("grouped")}
              >
                <i className="nc-icon nc-layout-11 mr-1" /> Agrupado por Compras
              </Button>
              <Button
                color={viewMode === "purchases" ? "primary" : "secondary"}
                size="sm"
                onClick={() => {
                  setViewMode("purchases");
                  loadAllPurchaseNumbers();
                }}
              >
                <i className="nc-icon nc-tag mr-1" /> Ver Compras
              </Button>
            </div>
            <div>
              <Button
                color="primary"
                onClick={() => setShowSummary(!showSummary)}
                className="mr-2"
              >
                <i className="nc-icon nc-chart-bar-32" /> {showSummary ? "Ocultar" : "Mostrar"} Resumen
              </Button>
              <Button color="primary" onClick={() => setShowCreatePurchaseModal(true)} className="mr-2">
                <i className="nc-icon nc-simple-add" /> Nueva Compra
              </Button>
              <Button color="success" onClick={() => setShowForm(true)}>
                <i className="nc-icon nc-simple-add" /> Nuevo Gasto
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}

          {/* Dashboard de Resumen */}
          {showSummary && summary && (
            <Row className="mb-4">
              <Col md="3">
                <Card className="bg-primary text-white">
                  <CardBody>
                    <h6>Total de Gastos</h6>
                    <h3>Q {summary.totalExpenses?.toFixed(2) || "0.00"}</h3>
                    <small>{summary.totalExpensesCount || 0} registros</small>
                  </CardBody>
                </Card>
              </Col>
              <Col md="3">
                <Card className="bg-warning text-white">
                  <CardBody>
                    <h6>Reembolsos Pendientes</h6>
                    <h3>Q {summary.totalPendingReimbursements?.toFixed(2) || "0.00"}</h3>
                    <small>{summary.pendingReimbursementsCount || 0} pendientes</small>
                  </CardBody>
                </Card>
              </Col>
              <Col md="3">
                <Card className="bg-success text-white">
                  <CardBody>
                    <h6>Reembolsos Pendientes</h6>
                    <Button
                      color="light"
                      size="sm"
                      onClick={() => {
                        setFilters({ ...filters, reimbursementStatus: "PENDIENTE" });
                      }}
                    >
                      Ver {pendingReimbursements.length} pendientes
                    </Button>
                  </CardBody>
                </Card>
              </Col>
            </Row>
          )}

          {/* Filtros */}
          <Card className="mb-3">
            <CardBody>
              <Row>
                <Col md="3">
                  <FormGroup>
                    <Label>Fecha Inicio</Label>
                    <Input
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => handleFilterChange("startDate", e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Fecha Fin</Label>
                    <Input
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => handleFilterChange("endDate", e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Proveedor</Label>
                    <Input
                      type="text"
                      value={filters.supplier}
                      onChange={(e) => handleFilterChange("supplier", e.target.value)}
                      placeholder="Buscar proveedor..."
                    />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Comprador</Label>
                    <Input
                      type="text"
                      value={filters.purchaserName || ""}
                      onChange={(e) => handleFilterChange("purchaserName", e.target.value)}
                      placeholder="Buscar comprador..."
                    />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Estado Reembolso</Label>
                    <Input
                      type="select"
                      value={filters.reimbursementStatus}
                      onChange={(e) => handleFilterChange("reimbursementStatus", e.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value="PENDIENTE">Pendiente</option>
                      <option value="PAGADO">Pagado</option>
                      <option value="NO_APLICA">No Aplica</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Número Factura</Label>
                    <Input
                      type="text"
                      value={filters.invoiceNumber}
                      onChange={(e) => handleFilterChange("invoiceNumber", e.target.value)}
                      placeholder="Buscar factura..."
                    />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Descripción</Label>
                    <Input
                      type="text"
                      value={filters.description}
                      onChange={(e) => handleFilterChange("description", e.target.value)}
                      placeholder="Buscar descripción..."
                    />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>
                      Número de Compra
                      <Button
                        color="link"
                        size="sm"
                        onClick={loadAllPurchaseNumbers}
                        style={{ padding: 0, marginLeft: "0.5rem" }}
                        title="Recargar compras"
                      >
                        <i className="nc-icon nc-refresh-69" />
                      </Button>
                    </Label>
                    <Input
                      type="select"
                      value={filters.purchaseNumberId || ""}
                      onChange={(e) => handleFilterChange("purchaseNumberId", e.target.value)}
                    >
                      <option value="">Todos</option>
                      {allPurchaseNumbers.length === 0 ? (
                        <option disabled>No hay compras disponibles</option>
                      ) : (
                        allPurchaseNumbers.map((pn) => (
                          <option key={pn.id} value={pn.id}>
                            {pn.purchaseNumber} {pn.description ? `- ${pn.description}` : ""} ({pn.expenseCount || 0} gastos)
                          </option>
                        ))
                      )}
                    </Input>
                    {allPurchaseNumbers.length > 0 && (
                      <small className="text-muted">
                        {allPurchaseNumbers.length} compra(s) disponible(s)
                      </small>
                    )}
                  </FormGroup>
                </Col>
              </Row>
              <Row>
                <Col md="12" className="text-right">
                  <Button
                    color="secondary"
                    onClick={() => {
                      setFilters({
                        startDate: "",
                        endDate: "",
                        supplier: "",
                        purchaserName: "",
                        reimbursementStatus: "",
                        invoiceNumber: "",
                        description: "",
                        purchaseNumberId: "",
                      });
                    }}
                  >
                    Limpiar Filtros
                  </Button>
                  <Button color="info" onClick={exportToExcel} className="ml-2">
                    <i className="nc-icon nc-cloud-download-93" /> Exportar Excel
                  </Button>
                </Col>
              </Row>
            </CardBody>
          </Card>

          {/* Vista de Gastos */}
          {loading ? (
            <div className="text-center py-4">
              <Spinner color="primary" />
            </div>
          ) : expenses.length === 0 ? (
            <Alert color="info">No hay gastos registrados</Alert>
          ) : viewMode === "grouped" ? (
            /* Vista Agrupada por Compras */
            <div>
              {Object.keys(groupedExpenses).length === 0 ? (
                <Alert color="info">No hay gastos para agrupar</Alert>
              ) : (
                Object.keys(groupedExpenses).map((key) => {
                  if (key === "_withoutPurchase") {
                    const withoutPurchase = groupedExpenses[key] || [];
                    if (withoutPurchase.length === 0) return null;
                    return (
                      <Card key="without-purchase" className="mb-3" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                        <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                                <i className="nc-icon nc-paper mr-2" style={{ color: "#6c757d" }} />
                                Gastos sin Número de Compra
                              </h6>
                              <small className="text-muted">{withoutPurchase.length} gasto(s)</small>
                            </div>
                            <Badge color="secondary">
                              Total: Q {withoutPurchase.reduce((sum, exp) => sum + (parseFloat(exp.totalAmount) || 0), 0).toFixed(2)}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardBody>
                          <div className="table-responsive">
                            <Table striped hover size="sm">
                              <thead style={{ backgroundColor: "#f8f9fa" }}>
                                <tr>
                                  <th>Factura</th>
                                  <th>Fecha</th>
                                  <th>Proveedor</th>
                                  <th>Descripción</th>
                                  <th>Monto Total</th>
                                  <th>Estado Reembolso</th>
                                  <th>Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {withoutPurchase.map((expense) => {
                                  const reimbursementStatusMap = {
                                    PENDIENTE: { color: "warning", text: "Pendiente" },
                                    PAGADO: { color: "success", text: "Pagado" },
                                    NO_APLICA: { color: "info", text: "COMPLETO" },
                                  };
                                  const status = reimbursementStatusMap[expense.reimbursementStatus] || { color: "secondary", text: expense.reimbursementStatus || "N/A" };

                                  return (
                                    <tr key={expense.id}>
                                      <td>{expense.invoiceNumber}</td>
                                      <td>{expense.purchaseDate ? new Date(expense.purchaseDate).toLocaleDateString() : "-"}</td>
                                      <td>{expense.supplier}</td>
                                      <td>
                                        <span style={{ maxWidth: "200px", display: "inline-block" }}>
                                          {expense.description && expense.description.length > 50
                                            ? expense.description.substring(0, 50) + "..."
                                            : expense.description}
                                        </span>
                                      </td>
                                      <td>
                                        <strong>Q {parseFloat(expense.totalAmount || 0).toFixed(2)}</strong>
                                      </td>
                                      <td>
                                        <Badge color={status.color} style={{ border: "1px solid #6c757d" }}>{status.text}</Badge>
                                      </td>
                                      <td>
                                        <Button
                                          color="info"
                                          size="sm"
                                          onClick={() => handleViewDetails(expense)}
                                        >
                                          <i className="nc-icon nc-zoom-split" /> Ver
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </Table>
                          </div>
                        </CardBody>
                      </Card>
                    );
                  }

                  const group = groupedExpenses[key];
                  return (
                    <Card key={key} className="mb-3" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                      <CardHeader style={{ backgroundColor: "#e7f3ff", borderBottom: "2px solid #007bff" }}>
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <h6 className="mb-0" style={{ fontWeight: "600", color: "#004085" }}>
                              <i className="nc-icon nc-tag mr-2" style={{ color: "#007bff" }} />
                              {group.purchaseNumber}{group.purchaseNumberDescription ? ` - ${group.purchaseNumberDescription}` : ""}
                            </h6>
                            <small style={{ color: "#000" }}>
                              {group.expenses.length} factura(s) asociada(s)
                            </small>
                          </div>
                          <div className="d-flex align-items-center" style={{ gap: "1rem" }}>
                            <Badge color="info" style={{ fontSize: "1rem", padding: "0.5rem 1rem" }}>
                              Total: Q {group.total.toFixed(2)}
                            </Badge>
                            <Button
                              color="primary"
                              size="sm"
                              onClick={() => handleViewPurchaseDetails(group.purchaseNumberId, group.purchaseNumber)}
                              style={{ fontWeight: "600" }}
                            >
                              <i className="nc-icon nc-zoom-split mr-1" />
                              Ver Detalle Completo
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardBody>
                        <div className="table-responsive">
                          <Table striped hover size="sm">
                            <thead style={{ backgroundColor: "#f8f9fa" }}>
                              <tr>
                                <th>Factura</th>
                                <th>Fecha</th>
                                <th>Proveedor</th>
                                <th>Descripción</th>
                                <th>Monto Total</th>
                                <th>Estado Reembolso</th>
                                <th>Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.expenses.map((expense) => {
                                const reimbursementStatusMap = {
                                  PENDIENTE: { color: "warning", text: "Pendiente" },
                                  PAGADO: { color: "success", text: "Pagado" },
                                  NO_APLICA: { color: "info", text: "COMPLETO" },
                                };
                                const status = reimbursementStatusMap[expense.reimbursementStatus] || { color: "secondary", text: expense.reimbursementStatus || "N/A" };

                                return (
                                  <tr key={expense.id}>
                                    <td>
                                      <strong>{expense.invoiceNumber}</strong>
                                    </td>
                                    <td>{expense.purchaseDate ? new Date(expense.purchaseDate).toLocaleDateString() : "-"}</td>
                                    <td>{expense.supplier}</td>
                                    <td>
                                      <span style={{ maxWidth: "200px", display: "inline-block" }}>
                                        {expense.description && expense.description.length > 50
                                          ? expense.description.substring(0, 50) + "..."
                                          : expense.description}
                                      </span>
                                    </td>
                                    <td>
                                      <strong>Q {parseFloat(expense.totalAmount || 0).toFixed(2)}</strong>
                                    </td>
                                    <td>
                                      <Badge color={status.color} style={{ border: "1px solid #6c757d" }}>{status.text}</Badge>
                                    </td>
                                    <td>
                                      <Button
                                        color="info"
                                        size="sm"
                                        onClick={() => handleViewDetails(expense)}
                                      >
                                        <i className="nc-icon nc-zoom-split" /> Ver
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr style={{ backgroundColor: "#f8f9fa", fontWeight: "600" }}>
                                <td colSpan="4" className="text-right">
                                  <strong>Subtotal de {group.purchaseNumber}{group.purchaseNumberDescription ? ` - ${group.purchaseNumberDescription}` : ""}:</strong>
                                </td>
                                <td>
                                  <strong className="text-primary">
                                    Q {group.total.toFixed(2)}
                                  </strong>
                                </td>
                                <td colSpan="2"></td>
                              </tr>
                            </tfoot>
                          </Table>
                        </div>
                      </CardBody>
                    </Card>
                  );
                })
              )}
            </div>
          ) : viewMode === "purchases" ? (
            /* Vista de Listado de Compras */
            <Card>
              <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6" }}>
                <div className="d-flex justify-content-between align-items-center">
                  <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                    <i className="nc-icon nc-tag mr-2" style={{ color: "#007bff" }} />
                    Listado de Compras
                  </h6>
                  <Button
                    color="link"
                    size="sm"
                    onClick={loadAllPurchaseNumbers}
                    title="Recargar compras"
                  >
                    <i className="nc-icon nc-refresh-69 mr-1" />
                    Recargar
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                {allPurchaseNumbers.length === 0 ? (
                  <Alert color="info">
                    No hay compras registradas. Haga clic en "Nueva Compra" para crear una.
                  </Alert>
                ) : (
                  <div className="table-responsive">
                    <Table striped hover size="sm">
                      <thead style={{ backgroundColor: "#f8f9fa" }}>
                        <tr>
                          <th>#</th>
                          <th>Número de Compra</th>
                          <th>Descripción</th>
                          <th>Estado</th>
                          <th>Asignado</th>
                          <th>Gastado</th>
                          <th>Bruto</th>
                          <th>Compensado</th>
                          <th>Saldo Neto</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allPurchaseNumbers.map((pn, idx) => {
                          const totalAssigned = parseFloat(pn.totalAmount || 0);
                          const totalSpent = parseFloat(pn.totalSpent || 0);
                          const rawBal = parseFloat(pn.rawBalance || 0);
                          const compGiven = parseFloat(pn.compensationsGiven || 0);
                          const compReceived = parseFloat(pn.compensationsReceived || 0);
                          const netBal = parseFloat(pn.netBalance || 0);
                          const hasCompensations = compGiven > 0 || compReceived > 0;

                          return (
                            <tr key={pn.id}>
                              <td>{idx + 1}</td>
                              <td>
                                <Badge color="info" style={{ fontSize: "0.9rem", padding: "0.25rem 0.75rem" }}>
                                  {pn.purchaseNumber}
                                </Badge>
                              </td>
                              <td>
                                <span style={{ maxWidth: "200px", display: "inline-block" }}>
                                  {pn.description || <span className="text-muted">Sin descripción</span>}
                                </span>
                              </td>
                              <td>
                                <Badge color={getPurchaseStatusLabel(pn.status).color}>
                                  {getPurchaseStatusLabel(pn.status).text}
                                </Badge>
                              </td>
                              <td>
                                {totalAssigned > 0 ? (
                                  <strong className="text-primary">Q {totalAssigned.toFixed(2)}</strong>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td>
                                <strong className="text-dark">Q {totalSpent.toFixed(2)}</strong>
                              </td>
                              <td>
                                <Badge color={rawBal >= 0 ? "success" : "danger"} style={{ fontSize: "0.8rem" }}>
                                  {rawBal >= 0 ? "+" : ""}Q {rawBal.toFixed(2)}
                                </Badge>
                              </td>
                              <td>
                                {hasCompensations ? (
                                  <div style={{ fontSize: "0.8rem", lineHeight: "1.4" }}>
                                    {compGiven > 0 && (
                                      <div style={{ color: "#dc3545" }}>
                                        ↗ Cedido: Q {compGiven.toFixed(2)}
                                      </div>
                                    )}
                                    {compReceived > 0 && (
                                      <div style={{ color: "#28a745" }}>
                                        ↙ Recibido: Q {compReceived.toFixed(2)}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted" style={{ fontSize: "0.8rem" }}>—</span>
                                )}
                              </td>
                              <td>
                                <Badge
                                  color={netBal > 0 ? "success" : netBal < 0 ? "danger" : "secondary"}
                                  style={{ fontSize: "0.85rem", fontWeight: "700" }}
                                >
                                  {netBal >= 0 ? "+" : ""}Q {netBal.toFixed(2)}
                                </Badge>
                              </td>
                              <td>
                                <div className="d-flex flex-wrap" style={{ gap: "0.25rem" }}>
                                  <Button
                                    color="info"
                                    size="sm"
                                    onClick={() => handleViewPurchaseDetails(pn.id, pn.purchaseNumber)}
                                  >
                                    <i className="nc-icon nc-zoom-split" /> Ver
                                  </Button>
                                  {canModifyPurchaseItems(pn) && (
                                    <Button
                                      color="warning"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedPurchaseNumber(pn);
                                        setEditingPurchaseNumber(true);
                                        setPurchaseNumberEditData({
                                          description: pn.description || "",
                                          totalAmount: pn.totalAmount ? pn.totalAmount.toString() : "",
                                        });
                                        handleViewPurchaseDetails(pn.id, pn.purchaseNumber);
                                      }}
                                    >
                                      <i className="nc-icon nc-settings" /> Editar
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot style={{ backgroundColor: "#f0f8ff", fontWeight: "600" }}>
                        <tr>
                          <td colSpan="4" className="text-right"><strong>Totales:</strong></td>
                          <td>
                            <strong className="text-primary">
                              Q {allPurchaseNumbers.reduce((s, p) => s + parseFloat(p.totalAmount || 0), 0).toFixed(2)}
                            </strong>
                          </td>
                          <td>
                            <strong>
                              Q {allPurchaseNumbers.reduce((s, p) => s + parseFloat(p.totalSpent || 0), 0).toFixed(2)}
                            </strong>
                          </td>
                          <td>
                            <strong>
                              Q {allPurchaseNumbers.reduce((s, p) => s + parseFloat(p.rawBalance || 0), 0).toFixed(2)}
                            </strong>
                          </td>
                          <td></td>
                          <td>
                            <strong>
                              Q {allPurchaseNumbers.reduce((s, p) => s + parseFloat(p.netBalance || 0), 0).toFixed(2)}
                            </strong>
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </Table>
                  </div>
                )}
              </CardBody>
            </Card>
          ) : (
            /* Vista de Lista Normal */
            <>
              <div style={{ overflowX: "auto" }}>
                <Table responsive {...getTableProps()} style={{ marginBottom: 0 }}>
                  <thead style={{ backgroundColor: "#f8f9fa" }}>
                    {headerGroups.map((headerGroup) => (
                      <tr {...headerGroup.getHeaderGroupProps()}>
                        {headerGroup.headers.map((column) => (
                          <th
                            {...column.getHeaderProps(column.getSortByToggleProps())}
                            style={{
                              verticalAlign: "top",
                              padding: "0.75rem",
                              borderBottom: "2px solid #dee2e6",
                              fontWeight: "600",
                              fontSize: "0.875rem",
                              textTransform: "uppercase",
                              color: "#495057"
                            }}
                          >
                            <div style={{ marginBottom: "0.5rem" }}>
                              {column.render("Header")}
                              <span style={{ marginLeft: "0.5rem" }}>
                                {column.isSorted
                                  ? column.isSortedDesc
                                    ? " ▼"
                                    : " ▲"
                                  : ""}
                              </span>
                            </div>
                            {column.canFilter && (
                              <div style={{ marginTop: "0.25rem" }}>
                                {column.render("Filter")}
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody {...getTableBodyProps()}>
                    {page.map((row) => {
                      prepareRow(row);
                      return (
                        <tr
                          {...row.getRowProps()}
                          style={{
                            borderBottom: "1px solid #dee2e6"
                          }}
                        >
                          {row.cells.map((cell) => (
                            <td
                              {...cell.getCellProps()}
                              style={{
                                padding: "0.75rem",
                                verticalAlign: "middle"
                              }}
                            >
                              {cell.render("Cell")}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
              <div className="pagination mt-3 d-flex align-items-center flex-wrap" style={{ gap: "0.5rem" }}>
                <Button
                  color="primary"
                  onClick={() => gotoPage(0)}
                  disabled={!canPreviousPage}
                  size="sm"
                >
                  {"<<"}
                </Button>
                <Button
                  color="primary"
                  onClick={() => previousPage()}
                  disabled={!canPreviousPage}
                  size="sm"
                >
                  {"<"}
                </Button>
                <Button
                  color="primary"
                  onClick={() => nextPage()}
                  disabled={!canNextPage}
                  size="sm"
                >
                  {">"}
                </Button>
                <Button
                  color="primary"
                  onClick={() => gotoPage(pageCount - 1)}
                  disabled={!canNextPage}
                  size="sm"
                >
                  {">>"}
                </Button>
                <span className="ml-2">
                  Página{" "}
                  <strong>
                    {pageIndex + 1} de {pageOptions.length}
                  </strong>
                </span>
                <span className="ml-2">
                  | Ir a página:{" "}
                  <Input
                    type="number"
                    defaultValue={pageIndex + 1}
                    onChange={(e) => {
                      const page = e.target.value ? Number(e.target.value) - 1 : 0;
                      gotoPage(page);
                    }}
                    style={{ width: "80px", display: "inline-block", marginLeft: "0.25rem" }}
                    min="1"
                    max={pageOptions.length}
                  />
                </span>
                <span className="ml-2">
                  <Input
                    type="select"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                    }}
                    style={{ width: "120px", display: "inline-block" }}
                  >
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                      <option key={pageSize} value={pageSize}>
                        Mostrar {pageSize}
                      </option>
                    ))}
                  </Input>
                </span>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* Modal de Formulario */}
      <Modal
        isOpen={showForm}
        toggle={closeExpenseForm}
        size="lg"
        zIndex={1060}
        backdrop={expenseFormReturnToPurchase ? false : true}
      >
        <ModalHeader toggle={closeExpenseForm}>
          {isEditing
            ? expensePurchaseLink
              ? "Editar Gasto de Compra"
              : "Editar Gasto"
            : expensePurchaseLink
              ? "Nuevo Gasto desde Artículo"
              : "Nuevo Gasto"}
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            {expensePurchaseLink && (
              <Alert color="info" className="mb-3">
                <div><strong>Compra asociada:</strong> {expensePurchaseLink.purchaseNumber}</div>
                {expensePurchaseLink.description && (
                  <div className="text-muted">{expensePurchaseLink.description}</div>
                )}
                {expensePurchaseLink.itemName && (
                  <div className="mt-1">
                    <strong>Artículo:</strong> {expensePurchaseLink.itemName}
                  </div>
                )}
              </Alert>
            )}
            {!expensePurchaseLink && (
            <Row>
              <Col md="12">
                <FormGroup>
                  <Label>Número de Compra</Label>
                  <Input
                    type="select"
                    value={purchaseNumberMode}
                    onChange={(e) => {
                      setPurchaseNumberMode(e.target.value);
                      if (e.target.value === "new") {
                        setFormData(prev => ({ ...prev, purchaseNumberId: null, purchaseNumberItemId: null }));
                      }
                      if (e.target.value === "none") {
                        setFormData(prev => ({ ...prev, purchaseNumberId: null, purchaseNumberItemId: null }));
                      }
                    }}
                  >
                    <option value="new">Crear Nuevo Número de Compra</option>
                    <option value="existing">Asociar a Número de Compra Existente</option>
                    <option value="none">Sin Número de Compra</option>
                  </Input>
                </FormGroup>
              </Col>
            </Row>
            )}
            <Row>
              <Col md="6">
                <FormGroup>
                  <Label>Número de Factura *</Label>
                  <Input
                    type="text"
                    value={formData.invoiceNumber}
                    onChange={(e) => handleFormChange("invoiceNumber", e.target.value)}
                    invalid={!!formErrors.invoiceNumber}
                    disabled={isEditing}
                  />
                  {formErrors.invoiceNumber && (
                    <div className="text-danger small">{formErrors.invoiceNumber}</div>
                  )}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label>Fecha de Compra *</Label>
                  <Input
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => handleFormChange("purchaseDate", e.target.value)}
                    invalid={!!formErrors.purchaseDate}
                  />
                  {formErrors.purchaseDate && (
                    <div className="text-danger small">{formErrors.purchaseDate}</div>
                  )}
                </FormGroup>
              </Col>
            </Row>
            {purchaseNumberMode === "existing" && !expensePurchaseLink && (
              <Row>
                <Col md="12">
                  <FormGroup>
                    <Label>Seleccionar Número de Compra *</Label>
                    <Input
                      type="select"
                      value={formData.purchaseNumberId || ""}
                      onChange={(e) => handleFormChange("purchaseNumberId", e.target.value ? parseInt(e.target.value) : null)}
                      invalid={purchaseNumberMode === "existing" && !formData.purchaseNumberId}
                    >
                      <option value="">Seleccione un número de compra...</option>
                      {purchaseNumbers.map((pn) => (
                        <option key={pn.id} value={pn.id}>
                          {pn.purchaseNumber} {pn.description ? `- ${pn.description}` : ""} ({pn.expenseCount || 0} gastos)
                        </option>
                      ))}
                    </Input>
                    {purchaseNumberMode === "existing" && !formData.purchaseNumberId && (
                      <div className="text-danger small">Debe seleccionar un número de compra</div>
                    )}
                    {purchaseNumbers.length === 0 && (
                      <div className="text-muted small">No hay números de compra disponibles (pendientes)</div>
                    )}
                  </FormGroup>
                </Col>
              </Row>
            )}
            {purchaseNumberMode === "new" && (
              <>
                <Row>
                  <Col md="12">
                    <FormGroup>
                      <Label>Descripción del Número de Compra (Opcional)</Label>
                      <Input
                        type="text"
                        value={newPurchaseNumberDescription}
                        onChange={(e) => setNewPurchaseNumberDescription(e.target.value)}
                        placeholder="Ej: Compra de materiales para oficina"
                      />
                      <small className="text-muted">
                        Se generará automáticamente un nuevo número de compra (ej: COMP-00001)
                      </small>
                    </FormGroup>
                  </Col>
                </Row>
                <Row>
                  <Col md="12">
                    <FormGroup>
                      <Label>Cantidad Total a Liquidar *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newPurchaseNumberTotalAmount}
                        onChange={(e) => setNewPurchaseNumberTotalAmount(e.target.value)}
                        placeholder="0.00"
                        required
                      />
                      <small className="text-muted">
                        Monto total asignado para liquidar en esta compra. Las facturas son parte de este total.
                      </small>
                    </FormGroup>
                  </Col>
                </Row>
              </>
            )}
            <Row>
              <Col md="12">
                <FormGroup>
                  <Label>Descripción *</Label>
                  <Input
                    type="textarea"
                    rows="3"
                    value={formData.description}
                    onChange={(e) => handleFormChange("description", e.target.value)}
                    invalid={!!formErrors.description}
                  />
                  {formErrors.description && (
                    <div className="text-danger small">{formErrors.description}</div>
                  )}
                </FormGroup>
              </Col>
            </Row>
            <Row>
              <Col md="6">
                <FormGroup>
                  <Label>Proveedor/Establecimiento *</Label>
                  <Input
                    type="text"
                    value={formData.supplier}
                    onChange={(e) => handleFormChange("supplier", e.target.value)}
                    invalid={!!formErrors.supplier}
                  />
                  {formErrors.supplier && (
                    <div className="text-danger small">{formErrors.supplier}</div>
                  )}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label>Monto Total *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.totalAmount}
                    onChange={(e) => handleFormChange("totalAmount", e.target.value)}
                    invalid={!!formErrors.totalAmount}
                  />
                  {formErrors.totalAmount && (
                    <div className="text-danger small">{formErrors.totalAmount}</div>
                  )}
                </FormGroup>
              </Col>
            </Row>
            <Row>
              <Col md="6">
                <FormGroup>
                  <Label>Persona que Realizó la Compra *</Label>
                  <Input
                    type="text"
                    value={formData.purchaserName}
                    onChange={(e) => handleFormChange("purchaserName", e.target.value)}
                    invalid={!!formErrors.purchaserName}
                    placeholder="Mensajero"
                  />
                  {formErrors.purchaserName && (
                    <div className="text-danger small">{formErrors.purchaserName}</div>
                  )}
                  <small className="text-muted">Por defecto: Mensajero (Se puede cambiar)</small>
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label>Persona que Autorizó</Label>
                  <Input
                    type="text"
                    value={formData.authorizerName}
                    onChange={(e) => handleFormChange("authorizerName", e.target.value)}
                    placeholder="Contabilidad"
                    disabled={true}
                  />
                </FormGroup>
              </Col>
            </Row>
            <Row>
              <Col md="6">
                <FormGroup>
                  <Label>DEBITO / CREDITO</Label>
                  <Input
                    type="select"
                    value={formData.initialPaymentMethod}
                    onChange={(e) => handleFormChange("initialPaymentMethod", e.target.value)}
                    invalid={!!formErrors.initialPaymentMethod}
                  >
                    <option value="EMPRESA">SIN REEMBOLSO</option>
                    <option value="MENSAJERO">REEMBOLSO</option>
                  </Input>
                  {formErrors.initialPaymentMethod && (
                    <div className="text-danger small">{formErrors.initialPaymentMethod}</div>
                  )}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label>Monto Pagado por Empresa</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.companyAmount}
                    onChange={(e) => handleFormChange("companyAmount", e.target.value)}
                    disabled={formData.initialPaymentMethod === "MENSAJERO" || formData.initialPaymentMethod === "EMPRESA"}
                  />
                  {formData.initialPaymentMethod === "EMPRESA" && (
                    <small className="text-muted">
                      Se establece automáticamente igual al monto total
                    </small>
                  )}
                </FormGroup>
              </Col>
            </Row>
            <Row>
              <Col md="6">
                <FormGroup>
                  <Label>
                    {formData.initialPaymentMethod === "EMPRESA"
                      ? "Vuelto a Recibir del Mensajero"
                      : "Monto Por Pagar al Mensajero"}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.messengerAmount}
                    onChange={(e) => handleFormChange("messengerAmount", e.target.value)}
                    disabled={formData.initialPaymentMethod === "EMPRESA"}
                    placeholder={formData.initialPaymentMethod === "EMPRESA" ? "Se calcula automáticamente" : ""}
                  />
                  {formData.initialPaymentMethod === "EMPRESA" ? (
                    <small className="text-muted">
                      Cambio que el mensajero devuelve a la empresa (Monto Inicial - Monto Total)
                    </small>
                  ) : (
                    <small className="text-muted">
                      Este monto será reembolsado al mensajero
                    </small>
                  )}
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label>Estado del Reembolso</Label>
                  <Input
                    type="select"
                    value={formData.reimbursementStatus}
                    onChange={(e) => handleFormChange("reimbursementStatus", e.target.value)}
                    disabled={formData.initialPaymentMethod === "EMPRESA"}
                  >
                    <option value="NO_APLICA">No Aplica</option>
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="PAGADO">Pagado</option>
                  </Input>
                  {formData.initialPaymentMethod === "EMPRESA" && (
                    <small className="text-muted">
                      El reembolso no aplica cuando la empresa paga inicialmente
                    </small>
                  )}
                </FormGroup>
              </Col>
            </Row>
            {formData.initialPaymentMethod === "EMPRESA" && (
              <Row>
                <Col md="6">
                  <FormGroup>
                    <Label>Monto Inicial Dado al Mensajero (Caja Chica) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.initialAmountGiven}
                      onChange={(e) => handleFormChange("initialAmountGiven", e.target.value)}
                      placeholder="Ej: 400.00"
                      invalid={!!formErrors.initialAmountGiven}
                    />
                    {formErrors.initialAmountGiven && (
                      <div className="text-danger small">{formErrors.initialAmountGiven}</div>
                    )}
                    <small className="text-muted">
                      Monto que la empresa le dio al mensajero para realizar la compra
                    </small>
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label>Monto Devuelto a la Empresa</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.returnedAmount}
                      onChange={(e) => handleFormChange("returnedAmount", e.target.value)}
                      placeholder="Se calcula automáticamente"
                      readOnly
                    />
                    <small className="text-muted">
                      {formData.initialAmountGiven && formData.totalAmount ? (
                        <>
                          Calculado: {formData.initialAmountGiven} - {formData.totalAmount} = {formData.returnedAmount || "0.00"}
                        </>
                      ) : (
                        "Se calcula automáticamente: Monto Inicial - Monto Total"
                      )}
                    </small>
                  </FormGroup>
                </Col>
              </Row>
            )}
            {formData.reimbursementStatus === "PAGADO" && (
              <Row>
                <Col md="6">
                  <FormGroup>
                    <Label>Fecha de Reembolso</Label>
                    <Input
                      type="date"
                      value={formData.reimbursementDate}
                      onChange={(e) => handleFormChange("reimbursementDate", e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label>Método de Pago del Reembolso</Label>
                    <Input
                      type="text"
                      value={formData.reimbursementPaymentMethod}
                      onChange={(e) => handleFormChange("reimbursementPaymentMethod", e.target.value)}
                      placeholder="Ej: Transferencia, Efectivo, Cheque..."
                    />
                  </FormGroup>
                </Col>
              </Row>
            )}
            <Row>
              <Col md="12">
                <FormGroup>
                  <Label>Archivo de Factura (PDF o Imagen) *</Label>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.gif"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setInvoiceFile(file);
                        // Si es edición, también actualizar la URL si ya existe
                        if (isEditing && formData.invoiceFileUrl) {
                          // Mantener la URL existente hasta que se suba el nuevo archivo
                        }
                      }
                    }}
                  />
                  <small className="text-muted">
                    Formatos aceptados: PDF, JPG, JPEG, PNG, GIF. El archivo se subirá automáticamente a S3 al guardar.
                  </small>
                  {invoiceFile && (
                    <div className="mt-2">
                      <Badge color="info">Archivo seleccionado: {invoiceFile.name}</Badge>
                    </div>
                  )}
                  {formData.invoiceFileUrl && !invoiceFile && (
                    <div className="mt-2">
                      <a href={formData.invoiceFileUrl} target="_blank" rel="noopener noreferrer">
                        Ver archivo actual
                      </a>
                    </div>
                  )}
                </FormGroup>
              </Col>
            </Row>
            <Row>
              <Col md="12">
                <FormGroup>
                  <Label>Observaciones</Label>
                  <Input
                    type="textarea"
                    rows="3"
                    value={formData.observations}
                    onChange={(e) => handleFormChange("observations", e.target.value)}
                  />
                </FormGroup>
              </Col>
            </Row>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={closeExpenseForm} disabled={loading}>
              Cancelar
            </Button>
            <Button color="primary" type="submit" disabled={loading || uploadingFile}>
              {loading || uploadingFile ? "Guardando..." : isEditing ? "Actualizar" : "Guardar"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Modal de Detalle */}
      <Modal
        isOpen={showDetailsModal}
        toggle={() => setShowDetailsModal(false)}
        size="lg"
        zIndex={showPurchaseDetailModal ? 1060 : undefined}
        backdrop={showPurchaseDetailModal ? false : true}
      >
        <ModalHeader toggle={() => setShowDetailsModal(false)} style={{ borderBottom: "2px solid #e9ecef", padding: "1.25rem 1.5rem" }}>
          <div className="d-flex justify-content-between align-items-center w-100">
            <div className="d-flex align-items-center">
              <i className="nc-icon nc-paper mr-2" style={{ fontSize: "1.5rem", color: "#007bff" }} />
              <div>
                <h5 className="mb-0" style={{ fontWeight: "600", color: "#212529" }}>
                  Detalle de Gasto
                </h5>
                <small className="text-muted">Factura #{selectedExpense?.invoiceNumber}</small>
              </div>
            </div>
            <Badge
              color={
                selectedExpense?.reimbursementStatus === "PENDIENTE"
                  ? "warning"
                  : selectedExpense?.reimbursementStatus === "PAGADO"
                    ? "success"
                    : "secondary"
              }
              style={{
                fontSize: "0.875rem",
                padding: "0.5rem 1rem",
                borderRadius: "20px",
                fontWeight: "600",
              }}
            >
              {selectedExpense?.reimbursementStatus === "PENDIENTE" ? (
                <>
                  <i className="nc-icon nc-time-alarm mr-1" />
                  Pendiente
                </>
              ) : selectedExpense?.reimbursementStatus === "PAGADO" ? (
                <>
                  <i className="nc-icon nc-check-2 mr-1" />
                  Pagado
                </>
              ) : (
                <>
                  <i className="nc-icon nc-simple-remove mr-1" />
                  No Aplica
                </>
              )}
            </Badge>
          </div>
        </ModalHeader>
        <ModalBody style={{ padding: "1.5rem" }}>
          {selectedExpense && (
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
                        <i className="nc-icon nc-single-copy-04 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Número de Factura
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedExpense.invoiceNumber}
                          </p>
                        </div>
                      </div>
                    </Col>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-calendar-60 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Fecha de Compra
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedExpense.purchaseDate ? new Date(selectedExpense.purchaseDate).toLocaleDateString() : "-"}
                          </p>
                        </div>
                      </div>
                    </Col>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-shop mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Proveedor
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedExpense.supplier}
                          </p>
                        </div>
                      </div>
                    </Col>
                    {selectedExpense.purchaseNumber && (
                      <Col md="6" className="mb-3">
                        <div className="d-flex align-items-start">
                          <i className="nc-icon nc-tag mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                              Número de Compra
                            </label>
                            <p style={{ margin: 0 }}>
                              <Badge color="info" style={{ fontSize: "1rem", padding: "0.25rem 0.75rem" }}>
                                {selectedExpense.purchaseNumber}{selectedExpense.purchaseNumberDescription ? ` - ${selectedExpense.purchaseNumberDescription}` : ""}
                              </Badge>
                            </p>
                          </div>
                        </div>
                      </Col>
                    )}
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-single-02 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Comprador
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedExpense.purchaserName || "N/A"}
                          </p>
                        </div>
                      </div>
                    </Col>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-badge mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Autorizado por
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedExpense.authorizerName || "N/A"}
                          </p>
                        </div>
                      </div>
                    </Col>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-credit-card mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Forma de Pago Inicial
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedExpense.initialPaymentMethod === "EMPRESA" ? "Empresa" : "Mensajero"}
                          </p>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </CardBody>
              </Card>

              {/* SECCIÓN 2: Detalle Financiero */}
              <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6", padding: "0.75rem 1rem" }}>
                  <div className="d-flex align-items-center">
                    <i className="nc-icon nc-money-coins mr-2" style={{ color: "#28a745", fontSize: "1.25rem" }} />
                    <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                      Detalle Financiero
                    </h6>
                  </div>
                </CardHeader>
                <CardBody style={{ padding: "1.25rem" }}>
                  <div style={{
                    backgroundColor: "#d4edda",
                    padding: "1rem",
                    borderRadius: "5px",
                    marginBottom: "1rem",
                    borderLeft: "4px solid #28a745"
                  }}>
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center">
                        <i className="nc-icon nc-money-coins mr-2" style={{ color: "#28a745", fontSize: "1.5rem" }} />
                        <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#155724", margin: 0 }}>
                          Monto Total
                        </label>
                      </div>
                      <span style={{ fontSize: "1.5rem", fontWeight: "700", color: "#155724" }}>
                        Q {selectedExpense.totalAmount?.toFixed(2) || "0.00"}
                      </span>
                    </div>
                  </div>

                  <Row>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-money-coins mr-2 mt-1" style={{ color: "#28a745", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Monto Empresa
                          </label>
                          <p style={{ fontSize: "1.1rem", fontWeight: "600", color: "#28a745", margin: 0 }}>
                            Q {selectedExpense.companyAmount?.toFixed(2) || "0.00"}
                          </p>
                        </div>
                      </div>
                    </Col>
                    {selectedExpense.initialPaymentMethod === "EMPRESA" ? (
                      <Col md="6" className="mb-3">
                        <div className="d-flex align-items-start">
                          <i className="nc-icon nc-refresh-69 mr-2 mt-1" style={{ color: "#ffc107", fontSize: "1rem" }} />
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                              Vuelto a Recibir del Mensajero
                            </label>
                            <p style={{ fontSize: "1.1rem", fontWeight: "600", color: "#ffc107", margin: 0 }}>
                              Q {selectedExpense.messengerAmount?.toFixed(2) || "0.00"}
                            </p>
                          </div>
                        </div>
                      </Col>
                    ) : (
                      <Col md="6" className="mb-3">
                        <div className="d-flex align-items-start">
                          <i className="nc-icon nc-money-coins mr-2 mt-1" style={{ color: "#dc3545", fontSize: "1rem" }} />
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                              Monto Por Pagar al Mensajero
                            </label>
                            <p style={{ fontSize: "1.1rem", fontWeight: "600", color: "#dc3545", margin: 0 }}>
                              Q {selectedExpense.messengerAmount?.toFixed(2) || "0.00"}
                            </p>
                          </div>
                        </div>
                      </Col>
                    )}
                    {selectedExpense.initialAmountGiven && selectedExpense.initialAmountGiven > 0 && (
                      <>
                        <Col md="6" className="mb-3">
                          <div className="d-flex align-items-start">
                            <i className="nc-icon nc-wallet-43 mr-2 mt-1" style={{ color: "#17a2b8", fontSize: "1rem" }} />
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                                Monto Inicial Caja Chica
                              </label>
                              <p style={{ fontSize: "1.1rem", fontWeight: "600", color: "#17a2b8", margin: 0 }}>
                                Q {selectedExpense.initialAmountGiven?.toFixed(2) || "0.00"}
                              </p>
                            </div>
                          </div>
                        </Col>
                        <Col md="6" className="mb-3">
                          <div className="d-flex align-items-start">
                            <i className="nc-icon nc-refresh-69 mr-2 mt-1" style={{ color: "#17a2b8", fontSize: "1rem" }} />
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                                Monto Devuelto a la Empresa
                              </label>
                              <p style={{ fontSize: "1.1rem", fontWeight: "600", color: "#17a2b8", margin: 0 }}>
                                Q {selectedExpense.returnedAmount?.toFixed(2) || "0.00"}
                              </p>
                            </div>
                          </div>
                        </Col>
                      </>
                    )}
                    {selectedExpense.reimbursementDate && (
                      <Col md="6" className="mb-3">
                        <div className="d-flex align-items-start">
                          <i className="nc-icon nc-calendar-60 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                              Fecha Reembolso
                            </label>
                            <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                              {new Date(selectedExpense.reimbursementDate).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </Col>
                    )}
                    {selectedExpense.reimbursementPaymentMethod && (
                      <Col md="6" className="mb-3">
                        <div className="d-flex align-items-start">
                          <i className="nc-icon nc-credit-card mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                              Método Pago Reembolso
                            </label>
                            <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                              {selectedExpense.reimbursementPaymentMethod}
                            </p>
                          </div>
                        </div>
                      </Col>
                    )}
                  </Row>
                </CardBody>
              </Card>

              {/* SECCIÓN 3: Descripción */}
              <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6", padding: "0.75rem 1rem" }}>
                  <div className="d-flex align-items-center">
                    <i className="nc-icon nc-align-left-2 mr-2" style={{ color: "#007bff", fontSize: "1.25rem" }} />
                    <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                      Descripción
                    </h6>
                  </div>
                </CardHeader>
                <CardBody style={{ padding: "1.25rem", backgroundColor: "#f8f9fa" }}>
                  <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0, lineHeight: "1.6" }}>
                    {selectedExpense.description}
                  </p>
                </CardBody>
              </Card>

              {/* SECCIÓN 4: Observaciones (si existe) */}
              {selectedExpense.observations && (
                <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <CardHeader style={{ backgroundColor: "#fff3cd", borderBottom: "2px solid #ffc107", padding: "0.75rem 1rem" }}>
                    <div className="d-flex align-items-center">
                      <i className="nc-icon nc-notes mr-2" style={{ color: "#856404", fontSize: "1.25rem" }} />
                      <h6 className="mb-0" style={{ fontWeight: "600", color: "#856404" }}>
                        Observaciones
                      </h6>
                    </div>
                  </CardHeader>
                  <CardBody style={{ padding: "1.25rem", backgroundColor: "#fff3cd" }}>
                    <p style={{ fontSize: "1rem", fontWeight: "400", color: "#856404", margin: 0, lineHeight: "1.6" }}>
                      {selectedExpense.observations}
                    </p>
                  </CardBody>
                </Card>
              )}

              {/* SECCIÓN 5: Factura */}
              {selectedExpense.invoiceFileUrl && (
                <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6", padding: "0.75rem 1rem" }}>
                    <div className="d-flex align-items-center">
                      <i className="nc-icon nc-paper mr-2" style={{ color: "#dc3545", fontSize: "1.25rem" }} />
                      <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                        Factura
                      </h6>
                    </div>
                  </CardHeader>
                  <CardBody style={{ padding: "1.25rem" }}>
                    <div className="d-flex" style={{ gap: "0.5rem" }}>
                      <Button
                        color="info"
                        onClick={() => window.open(selectedExpense.invoiceFileUrl, "_blank")}
                        style={{ flex: 1 }}
                      >
                        <i className="nc-icon nc-zoom-split mr-2" />
                        Ver Factura
                      </Button>
                      <Button
                        color="success"
                        onClick={() => {
                          const link = document.createElement("a");
                          link.href = selectedExpense.invoiceFileUrl;
                          link.download = `Factura_${selectedExpense.invoiceNumber}.pdf`;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        style={{ flex: 1 }}
                      >
                        <i className="nc-icon nc-cloud-download-93 mr-2" />
                        Descargar Factura
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Botón de Marcar Reembolso como Pagado */}
              {selectedExpense.reimbursementStatus === "PENDIENTE" && (
                <div className="text-center mt-4">
                  <Button
                    color="success"
                    size="lg"
                    onClick={() => handleMarkReimbursementPaid(selectedExpense)}
                    style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}
                  >
                    <i className="nc-icon nc-check-2 mr-2" />
                    Marcar Reembolso como Pagado
                  </Button>
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter style={{ borderTop: "2px solid #e9ecef", padding: "1rem 1.5rem" }}>
          <Button color="secondary" onClick={() => setShowDetailsModal(false)}>
            <i className="nc-icon nc-simple-remove mr-1" />
            Cerrar
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal de Marcar Reembolso como Pagado */}
      <Modal isOpen={showReimbursementModal} toggle={() => setShowReimbursementModal(false)}>
        <ModalHeader toggle={() => setShowReimbursementModal(false)}>
          Marcar Reembolso como Pagado
        </ModalHeader>
        <ModalBody>
          {selectedReimbursement && (
            <div>
              <p><strong>Factura:</strong> {selectedReimbursement.invoiceNumber}</p>
              <p><strong>Monto a Reembolsar:</strong> Q {selectedReimbursement.messengerAmount?.toFixed(2) || "0.00"}</p>
              <FormGroup>
                <Label>Fecha de Pago *</Label>
                <Input
                  type="date"
                  id="reimbursementPaymentDate"
                  defaultValue={new Date().toISOString().split("T")[0]}
                />
              </FormGroup>
              <FormGroup>
                <Label>Método de Pago *</Label>
                <Input
                  type="text"
                  id="reimbursementPaymentMethod"
                  placeholder="Ej: Transferencia, Efectivo, Cheque..."
                />
              </FormGroup>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowReimbursementModal(false)}>
            Cancelar
          </Button>
          <Button
            color="success"
            onClick={() => {
              const paymentDate = document.getElementById("reimbursementPaymentDate").value;
              const paymentMethod = document.getElementById("reimbursementPaymentMethod").value;
              if (!paymentDate || !paymentMethod) {
                showError("Fecha y método de pago son requeridos");
                return;
              }
              handleConfirmReimbursementPayment(paymentDate, paymentMethod);
            }}
            disabled={loading}
          >
            {loading ? "Guardando..." : "Confirmar Pago"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal de Detalle de Compra */}
      <Modal
        isOpen={showPurchaseDetailModal}
        toggle={closePurchaseDetailModal}
        size="xl"
      >
        <ModalHeader
          toggle={closePurchaseDetailModal}
          style={{ borderBottom: "2px solid #e9ecef", padding: "1.25rem 1.5rem" }}
        >
          <div className="d-flex justify-content-between align-items-center w-100">
            <div className="d-flex align-items-center">
              <i className="nc-icon nc-tag mr-2" style={{ fontSize: "1.5rem", color: "#007bff" }} />
              <div>
                <h5 className="mb-0" style={{ fontWeight: "600", color: "#212529" }}>
                  Detalle de Compra
                </h5>
                <small className="text-muted">
                  {selectedPurchaseNumber?.purchaseNumber || "N/A"}{selectedPurchaseNumber?.description ? ` - ${selectedPurchaseNumber.description}` : ""}
                </small>
              </div>
            </div>
            {selectedPurchaseNumber && (
              <div className="d-flex align-items-center gap-2">
                <Button
                  color="info"
                  size="sm"
                  outline
                  onClick={handleDownloadPurchaseSummary}
                  disabled={loadingPurchaseDetail || purchaseItems.length === 0}
                >
                  <i className="nc-icon nc-cloud-download-93 mr-1" />
                  Descargar resumen
                </Button>
                {canModifyPurchaseItems(selectedPurchaseNumber) && !editingPurchaseNumber && (
                  <Button
                    color="primary"
                    size="sm"
                    onClick={() => {
                      setEditingPurchaseNumber(true);
                      setPurchaseNumberEditData({
                        description: selectedPurchaseNumber.description || "",
                        totalAmount: selectedPurchaseNumber.totalAmount ? selectedPurchaseNumber.totalAmount.toString() : "",
                      });
                    }}
                  >
                    <i className="nc-icon nc-settings mr-1" />
                    Editar Compra
                  </Button>
                )}
                <Badge
                  color={getPurchaseStatusLabel(selectedPurchaseNumber.status).color}
                  style={{
                    fontSize: "0.875rem",
                    padding: "0.5rem 1rem",
                    borderRadius: "20px",
                    fontWeight: "600",
                  }}
                >
                  {selectedPurchaseNumber.status === "PAGADO" ? (
                    <>
                      <i className="nc-icon nc-check-2 mr-1" />
                      {getPurchaseStatusLabel(selectedPurchaseNumber.status).text}
                    </>
                  ) : selectedPurchaseNumber.status === "TERMINADO" ? (
                    <>
                      <i className="nc-icon nc-lock-circle mr-1" />
                      {getPurchaseStatusLabel(selectedPurchaseNumber.status).text}
                    </>
                  ) : (
                    <>
                      <i className="nc-icon nc-bullet-list-67 mr-1" />
                      {getPurchaseStatusLabel(selectedPurchaseNumber.status).text}
                    </>
                  )}
                </Badge>
              </div>
            )}
          </div>
        </ModalHeader>
        <ModalBody style={{ padding: "1.5rem" }}>
          {loadingPurchaseDetail ? (
            <div className="text-center py-5">
              <Spinner color="primary" />
              <p className="mt-2">Cargando detalles de la compra...</p>
            </div>
          ) : selectedPurchaseNumber ? (
            <div>
              {/* SECCIÓN 1: Información General de la Compra */}
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
                            Número de Compra
                          </label>
                          <p style={{ margin: 0 }}>
                            <Badge color="info" style={{ fontSize: "1rem", padding: "0.25rem 0.75rem" }}>
                              {selectedPurchaseNumber.purchaseNumber}{selectedPurchaseNumber.description ? ` - ${selectedPurchaseNumber.description}` : ""}
                            </Badge>
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
                            <Badge color={getPurchaseStatusLabel(selectedPurchaseNumber.status).color}>
                              {getPurchaseStatusLabel(selectedPurchaseNumber.status).text}
                            </Badge>
                            {selectedPurchaseNumber.status === "PENDIENTE" && (
                              <small className="text-muted d-block mt-1">
                                Agregue artículos y cierre la lista cuando esté lista.
                              </small>
                            )}
                            {selectedPurchaseNumber.status === "TERMINADO" && (
                              <small className="text-muted d-block mt-1">
                                Lista de artículos cerrada. Registre y edite gastos; al terminar, finalice la compra.
                              </small>
                            )}
                            {selectedPurchaseNumber.status === "PAGADO" && (
                              <small className="text-muted d-block mt-1">
                                Compra finalizada. No se permiten más cambios.
                              </small>
                            )}
                          </p>
                        </div>
                      </div>
                    </Col>
                    {editingPurchaseNumber ? (
                      <>
                        <Col md="12" className="mb-3">
                          <FormGroup>
                            <Label>Descripción</Label>
                            <Input
                              type="text"
                              value={purchaseNumberEditData.description}
                              onChange={(e) => setPurchaseNumberEditData(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Descripción de la compra"
                            />
                          </FormGroup>
                        </Col>
                        <Col md="12" className="mb-3">
                          <FormGroup>
                            <Label>Cantidad Total a Liquidar *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={purchaseNumberEditData.totalAmount}
                              onChange={(e) => setPurchaseNumberEditData(prev => ({ ...prev, totalAmount: e.target.value }))}
                              placeholder="0.00"
                              required
                            />
                            <small className="text-muted">
                              Monto total asignado para liquidar en esta compra.
                            </small>
                          </FormGroup>
                        </Col>
                        <Col md="12" className="mt-3">
                          <div className="d-flex justify-content-end gap-2">
                            <Button
                              color="secondary"
                              onClick={() => {
                                setEditingPurchaseNumber(false);
                                setPurchaseNumberEditData({
                                  description: "",
                                  totalAmount: "",
                                });
                              }}
                            >
                              Cancelar
                            </Button>
                            <Button
                              color="primary"
                              onClick={handleSavePurchaseNumber}
                              disabled={loading}
                            >
                              {loading ? "Guardando..." : "Guardar Cambios"}
                            </Button>
                          </div>
                        </Col>
                      </>
                    ) : (
                      <>
                        {selectedPurchaseNumber.description && (
                          <Col md="12" className="mb-3">
                            <div className="d-flex align-items-start">
                              <i className="nc-icon nc-align-left-2 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                                  Descripción
                                </label>
                                <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                                  {selectedPurchaseNumber.description}
                                </p>
                              </div>
                            </div>
                          </Col>
                        )}
                        <Col md="6" className="mb-3">
                          <div className="d-flex align-items-start">
                            <i className="nc-icon nc-money-coins mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                                Cantidad Total a Liquidar
                              </label>
                              <p style={{ fontSize: "1.1rem", fontWeight: "600", color: "#007bff", margin: 0 }}>
                                {selectedPurchaseNumber.totalAmount != null
                                  ? `Q ${parseFloat(selectedPurchaseNumber.totalAmount).toFixed(2)}`
                                  : <span className="text-muted">No asignado</span>}
                              </p>
                            </div>
                          </div>
                        </Col>
                        <Col md="6" className="mb-3">
                          <div className="d-flex align-items-start">
                            <i className="nc-icon nc-cart-simple mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                                Total Gastado (Facturas)
                              </label>
                              <p style={{ fontSize: "1.1rem", fontWeight: "600", color: "#28a745", margin: 0 }}>
                                Q {purchaseExpenses.reduce((sum, exp) => sum + (parseFloat(exp.totalAmount) || 0), 0).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </Col>
                        {selectedPurchaseNumber.totalAmount != null && (() => {
                          const rawBal = parseFloat(selectedPurchaseNumber.rawBalance || 0);
                          const netBal = parseFloat(selectedPurchaseNumber.netBalance || 0);
                          const compGiven = parseFloat(selectedPurchaseNumber.compensationsGiven || 0);
                          const compReceived = parseFloat(selectedPurchaseNumber.compensationsReceived || 0);
                          const hasComp = compGiven > 0 || compReceived > 0;
                          return (
                            <Col md="12" className="mb-3">
                              {/* Balance bruto */}
                              <div style={{
                                backgroundColor: rawBal >= 0 ? "#d4edda" : "#f8d7da",
                                padding: "0.75rem 1rem",
                                borderRadius: "5px",
                                border: `1px solid ${rawBal >= 0 ? "#28a745" : "#dc3545"}`,
                                marginBottom: hasComp ? "0.5rem" : 0
                              }}>
                                <div className="d-flex justify-content-between align-items-center">
                                  <strong style={{ color: rawBal >= 0 ? "#155724" : "#721c24" }}>
                                    {rawBal >= 0 ? "Vuelto Bruto:" : "Faltante Bruto:"}
                                  </strong>
                                  <span style={{ fontSize: "1.2rem", fontWeight: "700", color: rawBal >= 0 ? "#155724" : "#721c24" }}>
                                    Q {Math.abs(rawBal).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                              {/* Compensaciones */}
                              {hasComp && (
                                <div style={{
                                  backgroundColor: "#e7f3ff",
                                  padding: "0.5rem 1rem",
                                  borderRadius: "5px",
                                  border: "1px solid #b3d9ff",
                                  marginBottom: "0.5rem",
                                  fontSize: "0.9rem"
                                }}>
                                  {compGiven > 0 && (
                                    <div className="d-flex justify-content-between" style={{ color: "#dc3545" }}>
                                      <span>↗ Sobrante cedido a otras compras:</span>
                                      <strong>- Q {compGiven.toFixed(2)}</strong>
                                    </div>
                                  )}
                                  {compReceived > 0 && (
                                    <div className="d-flex justify-content-between" style={{ color: "#28a745" }}>
                                      <span>↙ Compensación recibida de otras compras:</span>
                                      <strong>+ Q {compReceived.toFixed(2)}</strong>
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Balance neto */}
                              {hasComp && (
                                <div style={{
                                  backgroundColor: netBal >= 0 ? "#d4edda" : "#f8d7da",
                                  padding: "0.75rem 1rem",
                                  borderRadius: "5px",
                                  border: `2px solid ${netBal >= 0 ? "#28a745" : "#dc3545"}`
                                }}>
                                  <div className="d-flex justify-content-between align-items-center">
                                    <strong style={{ color: netBal >= 0 ? "#155724" : "#721c24" }}>
                                      Saldo Neto (después de compensaciones):
                                    </strong>
                                    <span style={{ fontSize: "1.3rem", fontWeight: "700", color: netBal >= 0 ? "#155724" : "#721c24" }}>
                                      Q {netBal.toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </Col>
                          );
                        })()}
                      </>
                    )}
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-calendar-60 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Fecha de Creación
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedPurchaseNumber.createdAt
                              ? new Date(selectedPurchaseNumber.createdAt).toLocaleDateString('es-GT', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                              : "N/A"}
                          </p>
                        </div>
                      </div>
                    </Col>
                    <Col md="6" className="mb-3">
                      <div className="d-flex align-items-start">
                        <i className="nc-icon nc-single-02 mr-2 mt-1" style={{ color: "#6c757d", fontSize: "1rem" }} />
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#6c757d", marginBottom: "0.25rem", display: "block" }}>
                            Creado por
                          </label>
                          <p style={{ fontSize: "1rem", fontWeight: "400", color: "#212529", margin: 0 }}>
                            {selectedPurchaseNumber.createdByName || "N/A"}
                          </p>
                        </div>
                      </div>
                    </Col>
                  </Row>
                </CardBody>
              </Card>

              {/* SECCIÓN 1.5: Artículos de la Compra */}
              <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6", padding: "0.75rem 1rem" }}>
                  <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center">
                      <i className="nc-icon nc-bullet-list-67 mr-2" style={{ color: "#007bff", fontSize: "1.25rem" }} />
                      <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                        Artículos de la Compra ({purchaseItems.length})
                      </h6>
                    </div>
                    {selectedPurchaseNumber && canModifyPurchaseItems(selectedPurchaseNumber) && (
                      <Button
                        color="primary"
                        size="sm"
                        onClick={() => {
                          setEditingItem(null);
                          setPendingItemDrafts([]);
                          setItemFormData({ ...EMPTY_ITEM_FORM });
                          setShowItemModal(true);
                        }}
                      >
                        <i className="nc-icon nc-simple-add mr-1" />
                        Agregar Artículo
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardBody style={{ padding: "1.25rem" }}>
                  {purchaseItems.length === 0 ? (
                    <Alert color="info">
                      No hay artículos agregados. Haga clic en "Agregar Artículo" para comenzar.
                    </Alert>
                  ) : (
                    <div className="table-responsive">
                      <Table striped hover size="sm">
                        <thead style={{ backgroundColor: "#f8f9fa" }}>
                          <tr>
                            <th>Artículo</th>
                            <th>Precio Est. (Unidad)</th>
                            <th>Cantidad</th>
                            <th>Total Est.</th>
                            <th>Precio Real</th>
                            <th>Diferencia</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {purchaseItems.map((item) => {
                            const priceDiff = item.actualPrice && item.estimatedPrice
                              ? item.actualPrice - item.estimatedPrice
                              : null;
                            const totalDiff = priceDiff !== null
                              ? priceDiff * item.quantity
                              : null;
                            const linkedExpense = item.minorExpenseId
                              ? purchaseExpenses.find((e) => e.id === item.minorExpenseId)
                              : null;

                            return (
                              <tr key={item.id}>
                                <td>
                                  <strong>{item.itemName}</strong>
                                  {item.description && (
                                    <>
                                      <br />
                                      <small className="text-muted">{item.description}</small>
                                    </>
                                  )}
                                </td>
                                <td>Q {parseFloat(item.estimatedPrice || 0).toFixed(2)}</td>
                                <td>{item.quantity}</td>
                                <td>
                                  <strong>
                                    Q {(calcItemLineTotal(item.estimatedPrice, item.quantity)
                                      ?? parseFloat(item.estimatedTotal || 0)).toFixed(2)}
                                  </strong>
                                </td>
                                <td>
                                  {item.actualPrice ? (
                                    <strong className="text-success">
                                      Q {parseFloat(item.actualPrice).toFixed(2)}
                                    </strong>
                                  ) : (
                                    <span className="text-muted">-</span>
                                  )}
                                </td>
                                <td>
                                  {totalDiff !== null && (
                                    <Badge color={totalDiff >= 0 ? "danger" : "success"}>
                                      {totalDiff >= 0 ? "+" : ""}Q {Math.abs(totalDiff).toFixed(2)}
                                    </Badge>
                                  )}
                                </td>
                                <td>
                                  {item.isPurchased ? (
                                    <Badge color="success">Comprado</Badge>
                                  ) : (
                                    <Badge color="warning">Pendiente</Badge>
                                  )}
                                </td>
                                <td>
                                  <div className="d-flex flex-wrap" style={{ gap: "0.25rem" }}>
                                    {!item.isPurchased && selectedPurchaseNumber && (
                                      <>
                                        {canEditPurchaseExpenses(selectedPurchaseNumber) && (
                                          <Button
                                            color="info"
                                            size="sm"
                                            onClick={() => handleCreateExpenseFromItem(item)}
                                          >
                                            <i className="nc-icon nc-simple-add" /> Crear Gasto
                                          </Button>
                                        )}
                                        {canModifyPurchaseItems(selectedPurchaseNumber) && (
                                          <>
                                            <Button
                                              color="warning"
                                              size="sm"
                                              onClick={() => handleEditItem(item)}
                                            >
                                              <i className="nc-icon nc-settings" />
                                            </Button>
                                            <Button
                                              color="danger"
                                              size="sm"
                                              onClick={() => handleDeleteItem(item.id)}
                                            >
                                              <i className="nc-icon nc-simple-remove" />
                                            </Button>
                                          </>
                                        )}
                                      </>
                                    )}
                                    {item.isPurchased && linkedExpense && (
                                      <>
                                        <Button
                                          color="info"
                                          size="sm"
                                          onClick={() => handleViewDetails(linkedExpense)}
                                        >
                                          <i className="nc-icon nc-zoom-split" /> Ver Gasto
                                        </Button>
                                        {canEditPurchaseExpense(selectedPurchaseNumber, linkedExpense) && (
                                          <Button
                                            color="warning"
                                            size="sm"
                                            onClick={() => handleEditPurchaseExpense(linkedExpense, item)}
                                          >
                                            <i className="nc-icon nc-ruler-pencil" /> Editar
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ backgroundColor: "#f8f9fa", fontWeight: "600" }}>
                            <td colSpan="4" className="text-right">
                              <strong>Total Estimado:</strong>
                            </td>
                            <td>
                              <strong className="text-primary">
                                Q {purchaseItems.reduce(
                                  (sum, item) => sum + (
                                    calcItemLineTotal(item.estimatedPrice, item.quantity)
                                    ?? parseFloat(item.estimatedTotal || 0)
                                  ),
                                  0
                                ).toFixed(2)}
                              </strong>
                            </td>
                            <td colSpan="4"></td>
                          </tr>
                        </tfoot>
                      </Table>
                    </div>
                  )}
                  {canModifyPurchaseItems(selectedPurchaseNumber) && (
                    <div className="d-flex justify-content-end mt-3">
                      <Button
                        color="warning"
                        outline
                        onClick={handleClosePurchaseArticles}
                        disabled={loading || purchaseItems.length === 0}
                      >
                        <i className="nc-icon nc-lock-circle-open mr-1" />
                        Cerrar lista de artículos
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* SECCIÓN 2: Resumen Financiero Completo */}
              <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6", padding: "0.75rem 1rem" }}>
                  <div className="d-flex align-items-center">
                    <i className="nc-icon nc-money-coins mr-2" style={{ color: "#28a745", fontSize: "1.25rem" }} />
                    <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                      Resumen Financiero de la Compra
                    </h6>
                  </div>
                </CardHeader>
                <CardBody style={{ padding: "1.25rem" }}>
                  {/* Totales Principales */}
                  <Row className="mb-4">
                    <Col md="4" className="mb-3">
                      <div style={{
                        backgroundColor: "#e7f3ff",
                        padding: "1rem",
                        borderRadius: "5px",
                        borderLeft: "4px solid #007bff",
                        textAlign: "center"
                      }}>
                        <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#004085", margin: 0, display: "block" }}>
                          Total de Facturas
                        </label>
                        <span style={{ fontSize: "1.5rem", fontWeight: "700", color: "#004085" }}>
                          {purchaseExpenses.length}
                        </span>
                      </div>
                    </Col>
                    <Col md="4" className="mb-3">
                      <div style={{
                        backgroundColor: "#d4edda",
                        padding: "1rem",
                        borderRadius: "5px",
                        borderLeft: "4px solid #28a745",
                        textAlign: "center"
                      }}>
                        <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#155724", margin: 0, display: "block" }}>
                          Costo Total de la Compra
                        </label>
                        <span style={{ fontSize: "1.5rem", fontWeight: "700", color: "#155724" }}>
                          Q {purchaseExpenses.reduce((sum, exp) => sum + (parseFloat(exp.totalAmount) || 0), 0).toFixed(2)}
                        </span>
                      </div>
                    </Col>
                    <Col md="4" className="mb-3">
                      <div style={{
                        backgroundColor: "#fff3cd",
                        padding: "1rem",
                        borderRadius: "5px",
                        borderLeft: "4px solid #ffc107",
                        textAlign: "center"
                      }}>
                        <label style={{ fontSize: "0.875rem", fontWeight: "600", color: "#856404", margin: 0, display: "block" }}>
                          Reembolsos Pendientes
                        </label>
                        <span style={{ fontSize: "1.5rem", fontWeight: "700", color: "#856404" }}>
                          {purchaseExpenses.filter(e => e.reimbursementStatus === "PENDIENTE").length}
                        </span>
                      </div>
                    </Col>
                  </Row>

                  {/* Control de Liquidación con Compensaciones */}
                  {selectedPurchaseNumber && selectedPurchaseNumber.totalAmount && (() => {
                    const totalAssigned = parseFloat(selectedPurchaseNumber.totalAmount || 0);
                    const totalSpent = parseFloat(selectedPurchaseNumber.totalSpent || 0);
                    const rawBal = parseFloat(selectedPurchaseNumber.rawBalance || 0);
                    const compGiven = parseFloat(selectedPurchaseNumber.compensationsGiven || 0);
                    const compReceived = parseFloat(selectedPurchaseNumber.compensationsReceived || 0);
                    const netBal = parseFloat(selectedPurchaseNumber.netBalance || 0);
                    const hasComp = compGiven > 0 || compReceived > 0;

                    return (
                      <div style={{
                        backgroundColor: "#f0f8ff",
                        padding: "1.25rem",
                        borderRadius: "5px",
                        border: "2px solid #007bff",
                        marginBottom: "1.5rem"
                      }}>
                        <h6 className="mb-3" style={{ fontWeight: "600", color: "#004085" }}>
                          <i className="nc-icon nc-chart-pie mr-2" style={{ color: "#007bff" }} />
                          Control de Liquidación y Compensaciones
                        </h6>

                        {/* Línea contable */}
                        <Table size="sm" bordered style={{ marginBottom: "1rem", backgroundColor: "#fff" }}>
                          <tbody>
                            <tr>
                              <td style={{ width: "50%", fontWeight: "600" }}>Total Asignado a Liquidar</td>
                              <td className="text-right" style={{ fontSize: "1.1rem", color: "#004085" }}>Q {totalAssigned.toFixed(2)}</td>
                            </tr>
                            <tr>
                              <td style={{ fontWeight: "600" }}>(-) Total Gastado (Facturas)</td>
                              <td className="text-right" style={{ fontSize: "1.1rem", color: "#155724" }}>Q {totalSpent.toFixed(2)}</td>
                            </tr>
                            <tr style={{ backgroundColor: rawBal >= 0 ? "#d4edda" : "#f8d7da" }}>
                              <td style={{ fontWeight: "700" }}>= {rawBal >= 0 ? "Vuelto Bruto" : "Faltante Bruto"}</td>
                              <td className="text-right" style={{ fontSize: "1.2rem", fontWeight: "700", color: rawBal >= 0 ? "#155724" : "#721c24" }}>
                                Q {rawBal.toFixed(2)}
                              </td>
                            </tr>
                            {compGiven > 0 && (
                              <tr style={{ backgroundColor: "#fff3cd" }}>
                                <td style={{ fontWeight: "600", color: "#856404" }}>
                                  (-) Sobrante cedido a otras compras
                                </td>
                                <td className="text-right" style={{ fontSize: "1.1rem", color: "#856404" }}>
                                  Q {compGiven.toFixed(2)}
                                </td>
                              </tr>
                            )}
                            {compReceived > 0 && (
                              <tr style={{ backgroundColor: "#d1ecf1" }}>
                                <td style={{ fontWeight: "600", color: "#0c5460" }}>
                                  (+) Compensación recibida de otras compras
                                </td>
                                <td className="text-right" style={{ fontSize: "1.1rem", color: "#0c5460" }}>
                                  Q {compReceived.toFixed(2)}
                                </td>
                              </tr>
                            )}
                            {hasComp && (
                              <tr style={{ backgroundColor: netBal >= 0 ? "#d4edda" : "#f8d7da", borderTop: "2px solid #000" }}>
                                <td style={{ fontWeight: "700", fontSize: "1rem" }}>
                                  = SALDO NETO
                                </td>
                                <td className="text-right" style={{ fontSize: "1.3rem", fontWeight: "700", color: netBal >= 0 ? "#155724" : "#721c24" }}>
                                  Q {netBal.toFixed(2)}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </Table>

                        {/* Mensaje de estado */}
                        {netBal > 0 && (
                          <Alert color="success" className="mb-2 py-2">
                            <i className="nc-icon nc-money-coins mr-1" />
                            <strong>Sobrante disponible:</strong> Q {netBal.toFixed(2)} pueden compensar faltantes de otras compras.
                          </Alert>
                        )}
                        {netBal < 0 && (
                          <Alert color="danger" className="mb-2 py-2">
                            <i className="nc-icon nc-alert-circle-i mr-1" />
                            <strong>Faltante:</strong> Q {Math.abs(netBal).toFixed(2)} — necesita compensación desde otra compra con sobrante.
                          </Alert>
                        )}
                        {netBal === 0 && totalSpent > 0 && (
                          <Alert color="secondary" className="mb-2 py-2">
                            <i className="nc-icon nc-check-2 mr-1" />
                            <strong>Cuadrado:</strong> Esta compra está completamente liquidada.
                          </Alert>
                        )}

                        {/* Botón para compensar */}
                        <div className="d-flex justify-content-end" style={{ gap: "0.5rem" }}>
                          {rawBal > 0 && (
                            <Button
                              color="warning"
                              size="sm"
                              onClick={() => {
                                setCompensationForm({
                                  sourcePurchaseId: selectedPurchaseNumber.id,
                                  targetPurchaseId: "",
                                  amount: "",
                                  description: "",
                                });
                                setShowCompensationModal(true);
                              }}
                            >
                              <i className="nc-icon nc-send mr-1" />
                              Ceder sobrante a otra compra
                            </Button>
                          )}
                          {netBal < 0 && (
                            <Button
                              color="info"
                              size="sm"
                              onClick={() => {
                                setCompensationForm({
                                  sourcePurchaseId: "",
                                  targetPurchaseId: selectedPurchaseNumber.id,
                                  amount: "",
                                  description: "",
                                });
                                setShowCompensationModal(true);
                              }}
                            >
                              <i className="nc-icon nc-money-coins mr-1" />
                              Recibir compensación de otra compra
                            </Button>
                          )}
                        </div>

                        {/* Historial de compensaciones */}
                        {purchaseCompensations.length > 0 && (
                          <div style={{ marginTop: "1rem" }}>
                            <h6 style={{ fontWeight: "600", fontSize: "0.9rem", color: "#495057", marginBottom: "0.5rem" }}>
                              <i className="nc-icon nc-refresh-69 mr-1" />
                              Historial de Compensaciones ({purchaseCompensations.length})
                            </h6>
                            <Table size="sm" bordered striped style={{ fontSize: "0.85rem", marginBottom: 0 }}>
                              <thead style={{ backgroundColor: "#e9ecef" }}>
                                <tr>
                                  <th>Tipo</th>
                                  <th>Compra Relacionada</th>
                                  <th>Monto</th>
                                  <th>Descripción</th>
                                  <th>Fecha</th>
                                  <th></th>
                                </tr>
                              </thead>
                              <tbody>
                                {purchaseCompensations.map(comp => {
                                  const isSource = comp.sourcePurchaseId === selectedPurchaseNumber.id;
                                  return (
                                    <tr key={comp.id}>
                                      <td>
                                        <Badge color={isSource ? "warning" : "info"} style={{ fontSize: "0.8rem" }}>
                                          {isSource ? "↗ Cedido" : "↙ Recibido"}
                                        </Badge>
                                      </td>
                                      <td>
                                        <strong>
                                          {isSource ? comp.targetPurchaseNumber : comp.sourcePurchaseNumber}
                                        </strong>
                                        {(isSource ? comp.targetPurchaseDescription : comp.sourcePurchaseDescription) && (
                                          <small className="text-muted d-block">
                                            {isSource ? comp.targetPurchaseDescription : comp.sourcePurchaseDescription}
                                          </small>
                                        )}
                                      </td>
                                      <td style={{ fontWeight: "600", color: isSource ? "#dc3545" : "#28a745" }}>
                                        {isSource ? "-" : "+"}Q {parseFloat(comp.amount).toFixed(2)}
                                      </td>
                                      <td>{comp.description || "—"}</td>
                                      <td>
                                        {comp.createdAt
                                          ? new Date(comp.createdAt).toLocaleDateString("es-GT", {
                                              day: "2-digit", month: "2-digit", year: "numeric"
                                            })
                                          : "—"}
                                      </td>
                                      <td>
                                        <Button
                                          color="danger"
                                          size="sm"
                                          style={{ padding: "2px 6px", fontSize: "0.75rem" }}
                                          onClick={async () => {
                                            if (!window.confirm("¿Eliminar esta compensación? Se revertirá la transferencia de saldo.")) return;
                                            try {
                                              await deleteCompensation(comp.id);
                                              showSuccess("Compensación eliminada");
                                              handleViewPurchaseDetails(selectedPurchaseNumber.id, selectedPurchaseNumber.purchaseNumber);
                                              loadAllPurchaseNumbers();
                                            } catch (err) {
                                              showError(err.message);
                                            }
                                          }}
                                          title="Eliminar compensación"
                                        >
                                          <i className="nc-icon nc-simple-remove" />
                                        </Button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Desglose Financiero Detallado */}
                  <div style={{
                    backgroundColor: "#f8f9fa",
                    padding: "1.25rem",
                    borderRadius: "5px",
                    border: "1px solid #dee2e6"
                  }}>
                    <h6 className="mb-3" style={{ fontWeight: "600", color: "#495057" }}>
                      <i className="nc-icon nc-chart-bar-32 mr-2" style={{ color: "#007bff" }} />
                      Desglose Financiero
                    </h6>
                    <Row>
                      <Col md="6" className="mb-3">
                        <div className="d-flex justify-content-between align-items-center py-2" style={{ borderBottom: "1px solid #dee2e6" }}>
                          <div>
                            <i className="nc-icon nc-money-coins mr-2" style={{ color: "#28a745" }} />
                            <strong>Total Pagado por Empresa:</strong>
                          </div>
                          <span style={{ fontSize: "1.1rem", fontWeight: "600", color: "#28a745" }}>
                            Q {purchaseExpenses.reduce((sum, exp) => sum + (parseFloat(exp.companyAmount) || 0), 0).toFixed(2)}
                          </span>
                        </div>
                      </Col>
                      <Col md="6" className="mb-3">
                        <div className="d-flex justify-content-between align-items-center py-2" style={{ borderBottom: "1px solid #dee2e6" }}>
                          <div>
                            <i className="nc-icon nc-single-02 mr-2" style={{ color: "#ffc107" }} />
                            <strong>Total Pagado por Mensajero:</strong>
                          </div>
                          <span style={{ fontSize: "1.1rem", fontWeight: "600", color: "#ffc107" }}>
                            Q {purchaseExpenses.reduce((sum, exp) => sum + (parseFloat(exp.messengerAmount) || 0), 0).toFixed(2)}
                          </span>
                        </div>
                      </Col>
                      <Col md="6" className="mb-3">
                        <div className="d-flex justify-content-between align-items-center py-2" style={{ borderBottom: "1px solid #dee2e6" }}>
                          <div>
                            <i className="nc-icon nc-wallet-43 mr-2" style={{ color: "#17a2b8" }} />
                            <strong>Total Caja Chica Inicial:</strong>
                          </div>
                          <span style={{ fontSize: "1.1rem", fontWeight: "600", color: "#17a2b8" }}>
                            Q {purchaseExpenses.reduce((sum, exp) => sum + (parseFloat(exp.initialAmountGiven) || 0), 0).toFixed(2)}
                          </span>
                        </div>
                      </Col>
                      <Col md="6" className="mb-3">
                        <div className="d-flex justify-content-between align-items-center py-2" style={{ borderBottom: "1px solid #dee2e6" }}>
                          <div>
                            <i className="nc-icon nc-money-coins mr-2" style={{ color: "#fd7e14" }} />
                            <strong>Total Vuelto Recibido:</strong>
                          </div>
                          <span style={{ fontSize: "1.1rem", fontWeight: "600", color: "#fd7e14" }}>
                            Q {purchaseExpenses.reduce((sum, exp) => sum + (parseFloat(exp.returnedAmount) || 0), 0).toFixed(2)}
                          </span>
                        </div>
                      </Col>
                    </Row>
                  </div>

                  {/* Resumen de Reembolsos */}
                  <div style={{
                    backgroundColor: "#fff3cd",
                    padding: "1.25rem",
                    borderRadius: "5px",
                    border: "1px solid #ffc107",
                    marginTop: "1rem"
                  }}>
                    <h6 className="mb-3" style={{ fontWeight: "600", color: "#856404" }}>
                      <i className="nc-icon nc-time-alarm mr-2" style={{ color: "#ffc107" }} />
                      Resumen de Reembolsos
                    </h6>
                    <Row>
                      <Col md="4" className="mb-2">
                        <div className="d-flex justify-content-between align-items-center">
                          <span><strong>Pendientes:</strong></span>
                          <Badge color="warning" style={{ fontSize: "0.9rem", padding: "0.4rem 0.8rem", color: "#212529", border: "1px solid #6c757d" }}>
                            {purchaseExpenses.filter(e => e.reimbursementStatus === "PENDIENTE").length} factura(s) -
                            Q {purchaseExpenses
                              .filter(e => e.reimbursementStatus === "PENDIENTE")
                              .reduce((sum, exp) => {
                                const original = parseFloat(exp.messengerAmount) || 0;
                                const adjustment = reimbursementAdjustments[exp.id];
                                const adjustmentValue = adjustment && adjustment !== "" ? parseFloat(adjustment) : (parseFloat(exp.reimbursementAdjustment) || 0);
                                return sum + Math.max(0, original + adjustmentValue);
                              }, 0)
                              .toFixed(2)}
                          </Badge>
                        </div>
                      </Col>
                      <Col md="4" className="mb-2">
                        <div className="d-flex justify-content-between align-items-center">
                          <span><strong>Pagados:</strong></span>
                          <Badge color="success" style={{ fontSize: "0.9rem", padding: "0.4rem 0.8rem", color: "#212529", border: "1px solid #6c757d" }}>
                            {purchaseExpenses.filter(e => e.reimbursementStatus === "PAGADO").length} factura(s) -
                            Q {purchaseExpenses
                              .filter(e => e.reimbursementStatus === "PAGADO")
                              .reduce((sum, exp) => sum + (parseFloat(exp.messengerAmount) || 0), 0)
                              .toFixed(2)}
                          </Badge>
                        </div>
                      </Col>
                      <Col md="4" className="mb-2">
                        <div className="d-flex justify-content-between align-items-center">
                          <span><strong>No Aplica:</strong></span>
                          <Badge color="secondary" style={{ fontSize: "0.9rem", padding: "0.4rem 0.8rem", color: "#212529", border: "1px solid #6c757d" }}>
                            {purchaseExpenses.filter(e => e.reimbursementStatus === "NO_APLICA").length} factura(s)
                          </Badge>
                        </div>
                      </Col>
                    </Row>
                    <div className="mt-3 pt-3" style={{ borderTop: "2px solid #212529" }}>
                      <div className="d-flex justify-content-between align-items-center">
                        <strong style={{ fontSize: "1.1rem", color: "#212529" }}>
                          Total a Reembolsar (Pendientes):
                        </strong>
                        <span style={{ fontSize: "1.3rem", fontWeight: "700", color: "#212529" }}>
                          Q {purchaseExpenses
                            .filter(e => e.reimbursementStatus === "PENDIENTE")
                            .reduce((sum, exp) => {
                              const original = parseFloat(exp.messengerAmount) || 0;
                              const adjustment = reimbursementAdjustments[exp.id];
                              const adjustmentValue = adjustment && adjustment !== "" ? parseFloat(adjustment) : (parseFloat(exp.reimbursementAdjustment) || 0);
                              return sum + Math.max(0, original + adjustmentValue);
                            }, 0)
                            .toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>

              {/* SECCIÓN 2.5: Ajustes de Reembolsos con Vuelto Disponible */}
              {selectedPurchaseNumber && selectedPurchaseNumber.totalAmount && (
                <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                  <CardHeader style={{ backgroundColor: "#e7f3ff", borderBottom: "2px solid #007bff", padding: "0.75rem 1rem" }}>
                    <div className="d-flex align-items-center justify-content-between">
                      <div className="d-flex align-items-center">
                        <i className="nc-icon nc-settings mr-2" style={{ color: "#007bff", fontSize: "1.25rem" }} />
                        <h6 className="mb-0" style={{ fontWeight: "600", color: "#004085" }}>
                          Ajustes de Reembolsos y Control de Vueltos
                        </h6>
                      </div>
                    </div>
                  </CardHeader>
                  <CardBody style={{ padding: "1.25rem" }}>
                    {/* Vuelto Disponible */}
                    {(() => {
                      const totalAssigned = parseFloat(selectedPurchaseNumber.totalAmount || 0);
                      const totalSpent = purchaseExpenses.reduce((sum, exp) => sum + (parseFloat(exp.totalAmount) || 0), 0);
                      const availableChange = totalAssigned - totalSpent;
                      const pendingReimbursements = purchaseExpenses.filter(e => e.reimbursementStatus === "PENDIENTE");
                      const totalPendingOriginal = pendingReimbursements.reduce((sum, exp) => sum + (parseFloat(exp.messengerAmount) || 0), 0);
                      const totalAdjustments = pendingReimbursements.reduce((sum, exp) => {
                        const adj = reimbursementAdjustments[exp.id];
                        return sum + (adj && adj !== "" ? parseFloat(adj) : (parseFloat(exp.reimbursementAdjustment) || 0));
                      }, 0);
                      const totalPendingAdjusted = totalPendingOriginal + totalAdjustments;

                      return (
                        <>
                          <div style={{
                            backgroundColor: availableChange > 0 ? "#d4edda" : "#f8d7da",
                            padding: "1rem",
                            borderRadius: "5px",
                            border: `2px solid ${availableChange > 0 ? "#28a745" : "#dc3545"}`,
                            marginBottom: "1.5rem"
                          }}>
                            <Row>
                              <Col md="6">
                                <div className="mb-2">
                                  <strong style={{ color: availableChange > 0 ? "#155724" : "#721c24" }}>
                                    Vuelto Disponible del Total Asignado:
                                  </strong>
                                  <span style={{
                                    fontSize: "1.3rem",
                                    fontWeight: "700",
                                    color: availableChange > 0 ? "#155724" : "#721c24",
                                    marginLeft: "0.5rem"
                                  }}>
                                    Q {availableChange.toFixed(2)}
                                  </span>
                                </div>
                              </Col>
                              <Col md="6">
                                <div className="mb-2">
                                  <strong style={{ color: "#004085" }}>
                                    Total Reembolsos Pendientes (Original):
                                  </strong>
                                  <span style={{
                                    fontSize: "1.2rem",
                                    fontWeight: "600",
                                    color: "#004085",
                                    marginLeft: "0.5rem"
                                  }}>
                                    Q {totalPendingOriginal.toFixed(2)}
                                  </span>
                                </div>
                                <div>
                                  <strong style={{ color: "#856404" }}>
                                    Total Ajustes Aplicados:
                                  </strong>
                                  <span style={{
                                    fontSize: "1.2rem",
                                    fontWeight: "600",
                                    color: totalAdjustments < 0 ? "#28a745" : totalAdjustments > 0 ? "#dc3545" : "#856404",
                                    marginLeft: "0.5rem"
                                  }}>
                                    {totalAdjustments >= 0 ? "+" : ""}Q {totalAdjustments.toFixed(2)}
                                  </span>
                                </div>
                                <div className="mt-2" style={{ borderTop: "1px solid #dee2e6", paddingTop: "0.5rem" }}>
                                  <strong style={{ color: "#212529" }}>
                                    Total a Reembolsar (Ajustado):
                                  </strong>
                                  <span style={{
                                    fontSize: "1.4rem",
                                    fontWeight: "700",
                                    color: "#212529",
                                    marginLeft: "0.5rem"
                                  }}>
                                    Q {totalPendingAdjusted.toFixed(2)}
                                  </span>
                                </div>
                              </Col>
                            </Row>
                            {availableChange > 0 && (
                              <div className="mt-2" style={{
                                backgroundColor: "#fff3cd",
                                padding: "0.75rem",
                                borderRadius: "3px",
                                border: "1px solid #ffc107"
                              }}>
                                <small style={{ color: "#856404" }}>
                                  <i className="nc-icon nc-info mr-1" />
                                  <strong>Nota:</strong> Puede usar este vuelto para reducir los reembolsos pendientes ingresando valores negativos en los ajustes.
                                </small>
                              </div>
                            )}
                          </div>

                          {/* Tabla de Ajustes por Factura */}
                          {pendingReimbursements.length > 0 && (
                            <div>
                              <h6 className="mb-3" style={{ fontWeight: "600", color: "#495057" }}>
                                <i className="nc-icon nc-settings mr-2" style={{ color: "#007bff" }} />
                                Ajustar Reembolsos por Factura
                              </h6>
                              <div className="table-responsive">
                                <Table striped hover size="sm">
                                  <thead style={{ backgroundColor: "#f8f9fa" }}>
                                    <tr>
                                      <th>Factura</th>
                                      <th>Reembolso Original</th>
                                      <th>Ajuste</th>
                                      <th>Reembolso Ajustado</th>
                                      <th>Estado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {pendingReimbursements.map((expense) => {
                                      const adjustment = reimbursementAdjustments[expense.id];
                                      const adjustmentValue = adjustment && adjustment !== "" ? parseFloat(adjustment) : (parseFloat(expense.reimbursementAdjustment) || 0);
                                      const originalAmount = parseFloat(expense.messengerAmount) || 0;
                                      const adjustedAmount = Math.max(0, originalAmount + adjustmentValue);

                                      return (
                                        <tr key={expense.id}>
                                          <td>
                                            <strong>{expense.invoiceNumber}</strong>
                                            <br />
                                            <small className="text-muted">{expense.supplier}</small>
                                          </td>
                                          <td>
                                            <strong style={{ color: "#004085" }}>
                                              Q {originalAmount.toFixed(2)}
                                            </strong>
                                          </td>
                                          <td>
                                            <Input
                                              type="number"
                                              step="0.01"
                                              value={adjustment !== undefined ? adjustment : (expense.reimbursementAdjustment != null ? expense.reimbursementAdjustment : "")}
                                              onChange={(e) => handleAdjustmentChange(expense.id, e.target.value)}
                                              style={{
                                                width: "120px",
                                                borderColor: adjustmentValue < 0 ? "#28a745" : adjustmentValue > 0 ? "#dc3545" : "#ced4da"
                                              }}
                                              placeholder="0.00"
                                            />
                                            {adjustmentValue !== 0 && (
                                              <small className={`d-block mt-1 ${adjustmentValue < 0 ? "text-success" : "text-danger"}`}>
                                                {adjustmentValue >= 0 ? "+" : ""}Q {adjustmentValue.toFixed(2)}
                                              </small>
                                            )}
                                          </td>
                                          <td>
                                            <strong style={{
                                              color: adjustedAmount !== originalAmount ? "#28a745" : "#212529",
                                              fontSize: adjustedAmount !== originalAmount ? "1.1rem" : "1rem"
                                            }}>
                                              Q {adjustedAmount.toFixed(2)}
                                            </strong>
                                            {adjustedAmount !== originalAmount && (
                                              <Badge color={adjustedAmount < originalAmount ? "success" : "warning"} className="ml-2">
                                                {adjustedAmount < originalAmount ? "Reducido" : "Aumentado"}
                                              </Badge>
                                            )}
                                          </td>
                                          <td>
                                            <Badge color="warning">Pendiente</Badge>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </Table>
                              </div>
                              <div className="mt-3 d-flex justify-content-end">
                                {canEditPurchaseExpenses(selectedPurchaseNumber) && (
                                <Button
                                  color="primary"
                                  onClick={handleSaveAdjustments}
                                  disabled={savingAdjustments}
                                >
                                  {savingAdjustments ? "Guardando..." : "Guardar Ajustes"}
                                </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </CardBody>
                </Card>
              )}

              {/* SECCIÓN 3: Facturas Asociadas */}
              <Card className="mb-4" style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                <CardHeader style={{ backgroundColor: "#f8f9fa", borderBottom: "2px solid #dee2e6", padding: "0.75rem 1rem" }}>
                  <div className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center">
                      <i className="nc-icon nc-paper mr-2" style={{ color: "#dc3545", fontSize: "1.25rem" }} />
                      <h6 className="mb-0" style={{ fontWeight: "600", color: "#495057" }}>
                        Facturas Asociadas ({purchaseExpenses.length})
                      </h6>
                    </div>
                    <Badge color="info" style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}>
                      {purchaseExpenses.length} factura{purchaseExpenses.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </CardHeader>
                <CardBody style={{ padding: "1.25rem" }}>
                  {purchaseExpenses.length === 0 ? (
                    <Alert color="info">No hay facturas asociadas a esta compra.</Alert>
                  ) : (
                    <div>
                      {/* Resumen de Facturas */}
                      <Row className="mb-3">
                        {purchaseExpenses.map((expense, idx) => {
                          const reimbursementStatusMap = {
                            PENDIENTE: { color: "warning", text: "Pendiente" },
                            PAGADO: { color: "success", text: "Pagado" },
                            NO_APLICA: { color: "info", text: "COMPLETO" },
                          };
                          const status = reimbursementStatusMap[expense.reimbursementStatus] || { color: "secondary", text: expense.reimbursementStatus || "N/A" };

                          return (
                            <Col md="6" key={expense.id} className="mb-3">
                              <Card style={{
                                borderLeft: "4px solid #6c757d",
                                border: "1px solid #6c757d",
                                boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
                              }}>
                                <CardBody style={{ padding: "1rem" }}>
                                  <div className="d-flex justify-content-between align-items-start mb-2">
                                    <div>
                                      <h6 className="mb-1" style={{ fontWeight: "600", color: "#212529" }}>
                                        <i className="nc-icon nc-single-copy-04 mr-2" style={{ color: "#007bff" }} />
                                        Factura #{expense.invoiceNumber}
                                      </h6>
                                      <small className="text-muted">
                                        {expense.purchaseDate ? new Date(expense.purchaseDate).toLocaleDateString() : "-"}
                                      </small>
                                    </div>
                                    <Badge color={status.color} style={{ border: "1px solid #6c757d" }}>{status.text}</Badge>
                                  </div>
                                  <div className="mb-2">
                                    <small className="text-muted d-block">Proveedor:</small>
                                    <strong>{expense.supplier}</strong>
                                  </div>
                                  <div className="mb-2">
                                    <small className="text-muted d-block">Descripción:</small>
                                    <span>{expense.description || "N/A"}</span>
                                  </div>
                                  <div className="mt-3 pt-2" style={{ borderTop: "1px solid #dee2e6" }}>
                                    <div className="mb-2">
                                      <small className="text-muted d-block">Monto Total:</small>
                                      <strong className="text-success" style={{ fontSize: "1.1rem" }}>
                                        Q {parseFloat(expense.totalAmount || 0).toFixed(2)}
                                      </strong>
                                    </div>
                                    {expense.messengerAmount && parseFloat(expense.messengerAmount) > 0 && (
                                      <div className="mb-2">
                                        <small className="text-muted d-block">
                                          Reembolso {expense.reimbursementStatus === "PENDIENTE" ? "(Pendiente)" : expense.reimbursementStatus === "PAGADO" ? "(Pagado)" : ""}:
                                        </small>
                                        <div className="d-flex align-items-center">
                                          <strong className="text-warning" style={{ fontSize: "1rem" }}>
                                            Q {(() => {
                                              const original = parseFloat(expense.messengerAmount) || 0;
                                              const adjustment = reimbursementAdjustments[expense.id];
                                              const adjustmentValue = adjustment && adjustment !== "" ? parseFloat(adjustment) : (parseFloat(expense.reimbursementAdjustment) || 0);
                                              const adjusted = Math.max(0, original + adjustmentValue);
                                              return adjusted.toFixed(2);
                                            })()}
                                          </strong>
                                          {(() => {
                                            const adjustment = reimbursementAdjustments[expense.id];
                                            const adjustmentValue = adjustment && adjustment !== "" ? parseFloat(adjustment) : (parseFloat(expense.reimbursementAdjustment) || 0);
                                            if (adjustmentValue !== 0) {
                                              return (
                                                <Badge
                                                  color={adjustmentValue < 0 ? "success" : "danger"}
                                                  className="ml-2"
                                                  style={{ fontSize: "0.75rem" }}
                                                >
                                                  {adjustmentValue >= 0 ? "+" : ""}Q {Math.abs(adjustmentValue).toFixed(2)}
                                                </Badge>
                                              );
                                            }
                                            return null;
                                          })()}
                                        </div>
                                      </div>
                                    )}
                                    <div className="d-flex justify-content-end flex-wrap" style={{ gap: "0.25rem" }}>
                                      <Button
                                        color="info"
                                        size="sm"
                                        onClick={() => handleViewDetails(expense)}
                                      >
                                        <i className="nc-icon nc-zoom-split mr-1" />
                                        Ver Detalle
                                      </Button>
                                      {canEditPurchaseExpense(selectedPurchaseNumber, expense) && (
                                        <Button
                                          color="warning"
                                          size="sm"
                                          onClick={() => handleEditPurchaseExpense(expense)}
                                        >
                                          <i className="nc-icon nc-ruler-pencil mr-1" />
                                          Editar
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </CardBody>
                              </Card>
                            </Col>
                          );
                        })}
                      </Row>

                      {/* Tabla Resumen */}
                      <div className="table-responsive mt-3">
                        <Table striped hover size="sm">
                          <thead style={{ backgroundColor: "#f8f9fa" }}>
                            <tr>
                              <th>#</th>
                              <th>Número Factura</th>
                              <th>Fecha</th>
                              <th>Proveedor</th>
                              <th>Descripción</th>
                              <th>Monto Total</th>
                              <th>Reembolso</th>
                              <th>Estado Reembolso</th>
                              <th>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {purchaseExpenses.map((expense, idx) => {
                              const reimbursementStatusMap = {
                                PENDIENTE: { color: "warning", text: "Pendiente" },
                                PAGADO: { color: "success", text: "Pagado" },
                                NO_APLICA: { color: "info", text: "COMPLETO" },
                              };
                              const status = reimbursementStatusMap[expense.reimbursementStatus] || { color: "secondary", text: expense.reimbursementStatus || "N/A" };

                              // Calcular reembolso ajustado
                              const originalReimbursement = parseFloat(expense.messengerAmount) || 0;
                              const adjustment = reimbursementAdjustments[expense.id];
                              const adjustmentValue = adjustment && adjustment !== "" ? parseFloat(adjustment) : (parseFloat(expense.reimbursementAdjustment) || 0);
                              const adjustedReimbursement = Math.max(0, originalReimbursement + adjustmentValue);

                              return (
                                <tr key={expense.id}>
                                  <td>{idx + 1}</td>
                                  <td>
                                    <strong>{expense.invoiceNumber}</strong>
                                  </td>
                                  <td>{expense.purchaseDate ? new Date(expense.purchaseDate).toLocaleDateString() : "-"}</td>
                                  <td>{expense.supplier}</td>
                                  <td>
                                    <span style={{ maxWidth: "200px", display: "inline-block" }}>
                                      {expense.description && expense.description.length > 50
                                        ? expense.description.substring(0, 50) + "..."
                                        : expense.description}
                                    </span>
                                  </td>
                                  <td>
                                    <strong>Q {parseFloat(expense.totalAmount || 0).toFixed(2)}</strong>
                                  </td>
                                  <td>
                                    {originalReimbursement > 0 ? (
                                      <div>
                                        <strong className="text-warning">
                                          Q {adjustedReimbursement.toFixed(2)}
                                        </strong>
                                        {adjustmentValue !== 0 && (
                                          <Badge
                                            color={adjustmentValue < 0 ? "success" : "danger"}
                                            className="ml-1"
                                            style={{ fontSize: "0.7rem" }}
                                          >
                                            {adjustmentValue >= 0 ? "+" : ""}Q {Math.abs(adjustmentValue).toFixed(2)}
                                          </Badge>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-muted">-</span>
                                    )}
                                  </td>
                                  <td>
                                    <Badge color={status.color} style={{ border: "1px solid #6c757d" }}>{status.text}</Badge>
                                  </td>
                                  <td>
                                    <div className="d-flex flex-wrap" style={{ gap: "0.25rem" }}>
                                      <Button
                                        color="info"
                                        size="sm"
                                        onClick={() => handleViewDetails(expense)}
                                      >
                                        <i className="nc-icon nc-zoom-split" /> Ver
                                      </Button>
                                      {canEditPurchaseExpense(selectedPurchaseNumber, expense) && (
                                        <Button
                                          color="warning"
                                          size="sm"
                                          onClick={() => handleEditPurchaseExpense(expense)}
                                        >
                                          <i className="nc-icon nc-ruler-pencil" /> Editar
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ backgroundColor: "#f8f9fa", fontWeight: "600" }}>
                              <td colSpan="5" className="text-right">
                                <strong>Total de {selectedPurchaseNumber?.purchaseNumber || "Compra"}{selectedPurchaseNumber?.description ? ` - ${selectedPurchaseNumber.description}` : ""}:</strong>
                              </td>
                              <td>
                                <strong className="text-success" style={{ fontSize: "1.1rem" }}>
                                  Q {purchaseExpenses.reduce((sum, exp) => sum + (parseFloat(exp.totalAmount) || 0), 0).toFixed(2)}
                                </strong>
                              </td>
                              <td colSpan="2"></td>
                            </tr>
                          </tfoot>
                        </Table>
                      </div>
                    </div>
                  )}
                  {selectedPurchaseNumber?.status === "TERMINADO" && (
                    <div className="d-flex justify-content-end mt-3">
                      <Button
                        color="success"
                        onClick={handleFinalizePurchase}
                        disabled={loading}
                      >
                        <i className="nc-icon nc-check-2 mr-1" />
                        Finalizar compra
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            </div>
          ) : (
            <Alert color="warning">
              No se pudieron cargar los detalles de la compra.
            </Alert>
          )}
        </ModalBody>
        <ModalFooter style={{ borderTop: "2px solid #e9ecef", padding: "1rem 1.5rem" }}>
          {selectedPurchaseNumber?.status === "TERMINADO" && (
            <Button
              color="success"
              onClick={handleFinalizePurchase}
              disabled={loading}
              className="mr-auto"
            >
              <i className="nc-icon nc-check-2 mr-1" />
              Finalizar compra
            </Button>
          )}
          <Button
            color="secondary"
            onClick={closePurchaseDetailModal}
            style={{ padding: "0.5rem 1.5rem", fontWeight: "500" }}
          >
            Cerrar
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal para Crear Nueva Compra */}
      <Modal isOpen={showCreatePurchaseModal} toggle={() => setShowCreatePurchaseModal(false)}>
        <ModalHeader toggle={() => setShowCreatePurchaseModal(false)}>
          Nueva Compra
        </ModalHeader>
        <ModalBody>
          <FormGroup>
            <Label>Descripción de la Compra (Opcional)</Label>
            <Input
              type="text"
              value={newPurchaseDescription}
              onChange={(e) => setNewPurchaseDescription(e.target.value)}
              placeholder="Ej: Compra de materiales para oficina"
            />
            <small className="text-muted">
              Se generará automáticamente un número de compra (ej: COMP-00001).
              El total a liquidar se calculará automáticamente desde los artículos que agregue.
            </small>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowCreatePurchaseModal(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" onClick={handleCreatePurchase} disabled={loading}>
            {loading ? "Creando..." : "Crear Compra"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal para Agregar/Editar Artículo */}
      <Modal isOpen={showItemModal} toggle={resetItemModal} size="lg">
        <ModalHeader toggle={resetItemModal} style={{ color: "#212529", fontWeight: 700 }}>
          <span style={{ color: "#212529", fontWeight: 700 }}>
            {editingItem ? "Editar Artículo" : "Agregar Artículos a la Compra"}
          </span>
        </ModalHeader>
        <ModalBody style={ITEM_MODAL_TEXT_STYLE}>
          {!editingItem && (
            <Alert
              color="light"
              className="border mb-3 py-2"
              style={{ fontSize: 13, fontWeight: 500, color: "#212529", backgroundColor: "#f8f9fa" }}
            >
              Complete cada artículo y use <strong>Agregar a la lista</strong> para armar varios sin cerrar el modal.
              Al final pulse <strong>Guardar artículos</strong>.
            </Alert>
          )}
          <Row>
            <Col md="12">
              <FormGroup>
                <Label style={ITEM_MODAL_LABEL_STYLE}>Nombre del Artículo *</Label>
                <Input
                  type="text"
                  style={ITEM_MODAL_TEXT_STYLE}
                  value={itemFormData.itemName}
                  onChange={(e) => setItemFormData({ ...itemFormData, itemName: e.target.value })}
                  placeholder="Ej: Papel A4"
                  required
                />
              </FormGroup>
            </Col>
            <Col md="12">
              <FormGroup>
                <Label style={ITEM_MODAL_LABEL_STYLE}>Descripción</Label>
                <Input
                  type="textarea"
                  rows="2"
                  style={ITEM_MODAL_TEXT_STYLE}
                  value={itemFormData.description}
                  onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
                  placeholder="Descripción detallada del artículo"
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label style={ITEM_MODAL_LABEL_STYLE}>Precio Estimado (por unidad) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  style={ITEM_MODAL_TEXT_STYLE}
                  value={itemFormData.estimatedPrice}
                  onChange={(e) => setItemFormData({ ...itemFormData, estimatedPrice: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label style={ITEM_MODAL_LABEL_STYLE}>Cantidad *</Label>
                <Input
                  type="number"
                  min="1"
                  style={ITEM_MODAL_TEXT_STYLE}
                  value={itemFormData.quantity}
                  onChange={(e) => setItemFormData({ ...itemFormData, quantity: e.target.value })}
                  required
                />
              </FormGroup>
            </Col>
            {calcItemLineTotal(itemFormData.estimatedPrice, itemFormData.quantity) !== null && (
              <Col md="12">
                <Alert color="info" className="mb-0" style={{ fontWeight: 600 }}>
                  <strong>Total de esta línea:</strong>{" "}
                  Q {calcItemLineTotal(itemFormData.estimatedPrice, itemFormData.quantity).toFixed(2)}
                </Alert>
              </Col>
            )}
          </Row>

          {!editingItem && (
            <div className="mt-3 d-flex justify-content-end">
              <Button color="info" outline onClick={handleAddItemToList} disabled={loading}>
                <i className="nc-icon nc-simple-add mr-1" />
                Agregar a la lista
              </Button>
            </div>
          )}

          {!editingItem && pendingItemDrafts.length > 0 && (
            <div className="mt-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0" style={{ fontWeight: 700, color: "#212529" }}>
                  Lista pendiente ({pendingItemDrafts.length})
                </h6>
                <strong className="text-primary" style={{ fontWeight: 700 }}>
                  Total: Q {pendingItemDrafts
                    .reduce((sum, item) => sum + (calcItemLineTotal(item.estimatedPrice, item.quantity) || 0), 0)
                    .toFixed(2)}
                </strong>
              </div>
              <div className="table-responsive">
                <Table striped hover size="sm" className="mb-0" style={ITEM_MODAL_TEXT_STYLE}>
                  <thead style={{ backgroundColor: "#f8f9fa" }}>
                    <tr>
                      <th style={{ fontWeight: 700, color: "#212529" }}>Artículo</th>
                      <th className="text-right" style={{ fontWeight: 700, color: "#212529" }}>P. unit.</th>
                      <th className="text-right" style={{ fontWeight: 700, color: "#212529" }}>Cant.</th>
                      <th className="text-right" style={{ fontWeight: 700, color: "#212529" }}>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingItemDrafts.map((item) => (
                      <tr key={item.tempId}>
                        <td>
                          <strong style={{ fontWeight: 700 }}>{item.itemName}</strong>
                          {item.description && (
                            <>
                              <br />
                              <small className="text-muted" style={{ fontWeight: 500 }}>{item.description}</small>
                            </>
                          )}
                        </td>
                        <td className="text-right" style={{ fontWeight: 600 }}>
                          Q {item.estimatedPrice.toFixed(2)}
                        </td>
                        <td className="text-right" style={{ fontWeight: 600 }}>{item.quantity}</td>
                        <td className="text-right">
                          <strong style={{ fontWeight: 700 }}>
                            Q {(calcItemLineTotal(item.estimatedPrice, item.quantity) || 0).toFixed(2)}
                          </strong>
                        </td>
                        <td className="text-right">
                          <Button
                            color="danger"
                            size="sm"
                            outline
                            onClick={() => handleRemovePendingItem(item.tempId)}
                            disabled={loading}
                          >
                            Quitar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter className="d-flex justify-content-end flex-wrap">
          <div>
            <Button color="secondary" onClick={resetItemModal} disabled={loading} className="mr-2">
              Cancelar
            </Button>
            <Button color="primary" onClick={handleCreateItem} disabled={loading}>
              {loading
                ? "Guardando..."
                : editingItem
                  ? "Actualizar"
                  : pendingItemDrafts.length > 0
                    ? `Guardar ${pendingItemDrafts.length} artículo(s)`
                    : "Guardar artículo"}
            </Button>
          </div>
        </ModalFooter>
      </Modal>

      {/* Modal de Compensación */}
      <Modal isOpen={showCompensationModal} toggle={() => setShowCompensationModal(false)} size="md">
        <ModalHeader toggle={() => setShowCompensationModal(false)}>
          <i className="nc-icon nc-refresh-69 mr-2" />
          {compensationForm.sourcePurchaseId ? "Ceder Sobrante" : "Recibir Compensación"}
        </ModalHeader>
        <ModalBody>
          {compensationForm.sourcePurchaseId ? (
            <>
              <Alert color="info" className="py-2">
                <strong>Origen:</strong> {selectedPurchaseNumber?.purchaseNumber}
                {selectedPurchaseNumber?.description ? ` — ${selectedPurchaseNumber.description}` : ""}
                <br />
                <small>Sobrante disponible: <strong>Q {parseFloat(selectedPurchaseNumber?.netBalance || 0).toFixed(2)}</strong></small>
              </Alert>
              <FormGroup>
                <Label>Compra destino (la que recibirá el dinero) *</Label>
                <Input
                  type="select"
                  value={compensationForm.targetPurchaseId}
                  onChange={(e) => setCompensationForm(prev => ({ ...prev, targetPurchaseId: e.target.value }))}
                >
                  <option value="">Seleccione una compra...</option>
                  {allPurchaseNumbers
                    .filter(p => p.id !== selectedPurchaseNumber?.id)
                    .map(p => {
                      const nb = parseFloat(p.netBalance || 0);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.purchaseNumber} — {p.description || "Sin descripción"}
                          {nb < 0 ? ` (Faltante: Q${Math.abs(nb).toFixed(2)})` : ` (Saldo: Q${nb.toFixed(2)})`}
                        </option>
                      );
                    })}
                </Input>
              </FormGroup>
            </>
          ) : (
            <>
              <Alert color="info" className="py-2">
                <strong>Destino:</strong> {selectedPurchaseNumber?.purchaseNumber}
                {selectedPurchaseNumber?.description ? ` — ${selectedPurchaseNumber.description}` : ""}
                <br />
                <small>Faltante: <strong>Q {Math.abs(parseFloat(selectedPurchaseNumber?.netBalance || 0)).toFixed(2)}</strong></small>
              </Alert>
              <FormGroup>
                <Label>Compra origen (la que cederá sobrante) *</Label>
                <Input
                  type="select"
                  value={compensationForm.sourcePurchaseId}
                  onChange={(e) => setCompensationForm(prev => ({ ...prev, sourcePurchaseId: e.target.value }))}
                >
                  <option value="">Seleccione una compra con sobrante...</option>
                  {allPurchaseNumbers
                    .filter(p => p.id !== selectedPurchaseNumber?.id && parseFloat(p.netBalance || 0) > 0)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.purchaseNumber} — {p.description || "Sin descripción"}
                        {" "}(Sobrante: Q{parseFloat(p.netBalance || 0).toFixed(2)})
                      </option>
                    ))}
                </Input>
              </FormGroup>
            </>
          )}
          <FormGroup>
            <Label>Monto a compensar (Q) *</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={compensationForm.amount}
              onChange={(e) => setCompensationForm(prev => ({ ...prev, amount: e.target.value }))}
              placeholder="0.00"
            />
          </FormGroup>
          <FormGroup>
            <Label>Descripción / Motivo</Label>
            <Input
              type="text"
              value={compensationForm.description}
              onChange={(e) => setCompensationForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Ej: Sobrante de compra de materiales"
            />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowCompensationModal(false)}>
            Cancelar
          </Button>
          <Button
            color="primary"
            disabled={!compensationForm.sourcePurchaseId || !compensationForm.targetPurchaseId || !compensationForm.amount || loading}
            onClick={async () => {
              try {
                setLoading(true);
                await createCompensation({
                  sourcePurchaseId: parseInt(compensationForm.sourcePurchaseId),
                  targetPurchaseId: parseInt(compensationForm.targetPurchaseId),
                  amount: parseFloat(compensationForm.amount),
                  description: compensationForm.description || null,
                });
                showSuccess("Compensación registrada correctamente");
                setShowCompensationModal(false);
                // Recargar datos
                handleViewPurchaseDetails(selectedPurchaseNumber.id, selectedPurchaseNumber.purchaseNumber);
                loadAllPurchaseNumbers();
              } catch (err) {
                showError(err.message);
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Guardando..." : "Registrar Compensación"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default GastosMenoresPage;

