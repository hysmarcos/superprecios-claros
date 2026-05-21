#!/usr/bin/env bash
# Genera un fixture chico (Coto, ~200 SKUs) para tests E2E.
# Una sola vez: el ZIP resultante se commitea a git en tests/fixtures/.
#
# Requiere: bash, curl, unzip, sed, powershell (para Compress-Archive en Windows).
# En Linux/macOS bastaría con `zip` pero acá usamos powershell para portabilidad Windows.
set -euo pipefail

TARGET="tests/fixtures/sepa-coto-mini.zip"
if [ -f "$TARGET" ]; then echo "fixture ya existe en $TARGET"; exit 0; fi

# Descargar día actual (debe haber al menos un día con datos)
TMP=$(mktemp -d)
echo "tmp: $TMP"
DOW=$(date +%w)
case $DOW in
  0) ID="f8e75128-515a-436e-bf8d-5c63a62f2005"; F="sepa_domingo.zip" ;;
  1) ID="0a9069a9-06e8-4f98-874d-da5578693290"; F="sepa_lunes.zip" ;;
  2) ID="9dc06241-cc83-44f4-8e25-c9b1636b8bc8"; F="sepa_martes.zip" ;;
  3) ID="1e92cd42-4f94-4071-a165-62c4cb2ce23c"; F="sepa_miercoles.zip" ;;
  4) ID="d076720f-a7f0-4af8-b1d6-1b99d5a90c14"; F="sepa_jueves.zip" ;;
  5) ID="91bc072a-4726-44a1-85ec-4a8467aad27e"; F="sepa_viernes.zip" ;;
  6) ID="b3c3da5d-213d-41e7-8d74-f23fda0a3c30"; F="sepa_sabado.zip" ;;
esac

URL="https://datos.produccion.gob.ar/dataset/6f47ec76-d1ce-4e34-a7e1-621fe9b1d0b5/resource/$ID/download/$F"
echo "descargando $URL"
curl -sL -o "$TMP/$F" "$URL"
ls -lh "$TMP/$F"

mkdir -p "$TMP/outer"
unzip -q "$TMP/$F" -d "$TMP/outer"
echo "outer extraído"

COTO_INNER=$(ls "$TMP"/outer/*/sepa_1_comercio-sepa-12_*.zip 2>/dev/null | head -1 || true)
if [ -z "$COTO_INNER" ] || [ ! -f "$COTO_INNER" ]; then
  echo "Coto inner no encontrado en outer/*/; intentando outer/ plano"
  COTO_INNER=$(ls "$TMP"/outer/sepa_1_comercio-sepa-12_*.zip 2>/dev/null | head -1 || true)
fi
[ -f "$COTO_INNER" ] || { echo "Coto inner no encontrado"; exit 1; }
echo "coto inner: $COTO_INNER"

mkdir -p "$TMP/coto"
unzip -q "$COTO_INNER" -d "$TMP/coto"
ls "$TMP/coto"

# Recortar productos.csv a 1 header + 2000 lineas.
# (Coto repite la misma fila por cada sucursal, asi que 2000 lineas dan ~300+ EANs unicos,
#  suficientes para el assert >50 del test E2E.)
head -1 "$TMP/coto/productos.csv" > "$TMP/coto/productos_mini.csv"
sed -n '2,2001p' "$TMP/coto/productos.csv" >> "$TMP/coto/productos_mini.csv"
mv "$TMP/coto/productos_mini.csv" "$TMP/coto/productos.csv"
echo "productos.csv recortado a $(wc -l < "$TMP/coto/productos.csv") lineas"

# Construir el inner zip y el outer zip usando PowerShell (Windows-friendly)
DATE_FOLDER=$(date +%Y-%m-%d)
INNER_ZIP_NAME="sepa_1_comercio-sepa-12_mini.zip"

# Convertir paths a formato Windows para powershell
to_win() { cygpath -w "$1"; }

TMP_WIN=$(to_win "$TMP")
COTO_DIR_WIN=$(to_win "$TMP/coto")
INNER_ZIP_WIN=$(to_win "$TMP/$INNER_ZIP_NAME")

# Re-zip inner: comercio.csv, sucursales.csv, productos.csv (sin carpeta contenedora)
powershell.exe -NoProfile -Command "Compress-Archive -Force -DestinationPath '$INNER_ZIP_WIN' -Path '$COTO_DIR_WIN\\comercio.csv','$COTO_DIR_WIN\\sucursales.csv','$COTO_DIR_WIN\\productos.csv'"
echo "inner zip creado"

# Armar carpeta outer-mini/<date>/<inner.zip> y zipearla
mkdir -p "$TMP/outer-mini/$DATE_FOLDER"
mv "$TMP/$INNER_ZIP_NAME" "$TMP/outer-mini/$DATE_FOLDER/"

OUTER_MINI_WIN=$(to_win "$TMP/outer-mini")
OUTER_OUT_WIN=$(to_win "$TMP/mini.zip")

# Zipear el contenido de outer-mini (la carpeta fechada y su zip dentro)
powershell.exe -NoProfile -Command "Compress-Archive -Force -DestinationPath '$OUTER_OUT_WIN' -Path '$OUTER_MINI_WIN\\*'"
echo "outer zip creado"

mkdir -p "$(dirname "$TARGET")"
mv "$TMP/mini.zip" "$TARGET"
echo "fixture creado en $TARGET"
ls -lh "$TARGET"
