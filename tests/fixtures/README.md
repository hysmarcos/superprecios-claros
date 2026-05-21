# Fixtures

`sepa-coto-mini.zip`: ZIP recortado a 1 inner ZIP (Coto) con productos.csv recortado a ~100 filas.

Para regenerar manualmente:
1. Descargar el ZIP del día actual de SEPA
2. Extraer solo el archivo de Coto (sepa_1_comercio-sepa-12_*)
3. Dentro de ese ZIP, recortar productos.csv a 100 filas + sucursales.csv (todas) + comercio.csv
4. Re-comprimir como inner + outer y dejarlo acá
