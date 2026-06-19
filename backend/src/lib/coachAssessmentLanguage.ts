import { parsePeerFeedbackLocale } from './peerFeedbackLanguage';

export { parsePeerFeedbackLocale as parseCoachAssessmentLocale };

type LocaleStrings = {
  levelNames: Record<string, string>;
  strengths: Record<string, string>;
  improvements: Record<string, string>;
  recommendations: Record<string, string>;
};

const LEVEL_NAMES_ES = {
  Principiante: 'Principiante',
  Intermedio: 'Intermedio',
  Avanzado: 'Avanzado',
  Profesional: 'Profesional',
  Élite: 'Élite',
  Elite: 'Elite',
} as const;

const RECOMMENDATION_TECHNICAL =
  'Tu fuerte es el aspecto mental y táctico. Enfócate en perfeccionar tu técnica de golpes específicos como la víbora o el rulo para subir de nivel.';
const RECOMMENDATION_PHYSICAL =
  'Tienes una gran base técnica y táctica. Trabajar en tu explosividad y resistencia física te permitirá mantener el ritmo en partidos largos.';
const RECOMMENDATION_MENTAL =
  'Técnicamente eres muy sólido. Trabajar en la gestión de puntos clave y mantener la concentración te ayudará a cerrar partidos difíciles.';
const RECOMMENDATION_TACTICAL =
  'Posees buenas condiciones físicas y técnicas. Aprender a leer mejor el posicionamiento de los rivales te permitirá ganar más puntos con menos esfuerzo.';
const RECOMMENDATION_DEFAULT =
  'Sigue entrenando de forma regular para equilibrar todas tus dimensiones de juego.';
const RECOMMENDATION_ONBOARDING =
  'Ya completaste la nivelacion inicial. Juega tus proximos partidos para que el radar del coach se personalice con mayor precision.';

const LOCALES: Record<string, LocaleStrings> = {
  es: {
    levelNames: { ...LEVEL_NAMES_ES },
    strengths: {
      'Control mental y enfoque': 'Control mental y enfoque',
      'Consistencia técnica': 'Consistencia técnica',
      'Condición física y resistencia': 'Condición física y resistencia',
      'Lectura táctica del juego': 'Lectura táctica del juego',
      'Nivelacion inicial completada': 'Nivelacion inicial completada',
      'Base tecnica registrada': 'Base tecnica registrada',
    },
    improvements: {
      'Gestión de la presión': 'Gestión de la presión',
      'Refinamiento de golpes complejos': 'Refinamiento de golpes complejos',
      'Velocidad y explosividad': 'Velocidad y explosividad',
      'Estrategia ante diferentes rivales': 'Estrategia ante diferentes rivales',
      'Jugar partidos para afinar el radar': 'Jugar partidos para afinar el radar',
      'Completar objetivos del plan': 'Completar objetivos del plan',
    },
    recommendations: {
      [RECOMMENDATION_TECHNICAL]: RECOMMENDATION_TECHNICAL,
      [RECOMMENDATION_PHYSICAL]: RECOMMENDATION_PHYSICAL,
      [RECOMMENDATION_MENTAL]: RECOMMENDATION_MENTAL,
      [RECOMMENDATION_TACTICAL]: RECOMMENDATION_TACTICAL,
      [RECOMMENDATION_DEFAULT]: RECOMMENDATION_DEFAULT,
      [RECOMMENDATION_ONBOARDING]: RECOMMENDATION_ONBOARDING,
    },
  },
  en: {
    levelNames: {
      Principiante: 'Beginner',
      Intermedio: 'Intermediate',
      Avanzado: 'Advanced',
      Profesional: 'Professional',
      Élite: 'Elite',
      Elite: 'Elite',
    },
    strengths: {
      'Control mental y enfoque': 'Mental control and focus',
      'Consistencia técnica': 'Technical consistency',
      'Condición física y resistencia': 'Physical fitness and endurance',
      'Lectura táctica del juego': 'Tactical game reading',
      'Nivelacion inicial completada': 'Initial level assessment completed',
      'Base tecnica registrada': 'Technical baseline recorded',
    },
    improvements: {
      'Gestión de la presión': 'Pressure management',
      'Refinamiento de golpes complejos': 'Refining complex shots',
      'Velocidad y explosividad': 'Speed and explosiveness',
      'Estrategia ante diferentes rivales': 'Strategy against different opponents',
      'Jugar partidos para afinar el radar': 'Play matches to refine your radar',
      'Completar objetivos del plan': 'Complete plan objectives',
    },
    recommendations: {
      [RECOMMENDATION_TECHNICAL]:
        'Your strength is mental and tactical play. Focus on perfecting specific shots like the víbora and topspin lob to level up.',
      [RECOMMENDATION_PHYSICAL]:
        'You have a strong technical and tactical base. Working on explosiveness and endurance will help you keep pace in long matches.',
      [RECOMMENDATION_MENTAL]:
        'You are technically solid. Working on key-point management and staying focused will help you close out tough matches.',
      [RECOMMENDATION_TACTICAL]:
        "You have good physical and technical conditions. Reading opponents' positioning better will help you win more points with less effort.",
      [RECOMMENDATION_DEFAULT]:
        'Keep training regularly to balance all dimensions of your game.',
      [RECOMMENDATION_ONBOARDING]:
        'You have completed the initial level assessment. Play your next matches so the coach radar personalizes with greater accuracy.',
    },
  },
  'zh-HK': {
    levelNames: {
      Principiante: '初學者',
      Intermedio: '中級',
      Avanzado: '進階',
      Profesional: '專業',
      Élite: '精英',
      Elite: '精英',
    },
    strengths: {
      'Control mental y enfoque': '心理控制與專注力',
      'Consistencia técnica': '技術穩定性',
      'Condición física y resistencia': '體能與耐力',
      'Lectura táctica del juego': '戰術閱讀能力',
      'Nivelacion inicial completada': '已完成初始水平評估',
      'Base tecnica registrada': '已記錄技術基礎',
    },
    improvements: {
      'Gestión de la presión': '壓力管理',
      'Refinamiento de golpes complejos': '複雜擊球技巧精進',
      'Velocidad y explosividad': '速度與爆發力',
      'Estrategia ante diferentes rivales': '應對不同對手的策略',
      'Jugar partidos para afinar el radar': '多打比賽以優化雷達數據',
      'Completar objetivos del plan': '完成訓練計劃目標',
    },
    recommendations: {
      [RECOMMENDATION_TECHNICAL]:
        '你嘅強項係心理同戰術方面。專注精進特定擊球技巧，例如蛇形球同高吊球，就可以再上一層樓。',
      [RECOMMENDATION_PHYSICAL]:
        '你有扎實嘅技術同戰術基礎。加強爆發力同體能耐力，可以喺長場比賽中保持節奏。',
      [RECOMMENDATION_MENTAL]:
        '你嘅技術好穩定。改善關鍵分處理同專注力，有助你贏到艱難嘅比賽。',
      [RECOMMENDATION_TACTICAL]:
        '你嘅體能同技術條件唔錯。學識更好咁閱讀對手站位，可以用更少體力贏到更多分。',
      [RECOMMENDATION_DEFAULT]:
        '繼續定期訓練，平衡各方面嘅打法能力。',
      [RECOMMENDATION_ONBOARDING]:
        '你已完成初始水平評估。多打幾場比賽，教練雷達就會更精準咁為你度身訂造。',
    },
  },
};

function translateField(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

export interface CoachAssessmentTextFields {
  level_name: string;
  strengths: string[];
  improvements: string[];
  recommendation: string | null;
}

export function localizeCoachAssessmentText<T extends CoachAssessmentTextFields>(
  assessment: T,
  locale: string
): T & { locale: string } {
  if (locale === 'es') {
    return { ...assessment, locale };
  }

  const strings = LOCALES[locale];
  if (!strings) {
    return { ...assessment, locale };
  }

  return {
    ...assessment,
    level_name: strings.levelNames[assessment.level_name] ?? assessment.level_name,
    strengths: assessment.strengths.map((s) => translateField(strings.strengths, s)),
    improvements: assessment.improvements.map((s) => translateField(strings.improvements, s)),
    recommendation: assessment.recommendation
      ? translateField(strings.recommendations, assessment.recommendation)
      : assessment.recommendation,
    locale,
  };
}
