import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ACCENT } from './constants';
import { androidReadableText } from './textStyles';

const CARD_W = 280;

export type HomeMission = {
  id: string;
  tag: string;
  title: string;
  desc: string;
  progress: string;
  pct: string;
  pctNum: number;
  claim?: boolean;
  highlight?: boolean;
};

type Props = {
  missions?: HomeMission[];
};

/** Sin misiones: solo cabecera + mensaje vacío (sin tarjeta placeholder). */
export function MissionsHomeSection({ missions = [] }: Props) {
  const hasMissions = missions.length > 0;

  if (!hasMissions) {
    return (
      <View style={styles.section}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="radio-button-on" size={22} color={ACCENT} />
            <Text style={styles.h2}>Misiones Activas</Text>
          </View>
        </View>
        <View style={styles.empty}>
          <Ionicons name="file-tray-outline" size={40} color="#4b5563" />
          <Text style={styles.emptyTitle}>No hay misiones activas</Text>
          <Text style={styles.emptySub}>
            Cuando tengas misiones, aparecerán aquí.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="radio-button-on" size={22} color={ACCENT} />
          <Text style={styles.h2}>Misiones Activas</Text>
        </View>
        <Pressable>
          <Text style={styles.link}>Ver todas</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {missions.map((m) => (
          <View
            key={m.id}
            style={[
              styles.card,
              m.highlight && styles.cardHighlight,
            ]}
          >
            {m.highlight ? (
              <LinearGradient
                colors={['rgba(241,143,52,0.2)', 'transparent']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
            ) : null}
            <View style={styles.cardTop}>
              <View style={styles.iconPad}>
                <Ionicons name="radio-button-on" size={22} color="#60a5fa" />
              </View>
              <Text style={styles.tag}>{m.tag}</Text>
            </View>
            <Text style={styles.cardTitle}>{m.title}</Text>
            <Text style={styles.cardDesc} numberOfLines={2}>
              {m.desc}
            </Text>
            {m.claim === true ? (
              <Pressable style={styles.claimBtn}>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.claimText}>Reclamar Recompensa</Text>
              </Pressable>
            ) : (
              <View style={styles.progressBlock}>
                <View style={styles.progressMeta}>
                  <Text style={styles.progressLeft}>{m.progress}</Text>
                  <Text style={styles.progressRight}>{m.pct}</Text>
                </View>
                <View style={styles.barBg}>
                  <LinearGradient
                    colors={[ACCENT, '#E95F32']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.barFill, { width: `${m.pctNum}%` }]}
                  />
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h2: androidReadableText({
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  }),
  link: androidReadableText({
    fontSize: 14,
    fontWeight: '500',
    color: ACCENT,
  }),
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  emptyTitle: androidReadableText({
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  }),
  emptySub: androidReadableText({
    marginTop: 6,
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
  }),
  scroll: {
    gap: 16,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    width: CARD_W,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  cardHighlight: {
    borderColor: 'rgba(241,143,52,0.3)',
    backgroundColor: 'rgba(241,143,52,0.1)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    zIndex: 1,
  },
  iconPad: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 8,
  },
  tag: androidReadableText({
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6b7280',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  }),
  cardTitle: androidReadableText({
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    zIndex: 1,
  }),
  cardDesc: androidReadableText({
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 16,
    zIndex: 1,
  }),
  progressBlock: { zIndex: 1 },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLeft: androidReadableText({
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  }),
  progressRight: androidReadableText({
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
  }),
  barBg: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 999 },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: ACCENT,
    zIndex: 1,
  },
  claimText: androidReadableText({
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  }),
});
