import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  deleteMyClubReview,
  submitClubReview,
  type MyClubReview,
} from '../../api/clubReviews';
import { theme } from '../../theme';

const ACCENT = theme.auth.accent;
const STAR_ON = '#fbbf24';
const STAR_OFF = '#d1d5db';

type Props = {
  visible: boolean;
  clubId: string;
  clubName: string;
  accessToken: string | null | undefined;
  existingReview: MyClubReview | null;
  onClose: () => void;
  onSaved: (review: MyClubReview | null) => void;
};

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${n} estrellas`}
          >
            <Ionicons
              name={filled ? 'star' : 'star-outline'}
              size={36}
              color={filled ? STAR_ON : STAR_OFF}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export function ClubReviewModal({
  visible,
  clubId,
  clubName,
  accessToken,
  existingReview,
  onClose,
  onSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setRating(existingReview?.rating ?? 0);
    setComment(existingReview?.comment ?? '');
  }, [visible, existingReview]);

  const handleSave = async () => {
    if (!accessToken) {
      Alert.alert('Inicia sesión', 'Debes iniciar sesión para dejar una reseña.');
      return;
    }
    if (rating < 1) {
      Alert.alert('Valoración', 'Selecciona de 1 a 5 estrellas.');
      return;
    }
    setSaving(true);
    const res = await submitClubReview(accessToken, {
      club_id: clubId,
      rating,
      comment: comment.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      Alert.alert('Reseña', res.error);
      return;
    }
    onSaved(res.review);
    onClose();
  };

  const handleDelete = () => {
    if (!accessToken || !existingReview?.id) return;
    Alert.alert(
      'Eliminar reseña',
      '¿Quieres quitar tu valoración de este club?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const res = await deleteMyClubReview(accessToken, existingReview.id);
            setDeleting(false);
            if (!res.ok) {
              Alert.alert('Reseña', res.error);
              return;
            }
            onSaved(null);
            onClose();
          },
        },
      ],
    );
  };

  const busy = saving || deleting;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            {existingReview ? 'Editar tu reseña' : 'Valorar club'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {clubName}
          </Text>
          <Text style={styles.hint}>
            Comparte tu experiencia después de jugar en este club. Solo si has jugado un partido, reservado una pista privada o participado en un torneo aquí.
          </Text>

          <StarPicker value={rating} onChange={setRating} />

          <Text style={styles.label}>Comentario (opcional)</Text>
          <TextInput
            style={styles.input}
            value={comment}
            onChangeText={setComment}
            placeholder="Instalaciones, trato, pistas…"
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={4000}
            editable={!busy}
          />

          <Pressable
            onPress={() => void handleSave()}
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryBtn,
              (pressed || busy) && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {existingReview ? 'Guardar cambios' : 'Publicar reseña'}
              </Text>
            )}
          </Pressable>

          {existingReview ? (
            <Pressable
              onPress={handleDelete}
              disabled={busy}
              style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
            >
              <Text style={styles.deleteBtnText}>
                {deleting ? 'Eliminando…' : 'Eliminar mi reseña'}
              </Text>
            </Pressable>
          ) : null}

          <Pressable onPress={onClose} disabled={busy} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  keyboard: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e5e7eb',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 4,
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 8,
    marginBottom: 16,
    lineHeight: 18,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#111827',
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  deleteBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteBtnText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#6b7280',
    fontWeight: '600',
    fontSize: 14,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.6 },
});
