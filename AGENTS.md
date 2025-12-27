# AGENTS

Proyecto: Intermodal.ast (demo intermodal Gijon/Asturias)

## Objetivo
Consolidar en un mapa en tiempo real trenes, buses EMTUSA, bici publica, aparcabicis y car sharing. Incluye alertas intermodales por radio con opcion de usar un bus o la ubicacion del usuario.

## Arquitectura
- Frontend: `public/index.html`, `public/styles.css`, `public/app.js` (Leaflet).
- Backend: `server.js` (proxy + cache para APIs externas).

## Endpoints locales
- `/api/flota` (Renfe)
- `/api/lineas` (Renfe)
- `/api/estaciones` (Renfe)
- `/api/salidas?station=COD` (Renfe)
- `/api/emtusa/buses` (EMTUSA)
- `/api/emtusa/lineas-geo` (EMTUSA)
- `/api/emtusa/paradas` y `/api/emtusa/paradas?linea=ID` (EMTUSA)
- `/api/bici/stations` (Gijon Bici)
- `/api/bici/parking` (Observa Gijon)
- `/api/guppy/map` (Guppy)
- `/api/debug-log` (registro de movimiento)

## Funcionamiento clave
- Filtros de lineas (tren y bus) para mostrar/ocultar recorridos y flota.
- Intermodal: usa bus seleccionado o ubicacion del usuario, con radio configurable y toggles por modo.
- Bici: estaciones + aparcabicis como capas independientes.
- Bus: paradas filtradas por lineas seleccionadas.

## Ejecucion local
- `node server.js`
- Abre `http://localhost:5178`

## Notas
- El servidor cachea datos estaticos (paradas, aparcabicis, guppy) para reducir carga.
- El log de movimiento se guarda en `logs/movement-log.txt`.
