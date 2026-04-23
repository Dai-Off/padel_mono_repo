import { getSupabaseServiceRoleClient } from '../lib/supabase';

// ============================================================================
// Tipos
// ============================================================================

export type OnboardingAnswer = { question_key: string; value: any };

export type Question = {
  id: string;
  question_key: string;
  phase: number;
  pool?: string | null;
  text: string;
  type: 'single' | 'multi' | 'order';
  options: any;
  display_order: number;
};

type Phase2PoolRange = { min: number; max: number; pool: string };
type Phase2AdjustmentRow = { min_score: number; adjustment: number };
type FinalBounds = { floor: number; ceiling: number };

type OnboardingConfig = {
  p6_factors: Record<string, number>;
  phase2_pools: Phase2PoolRange[];
  phase2_adjustments: Phase2AdjustmentRow[]; // ordenada descendente por min_score
  final_bounds: FinalBounds;
};

// ============================================================================
// Config: lectura desde onboarding_config con cache en memoria (TTL 5 min)
// ============================================================================

const CONFIG_TTL_MS = 5 * 60 * 1000;
let configCache: OnboardingConfig | null = null;
let configCacheAt = 0;

export async function getOnboardingConfig(forceRefresh = false): Promise<OnboardingConfig> {
  if (!forceRefresh && configCache && Date.now() - configCacheAt < CONFIG_TTL_MS) {
    return configCache;
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('onboarding_config').select('key, value');
  if (error) throw new Error(`No se pudo leer onboarding_config: ${error.message}`);

  const byKey: Record<string, any> = {};
  for (const row of (data || [])) byKey[row.key] = row.value;

  const required = ['p6_factors', 'phase2_pools', 'phase2_adjustments', 'final_bounds'];
  for (const k of required) {
    if (byKey[k] === undefined) throw new Error(`onboarding_config: falta la clave '${k}'`);
  }

  configCache = {
    p6_factors: byKey.p6_factors as Record<string, number>,
    phase2_pools: byKey.phase2_pools as Phase2PoolRange[],
    phase2_adjustments: (byKey.phase2_adjustments as Phase2AdjustmentRow[])
      .slice()
      .sort((a, b) => b.min_score - a.min_score),
    final_bounds: byKey.final_bounds as FinalBounds,
  };
  configCacheAt = Date.now();
  return configCache;
}

/**
 * Invalida la cache de config (úsalo tras un cambio vía panel admin).
 */
export function invalidateOnboardingConfigCache(): void {
  configCache = null;
  configCacheAt = 0;
}

// ============================================================================
// Conversión ELO <-> mu (OpenSkill)
// ============================================================================

/**
 * Deriva el valor interno "mu" usado por OpenSkill a partir de un elo_rating
 * en escala 0-7. sigma se asume 8.333 (default nuevo jugador).
 */
export function eloToMu(eloRating: number): number {
  const sigma = 8.333;
  return (eloRating / 7 * 50) + 2 * sigma;
}

// ============================================================================
// Cálculo ELO final (floor/ceiling de onboarding_config)
// ============================================================================

export async function calcFinalElo(eloPhase1: number, phase2Adjustment: number): Promise<number> {
  const { final_bounds } = await getOnboardingConfig();
  return Math.max(final_bounds.floor, Math.min(final_bounds.ceiling, eloPhase1 + phase2Adjustment));
}

// ============================================================================
// Pool Fase 2 (rangos de onboarding_config)
// ============================================================================

export async function getPhase2Pool(eloPhase1: number): Promise<string> {
  const { phase2_pools } = await getOnboardingConfig();
  for (const range of phase2_pools) {
    if (eloPhase1 >= range.min && eloPhase1 < range.max) return range.pool;
  }
  return phase2_pools[phase2_pools.length - 1]?.pool ?? 'beginner';
}

// ============================================================================
// Flujo de preguntas
// ============================================================================

export async function getNextQuestionState(answers: OnboardingAnswer[]): Promise<any> {
  const supabase = getSupabaseServiceRoleClient();
  const getAns = (key: string) => answers.find((a) => a.question_key === key)?.value;
  const p1Val = getAns('p1');
  const p7Val = getAns('p7');

  if (p1Val === undefined) return { type: 'question', question: await fetchQuestion('p1') };

  if (p1Val < 2) {
    if (p7Val === undefined) return { type: 'question', question: await fetchQuestion('p7') };
    if (p7Val === 'yes') {
      if (getAns('p8') === undefined) return { type: 'question', question: await fetchQuestion('p8') };
      if (getAns('p9') === undefined) return { type: 'question', question: await fetchQuestion('p9') };
    }
    return { type: 'complete' };
  }

  // P1 >= 2
  if (getAns('p2') === undefined) return { type: 'question', question: await fetchQuestion('p2') };
  if (getAns('p3') === undefined) return { type: 'question', question: await fetchQuestion('p3') };
  if (p1Val >= 3 && getAns('p4') === undefined) return { type: 'question', question: await fetchQuestion('p4') };
  if (getAns('p5') === undefined) return { type: 'question', question: await fetchQuestion('p5') };
  if (p1Val >= 3) {
    const p6Key = Number(p1Val) === 3 ? 'p6a' : 'p6b';
    if (getAns(p6Key) === undefined) return { type: 'question', question: await fetchQuestion(p6Key) };
  }

  if (p7Val === undefined) return { type: 'question', question: await fetchQuestion('p7') };
  if (p7Val === 'yes') {
    if (getAns('p8') === undefined) return { type: 'question', question: await fetchQuestion('p8') };
    if (getAns('p9') === undefined) return { type: 'question', question: await fetchQuestion('p9') };
  }

  // Fin Fase 1 -> servimos 5 preguntas aleatorias del pool correspondiente
  const questionsPhase1 = await fetchAllPhase1Questions();
  const eloPhase1 = await calcEloPhase1FromData(answers, questionsPhase1);
  const pool = await getPhase2Pool(eloPhase1);

  const { data: qPhase2, error } = await supabase
    .from('onboarding_questions')
    .select('*')
    .eq('phase', 2)
    .eq('pool', pool)
    .eq('is_active', true)
    .order('id')
    .limit(5);

  if (error || !qPhase2) return { type: 'complete' };

  const mixed = qPhase2.map(q => {
    const optionsCopy = typeof q.options === 'string' ? JSON.parse(q.options) : { ...q.options };
    if (optionsCopy.correct_index !== undefined) delete optionsCopy.correct_index;
    if (optionsCopy.correct_indices !== undefined) delete optionsCopy.correct_indices;

    if (q.type === 'order' && optionsCopy.steps) {
      const steps = [...optionsCopy.steps];
      for (let i = steps.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [steps[i], steps[j]] = [steps[j], steps[i]];
      }
      optionsCopy.client_steps = steps;
    }
    return { ...q, options: optionsCopy };
  }).sort(() => Math.random() - 0.5);

  return { type: 'phase2', questions: mixed, elo_phase1: eloPhase1, pool_assigned: pool };
}

// ============================================================================
// Cálculo ELO Fase 1
// ============================================================================

export async function calcEloPhase1(answers: OnboardingAnswer[]): Promise<number> {
  const questions = await fetchAllPhase1Questions();
  return calcEloPhase1FromData(answers, questions);
}

async function calcEloPhase1FromData(answers: OnboardingAnswer[], questions: Question[]): Promise<number> {
  const getAns = (key: string) => answers.find((a) => a.question_key === key)?.value;
  const p1Val = getAns('p1');
  if (p1Val === undefined) return 0.5;

  const { p6_factors, final_bounds } = await getOnboardingConfig();

  // Matriz P9 leída de las options de p9 (opt.correctors).
  const p9q = questions.find(q => q.question_key === 'p9');
  const p9Val = getAns('p9') !== undefined ? Number(getAns('p9')) : 0;
  const p9Option = Array.isArray(p9q?.options)
    ? (p9q!.options as any[]).find(o => Number(o.value) === p9Val)
    : null;
  const p9Correctors: Record<string, number> = p9Option?.correctors ?? {};

  if (p1Val < 2) {
    if (getAns('p7') === 'yes' && getAns('p9') !== undefined) {
      const v = p9Correctors['sin_p2'];
      return typeof v === 'number' ? v : 0.5;
    }
    return 0.5;
  }

  // P1 >= 2: acumulador + techos
  let elo = 0;

  // Techo P1 leído de las options de p1 (opt.ceiling).
  const p1q = questions.find(q => q.question_key === 'p1');
  const p1Option = Array.isArray(p1q?.options)
    ? (p1q!.options as any[]).find(o => Number(o.value) === Number(p1Val))
    : null;
  const ceilP1: number | null = p1Option?.ceiling ?? null;

  let ceilP2 = final_bounds.ceiling;

  const p2Ans = getAns('p2');
  if (p2Ans) {
    const p2q = questions.find(q => q.question_key === 'p2');
    const opt = Array.isArray(p2q?.options)
      ? (p2q!.options as any[]).find(o => o.value === p2Ans)
      : null;
    if (opt) {
      elo += Number(opt.base_elo) || 0;
      ceilP2 = (opt.ceiling != null ? Number(opt.ceiling) : final_bounds.ceiling);
    }
  }

  const addCorrector = (qKey: string) => {
    const ans = getAns(qKey);
    if (ans === undefined) return;
    const q = questions.find(qq => qq.question_key === qKey);
    if (!q || !Array.isArray(q.options)) return;
    const opt = (q.options as any[]).find((o, idx) => o.text === ans || o.value == ans || idx == ans);
    if (opt && opt.corrector != null) elo += Number(opt.corrector);
  };

  addCorrector('p3');
  addCorrector('p4');
  addCorrector('p5');

  // P6 multiselect (p6a si P1=3, p6b si P1=4): elo = max + sum(resto) * factor
  const p6Key = Number(p1Val) === 3 ? 'p6a' : 'p6b';
  const p6Ans = getAns(p6Key);
  if (Array.isArray(p6Ans) && p6Ans.length > 0) {
    const p6q = questions.find(q => q.question_key === p6Key);
    const factor = Number(p6_factors[p6Key] ?? 0);

    const elos: number[] = [];
    if (Array.isArray(p6q?.options)) {
      for (const value of p6Ans) {
        const opt = (p6q!.options as any[]).find(o => o.text === value || o.value === value);
        if (opt && opt.elo != null) {
          const v = Number(opt.elo);
          if (v > 0) elos.push(v);
        }
      }
    }
    elos.sort((a, b) => b - a);
    if (elos.length > 0) {
      elo += elos[0];
      for (let i = 1; i < elos.length; i++) elo += elos[i] * factor;
    }
  }

  // Corrector P9 (matriz cruzada con P2)
  if (getAns('p7') === 'yes' && getAns('p9') !== undefined && typeof p2Ans === 'string') {
    const v = p9Correctors[p2Ans];
    if (typeof v === 'number') elo += v;
  }

  // Aplicar techos en cascada: primero P2, luego P1
  elo = Math.min(elo, ceilP2);
  if (ceilP1 != null) elo = Math.min(elo, ceilP1);

  return elo;
}

// ============================================================================
// Cálculo resultado Fase 2
// ============================================================================

export async function calcPhase2Result(
  phase2Answers: OnboardingAnswer[]
): Promise<{ score: number; adjustment: number }> {
  if (!phase2Answers || phase2Answers.length === 0) return { score: 0, adjustment: 0 };

  const supabase = getSupabaseServiceRoleClient();
  const keys = phase2Answers.map(a => a.question_key);
  const { data: questions } = await supabase
    .from('onboarding_questions')
    .select('question_key, type, options')
    .in('question_key', keys);

  if (!questions) return { score: 0, adjustment: 0 };

  let score = 0;

  for (const p2ans of phase2Answers) {
    const q = questions.find(x => x.question_key === p2ans.question_key);
    if (!q) continue;

    const opts = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;

    if (q.type === 'single') {
      if (p2ans.value === opts.correct_index || p2ans.value === opts.options[opts.correct_index]) {
        score += 1;
      }
    } else if (q.type === 'multi') {
      const selected = Array.isArray(p2ans.value) ? p2ans.value : [p2ans.value];
      const correctIndices = opts.correct_indices as number[];
      const selIndices = selected.map((s: any) => typeof s === 'number' ? s : opts.options.indexOf(s));

      const allCorrect =
        correctIndices.every(c => selIndices.includes(c)) &&
        selIndices.every((s: number) => correctIndices.includes(s));
      const someCorrect = selIndices.some((s: number) => correctIndices.includes(s));
      const noneWrong = selIndices.every((s: number) => correctIndices.includes(s));

      if (allCorrect) score += 1;
      else if (someCorrect && noneWrong) score += 0.5;
    } else if (q.type === 'order') {
      const originalSteps = opts.steps as string[];
      let isCorrect = Array.isArray(p2ans.value) && p2ans.value.length === originalSteps.length;
      if (isCorrect) {
        for (let i = 0; i < originalSteps.length; i++) {
          if (p2ans.value[i] !== originalSteps[i]) { isCorrect = false; break; }
        }
      }
      if (isCorrect) score += 1;
    }
  }

  // Ajuste leído de onboarding_config (ya ordenado descendentemente en cache)
  const { phase2_adjustments } = await getOnboardingConfig();
  let adjustment = phase2_adjustments[phase2_adjustments.length - 1]?.adjustment ?? -1.0;
  for (const row of phase2_adjustments) {
    if (score >= row.min_score) { adjustment = row.adjustment; break; }
  }

  return { score, adjustment };
}

// ============================================================================
// Helpers de fetch
// ============================================================================

async function fetchQuestion(key: string): Promise<Question | null> {
  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('onboarding_questions')
    .select('*')
    .eq('question_key', key)
    .maybeSingle();
  if (error || !data) return null;
  return data as Question;
}

async function fetchAllPhase1Questions(): Promise<Question[]> {
  const supabase = getSupabaseServiceRoleClient();
  const { data } = await supabase
    .from('onboarding_questions')
    .select('*')
    .eq('phase', 1);
  return (data as Question[]) || [];
}
