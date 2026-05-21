import { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

const ACCENT = '#F18F34';

function parseIsoDate(iso: string): Date {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  return new Date(1995, 0, 1, 12, 0, 0, 0);
}

export function formatBirthDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatBirthDateDisplay(iso: string): string {
  if (!iso) return '';
  try {
    return parseIsoDate(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

const MAX_BIRTH_DATE = new Date();
const MIN_BIRTH_DATE = new Date(1920, 0, 1);

type BirthDatePickerFieldProps = {
  value: string;
  onChange: (isoDate: string) => void;
};

export function BirthDatePickerField({ value, onChange }: BirthDatePickerFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [draftDate, setDraftDate] = useState(() => parseIsoDate(value));

  const displayLabel = useMemo(() => formatBirthDateDisplay(value), [value]);

  const openPicker = () => {
    setDraftDate(parseIsoDate(value));
    setShowPicker(true);
  };

  const applyDate = (d: Date) => {
    onChange(formatBirthDateIso(d));
  };

  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (event.type === 'dismissed') return;
      if (selected) applyDate(selected);
      return;
    }
    if (selected) setDraftDate(selected);
  };

  const confirmIos = () => {
    applyDate(draftDate);
    setShowPicker(false);
  };

  const clearDate = () => {
    onChange('');
    setShowPicker(false);
  };

  return (
    <>
      <Pressable
        style={styles.trigger}
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel="Seleccionar fecha de nacimiento"
      >
        <Text style={[styles.triggerText, !value && styles.placeholder]}>
          {displayLabel || 'Seleccionar fecha'}
        </Text>
        <Ionicons name="calendar-outline" size={18} color="#6b7280" />
      </Pressable>

      {Platform.OS === 'android' && showPicker ? (
        <DateTimePicker
          value={draftDate}
          mode="date"
          display="default"
          maximumDate={MAX_BIRTH_DATE}
          minimumDate={MIN_BIRTH_DATE}
          onChange={onPickerChange}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={showPicker} transparent animationType="fade">
          <Pressable style={styles.modalBackdrop} onPress={() => setShowPicker(false)}>
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Pressable onPress={clearDate} hitSlop={8}>
                  <Text style={styles.modalClear}>Quitar</Text>
                </Pressable>
                <Text style={styles.modalTitle}>Fecha de nacimiento</Text>
                <Pressable onPress={confirmIos} hitSlop={8}>
                  <Text style={styles.modalDone}>Listo</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={draftDate}
                mode="date"
                display="spinner"
                locale="es-ES"
                maximumDate={MAX_BIRTH_DATE}
                minimumDate={MIN_BIRTH_DATE}
                onChange={onPickerChange}
                style={styles.iosPicker}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
  },
  placeholder: {
    color: '#6b7280',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  modalClear: {
    fontSize: 15,
    color: '#9ca3af',
  },
  modalDone: {
    fontSize: 15,
    fontWeight: '700',
    color: ACCENT,
  },
  iosPicker: {
    height: 216,
  },
});
