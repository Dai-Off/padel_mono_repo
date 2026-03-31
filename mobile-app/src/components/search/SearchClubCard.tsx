import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { SearchClubGroup } from '../../domain/aggregateCourtsByClub';
import { theme } from '../../theme';

const IMAGE_SIZE = 112;
const MAX_VISIBLE_SLOTS = 3;

function getCerramientoLabel(indoor: boolean): string {
  return indoor ? 'Indoor' : 'Exterior';
}

function getParedesLabel(glassType: string): string {
  return glassType === 'panoramic' ? 'Cristal' : 'Muro';
}

function locationDisplayText(city: string, address: string): string {
  const parts = [city, address].filter((s) => s.trim().length > 0);
  return parts.join(' ').trim();
}

type SearchClubCardProps = {
  group: SearchClubGroup;
  onPress?: () => void;
  onFavoritePress?: () => void;
};

/** Tarjeta de club (tab Pistas), alineada al layout web: imagen + meta + tags + franja de horas. */
export function SearchClubCard({ group, onPress, onFavoritePress }: SearchClubCardProps) {
  const { representative: c } = group;
  const imageUri = c.imageUrl;
  const distanceLabel = c.distanceKm != null ? `${Math.round(c.distanceKm)}km` : '';
  const locationText = locationDisplayText(c.city ?? '', c.address ?? '');
  const slots = c.timeSlots ?? [];
  const visibleSlots = slots.slice(0, MAX_VISIBLE_SLOTS);
  const extraCount = Math.max(0, slots.length - MAX_VISIBLE_SLOTS);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardOuter, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${c.clubName}, desde ${c.minPriceFormatted}`}
    >
      <View style={styles.cardInner}>
        <Pressable
          onPress={() => onFavoritePress?.()}
          style={({ pressed: p }) => [styles.favButton, p && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Añadir a favoritos"
          hitSlop={8}
        >
          <Ionicons name="heart-outline" size={14} color="#fff" />
        </Pressable>

        <View style={styles.row}>
        <View style={styles.imageCol}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.4)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.imageOverlay}
            pointerEvents="none"
          />
          <View style={styles.priceBadge}>
            <Text style={styles.priceLine}>
              <Text style={styles.priceMain}>{c.minPriceFormatted}</Text>
              <Text style={styles.priceSub}>/h</Text>
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {c.clubName}
          </Text>

          <View style={styles.metaRow}>
            <Ionicons name="navigate" size={14} color="#737373" style={styles.metaIcon} />
            {distanceLabel ? (
              <Text style={styles.metaDist}>{distanceLabel}</Text>
            ) : null}
            {distanceLabel && locationText ? (
              <Text style={styles.metaDot}>•</Text>
            ) : null}
            {locationText ? (
              <Text style={styles.metaCity} numberOfLines={1}>
                {locationText}
              </Text>
            ) : null}
          </View>

          <View style={styles.tagsRow}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{getCerramientoLabel(c.indoor)}</Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{getParedesLabel(c.glassType)}</Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            contentContainerStyle={styles.slotsScroll}
          >
            {visibleSlots.map((slot) => (
              <View key={slot} style={styles.slotPill}>
                <Text style={styles.slotText}>{slot}</Text>
              </View>
            ))}
            {extraCount > 0 ? (
              <View style={styles.slotMore}>
                <Text style={styles.slotMoreText}>+{extraCount}</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  pressed: { opacity: 0.92 },
  cardInner: {
    position: 'relative',
  },
  favButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
  },
  imageCol: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  priceBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceMain: {
    fontSize: 12,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 14,
  },
  priceSub: {
    fontSize: 9,
    color: '#d1d5db',
    fontWeight: '600',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 20,
    paddingRight: 32,
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    minWidth: 0,
  },
  metaIcon: {
    marginTop: 1,
  },
  metaDist: {
    fontSize: theme.fontSize.xs,
    fontWeight: '500',
    color: '#9ca3af',
  },
  metaDot: {
    fontSize: theme.fontSize.xs,
    color: '#404040',
  },
  metaCity: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.xs,
    color: '#737373',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  tagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#d4d4d4',
    textTransform: 'uppercase',
  },
  slotsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  slotPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  slotText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  slotMore: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  slotMoreText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#525252',
  },
});
