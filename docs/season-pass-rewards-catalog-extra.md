# Season Pass — Banco de recompensas de tipos nuevos (borrador, EN DUDA)

> Fecha: 2026-07-08 · Banco de referencia por si se añaden estos tipos.
> **No decidido**: si entran, sustituirían parte del relleno de SP del catálogo
> principal (`season-pass-rewards-catalog.md`). Ninguno usa Ionicons.
>
> Cada tipo necesita **soporte de render nuevo** (no existe hoy en el perfil):
> nuevos `kind` de `unlockables` + su render en mobile (y compatible con la
> miniapp). Coste de implementación indicado por tipo.

---

## Tipos y coste

| Tipo | Render | Assets | Coste |
|---|---|---|---|
| **Color/gradiente de nombre** | texto con color/gradiente | ninguno (procedural) | bajo |
| **Banner de perfil** | fondo con gradiente/patrón | ninguno (procedural) o imagen | bajo (procedural) / alto (imagen) |
| **Rerolls extra** | funcional, no visual | ninguno | bajo (lógica de reroll) |
| **Avatares** | imagen de perfil | **requiere ilustración** | alto |

---

## 1. Color/gradiente de nombre (~30)

Se aplica al nombre del jugador en perfil/rankings. `kind: name_color`, paleta en `colors`.

**Común (sólidos):** Blanco Hielo, Gris Acero, Verde Pista, Azul Cielo, Arena, Rojo Ladrillo, Naranja Suave, Turquesa
**Raro (sólidos vivos):** Naranja WeMatch, Esmeralda, Océano, Ámbar, Coral, Violeta
**Épico (gradientes 2 tonos):** Atardecer (naranja→rosa), Aurora (cian→violeta), Brasa (rojo→amarillo), Menta (verde→cian), Chicle (rosa→morado)
**Legendario (gradientes 3+ tonos / animados):** Llamas (rojo→naranja→amarillo), Arcoíris, Oro Líquido, Neón Pulsante, Prisma, Supernova

## 2. Banner de perfil (~30)

Cover procedural del perfil. `kind: banner`, `style` (gradiente/patrón) + `colors`.

**Común:** Degradado Naranja, Degradado Azul, Degradado Gris, Degradado Verde, Noche, Amanecer
**Raro:** Ondas, Malla de Pista, Rayas Diagonales, Puntos, Circuito, Fibra
**Épico:** Fuego, Hielo, Tormenta Neón, Nebulosa, Vidrio Roto, Ola Retro
**Legendario (animados):** Llamas Vivas, Aurora Boreal, Campo de Estrellas, Circuito Pulsante, Pista Dorada S1

## 3. Rerolls extra (~20 — funcional)

Recompensa consumible: cambios de misión adicionales. `kind: reroll_token` (o tabla propia).

- **Común:** +1 reroll diario (una vez)
- **Raro:** +1 reroll semanal (una vez), pack de 2 rerolls diarios
- **Épico:** +3 rerolls diarios (semana), +1 reroll semanal permanente durante la temporada
- **Legendario:** rerolls diarios ilimitados durante 3 días

> Nota: la wallet/moneda de reroll de pago es proyecto aparte; esto son tokens
> gratis otorgados por el pase. Encaja bien como recompensa **funcional** que no
> depende de assets ni de la miniapp.

## 4. Avatares (~20 — requieren ilustración)

Imagen de perfil temática. `kind: avatar`, `image_url` (asset). **Bloqueado por diseño.**

**Temática S1 (fuego/pádel):**
- Común: Pelota Clásica, Pala Azul, Pala Roja, Bola de Fuego (simple)
- Raro: Pala en Llamas, Guante de Campeón, Silbato Dorado
- Épico: Fénix Jugador, Mascota Llama, Pala Legendaria
- Legendario: Avatar Animado "Rey de las Llamas", Trofeo Viviente, Dragón de Pista

> Los avatares son el único tipo que **no se puede generar sin diseño**. Si se
> priorizan, hay que pedir ilustraciones (idealmente el mismo lote que los 42
> iconos del PDF).

---

## Integración sugerida (si se aprueban)

- **Reemplazan el relleno de SP** del catálogo principal: donde hoy pone
  "SP +150", podría ir un color de nombre común o un banner raro → menos SP
  suelto, más recompensa "de vitrina".
- **Reparto por carril:** colores/banners comunes-raros en free; épicos/
  legendarios y avatares en elite.
- **Rerolls** como picos funcionales cada ~15-20 niveles (ayudan al progreso sin
  inflar la economía como el SP directo).
- **Prioridad de implementación (coste ↑ valor):** 1) color de nombre, 2) banner
  procedural, 3) rerolls, 4) avatares (esperar assets).

**Total banco:** ~100 items (30 colores + 30 banners + 20 rerolls + 20 avatares).
Pendiente de decisión de producto sobre cuáles entran en S1.
