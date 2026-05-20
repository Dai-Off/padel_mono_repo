import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme';

type PlayerAvatarCircleProps = {
  avatarUrl?: string | null;
  initials: string;
  size?: number;
  style?: ViewStyle;
};

export function PlayerAvatarCircle({
  avatarUrl,
  initials,
  size = 96,
  style,
}: PlayerAvatarCircleProps) {
  const radius = size / 2;
  const fontSize = Math.round(size * 0.32);
  const uri = avatarUrl?.trim() || null;
  const isLocal =
    uri != null &&
    (uri.startsWith('file://') ||
      uri.startsWith('content://') ||
      uri.startsWith('ph://') ||
      uri.startsWith('data:'));
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
    setLoading(false);
    if (!uri || isLocal) return;
    const timeout = setTimeout(() => setLoading(false), 12_000);
    return () => clearTimeout(timeout);
  }, [uri, isLocal]);

  if (!uri || loadFailed) {
    return (
      <LinearGradient
        colors={[theme.sidebar.avatarGradientFrom, theme.sidebar.avatarGradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.wrap, { width: size, height: size, borderRadius: radius }, style]}
      >
        <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius }, style]}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        onLoadStart={() => {
          if (!isLocal) setLoading(true);
        }}
        onLoad={() => setLoading(false)}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setLoadFailed(true);
        }}
        accessibilityLabel="Foto de perfil"
      />
      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={theme.auth.accent} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  initials: {
    color: theme.auth.text,
    fontWeight: '700',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
