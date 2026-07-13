import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { AvatarWithFrame, type FrameAttrs } from './AvatarWithFrame';
import { AnimatedTitle } from './AnimatedTitle';
import { PlayerName } from './PlayerName';
import { ProfileThemeBackground } from './ProfileThemeBackground';
import { RarityBadge } from './RarityBadge';
import { RARITY_CONFIG, RARITY_ORDER, type AchievementRarity } from '../../design/rarity';
import { describeUnlock } from '../../design/frames';
import {
  fetchUnlockables,
  saveCustomization,
  type CatalogItem,
  type NameColorAttrs,
  type ProfileCustomization,
  type ThemeAttrs,
} from '../../api/profileCustomization';
import { fetchAchievements } from '../../api/unlockables';
import type { Achievement } from '../../design/achievements';

type Tab = 'title' | 'frame' | 'name_color' | 'theme' | 'badges';
const MAX_PINNED = 4;

// Iconos de título (clave del catálogo → glyph Ionicons; aproximaciones cosméticas).
const TITLE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  star: 'star',
  shield: 'shield-half',
  sword: 'flash',
  crown: 'ribbon',
  medal: 'medal',
  trophy: 'trophy',
  flame: 'flame',
  target: 'locate',
  school: 'school',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  initials: string;
  avatarUrl?: string | null;
  /** Nombre real para previsualizar el color de nombre. */
  displayName?: string;
  current: ProfileCustomization;
  onSaved: (c: ProfileCustomization) => void;
}

export const ProfileCustomizationModal: React.FC<Props> = ({
  visible,
  onClose,
  initials,
  avatarUrl,
  displayName,
  current,
  onSaved,
}) => {
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [tab, setTab] = useState<Tab>('title');
  const [titles, setTitles] = useState<CatalogItem[]>([]);
  const [frames, setFrames] = useState<CatalogItem[]>([]);
  const [nameColors, setNameColors] = useState<CatalogItem[]>([]);
  const [themes, setThemes] = useState<CatalogItem[]>([]);
  const [badges, setBadges] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [titleId, setTitleId] = useState<string | null>(current.titleId);
  const [frameId, setFrameId] = useState<string | null>(current.frameId);
  const [nameColorId, setNameColorId] = useState<string | null>(current.nameColorId);
  const [themeId, setThemeId] = useState<string | null>(current.themeId);
  const [pinned, setPinned] = useState<string[]>(current.pinnedBadgeIds);

  useEffect(() => {
    if (!visible) return;
    setTab('title');
    setTitleId(current.titleId);
    setFrameId(current.frameId);
    setNameColorId(current.nameColorId);
    setThemeId(current.themeId);
    setPinned(current.pinnedBadgeIds);
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchUnlockables(token, ['title', 'frame', 'name_color', 'theme']), fetchAchievements(token)])
      .then(([catalog, achievements]) => {
        if (cancelled) return;
        setTitles(catalog.filter((c) => c.kind === 'title'));
        setFrames(catalog.filter((c) => c.kind === 'frame'));
        setNameColors(catalog.filter((c) => c.kind === 'name_color'));
        setThemes(catalog.filter((c) => c.kind === 'theme'));
        setBadges(achievements.filter((a) => a.type !== 'course'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, token, current]);

  const selectedFrame = useMemo<FrameAttrs | null>(() => {
    const f = frames.find((x) => x.id === frameId);
    if (!f) return null;
    return { rarity: f.rarity, style: f.style, animationType: f.animationType, colors: f.colors };
  }, [frames, frameId]);

  const selectedNameColor = useMemo<NameColorAttrs | null>(() => {
    const n = nameColors.find((x) => x.id === nameColorId);
    if (!n) return null;
    return { id: n.id, rarity: n.rarity, colors: n.colors };
  }, [nameColors, nameColorId]);

  const selectedTheme = useMemo<ThemeAttrs | null>(() => {
    const th = themes.find((x) => x.id === themeId);
    if (!th) return null;
    return { id: th.id, rarity: th.rarity, colors: th.colors, animationType: th.animationType };
  }, [themes, themeId]);

  const togglePin = (id: string) => {
    setPinned((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_PINNED) return prev;
      return [...prev, id];
    });
  };

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    const next: ProfileCustomization = { titleId, frameId, nameColorId, themeId, pinnedBadgeIds: pinned };
    const result = await saveCustomization(token, next);
    setSaving(false);
    if (result) {
      // El PUT devuelve ids; adjuntamos color y tema resueltos para pintar sin re-fetch.
      onSaved({ ...result, nameColor: selectedNameColor, theme: selectedTheme });
      onClose();
    }
  };

  const byRarity = <T extends { rarity: AchievementRarity }>(list: T[]) =>
    RARITY_ORDER.map((r) => ({ rarity: r, items: list.filter((i) => i.rarity === r) })).filter((g) => g.items.length);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.headerBtn}>
              <Ionicons name="close" size={20} color="#9CA3AF" />
            </Pressable>
            <Text style={styles.headerTitle}>Personalizar Perfil</Text>
            <Pressable onPress={handleSave} disabled={saving} style={styles.saveBtn}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={styles.saveText}>Guardar</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Preview */}
          <View style={styles.preview}>
            <ProfileThemeBackground theme={selectedTheme} />
            <AvatarWithFrame initials={initials} avatarUrl={avatarUrl} size={72} frame={selectedFrame} />
            {displayName ? (
              <View style={{ marginTop: 8 }}>
                <PlayerName
                  name={displayName}
                  nameColor={selectedNameColor}
                  style={styles.previewName}
                />
              </View>
            ) : null}
            {titleId ? <View style={{ marginTop: 8 }}><AnimatedTitle titleId={titleId} /></View> : null}
            {pinned.length > 0 ? (
              <View style={styles.previewBadges}>
                {pinned.map((id) => {
                  const b = badges.find((x) => x.id === id);
                  if (!b) return null;
                  const conf = RARITY_CONFIG[b.rarity];
                  return (
                    <View key={id} style={[styles.previewBadge, { backgroundColor: conf.bg, borderColor: conf.border }]}>
                      <Ionicons name={b.icon as keyof typeof Ionicons.glyphMap} size={14} color={conf.color} />
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            {([
              { key: 'title', label: 'Título', icon: 'ribbon-outline' },
              { key: 'frame', label: 'Marco', icon: 'sparkles-outline' },
              { key: 'name_color', label: 'Color', icon: 'color-palette-outline' },
              { key: 'theme', label: 'Tema', icon: 'image-outline' },
              { key: 'badges', label: 'Logros', icon: 'medal-outline' },
            ] as const).map((t) => (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabActive]}>
                <Ionicons name={t.icon} size={14} color={tab === t.key ? '#F18F34' : '#6B7280'} />
                <Text style={[styles.tabText, tab === t.key ? styles.tabTextActive : styles.tabTextInactive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.centered}><ActivityIndicator color="#F18F34" /></View>
          ) : (
            <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
              {/* TÍTULO */}
              {tab === 'title' && (
                <>
                  <TitleRow
                    label="Sin título"
                    sub="No mostrar título"
                    color="#9CA3AF"
                    selected={titleId == null}
                    onPress={() => setTitleId(null)}
                  />
                  {byRarity(titles.filter((t) => t.unlocked)).map((g) => (
                    <View key={g.rarity} style={styles.group}>
                      <Text style={[styles.groupLabel, { color: RARITY_CONFIG[g.rarity].color }]}>
                        {RARITY_CONFIG[g.rarity].label.toUpperCase()}
                      </Text>
                      {g.items.map((t) => (
                        <TitleRow
                          key={t.id}
                          label={t.title}
                          sub={t.unlocked ? '✓ Desbloqueado' : `🔒 ${describeUnlock(t.unlockType, t.unlockValue)}`}
                          color={t.unlocked ? RARITY_CONFIG[t.rarity].color : '#6B7280'}
                          icon={TITLE_ICON[t.icon ?? 'star'] ?? 'star'}
                          locked={!t.unlocked}
                          selected={titleId === t.id}
                          onPress={() => t.unlocked && setTitleId(titleId === t.id ? null : t.id)}
                        />
                      ))}
                    </View>
                  ))}
                </>
              )}

              {/* MARCO */}
              {tab === 'frame' && (
                <>
                  {byRarity(frames.filter((f) => f.unlocked)).map((g) => (
                    <View key={g.rarity} style={styles.group}>
                      <Text style={[styles.groupLabel, { color: RARITY_CONFIG[g.rarity].color }]}>
                        {RARITY_CONFIG[g.rarity].label.toUpperCase()}
                      </Text>
                      <View style={styles.frameGrid}>
                        {g.items.map((f) => {
                          const sel = frameId === f.id;
                          const attrs: FrameAttrs = { rarity: f.rarity, style: f.style, animationType: f.animationType, colors: f.colors };
                          return (
                            <Pressable
                              key={f.id}
                              onPress={() => f.unlocked && setFrameId(f.id)}
                              style={[styles.frameCell, sel && styles.frameCellSel, !f.unlocked && styles.frameCellLocked]}
                            >
                              <AvatarWithFrame initials={initials} avatarUrl={avatarUrl} size={40} frame={attrs} animate />
                              <Text style={styles.frameName} numberOfLines={1}>{f.title}</Text>
                              {f.animationType ? <Text style={styles.animatedTag}>ANIMADO</Text> : null}
                              {!f.unlocked ? (
                                <View style={styles.lockOverlay}><Ionicons name="lock-closed" size={12} color="#9CA3AF" /></View>
                              ) : null}
                              {sel ? <View style={styles.selCheck}><Ionicons name="checkmark" size={12} color="#fff" /></View> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* COLOR DE NOMBRE */}
              {tab === 'name_color' && (
                <>
                  <NameColorRow
                    label="Sin color"
                    sample={displayName ?? 'Tu nombre'}
                    nameColor={null}
                    selected={nameColorId == null}
                    onPress={() => setNameColorId(null)}
                  />
                  {byRarity(nameColors.filter((n) => n.unlocked)).map((g) => (
                    <View key={g.rarity} style={styles.group}>
                      <Text style={[styles.groupLabel, { color: RARITY_CONFIG[g.rarity].color }]}>
                        {RARITY_CONFIG[g.rarity].label.toUpperCase()}
                      </Text>
                      {g.items.map((n) => (
                        <NameColorRow
                          key={n.id}
                          label={n.title}
                          sample={displayName ?? 'Tu nombre'}
                          nameColor={{ id: n.id, rarity: n.rarity, colors: n.colors }}
                          selected={nameColorId === n.id}
                          onPress={() => setNameColorId(nameColorId === n.id ? null : n.id)}
                        />
                      ))}
                    </View>
                  ))}
                  {nameColors.filter((n) => n.unlocked).length === 0 ? (
                    <Text style={styles.empty}>Aún no tienes colores de nombre. Desbloquéalos en el Pase.</Text>
                  ) : null}
                </>
              )}

              {/* TEMA */}
              {tab === 'theme' && (
                <>
                  <View style={styles.themeGrid}>
                    <Pressable
                      onPress={() => setThemeId(null)}
                      style={[styles.themeCell, themeId == null && styles.themeCellSel]}
                    >
                      <View style={[styles.themeThumb, styles.themeNone]}>
                        <Ionicons name="ban-outline" size={20} color="#6B7280" />
                      </View>
                      <Text style={styles.themeName} numberOfLines={1}>Sin tema</Text>
                    </Pressable>
                  </View>
                  {byRarity(themes.filter((th) => th.unlocked)).map((g) => (
                    <View key={g.rarity} style={styles.group}>
                      <Text style={[styles.groupLabel, { color: RARITY_CONFIG[g.rarity].color }]}>
                        {RARITY_CONFIG[g.rarity].label.toUpperCase()}
                      </Text>
                      <View style={styles.themeGrid}>
                        {g.items.map((th) => {
                          const sel = themeId === th.id;
                          const attrs: ThemeAttrs = { id: th.id, rarity: th.rarity, colors: th.colors, animationType: th.animationType };
                          return (
                            <Pressable
                              key={th.id}
                              onPress={() => setThemeId(sel ? null : th.id)}
                              style={[styles.themeCell, sel && styles.themeCellSel]}
                            >
                              <View style={styles.themeThumb}>
                                <ProfileThemeBackground theme={attrs} scrim={false} />
                              </View>
                              <Text style={styles.themeName} numberOfLines={1}>{th.title}</Text>
                              {sel ? <View style={styles.selCheck}><Ionicons name="checkmark" size={12} color="#fff" /></View> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                  {themes.filter((th) => th.unlocked).length === 0 ? (
                    <Text style={styles.empty}>Aún no tienes temas. Desbloquéalos en el Pase.</Text>
                  ) : null}
                </>
              )}

              {/* INSIGNIAS */}
              {tab === 'badges' && (
                <>
                  <View style={styles.badgesHeader}>
                    <Text style={styles.badgesHint}>Elige hasta <Text style={{ color: '#F18F34', fontWeight: '700' }}>4 logros</Text></Text>
                    <Text style={styles.badgesCount}>{pinned.length}/{MAX_PINNED}</Text>
                  </View>
                  {badges.length === 0 ? (
                    <Text style={styles.empty}>Aún no tienes logros para fijar.</Text>
                  ) : (
                    badges.map((b) => {
                      const conf = RARITY_CONFIG[b.rarity];
                      const isPinned = pinned.includes(b.id);
                      const canPin = isPinned || pinned.length < MAX_PINNED;
                      return (
                        <Pressable
                          key={b.id}
                          onPress={() => canPin && togglePin(b.id)}
                          style={[styles.badgeRow, { borderColor: conf.border, backgroundColor: isPinned ? conf.bg : 'rgba(255,255,255,0.02)' }, !canPin && { opacity: 0.4 }]}
                        >
                          <View style={[styles.badgeIcon, { backgroundColor: conf.bg, borderColor: conf.border }]}>
                            <Ionicons name={b.icon as keyof typeof Ionicons.glyphMap} size={16} color={conf.color} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.badgeTitle} numberOfLines={1}>{b.title}</Text>
                            <Text style={styles.badgeDesc} numberOfLines={1}>{b.description}</Text>
                          </View>
                          {b.rarity !== 'common' ? <RarityBadge rarity={b.rarity} /> : null}
                          <View style={[styles.pinCheck, isPinned && { backgroundColor: '#F18F34' }]}>
                            <Ionicons name={isPinned ? 'checkmark' : 'add'} size={14} color={isPinned ? '#fff' : '#6B7280'} />
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

// Fila de color de nombre: muestra el nombre real con el color/gradiente.
const NameColorRow: React.FC<{
  label: string;
  sample: string;
  nameColor: NameColorAttrs | null;
  selected: boolean;
  onPress: () => void;
}> = ({ label, sample, nameColor, selected, onPress }) => (
  <Pressable onPress={onPress} style={[styles.titleRow, selected && styles.titleRowSel]}>
    <View style={styles.nameColorSwatch}>
      <PlayerName name={sample} nameColor={nameColor} style={styles.nameColorSample} numberOfLines={1} animate={false} />
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.titleName} numberOfLines={1}>{label}</Text>
    </View>
    {selected ? (
      <View style={styles.titleCheck}><Ionicons name="checkmark" size={14} color="#fff" /></View>
    ) : null}
  </Pressable>
);

// Fila de título reutilizable
const TitleRow: React.FC<{
  label: string;
  sub: string;
  color: string;
  icon?: keyof typeof Ionicons.glyphMap;
  locked?: boolean;
  selected: boolean;
  onPress: () => void;
}> = ({ label, sub, color, icon, locked, selected, onPress }) => (
  <Pressable onPress={onPress} style={[styles.titleRow, selected && styles.titleRowSel, locked && { opacity: 0.5 }]}>
    <View style={[styles.titleIcon, { borderColor: 'rgba(255,255,255,0.08)' }]}>
      <Ionicons name={locked ? 'lock-closed' : icon ?? 'close'} size={16} color={locked ? '#6B7280' : color} />
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={[styles.titleName, { color }]} numberOfLines={1}>{label}</Text>
      <Text style={styles.titleSub} numberOfLines={1}>{sub}</Text>
    </View>
    {selected ? (
      <View style={styles.titleCheck}><Ionicons name="checkmark" size={14} color="#fff" /></View>
    ) : null}
  </Pressable>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: '#141414',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F18F34', paddingHorizontal: 14, height: 36, borderRadius: 12, minWidth: 96, justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  preview: { alignItems: 'center', paddingVertical: 16, backgroundColor: 'rgba(255,255,255,0.02)', overflow: 'hidden' },
  previewName: { fontSize: 16, fontWeight: '800', color: '#fff' },
  nameColorSwatch: { width: 96, justifyContent: 'center' },
  nameColorSample: { fontSize: 14, fontWeight: '800', color: '#fff' },
  // tema
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  themeCell: { width: '47%', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.03)', padding: 6, gap: 6 },
  themeCellSel: { borderColor: 'rgba(241,143,52,0.5)', backgroundColor: 'rgba(241,143,52,0.1)' },
  themeThumb: { aspectRatio: 16 / 10, borderRadius: 10, overflow: 'hidden', backgroundColor: '#0a0807' },
  themeNone: { alignItems: 'center', justifyContent: 'center' },
  themeName: { fontSize: 11, color: '#d1d5db', fontWeight: '700', textAlign: 'center', paddingBottom: 2 },
  previewBadges: { flexDirection: 'row', gap: 6, marginTop: 8 },
  previewBadge: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  tabActive: { backgroundColor: 'rgba(241,143,52,0.15)', borderColor: 'rgba(241,143,52,0.2)' },
  tabText: { fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: '#F18F34' },
  tabTextInactive: { color: '#6B7280' },
  content: { paddingHorizontal: 16, paddingTop: 12 },
  centered: { padding: 40, alignItems: 'center' },
  group: { marginTop: 14 },
  groupLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, marginBottom: 8 },
  // título
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.02)', marginBottom: 6 },
  titleRowSel: { borderColor: 'rgba(241,143,52,0.4)', backgroundColor: 'rgba(241,143,52,0.1)' },
  titleIcon: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  titleName: { fontSize: 12, fontWeight: '700' },
  titleSub: { fontSize: 10, color: '#6B7280', marginTop: 2 },
  titleCheck: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#F18F34', alignItems: 'center', justifyContent: 'center' },
  // marco
  frameGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  frameCell: { width: '30%', alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.03)' },
  frameCellSel: { borderColor: 'rgba(241,143,52,0.4)', backgroundColor: 'rgba(241,143,52,0.1)' },
  frameCellLocked: { opacity: 0.45 },
  frameName: { fontSize: 9, color: '#9CA3AF', fontWeight: '600', textAlign: 'center' },
  animatedTag: { fontSize: 7, fontWeight: '900', color: '#A855F7', backgroundColor: 'rgba(168,85,247,0.15)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 99 },
  lockOverlay: { position: 'absolute', top: 6, left: 6 },
  selCheck: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#F18F34', alignItems: 'center', justifyContent: 'center' },
  // insignias
  badgesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 8 },
  badgesHint: { fontSize: 12, color: '#9CA3AF' },
  badgesCount: { fontSize: 11, fontWeight: '700', color: '#F18F34', backgroundColor: 'rgba(241,143,52,0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  empty: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1, marginBottom: 6 },
  badgeIcon: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badgeTitle: { fontSize: 12, fontWeight: '700', color: '#fff' },
  badgeDesc: { fontSize: 10, color: '#9CA3AF', marginTop: 1 },
  pinCheck: { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
});
