/* eslint-disable no-console */
// Verifica el merge real: lee content + content_i18n de la BBDD y muestra el
// contenido localizado por idioma. Solo lectura.
//   npx ts-node -r dotenv/config scripts/verify-learning-i18n.ts
import { getSupabaseServiceRoleClient } from '../src/lib/supabase';
import { localizeQuestionContent } from '../src/lib/learningQuestionI18n';

const SAMPLE_IDS = [
  '477bb0d6-5f7b-4fc5-a4a2-f542eb5d395a', // test_classic (base es)
  '3f781417-0c7d-4afa-a9f9-dc95027b18cb', // puzzle (base en)
  'ef0a8dc5-ecd8-4896-9222-ff4e5ea3b4eb', // puzzle (base en)
];

async function main() {
  const supabase = getSupabaseServiceRoleClient();
  for (const id of SAMPLE_IDS) {
    const { data: q } = await supabase
      .from('learning_questions')
      .select('id, type, content, content_locale, content_i18n')
      .eq('id', id)
      .maybeSingle();
    if (!q) { console.log(`(${id} no encontrada)`); continue; }
    const contentLocale = (q as any).content_locale ?? 'es';

    let base: any = (q as any).content ?? {};
    if ((q as any).type === 'puzzle') {
      const { data: p } = await supabase
        .from('learning_puzzles')
        .select('statement, options')
        .eq('question_id', id)
        .maybeSingle();
      base = { statement: (p as any)?.statement, options: (p as any)?.options ?? [] };
    }
    const i18n = (q as any).content_i18n ?? {};

    console.log(`\n===== ${(q as any).type} ${id} (base=${contentLocale}) =====`);
    for (const loc of ['es', 'zh-HK', 'zh-CN', 'en']) {
      const localized = localizeQuestionContent((q as any).type, base, contentLocale, i18n, loc);
      const label = (localized as any).question ?? (localized as any).statement;
      const opts = (localized as any).options;
      let optStr = '';
      if (Array.isArray(opts)) {
        optStr = ' | opciones: ' + opts.map((o: any) => (typeof o === 'string' ? o : o.text)).join(' / ');
      }
      console.log(`[${loc}] ${label}${optStr}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
