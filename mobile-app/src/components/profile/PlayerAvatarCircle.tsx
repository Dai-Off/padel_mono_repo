import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { normalizePlayerAvatarUrl } from '../../api/playerAvatar';
import { theme } from '../../theme';

type PlayerAvatarCircleProps = {
  avatarUrl?: string | null;
  initials: string;
  size?: number;
  /** Por defecto círculo (size/2). Pasá 12 para slots cuadrados de partidos. */
  borderRadius?: number;
  style?: ViewStyle;
};

export function PlayerAvatarCircle({
  avatarUrl,
  initials,
  size = 96,
  borderRadius,
  style,
}: PlayerAvatarCircleProps) {
  const radius = borderRadius ?? size / 2;
  const fontSize = Math.round(size * (borderRadius != null && borderRadius < size / 2 ? 0.25 : 0.32));
  const uri = normalizePlayerAvatarUrl(avatarUrl);
  const [photoFailed, setPhotoFailed] = useState(false);
  const label = (initials || '?').toUpperCase().slice(0, 2);

  useEffect(() => {
    setPhotoFailed(false);
  }, [uri]);

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius, backgroundColor: theme.sidebar.avatarGradientFrom },
        style,
      ]}
    >
      <LinearGradient
        colors={[theme.sidebar.avatarGradientFrom, theme.sidebar.avatarGradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { width: size, height: size, borderRadius: radius }]}
      >
        <Text style={[styles.initials, { fontSize }]}>{label}</Text>
      </LinearGradient>
      {uri && !photoFailed ? (
        <Image
          key={uri}
          source={{ uri }}
          style={[styles.photo, { width: size, height: size, borderRadius: radius }]}
          resizeMode="cover"
          onError={() => setPhotoFailed(true)}
          accessibilityLabel="Foto de perfil"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: theme.auth.text,
    fontWeight: '700',
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
