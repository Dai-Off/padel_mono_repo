import * as Location from 'expo-location';

const WEATHER_CACHE_KEY = 'ambient_weather_cache';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutos

export type WeatherCondition = 'clear' | 'clouds' | 'rain' | 'snow' | 'thunderstorm' | null;

interface WeatherCache {
  condition: WeatherCondition;
  timestamp: number;
}

let memoryCache: WeatherCache | null = null;

/** 
 * Obtiene el clima actual basado en la ubicación.
 * Utiliza un cache en memoria para evitar llamadas excesivas.
 */
export async function fetchCurrentWeather(apiKey: string): Promise<WeatherCondition> {
  if (!apiKey) return null;

  const now = Date.now();
  if (memoryCache && (now - memoryCache.timestamp < CACHE_DURATION_MS)) {
    return memoryCache.condition;
  }

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    const { latitude, longitude } = location.coords;

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiKey}&units=metric`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) return null;

    const main = data.weather?.[0]?.main?.toLowerCase() || '';
    let condition: WeatherCondition = null;

    if (main.includes('clear')) condition = 'clear';
    else if (main.includes('cloud')) condition = 'clouds';
    else if (main.includes('rain') || main.includes('drizzle')) condition = 'rain';
    else if (main.includes('snow')) condition = 'snow';
    else if (main.includes('thunder')) condition = 'thunderstorm';

    memoryCache = { condition, timestamp: now };
    return condition;
  } catch (err) {
    console.warn('[Weather] Error fetching weather:', err);
    return null;
  }
}
