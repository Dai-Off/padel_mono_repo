import type { ComponentProps } from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { fetchCustomerPortalUrl } from '../api/payments';
import { BackHeader } from '../components/layout/BackHeader';
import { theme } from '../theme';

type TusPagosScreenProps = {
  onBack: () => void;
  onTransaccionesPress?: () => void;
};

type PayOptionProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  onPress?: () => void;
};

function PayOption({ icon, title, onPress }: PayOptionProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={24} color="#4b5563" style={styles.optionIcon} />
      <Text style={styles.optionTitle}>{title}</Text>
      <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
    </Pressable>
  );
}

export function TusPagosScreen({ onBack, onTransaccionesPress }: TusPagosScreenProps) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [loadingMetodos, setLoadingMetodos] = useState(false);

  const handleMetodosPago = async () => {
    const token = session?.access_token;
    if (!token) {
      Alert.alert('Sesión requerida', 'Inicia sesión para gestionar tus métodos de pago.');
      return;
    }
    setLoadingMetodos(true);
    try {
      const res = await fetchCustomerPortalUrl(token);
      if (!res.ok || !res.url) {
        Alert.alert('Error', res.error ?? 'No se pudo abrir');
        return;
      }
      const canOpen = await Linking.canOpenURL(res.url);
      if (canOpen) {
        await Linking.openURL(res.url);
      } else {
        Alert.alert('Error', 'No se puede abrir el navegador');
      }
    } catch {
      Alert.alert('Error', 'Error de conexión');
    } finally {
      setLoadingMetodos(false);
    }
  };

  return (
    <View style={styles.container}>
      <BackHeader title="Tus pagos" onBack={onBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 + (insets.bottom ?? 0) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.optionsList}>
          <Pressable
            style={({ pressed }) => [
              styles.option,
              pressed && styles.optionPressed,
              loadingMetodos && styles.optionDisabled,
            ]}
            onPress={handleMetodosPago}
            disabled={loadingMetodos}
          >
            {loadingMetodos ? (
              <ActivityIndicator size="small" color="#4b5563" style={styles.optionIcon} />
            ) : (
              <Ionicons name="card-outline" size={24} color="#4b5563" style={styles.optionIcon} />
            )}
            <Text style={styles.optionTitle}>Métodos de pago</Text>
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
          </Pressable>
          <View style={styles.optionDivider} />
          <PayOption
            icon="document-text-outline"
            title="Todas las transacciones"
            onPress={onTransaccionesPress}
          />
          <View style={styles.optionDivider} />
          <PayOption icon="home-outline" title="Membresías de clubes" onPress={() => {}} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.sm },
  optionsList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  optionPressed: { backgroundColor: '#f9fafb' },
  optionDisabled: { opacity: 0.7 },
  optionDivider: { height: 1, backgroundColor: '#f3f4f6' },
  optionIcon: { width: 28 },
  optionTitle: {
    flex: 1,
    fontSize: theme.fontSize.base,
    fontWeight: '500',
    color: '#111827',
  },
});
