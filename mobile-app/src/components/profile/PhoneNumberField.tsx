import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  formatNationalInput,
  getPhoneCountryOptions,
  isPhonePartsValid,
  type CountryCode,
  type PhoneCountryOption,
} from '../../lib/phoneNumber';

const ACCENT = '#F18F34';
const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';

type PhoneNumberFieldProps = {
  country: CountryCode;
  national: string;
  onCountryChange: (country: CountryCode) => void;
  onNationalChange: (national: string) => void;
  error?: string | null;
  label?: string;
};

export function PhoneNumberField({
  country,
  national,
  onCountryChange,
  onNationalChange,
  error,
  label = 'Teléfono',
}: PhoneNumberFieldProps) {
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const options = useMemo(() => getPhoneCountryOptions(), []);
  const selected = useMemo(
    () => options.find((o) => o.code === country) ?? options[0],
    [options, country],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.code.toLowerCase().includes(q) ||
        o.callingCode.includes(q.replace(/\s/g, '')),
    );
  }, [options, search]);

  const showValidHint = national.replace(/\D/g, '').length > 0 && !error && isPhonePartsValid(country, national);

  const handleNationalChange = (text: string) => {
    onNationalChange(formatNationalInput(country, text));
  };

  const pickCountry = (opt: PhoneCountryOption) => {
    onCountryChange(opt.code);
    if (national.replace(/\D/g, '').length > 0) {
      onNationalChange(formatNationalInput(opt.code, national));
    }
    setPickerOpen(false);
    setSearch('');
  };

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, error ? styles.rowError : null]}>
        <Pressable
          style={({ pressed }) => [styles.countryBtn, pressed && styles.pressed]}
          onPress={() => setPickerOpen(true)}
          accessibilityLabel="Elegir país"
        >
          <Text style={styles.flag}>{selected?.flag ?? '🌐'}</Text>
          <Text style={styles.callingCode}>{selected?.callingCode ?? '+?'}</Text>
          <Ionicons name="chevron-down" size={14} color="#9ca3af" />
        </Pressable>
        <TextInput
          style={styles.numberInput}
          value={national}
          onChangeText={handleNationalChange}
          placeholder="Número móvil"
          placeholderTextColor="#6b7280"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {showValidHint ? <Text style={styles.okText}>Número válido</Text> : null}

      <Modal visible={pickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.modalRoot, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>País / prefijo</Text>
            <Pressable onPress={() => setPickerOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar país o prefijo…"
            placeholderTextColor="#6b7280"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.countryRow,
                  item.code === country && styles.countryRowSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => pickCountry(item)}
              >
                <Text style={styles.countryRowFlag}>{item.flag}</Text>
                <View style={styles.countryRowText}>
                  <Text style={styles.countryRowName}>{item.name}</Text>
                  <Text style={styles.countryRowCode}>{item.code}</Text>
                </View>
                <Text style={styles.countryRowCalling}>{item.callingCode}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rowError: {
    borderColor: 'rgba(239,68,68,0.55)',
  },
  countryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingRight: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: CARD_BORDER,
    minWidth: 108,
  },
  flag: { fontSize: 20 },
  callingCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  numberInput: {
    flex: 1,
    fontSize: 14,
    color: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#f87171',
    marginTop: 6,
  },
  okText: {
    fontSize: 12,
    color: '#4ade80',
    marginTop: 6,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  searchInput: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  countryRowSelected: {
    backgroundColor: 'rgba(241,143,52,0.12)',
  },
  countryRowFlag: { fontSize: 24 },
  countryRowText: { flex: 1 },
  countryRowName: { fontSize: 15, color: '#fff', fontWeight: '500' },
  countryRowCode: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  countryRowCalling: {
    fontSize: 15,
    fontWeight: '600',
    color: ACCENT,
  },
  pressed: { opacity: 0.85 },
});
