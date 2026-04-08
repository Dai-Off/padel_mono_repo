import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const UPDATES: Record<string, { text: string; options: string[] | { correct_indices?: number[], steps?: string[], options: string[] } }> = {
  "p1": {
    text: "¿Juegas al pádel?",
    options: [
      "Nunca he jugado al pádel",
      "He jugado alguna vez, pero muy poco (menos de 10 veces)",
      "Juego de forma ocasional (no todas las semanas)",
      "Juego de forma regular (todas o casi todas las semanas)",
      "Juego regularmente a un nivel avanzado o competitivo"
    ]
  },
  "p2": {
    text: "¿Cuál de estas describe mejor tu juego actual?",
    options: [
      "A) Mi objetivo es mantener la bola en juego. Me cuesta defenderme cuando la bola viene de la pared.",
      "B) Controlo la dirección en golpes lentos y me defiendo con la pared de fondo. Entiendo cuándo debo subir a la red.",
      "C) Consigo hacer puntos largos con múltiples transiciones ataque-defensa. Tengo regularidad en el juego aéreo y controlo direcciones y ritmos.",
      "D) Soy capaz de hacer los golpes más difíciles técnicamente (víbora, x3, rulo…) y defender bolas de alta dificultad. Adapto mi estrategia en función del partido."
    ]
  },
  "p3": {
    text: "¿Cuánto tiempo llevas jugando al pádel?",
    options: [
      "Menos de 6 meses",
      "Entre 6 meses y 2 años",
      "Entre 2 y 5 años",
      "Más de 5 años"
    ]
  },
  "p4": {
    text: "¿Con qué frecuencia juegas actualmente?",
    options: [
      "Menos de 1 vez por semana",
      "1–2 veces por semana",
      "3–4 veces por semana",
      "5 o más veces por semana"
    ]
  },
  "p5": {
    text: "¿Has recibido clases o entrenamiento de pádel?",
    options: [
      "No",
      "Alguna clase suelta",
      "Entrenamiento regular en algún momento",
      "Entreno con entrenador actualmente"
    ]
  },
  "p6": {
    text: "¿Cómo y dónde juegas o compites?",
    options: [] // p6 options depend on p1, dynamically handled if needed, let's just supply all unique ones from db order.
    // In db, how are they stored? We'll fetch them from db and update them. Let's look at what we have in p6.
    // We'll map them by partial matching strings if needed. Or just leave p6 text, the options seem fine.
  },
  "p7": {
    text: "¿Has practicado tenis, squash, bádminton u otro deporte de raqueta?",
    options: ["No", "Sí"]
  },
  "p8": {
    text: "¿Cuál o cuáles?",
    options: ["Tenis", "Squash", "Bádminton", "Ping pong", "Otro"]
  },
  "p9": {
    text: "¿A qué nivel lo practicabas?",
    options: [
      "Casual, sin regularidad",
      "Regular, sin entrenamiento",
      "Con entrenamiento o clases",
      "Competición (torneos, ligas)"
    ]
  },
  // Phase 2 Beginner
  "phase2_beginner_1": {
    text: "¿Cuál de estas 3 es la empuñadura que se recomienda para jugar al pádel?",
    options: { options: ["Este de revés", "Este de derecha", "Continental"] }
  },
  "phase2_beginner_2": {
    text: "Un golpe de pádel está formado por:",
    options: { options: ["Armado e impacto", "Impacto y terminación", "Armado, impacto y terminación", "Giro, impacto y terminación"] }
  },
  "phase2_beginner_3": {
    text: "En posición de defensa ante una bola fácil, ¿cuál sería mi primera opción?",
    options: { options: ["Fuerte", "Chiquita", "Globo", "No lo sé"] }
  },
  "phase2_beginner_4": {
    text: "Estás sacando. ¿Cuál de estas posiciones es la correcta? (Posición 1: cerca de la pared lateral · Posición 2: cerca de la T · Posición 3: en el centro de tu cuadro)",
    options: { options: ["Cerca de mi pared lateral", "Cerca de la T", "En el centro de mi cuadro", "Depende del rival", "Posición 1", "Posición 2", "Posición 3"] }
  },
  "phase2_beginner_5": {
    text: "Después de que la pelota bote en tu campo, ¿puedes golpearla directamente contra tu propia pared para devolverla al campo contrario?",
    options: { options: ["Sí, es válido", "No, no es válido", "Solo si no ha botado antes", "Depende con qué parte de la raqueta la impacte / Solo contra la pared de fondo"] }
  },
  // Phase 2 Intermediate
  "phase2_intermediate_1": {
    text: "Un armado con el brazo elevado y la pala por encima de la cabeza corresponde a:",
    options: { options: ["Volea", "Bandeja", "Remate", "Salida de pared"] }
  },
  "phase2_intermediate_2": {
    text: "¿Cuál es el golpe más importante del pádel?",
    options: { options: ["Volea", "Derecha", "Remate", "Salida de pared", "Globo", "Chiquita"] }
  },
  "phase2_intermediate_3": {
    text: "A tu compañero le quitan la red con un globo pero solo sube uno de los rivales a la posición de volea. ¿Cuál sería la mejor decisión?",
    options: { options: ["Tirar una bola por abajo sencilla al que está en el fondo y subir a la red", "Tirar globo por encima del que está en la red y subir", "Hacer una bajada de pared potente al que está en la red", "Jugar al ángulo del que está en la red"] }
  },
  "phase2_intermediate_4": {
    text: "Si estás defendiendo durante un punto y los rivales te presionan, ¿qué deberías hacer?",
    options: { options: ["Jugar más rápido para que se acabe el punto", "Tirar un globo para salir del fondo", "Seguir jugando por abajo", "Intentar meterme hacia delante"] }
  },
  "phase2_intermediate_5": {
    text: "Si hemos llegado al tie break en el primer set, ¿qué pareja empieza sacando en el segundo set?",
    options: { options: ["La misma que empezó el tie break", "La que no empezó sacando el tie break", "Hay que jugar punto de saque para decidirlo", "La que ganó el tie break"] }
  },
  // Phase 2 Advanced
  "phase2_advanced_1": {
    text: "Para el saque utilizo:",
    options: { options: ["Efecto cortado", "Plano", "Efecto liftado", "No lo sé"] }
  },
  "phase2_advanced_2": {
    text: "Ordena estos golpes de más agresivos a menos agresivos:",
    options: { options: ["Remate → Víbora → Gancho → Bandeja", "Víbora → Remate → Gancho → Bandeja", "Remate → Gancho → Víbora → Bandeja", "Gancho → Víbora → Remate → Bandeja"] }
  },
  "phase2_advanced_3": {
    text: "¿Cómo consigo salir de la presión de manera más sencilla defendiendo?",
    options: { options: ["Jugando en paralelo", "Tirando globo", "Jugando al centro", "Jugando en cruzado"] }
  },
  "phase2_advanced_4": {
    text: "¿Cuál es la mejor forma de predecir el siguiente golpe de un jugador mientras te ataca?",
    options: { options: ["Jugándole al cuerpo", "Jugándole a la esquina", "Jugándole al medio", "Jugándole rápido"] }
  },
  "phase2_advanced_5": {
    text: "Si el jugador rival golpea en su campo y mete la pala en el nuestro, ¿es correcto?",
    options: { options: ["Sí", "Sí, solo si no pasa la pala por completo", "No, es invasión", "Depende de con qué parte de la pala impacte la bola"] }
  },
  // Phase 2 Competition
  "phase2_competition_1": {
    text: "Para hacer un remate x3 desde más atrás de media pista, ¿cuál de estas empuñaduras usarías? (Pista: Piensa en el tipo de efecto que necesitas generar para que la bola salga por tres tras el rebote.)",
    options: { options: ["Este de derecha", "Este de revés", "Continental", "Continental o Este de revés"] }
  },
  "phase2_competition_2": {
    text: "Selecciona las opciones correctas para la dejada:",
    options: { options: ["Se juega con efecto cortado", "Para mayor efectividad irá en dirección a una de las rejas laterales", "Es un golpe defensivo", "Depende de la altura del envío de tu rival", "Se juega cuando los rivales están en mitad de pista o atacando", "Es un golpe ofensivo"] }
  },
  "phase2_competition_3": {
    text: "Te quitan la red con un globo y vas a hacer bajada de pared, pero tu compañero te dice que los rivales están pegados a la red. ¿Qué deberías hacer?",
    options: { options: ["Jugar una chiquita", "Jugar al paralelo", "Jugar rápido al centro o al cuerpo", "Jugar a los ángulos", "Jugar otro globo"] }
  },
  "phase2_competition_4": {
    text: "Estás en la red y tus rivales defienden bien desde el fondo. ¿Cuál es la mejor estrategia?",
    options: { options: ["Intentar ganar el punto rápido", "Aumentar la velocidad del juego", "Jugar siempre al jugador más flojo", "Subir más a la red", "Mantener presión variando direcciones y profundidad"] }
  },
  "phase2_competition_5": {
    text: "Un rival intenta obstaculizar un golpeo tuyo durante el punto:",
    options: { options: ["Es válido y el punto sigue", "No es válido y ganas el punto", "Depende del criterio de un árbitro", "Solo importa si golpeas al rival o a su pala"] }
  },
  // Phase 2 Professional
  "phase2_professional_1": {
    text: "¿Cuál de estas opciones es más correcta para definir una estrategia de partido?",
    options: { options: ["Calentamiento, análisis de puntos débiles del rival, estado de forma y condiciones climáticas", "Análisis de puntos débiles del rival, nuestras fortalezas y estado de forma", "Calentamiento, análisis de puntos débiles del rival y estado de forma", "Análisis de puntos débiles del rival, nuestras fortalezas, condiciones climáticas y condiciones de la pista"] }
  },
  "phase2_professional_2": {
    text: "Para hacer correctamente la técnica de una bajada de pared agresiva, ordena los pasos:",
    options: { options: ["Terminación", "Preparación alta con el codo flexionado", "Impacto", "Cambio de empuñadura", "Apuntar la pelota", "Rotación de hombros", "Desplazamiento rápido hacia atrás"] }
  },
  "phase2_professional_3": {
    text: "¿Cómo conseguirías que tu rival en cruzado no te bloquee de forma cómoda tu golpe de juego aéreo?",
    options: { options: ["Tocando la bola a la altura de los ojos", "Tocando la bola con efecto", "Tocando la bola a la altura de los hombros", "Tocando la bola por encima de la cabeza"] }
  },
  "phase2_professional_4": {
    text: "Ordena tus preferencias si estás defendiendo y recibes una bola cómoda:",
    options: { options: ["Chiquita", "Globo", "Juego hacia el ángulo cruzado", "Rápida"] }
  },
  "phase2_professional_5": {
    text: "¿Hasta qué altura está permitido el saque?",
    options: { options: ["Cadera", "Cintura", "Rodilla", "A mitad del pantalón"] }
  }
};

async function main() {
  const { data: questions, error } = await supabase.from('onboarding_questions').select('*');
  
  if (error) {
    console.error("Error fetching questions:", error);
    return;
  }
  
  for (const q of questions) {
    const update = UPDATES[q.question_key];
    if (update) {
      let currentOptions: any = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
      
      // Update texts
      if (Array.isArray(currentOptions) && Array.isArray(update.options)) { // Phase 1
        for (let i = 0; i < Math.min(currentOptions.length, update.options.length); i++) {
          currentOptions[i].text = update.options[i];
        }
      } else if (!Array.isArray(currentOptions) && currentOptions.options && Array.isArray((update.options as any).options)) { // Phase 2
        // Sometimes phase 2 options are just strings
        const upOpts = (update.options as any).options;
        if (typeof currentOptions.options[0] === 'string') {
          currentOptions.options = upOpts;
        } else { // Or objects with .text
           for (let i = 0; i < Math.min(currentOptions.options.length, upOpts.length); i++) {
             if (typeof currentOptions.options[i] === 'object') {
               currentOptions.options[i].text = upOpts[i];
             } else {
               currentOptions.options[i] = upOpts[i];
             }
           }
        }
        
        // Also update steps if order type
        if (q.type === 'order' && currentOptions.steps) {
           currentOptions.steps = upOpts;
        }
      }
      
      const res = await supabase.from('onboarding_questions').update({
        text: update.text,
        options: currentOptions
      }).eq('id', q.id);
      
      console.log(`Updated ${q.question_key}: ${res.error ? 'ERROR ' + res.error.message : 'OK'}`);
    } else {
      console.log(`Skipped ${q.question_key} - not in map`);
    }
    
    // For p6, do manually inside loop if needed
    if (q.question_key === 'p6') {
      const q6Arr = Array.isArray(q.options) ? q.options : JSON.parse(q.options);
      const replacements: Record<string, string> = {
        "amigos": "Con amigos o conocidos",
        "amistosos": "Torneos sociales o amistosos",
        "club_ranking": "Torneos competitivos de club o ranking",
        "ligas_amateur": "Ligas amateur organizadas",
        "ligas_federadas": "Liga/torneos federados",
        "circuitos": "Circuitos nacionales o internacionales"
      };
      
      let changed = false;
      for (const opt of q6Arr) {
        if (!opt.text) continue;
        for (const key in replacements) {
           if (opt.value && opt.value.includes(key)) {
               opt.text = replacements[key];
               changed = true;
           }
        }
      }
      if (changed) {
         await supabase.from('onboarding_questions').update({ options: q6Arr }).eq('id', q.id);
         console.log(`Updated p6 options based on values`);
      }
    }
  }
}

main().catch(console.error);
