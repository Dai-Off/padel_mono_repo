import type { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { filterTheme } from './filterTheme';

type FilterBottomSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onClear?: () => void;
  clearLabel?: string;
  children: ReactNode;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Contenedor reutilizable estilo Playtomic: sheet oscuro, handle, cabecera y CTA opcional. */
export function FilterBottomSheet({
  visible,
  title,
  onClose,
  onClear,
  clearLabel = 'Borrar',
  children,
  footer,
  contentStyle,
}: FilterBottomSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose} accessibilityLabel="Cerrar">
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={22} color={filterTheme.textMuted} />
            </Pressable>
            <Text style={styles.headerTitle}>{title}</Text>
            {onClear ? (
              <Pressable
                onPress={onClear}
                style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={clearLabel}
              >
                <Text style={styles.clearText}>{clearLabel}</Text>
              </Pressable>
            ) : (
              <View style={styles.headerBtn} />
            )}
          </View>
          <View style={[styles.body, contentStyle]}>{children}</View>
          {footer}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: filterTheme.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: filterTheme.sheetBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: filterTheme.sheetBorder,
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: filterTheme.handle,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: filterTheme.sectionBorder,
  },
  headerBtn: {
    minWidth: 56,
    minHeight: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.fontSize.base,
    fontWeight: '700',
    color: filterTheme.text,
  },
  clearText: {
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    color: filterTheme.accent,
    textAlign: 'right',
  },
  body: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  pressed: { opacity: 0.85 },
});
