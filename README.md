# superprecios-claros

Backend que ingiere precios diarios de SEPA y los expone vía API a las extensiones de cadenas argentinas.

Spec: en repo `coto-extension`, `docs/superpowers/specs/2026-05-20-historico-precios-multicadena-design.md`.

## Dev

```
npm install
docker compose up -d postgres
npm run db:migrate
npm run dev:api
```
