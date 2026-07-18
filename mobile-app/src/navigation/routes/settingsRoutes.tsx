import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MonederoScreen } from '../../screens/MonederoScreen';
import { TransaccionesScreen } from '../../screens/TransaccionesScreen';
import { PagosPendientesScreen } from '../../screens/PagosPendientesScreen';
import { MovimientosMonederoScreen } from '../../screens/MovimientosMonederoScreen';
import { AjustesScreen, AjustesSectionScreen } from '../../screens/AjustesScreen';
import { InfoContentScreen } from '../../screens/InfoContentScreen';
import { ClubReviewsScreen } from '../../screens/ClubReviewsScreen';
import { PreferencesScreen } from '../../screens/PreferencesScreen';
import { EditProfileScreen } from '../../screens/EditProfileScreen';
import { ChangePasswordScreen } from '../../screens/ChangePasswordScreen';
import { useAuth } from '../../contexts/AuthContext';
import { useAppSignals } from '../../contexts/AppSignalsContext';
import { useProfileDataActions } from '../../queries/profile';
import { RouteShell } from '../RouteShell';
import type { RootStackParamList } from '../types';

export function MonederoRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Monedero'>) {
  return (
    <RouteShell>
      <MonederoScreen
        onBack={() => navigation.goBack()}
        onPagosPendientesPress={() => navigation.navigate('PagosPendientes')}
        onMovimientosPress={() => navigation.navigate('MovimientosMonedero')}
        onTransaccionesPress={() => navigation.navigate('Transacciones')}
      />
    </RouteShell>
  );
}

export function TransaccionesRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Transacciones'>) {
  return (
    <RouteShell>
      <TransaccionesScreen onBack={() => navigation.goBack()} />
    </RouteShell>
  );
}

export function PagosPendientesRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'PagosPendientes'>) {
  return (
    <RouteShell>
      <PagosPendientesScreen onBack={() => navigation.goBack()} />
    </RouteShell>
  );
}

export function MovimientosMonederoRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'MovimientosMonedero'>) {
  return (
    <RouteShell>
      <MovimientosMonederoScreen onBack={() => navigation.goBack()} />
    </RouteShell>
  );
}

export function AjustesRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Ajustes'>) {
  return (
    <RouteShell>
      <AjustesScreen
        onBack={() => navigation.goBack()}
        onOpenSection={(section) => navigation.navigate('AjustesSection', { section })}
      />
    </RouteShell>
  );
}

export function AjustesSectionRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'AjustesSection'>) {
  return (
    <RouteShell>
      <AjustesSectionScreen
        section={route.params.section}
        onBack={() => navigation.goBack()}
        // push (no navigate): estando ya en AjustesSection, navigate solo
        // actualizaria params y el back saltaria la vista de privacidad.
        onOpenPrivacyPolicy={() => navigation.push('AjustesSection', { section: 'privacy-policy' })}
      />
    </RouteShell>
  );
}

export function InfoRoute({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Info'>) {
  return (
    <RouteShell>
      <InfoContentScreen screenId={route.params.screenId} onBack={() => navigation.goBack()} />
    </RouteShell>
  );
}

export function ClubReviewsRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ClubReviews'>) {
  return (
    <RouteShell>
      <ClubReviewsScreen onBack={() => navigation.goBack()} />
    </RouteShell>
  );
}

export function PreferencesRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Preferences'>) {
  return (
    <RouteShell>
      <PreferencesScreen onBack={() => navigation.goBack()} />
    </RouteShell>
  );
}

export function EditProfileRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'EditProfile'>) {
  const { bumpProfileRefresh, bumpPartidosRefresh } = useAppSignals();
  // Invalida las queries del perfil (antes esto lo forzaba el remount por key).
  const { refresh: refreshProfileData } = useProfileDataActions();
  return (
    <RouteShell>
      <EditProfileScreen
        onBack={() => navigation.goBack()}
        onSaved={() => {
          refreshProfileData();
          bumpProfileRefresh();
          bumpPartidosRefresh();
        }}
        // replace: hoy Preferencias sustituye a Editar perfil (el back de
        // Preferencias vuelve al perfil, no a la edicion).
        onPreferencesPress={() => navigation.replace('Preferences')}
        onChangePasswordPress={() => navigation.navigate('ChangePassword')}
      />
    </RouteShell>
  );
}

export function ChangePasswordRoute({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'ChangePassword'>) {
  const { session } = useAuth();
  return (
    <RouteShell>
      <ChangePasswordScreen
        userEmail={session?.user?.email}
        onBack={() => navigation.goBack()}
      />
    </RouteShell>
  );
}
