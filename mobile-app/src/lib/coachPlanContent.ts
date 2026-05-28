import { CoachAssessment } from '../api/coachAssessment';

export type SkillCategory = 'technical' | 'physical' | 'mental' | 'tactical';

export interface ProgressItem {
  key: string;
  label: string;
  actual: number;
  target: number;
  icon: string;
}

export interface RecommendedDrill {
  name: string;
  difficulty: 'Bajo' | 'Medio' | 'Alto';
  duration: string;
  sets: string;
  category: SkillCategory;
}

export interface FigmaWeeklyPlan {
  weeklyProgress: ProgressItem[];
  monthlyProgress: ProgressItem[];
  drills: RecommendedDrill[];
}

// Catálogo enriquecido con distintos niveles de dificultad por categoría
const DRILLS_POOL: Record<SkillCategory, RecommendedDrill[]> = {
  technical: [
    // BAJO
    { name: 'Empuñadura y Control Continental', difficulty: 'Bajo', duration: '10 min', sets: '2 series x 20 golpes', category: 'technical' },
    { name: 'Impacto de Derecha Básico', difficulty: 'Bajo', duration: '12 min', sets: '3 series x 15', category: 'technical' },
    // MEDIO
    { name: 'Globos Cruzados', difficulty: 'Medio', duration: '15 min', sets: '3 series x 20', category: 'technical' },
    { name: 'Drill de Voleas', difficulty: 'Medio', duration: '20 min', sets: '4 series x 15', category: 'technical' },
    // ALTO
    { name: 'Víbora al Rincón', difficulty: 'Alto', duration: '25 min', sets: '5 series x 10', category: 'technical' },
    { name: 'Bandeja con Suspensión', difficulty: 'Alto', duration: '20 min', sets: '4 series x 12', category: 'technical' },
  ],
  physical: [
    // BAJO
    { name: 'Salto y Potencia de Piernas', difficulty: 'Bajo', duration: '10 min', sets: '3 series x 15', category: 'physical' },
    { name: 'Estiramientos Dinámicos', difficulty: 'Bajo', duration: '10 min', sets: 'Rutina completa', category: 'physical' },
    // MEDIO
    { name: 'Sprints y Desplazamientos', difficulty: 'Medio', duration: '15 min', sets: '4 series x 6', category: 'physical' },
    { name: 'Lateralidad y Coordinación', difficulty: 'Medio', duration: '12 min', sets: '3 series x 3 mins', category: 'physical' },
    // ALTO
    { name: 'Circuito de Resistencia', difficulty: 'Alto', duration: '25 min', sets: '5 ejercicios', category: 'physical' },
    { name: 'Intervalos HIIT Pádel', difficulty: 'Alto', duration: '20 min', sets: '6 series x 30s max', category: 'physical' },
  ],
  mental: [
    // BAJO
    { name: 'Anclaje tras Error', difficulty: 'Bajo', duration: '10 min', sets: 'Ejercicios cognitivos', category: 'mental' },
    { name: 'Respiración de Caja', difficulty: 'Bajo', duration: '8 min', sets: '3 series x 2 mins', category: 'mental' },
    // MEDIO
    { name: 'Resistencia Psicológica', difficulty: 'Medio', duration: '20 min', sets: 'Set simulado', category: 'mental' },
    { name: 'Rutina del Próximo Punto', difficulty: 'Medio', duration: '10 min', sets: 'Enfoque continuo', category: 'mental' },
    // ALTO
    { name: 'Foco en Puntos de Oro', difficulty: 'Alto', duration: '15 min', sets: '3 series de respiración', category: 'mental' },
    { name: 'Simulación de Presión Extrema', difficulty: 'Alto', duration: '25 min', sets: 'Tie-breaks de ventaja', category: 'mental' },
  ],
  tactical: [
    // BAJO
    { name: 'Posicionamiento Defensivo', difficulty: 'Bajo', duration: '12 min', sets: '2 series x 5 mins', category: 'tactical' },
    { name: 'Dirección al Centro de la Pista', difficulty: 'Bajo', duration: '15 min', sets: '3 series x 15', category: 'tactical' },
    // MEDIO
    { name: 'Transición Ataque-Defensa', difficulty: 'Medio', duration: '20 min', sets: '4 series x 5 mins', category: 'tactical' },
    { name: 'Cobertura del Centro', difficulty: 'Medio', duration: '15 min', sets: '3 series x 15', category: 'tactical' },
    // ALTO
    { name: 'Dirección a la Reja', difficulty: 'Alto', duration: '25 min', sets: '5 series x 12', category: 'tactical' },
    { name: 'Táctica de Nevera Defensiva', difficulty: 'Alto', duration: '20 min', sets: 'Partido simulado', category: 'tactical' },
  ],
};

export function generateFigmaWeeklyPlan(assessment: CoachAssessment): FigmaWeeklyPlan {
  const { skills, level_name } = assessment;

  // 1. Encontrar la categoría con score más bajo
  const categories: SkillCategory[] = ['technical', 'physical', 'mental', 'tactical'];
  let lowestCategory: SkillCategory = 'technical';
  let lowestValue = 101;
  categories.forEach((cat) => {
    if (skills[cat] < lowestValue) {
      lowestValue = skills[cat];
      lowestCategory = cat;
    }
  });

  // 2. Traer estadísticas reales del jugador
  const matchesPlayed = assessment.stats?.matchCount ?? 0;
  const completedObjectives = assessment.stats?.completedObjectives ?? 0;

  // Metas semanales según estadísticas reales y metas dinámicas
  const weeklyProgress: ProgressItem[] = [
    {
      key: 'matches',
      label: 'Partidos jugados',
      actual: Math.min(matchesPlayed, 2), // Límite ilustrativo semanal
      target: 2,
      icon: 'target',
    },
    {
      key: 'classes',
      label: 'Clases asistidas',
      actual: completedObjectives >= 1 ? 1 : 0, // Si tiene al menos una lección completada, cuenta como 1 clase esta semana
      target: 1,
      icon: 'zap',
    },
    {
      key: 'lessons',
      label: 'Lección diaria',
      actual: Math.min(completedObjectives, 5), // Basado en los objetivos completados
      target: 5,
      icon: 'book-open',
    },
    {
      key: 'tournaments',
      label: 'Torneos inscritos',
      actual: matchesPlayed > 5 ? 1 : 0, // Lógica simple para simular inscripciones
      target: 1,
      icon: 'trophy',
    },
  ];

  // Metas mensuales basadas en estadísticas
  const monthlyProgress: ProgressItem[] = [
    {
      key: 'm_matches',
      label: 'Partidos completados',
      actual: matchesPlayed, // Total histórico real
      target: Math.max(8, matchesPlayed + 3), // Meta escalable
      icon: 'target',
    },
    {
      key: 'm_classes',
      label: 'Clases asistidas',
      actual: Math.floor(completedObjectives / 2),
      target: 4,
      icon: 'zap',
    },
    {
      key: 'm_tournaments',
      label: 'Torneos disputados',
      actual: Math.floor(matchesPlayed / 6),
      target: 1,
      icon: 'trophy',
    },
    {
      key: 'm_courses',
      label: 'Cursos finalizados',
      actual: completedObjectives > 5 ? 2 : 1,
      target: 2,
      icon: 'book-open',
    },
  ];

  // 3. Filtrar Ejercicios Inteligentes según el Nivel del Jugador
  const pool = DRILLS_POOL[lowestCategory] || DRILLS_POOL['technical'];
  
  // Decidir qué dificultades permitir
  const isHighLevel = ['Avanzado', 'Profesional', 'Élite'].includes(level_name);
  
  let filteredDrills = pool.filter((drill) => {
    if (isHighLevel) {
      // Habilitar Medio y Alto para avanzados
      return drill.difficulty === 'Medio' || drill.difficulty === 'Alto';
    } else {
      // Habilitar solo Bajo y Medio para principiantes/intermedios
      return drill.difficulty === 'Bajo' || drill.difficulty === 'Medio';
    }
  });

  // Si por alguna razón la lista queda vacía, tomamos todo el pool como fallback
  if (filteredDrills.length === 0) {
    filteredDrills = pool;
  }

  // Si no tenemos suficientes drills del área más débil, completamos con físicos o técnicos del nivel adecuado
  const drillsResult: RecommendedDrill[] = [...filteredDrills];
  if (drillsResult.length < 3) {
    const backupCategory: SkillCategory = (lowestCategory as string) === 'physical' ? 'technical' : 'physical';
    const backupPool = DRILLS_POOL[backupCategory];
    const filteredBackup = backupPool.filter((drill) => {
      if (isHighLevel) return drill.difficulty === 'Medio' || drill.difficulty === 'Alto';
      return drill.difficulty === 'Bajo' || drill.difficulty === 'Medio';
    });
    filteredBackup.forEach((drill) => {
      if (drillsResult.length < 3) {
        drillsResult.push(drill);
      }
    });
  }

  return {
    weeklyProgress,
    monthlyProgress,
    drills: drillsResult.slice(0, 3), // Exactamente 3 drills como en Figma
  };
}

// Mantenemos compatibilidad con la firma anterior
export function generateWeeklyPlan(assessment: CoachAssessment) {
  const figma = generateFigmaWeeklyPlan(assessment);
  return {
    weeklyObjective: {
      title: 'Consistencia de juego',
      description: 'Enfócate en perfeccionar tus desplazamientos y golpes clave.',
      category: 'technical' as SkillCategory,
    },
    drills: figma.drills.map(d => ({
      name: d.name,
      description: `Entrenamiento recomendado enfocado en el área ${d.category}.`,
      duration: d.duration,
      category: d.category,
      icon: d.category === 'physical' ? 'fitness-outline' : 'tennisball-outline',
    })),
    weeklyGoals: figma.weeklyProgress.map(w => `${w.label}: ${w.actual}/${w.target}`),
    coachTip: 'Entrena con consistencia para ver avances en tu rendimiento.',
  };
}
