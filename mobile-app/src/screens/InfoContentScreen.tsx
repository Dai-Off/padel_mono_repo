import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { MenuScreenHeader } from '../components/menuScreen/MenuScreenHeader';
import { INFO_SCREENS, type InfoBlock, type InfoScreenId } from '../content/infoContent';
import { theme } from '../theme';

type InfoContentScreenProps = {
  screenId: InfoScreenId;
  onBack: () => void;
};

function InfoBlockView({ block }: { block: InfoBlock }) {
  if (block.type === 'heading') {
    return <Text style={styles.heading}>{block.text}</Text>;
  }
  if (block.type === 'paragraph') {
    return <Text style={styles.paragraph}>{block.text}</Text>;
  }
  if (block.type === 'list') {
    return (
      <View style={styles.list}>
        {block.items.map((item, index) => (
          <View key={`${index}-${item.slice(0, 24)}`} style={styles.listItem}>
            <View style={styles.bullet} />
            <Text style={styles.listText}>{item}</Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.contactButton, pressed && { opacity: 0.9 }]}
      onPress={() => void Linking.openURL(`mailto:${block.email}`)}
      accessibilityRole="link"
      accessibilityLabel={block.label ?? block.email}
    >
      <Ionicons name="mail-outline" size={18} color={theme.auth.accent} />
      <View style={styles.contactTextWrap}>
        <Text style={styles.contactLabel}>{block.label ?? 'Contactar'}</Text>
        <Text style={styles.contactEmail}>{block.email}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#6b7280" />
    </Pressable>
  );
}

export function InfoContentScreen({ screenId, onBack }: InfoContentScreenProps) {
  const insets = useSafeAreaInsets();
  const content = INFO_SCREENS[screenId];

  return (
    <View style={styles.container}>
      <MenuScreenHeader title={content.title} onBack={onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 32 + (insets.bottom ?? 0) }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>Última actualización: {content.lastUpdated}</Text>
        {content.blocks.map((block, index) => (
          <InfoBlockView key={`${block.type}-${index}`} block={block} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  updated: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 20,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 20,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.auth.textSecondary,
    marginBottom: 4,
  },
  list: { marginTop: 4, marginBottom: 8, gap: 10 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.auth.accent,
    marginTop: 8,
  },
  listText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: theme.auth.textSecondary,
  },
  contactButton: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  contactTextWrap: { flex: 1, minWidth: 0 },
  contactLabel: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
  contactEmail: { fontSize: 13, color: theme.auth.accent, marginTop: 2 },
});
