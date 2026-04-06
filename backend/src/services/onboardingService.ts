import { getSupabaseServiceRoleClient } from '../lib/supabase';

export type OnboardingAnswer = { question_id: string; value: string };

export type Question = {
  id: string;
  text: string;
  options: { value: string; label: string }[];
};

/**
 * Obtiene la siguiente pregunta basada en las respuestas dadas hasta ahora.
 * Sigue la lógica de branching definida en la base de datos (next_question_id).
 */
export async function getNextQuestion(answers: OnboardingAnswer[]): Promise<Question | null> {
  const supabase = getSupabaseServiceRoleClient();

  // Si no hay respuestas, devolvemos la primera pregunta (orden más bajo)
  if (!answers || answers.length === 0) {
    const { data: firstQ, error: errQ } = await supabase
      .from('onboarding_questions')
      .select('id')
      .eq('is_active', true)
      .order('order', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (errQ || !firstQ) return null;
    return fetchQuestionWithOptions(firstQ.id);
  }

  // Para ser robustos, seguimos la cadena desde la primera respuesta
  // para encontrar cuál es la siguiente pregunta real tras la secuencia de respuestas.
  const lastAnswer = answers[answers.length - 1];

  const { data: option, error: errOpt } = await supabase
    .from('onboarding_options')
    .select('next_question_id')
    .eq('question_id', lastAnswer.question_id)
    .eq('value', lastAnswer.value)
    .maybeSingle();

  if (errOpt || !option || !option.next_question_id) {
    return null; // Fin del cuestionario o no hay más ramas
  }

  return fetchQuestionWithOptions(option.next_question_id);
}

/**
 * Calcula el Mu inicial basado en las respuestas y los ajustes definidos en la DB.
 * Base Mu = 25.
 */
export async function calcInitialMu(answers: OnboardingAnswer[]): Promise<number> {
  const supabase = getSupabaseServiceRoleClient();
  let mu = 25;

  if (!answers || answers.length === 0) return mu;

  // Calculamos la suma de todos los ajustes de las opciones seleccionadas
  const questionIds = answers.map(a => a.question_id);
  const values = answers.map(a => a.value);

  // Consulta por lotes para ser más eficiente
  const { data: options, error } = await supabase
    .from('onboarding_options')
    .select('mu_adjustment, question_id, value')
    .in('question_id', questionIds)
    .in('value', values);

  if (error || !options) return mu;

  // Solo sumamos los que coinciden exactamente con el par (id, valor)
  for (const ans of answers) {
    const match = options.find(o => o.question_id === ans.question_id && o.value === ans.value);
    if (match) {
      mu += Number(match.mu_adjustment);
    }
  }

  return Math.max(15, Math.min(45, mu));
}

/**
 * Helper para obtener una pregunta con todas sus opciones formateadas.
 */
async function fetchQuestionWithOptions(questionId: string): Promise<Question | null> {
  const supabase = getSupabaseServiceRoleClient();

  const { data: question, error: errQ } = await supabase
    .from('onboarding_questions')
    .select('id, text')
    .eq('id', questionId)
    .maybeSingle();

  if (errQ || !question) return null;

  const { data: options, error: errO } = await supabase
    .from('onboarding_options')
    .select('value, text')
    .eq('question_id', questionId)
    .order('order', { ascending: true });

  if (errO || !options) return null;

  return {
    id: (question as { id: string }).id,
    text: (question as { text: string }).text,
    options: options.map(o => ({
      value: o.value,
      label: o.text
    }))
  };
}
