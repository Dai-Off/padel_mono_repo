/**
 * Servicio de moderación de contenido comunitario usando Sightengine.
 */

export interface ModerationResult {
  approved: boolean;
  reason?: string;
  scores?: Record<string, number>;
  raw?: any;
}

const MODERATION_THRESHOLDS = {
  nudity_raw: 0.5,        // Desnudez explícita
  nudity_partial: 0.7,    // Desnudez parcial (más permisivo)
  weapon: 0.6,
  alcohol: 0.8,           // Permisivo para contexto social (cerveza post-padel)
  drugs: 0.5,
  offensive: 0.6,
  gore: 0.3,              // Estricto con violencia
};

/**
 * Modera una imagen usando Sightengine vía su REST API.
 * @param imageUrl URL pública de la imagen a moderar.
 */
export async function moderateImage(imageUrl: string): Promise<ModerationResult> {
  const apiUser = (process.env.SIGHTENGINE_API_USER || '').trim();
  const apiSecret = (process.env.SIGHTENGINE_API_SECRET || '').trim();

  if (!apiUser || !apiSecret) {
    console.warn('[ModerationService] Missing SIGHTENGINE credentials. Skipping moderation (auto-approving).');
    return { approved: true };
  }

  try {
    const models = 'nudity,wad,offensive,gore';
    const url = `https://api.sightengine.com/1.0/check.json?models=${models}&api_user=${apiUser}&api_secret=${apiSecret}&url=${encodeURIComponent(imageUrl)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Sightengine error: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.status === 'failure') {
      throw new Error(`Sightengine failure: ${data.error.message}`);
    }

    // Lógica de evaluación basada en umbrales
    const scores: Record<string, number> = {};
    let rejectedReason: string | undefined;

    // 1. Nudity
    const nudity = data.nudity;
    scores.nudity_raw = nudity.raw;
    scores.nudity_partial = nudity.partial;
    if (nudity.raw > MODERATION_THRESHOLDS.nudity_raw || nudity.partial > MODERATION_THRESHOLDS.nudity_partial) {
      rejectedReason = 'Contenido explícito o inapropiado detectado.';
    }

    // 2. Weapons, Alcohol, Drugs (wad)
    const wad = data.weapon_alcohol_drugs;
    if (wad) {
      scores.weapon = wad.weapon;
      scores.alcohol = wad.alcohol;
      scores.drugs = wad.drugs;
      if (wad.weapon > MODERATION_THRESHOLDS.weapon) rejectedReason = 'Armas detectadas.';
      if (wad.drugs > MODERATION_THRESHOLDS.drugs) rejectedReason = 'Drogas detectadas.';
      if (wad.alcohol > MODERATION_THRESHOLDS.alcohol) rejectedReason = 'Contenido alcohólico excesivo detectado.';
    }

    // 3. Offensive
    const offensive = data.offensive;
    if (offensive) {
      scores.offensive = offensive.prob;
      if (offensive.prob > MODERATION_THRESHOLDS.offensive) rejectedReason = 'Contenido ofensivo detectado.';
    }

    // 4. Gore
    const gore = data.gore;
    if (gore) {
      scores.gore = gore.prob;
      if (gore.prob > MODERATION_THRESHOLDS.gore) rejectedReason = 'Contenido violento o gráfico detectado.';
    }

    return {
      approved: !rejectedReason,
      reason: rejectedReason,
      scores,
      raw: data,
    };
  } catch (err) {
    console.error('[ModerationService] Error:', err);
    // En caso de error de la API (timeout, quota, etc.), permitimos revisión manual o publicamos con precaución.
    // Para el MVP, si falla Sightengine lo publicamos como 'pending_moderation' o lo aprobamos bajo bit de riesgo.
    // Decidimos retornar aprobado pero con aviso de error si se necesitara.
    return { 
      approved: true, 
      reason: 'No se pudo verificar automáticamente (servicio no disponible).',
      raw: { error: (err as Error).message } 
    };
  }
}

/**
 * Modera múltiples imágenes.
 */
export async function moderateMultipleImages(imageUrls: string[]): Promise<ModerationResult[]> {
  return Promise.all(imageUrls.map(url => moderateImage(url)));
}
