import { getSupabaseServiceRoleClient } from '../lib/supabase';

// Tipos básicos
export type OnboardingAnswer = { question_key: string; value: any };

export type Question = {
  id: string;
  question_key: string;
  phase: number;
  pool?: string | null;
  text: string;
  type: 'single' | 'multi' | 'order';
  options: any[];
  display_order: number;
};

/**
 * Deriva el valor interno "mu" usado por OpenSkill a partir de un elo_rating en escala 0-7.
 * sigma se asume 8.333 (valor por defecto para nuevos jugadores).
 * mu = (elo_rating / 7 * 50) + 2 * sigma
 */
export function eloToMu(eloRating: number): number {
  const sigma = 8.333;
  return (eloRating / 7 * 50) + 2 * sigma;
}

/**
 * Calcula el Elo Final sumando y aplicando floor y ceiling
 */
export function calcFinalElo(eloPhase1: number, phase2Adjustment: number): number {
  return Math.max(0.5, Math.min(6.25, eloPhase1 + phase2Adjustment));
}

/**
 * Obtiene el pool de Fase 2 según el ELO de la Fase 1
 */
export function getPhase2Pool(eloPhase1: number): string {
  if (eloPhase1 < 2.0) return 'beginner';
  if (eloPhase1 < 3.5) return 'intermediate';
  if (eloPhase1 < 4.5) return 'advanced';
  if (eloPhase1 < 5.5) return 'competition';
  return 'professional';
}

/**
 * Obtiene la siguiente pregunta (o las 5 finales de Fase 2) basado en respuestas hasta ahora.
 * Retorna { type: 'question', question: Question } | { type: 'phase2', questions: Question[] } | { type: 'complete' }
 */
export async function getNextQuestionState(answers: OnboardingAnswer[]): Promise<any> {
  const supabase = getSupabaseServiceRoleClient();

  // Helper para buscar respuesta
  const getAns = (key: string) => answers.find((a) => a.question_key === key)?.value;
  const p1Val = getAns('p1');
  const p7Val = getAns('p7');

  // Si no hay P1, la primera es P1
  if (p1Val === undefined) return { type: 'question', question: await fetchQuestion('p1') };

  if (p1Val < 2) {
    // Si P1 < 2, salta directo a P7
    if (p7Val === undefined) return { type: 'question', question: await fetchQuestion('p7') };
    // Si respondió P7 = sí, va a P8 y P9
    if (p7Val === 'yes') {
      if (getAns('p8') === undefined) return { type: 'question', question: await fetchQuestion('p8') };
      if (getAns('p9') === undefined) return { type: 'question', question: await fetchQuestion('p9') };
    }
    // Fin cuestionario (no hay Fase 2 para P1 < 2)
    return { type: 'complete' };
  } else {
    // P1 >= 2. Activa P2, P3, P5
    if (getAns('p2') === undefined) return { type: 'question', question: await fetchQuestion('p2') };
    if (getAns('p3') === undefined) return { type: 'question', question: await fetchQuestion('p3') };
    
    // P4 y P6 solo si P1 >= 3
    if (p1Val >= 3 && getAns('p4') === undefined) return { type: 'question', question: await fetchQuestion('p4') };
    
    if (getAns('p5') === undefined) return { type: 'question', question: await fetchQuestion('p5') };
    
    if (p1Val >= 3 && getAns('p6') === undefined) return { type: 'question', question: await fetchQuestion('p6') };

    // P7 siempre
    if (p7Val === undefined) return { type: 'question', question: await fetchQuestion('p7') };
    if (p7Val === 'yes') {
      if (getAns('p8') === undefined) return { type: 'question', question: await fetchQuestion('p8') };
      if (getAns('p9') === undefined) return { type: 'question', question: await fetchQuestion('p9') };
    }

    // Fin Fase 1. Retornamos las 5 de Fase 2.
    // Para no devolverlas cada vez, verificamos si ya están en las answers marcadas.
    // Asumiremos que si la API nos contacta y ya respondió P7/P9, necesita las questions de Fase 2.
    
    const questionsPhase1 = await fetchAllPhase1Questions();
    const eloPhase1 = calcEloPhase1FromData(answers, questionsPhase1);
    const pool = getPhase2Pool(eloPhase1);
    
    // Obtenemos 5 preguntas random del pool de Fase 2
    const { data: qPhase2, error } = await supabase
      .from('onboarding_questions')
      .select('*')
      .eq('phase', 2)
      .eq('pool', pool)
      .eq('is_active', true)
      .order('id') // Para entorno real, aquí se mezclarían, en BBDD o local. Supabase no tiene ORDER BY random de caja fácil, pero si hay 5, traemos todas y mezclamos.
      .limit(5);

    if (error || !qPhase2) return { type: 'complete' }; // Fallback

    // Mezclar (Fisher-Yates) y eliminar respuesta correcta de las opciones
    const mixed = qPhase2.map(q => {
      let optionsCopy = typeof q.options === 'string' ? JSON.parse(q.options) : q.options;
      // Quitamos campos sensibles para el cliente
      if (optionsCopy.correct_index !== undefined) delete optionsCopy.correct_index;
      if (optionsCopy.correct_indices !== undefined) delete optionsCopy.correct_indices;
      
      // Si type is order, desordenamos las steps
      if (q.type === 'order' && optionsCopy.steps) {
        const steps = [...optionsCopy.steps];
        for (let i = steps.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [steps[i], steps[j]] = [steps[j], steps[i]];
        }
        optionsCopy.client_steps = steps; // Enviamos los desordenados
      }
      return { ...q, options: optionsCopy };
    }).sort(() => Math.random() - 0.5);

    return { type: 'phase2', questions: mixed, elo_phase1: eloPhase1, pool_assigned: pool };
  }
}

/**
 * Extrae y calcula el ELO de Fase 1.
 */
export async function calcEloPhase1(answers: OnboardingAnswer[]): Promise<number> {
  const questions = await fetchAllPhase1Questions();
  return calcEloPhase1FromData(answers, questions);
}

function calcEloPhase1FromData(answers: OnboardingAnswer[], questions: Question[]): number {
  const getAns = (key: string) => answers.find((a) => a.question_key === key)?.value;
  const p1Val = getAns('p1');
  if (p1Val === undefined) return 0.5;

  const P9_MATRIX: Record<string, number[]> = {
    "sin P2": [0.5, 0.7, 1.0, 1.8],
    "A": [0.1, 0.2, 0.3, 1.3],
    "B": [0.1, 0.1, 0.2, 0.9],
    "C": [0.0, 0.0, 0.1, 0.4],
    "D": [0.0, 0.0, 0.0, 0.0]
  };

  const p9Val = getAns('p9') !== undefined ? Number(getAns('p9')) : 0;

  if (p1Val < 2) {
    if (getAns('p7') === 'yes' && getAns('p9') !== undefined) {
      return P9_MATRIX["sin P2"][p9Val] || 0.5;
    }
    return 0.5;
  }

  // Caso P1 >= 2
  let elo = 0;
  let ceilP1 = p1Val === 2 ? 2.9 : (p1Val === 3 ? 4.4 : 6.25);
  let ceilP2 = 6.25;

  const p2Ans = getAns('p2');
  if (p2Ans) {
    const p2q = questions.find(q => q.question_key === 'p2');
    const opt = p2q?.options.find(o => o.value === p2Ans);
    if (opt) {
      elo += opt.base_elo || 0;
      ceilP2 = opt.ceiling || 6.25;
    }
  }

  const addCorrector = (qKey: string) => {
    const ans = getAns(qKey);
    if (ans !== undefined) {
      const q = questions.find(q => q.question_key === qKey);
      const opt = q?.options.find(o => o.text === ans || o.value === ans || q.options.indexOf(o) === ans);
      if (opt && opt.corrector) elo += Number(opt.corrector);
    }
  };

  addCorrector('p3');
  addCorrector('p4');
  addCorrector('p5');

  // P6 Multiselect
  const p6Ans = getAns('p6'); // array of texts/indices
  if (p6Ans && Array.isArray(p6Ans) && p6Ans.length > 0) {
    const p6q = questions.find(q => q.question_key === 'p6');
    const factor = p1Val === 3 ? 0.3 : 0.2;
    const prop = p1Val === 3 ? 'elo_reg' : 'elo_adv';
    
    let elos: number[] = [];
    for (const text of p6Ans) {
      const opt = p6q?.options.find((o: any) => o.text === text || o.value === text);
      if (opt && opt[prop]) {
        elos.push(Number(opt[prop]));
      }
    }
    elos.sort((a, b) => b - a); // Mayor a menor
    if (elos.length > 0) {
      elo += elos[0];
      for (let i = 1; i < elos.length; i++) {
        elo += elos[i] * factor;
      }
    }
  }

  // Corrector P9
  if (getAns('p7') === 'yes' && getAns('p9') !== undefined) {
    if (P9_MATRIX[p2Ans]) {
      elo += P9_MATRIX[p2Ans][p9Val] || 0;
    }
  }

  // Techos
  elo = Math.min(elo, ceilP2);
  elo = Math.min(elo, ceilP1);

  return elo;
}

/**
 * Calcula la puntuación de la Fase 2 (0 a 5) y el ajuste de ELO final.
 */
export async function calcPhase2Result(phase2Answers: OnboardingAnswer[]): Promise<{ score: number, adjustment: number }> {
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
      let correctIndices = opts.correct_indices as number[];
      // convert names to indices if needed
      let selIndices = selected.map(s => typeof s === 'number' ? s : opts.options.indexOf(s));
      
      const allCorrect = correctIndices.every(c => selIndices.includes(c)) && selIndices.every(s => correctIndices.includes(s));
      const someCorrect = selIndices.some(s => correctIndices.includes(s));
      const noneWrong = selIndices.every(s => correctIndices.includes(s));

      if (allCorrect) score += 1;
      else if (someCorrect && noneWrong) score += 0.5;
      else score += 0;
    } else if (q.type === 'order') {
      // expected order is the original array
      const originalSteps = opts.steps as string[];
      let isCorrect = true;
      if (Array.isArray(p2ans.value) && p2ans.value.length === originalSteps.length) {
        for (let i = 0; i < originalSteps.length; i++) {
          if (p2ans.value[i] !== originalSteps[i]) {
            isCorrect = false;
            break;
          }
        }
      } else {
        isCorrect = false;
      }
      if (isCorrect) score += 1;
    }
  }

  let adjustment = 0;
  if (score >= 5) adjustment = 0.7;
  else if (score >= 4) adjustment = 0.4;
  else if (score >= 3) adjustment = 0.2;
  else if (score > 2) adjustment = 0;
  else if (score === 2) adjustment = -0.3;
  else if (score >= 1) adjustment = -0.7;
  else adjustment = -1.0;

  return { score, adjustment };
}


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
