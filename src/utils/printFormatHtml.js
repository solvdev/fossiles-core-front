import DOMPurify from "dompurify";

// Las variables de plantilla permanecen intactas; el contenido activo se elimina antes de renderizar.
export function sanitizePrintFormatHtml(html) {
  return DOMPurify.sanitize(html || "", {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"],
    FORBID_ATTR: ["srcdoc"],
  });
}
