# E2E QA - Torneos (Playwright)

## Requisitos
- Backend en `http://localhost:3000`
- Frontend en `http://localhost:5173`
- Usuarios de prueba activos

## Variables opcionales
Si no defines variables, se usan los usuarios que compartiste en esta conversación.

```bash
E2E_BASE_URL=http://localhost:5173
E2E_OWNER_EMAIL=martiingadeea1996@gmail.com
E2E_OWNER_PASSWORD=Prueba123!
E2E_PLAYERS_PASSWORD=Prueba123!
E2E_PLAYER_EMAILS=testwebpadel1@gmail.com,testwebpadel2@gmail.com,testwebpadel3@gmail.com,testwebpadel4@gmail.com,testwebpadel5@gmail.com,testwebpadel6@gmail.com,testwebpadel7@gmail.com,testwebpadel8@gmail.com
```

## Primera vez
```bash
npx playwright install chromium
```

## Ejecutar pruebas
```bash
npm run e2e
```

Modo con navegador visible:
```bash
npm run e2e:headed
```

Ver reporte:
```bash
npm run e2e:report
```

## Cobertura actual
- Flujo organizador:
  - login
  - crear torneo con wizard (3 pasos)
  - validar tipos Americano/Mexicano/Pozo + descripciones
  - invitar 8 jugadores por email
- Flujo jugador:
  - login
  - navegación a `/torneos` sin crash

