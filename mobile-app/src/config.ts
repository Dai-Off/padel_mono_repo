import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const STRIPE_PUBLISHABLE_KEY =
  (process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY as string | undefined) || '';

// Producción / EAS: definir EXPO_PUBLIC_API_URL en el build (Expo Dashboard → Variables o eas env).
// Desarrollo: Metro (hostUri); emulador Android 10.0.2.2; simulador iOS localhost.
function getApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, '');
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:3000`;
  }

  return Platform.OS === 'android'
    ? 'http://10.0.2.2:3000'
    : 'http://localhost:3000';
}

export const API_URL = getApiUrl();
