import { getSupabaseServiceRoleClient } from '../lib/supabase';

export interface CoachAnswer {
  question_index: number;
  selected_option: number; // Index of the selected option (0-3)
}

export interface CoachAssessmentResult {
  level_number: number;
  level_name: string;
  skills: {
    technical: number;
    physical: number;
    mental: number;
    tactical: number;
  };
  strengths: string[];
  improvements: string[];
  recommendation: string;
  stats?: {
    matchCount: number;
    completedObjectives: number;
    totalObjectives: number;
    improvementPercentage: number;
  };
}

// Weights for each question (from the implementation plan)
// Indices 0-5 correspond to the 6 questions in the mobile app COACH_QUESTIONS
const WEIGHTS = [
  { technical: 0.3, physical: 0.2, mental: 0.2, tactical: 0.3 }, // Experience (Time playing)
  { technical: 0.2, physical: 0.5, mental: 0.1, tactical: 0.2 }, // Frequency
  { technical: 0.7, physical: 0.0, mental: 0.1, tactical: 0.2 }, // Technical Level self-eval
  { technical: 0.6, physical: 0.2, mental: 0.1, tactical: 0.1 }, // Serve
  { technical: 0.1, physical: 0.0, mental: 0.3, tactical: 0.6 }, // Strategy
  { technical: 0.1, physical: 0.2, mental: 0.4, tactical: 0.3 }, // Competition
];

const SKILL_NAMES = {
  technical: 'Técnico',
  physical: 'Físico',
  mental: 'Mental',
  tactical: 'Táctico',
};

export function calculateAssessment(answers: CoachAnswer[]): CoachAssessmentResult {
  const scores = {
    technical: 0,
    physical: 0,
    mental: 0,
    tactical: 0,
  };

  const totalWeights = {
    technical: 0,
    physical: 0,
    mental: 0,
    tactical: 0,
  };

  // Calculate weighted scores for each dimension
  answers.forEach((ans) => {
    const weight = WEIGHTS[ans.question_index];
    if (!weight) return;

    const normalizedValue = ans.selected_option / 3; // Max option index is 3 (4 options total)

    (Object.keys(weight) as Array<keyof typeof weight>).forEach((dim) => {
      scores[dim] += normalizedValue * weight[dim];
      totalWeights[dim] += weight[dim];
    });
  });

  // Final skills (0-100)
  const skills = {
    technical: Math.round((scores.technical / totalWeights.technical) * 100) || 25,
    physical: Math.round((scores.physical / totalWeights.physical) * 100) || 25,
    mental: Math.round((scores.mental / totalWeights.mental) * 100) || 25,
    tactical: Math.round((scores.tactical / totalWeights.tactical) * 100) || 25,
  };

  // Overall average
  const avg = (skills.technical + skills.physical + skills.mental + skills.tactical) / 4;

  let level_number = 1;
  let level_name = 'Principiante';

  if (avg > 80) {
    level_number = 5;
    level_name = 'Élite';
  } else if (avg > 60) {
    level_number = 4;
    level_name = 'Profesional';
  } else if (avg > 40) {
    level_number = 3;
    level_name = 'Avanzado';
  } else if (avg > 20) {
    level_number = 2;
    level_name = 'Intermedio';
  }

  // Identify strengths and improvements
  const sortedSkills = (Object.entries(skills) as Array<[keyof typeof skills, number]>)
    .sort((a, b) => b[1] - a[1]);

  const strengths = sortedSkills.slice(0, 2).map(([key]) => {
    const name = SKILL_NAMES[key];
    if (key === 'mental') return 'Control mental y enfoque';
    if (key === 'technical') return 'Consistencia técnica';
    if (key === 'physical') return 'Condición física y resistencia';
    if (key === 'tactical') return 'Lectura táctica del juego';
    return name;
  });

  const improvements = sortedSkills.slice(2, 4).map(([key]) => {
    const name = SKILL_NAMES[key];
    if (key === 'mental') return 'Gestión de la presión';
    if (key === 'technical') return 'Refinamiento de golpes complejos';
    if (key === 'physical') return 'Velocidad y explosividad';
    if (key === 'tactical') return 'Estrategia ante diferentes rivales';
    return name;
  });

  // Recommendation text based on lowest skill
  const lowestSkill = sortedSkills[3][0];
  let recommendation = '';
  switch (lowestSkill) {
    case 'technical':
      recommendation = 'Tu fuerte es el aspecto mental y táctico. Enfócate en perfeccionar tu técnica de golpes específicos como la víbora o el rulo para subir de nivel.';
      break;
    case 'physical':
      recommendation = 'Tienes una gran base técnica y táctica. Trabajar en tu explosividad y resistencia física te permitirá mantener el ritmo en partidos largos.';
      break;
    case 'mental':
      recommendation = 'Técnicamente eres muy sólido. Trabajar en la gestión de puntos clave y mantener la concentración te ayudará a cerrar partidos difíciles.';
      break;
    case 'tactical':
      recommendation = 'Posees buenas condiciones físicas y técnicas. Aprender a leer mejor el posicionamiento de los rivales te permitirá ganar más puntos con menos esfuerzo.';
      break;
    default:
      recommendation = 'Sigue entrenando de forma regular para equilibrar todas tus dimensiones de juego.';
  }

  return {
    level_number,
    level_name,
    skills,
    strengths,
    improvements,
    recommendation,
  };
}

/**
 * Obtiene estadísticas reales del jugador para la sección de Coach
 */
async function getPlayerStats(playerId: string) {
  const supabase = getSupabaseServiceRoleClient();
  
  // 1. Contar partidos reales
  const { count: matchCount } = await supabase
    .from('match_players')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', playerId);

  // 2. Contar objetivos (sesiones de aprendizaje completadas)
  const { count: completedObjectives } = await supabase
    .from('learning_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('player_id', playerId);

  // 3. Proporción de mejora (Placeholder por ahora, 0% en el primer test)
  const improvementPercentage = 0;

  return {
    matchCount: matchCount || 0,
    completedObjectives: completedObjectives || 0,
    totalObjectives: 10, // Meta semanal por defecto
    improvementPercentage,
  };
}

export async function saveAssessment(playerId: string, answers: CoachAnswer[], result: CoachAssessmentResult) {
  const supabase = getSupabaseServiceRoleClient();
  
  const { data, error } = await supabase
    .from('coach_assessments')
    .upsert({
      player_id: playerId,
      answers,
      level_number: result.level_number,
      level_name: result.level_name,
      skills: result.skills,
      strengths: result.strengths,
      improvements: result.improvements,
      recommendation: result.recommendation,
    })
    .select()
    .single();

  if (error) throw error;
  
  const stats = await getPlayerStats(playerId);
  return { ...data, stats };
}

export async function getPlayerAssessment(playerId: string) {
  const supabase = getSupabaseServiceRoleClient();
  
  const { data, error } = await supabase
    .from('coach_assessments')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const stats = await getPlayerStats(playerId);
  return { ...data, stats };
}
