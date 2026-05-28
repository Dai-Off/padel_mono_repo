import { generateWeeklyPlan } from './coachPlanContent';
import { CoachAssessment } from '../api/coachAssessment';

// Mock de una evaluación donde el aspecto físico es el más bajo
const mockPhysicalWeakAssessment: CoachAssessment = {
  id: 'test-1',
  level_number: 2,
  level_name: 'Intermedio',
  skills: {
    technical: 60,
    physical: 20, // Más bajo
    mental: 50,
    tactical: 70
  },
  strengths: ['Lectura táctica del juego'],
  improvements: ['Velocidad y explosividad'],
  recommendation: 'Trabajar en físico.',
  created_at: new Date().toISOString()
};

// Mock de una evaluación donde el aspecto táctico es el más bajo, nivel Profesional
const mockTacticalWeakAssessment: CoachAssessment = {
  id: 'test-2',
  level_number: 4,
  level_name: 'Profesional',
  skills: {
    technical: 85,
    physical: 80,
    mental: 75,
    tactical: 40 // Más bajo
  },
  strengths: ['Consistencia técnica'],
  improvements: ['Estrategia ante diferentes rivales'],
  recommendation: 'Mejorar táctica de posicionamiento.',
  created_at: new Date().toISOString()
};

function runTests() {
  console.log('=== INICIANDO PRUEBAS DE GENERACIÓN DE PLANES ===\n');

  // Test 1: Prioridad Física
  console.log('Caso 1: Jugador con debilidad Física (Nivel Intermedio)');
  const planFisico = generateWeeklyPlan(mockPhysicalWeakAssessment);
  
  console.log(`- Objetivo Semanal: ${planFisico.weeklyObjective.title}`);
  console.log(`  Categoría esperada: physical | Obtenida: ${planFisico.weeklyObjective.category}`);
  console.log(`- Total Drills Recomendados: ${planFisico.drills.length} (Esperado: 3)`);
  console.log(`- Drills asignados:`, planFisico.drills.map(d => `${d.name} (${d.category})`));
  console.log(`- Consejo del Coach: "${planFisico.coachTip}"`);
  console.log(planFisico.weeklyObjective.category === 'physical' ? '✅ TEST 1 PASADO\n' : '❌ TEST 1 FALLADO\n');

  // Test 2: Prioridad Táctica
  console.log('Caso 2: Jugador con debilidad Táctica (Nivel Profesional)');
  const planTactico = generateWeeklyPlan(mockTacticalWeakAssessment);
  
  console.log(`- Objetivo Semanal: ${planTactico.weeklyObjective.title}`);
  console.log(`  Categoría esperada: tactical | Obtenida: ${planTactico.weeklyObjective.category}`);
  console.log(`- Drills asignados:`, planTactico.drills.map(d => `${d.name} (${d.category})`));
  console.log(`- Metas Semanales:`, planTactico.weeklyGoals);
  console.log(`- Consejo del Coach (Profesional): "${planTactico.coachTip}"`);
  console.log(planTactico.weeklyObjective.category === 'tactical' ? '✅ TEST 2 PASADO\n' : '❌ TEST 2 FALLADO\n');

  console.log('=== PRUEBAS FINALIZADAS ===');
}

runTests();
