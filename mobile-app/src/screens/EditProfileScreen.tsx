import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { fetchMyPlayerProfile, updateMyPlayerProfile } from '../api/players';
import { BackHeader } from '../components/layout/BackHeader';
import { theme } from '../theme';

type EditProfileScreenProps = {
  onBack: () => void;
  onSaved?: () => void;
};

export function EditProfileScreen({ onBack, onSaved }: EditProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const token = session?.access_token;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMyPlayerProfile(token).then((p) => {
      if (p) {
        setFirstName(p.firstName ?? '');
        setLastName(p.lastName ?? '');
        setPhone(p.phone ?? '');
      }
      setLoading(false);
    });
  }, [token]);

  const handleSave = async () => {
    const first = firstName.trim();
    const last = lastName.trim();
    const ph = phone.trim();
    if (!first || !last || ph.length < 5) {
      Alert.alert('Datos incompletos', 'Nombre, apellidos y teléfono (mín. 5 caracteres) son obligatorios.');
      return;
    }
    if (!token) {
      Alert.alert('Sesión', 'Inicia sesión para guardar cambios.');
      return;
    }
    setSaving(true);
    const result = await updateMyPlayerProfile(token, {
      first_name: first,
      last_name: last,
      phone: ph,
    });
    setSaving(false);
    if (!result.ok) {
      Alert.alert('Error', result.error);
      return;
    }
    onSaved?.();
    onBack();
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={theme.auth.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <BackHeader title="Editar perfil" onBack={onBack} tone="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 24 + insets.bottom, paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>
          El teléfono es obligatorio para mantener tu nombre en el perfil.
        </Text>

        <Text style={styles.label}>Nombre</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Nombre"
          placeholderTextColor="#6B7280"
          maxLength={80}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Apellidos</Text>
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Apellidos"
          placeholderTextColor="#6B7280"
          maxLength={80}
          autoCapitalize="words"
        />

        <Text style={styles.label}>Teléfono</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="+34 600 000 000"
          placeholderTextColor="#6B7280"
          keyboardType="phone-pad"
          maxLength={40}
        />

        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.pressed, saving && styles.saveBtnDisabled]}
          onPress={() => void handleSave()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Guardar cambios</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0F0F0F' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  hint: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  label: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  saveBtn: {
    marginTop: 28,
    backgroundColor: theme.auth.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
