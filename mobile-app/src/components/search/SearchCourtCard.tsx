import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

export function SearchCourtCard({
  court,
  onPress,
  onTimeSlotPress,
  onFavoritePress,
}: SearchCourtCardProps) {
  const imageUri = court.imageUrl;
  const locationText = court.distanceKm != null
    ? `${Math.round(court.distanceKm)}km - ${court.city}`
    : court.city;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${court.clubName}, ${court.minPriceFormatted}`}
    >
      <View style={styles.imageWrap}>
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
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          style={styles.gradient}
        />
        <Pressable
          onPress={onFavoritePress}
          style={({ pressed: p }) => [styles.favButton, p && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Añadir a favoritos"
        >
          <Ionicons name="heart-outline" size={16} color="#6b7280" />
        </Pressable>
        <View style={styles.priceBadge}>
          <Text style={styles.priceLabel}>1h desde</Text>
          <Text style={styles.priceValue}>{court.minPriceFormatted}</Text>
        </View>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{court.clubName}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={styles.location} numberOfLines={1}>{locationText}</Text>
          </View>
        </View>
      </View>
      <View style={styles.body}>
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  pressed: { opacity: 0.9 },
  imageWrap: {
    height: 160,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    backgroundColor: '#e5e7eb',
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  favButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  priceLabel: {
    fontSize: 10,
    color: '#6b7280',
  },
  priceValue: {
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  titleWrap: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 80,
  },
  title: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: '#fff',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  location: {
    fontSize: theme.fontSize.xs,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },
  body: {
    padding: theme.spacing.md,
  },
  tags: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6b7280',
  },
  slotsScroll: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  slotButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
  },
  slotText: {
    fontSize: theme.fontSize.xs,
    fontWeight: '500',
    color: '#1A1A1A',
  },
});
