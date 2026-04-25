/*!
=========================================================
* Paper Dashboard PRO React - v1.3.2
=========================================================
* Product Page: https://www.creative-tim.com/product/paper-dashboard-pro-react
* Copyright 2023 Creative Tim (https://www.creative-tim.com)
* Coded by Creative Tim
=========================================================
*/

// Dashboards
import ProductionDashboard from "views/production/ProductionDashboard.js";
import SalesDashboard from "views/sales/SalesDashboard.js";

// Seguridad & Usuarios
import UsersList from "views/admin/UsersList.js";
import RolesList from "views/admin/RolesList.js";
import PermissionsList from "views/admin/PermissionsList.js";
import UserRolesForm from "views/admin/UserRolesForm.js";
import RolePermissionsForm from "views/admin/RolePermissionsForm.js";
import PermissionsOverview from "views/admin/PermissionsOverview.js";
import PermissionsMatrix from "views/admin/PermissionsMatrix.js";

// Organización
import DepartmentsList from "views/organization/DepartmentsList.js";
import CostCentersList from "views/organization/CostCentersList.js";
import OperationalUnitsList from "views/organization/OperationalUnitsList.js";
import EmployeesList from "views/organization/EmployeesList.js";

// Catálogos Base
import UomList from "views/catalogs/UomList.js";
import ProductCategoriesList from "views/catalogs/ProductCategoriesList.js";
import ColorsList from "views/catalogs/ColorsList.js";
import LocationsList from "views/catalogs/LocationsList.js";

// Materiales
import MaterialsList from "views/materials/MaterialsList.js";
import MaterialsInventory from "views/materials/MaterialsInventory.js";
import MaterialsKardex from "views/materials/MaterialsKardex.js";
import MaterialColorsList from "views/materials/MaterialColorsList.js";
import LeatherInventory from "views/materials/LeatherInventory.js";

// Productos
import ProductsList from "views/products/ProductsList.js";
import BomList from "views/products/BomList.js";
import BomItemsList from "views/products/BomItemsList.js";
import ProductionTimes from "views/products/ProductionTimes.js";
import ProductPrices from "views/products/ProductPrices.js";

// Producción
import ProductionOrdersList from "views/production/ProductionOrdersList.js";
import DailyProductionPlan from "views/production/DailyProductionPlan.js";
import TasksByTable from "views/production/TasksByTable.js";
import ProductionPhaseTrays from "views/production/ProductionPhaseTrays.js";
import ProductionTraceability from "views/production/ProductionTraceability.js";
import MaterialsTasksView from "views/production/MaterialsTasksView.js";
import WarehouseView from "views/production/WarehouseView.js";

// Inventarios
import InventoryByLocation from "views/inventory/InventoryByLocation.js";
import ProductInventoryByLocation from "views/inventory/ProductInventoryByLocation.js";
import MaterialInventoryKardex from "views/inventory/MaterialInventoryKardex.js";
import InventoryKardex from "views/inventory/InventoryKardex.js";
import InventoryTransfers from "views/inventory/InventoryTransfers.js";
import InventoryAdjustments from "views/inventory/InventoryAdjustments.js";
import CriticalInventory from "views/inventory/CriticalInventory.js";
import InventoryLocationTypes from "views/inventory/InventoryLocationTypes.js";
import PublicMaterialKardexMobile from "views/public/PublicMaterialKardexMobile.js";

// Distribuciones
import ProductDistributions from "views/distribution/ProductDistributions.js";
import ProductDistributionDetail from "views/distribution/ProductDistributionDetail.js";

// Compras
import MaterialRequestsList from "views/purchases/MaterialRequestsList.js";
import MaterialRequestForm from "views/purchases/MaterialRequestForm.js";
import MaterialRequestsReview from "views/purchases/MaterialRequestsReview.js";
import PurchaseOrdersList from "views/purchases/PurchaseOrdersList.js";
import PurchaseOrderDetail from "views/purchases/PurchaseOrderDetail.js";
import MaterialReceipts from "views/purchases/MaterialReceipts.js";
import GastosMenoresPage from "views/purchases/GastosMenoresPage.js";
import AccountingEntries from "views/purchases/AccountingEntries.js";
import StockIntelligenceDashboard from "views/purchases/StockIntelligenceDashboard.js";
import MaterialConsumptionHistory from "views/purchases/MaterialConsumptionHistory.js";

// Distribución
import PrepareShipments from "views/distribution/PrepareShipments.js";
import ShipmentsInTransit from "views/distribution/ShipmentsInTransit.js";
import ReceiptConfirmation from "views/distribution/ReceiptConfirmation.js";

// Kioscos
import KioskInventory from "views/kiosks/KioskInventory.js";
import KioskSales from "views/kiosks/KioskSales.js";
import KioskReturns from "views/kiosks/KioskReturns.js";

// Ventas
import TotalSales from "views/sales/TotalSales.js";
import SalesBySeller from "views/sales/SalesBySeller.js";
import OnlineSales from "views/sales/OnlineSales.js";
import Invoicing from "views/sales/Invoicing.js";

// Reportes
import ProductionReports from "views/reports/ProductionReports.js";
import InventoryReports from "views/reports/InventoryReports.js";
import SalesReports from "views/reports/SalesReports.js";
import CostReports from "views/reports/CostReports.js";
import KioskPerformance from "views/reports/KioskPerformance.js";
import PurchaseReports from "views/reports/PurchaseReports.js";
import PhaseGeneralReports from "views/reports/PhaseGeneralReports.js";

// Configuración General
import CurrenciesList from "views/catalogs/CurrenciesList.js";
import CustomersList from "views/customers/CustomersList.js";
import SuppliersList from "views/suppliers/SuppliersList.js";
import Taxes from "views/config/Taxes.js";
import DocumentSeries from "views/config/DocumentSeries.js";
import PrintFormats from "views/config/PrintFormats.js";
import EmailConfig from "views/config/EmailConfig.js";
import NotificationsConfig from "views/config/Notifications.js";
import SystemSettings from "views/config/SystemSettings.js";
import AccountingAccounts from "views/config/AccountingAccounts.js";
import SmartPurchasingConfig from "views/config/SmartPurchasingConfig.js";

// Páginas de Autenticación
import Login from "views/pages/Login.js";
import Register from "views/pages/Register.js";
import LockScreen from "views/pages/LockScreen.js";

const routes = [
  // RUTAS DE AUTENTICACIÓN
  {
    path: "/login",
    name: "Login",
    component: <Login />,
    layout: "/auth",
    showInSidebar: false,
  },
  {
    path: "/register",
    name: "Register",
    component: <Register />,
    layout: "/auth",
    showInSidebar: false,
  },
  {
    path: "/lock-screen",
    name: "Lock Screen",
    component: <LockScreen />,
    layout: "/auth",
    showInSidebar: false,
  },
  // RUTAS DEL ADMIN
  // 1. DASHBOARDS
  {
    collapse: true,
    name: "Dashboards",
    icon: "nc-icon nc-chart-bar-32",
    state: "dashboardsCollapse",
    module: "DASHBOARDS",
    views: [
      {
        path: "/dashboard-production",
        name: "Producción",
        mini: "DP",
        component: <ProductionDashboard />,
        layout: "/admin",
        module: "DASHBOARDS",
        permissions: {
          view: "DASHBOARDS.PRODUCCION.VER",
        },
      },
      {
        path: "/dashboard-sales",
        name: "Ventas",
        mini: "DV",
        component: <SalesDashboard />,
        layout: "/admin",
        module: "DASHBOARDS",
        permissions: {
          view: "DASHBOARDS.VENTAS.VER",
        },
      },
    ],
  },
  // 2. SEGURIDAD & USUARIOS
  {
    collapse: true,
    name: "Seguridad & Usuarios",
    icon: "nc-icon nc-key-25",
    state: "securityCollapse",
    views: [
      {
        path: "/users",
        name: "Usuarios",
        mini: "U",
        component: <UsersList />,
        layout: "/admin",
        permissions: {
          view: "SEGURIDAD.USUARIOS.VER",
          create: "SEGURIDAD.USUARIOS.CREAR",
          edit: "SEGURIDAD.USUARIOS.EDITAR",
          delete: "SEGURIDAD.USUARIOS.ELIMINAR",
        },
      },
      {
        path: "/roles",
        name: "Roles",
        mini: "R",
        component: <RolesList />,
        layout: "/admin",
        permissions: {
          view: "SEGURIDAD.ROLES.VER",
          create: "SEGURIDAD.ROLES.CREAR",
          edit: "SEGURIDAD.ROLES.EDITAR",
          delete: "SEGURIDAD.ROLES.ELIMINAR",
        },
      },
      {
        path: "/permissions",
        name: "Permisos",
        mini: "P",
        component: <PermissionsList />,
        layout: "/admin",
        permissions: {
          view: "SEGURIDAD.PERMISOS.VER",
          create: "SEGURIDAD.PERMISOS.CREAR",
          edit: "SEGURIDAD.PERMISOS.EDITAR",
          delete: "SEGURIDAD.PERMISOS.ELIMINAR",
        },
      },
      {
        path: "/user-roles",
        name: "Asignar Roles",
        mini: "AR",
        component: <UserRolesForm />,
        layout: "/admin",
        permissions: {
          view: "SEGURIDAD.USUARIOS.VER",
          create: "SEGURIDAD.USUARIOS.CREAR",
          edit: "SEGURIDAD.USUARIOS.EDITAR",
          delete: "SEGURIDAD.USUARIOS.ELIMINAR",
        },
      },  
      {
        path: "/role-permissions",
        name: "Asignar Permisos",
        mini: "AP",
        component: <RolePermissionsForm />,
        layout: "/admin",
        permissions: {
          view: "SEGURIDAD.PERMISOS.VER",
          create: "SEGURIDAD.PERMISOS.CREAR",
          edit: "SEGURIDAD.PERMISOS.EDITAR",
          delete: "SEGURIDAD.PERMISOS.ELIMINAR",
        },
      },
      {
        path: "/permissions-overview",
        name: "Vista de Permisos",
        mini: "VP",
        component: <PermissionsOverview />,
        layout: "/admin",
        module: "SEGURIDAD",
        permissions: {
          view: "SEGURIDAD.PERMISOS.VER",
        },
      },
      {
        path: "/permissions-matrix",
        name: "Matriz de Permisos",
        mini: "MP",
        component: <PermissionsMatrix />,
        layout: "/admin",
        module: "SEGURIDAD",
        permissions: {
          view: "SEGURIDAD.PERMISOS.VER",
        },
      },
    ],
  },
  // 3. ORGANIZACIÓN
  {
    collapse: true,
    name: "Organización",
    icon: "nc-icon nc-briefcase-24",
    state: "organizationCollapse",
    module: "ORGANIZACION",
    views: [
      {
        path: "/departments",
        name: "Departamentos",
        mini: "D",
        component: <DepartmentsList />,
        layout: "/admin",
        module: "ORGANIZACION",
        permissions: {
          view: "ORGANIZACION.DEPARTAMENTOS.VER",
          create: "ORGANIZACION.DEPARTAMENTOS.CREAR",
          edit: "ORGANIZACION.DEPARTAMENTOS.EDITAR",
          delete: "ORGANIZACION.DEPARTAMENTOS.ELIMINAR",
        },
      },
      {
        path: "/cost-centers",
        name: "Centros de Costo",
        mini: "CC",
        component: <CostCentersList />,
        layout: "/admin",
        module: "ORGANIZACION",
        permissions: {
          view: "ORGANIZACION.CENTROS_COSTO.VER",
          create: "ORGANIZACION.CENTROS_COSTO.CREAR",
          edit: "ORGANIZACION.CENTROS_COSTO.EDITAR",
          delete: "ORGANIZACION.CENTROS_COSTO.ELIMINAR",
        },
      },
      {
        path: "/operational-units",
        name: "Unidades Operativas",
        mini: "UO",
        component: <OperationalUnitsList />,
        layout: "/admin",
        module: "ORGANIZACION",
        permissions: {
          view: "ORGANIZACION.UNIDADES_OPERATIVAS.VER",
          create: "ORGANIZACION.UNIDADES_OPERATIVAS.CREAR",
          edit: "ORGANIZACION.UNIDADES_OPERATIVAS.EDITAR",
          delete: "ORGANIZACION.UNIDADES_OPERATIVAS.ELIMINAR",
        },
      },
      {
        path: "/employees",
        name: "Empleados",
        mini: "E",
        component: <EmployeesList />,
        layout: "/admin",
        module: "ORGANIZACION",
        permissions: {
          view: "ORGANIZACION.EMPLEADOS.VER",
          create: "ORGANIZACION.EMPLEADOS.CREAR",
          edit: "ORGANIZACION.EMPLEADOS.EDITAR",
          delete: "ORGANIZACION.EMPLEADOS.ELIMINAR",
        },
      },
    ],
  },
  // 4. CATÁLOGOS BASE
  {
    collapse: true,
    name: "Catálogos Base",
    icon: "nc-icon nc-book-bookmark",
    state: "catalogsCollapse",
    module: "CATALOGOS",
    views: [
      {
        path: "/uom",
        name: "Unidades de Medida",
        mini: "UOM",
        component: <UomList />,
        layout: "/admin",
        module: "CATALOGOS",
        permissions: {
          view: "CATALOGOS.UNIDADES_MEDIDA.VER",
          create: "CATALOGOS.UNIDADES_MEDIDA.CREAR",
          edit: "CATALOGOS.UNIDADES_MEDIDA.EDITAR",
          delete: "CATALOGOS.UNIDADES_MEDIDA.ELIMINAR",
        },
      },
      {
        path: "/product-categories",
        name: "Categorías de Producto",
        mini: "CP",
        component: <ProductCategoriesList />,
        layout: "/admin",
        module: "CATALOGOS",
        permissions: {
          view: "CATALOGOS.CATEGORIAS_PRODUCTO.VER",
          create: "CATALOGOS.CATEGORIAS_PRODUCTO.CREAR",
          edit: "CATALOGOS.CATEGORIAS_PRODUCTO.EDITAR",
          delete: "CATALOGOS.CATEGORIAS_PRODUCTO.ELIMINAR",
        },
      },
      {
        path: "/colors",
        name: "Colores",
        mini: "C",
        component: <ColorsList />,
        layout: "/admin",
        module: "CATALOGOS",
        permissions: {
          view: "CATALOGOS.COLORES.VER",
          create: "CATALOGOS.COLORES.CREAR",
          edit: "CATALOGOS.COLORES.EDITAR",
          delete: "CATALOGOS.COLORES.ELIMINAR",
        },
      },
      {
        path: "/kioscos",
        name: "Kioscos",
        mini: "K",
        component: <LocationsList />,
        layout: "/admin",
        module: "CATALOGOS",
        permissions: {
          view: "CATALOGOS.KIOSCOS.VER",
          create: "CATALOGOS.KIOSCOS.CREAR",
          edit: "CATALOGOS.KIOSCOS.EDITAR",
          delete: "CATALOGOS.KIOSCOS.ELIMINAR",
        },
      },
      {
        path: "/currencies",
        name: "Monedas",
        mini: "M",
        component: <CurrenciesList />,
        layout: "/admin",
        module: "CATALOGOS",
        permissions: {
          view: "CATALOGOS.MONEDAS.VER",
          create: "CATALOGOS.MONEDAS.CREAR",
          edit: "CATALOGOS.MONEDAS.EDITAR",
          delete: "CATALOGOS.MONEDAS.ELIMINAR",
        },
      },
      {
        path: "/customers",
        name: "Clientes",
        mini: "CL",
        component: <CustomersList />,
        layout: "/admin",
        module: "CATALOGOS",
        permissions: {
          view: "CATALOGOS.CLIENTES.VER",
          create: "CATALOGOS.CLIENTES.CREAR",
          edit: "CATALOGOS.CLIENTES.EDITAR",
          delete: "CATALOGOS.CLIENTES.ELIMINAR",
        },
      },
      {
        path: "/suppliers",
        name: "Proveedores",
        mini: "PR",
        component: <SuppliersList />,
        layout: "/admin",
        module: "CATALOGOS",
        permissions: {
          view: "CATALOGOS.PROVEEDORES.VER",
          create: "CATALOGOS.PROVEEDORES.CREAR",
          edit: "CATALOGOS.PROVEEDORES.EDITAR",
          delete: "CATALOGOS.PROVEEDORES.ELIMINAR",
        },
      },
    ],
  },
  // 5. MATERIALES
  {
    collapse: true,
    name: "Materiales",
    icon: "nc-icon nc-box-2",
    state: "materialsCollapse",
    module: "MATERIALES",
    views: [
      {
        path: "/materials",
        name: "Materiales",
        mini: "M",
        component: <MaterialsList />,
        layout: "/admin",
        module: "MATERIALES",
        permissions: {
          view: "MATERIALES.MATERIALES.VER",
          create: "MATERIALES.MATERIALES.CREAR",
          edit: "MATERIALES.MATERIALES.EDITAR",
          delete: "MATERIALES.MATERIALES.ELIMINAR",
        },
      },
      {
        path: "/material-colors",
        name: "Colores de Materiales",
        mini: "CM",
        component: <MaterialColorsList />,
        layout: "/admin",
        module: "MATERIALES",
        permissions: {
          view: "MATERIALES.COLORES_MATERIALES.VER",
          create: "MATERIALES.COLORES_MATERIALES.CREAR",
          edit: "MATERIALES.COLORES_MATERIALES.EDITAR",
          delete: "MATERIALES.COLORES_MATERIALES.ELIMINAR",
        },
      },
      {
        path: "/leather-inventory",
        name: "Control de Cuero",
        mini: "CC",
        component: <LeatherInventory />,
        layout: "/admin",
        module: "MATERIALES",
        permissions: {
          view: "MATERIALES.CONTROL_CUERO.VER",
          create: "MATERIALES.CONTROL_CUERO.CREAR",
        },
      },
      {
        path: "/materials-tasks",
        name: "Entrega de Materiales",
        mini: "EM",
        component: <MaterialsTasksView />,
        layout: "/admin",
        module: "MATERIALES",
        permissions: {
          view: "PRODUCCION.VISTA_MATERIALES.VER",
        },
      },
    ],
  },
  // 6. PRODUCTOS
  {
    collapse: true,
    name: "Productos",
    icon: "nc-icon nc-bag-16",
    state: "productsCollapse",
    module: "PRODUCTOS",
    views: [
      {
        path: "/products",
        name: "Productos",
        mini: "P",
        component: <ProductsList />,
        layout: "/admin",
        module: "PRODUCTOS",
        permissions: {
          view: "PRODUCTOS.PRODUCTOS.VER",
          create: "PRODUCTOS.PRODUCTOS.CREAR",
          edit: "PRODUCTOS.PRODUCTOS.EDITAR",
          delete: "PRODUCTOS.PRODUCTOS.ELIMINAR",
        },
      },
      {
        path: "/bom",
        name: "BOM (Bill of Materials)",
        mini: "BOM",
        component: <BomList />,
        layout: "/admin",
        module: "PRODUCTOS",
        permissions: {
          view: "PRODUCTOS.BOM.VER",
          create: "PRODUCTOS.BOM.CREAR",
          edit: "PRODUCTOS.BOM.EDITAR",
          delete: "PRODUCTOS.BOM.ELIMINAR",
        },
      },
      {
        path: "/bom-items",
        name: "BOM Items",
        mini: "BI",
        component: <BomItemsList />,
        layout: "/admin",
        module: "PRODUCTOS",
        permissions: {
          view: "PRODUCTOS.BOM_ITEMS.VER",
          create: "PRODUCTOS.BOM_ITEMS.CREAR",
          edit: "PRODUCTOS.BOM_ITEMS.EDITAR",
          delete: "PRODUCTOS.BOM_ITEMS.ELIMINAR",
        },
      },
      {
        path: "/production-times",
        name: "Tiempos de Producción",
        mini: "TP",
        component: <ProductionTimes />,
        layout: "/admin",
        module: "PRODUCTOS",
        permissions: {
          view: "PRODUCTOS.TIEMPOS_PRODUCCION.VER",
          create: "PRODUCTOS.TIEMPOS_PRODUCCION.CREAR",
          edit: "PRODUCTOS.TIEMPOS_PRODUCCION.EDITAR",
          delete: "PRODUCTOS.TIEMPOS_PRODUCCION.ELIMINAR",
        },
      },
      {
        path: "/product-prices",
        name: "Precios de Productos",
        mini: "PP",
        component: <ProductPrices />,
        layout: "/admin",
        module: "PRODUCTOS",
        permissions: {
          view: "PRODUCTOS.PRECIOS_PRODUCTOS.VER",
          create: "PRODUCTOS.PRECIOS_PRODUCTOS.CREAR",
          edit: "PRODUCTOS.PRECIOS_PRODUCTOS.EDITAR",
          delete: "PRODUCTOS.PRECIOS_PRODUCTOS.ELIMINAR",
        },
      },
    ],
  },
  // 7. PRODUCCIÓN
  {
    collapse: true,
    name: "Producción",
    icon: "nc-icon nc-spaceship",
    state: "productionCollapse",
    module: "PRODUCCION",
    views: [
      {
        path: "/production-orders",
        name: "Órdenes de Producción",
        mini: "PO",
        component: <ProductionOrdersList />,
        layout: "/admin",
        module: "PRODUCCION",
        permissions: {
          view: "PRODUCCION.ORDENES_PRODUCCION.VER",
          create: "PRODUCCION.ORDENES_PRODUCCION.CREAR",
          edit: "PRODUCCION.ORDENES_PRODUCCION.EDITAR",
          delete: "PRODUCCION.ORDENES_PRODUCCION.ELIMINAR",
        },
      },
      {
        path: "/daily-production-plan",
        name: "Plan de Producción Diario",
        mini: "PPD",
        component: <DailyProductionPlan />,
        layout: "/admin",
        module: "PRODUCCION",
        showInSidebar: false,
        permissions: {
          view: "PRODUCCION.PLAN_PRODUCCION_DIARIO.VER",
          create: "PRODUCCION.PLAN_PRODUCCION_DIARIO.CREAR",
          edit: "PRODUCCION.PLAN_PRODUCCION_DIARIO.EDITAR",
        },
      },
      {
        path: "/production-phase-trays",
        name: "Bandejas por Fase",
        mini: "BF",
        component: <ProductionPhaseTrays />,
        layout: "/admin",
        module: "PRODUCCION",
        showInSidebar: false,
        permissions: {
          view: "PRODUCCION.ORDENES_PRODUCCION.VER",
        },
      },
      {
        path: "/tasks-by-station",
        name: "Centro de Producción",
        mini: "CP",
        component: <TasksByTable />,
        layout: "/admin",
        module: "PRODUCCION",
        permissions: {
          view: "PRODUCCION.TAREAS_ESTACION.VER",
        },
      },
      {
        path: "/warehouse-view",
        name: "Bodega Prod. Terminado",
        mini: "BPT",
        component: <WarehouseView />,
        layout: "/admin",
        module: "PRODUCCION",
        permissions: {
          view: "PRODUCCION.BODEGA_PRODUCTO_TERMINADO.VER",
          create: "PRODUCCION.BODEGA_PRODUCTO_TERMINADO.DESPACHAR",
        },
      },
      {
        path: "/production-traceability",
        name: "Trazabilidad por OP",
        mini: "TOP",
        component: <ProductionTraceability />,
        layout: "/admin",
        module: "PRODUCCION",
        showInSidebar: false,
        permissions: {
          view: "PRODUCCION.ORDENES_PRODUCCION.VER",
        },
      },
    ],
  },
  // 9. INVENTARIOS
  {
    collapse: true,
    name: "Inventarios",
    icon: "nc-icon nc-box",
    state: "inventoryCollapse",
    module: "INVENTARIOS",
    views: [
      {
        path: "/inventory-materials",
        name: "Inventario Materiales",
        mini: "IM",
        component: <InventoryByLocation />,
        layout: "/admin",
        module: "INVENTARIOS",
        permissions: {
          view: "INVENTARIOS.MATERIALES.VER",
        },
      },
      {
        path: "/product-inventory-by-location",
        name: "Inventario Productos",
        mini: "IP",
        component: <ProductInventoryByLocation />,
        layout: "/admin",
        module: "INVENTARIOS",
        permissions: {
          view: "INVENTARIOS.PRODUCTOS.VER",
        },
      },
      {
        path: "/material-inventory-kardex",
        name: "Kardex Materiales",
        mini: "KM",
        component: <MaterialInventoryKardex />,
        layout: "/admin",
        module: "INVENTARIOS",
        showInSidebar: false,
        permissions: {
          view: "INVENTARIOS.KARDEX_MATERIALES.VER",
        },
      },
      {
        path: "/materials-kardex",
        name: "Escaneo Kardex",
        mini: "EK",
        component: <PublicMaterialKardexMobile />,
        layout: "/admin",
        module: "INVENTARIOS",
        permissions: {
          view: "INVENTARIOS.KARDEX_MATERIALES.VER",
        },
      },
      {
        path: "/inventory-kardex",
        name: "Kardex Productos",
        mini: "KP",
        component: <InventoryKardex />,
        layout: "/admin",
        module: "INVENTARIOS",
        showInSidebar: false,
        permissions: {
          view: "INVENTARIOS.KARDEX_PRODUCTOS.VER",
        },
      },
      {
        path: "/inventory-transfers",
        name: "Transferencias",
        mini: "T",
        component: <InventoryTransfers />,
        layout: "/admin",
        module: "INVENTARIOS",
        showInSidebar: false,
        permissions: {
          view: "INVENTARIOS.TRANSFERENCIAS.VER",
          create: "INVENTARIOS.TRANSFERENCIAS.CREAR",
        },
      },
      {
        path: "/inventory-adjustments",
        name: "Ajustes de Inventario",
        mini: "AI",
        component: <InventoryAdjustments />,
        layout: "/admin",
        module: "INVENTARIOS",
        permissions: {
          // Permisos para sincronización (se usa el primero si hay múltiples)
          view: "INVENTARIOS.AJUSTES_MATERIALES.VER",
          create: "INVENTARIOS.AJUSTES_MATERIALES.CREAR",
          edit: "INVENTARIOS.AJUSTES_MATERIALES.EDITAR",
          // Permisos específicos para el componente (puede tener ambos)
          materialsView: "INVENTARIOS.AJUSTES_MATERIALES.VER",
          materialsCreate: "INVENTARIOS.AJUSTES_MATERIALES.CREAR",
          materialsEdit: "INVENTARIOS.AJUSTES_MATERIALES.EDITAR",
          productsView: "INVENTARIOS.AJUSTES_PRODUCTOS.VER",
          productsCreate: "INVENTARIOS.AJUSTES_PRODUCTOS.CREAR",
          productsEdit: "INVENTARIOS.AJUSTES_PRODUCTOS.EDITAR",
        },
      },
      {
        path: "/inventory-location-types",
        name: "Tipos Ubicación",
        mini: "TU",
        component: <InventoryLocationTypes />,
        layout: "/admin",
        module: "INVENTARIOS",
        permissions: {
          view: "INVENTARIOS.TIPOS_UBICACION.VER",
          create: "INVENTARIOS.TIPOS_UBICACION.CREAR",
          edit: "INVENTARIOS.TIPOS_UBICACION.EDITAR",
          delete: "INVENTARIOS.TIPOS_UBICACION.ELIMINAR",
        },
      },
      {
        path: "/critical-inventory",
        name: "Inventario Crítico",
        mini: "IC",
        component: <CriticalInventory />,
        layout: "/admin",
        module: "INVENTARIOS",
        permissions: {
          view: "INVENTARIOS.INVENTARIO_CRITICO.VER",
        },
      },
    ],
  },
  // 10. COMPRAS
  {
    collapse: true,
    name: "Compras",
    icon: "nc-icon nc-cart-simple",
    state: "purchasesCollapse",
    module: "COMPRAS",
    views: [
      {
        path: "/material-requests",
        name: "Mis Solicitudes",
        mini: "MS",
        component: <MaterialRequestsList />,
        layout: "/admin",
        module: "COMPRAS",
        permissions: {
          view: "COMPRAS.SOLICITUDES.VER",
          create: "COMPRAS.SOLICITUDES.CREAR",
          edit: "COMPRAS.SOLICITUDES.EDITAR",
          delete: "COMPRAS.SOLICITUDES.ELIMINAR",
        },
      },
      {
        path: "/material-requests-review",
        name: "Revisar Solicitudes",
        mini: "RS",
        component: <MaterialRequestsReview />,
        layout: "/admin",
        module: "COMPRAS",
        permissions: {
          view: "COMPRAS.SOLICITUDES.VER",
          approve: "COMPRAS.SOLICITUDES.APROBAR",
        },
      },
      {
        path: "/purchase-orders",
        name: "Órdenes de Compra",
        mini: "OC",
        component: <PurchaseOrdersList />,
        layout: "/admin",
        module: "COMPRAS",
        permissions: {
          view: "COMPRAS.ORDENES.VER",
          create: "COMPRAS.ORDENES.CREAR",
          approve: "COMPRAS.ORDENES.APROBAR",
        },
      },
      {
        path: "/material-receipts",
        name: "Recepción de Materiales",
        mini: "RM",
        component: <MaterialReceipts />,
        layout: "/admin",
        module: "COMPRAS",
        permissions: {
          view: "COMPRAS.RECEPCION_MATERIALES.VER",
          create: "COMPRAS.RECEPCION_MATERIALES.CREAR",
        },
      },
      {
        path: "/minor-expenses",
        name: "Gastos Menores y Mensajería",
        mini: "GM",
        component: <GastosMenoresPage />,
        layout: "/admin",
        module: "COMPRAS",
        permissions: {
          view: "COMPRAS.GASTOS_MENORES.VER",
          create: "COMPRAS.GASTOS_MENORES.CREAR",
          edit: "COMPRAS.GASTOS_MENORES.EDITAR",
        },
      },
      {
        path: "/accounting-entries",
        name: "Asientos Contables",
        mini: "AC",
        component: <AccountingEntries />,
        layout: "/admin",
        module: "COMPRAS",
        permissions: {
          view: "COMPRAS.ASIENTOS_CONTABLES.VER",
          create: "COMPRAS.ASIENTOS_CONTABLES.CREAR",
        },
      },
      {
        path: "/stock-intelligence",
        name: "Inteligencia de Stock",
        mini: "IS",
        component: <StockIntelligenceDashboard />,
        layout: "/admin",
        module: "COMPRAS",
        permissions: {
          view: "COMPRAS.INTELIGENCIA_STOCK.VER",
        },
      },
      {
        path: "/consumption-history",
        name: "Historial de Consumo",
        mini: "HC",
        component: <MaterialConsumptionHistory />,
        layout: "/admin",
        module: "COMPRAS",
        permissions: {
          view: "COMPRAS.HISTORIAL_CONSUMO.VER",
        },
      },
    ],
  },
  // 11. DISTRIBUCIÓN
  {
    collapse: true,
    name: "Distribución",
    icon: "nc-icon nc-delivery-fast",
    state: "distributionCollapse",
    module: "DISTRIBUCION",
    views: [
      {
        path: "/product-distributions",
        name: "Distribuciones",
        mini: "D",
        component: <ProductDistributions />,
        layout: "/admin",
        module: "DISTRIBUCION",
        permissions: {
          view: "DISTRIBUCION.DISTRIBUCIONES.VER",
          create: "DISTRIBUCION.DISTRIBUCIONES.CREAR",
          edit: "DISTRIBUCION.DISTRIBUCIONES.EDITAR",
        },
      },
      {
        path: "/product-distributions/new",
        name: "Nueva Distribución",
        mini: "ND",
        component: <ProductDistributionDetail />,
        layout: "/admin",
        module: "DISTRIBUCION",
        permissions: {
          view: "DISTRIBUCION.DISTRIBUCIONES.VER",
          create: "DISTRIBUCION.DISTRIBUCIONES.CREAR",
        },
      },
      {
        path: "/product-distributions/:id",
        name: "Detalle Distribución",
        mini: "DD",
        component: <ProductDistributionDetail />,
        layout: "/admin",
        module: "DISTRIBUCION",
        permissions: {
          view: "DISTRIBUCION.DISTRIBUCIONES.VER",
          edit: "DISTRIBUCION.DISTRIBUCIONES.EDITAR",
        },
      },
      {
        path: "/prepare-shipments",
        name: "Preparar Envíos",
        mini: "PE",
        component: <PrepareShipments />,
        layout: "/admin",
        module: "DISTRIBUCION",
        permissions: {
          view: "DISTRIBUCION.PREPARAR_ENVIOS.VER",
          create: "DISTRIBUCION.PREPARAR_ENVIOS.CREAR",
        },
      },
      {
        path: "/shipments-in-transit",
        name: "Envíos en Tránsito",
        mini: "ET",
        component: <ShipmentsInTransit />,
        layout: "/admin",
        module: "DISTRIBUCION",
        permissions: {
          view: "DISTRIBUCION.ENVIOS_TRANSITO.VER",
        },
      },
      {
        path: "/receipt-confirmation",
        name: "Confirmación de Recepción",
        mini: "CR",
        component: <ReceiptConfirmation />,
        layout: "/admin",
        module: "DISTRIBUCION",
        permissions: {
          view: "DISTRIBUCION.CONFIRMACION_RECEPCION.VER",
          create: "DISTRIBUCION.CONFIRMACION_RECEPCION.CREAR",
        },
      },
    ],
  },
  // 12. KIOSCOS
  {
    collapse: true,
    name: "Kioscos",
    icon: "nc-icon nc-shop",
    state: "kiosksCollapse",
    module: "KIOSCOS",
    views: [
      {
        path: "/kiosk-inventory",
        name: "Inventario del Kiosko",
        mini: "IK",
        component: <KioskInventory />,
        layout: "/admin",
        module: "KIOSCOS",
        permissions: {
          view: "KIOSCOS.INVENTARIO_KIOSKO.VER",
        },
      },
      {
        path: "/kiosk-sales",
        name: "Ventas del Kiosko",
        mini: "VK",
        component: <KioskSales />,
        layout: "/admin",
        module: "KIOSCOS",
        permissions: {
          view: "KIOSCOS.VENTAS_KIOSKO.VER",
          create: "KIOSCOS.VENTAS_KIOSKO.CREAR",
        },
      },
      {
        path: "/kiosk-returns",
        name: "Devoluciones / Reintegros",
        mini: "DR",
        component: <KioskReturns />,
        layout: "/admin",
        module: "KIOSCOS",
        permissions: {
          view: "KIOSCOS.DEVOLUCIONES_REINTEGROS.VER",
          create: "KIOSCOS.DEVOLUCIONES_REINTEGROS.CREAR",
        },
      },
    ],
  },
  // 13. VENTAS
  {
    collapse: true,
    name: "Ventas",
    icon: "nc-icon nc-cart-simple",
    state: "salesCollapse",
    module: "VENTAS",
    views: [
      {
        path: "/total-sales",
        name: "Ventas Totales",
        mini: "VT",
        component: <TotalSales />,
        layout: "/admin",
        module: "VENTAS",
        permissions: {
          view: "VENTAS.VENTAS_TOTALES.VER",
        },
      },
      {
        path: "/sales-by-seller",
        name: "Ventas por Vendedor",
        mini: "VV",
        component: <SalesBySeller />,
        layout: "/admin",
        module: "VENTAS",
        permissions: {
          view: "VENTAS.VENTAS_VENDEDOR.VER",
        },
      },
      {
        path: "/online-sales",
        name: "Ventas Online",
        mini: "VO",
        component: <OnlineSales />,
        layout: "/admin",
        module: "VENTAS",
        permissions: {
          view: "VENTAS.VENTAS_ONLINE.VER",
          create: "VENTAS.VENTAS_ONLINE.CREAR",
          edit: "VENTAS.VENTAS_ONLINE.EDITAR",
          delete: "VENTAS.VENTAS_ONLINE.ELIMINAR",
        },
      },
      {
        path: "/invoicing",
        name: "Facturación / Recibos",
        mini: "F",
        component: <Invoicing />,
        layout: "/admin",
        module: "VENTAS",
        permissions: {
          view: "VENTAS.FACTURACION_RECIBOS.VER",
          create: "VENTAS.FACTURACION_RECIBOS.CREAR",
        },
      },
    ],
  },
  // 13. REPORTES
  {
    collapse: true,
    name: "Reportes",
    icon: "nc-icon nc-paper",
    state: "reportsCollapse",
    module: "REPORTES",
    views: [
      {
        path: "/production-reports",
        name: "Producción",
        mini: "RP",
        component: <ProductionReports />,
        layout: "/admin",
        module: "REPORTES",
        permissions: {
          view: "REPORTES.PRODUCCION.VER",
        },
      },
      {
        path: "/inventory-reports",
        name: "Inventarios",
        mini: "RI",
        component: <InventoryReports />,
        layout: "/admin",
        module: "REPORTES",
        permissions: {
          view: "REPORTES.INVENTARIOS.VER",
        },
      },
      {
        path: "/sales-reports",
        name: "Ventas",
        mini: "RV",
        component: <SalesReports />,
        layout: "/admin",
        module: "REPORTES",
        permissions: {
          view: "REPORTES.VENTAS.VER",
        },
      },
      {
        path: "/cost-reports",
        name: "Costos",
        mini: "RC",
        component: <CostReports />,
        layout: "/admin",
        module: "REPORTES",
        permissions: {
          view: "REPORTES.COSTOS.VER",
        },
      },
      {
        path: "/kiosk-performance",
        name: "Desempeño de Kioscos",
        mini: "DK",
        component: <KioskPerformance />,
        layout: "/admin",
        module: "REPORTES",
        permissions: {
          view: "REPORTES.DESEMPENO_KIOSCOS.VER",
        },
      },
      {
        path: "/purchase-reports",
        name: "Compras",
        mini: "RC",
        component: <PurchaseReports />,
        layout: "/admin",
        module: "REPORTES",
        permissions: {
          view: "REPORTES.COMPRAS.VER",
        },
      },
      {
        path: "/phase-general-reports",
        name: "Reportes por Fase",
        mini: "RF",
        component: <PhaseGeneralReports />,
        layout: "/admin",
        module: "REPORTES",
        permissions: {
          view: "REPORTES.PRODUCCION.VER",
        },
      },
    ],
  },
  // 14. CONFIGURACIÓN GENERAL
  {
    collapse: true,
    name: "Configuración General",
    icon: "nc-icon nc-settings-gear-65",
    state: "configCollapse",
    module: "CONFIGURACION",
    views: [
      {
        path: "/taxes",
        name: "Impuestos",
        mini: "I",
        component: <Taxes />,
        layout: "/admin",
        module: "CONFIGURACION",
        permissions: {
          view: "CONFIGURACION.IMPUESTOS.VER",
          create: "CONFIGURACION.IMPUESTOS.CREAR",
          edit: "CONFIGURACION.IMPUESTOS.EDITAR",
          delete: "CONFIGURACION.IMPUESTOS.ELIMINAR",
        },
      },
      {
        path: "/document-series",
        name: "Series de Documentos",
        mini: "SD",
        component: <DocumentSeries />,
        layout: "/admin",
        module: "CONFIGURACION",
        permissions: {
          view: "CONFIGURACION.SERIES_DOCUMENTOS.VER",
          create: "CONFIGURACION.SERIES_DOCUMENTOS.CREAR",
          edit: "CONFIGURACION.SERIES_DOCUMENTOS.EDITAR",
          delete: "CONFIGURACION.SERIES_DOCUMENTOS.ELIMINAR",
        },
      },
      {
        path: "/print-formats",
        name: "Formatos de Impresión",
        mini: "FI",
        component: <PrintFormats />,
        layout: "/admin",
        module: "CONFIGURACION",
        permissions: {
          view: "CONFIGURACION.FORMATOS_IMPRESION.VER",
          create: "CONFIGURACION.FORMATOS_IMPRESION.CREAR",
          edit: "CONFIGURACION.FORMATOS_IMPRESION.EDITAR",
          delete: "CONFIGURACION.FORMATOS_IMPRESION.ELIMINAR",
        },
      },
      {
        path: "/accounting-accounts",
        name: "Cuentas Contables",
        mini: "CC",
        component: <AccountingAccounts />,
        layout: "/admin",
        module: "CONFIGURACION",
        permissions: {
          view: "CONFIGURACION.CUENTAS_CONTABLES.VER",
          edit: "CONFIGURACION.CUENTAS_CONTABLES.EDITAR",
        },
      },
      {
        path: "/smart-purchasing-config",
        name: "Compras Inteligentes",
        mini: "CI",
        component: <SmartPurchasingConfig />,
        layout: "/admin",
        module: "CONFIGURACION",
        permissions: {
          view: "CONFIGURACION.COMPRAS_INTELIGENTES.VER",
          edit: "CONFIGURACION.COMPRAS_INTELIGENTES.EDITAR",
        },
      },
      {
        path: "/system-settings",
        name: "Configuración del Sistema",
        mini: "CS",
        component: <SystemSettings />,
        layout: "/admin",
        module: "CONFIGURACION",
        permissions: {
          view: "CONFIGURACION.CONFIGURACION_SISTEMA.VER",
          edit: "CONFIGURACION.CONFIGURACION_SISTEMA.EDITAR",
        },
      },
    ],
  },
];

export default routes;
