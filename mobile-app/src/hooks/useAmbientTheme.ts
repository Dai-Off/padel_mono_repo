import { useEffect, useState, useMemo } from 'react';
import { fetchCurrentWeather, WeatherCondition } from '../api/weatherService';

// Tipos para la configuración del tema ambiental
export interface AmbientTheme {
  bgTint: string;
  orb1Color: string;
  orb2Color: string;
  orb3Color: string;
  particleSpeed: number;
  glowOpacity: number;
}

const DEFAULT_THEME: AmbientTheme = {
  bgTint: '#0F0F0F',
  orb1Color: '241, 143, 52', // BRAND_RGB
  orb2Color: '241, 143, 52',
  orb3Color: '139, 92, 246', // PURPLE_RGB
  particleSpeed: 1,
  glowOpacity: 1,
};

/**
 * Hook para obtener la paleta de colores y configuración visual del fondo ambiental
 * basado en la hora del día y la meteorología.
 */
export function useAmbientTheme(apiKey: string) {
  const [weather, setWeather] = useState<WeatherCondition>(null);
  const [hour, setHour] = useState(new Date().getHours());

  useEffect(() => {
    // Actualizar hora cada 15 minutos
    const interval = setInterval(() => setHour(new Date().getHours()), 15 * 60 * 1000);
    
    // Obtener clima inicial
    if (apiKey) {
      fetchCurrentWeather(apiKey).then(setWeather);
    }

    return () => clearInterval(interval);
  }, [apiKey]);

  const theme = useMemo(() => {
    let base = { ...DEFAULT_THEME };

    // 1. Aplicar paleta por hora
    if (hour >= 0 && hour < 6) {
      // Madrugada
      base.bgTint = '#0a0a1a';
      base.orb1Color = '59, 130, 246'; // Azul
      base.orb2Color = '30, 58, 138';  // Azul oscuro
      base.orb3Color = '139, 92, 246'; // Púrpura
    } else if (hour >= 6 && hour < 9) {
      // Amanecer
      base.bgTint = '#1a0f0a';
      base.orb1Color = '241, 143, 52'; // Naranja
      base.orb2Color = '236, 72, 153'; // Rosa
      base.orb3Color = '251, 191, 36'; // Ámbar
    } else if (hour >= 9 && hour < 13) {
      // Mañana
      base.bgTint = '#0f1a0f';
      base.orb1Color = '251, 191, 36'; // Amarillo
      base.orb2Color = '52, 211, 153'; // Esmeralda
      base.orb3Color = '241, 143, 52'; // Naranja
    } else if (hour >= 13 && hour < 17) {
      // Tarde
      base.bgTint = '#0f0f1a';
      base.orb1Color = '241, 143, 52'; // Naranja
      base.orb2Color = '245, 158, 11'; // Ámbar intenso
      base.orb3Color = '59, 130, 246'; // Azul
    } else if (hour >= 17 && hour < 20) {
      // Atardecer
      base.bgTint = '#1a0a0f';
      base.orb1Color = '239, 68, 68';   // Rojo
      base.orb2Color = '139, 92, 246'; // Púrpura
      base.orb3Color = '236, 72, 153'; // Rosa
    } else {
      // Noche
      base.bgTint = '#0a0a14';
      base.orb1Color = '59, 130, 246'; // Azul
      base.orb2Color = '139, 92, 246'; // Violeta
      base.orb3Color = '30, 58, 138';  // Índigo
    }

    // 2. Aplicar modificadores de clima
    switch (weather) {
      case 'clear':
        base.glowOpacity = 1.2;
        break;
      case 'clouds':
        base.glowOpacity = 0.7;
        break;
      case 'rain':
        base.bgTint = '#050a14'; // Más oscuro/azulado
        base.particleSpeed = 2.5; // "Caída" más rápida
        base.orb1Color = '71, 85, 105'; // Slate
        break;
      case 'snow':
        base.bgTint = '#1e293b';
        base.particleSpeed = 0.5; // Más lento
        base.glowOpacity = 0.8;
        break;
      case 'thunderstorm':
        base.glowOpacity = 1.1; // Se podría animar pulsación luego
        break;
    }

    return base;
  }, [hour, weather]);

  return theme;
}
