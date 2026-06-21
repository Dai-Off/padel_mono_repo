/* eslint-disable no-console */
// Aplica las traducciones de content_i18n a learning_questions.
// Valida cada traducción contra el content base real (paridad, claves prohibidas)
// usando el MISMO validador del backend antes de escribir.
//
//   Dry-run (solo valida):  npx ts-node -r dotenv/config scripts/apply-learning-i18n.ts --dry-run
//   Aplicar:                npx ts-node -r dotenv/config scripts/apply-learning-i18n.ts
import { getSupabaseServiceRoleClient } from '../src/lib/supabase';
import { validateQuestionContentI18n, DEFAULT_CONTENT_LOCALE } from '../src/lib/learningQuestionI18n';
import { TRANSLATIONS, CONTENT_LOCALE } from './learning-questions-i18n-data';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const supabase = getSupabaseServiceRoleClient();

  const { data: qs, error } = await supabase
    .from('learning_questions')
    .select('id, type, content, content_locale');
  if (error) throw error;
  const rows = (qs ?? []) as Array<{ id: string; type: string; content: any; content_locale: string | null }>;
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Árbol de puzzles para validar paridad de options.
  const puzzleIds = rows.filter((r) => r.type === 'puzzle').map((r) => r.id);
  const puzzleByQ = new Map<string, any>();
  if (puzzleIds.length > 0) {
    const { data: puzzles, error: pErr } = await supabase
      .from('learning_puzzles')
      .select('question_id, statement, options')
      .in('question_id', puzzleIds);
    if (pErr) throw pErr;
    for (const p of puzzles ?? []) puzzleByQ.set(String((p as any).question_id), p);
  }

  const ids = Object.keys(TRANSLATIONS);
  console.log(`Traducciones en data: ${ids.length} | Preguntas en BBDD: ${rows.length} | modo: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

  // Avisar de preguntas en BBDD sin traducción y viceversa.
  const missingTranslation = rows.filter((r) => !TRANSLATIONS[r.id]).map((r) => r.id);
  if (missingTranslation.length) console.log('⚠ Preguntas en BBDD SIN traducción:', missingTranslation.join(', '));
  const unknownIds = ids.filter((id) => !byId.has(id));
  if (unknownIds.length) console.log('⚠ IDs de traducción que no existen en BBDD:', unknownIds.join(', '));

  let ok = 0;
  let invalid = 0;
  let written = 0;

  for (const id of ids) {
    const q = byId.get(id);
    if (!q) continue; // ya avisado arriba
    const baseContent = q.type === 'puzzle'
      ? { statement: puzzleByQ.get(id)?.statement, options: puzzleByQ.get(id)?.options ?? [] }
      : (q.content ?? {});

    const i18n = TRANSLATIONS[id];
    // Idioma base de ESTA pregunta (default 'es'). content_i18n no puede
    // contener ese locale y se valida la paridad contra el content base.
    const baseLocale = CONTENT_LOCALE[id] ?? DEFAULT_CONTENT_LOCALE;
    const err = validateQuestionContentI18n(q.type, baseContent, i18n, baseLocale);
    if (err) {
      invalid++;
      console.log(`✗ ${id} (${q.type}): ${err}`);
      continue;
    }
    ok++;

    if (!DRY_RUN) {
      // Escribimos content_i18n y, si el idioma base declarado difiere del que
      // hay en BBDD, también content_locale (p. ej. puzzles en inglés → 'en').
      const update: Record<string, unknown> = { content_i18n: i18n };
      if ((q.content_locale ?? DEFAULT_CONTENT_LOCALE) !== baseLocale) {
        update.content_locale = baseLocale;
      }
      const { error: upErr } = await supabase
        .from('learning_questions')
        .update(update)
        .eq('id', id);
      if (upErr) {
        console.log(`✗ ${id}: fallo al escribir → ${upErr.message}`);
        invalid++;
        ok--;
      } else {
        written++;
      }
    }
  }

  console.log('========================================');
  console.log(`Válidas: ${ok} | Inválidas: ${invalid} | Escritas: ${written}`);
  console.log('========================================');
  if (invalid > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
