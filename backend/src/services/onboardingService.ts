export type OnboardingAnswer = { question_id: string; value: string };

export type Question = {
  id: string;
  text: string;
  options: { value: string; label: string }[];
};

const Q = {
  played_padel: 'played_padel',
  racket_sports: 'racket_sports',
  racket_years: 'racket_years',
  padel_freq: 'padel_freq',
  padel_time: 'padel_time',
  padel_comp: 'padel_comp',
  padel_skill: 'padel_skill',
} as const;

export function getNextQuestion(answers: OnboardingAnswer[]): Question | null {
  const by = (id: string) => answers.find((a) => a.question_id === id)?.value;

  if (!by(Q.played_padel)) {
    return {
      id: Q.played_padel,
      text: '¿Has jugado alguna vez al pádel?',
      options: [
        { value: 'yes', label: 'Sí' },
        { value: 'no', label: 'No' },
      ],
    };
  }

  if (by(Q.played_padel) === 'no') {
    if (!by(Q.racket_sports)) {
      return {
        id: Q.racket_sports,
        text: '¿Has practicado otros deportes de raqueta?',
        options: [
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Sí' },
        ],
      };
    }
    if (by(Q.racket_sports) === 'yes' && !by(Q.racket_years)) {
      return {
        id: Q.racket_years,
        text: '¿Cuántos años llevas en ese deporte?',
        options: [
          { value: 'lt2', label: 'Menos de 2' },
          { value: '2to5', label: 'Entre 2 y 5' },
          { value: 'gt5', label: 'Más de 5' },
        ],
      };
    }
    return null;
  }

  if (by(Q.played_padel) === 'yes') {
    if (!by(Q.padel_freq)) {
      return {
        id: Q.padel_freq,
        text: '¿Con qué frecuencia juegas al pádel?',
        options: [
          { value: 'low', label: 'Menos de 1 vez por semana' },
          { value: 'high', label: 'Al menos 1 vez por semana' },
        ],
      };
    }
    if (by(Q.padel_freq) === 'low' && !by(Q.padel_time)) {
      return {
        id: Q.padel_time,
        text: '¿Cuánto tiempo llevas jugando pádel?',
        options: [
          { value: 'lt1y', label: 'Menos de 1 año' },
          { value: '1to3', label: 'Entre 1 y 3 años' },
          { value: 'gt3', label: 'Más de 3 años' },
        ],
      };
    }
    if (by(Q.padel_freq) === 'high' && !by(Q.padel_comp)) {
      return {
        id: Q.padel_comp,
        text: '¿Participas en competiciones?',
        options: [
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Sí' },
        ],
      };
    }
    if (!by(Q.padel_skill)) {
      return {
        id: Q.padel_skill,
        text: '¿Cómo valorarías tu nivel técnico actual en pádel?',
        options: [
          { value: 'low', label: 'Iniciación / básico' },
          { value: 'mid', label: 'Intermedio' },
          { value: 'high', label: 'Avanzado' },
        ],
      };
    }
  }

  return null;
}

export function calcInitialMu(answers: OnboardingAnswer[]): number {
  const by = (id: string) => answers.find((a) => a.question_id === id)?.value;
  let mu = 25;

  if (by(Q.played_padel) === 'no') {
    if (by(Q.racket_sports) === 'no') mu = 20;
    else if (by(Q.racket_years) === 'lt2') mu = 22;
    else if (by(Q.racket_years) === '2to5') mu = 24;
    else if (by(Q.racket_years) === 'gt5') mu = 26;
    else mu = 22;
  } else {
    if (by(Q.padel_freq) === 'low') {
      if (by(Q.padel_time) === 'lt1y') mu = 24;
      else if (by(Q.padel_time) === '1to3') mu = 26;
      else if (by(Q.padel_time) === 'gt3') mu = 27;
      else mu = 25;
    } else {
      mu = by(Q.padel_comp) === 'yes' ? 30 : 28;
    }
  }

  const sk = by(Q.padel_skill);
  if (sk === 'low') mu -= 1;
  if (sk === 'high') mu += 1.5;

  return Math.max(15, Math.min(40, mu));
}
