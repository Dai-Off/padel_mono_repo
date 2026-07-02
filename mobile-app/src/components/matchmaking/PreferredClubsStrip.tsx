import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../../i18n';
import { filterTheme } from '../filters/filterTheme';
import { theme } from '../../theme';

const ACCENT = '#F18F34';

export type PreferredClubCard = { id: string; name: string; imageUrl: string | null };

type Props = {
  clubs: PreferredClubCard[];
  onEdit: () => void;
  emptyLabel: string;
};

/** Scroll horizontal de clubes elegidos (estilo perfil), con tarjeta final para añadir/editar. */
export function PreferredClubsStrip({ clubs, onEdit, emptyLabel }: Props) {
  const { t } = useTranslation();

  if (clubs.length === 0) {
    return (
      <Pressable style={styles.emptyCard} onPress={onEdit} accessibilityRole="button">
        <View style={styles.emptyIcon}>
          <Ionicons name="add" size={20} color={ACCENT} />
        </View>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </Pressable>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {clubs.map((club) => (
        <View key={club.id} style={styles.card}>
          {club.imageUrl ? (
            <Image source={{ uri: club.imageUrl }} style={styles.cardImage} />
          ) : (
            <LinearGradient colors={['#8A4A0B', '#D4861F']} style={styles.cardImage}>
              <Ionicons name="business" size={22} color="rgba(255,255,255,0.85)" />
            </LinearGradient>
          )}
          <Text style={styles.cardName} numberOfLines={1}>
            {club.name}
          </Text>
        </View>
      ))}
      <Pressable style={styles.addCard} onPress={onEdit} accessibilityRole="button">
        <Ionicons name="create-outline" size={20} color={ACCENT} />
        <Text style={styles.addCardText}>{t('competitive.screen.prefs.editClubs')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const CARD_W = 140;

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: theme.spacing.sm, paddingVertical: 4 },
  card: {
    width: CARD_W,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: filterTheme.chipBorder,
    backgroundColor: filterTheme.chipBg,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    color: filterTheme.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addCard: {
    width: CARD_W,
    height: 72 + 34,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: filterTheme.accentBorder,
    backgroundColor: filterTheme.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addCardText: { fontSize: theme.fontSize.sm, fontWeight: '700', color: ACCENT },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: filterTheme.accentBorder,
    backgroundColor: filterTheme.accentMuted,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(241,143,52,0.18)',
  },
  emptyText: { flex: 1, fontSize: theme.fontSize.sm, color: filterTheme.textSecondary, lineHeight: 18 },
});
