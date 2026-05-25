import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import appJson from '../../app.json';
import { useAuth } from '../contexts/AuthContext';
import { useHomeData } from '../contexts/HomeDataContext';
import {
  fetchMyPlayerProfile,
  updateMyPlayerProfile,
  type PlayerGender,
} from '../api/players';
import { checkUsernameAvailable } from '../api/auth';
import { validateUsernameLocal } from '../lib/username';
import {
  patchMyAvatarUrl,
  uploadPlayerAvatarToStorage,
  type PickedImage,
} from '../api/playerAvatar';
import { BirthDatePickerField } from '../components/profile/BirthDatePickerField';
import { PlayLocationPickerModal } from '../components/profile/PlayLocationPickerModal';
import { PhoneNumberField } from '../components/profile/PhoneNumberField';
import {
  formatNationalInput,
  parseStoredPhone,
  phonePartsToComparable,
  validatePhoneParts,
  type CountryCode,
} from '../lib/phoneNumber';
const BG = '#0F0F0F';
const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';
const ACCENT = '#F18F34';

type EditProfileScreenProps = {
  onBack: () => void;
  onSaved?: () => void;
  onPreferencesPress?: () => void;
  onChangePasswordPress?: () => void;
};

const GENDER_OPTIONS: { value: PlayerGender; label: string }[] = [
  { value: 'male', label: 'Hombre' },
  { value: 'female', label: 'Mujer' },
  { value: 'other', label: 'Sin definir' },
];

const GENDER_LABEL: Record<PlayerGender, string> = {
  male: 'Hombre',
  female: 'Mujer',
  other: 'Sin definir',
};

type SavedSnapshot = {
  fullName: string;
  username: string;
  email: string;
  phoneCountry: CountryCode;
  phoneNational: string;
  gender: PlayerGender;
  birthDate: string;
  description: string;
  playWhere: string;
};

const EMPTY_SNAPSHOT: SavedSnapshot = {
  fullName: '',
  username: '',
  email: '',
  phoneCountry: 'ES',
  phoneNational: '',
  gender: 'other',
  birthDate: '',
  description: '',
  playWhere: '',
};

function isFormDirty(
  form: {
    fullName: string;
    username: string;
    phoneCountry: CountryCode;
    phoneNational: string;
    gender: PlayerGender;
    birthDate: string;
    description: string;
    playWhere: string;
  },
  baseline: SavedSnapshot,
): boolean {
  return (
    form.fullName.trim() !== baseline.fullName.trim() ||
    form.username.trim() !== baseline.username.trim() ||
    phonePartsToComparable(form.phoneCountry, form.phoneNational) !==
      phonePartsToComparable(baseline.phoneCountry, baseline.phoneNational) ||
    form.gender !== baseline.gender ||
    form.birthDate.trim() !== baseline.birthDate.trim() ||
    form.description.trim() !== baseline.description.trim() ||
    form.playWhere.trim() !== baseline.playWhere.trim()
  );
}

function snapshotFromProfile(
  p: Awaited<ReturnType<typeof fetchMyPlayerProfile>>,
  fallbackEmail: string,
): SavedSnapshot {
  const fn = p
    ? [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
    : '';
  const { country, national } = parseStoredPhone(p?.phone ?? '');
  return {
    fullName: fn,
    username: p?.username ?? '',
    email: p?.email ?? fallbackEmail,
    phoneCountry: country,
    phoneNational: national ? formatNationalInput(country, national) : '',
    gender: p?.gender ?? 'other',
    birthDate: p?.birthDate ?? '',
    description: p?.profileDescription ?? '',
    playWhere: p?.playLocation ?? '',
  };
}

function getInitials(first?: string, last?: string | null): string {
  const f = first?.trim();
  const l = last?.trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  return '?';
}

function splitFullName(full: string): { first: string; last: string } {
  const t = full.trim();
  if (!t) return { first: '', last: '' };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
      <LinearGradient
        colors={['rgba(241,143,52,0.2)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.sectionHeaderLine}
      />
    </View>
  );
}

function FieldCard({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.fieldCard}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {children}
    </View>
  );
}

function MenuLinkRow({
  icon,
  iconColors,
  iconColor = ACCENT,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColors: [string, string];
  iconColor?: string;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
      onPress={onPress}
    >
      <LinearGradient colors={iconColors} style={styles.menuIconBox}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </LinearGradient>
      <View style={styles.menuTextCol}>
        <Text style={styles.menuTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.menuSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#4b5563" />
    </Pressable>
  );
}

export function EditProfileScreen({
  onBack,
  onSaved,
  onPreferencesPress,
  onChangePasswordPress,
}: EditProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { refreshProfile } = useHomeData();
  const token = session?.access_token;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('ES');
  const [phoneNational, setPhoneNational] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [gender, setGender] = useState<PlayerGender>('other');
  const [birthDate, setBirthDate] = useState('');
  const [description, setDescription] = useState('');
  const [playWhere, setPlayWhere] = useState('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [baseline, setBaseline] = useState<SavedSnapshot>(EMPTY_SNAPSHOT);

  const applySnapshotToForm = useCallback((snap: SavedSnapshot) => {
    setFullName(snap.fullName);
    setUsername(snap.username);
    setEmail(snap.email);
    setPhoneCountry(snap.phoneCountry);
    setPhoneNational(snap.phoneNational);
    setPhoneError(null);
    setGender(snap.gender);
    setBirthDate(snap.birthDate);
    setDescription(snap.description);
    setPlayWhere(snap.playWhere);
    setBaseline(snap);
  }, []);

  const initials = useMemo(() => {
    const { first, last } = splitFullName(fullName);
    return getInitials(first, last);
  }, [fullName]);

  const isDirty = useMemo(
    () =>
      isFormDirty(
        { fullName, username, phoneCountry, phoneNational, gender, birthDate, description, playWhere },
        baseline,
      ),
    [fullName, username, phoneCountry, phoneNational, gender, birthDate, description, playWhere, baseline],
  );

  useEffect(() => {
    const digits = phoneNational.replace(/\D/g, '');
    if (digits.length < 4) {
      setPhoneError(null);
      return;
    }
    const v = validatePhoneParts(phoneCountry, phoneNational);
    setPhoneError(v.ok ? null : v.error);
  }, [phoneCountry, phoneNational]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMyPlayerProfile(token).then((p) => {
      const snap = snapshotFromProfile(p, session?.user?.email ?? '');
      applySnapshotToForm(snap);
      if (p) setAvatarUrl(p.avatarUrl);
      setLoading(false);
    });
  }, [token, session?.user?.email, applySnapshotToForm]);

  const pickImage = async (source: 'library' | 'camera') => {
    if (!session?.user?.id || !token || !session.refresh_token) {
      Alert.alert('Sesión', 'Inicia sesión para cambiar tu foto.');
      return;
    }
    if (source === 'library') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a tu galería.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      await applyPickedImage({
        uri: result.assets[0].uri,
        mimeType: result.assets[0].mimeType,
        fileName: result.assets[0].fileName,
      });
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitamos acceso a la cámara.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    await applyPickedImage({
      uri: result.assets[0].uri,
      mimeType: result.assets[0].mimeType,
      fileName: result.assets[0].fileName,
    });
  };

  const applyPickedImage = async (image: PickedImage) => {
    if (!session?.user?.id || !token || !session.refresh_token) return;
    setAvatarUrl(image.uri);
    setUploadingAvatar(true);
    try {
      const publicUrl = await uploadPlayerAvatarToStorage(
        session.user.id,
        token,
        session.refresh_token,
        image,
      );
      const patch = await patchMyAvatarUrl(token, publicUrl);
      if (!patch.ok) {
        const p = await fetchMyPlayerProfile(token);
        setAvatarUrl(p?.avatarUrl ?? null);
        Alert.alert('Error', patch.error);
        return;
      }
      setAvatarUrl(publicUrl);
      await refreshProfile({ force: true });
    } catch (err) {
      const p = await fetchMyPlayerProfile(token);
      setAvatarUrl(p?.avatarUrl ?? null);
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo subir la foto');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangePhoto = () => {
    Alert.alert('Foto de perfil', 'Elige una opción', [
      { text: 'Galería', onPress: () => void pickImage('library') },
      { text: 'Cámara', onPress: () => void pickImage('camera') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const saveProfile = useCallback(async (): Promise<boolean> => {
    if (!token) return false;

    const { first, last } = splitFullName(fullName);

    const nameChanged = fullName.trim() !== baseline.fullName.trim();
    const usernameChanged = username.trim().toLowerCase() !== baseline.username.trim().toLowerCase();
    const phoneChanged =
      phonePartsToComparable(phoneCountry, phoneNational) !==
      phonePartsToComparable(baseline.phoneCountry, baseline.phoneNational);

    if (nameChanged || phoneChanged) {
      if (!first || !last) {
        Alert.alert('Datos incompletos', 'El nombre completo es obligatorio.');
        return false;
      }
    }

    let phoneE164: string | null = null;
    if (phoneChanged) {
      const phoneCheck = validatePhoneParts(phoneCountry, phoneNational);
      if (!phoneCheck.ok) {
        setPhoneError(phoneCheck.error);
        Alert.alert('Teléfono', phoneCheck.error);
        return false;
      }
      phoneE164 = phoneCheck.e164;
    }

    const birthTrim = birthDate.trim();

    if (usernameChanged) {
      const usernameErr = validateUsernameLocal(username);
      if (usernameErr) {
        Alert.alert('Usuario', usernameErr);
        return false;
      }
      const normalized = username.trim().toLowerCase();
      const profile = await fetchMyPlayerProfile(token);
      const check = await checkUsernameAvailable(normalized, profile?.id);
      if (!check.ok) {
        Alert.alert('Usuario', check.error);
        return false;
      }
      if (!check.available) {
        Alert.alert('Usuario', 'Este usuario ya está en uso');
        return false;
      }
    }

    setSaving(true);
    const payload: Parameters<typeof updateMyPlayerProfile>[1] = {
      gender,
      birth_date: birthTrim || null,
      profile_description: description.trim() || null,
      play_location: playWhere.trim() || null,
    };
    if (nameChanged) {
      payload.first_name = first;
      payload.last_name = last;
    }
    if (phoneChanged && phoneE164) {
      payload.phone = phoneE164;
    }
    if (usernameChanged) {
      payload.username = username.trim().toLowerCase();
    }

    const result = await updateMyPlayerProfile(token, payload);
    setSaving(false);
    if (!result.ok) {
      Alert.alert('Error', result.error);
      return false;
    }
    const snap = snapshotFromProfile(result.player, email);
    applySnapshotToForm(snap);
    await refreshProfile({ force: true });
    onSaved?.();
    return true;
  }, [
    fullName,
    username,
    phoneNational,
    phoneCountry,
    email,
    gender,
    birthDate,
    description,
    playWhere,
    baseline,
    token,
    refreshProfile,
    onSaved,
    applySnapshotToForm,
  ]);

  const handleSave = async () => {
    const ok = await saveProfile();
    if (ok) {
      Alert.alert('Perfil', 'Datos guardados correctamente.');
    }
  };

  const handleBack = () => {
    if (!isDirty) {
      onBack();
      return;
    }
    Alert.alert('Cambios sin guardar', '¿Quieres guardar antes de salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Descartar',
        style: 'destructive',
        onPress: onBack,
      },
      {
        text: 'Guardar',
        onPress: () => {
          void (async () => {
            const ok = await saveProfile();
            if (ok) onBack();
          })();
        },
      },
    ]);
  };

  const pickGender = () => {
    Alert.alert(
      'Género',
      undefined,
      GENDER_OPTIONS.map((opt) => ({
        text: opt.label,
        onPress: () => setGender(opt.value),
      })),
    );
  };

  const appVersion = appJson.expo.version ?? '0.0.1';

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.stickyHeader, { paddingTop: insets.top }]}>
        <Pressable
          style={({ pressed }) => [styles.headerBackBtn, pressed && styles.pressed]}
          onPress={handleBack}
          accessibilityLabel="Volver"
        >
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Editar perfil</Text>
        <View style={styles.headerSpacer} />
        {saving ? <ActivityIndicator size="small" color={ACCENT} /> : null}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 24 + insets.bottom + (isDirty ? 88 : 0) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarBlock}>
          <View style={styles.avatarOuter}>
            {avatarUrl?.trim() ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <LinearGradient
                colors={[ACCENT, '#E95F32']}
                style={styles.avatarImage}
              >
                <Text style={styles.avatarInitials}>{initials}</Text>
              </LinearGradient>
            )}
            {uploadingAvatar ? (
              <View style={styles.avatarLoading}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
            <View style={styles.avatarBadge}>
              <Ionicons name="person" size={16} color={ACCENT} />
            </View>
          </View>
          <Pressable onPress={handleChangePhoto} disabled={uploadingAvatar}>
            <Text style={styles.changePhotoText}>Cambiar foto de perfil</Text>
          </Pressable>
        </View>

        <SectionHeader title="Información personal" />

        <View style={styles.fieldsGap}>
          <FieldCard label="Nombre y apellidos">
            <TextInput
              style={styles.fieldInput}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Tu nombre"
              placeholderTextColor="#4b5563"
              autoCapitalize="words"
            />
          </FieldCard>

          <FieldCard label="Usuario">
            <TextInput
              style={styles.fieldInput}
              value={username}
              onChangeText={(t) => setUsername(t.replace(/\s/g, '').toLowerCase())}
              placeholder="tu_usuario"
              placeholderTextColor="#4b5563"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </FieldCard>

          <FieldCard label="Email">
            <TextInput
              style={styles.fieldInput}
              value={email}
              editable={false}
              placeholderTextColor="#4b5563"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </FieldCard>

          <View style={styles.phoneFieldWrap}>
            <PhoneNumberField
              country={phoneCountry}
              national={phoneNational}
              onCountryChange={setPhoneCountry}
              onNationalChange={setPhoneNational}
              error={phoneError}
            />
          </View>

          <Pressable onPress={pickGender}>
            <FieldCard label="Género">
              <View style={styles.genderRow}>
                <Text style={styles.fieldInput}>{GENDER_LABEL[gender]}</Text>
                <Ionicons name="chevron-down" size={16} color="#6b7280" />
              </View>
            </FieldCard>
          </Pressable>

          <FieldCard label="Fecha de nacimiento">
            <BirthDatePickerField value={birthDate} onChange={setBirthDate} />
          </FieldCard>

          <FieldCard label="Descripción">
            <TextInput
              style={[styles.fieldInput, styles.fieldTextArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="100 caracteres"
              placeholderTextColor="#4b5563"
              multiline
              maxLength={100}
            />
          </FieldCard>

          <FieldCard label="¿Dónde juegas?">
            <View style={styles.locationRow}>
              <TextInput
                style={[styles.fieldInput, { flex: 1 }]}
                value={playWhere}
                onChangeText={setPlayWhere}
                placeholder="Ciudad, club o zona"
                placeholderTextColor="#4b5563"
              />
              <Pressable
                style={({ pressed }) => [styles.locationGpsBtn, pressed && styles.pressed]}
                onPress={() => setShowLocationPicker(true)}
                accessibilityLabel="Elegir en el mapa"
              >
                <Ionicons name="map-outline" size={18} color={ACCENT} />
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [styles.locationMapLink, pressed && styles.pressed]}
              onPress={() => setShowLocationPicker(true)}
            >
              <Ionicons name="location-outline" size={14} color={ACCENT} />
              <Text style={styles.locationMapLinkText}>Elegir en el mapa</Text>
            </Pressable>
          </FieldCard>
        </View>

        <SectionHeader title="Preferencias de jugador" />
        <MenuLinkRow
          icon="trophy-outline"
          iconColors={['rgba(241,143,52,0.2)', 'rgba(233,95,50,0.1)']}
          title="Editar tus preferencias"
          subtitle="Mejor mano, lado de la pista, tipo de partid..."
          onPress={onPreferencesPress}
        />

        <SectionHeader title="Intereses" />
        <MenuLinkRow
          icon="people-outline"
          iconColors={['rgba(168,85,247,0.2)', 'rgba(147,51,234,0.1)']}
          iconColor="#c084fc"
          title="Editar tus intereses"
          subtitle="Juega con amigos, competiciones, desafí..."
          onPress={() => Alert.alert('Próximamente', 'Esta sección estará disponible pronto.')}
        />

        <SectionHeader title="Tu contraseña" />
        <View style={styles.passwordCard}>
          <View>
            <Text style={styles.passwordLabel}>Contraseña</Text>
            <Text style={styles.passwordDots}>••••••••••</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.passwordGearBtn, pressed && styles.pressed]}
            onPress={onChangePasswordPress}
            accessibilityLabel="Cambiar contraseña"
          >
            <Ionicons name="settings-outline" size={16} color={ACCENT} />
          </Pressable>
        </View>

        <Text style={styles.versionText}>Version {appVersion}</Text>
      </ScrollView>

      {isDirty ? (
        <View
          style={[
            styles.saveFooter,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.saveBtnPressable,
              saving && styles.saveBtnDisabled,
              pressed && !saving && styles.pressed,
            ]}
            onPress={() => void handleSave()}
            disabled={saving}
            accessibilityLabel="Guardar datos"
          >
            <LinearGradient
              colors={[ACCENT, '#E95F32']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.saveBtnGradient}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveText}>Guardar datos</Text>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}

      <PlayLocationPickerModal
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onConfirm={(label) => setPlayWhere(label)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  centered: { alignItems: 'center', justifyContent: 'center' },
  stickyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'rgba(15,15,15,0.95)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CARD_BORDER,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },
  avatarBlock: { alignItems: 'center', marginBottom: 32, marginTop: 8 },
  avatarOuter: {
    width: 96,
    height: 96,
    borderRadius: 16,
    marginBottom: 12,
    position: 'relative',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInitials: { color: '#fff', fontSize: 24, fontWeight: '700' },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    borderWidth: 2,
    borderColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoText: {
    fontSize: 14,
    fontWeight: '600',
    color: ACCENT,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.32,
    color: ACCENT,
    textTransform: 'uppercase',
  },
  sectionHeaderLine: { flex: 1, height: 1 },
  fieldsGap: { gap: 12, marginBottom: 32, marginTop: 12 },
  fieldCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  fieldInput: {
    fontSize: 14,
    color: '#fff',
    padding: 0,
  },
  fieldTextArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  phoneFieldWrap: { marginBottom: 0 },
  genderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationGpsBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(241,143,52,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationMapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  locationMapLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: ACCENT,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    marginTop: 12,
  },
  menuRowPressed: { backgroundColor: CARD_BG },
  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextCol: { flex: 1, minWidth: 0 },
  menuTitle: { fontSize: 15, fontWeight: '600', color: '#fff' },
  menuSubtitle: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  passwordCard: {
    marginTop: 12,
    marginBottom: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passwordLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 6,
  },
  passwordDots: {
    fontSize: 18,
    letterSpacing: 4,
    color: '#fff',
  },
  passwordGearBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(241,143,52,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionText: {
    fontSize: 12,
    color: '#4b5563',
    textAlign: 'center',
    marginTop: 32,
    marginBottom: 16,
  },
  saveFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CARD_BORDER,
  },
  saveBtnPressable: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  saveBtnGradient: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  saveBtnDisabled: {
    opacity: 0.55,
    shadowOpacity: 0,
  },
  saveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: { opacity: 0.85 },
});
