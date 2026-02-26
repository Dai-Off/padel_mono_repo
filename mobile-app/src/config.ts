import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Dispositivo físico: usa el host de Metro (tu máquina en la red local)
// Emulador Android: 10.0.2.2 | Simulador iOS: localhost
function getApiUrl(): string {
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
