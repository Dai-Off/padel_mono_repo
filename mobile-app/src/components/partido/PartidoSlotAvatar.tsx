import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { normalizePlayerAvatarUrl } from '../../api/playerAvatar';
import { theme } from '../../theme';

type PartidoSlotAvatarProps = {
  avatarUrl?: string | null;
  initials: string;
  size?: number;
  borderRadius?: number;
};

/**
 * Avatar en detalle de partido: gradiente naranja SIEMPRE visible;
 * la foto se superpone encima cuando carga (nunca reemplaza el gradiente).
 */
export function PartidoSlotAvatar({
  avatarUrl,
  initials,
  size = 56,
  borderRadius = 12,
}: PartidoSlotAvatarProps) {
  const uri = normalizePlayerAvatarUrl(avatarUrl);
  const [photoFailed, setPhotoFailed] = useState(false);
  const label = (initials || '?').toUpperCase().slice(0, 2);

  useEffect(() => {
    setPhotoFailed(false);
  }, [uri]);

  return (
    <View
      style={[
        styles.root,
        { width: size, height: size, borderRadius, backgroundColor: theme.sidebar.avatarGradientFrom },
      ]}
    >
      <LinearGradient
        colors={[theme.sidebar.avatarGradientFrom, theme.sidebar.avatarGradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { width: size, height: size, borderRadius }]}
      >
        <Text style={styles.initials}>{label}</Text>
      </LinearGradient>
      {uri && !photoFailed ? (
        <Image
          key={uri}
          source={{ uri }}
          style={[styles.photo, { width: size, height: size, borderRadius }]}
          resizeMode="cover"
          onError={() => setPhotoFailed(true)}
          accessibilityLabel="Foto de perfil"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: theme.auth.text,
    fontWeight: '800',
    fontSize: 14,
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
