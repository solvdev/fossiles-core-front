import { sanitizePrintFormatHtml } from "../printFormatHtml";

test("elimina contenido activo de un formato guardado", () => {
  const html = sanitizePrintFormatHtml(
    '<img src="https://example.com/logo.png" onerror="alert(1)"><script>alert(1)</script>' +
    '<a href="javascript:alert(1)">Texto</a><iframe srcdoc="<script>alert(1)</script>"></iframe>'
  );
  expect(html).not.toMatch(/onerror|script|javascript:|iframe|srcdoc/i);
  expect(html).toContain("https://example.com/logo.png");
});

test("conserva tablas, estilos y variables de impresión", () => {
  const html = sanitizePrintFormatHtml('<table><tr><td style="text-align: center">{{documentNumber}}</td></tr></table>');
  expect(html).toContain("<table>");
  expect(html).toContain("text-align: center");
  expect(html).toContain("{{documentNumber}}");
});
