# Informe de funcionalidades "Próximamente" o no desarrolladas en `mobile-app`

Fecha: 2026-07-06

## Objetivo

Identificar de forma exhaustiva en `mobile-app`:

- botones o acciones visibles que hoy no hacen nada o muestran un placeholder,
- pantallas o secciones marcadas como `Próximamente`,
- flujos parcialmente implementados,
- textos de producto que anuncian funciones futuras.

## Metodología

Se revisó `mobile-app/src` de forma amplia, incluyendo:

- `screens/`
- `components/`
- `i18n/locales/es/`
- flujos de navegación y acciones `onPress`
- botones `disabled`
- `Alert.alert(...)` usados como placeholder
- callbacks vacíos o de prueba

Se descartaron falsos positivos técnicos como placeholders de imágenes, textos guía de inputs o deshabilitados normales por loading/validación.

## Resumen ejecutivo

Los hallazgos más claros se concentran en estas áreas:

1. `ClubDetailScreen`
2. `CoursesScreen`
3. `PublicProfileScreen`
4. `CommunityScreen`
5. creación de partidos
6. búsqueda de clubes / favoritos
7. monedero
8. detalle de reserva y detalle de partido

## Hallazgos confirmados

### 1. Comunidad

#### 1.1 Noticias en comunidad está en `Próximamente`

- Archivo: `src/screens/CommunityScreen.tsx`
- Evidencia:
  - la tab alternativa a `feed` y `reels` renderiza `ComingSoon`
  - usa `t('community.newsComingSoon')`
- Estado: `No desarrollado`
- Impacto: hay una tab visible de producto sin funcionalidad real.

#### 1.2 Componente reusable de coming soon

- Archivo: `src/components/community/ComingSoon.tsx`
- Evidencia:
  - muestra `t('common.comingSoonSection')`
  - muestra badge `t('common.comingSoon').toUpperCase()`
- Estado: `Placeholder explícito`
- Impacto: confirma que la sección de noticias fue diseñada como futura, no como bug temporal.

### 2. Perfil público

#### 2.1 Botón `Seguir` visible pero sin acción

- Archivo: `src/screens/PublicProfileScreen.tsx`
- Evidencia:
  - `onPress={() => {}}`
  - comentario inline indicando placeholder
- Estado: `No desarrollado`
- Impacto: acción social principal expuesta al usuario sin comportamiento.

#### 2.2 Followers / following sin datos reales

- Archivo: `src/screens/PublicProfileScreen.tsx`
- Evidencia:
  - ambos contadores muestran `--`
- Estado: `Parcialmente desarrollado`
- Impacto: la capa visual existe, pero no está conectada a datos funcionales.

### 3. Cursos

#### 3.1 Botón de filtros del header sin `onPress`

- Archivo: `src/screens/CoursesScreen.tsx`
- Evidencia:
  - `Pressable style={styles.filterButton}` sin handler
- Estado: `No desarrollado`
- Impacto: control visible que sugiere una función inexistente.

#### 3.2 Filtro `Cerca de mí` sin implementación

- Archivo: `src/screens/CoursesScreen.tsx`
- Evidencia:
  - pill renderizado sin `onPress`
- Estado: `No desarrollado`
- Impacto: aparenta filtro geográfico, pero no ejecuta nada.

#### 3.3 Filtro `Clases públicas` cambia visualmente pero no afecta resultados

- Archivo: `src/screens/CoursesScreen.tsx`
- Evidencia:
  - existe `filterPublic`
  - `filteredCourses` solo filtra por `searchQuery`
- Estado: `Parcialmente desarrollado`
- Impacto: sensación de filtro activo sin efecto real.

#### 3.4 Cancelar inscripción en "Tus clases" es placeholder

- Archivo: `src/screens/CoursesScreen.tsx`
- Evidencia:
  - `onCancel={() => { console.log("Cancel enrollment placeholder"); }}`
- Estado: `No desarrollado`
- Impacto: el usuario podría tener CTA visible sin capacidad real de cancelar.

#### 3.5 Reserva de clase con fallback `Próximamente`

- Archivo: `src/components/schoolCourses/PublicCourseBookingSuccessModal.tsx`
- Evidencia:
  - si no hay `course.days[0]`, usa `t("learning.schoolComingSoon")`
- Estado: `Parcialmente desarrollado`
- Impacto: ante datos incompletos se muestra copy de feature/estado futuro.

### 4. Club detail

#### 4.1 Tab de competiciones mostrada como `Próximamente`

- Archivo: `src/screens/ClubDetailScreen.tsx`
- Evidencia:
  - label del tab: `t("common.comingSoon")`
  - contenido de la tab: empty state completo con `comingSoon`
- Estado: `No desarrollado`
- Impacto: navegación visible a una sección aún no operativa.

#### 4.2 Botones de header de notificaciones y favoritos sin acción

- Archivo: `src/screens/ClubDetailScreen.tsx`
- Evidencia:
  - ambos `Pressable` no tienen `onPress`
- Estado: `No desarrollado`
- Impacto: dos affordances claras de producto no conectadas.

#### 4.3 Botón de búsqueda del selector de fechas sin acción

- Archivo: `src/screens/ClubDetailScreen.tsx`
- Evidencia:
  - `Pressable style={styles.dateSearchBtn}` sin `onPress`
- Estado: `No desarrollado`
- Impacto: parece una búsqueda/filtro adicional inexistente.

#### 4.4 Favoritos / alertas de reserva con copy de `Próximamente`

- Archivo: `src/screens/ClubDetailScreen.tsx`
- Evidencia:
  - bloque con `t("alerts.favorites.title")`
  - subtítulo `t("common.comingSoonSection")`
  - switch cambia solo estado local
- Estado: `Parcialmente desarrollado`
- Impacto: hay UI, pero sin persistencia ni integración visible.

#### 4.5 Alertas de partidos abiertos parcialmente implementadas

- Archivo: `src/screens/ClubDetailScreen.tsx`
- Evidencia:
  - botón `manage alerts` sin `onPress`
  - botón muestra `t("common.comingSoon")`
  - switch solo modifica estado local
- Estado: `Parcialmente desarrollado`
- Impacto: la funcionalidad parece en maqueta avanzada pero no operativa.

#### 4.6 Botones `Ubicación`, `Web` y `Teléfono` del club sin implementación real

- Archivo: `src/screens/ClubDetailScreen.tsx`
- Evidencia:
  - los tres `Pressable` no tienen `onPress`
- Estado: `No desarrollado`
- Impacto: acciones de alta intención sin comportamiento.

#### 4.7 Bloque de mapa es placeholder visual

- Archivo: `src/screens/ClubDetailScreen.tsx`
- Evidencia:
  - renderiza `styles.mapPlaceholder`
  - no hay mapa real ni launcher
- Estado: `Placeholder`
- Impacto: la sección de ubicación está incompleta.

#### 4.8 Amenity y horario con fallback `Próximamente`

- Archivo: `src/screens/ClubDetailScreen.tsx`
- Evidencia:
  - amenity usa `t("common.comingSoon")`
  - horario usa `scheduleText ?? t("common.comingSoonSection")`
- Estado: `Parcialmente desarrollado`
- Impacto: datos del club no siempre están resueltos y caen en placeholders de producto.

### 5. Búsqueda y favoritos

#### 5.1 Guardar club en favoritos no está implementado

- Archivo: `src/screens/MatchSearchScreen.tsx`
- Evidencia:
  - `onFavoritePress` solo hace `Alert.alert(...)`
  - usa texto de traducción de función futura
- Estado: `No desarrollado`
- Impacto: la acción existe en UI pero no persiste nada.

#### 5.2 Texto de traducción confirma futura implementación de favoritos

- Archivo: `src/i18n/locales/es/search.ts`
- Evidencia:
  - `Próximamente podrás guardar «{clubName}» en favoritos.`
- Estado: `Placeholder explícito`

### 6. Monedero

#### 6.1 `Membresías de clubes` está deshabilitado y marcado como futuro

- Archivo: `src/screens/MonederoScreen.tsx`
- Evidencia:
  - `LinkRow ... disabled`
  - subtítulo `t('wallet.clubMembershipsSoon')`
- Estado: `No desarrollado`
- Impacto: función visible pero bloqueada.

#### 6.2 `Cargar saldo` y `Retirar` aparecen deshabilitados

- Archivo: `src/screens/MonederoScreen.tsx`
- Evidencia:
  - ambos botones se renderizan deshabilitados
- Estado: `No desarrollado`
- Impacto: acciones financieras clave aún no disponibles desde la app.

#### 6.3 Traducciones preparadas para carga/retiro futuro

- Archivo: `src/i18n/locales/es/wallet.ts`
- Evidencia:
  - `walletLoadFundsSoon`
  - `walletWithdrawSoon`
- Estado: `Funcionalidad futura prevista`
- Nota: no se detectó uso directo actual en UI.

### 7. Crear partido

#### 7.1 Opción `pista externa` visible pero bloqueada

- Archivo: `src/components/partido/CrearPartidoLocationSheet.tsx`
- Evidencia:
  - tarjeta visible
  - `disabled={true}`
  - copy: `Ya sé en qué pista voy a jugar (Próximamente)`
- Estado: `No desarrollado`
- Impacto: flujo previsto, pero imposibilitado desde UI.

#### 7.2 Header info button sin acción en crear partido

- Archivo: `src/components/partido/CrearPartidoLocationSheet.tsx`
- Evidencia:
  - botón de icono `information-circle-outline` sin `onPress`
- Estado: `No desarrollado`
- Impacto: control auxiliar visible sin comportamiento.

#### 7.3 Paso `pista_externa` existe como maqueta, pero no está habilitado

- Archivo: `src/components/partido/CrearPartidoLocationSheet.tsx`
- Evidencia:
  - hay UI extensa para ese paso
  - el acceso está bloqueado desde el selector principal
- Estado: `Parcialmente desarrollado`
- Impacto: hay trabajo adelantado, pero el flujo no forma parte del producto activo.

### 8. Detalle de reserva y detalle de partido

#### 8.1 Acción `Web` en reserva privada muestra placeholder

- Archivo: `src/screens/CourtReservationDetailScreen.tsx`
- Evidencia:
  - `Alert.alert(t('alerts.web.title'), t('alerts.web.body'))`
- Estado: `No desarrollado`

#### 8.2 Acción `Teléfono` en reserva privada muestra placeholder

- Archivo: `src/screens/CourtReservationDetailScreen.tsx`
- Evidencia:
  - `Alert.alert(t('alerts.phone.title'), t('alerts.phone.body'))`
- Estado: `No desarrollado`

#### 8.3 Acción `Web` en detalle de partido muestra placeholder

- Archivo: `src/screens/PartidoDetailScreen.tsx`
- Evidencia:
  - `Alert.alert(t('alerts.web.title'), t('alerts.web.body'))`
- Estado: `No desarrollado`

#### 8.4 Acción `Teléfono` en detalle de partido muestra placeholder

- Archivo: `src/screens/PartidoDetailScreen.tsx`
- Evidencia:
  - `Alert.alert(t('alerts.phone.title'), t('alerts.phone.body'))`
- Estado: `No desarrollado`

#### 8.5 Traducciones centrales de `Web` / `Teléfono` están definidas como futuras

- Archivo: `src/i18n/locales/es/alerts.ts`
- Evidencia:
  - `Enlace del club disponible próximamente.`
  - `Contacto del club disponible próximamente.`
- Estado: `Placeholder explícito`

### 9. Otros placeholders detectados

#### 9.1 Badge de torneo en modal de confirmación usa `Próximamente`

- Archivo: `src/components/partido/PrivateReservationModal.tsx`
- Evidencia:
  - cuando `kind === 'tournament'`, renderiza `t('common.comingSoon')`
- Estado: `Parcialmente desarrollado`
- Impacto: indica flujo de torneo todavía no resuelto en este modal.

#### 9.2 Traducción de perfil con `comingSoon` preparada para uso futuro

- Archivo: `src/i18n/locales/es/alerts.ts`
- Evidencia:
  - `alerts.profile.comingSoon`
- Estado: `Futura / no conectada`

#### 9.3 Traducción de invitaciones privadas pospago indica capacidad diferida

- Archivo: `src/i18n/locales/es/partidos.ts`
- Evidencia:
  - `Tras confirmar el pago podrás invitar jugadores en la app.`
- Estado: `Flujo dependiente / futuro parcial`
- Nota: no es un bug, pero sí una capacidad no disponible en todas las etapas del flujo.

## Hallazgos priorizados

### Alta prioridad UX

- `src/screens/PublicProfileScreen.tsx` -> botón `Seguir` sin acción
- `src/screens/CoursesScreen.tsx` -> cancelar inscripción placeholder
- `src/screens/MatchSearchScreen.tsx` -> favoritos no implementados
- `src/screens/ClubDetailScreen.tsx` -> botones de header, acciones del club y alertas sin backend/persistencia
- `src/components/partido/CrearPartidoLocationSheet.tsx` -> `pista externa` anunciada pero no disponible

### Media prioridad UX

- `src/screens/CoursesScreen.tsx` -> filtros sin efecto real
- `src/screens/MonederoScreen.tsx` -> carga/retiro/membresías deshabilitados
- `src/screens/CourtReservationDetailScreen.tsx` y `src/screens/PartidoDetailScreen.tsx` -> `Web` y `Teléfono` en placeholder

### Baja prioridad o residual

- `src/components/schoolCourses/PublicCourseBookingSuccessModal.tsx` -> fallback `Próximamente`
- `src/components/partido/PrivateReservationModal.tsx` -> badge de torneo en `Próximamente`
- claves de i18n preparadas pero aún no conectadas

## Áreas revisadas sin hallazgos fuertes

Estas zonas fueron revisadas sin encontrar el mismo patrón de placeholders funcionales:

- `src/screens/MainApp.tsx`
- `src/screens/PreferencesScreen.tsx`
- `src/screens/EditProfileScreen.tsx`
- `src/screens/MessagesScreen.tsx`
- `src/screens/DirectMessageThreadScreen.tsx`
- `src/screens/TournamentDetailScreen.tsx`
- `src/components/partido/PrivateMatchInvitesSection.tsx`
- `src/components/matchmaking/PlayerSelectModal.tsx`

## Conclusión

`mobile-app` sí tiene varias funcionalidades visibles que hoy están:

- explícitamente en `Próximamente`,
- renderizadas pero sin acción,
- o parcialmente conectadas solo a estado local / placeholders.

La mayor concentración está en `ClubDetailScreen`, `CoursesScreen`, `PublicProfileScreen`, creación de partidos y monedero.
