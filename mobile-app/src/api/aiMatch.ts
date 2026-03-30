import AsyncStorage from '@react-native-async-storage/async-storage';

type AiMatchResponse = {
  ok: boolean;
  text?: string;
  error?: string;
};

const AI_MATCH_WEBHOOK_URL =
  (process.env.EXPO_PUBLIC_AI_MATCH_WEBHOOK_URL as string | undefined)?.trim() ||
  (process.env.EXPO_PUBLIC_IA_MATCH_WEBHOOK_URL as string | undefined)?.trim() ||
  '';
const AI_MATCH_SESSION_KEY = 'ai_match_session_id';

let inMemorySessionId: string | null = null;

async function getAiSessionId(): Promise<string> {
  if (inMemorySessionId) return inMemorySessionId;

  const stored = await AsyncStorage.getItem(AI_MATCH_SESSION_KEY);
  if (stored) {
    inMemorySessionId = stored;
    return stored;
  }

  const created = `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(AI_MATCH_SESSION_KEY, created);
  inMemorySessionId = created;
  return created;
}

function extractTextFromUnknown(payload: unknown): string | null {
  if (typeof payload === 'string') return payload;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const text = extractTextFromUnknown(item);
      if (text) return text;
    }
    return null;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const directCandidates = [
      record.output,
      record.response,
      record.answer,
      record.text,
      record.message,
      record.content,
    ];

    for (const candidate of directCandidates) {
      const parsed = extractTextFromUnknown(candidate);
      if (parsed) return parsed;
    }

    if (record.data) {
      const parsed = extractTextFromUnknown(record.data);
      if (parsed) return parsed;
    }
  }

  return null;
}

export async function searchAiMatch(chatInput: string): Promise<AiMatchResponse> {
  if (!AI_MATCH_WEBHOOK_URL) {
    return {
      ok: false,
      error: 'Falta EXPO_PUBLIC_AI_MATCH_WEBHOOK_URL (o EXPO_PUBLIC_IA_MATCH_WEBHOOK_URL) en el entorno de mobile-app.',
    };
  }

  try {
    const sessionId = await getAiSessionId();
    const url = new URL(AI_MATCH_WEBHOOK_URL);
    url.searchParams.set('sessionId', sessionId);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sendMessage',
        sessionId,
        chatInput,
      }),
    });

    if (!response.ok) {
      return { ok: false, error: 'La IA no respondió correctamente.' };
    }

    const rawText = await response.text();
    if (!rawText) {
      return { ok: false, error: 'La IA devolvió una respuesta vacía.' };
    }

    // Chat trigger puede devolver JSON o texto/stream serializado.
    let text: string | null = null;
    try {
      const parsed = JSON.parse(rawText) as unknown;
      text = extractTextFromUnknown(parsed);
    } catch {
      text = rawText.trim();
    }

    if (!text) {
      return { ok: false, error: 'No se pudo leer la respuesta de la IA.' };
    }

    if (/service refused the connection|perhaps it is offline/i.test(text)) {
      return {
        ok: false,
        error: 'El servicio de IA está temporalmente no disponible. Intenta de nuevo en unos minutos.',
      };
    }

    return { ok: true, text };
  } catch {
    return { ok: false, error: 'Error de conexión con el servicio de IA.' };
  }
}
