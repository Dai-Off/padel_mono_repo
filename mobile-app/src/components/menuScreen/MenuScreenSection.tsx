import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme';

type MenuScreenSectionProps = {
  title: string;
  children: React.ReactNode;
  /** Espacio extra arriba (p.ej. zona de peligro). */
  topSpacing?: boolean;
};

export function MenuScreenSection({ title, children, topSpacing = false }: MenuScreenSectionProps) {
  return (
    <View style={[styles.section, topSpacing && styles.sectionTopSpacing]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <LinearGradient
          colors={['rgba(241,143,52,0.2)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.sectionLine}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 0 },
  sectionTopSpacing: { paddingTop: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 16,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: theme.auth.accent,
    textTransform: 'uppercase',
  },
  sectionLine: {
    flex: 1,
    height: 1,
    borderRadius: 1,
  },
});
