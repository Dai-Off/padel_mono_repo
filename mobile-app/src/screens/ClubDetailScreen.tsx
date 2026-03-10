import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SearchCourtResult } from '../api/search';
import { theme } from '../theme';

type ClubDetailScreenProps = {
  court: SearchCourtResult;
  onClose: () => void;
};

const TABS = ['Home', 'Reservar', 'Partidos abiertos', 'Competiciones'] as const;
type TabId = (typeof TABS)[number];

const DAYS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];


function getCerramientoLabel(indoor: boolean): string {
  return indoor ? 'Indoor' : 'Exterior';
}

function getParedesLabel(glassType: string): string {
  return glassType === 'panoramic' ? 'Panorámico' : 'Muro';
}

function getNextDays(count: number) {
  const out: { day: number; dayName: string; month: string; date: Date }[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      day: d.getDate(),
      dayName: DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1],
      month: MONTHS[d.getMonth()],
      date: d,
    });
  }
  return out;
}

export function ClubDetailScreen({ court, onClose }: ClubDetailScreenProps) {
  const [activeTab, setActiveTab] = useState<TabId>('Home');
  const [selectedDateIndex, setSelectedDateIndex] = useState(1);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [partidosAlertsEnabled, setPartidosAlertsEnabled] = useState(false);
  const dateOptions = getNextDays(7);

  return (
    <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Volver"
          >
            <Ionicons name="arrow-back" size={20} color="#1A1A1A" />
          </Pressable>
          <View style={styles.headerRight}>
            <Pressable style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <Ionicons name="notifications-outline" size={20} color="#1A1A1A" />
            </Pressable>
            <Pressable style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <Ionicons name="heart-outline" size={20} color="#1A1A1A" />
            </Pressable>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsContent}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={({ pressed }) => [
                styles.tab,
                activeTab === tab ? styles.tabActive : styles.tabInactive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab ? styles.tabTextActive : styles.tabTextInactive,
                ]}
                numberOfLines={1}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: theme.scrollBottomPadding },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <LinearGradient
              colors={['#1a1a1a', '#2a2a2a']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <View style={styles.heroOrb} />
              <View style={styles.heroContent}>
                <View style={styles.statusRow}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>Abierto ahora</Text>
                </View>
                <Text style={styles.heroTitle}>{court.clubName}</Text>
                <View style={styles.heroLocation}>
                  <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.heroAddress} numberOfLines={1}>
                    {court.address || court.city}
                  </Text>
                </View>
                <View style={styles.heroStats}>
                  <View style={styles.heroStat}>
                    <Ionicons name="star" size={12} color="#fbbf24" />
                    <Text style={styles.heroStatText}>4.8</Text>
                  </View>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatText}>1 Pista</Text>
                  </View>
                  {court.distanceKm != null && (
                    <View style={styles.heroStat}>
                      <Text style={styles.heroStatText}>{Math.round(court.distanceKm)}km</Text>
                    </View>
                  )}
                </View>
              </View>
            </LinearGradient>
          </View>

          {activeTab === 'Reservar' ? (
            <>
              <View style={styles.section}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.datePickerRow}>
                  <Pressable style={styles.dateSearchBtn}>
                    <Ionicons name="search-outline" size={16} color="#6b7280" />
                  </Pressable>
                  {dateOptions.map((opt, i) => (
                    <Pressable
                      key={i}
                      onPress={() => setSelectedDateIndex(i)}
                      style={({ pressed }) => [
                        styles.dateBtn,
                        selectedDateIndex === i ? styles.dateBtnActive : styles.dateBtnInactive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.dateDayName, selectedDateIndex === i && styles.dateTextActive]}>{opt.dayName}</Text>
                      <Text style={[styles.dateDayNum, selectedDateIndex === i && styles.dateTextActive]}>{opt.day}</Text>
                      <Text style={[styles.dateMonth, selectedDateIndex === i && styles.dateTextActive]}>{opt.month}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.section}>
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Mostrar solo disponibles</Text>
                  <Switch
                    value={showOnlyAvailable}
                    onValueChange={setShowOnlyAvailable}
                    trackColor={{ false: '#e5e7eb', true: '#E31E24' }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
              <View style={styles.section}>
                <View style={styles.timeSlotsGrid}>
                  {(court.timeSlots ?? []).length > 0 ? (
                    <>
                      <View style={styles.timeSlotsRow}>
                        {court.timeSlots!.slice(0, 3).map((slot) => (
                          <Pressable key={slot} style={({ pressed }) => [styles.timeSlotBtn, pressed && styles.pressed]}>
                            <Text style={styles.timeSlotText}>{slot}</Text>
                          </Pressable>
                        ))}
                      </View>
                      {court.timeSlots!.length > 3 && (
                        <View style={styles.timeSlotsRow}>
                          {court.timeSlots!.slice(3).map((slot) => (
                            <Pressable key={slot} style={({ pressed }) => [styles.timeSlotBtn, pressed && styles.pressed]}>
                              <Text style={styles.timeSlotText}>{slot}</Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </>
                  ) : (
                    <Text style={styles.partidosEmptySubtitle}>Sin horarios disponibles</Text>
                  )}
                </View>
              </View>
              <View style={styles.section}>
                <View style={styles.alertHeader}>
                  <View>
                    <View style={styles.alertTitleRow}>
                      <Ionicons name="notifications-outline" size={16} color="#f97316" />
                      <Text style={styles.alertSectionTitle}>Alertas prioritarias</Text>
                    </View>
                    <Text style={styles.alertSub}>Configura tu alerta con un click</Text>
                  </View>
                  <Switch
                    value={alertsEnabled}
                    onValueChange={setAlertsEnabled}
                    trackColor={{ false: '#e5e7eb', true: '#E31E24' }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.reservaTitle}>Reserva una pista</Text>
                <Text style={styles.reservaSub}>Crea un partido privado e invita a tus amigos</Text>
                <View style={styles.courtList}>
                  <Pressable style={({ pressed }) => [styles.courtRow, pressed && styles.pressed]}>
                    <View style={styles.courtRowLeft}>
                      <Text style={styles.courtName}>{court.courtName}</Text>
                      <Text style={styles.courtSub}>
                        {getCerramientoLabel(court.indoor)} | {getParedesLabel(court.glassType)} | Dobles
                      </Text>
                    </View>
                    <Ionicons name="chevron-down" size={20} color="#9ca3af" />
                  </Pressable>
                </View>
              </View>
            </>
          ) : activeTab === 'Partidos abiertos' ? (
            <>
              <View style={styles.partidosFiltersWrap}>
                <View style={styles.partidosFilters}>
                  <Pressable style={({ pressed }) => [styles.partidosFilterBtn, pressed && styles.pressed]}>
                    <Text style={styles.partidosFilterText}>Todos los deportes</Text>
                    <Ionicons name="chevron-down" size={14} color="#fff" />
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.partidosFilterBtn, pressed && styles.pressed]}>
                    <Text style={styles.partidosFilterText}>Cualquier día</Text>
                    <Ionicons name="chevron-down" size={14} color="#fff" />
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.partidosFilterBtn, pressed && styles.pressed]}>
                    <Text style={styles.partidosFilterText}>Mixto</Text>
                    <Ionicons name="chevron-down" size={14} color="#fff" />
                  </Pressable>
                </View>
              </View>
              <View style={[styles.section, styles.partidosEmptySection]}>
                <View style={styles.partidosEmptyState}>
                  <View style={styles.partidosEmptyIcon}>
                    <Text style={styles.partidosEmptyEmoji}>🎾</Text>
                  </View>
                  <Text style={styles.partidosEmptyTitle}>No hay pistas disponibles hoy</Text>
                  <Text style={styles.partidosEmptySubtitle}>Prueba otro día o busca en otro club</Text>
                </View>
              </View>
              <View style={styles.section}>
                <View style={styles.partidosAlertHeader}>
                  <Ionicons name="notifications-outline" size={16} color="#f97316" />
                  <Text style={styles.partidosAlertTitle}>Alertas prioritarias</Text>
                </View>
                <Text style={styles.partidosAlertDesc}>Configura tu alerta con tus preferencias predefinidas</Text>
                <View style={styles.partidosAlertRow}>
                  <Pressable style={({ pressed }) => [styles.manageAlertsBtn, pressed && styles.pressed]}>
                    <Text style={styles.manageAlertsText}>Gestionar alertas</Text>
                  </Pressable>
                  <Switch
                    value={partidosAlertsEnabled}
                    onValueChange={setPartidosAlertsEnabled}
                    trackColor={{ false: '#e5e7eb', true: '#E31E24' }}
                    thumbColor="#fff"
                  />
                </View>
              </View>
              <View style={styles.section}>
                <Text style={styles.partidosReservaTitle}>Reserva una plaza en un partido</Text>
                <Text style={styles.partidosReservaSub}>No hay Partidos Abiertos disponibles ahora.</Text>
                <View style={styles.partidosReservaHint}>
                  <Text style={styles.partidosReservaHintText}>Prueba más tarde</Text>
                  <Text style={styles.partidosClockEmoji}>⏰</Text>
                </View>
              </View>
            </>
          ) : activeTab === 'Competiciones' ? (
            <>
              <View style={styles.partidosFiltersWrap}>
                <View style={styles.partidosFilters}>
                  <Pressable style={({ pressed }) => [styles.partidosFilterBtn, pressed && styles.pressed]}>
                    <Text style={styles.partidosFilterText}>Todos los deportes</Text>
                    <Ionicons name="chevron-down" size={14} color="#fff" />
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.partidosFilterBtn, pressed && styles.pressed]}>
                    <Text style={styles.partidosFilterText}>Cualquier día</Text>
                    <Ionicons name="chevron-down" size={14} color="#fff" />
                  </Pressable>
                  <Pressable style={({ pressed }) => [styles.partidosFilterBtn, pressed && styles.pressed]}>
                    <Text style={styles.partidosFilterText}>Mixto</Text>
                    <Ionicons name="chevron-down" size={14} color="#fff" />
                  </Pressable>
                </View>
              </View>
              <View style={styles.partidosEmptySection}>
                <View style={styles.partidosEmptyState}>
                  <View style={styles.partidosEmptyIcon}>
                    <Text style={styles.partidosEmptyEmoji}>🏆</Text>
                  </View>
                  <Text style={styles.partidosEmptyTitle}>No hay competiciones</Text>
                  <Text style={styles.partidosEmptySubtitle}>Próximamente podrás ver competiciones de este club</Text>
                </View>
              </View>
            </>
          ) : (
            <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Información del club</Text>
            <View style={styles.tagsRow}>
              <View style={styles.tag}>
                <Text style={styles.tagText}>🎾 Pádel</Text>
              </View>
              <View style={styles.tag}>
                <Text style={styles.tagText}>🎾 Tenis</Text>
              </View>
            </View>
            <Text style={styles.pistasLabel}>Pista disponible</Text>
            <View style={styles.amenitiesRow}>
              <View style={styles.amenity}>
                <Ionicons name="accessibility-outline" size={14} color="#6b7280" />
                <Text style={styles.amenityText}>Accesible</Text>
              </View>
              <View style={styles.amenity}>
                <Ionicons name="construct-outline" size={14} color="#6b7280" />
                <Text style={styles.amenityText}>Alquiler de material</Text>
              </View>
              <View style={styles.amenity}>
                <Ionicons name="car-outline" size={14} color="#6b7280" />
                <Text style={styles.amenityText}>Parking</Text>
              </View>
            </View>
            <View style={styles.tagsRow}>
              <View style={styles.tag}>
                <Text style={styles.tagText}>{getCerramientoLabel(court.indoor)}</Text>
              </View>
              <View style={styles.tag}>
                <Text style={styles.tagText}>{getParedesLabel(court.glassType)}</Text>
              </View>
            </View>
            <View style={styles.actionsRow}>
              <Pressable style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
                <Ionicons name="navigate" size={20} color="#fff" />
                <Text style={styles.actionLabel}>CÓMO LLEGAR</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.actionButtonOutline, pressed && styles.pressed]}>
                <Ionicons name="globe-outline" size={20} color="#6b7280" />
                <Text style={styles.actionLabelOutline}>WEB</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.actionButtonOutline, pressed && styles.pressed]}>
                <Ionicons name="call-outline" size={20} color="#6b7280" />
                <Text style={styles.actionLabelOutline}>LLAMAR</Text>
              </Pressable>
            </View>
            <View style={styles.mapPlaceholder}>
              <Text style={styles.mapPlaceholderText}>Mapa de ubicación</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Horarios</Text>
            <View style={[styles.scheduleRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.scheduleDay}>Horarios</Text>
              <Text style={styles.scheduleHours}>Consulta en el club</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Promociones</Text>
            <View style={styles.partidosEmptyState}>
              <Text style={styles.partidosEmptySubtitle}>No hay promociones disponibles</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Jugadores</Text>
            <View style={styles.partidosEmptyState}>
              <Text style={styles.partidosEmptySubtitle}>No hay datos de jugadores</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Resultados recientes</Text>
            <View style={styles.partidosEmptyState}>
              <Text style={styles.partidosEmptySubtitle}>No hay resultados recientes</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>¿Tienes cuenta en este Club?</Text>
            <Pressable style={({ pressed }) => [styles.accountCard, pressed && styles.pressed]}>
              <Text style={styles.accountText}>
                Asocia tu cuenta y recibe los mismos beneficios que te ofrece el club.
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </Pressable>
          </View>
            </>
          )}
        </ScrollView>
      </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    ...theme.headerPadding,
    backgroundColor: '#FAFAFA',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  pressed: { opacity: 0.8 },
  tabsScroll: {
    flexGrow: 0,
    backgroundColor: '#FAFAFA',
  },
  tabsContent: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    paddingRight: theme.spacing.lg + 8,
    paddingBottom: theme.spacing.sm,
  },
  tab: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderRadius: 12,
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: '#1A1A1A',
  },
  tabInactive: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  tabText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  tabTextInactive: {
    color: '#6b7280',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 40,
  },
  hero: {
    marginBottom: theme.spacing.lg,
    borderRadius: 16,
    overflow: 'hidden',
  },
  heroGradient: {
    padding: theme.spacing.lg,
    position: 'relative',
  },
  heroOrb: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(227, 30, 36, 0.1)',
  },
  heroContent: {
    position: 'relative',
    zIndex: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  heroLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroAddress: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.5)',
  },
  heroStats: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  heroStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  heroStatText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: theme.spacing.md,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  tagText: {
    fontSize: theme.fontSize.xs,
    color: '#6b7280',
    fontWeight: '500',
  },
  pistasLabel: {
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
    marginBottom: theme.spacing.lg,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  actionButtonOutline: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
  },
  actionLabelOutline: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
  },
  mapPlaceholder: {
    height: 144,
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: {
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
  },
  scheduleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f9fafb',
  },
  scheduleDay: {
    fontSize: theme.fontSize.xs,
    color: '#6b7280',
  },
  scheduleHours: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  amenitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  amenity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
  },
  amenityText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '500',
    color: '#6b7280',
  },
  promoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: '#f9fafb',
    borderRadius: 16,
  },
  promoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  promoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(227, 30, 36, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoEmoji: {
    fontSize: 18,
  },
  promoTextWrap: {
    flex: 1,
  },
  promoTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  promoSub: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  promoCta: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: '#E31E24',
  },
  topPlayersScroll: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.lg,
  },
  topPlayerItem: {
    alignItems: 'center',
    flexShrink: 0,
  },
  topPlayerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  topPlayerImg: {
    width: '100%',
    height: '100%',
  },
  topPlayerInitial: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: '#fff',
  },
  topPlayerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#E31E24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topPlayerRank: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  topPlayerName: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: '500',
    marginTop: 6,
    maxWidth: 48,
    textAlign: 'center',
  },
  resultCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  resultDate: {
    fontSize: 10,
    color: '#9ca3af',
    textAlign: 'right',
    marginBottom: theme.spacing.sm,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  resultTeams: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  resultTeam: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  resultName: {
    fontSize: 9,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  resultLevel: {
    backgroundColor: '#fde047',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  resultLevelText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  resultScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resultScoreWin: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  resultScoreLose: {
    fontSize: 24,
    fontWeight: '800',
    color: '#d1d5db',
  },
  resultScoreDash: {
    fontSize: 18,
    color: '#d1d5db',
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: '#f9fafb',
    borderRadius: 16,
  },
  accountText: {
    fontSize: theme.fontSize.xs,
    color: '#6b7280',
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.lg,
  },
  dateSearchBtn: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBtn: {
    width: 48,
    height: 56,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dateBtnActive: {
    backgroundColor: '#1A1A1A',
  },
  dateBtnInactive: {
    backgroundColor: 'transparent',
  },
  dateDayName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
  },
  dateDayNum: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6b7280',
  },
  dateMonth: {
    fontSize: 10,
    color: '#6b7280',
  },
  dateTextActive: {
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: '500',
    color: '#6b7280',
  },
  timeSlotsGrid: {
    gap: theme.spacing.xs,
  },
  timeSlotsRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  timeSlotBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeSlotText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#6b7280',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  alertSectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  alertSub: {
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
  },
  reservaTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  reservaSub: {
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
    marginBottom: theme.spacing.md,
  },
  courtList: {
    gap: theme.spacing.xs,
  },
  courtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#fff',
  },
  courtRowLeft: {
    flex: 1,
  },
  courtName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  courtSub: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  partidosFiltersWrap: {
    marginBottom: theme.spacing.md,
  },
  partidosFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  partidosFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
  },
  partidosFilterText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#fff',
  },
  partidosEmptySection: {
    padding: 40,
  },
  partidosEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  partidosEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  partidosEmptyEmoji: {
    fontSize: 30,
  },
  partidosEmptyTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
    textAlign: 'center',
  },
  partidosEmptySubtitle: {
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
    textAlign: 'center',
  },
  partidosAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  partidosAlertTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  partidosAlertDesc: {
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
    marginBottom: theme.spacing.sm,
  },
  partidosAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageAlertsBtn: {
    paddingVertical: 4,
  },
  manageAlertsText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    color: '#E31E24',
  },
  partidosReservaTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  partidosReservaSub: {
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
    marginBottom: 8,
  },
  partidosReservaHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  partidosReservaHintText: {
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
  },
  partidosClockEmoji: {
    fontSize: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  emptyStateEmoji: {
    fontSize: 28,
  },
  emptyStateTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  emptyStateSub: {
    fontSize: theme.fontSize.xs,
    color: '#9ca3af',
  },
  compCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  compCardBar: {
    height: 4,
    backgroundColor: '#E31E24',
  },
  compCardContent: {
    padding: theme.spacing.lg,
  },
  compCardDate: {
    fontSize: 10,
    color: '#9ca3af',
    marginBottom: theme.spacing.sm,
  },
  compCardMain: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  compCardIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(227, 30, 36, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compCardBody: {
    flex: 1,
  },
  compCardDateTime: {
    fontSize: 10,
    color: '#9ca3af',
    marginBottom: 4,
  },
  compCardTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  compCardTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  compTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  compTagText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#6b7280',
  },
  compCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: theme.spacing.sm,
  },
  compCardMetaText: {
    fontSize: 10,
    color: '#9ca3af',
  },
  compCardTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compTeamDots: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compTeamDot: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  compCardTeamsText: {
    fontSize: 10,
    color: '#9ca3af',
    fontWeight: '500',
  },
  compCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#f9fafb',
  },
  compCardVenue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compVenueName: {
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  compVenueSub: {
    fontSize: 10,
    color: '#9ca3af',
  },
});
