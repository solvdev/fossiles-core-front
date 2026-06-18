#!/bin/bash
# Diagnóstico front + API — ejecutar en el servidor nginx (o local con curl)
# Uso: bash scripts/diagnose-deploy.sh
#      BASE=https://core.fossilescorp.com bash scripts/diagnose-deploy.sh

set -e
BASE="${BASE:-https://core.fossilescorp.com}"
JS_PATH="/static/js/main.a15b7a53.js"
BUILD_ROOT="${BUILD_ROOT:-/var/www/front/build}"

echo "========== 1. Archivo JS en disco (servidor) =========="
if [ -f "${BUILD_ROOT}${JS_PATH}" ]; then
  BYTES=$(wc -c < "${BUILD_ROOT}${JS_PATH}")
  echo "Ruta: ${BUILD_ROOT}${JS_PATH}"
  echo "Tamaño: ${BYTES} bytes (esperado ~4801037 si build reciente)"
  echo "--- Inicio ---"
  head -c 80 "${BUILD_ROOT}${JS_PATH}"; echo
  echo "--- Final (últimos 120 bytes) ---"
  tail -c 120 "${BUILD_ROOT}${JS_PATH}"; echo
  if tail -c 30 "${BUILD_ROOT}${JS_PATH}" | grep -q '})();$'; then
    echo "OK: el bundle parece terminar correctamente (})();)"
  else
    echo "ERROR: el bundle NO termina en })(); — probable subida truncada"
  fi
else
  echo "NO EXISTE: ${BUILD_ROOT}${JS_PATH}"
fi

echo ""
echo "========== 2. Lo que sirve HTTPS (público) =========="
curl -sI "${BASE}${JS_PATH}" | grep -iE 'HTTP/|content-type|content-length'
TMP=$(mktemp)
curl -s -o "$TMP" "${BASE}${JS_PATH}"
PBYTES=$(wc -c < "$TMP")
echo "Tamaño descargado: ${PBYTES} bytes"
tail -c 120 "$TMP"; echo
rm -f "$TMP"

echo ""
echo "========== 3. API backend =========="
# POST /login sin body devuelve 500 (Spring: body requerido) — eso es normal.
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/production-orders")
echo "GET /api/production-orders (sin token): HTTP ${HTTP_CODE}"
echo "  403/401 = backend vivo y seguridad activa"
echo "  502/000 = nginx no alcanza el upstream Java"
BODY=$(curl -s -X POST "${BASE}/api/auth/login" -H "Content-Type: application/json" -d '{"username":"x","password":"y"}' 2>/dev/null || true)
if echo "$BODY" | grep -q "BusinessException\|Invalid\|credencial\|password\|usuario"; then
  echo "POST /api/auth/login con JSON: backend procesa login (respuesta de negocio)"
elif echo "$BODY" | grep -q "Required request body"; then
  echo "POST /api/auth/login: backend responde (falta body en prueba vacía)"
else
  echo "POST /api/auth/login respuesta: ${BODY:0:120}"
fi

echo ""
echo "========== 4. Nginx upstream (si aplica) =========="
grep -r "proxy_pass\|172.31" /etc/nginx/sites-enabled/ 2>/dev/null | head -20 || true

echo ""
echo "========== 5. Puerto 8080 local =========="
ss -tlnp 2>/dev/null | grep 8080 || netstat -tlnp 2>/dev/null | grep 8080 || echo "nada en 8080 en ESTE host"

echo ""
echo "========== 6. Pantalla en blanco (checklist) =========="
echo "En el navegador (F12 → Network → recargar con Ctrl+Shift+R):"
echo "  - main.*.js debe pesar ~4801037 bytes (no ~4439040)"
echo "  - Content-Type: application/javascript (no text/html)"
echo "  - Si Console muestra 'SyntaxError' o 'missing )' → caché vieja o JS corrupto"
echo "  - Si Console muestra otro error rojo → fallo en runtime (copiar mensaje)"
echo "  - Si solo ves 'Verificando autenticación...' → no es blanco total; revisar API /auth/validate"
echo ""
echo "Purgar Cloudflare: Caching → Purge → Custom Purge →"
echo "  https://${BASE#https://}/static/js/main.a15b7a53.js"
echo ""
echo "En consola del navegador (pestaña Console), pegar:"
echo "  document.getElementById('root')?.innerHTML?.length"
echo "  → 0 o vacío con error rojo arriba = React no montó"

echo ""
echo "========== Fin =========="
