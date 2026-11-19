import fs from "fs";
import path from "path";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { KIOSK_SALES_BY_CATEGORY_ROLE_NAME_TOKENS } from "config/kioskSalesByCategoryAccess";
import { isSidebarRouteVisible } from "utils/routePermissionAccess";
import ProtectedRoute from "components/ProtectedRoute";
import Sidebar from "components/Sidebar/Sidebar";

jest.mock("services/authService", () => ({
  logout: jest.fn(),
  getUserData: () => ({ username: "ana" }),
}));

jest.mock("utils/defaultLandingRoute", () => ({
  resolveDefaultLandingRoute: () => "/admin/inicio",
}));

let mockAuth;
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

const hasVentas = (code) => code === "REPORTES.VENTAS.VER";

const kioskView = {
  path: "/kiosk-sales-by-category",
  name: "Ventas de kioscos",
  layout: "/admin",
  permissions: { view: "REPORTES.VENTAS.VER" },
  roleNameIncludes: KIOSK_SALES_BY_CATEGORY_ROLE_NAME_TOKENS,
};

const salesView = {
  path: "/sales-reports",
  name: "Ventas",
  layout: "/admin",
  permissions: { view: "REPORTES.VENTAS.VER" },
};

const menuRoutes = [
  {
    collapse: true,
    name: "Reportes",
    state: "reportsCollapse",
    views: [salesView, kioskView],
  },
];

function setAuth(roleName) {
  const permissions = ["REPORTES.VENTAS.VER"];
  const roles = [{ name: roleName }];
  mockAuth = {
    user: { firstName: "Ana", lastName: "Test" },
    permissions,
    roles,
    loading: false,
    initialized: true,
    hasPermission: (code) => permissions.includes(code),
    hasAnyPermission: (codes) => codes.some((code) => permissions.includes(code)),
    hasAllPermissions: (codes) => codes.every((code) => permissions.includes(code)),
    hasRole: () => false,
    refreshUserData: jest.fn(),
  };
}

function renderMenu() {
  render(
    <MemoryRouter>
      <Sidebar routes={menuRoutes} />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByText("Reportes"));
}

function renderKioskRoute() {
  render(
    <MemoryRouter initialEntries={["/kiosk-sales-by-category"]}>
      <Routes>
        <Route
          path="/kiosk-sales-by-category"
          element={
            <ProtectedRoute
              permission={["REPORTES.VENTAS.VER"]}
              roleNameIncludes={KIOSK_SALES_BY_CATEGORY_ROLE_NAME_TOKENS}
            >
              <div>reporte visible</div>
            </ProtectedRoute>
          }
        />
        <Route path="/admin/inicio" element={<div>inicio</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), "utf8");

afterEach(cleanup);

describe("Ventas de kioscos por categoría: nombre de rol", () => {
  test.each([
    "ADMIN",
    "LOGISTICA",
    "LOGISTICO",
    "CONTABILIDAD",
    "SUPER_ADMIN",
    "ADMIN_FULL_ACCESS",
  ])("el menú muestra el ítem a %s", (roleName) => {
    expect(isSidebarRouteVisible(kioskView, hasVentas, [{ name: roleName }])).toBe(true);
  });

  test.each(["VENTA_EN_LINEA", "SUPERVISORA_KIOSKO"])(
    "el menú oculta el ítem a %s",
    (roleName) => {
      expect(isSidebarRouteVisible(kioskView, hasVentas, [{ name: roleName }])).toBe(false);
    }
  );

  test("sin REPORTES.VENTAS.VER no se muestra aunque el rol coincida", () => {
    expect(isSidebarRouteVisible(kioskView, () => false, [{ name: "ADMIN" }])).toBe(false);
  });

  test("el reporte Ventas sigue visible para VENTA_EN_LINEA", () => {
    expect(isSidebarRouteVisible(salesView, hasVentas, [{ name: "VENTA_EN_LINEA" }])).toBe(true);
  });

  test("Logística con acento entra; Venta en línea no", () => {
    expect(isSidebarRouteVisible(kioskView, hasVentas, [{ name: "Logística" }])).toBe(true);
    expect(isSidebarRouteVisible(kioskView, hasVentas, [{ name: "Venta en línea" }])).toBe(false);
  });

  test("la ruta real conserva REPORTES.VENTAS.VER y las subcadenas de rol", () => {
    expect(KIOSK_SALES_BY_CATEGORY_ROLE_NAME_TOKENS).toEqual(["ADMIN", "LOGIST", "CONTABIL"]);
    const routesSrc = read("../../../routes.js");
    const block = routesSrc.match(
      /path:\s*"\/kiosk-sales-by-category"[\s\S]*?roleNameIncludes:\s*KIOSK_SALES_BY_CATEGORY_ROLE_NAME_TOKENS,/
    );
    expect(block).toBeTruthy();
    expect(block[0]).toContain('view: "REPORTES.VENTAS.VER"');

    const salesBlock = routesSrc.match(/path:\s*"\/sales-reports"[\s\S]*?permissions:\s*\{[\s\S]*?\}/);
    expect(salesBlock[0]).toContain('view: "REPORTES.VENTAS.VER"');
    expect(salesBlock[0]).not.toContain("roleNameIncludes");
  });

  test.each(["ADMIN", "LOGISTICO", "SUPER_ADMIN", "ADMIN_FULL_ACCESS", "CONTABILIDAD"])(
    "la ruta deja entrar a %s",
    (roleName) => {
      setAuth(roleName);
      renderKioskRoute();
      expect(screen.getByText("reporte visible")).toBeInTheDocument();
    }
  );

  test.each(["VENTA_EN_LINEA", "SUPERVISORA_KIOSKO"])(
    "la ruta bloquea a %s",
    (roleName) => {
      setAuth(roleName);
      renderKioskRoute();
      expect(screen.queryByText("reporte visible")).not.toBeInTheDocument();
      expect(screen.getByText("inicio")).toBeInTheDocument();
    }
  );

  test("el menú muestra Ventas de kioscos a LOGISTICO y SUPER_ADMIN", () => {
    setAuth("LOGISTICO");
    renderMenu();
    expect(screen.getByText("Ventas de kioscos")).toBeInTheDocument();
    expect(screen.getByText("Ventas", { exact: true })).toBeInTheDocument();

    cleanup();
    setAuth("SUPER_ADMIN");
    renderMenu();
    expect(screen.getByText("Ventas de kioscos")).toBeInTheDocument();
  });

  test("el menú oculta Ventas de kioscos a VENTA_EN_LINEA y SUPERVISORA_KIOSKO y deja Ventas", () => {
    setAuth("VENTA_EN_LINEA");
    renderMenu();
    expect(screen.queryByText("Ventas de kioscos")).not.toBeInTheDocument();
    expect(screen.getByText("Ventas", { exact: true })).toBeInTheDocument();

    cleanup();
    setAuth("SUPERVISORA_KIOSKO");
    renderMenu();
    expect(screen.queryByText("Ventas de kioscos")).not.toBeInTheDocument();
    expect(screen.getByText("Ventas", { exact: true })).toBeInTheDocument();
  });
});
