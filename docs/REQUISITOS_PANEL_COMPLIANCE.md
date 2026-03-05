# Cumplimiento de requisitos – Panel de administración y onboarding

Estado actual del flujo y módulos frente a los requisitos definidos.

---

## 1. Módulo de Onboarding y Financiero (Legal & Compliance)

| Requisito | Estado | Notas |
|-----------|--------|--------|
| **Flujo Stripe Connect** (dueño inicia vinculación) | ❌ No | No existe generación de `accountLinks` ni redirección al onboarding de Stripe. |
| **Estado KYC visible** (Pendiente, Verificado, Requiere información) | ⚠️ Parcial | `club_owners` tiene `kyc_status` y `OwnerCard` lo muestra. No hay flujo para actualizarlo vía Stripe (webhooks). |
| **Backend: stripe.accountLinks.create + return URL** | ❌ No | No hay endpoint que cree el link ni redirección a Stripe. |
| **Webhooks Stripe (account.updated)** | ❌ No | No hay listener de webhooks para actualizar KYC. |
| **Gestión de perfil e impuestos** (info pública, NIF/CIF, divisa) | ⚠️ Parcial | `ClubForm` tiene fiscal_tax_id, fiscal_legal_name, base_currency. No hay vista dedicada “perfil + impuestos”. |
| **NIF/CIF visible para facturación comisión** | ⚠️ Parcial | Se guarda en BD; no hay reporte ni automatización de facturación de comisión. |
| **Gestión horarios del club** (matriz apertura/cierre por día) | ❌ No | `clubs.weekly_schedule` existe en BD y en `ClubForm` como `{}`. No hay UI para definir la matriz. |

---

## 2. Módulo de Inventario de Espacios (Canchas)

| Requisito | Estado | Notas |
|-----------|--------|--------|
| **ABM Canchas** (alta, baja, modificación) | ✅ Sí | Dashboard con pestaña Pistas, `CourtForm`, `courtService` CRUD. |
| **Características** (Indoor/Outdoor, tipo cristal) | ✅ Sí | `CourtForm`: indoor, glass_type (normal/panoramic). |
| **Toggle estado en tiempo real** (Operativa / En mantenimiento) | ⚠️ Parcial | Campo `status` en BD y tipo Court; en `CourtForm` se puede editar. No hay toggle rápido en lista/card. |
| **Bloqueo de reservas** cuando cancha en mantenimiento | ❌ No | Lógica de negocio en motor de reservas no comprueba `court.status`. |

---

## 3. Módulo Motor de Tarifas (Pricing Engine)

| Requisito | Estado | Notas |
|-----------|--------|--------|
| **Vista precios por Cancha, Día, Rango horario** | ❌ No | Tabla `pricing_rules` existe; no hay rutas CRUD ni UI en el panel. |
| **Validación frontend: rangos sin solapamiento** | ❌ No | No existe vista de tarifas. |
| **Backend: guardar en céntimos** | ❌ No | No hay API de pricing_rules; cuando exista, debe persistir `amount_cents`. |

---

## 4. Onboarding de club (flujo completo)

| Requisito | Estado | Notas |
|-----------|--------|--------|
| **1. Fase Lead** (nombre, apellidos, club, ubicación, teléfono, email, n.º pistas, deporte) | ✅ Sí | `ClubRegistration` + POST `/club-applications`. |
| **2. Configuración Manager – Información general** (nombre oficial, dirección, descripción, logo, fotos) | ⚠️ Parcial | `ClubForm` cubre parte; no hay subida de logo/fotos. Onboarding es checklist, no formulario guiado. |
| **2. Configuración Manager – Pistas** (tipo cristal/muro, cubierta, iluminación) | ⚠️ Parcial | `CourtForm` tiene indoor, glass_type; no “muro” explícito. Checklist en Onboarding. |
| **2. Configuración Manager – Horarios y tarifas** (apertura/cierre, precios por franja, duración 60/90 min) | ❌ No | No hay UI de horarios del club ni de tarifas. |
| **2. Configuración Manager – Políticas** (ventana reserva, cancelación) | ❌ No | No hay UI para estos campos (en BD podrían ir en club o tabla aparte). |
| **2. Configuración Manager – Datos bancarios** (Stripe + CIF/NIF, dirección fiscal) | ❌ No | No hay flujo Stripe Connect ni pantalla “Datos bancarios”. CIF/dirección en ClubForm. |
| **3. Go-Live – Elección de plan** (Standard, Pro, Champion, Master) | ❌ No | Solo checklist en `ManagerOnboarding`; no selección de plan ni precios. |
| **3. Go-Live – Configuración Stripe** | ❌ No | Sin flujo Stripe. |
| **3. Go-Live – Carga de inventario** (≥1 pista + precio) | ❌ No | Sin validación ni checklist real (inventario sí existe vía courts). |
| **3. Go-Live – Revisión de soporte / activar visibilidad** | ❌ No | Sin flujo ni campo “visibilidad” del club. |

---

## 5. Módulo Operativo de Reservas

| Requisito | Estado | Notas |
|-----------|--------|--------|
| **Grilla ocupación** (Canchas Y vs bloques tiempo X) | ❌ No | No hay vista de calendario/grilla de reservas en el panel. |
| **Supabase Realtime** (reserva en app → se pinta al instante en panel) | ❌ No | No hay suscripciones Realtime en web-app. |
| **Detalle reserva** (organizador, participantes, estado cuota) | ❌ No | No hay vista de detalle de reserva en el panel. |
| **Cancelación manual** (botón cancelar → estado Cancelada) | ⚠️ Parcial | API `bookings` tiene PUT y DELETE; no hay UI en panel. |
| **Edge Function + Stripe reembolsos** al cancelar | ❌ No | No hay Edge Function que llame a Stripe para refund. |
| **Indicador partidos públicos** (matchmaking) en grilla | ❌ No | No hay grilla ni campo de visibilidad de partido. |

---

## 6. Módulo de Inteligencia Financiera y Trazabilidad

| Requisito | Estado | Notas |
|-----------|--------|--------|
| **Dashboard conciliación (payouts)** | ❌ No | No hay vista que sume reservas completadas / payouts. |
| **Desglose transaccional** (registro por registro, monto cobrado) | ❌ No | Tabla `payment_transactions` existe; no hay listado ni reporte en panel. |
| **Transparencia comisiones** (Total − Comisión = Ingreso neto club) | ❌ No | No hay vista ni campos de comisión en transacciones. |
| **Resolución disputas** (PaymentIntent ID, estado financiero) | ❌ No | No hay vista de transacciones con stripe_payment_intent_id y estado. |

---

## Resumen

| Área | Cumplido | Parcial | No implementado |
|------|----------|---------|------------------|
| Onboarding financiero / Stripe & KYC | 0 | 2 | 5 |
| Inventario canchas | 2 | 2 | 1 |
| Motor de tarifas | 0 | 0 | 3 |
| Onboarding club (3 fases) | 1 | 2 | 7 |
| Reservas (grilla, realtime, ciclo de vida) | 0 | 1 | 5 |
| Inteligencia financiera | 0 | 0 | 4 |

**Conclusión:** El flujo actual **no cumple** con todos los requisitos. Están cubiertos: **Fase Lead** del onboarding, **ABM de canchas** con características básicas, y **datos fiscales/club** en formularios existentes. Falta, entre otros: integración real con Stripe Connect y KYC, motor de tarifas (UI + API), grilla de reservas con Realtime, flujo Go-Live con planes, y todo el módulo financiero (conciliación, transacciones, comisiones, disputas).

---

## Próximos pasos sugeridos (orden recomendado)

1. **Stripe Connect + KYC**: endpoint que cree `accountLinks`, pantalla “Vincular cuenta” que redirija, webhook `account.updated` para actualizar `kyc_status`.
2. **Horarios del club**: UI para editar `weekly_schedule` (matriz día / apertura–cierre).
3. **Motor de tarifas**: CRUD `pricing_rules` en backend (guardar en céntimos), UI por cancha/día/franja con validación de solapamientos.
4. **Grilla de reservas**: vista Canchas × Tiempo + integración Realtime de Supabase.
5. **Gestión ciclo de vida reserva**: detalle, cancelación en UI, Edge Function para reembolsos Stripe.
6. **Dashboard financiero**: listado de transacciones, desglose Total / Comisión / Neto, PaymentIntent ID y estado.
