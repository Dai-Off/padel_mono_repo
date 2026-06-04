import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';

type PartidoSlotAvatarProps = {
  avatarUrl?: string | null;
  initials: string;
  size?: number;
  borderRadius?: number;
  backgroundColor?: string;
  style?: ViewStyle;
};

/** Avatar de slot en partidos: fallback a iniciales si la URL falla (común en prod/Android). */
export function PartidoSlotAvatar({
  avatarUrl,
  initials,
  size = 56,
  borderRadius = 12,
  backgroundColor = '#FF6B35',
  style,
}: PartidoSlotAvatarProps) {
  const uri = avatarUrl?.trim() || null;
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [uri]);

  const label = (initials || '?').toUpperCase().slice(0, 2);

  if (!uri || loadFailed) {
    return (
      <View
        style={[
          styles.fill,
          { width: size, height: size, borderRadius, backgroundColor },
          style,
        ]}
      >
        <Text style={styles.initials}>{label}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.fill,
        { width: size, height: size, borderRadius, backgroundColor },
        style,
      ]}
    >
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius }}
        resizeMode="cover"
        onError={() => setLoadFailed(true)}
        accessibilityLabel="Foto del jugador"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
});
