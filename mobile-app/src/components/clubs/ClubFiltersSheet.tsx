import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ClubMultiSelectFilters } from './ClubMultiSelectPicker';
import { theme } from '../../theme';

const ACCENT = theme.auth.accent;

type ClubFiltersSheetProps = {
  visible: boolean;
  onClose: () => void;
  initialFilters: ClubMultiSelectFilters;
  onApply: (filters: ClubMultiSelectFilters) => void;
  resultCount: number;
};

export function ClubFiltersSheet({
  visible,
  onClose,
  initialFilters,
  onApply,
  resultCount,
}: ClubFiltersSheetProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(initialFilters);

  useEffect(() => {
    if (visible) setDraft(initialFilters);
  }, [visible, initialFilters]);

  const handleClear = () => {
    const cleared: ClubMultiSelectFilters = { sport: 'all', cerramiento: 'all' };
    setDraft(cleared);
    onApply(cleared);
    onClose();
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Cerrar filtros">
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.headerBtn} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={20} color="#9ca3af" />
            </Pressable>
            <Text style={styles.headerTitle}>Filtrar clubes</Text>
            <Pressable onPress={handleClear} style={styles.headerBtn}>
              <Text style={styles.clearText}>Borrar</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>Deporte</Text>
            {(['all', 'padel', 'tenis', 'pickleball'] as const).map((key) => (
              <Pressable
                key={key}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => setDraft((f) => ({ ...f, sport: key }))}
              >
                <Text style={[styles.rowText, draft.sport === key && styles.rowTextActive]}>
                  {key === 'all' ? 'Todos' : key === 'padel' ? 'Pádel' : key === 'tenis' ? 'Tenis' : 'Pickleball'}
                </Text>
                {draft.sport === key ? <Ionicons name="checkmark" size={18} color={ACCENT} /> : null}
              </Pressable>
            ))}

            <Text style={styles.sectionLabel}>Cerramiento</Text>
            {(['all', 'indoor', 'outdoor'] as const).map((key) => (
              <Pressable
                key={key}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => setDraft((f) => ({ ...f, cerramiento: key }))}
              >
                <Text style={[styles.rowText, draft.cerramiento === key && styles.rowTextActive]}>
                  {key === 'all' ? 'Todos' : key === 'indoor' ? 'Interior' : 'Exterior'}
                </Text>
                {draft.cerramiento === key ? <Ionicons name="checkmark" size={18} color={ACCENT} /> : null}
              </Pressable>
            ))}
          </ScrollView>

          <Pressable style={styles.applyBtn} onPress={handleApply}>
            <Text style={styles.applyBtnText}>
              {resultCount === 1 ? 'Ver 1 club' : `Ver ${resultCount} clubes`}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '78%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerBtn: { padding: 8, minWidth: 56 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  clearText: { color: ACCENT, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  scroll: { maxHeight: 320 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 8 },
  sectionLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  rowText: { color: '#D4D4D4', fontSize: 15 },
  rowTextActive: { color: '#fff', fontWeight: '600' },
  applyBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  pressed: { opacity: 0.85 },
});
