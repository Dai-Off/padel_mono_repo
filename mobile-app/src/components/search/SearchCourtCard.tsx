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
import type { SearchCourtResult } from '../../api/search';
import { theme } from '../../theme';

function getCerramientoLabel(indoor: boolean): string {
  return indoor ? 'Indoor' : 'Exterior';
}

function getParedesLabel(glassType: string): string {
  return glassType === 'panoramic' ? 'Panorámico' : 'Muro';
}

type SearchCourtCardProps = {
  court: SearchCourtResult;
  onPress?: () => void;
  onTimeSlotPress?: (courtId: string, slot: string) => void;
  onFavoritePress?: () => void;
};

const IMAGE_SIZE = 112;

/** Tarjeta tipo glass (referencia BuscadorScreen web). */
export function SearchCourtCard({
  court,
  onPress,
  onTimeSlotPress,
  onFavoritePress,
}: SearchCourtCardProps) {
  const imageUri = court.imageUrl;
  const title = court.courtName || court.clubName;
  const locationLine =
    court.distanceKm != null
      ? `${Math.round(court.distanceKm)}km`
      : '';
  const cityPart = court.city || '';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardOuter, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${court.courtName} - ${court.clubName}, ${court.minPriceFormatted}`}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.03)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGradient}
      >
        <View style={styles.cardInner}>
          <Pressable
            onPress={onFavoritePress}
            style={({ pressed: p }) => [styles.favButton, p && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Favorito"
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
                colors={['rgba(0,0,0,0.35)', 'transparent']}
                style={styles.imageOverlay}
                pointerEvents="none"
              />
              <View style={styles.priceBadge}>
                <Text style={styles.priceValue}>{court.minPriceFormatted}</Text>
                <Text style={styles.pricePer}>/h</Text>
              </View>
            </View>

            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <View style={styles.metaRow}>
                <Ionicons name="navigate" size={14} color="#737373" />
                {locationLine ? (
                  <Text style={styles.metaDist}>{locationLine}</Text>
                ) : null}
                {locationLine && cityPart ? (
                  <Text style={styles.metaDot}>•</Text>
                ) : null}
                {cityPart ? (
                  <Text style={styles.metaCity} numberOfLines={1}>
                    {cityPart}
                  </Text>
                ) : null}
              </View>
              <View style={styles.tags}>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{getCerramientoLabel(court.indoor)}</Text>
                </View>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{getParedesLabel(court.glassType)}</Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.slotsScroll}
              >
                {court.timeSlots.map((slot) => (
                  <Pressable
                    key={slot}
                    onPress={() => onTimeSlotPress?.(court.id, slot)}
                    style={({ pressed }) => [styles.slotButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Reservar a las ${slot}`}
                  >
                    <Text style={styles.slotText}>{slot}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
  cardGradient: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardInner: {
    position: 'relative',
  },
  pressed: { opacity: 0.92 },
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
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceValue: {
    fontSize: theme.fontSize.xs,
    fontWeight: '900',
    color: '#fff',
  },
  pricePer: {
    fontSize: 9,
    color: '#d1d5db',
    marginLeft: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#fff',
    paddingRight: 36,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
    flexWrap: 'nowrap',
  },
  metaDist: {
    fontSize: theme.fontSize.xs,
    fontWeight: '500',
    color: '#a3a3a3',
  },
  metaDot: {
    fontSize: theme.fontSize.xs,
    color: '#525252',
  },
  metaCity: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.xs,
    color: '#a3a3a3',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
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
    gap: 6,
    alignItems: 'center',
  },
  slotButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
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
});
