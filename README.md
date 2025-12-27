# Intermodal.ast

Demo de movilidad en tiempo real para el area central asturiana. Integra trenes (Renfe Cercanias), buses EMTUSA, bici publica, aparcabicis y car sharing en un mapa unico con alertas intermodales por radio.

## Funcionalidades
- Mapa con trenes en tiempo real y filtros por linea.
- Buses EMTUSA con recorridos, flota y paradas filtradas por linea.
- Gijon Bici: estaciones con disponibilidad.
- Aparcabicis municipales (Observa Gijon) como capa independiente.
- Car sharing (Guppy): coches, zonas y puntos.
- Intermodal: alertas por proximidad usando un bus o tu ubicacion.

## Tecnologias
- Leaflet (frontend).
- Node.js (proxy de APIs y cache).

## Ejecucion
```bash
node server.js
```
Abre `http://localhost:5178`.

## Fuentes de datos
- Renfe: https://tiempo-real.renfe.com
- EMTUSA: https://emtusasiri.pub.gijon.es/emtusasiri
- Gijon Bici: https://bici.gijon.es
- Observa Gijon (aparcabicis): https://observa.gijon.es
- Guppy: https://api.guppy.es

## Notas
- El servidor cachea algunas respuestas (paradas, aparcabicis, guppy) para reducir carga.
- El log de movimiento se guarda en `logs/movement-log.txt`.

## Disclaimer
Este proyecto es un test y un prototipo educativo. Las llamadas a APIs externas se realizan solo con fines de aprendizaje y pruebas. No hay intencion comercial ni uso en produccion.
