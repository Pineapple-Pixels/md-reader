# md-reader

## Verificar cambios de UI

Todo cambio que toque el front se verifica con Playwright, no solo con typecheck y tests unitarios:

```bash
npm run test:e2e
```

- Necesita el Postgres descartable del puerto 5433 (comando en el README, "Tests end-to-end").
- Si una captura de referencia cambia a proposito: `npm run test:e2e:update`, mirar las imagenes nuevas
  en `e2e/app.spec.ts-snapshots/` y recien ahi commitearlas.
- Un flujo de UI nuevo lleva su test en `e2e/app.spec.ts`; los datos de prueba van en `e2e/seed.ts`.
- Esas capturas son la evidencia visual que piden las revisiones de goal.
