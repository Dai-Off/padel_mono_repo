# PadelChess → WeMatch

Carpeta de **referencia** para el desarrollo del módulo PadelPuzzle dentro
de la app WeMatch.

Contiene:
- El análisis técnico de cómo funciona [padelchess.me](https://www.padelchess.me/puzzles)
  por dentro (data model, animaciones, scoring, API).
- El plan de implementación adaptado al stack de WeMatch
  (Expo + React Native Web + Supabase + Node).
- Los assets visuales mínimos listos para empaquetar en la app.

> Este directorio **no es código**. Es material de partida para que Claude Code
> tenga contexto cuando empiece a implementar el módulo dentro del monorepo
> de WeMatch.

## Estructura

```
.
├── README.md                       ← este archivo
├── docs/
│   ├── padelchess-analysis.md      ← reverse-engineering completo de padelchess
│   └── wematch-plan.md             ← roadmap, decisiones y schema para WeMatch
└── assets/
    ├── court.svg                   ← pista vectorial editable por capas
    ├── ball.svg                    ← pelota original (sin atribución externa)
    ├── player-white-back.png       ← jugador propio (vista trasera, 356×815)
    └── player-white-face.png       ← jugador rival (vista frontal, 356×815)
```

## Cómo usar esta carpeta en el monorepo de WeMatch

1. **Lee primero** `docs/wematch-plan.md` — es el roadmap con las decisiones
   tomadas (revisables) y la estructura propuesta de packages.
2. **Como referencia técnica** consulta `docs/padelchess-analysis.md` cuando
   necesites recordar cómo padelchess resuelve algo concreto (animación de
   pelota, sistema de puntos, schema de puzzle, etc.).
3. **Copia los assets** a la ubicación que decidáis en el monorepo
   (probablemente `packages/puzzle-assets/` según el plan).

## Estado de las decisiones del plan

Marcadas como **"revisables al abrir el monorepo"** en `wematch-plan.md`:

- Stack de rendering: SVG + Reanimated en mobile, react-konva en el editor web.
- Estructura de packages compartidos.
- Alcance del backend Node vs Supabase Edge Functions.

Cuando Claude Code se abra dentro del monorepo real, podrá ver el código
existente y validar/ajustar estas decisiones con datos reales (dependencias
ya instaladas, convenciones del equipo, performance medida en device).

## Próximo paso recomendado

Sprint 1 del roadmap: bootstrap del módulo en el monorepo (schema Supabase
+ packages compartidos + un primer `<PuzzleCanvasSvg>` renderizando un
puzzle hardcoded). Detalles en `docs/wematch-plan.md` §7.
