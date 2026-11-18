import fs from "fs";
import path from "path";
import { getRequiredPermission } from "config/routePermissions";
import { isSidebarRouteVisible } from "utils/routePermissionAccess";

const kioskSalesView = {
  path: "/kiosk-sales-by-category",
  name: "Ventas de kioscos",
  permissions: { view: "REPORTES.VENTAS.VER" },
};

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), "utf8");

test("ruta y menú de Ventas de kioscos exigen REPORTES.VENTAS.VER", () => {
  expect(getRequiredPermission("/admin/kiosk-sales-by-category")).toBe("REPORTES.VENTAS.VER");
  expect(isSidebarRouteVisible(kioskSalesView, () => false)).toBe(false);
  expect(isSidebarRouteVisible(kioskSalesView, (code) => code === "REPORTES.VENTAS.VER")).toBe(true);
  expect(isSidebarRouteVisible(kioskSalesView, (code) => code === "REPORTES.INVENTARIOS.VER")).toBe(false);

  const routesSrc = read("../../../routes.js");
  const block = routesSrc.match(/path:\s*"\/kiosk-sales-by-category"[\s\S]*?permissions:\s*\{[\s\S]*?\}/);
  expect(block).toBeTruthy();
  expect(block[0]).toContain('name: "Ventas de kioscos"');
  expect(block[0]).toContain('view: "REPORTES.VENTAS.VER"');
});

test("el reporte y el servicio usan totalAmount / totalAmountNoIva, no totalWithIva", () => {
  const reportSrc = read("../KioskSalesByCategoryReport.js");
  const serviceSrc = read("../../../services/kioskSalesByCategoryService.js");
  [reportSrc, serviceSrc].forEach((src) => {
    expect(src).toMatch(/totalAmountNoIva/);
    expect(src).not.toMatch(/totalWithIva|totalWithoutIva/);
  });
});
