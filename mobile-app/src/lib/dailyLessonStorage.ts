// Persistencia local del progreso de la lección diaria.
//
// Motivación: sin persistencia, si el usuario sale a mitad de la lección
// (llamada, cierra app, etc.) pierde el progreso Y puede "rerollear" las
// preguntas que ha fallado al volver a entrar — gameable.
//
// Esta capa guarda el snapshot tras cada respuesta y permite resumir desde
// donde se quedó usando EXACTAMENTE las mismas preguntas. Las claves incluyen
// el día local del usuario para que el progreso de ayer no contamine hoy.
//
// Persistencia 100% cliente (AsyncStorage). Si el usuario desinstala o cambia
// de dispositivo se pierde — caso raro asumible. Si llega a ser importante,
// migrar a una tabla server-side en una iteración futura.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyLessonQuestion, AnswerPayload } from '../api/dailyLessons';

export interface DailyLessonProgress {
  questions: DailyLessonQuestion[];   // las 5 preguntas servidas (locked-in)
  answers: AnswerPayload[];           // respuestas hasta ahora (0..5)
  failedIndices: number[];            // posiciones falladas
  currentIndex: number;               // dónde estaba el usuario
  startedAt: string;                  // ISO timestamp (debug)
}

const KEY_PREFIX = 'daily_lesson_progress';

/**
 * Día local del usuario en formato YYYY-MM-DD para la timezone dada. Sirve
 * como parte de la clave: el progreso de ayer no se carga hoy.
 */
function dayKeyInTz(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function buildKey(userId: string, timezone: string): string {
  return `${KEY_PREFIX}_${userId}_${dayKeyInTz(new Date(), timezone)}`;
}

export async function saveProgress(
  userId: string | null | undefined,
  timezone: string,
  snapshot: DailyLessonProgress,
): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(buildKey(userId, timezone), JSON.stringify(snapshot));
  } catch {
    // Si el guardado falla, no rompemos el flujo. La pérdida del anti-cheat
    // en este caso edge es preferible a romper la UX del usuario.
  }
}

export async function loadProgress(
  userId: string | null | undefined,
  timezone: string,
): Promise<DailyLessonProgress | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(buildKey(userId, timezone));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DailyLessonProgress;
    // Defensa básica: si la estructura está corrupta o incompleta, descartar.
    if (
      !Array.isArray(parsed.questions) ||
      !Array.isArray(parsed.answers) ||
      !Array.isArray(parsed.failedIndices) ||
      typeof parsed.currentIndex !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearProgress(
  userId: string | null | undefined,
  timezone: string,
): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(buildKey(userId, timezone));
  } catch {
    // ignore
  }
}
