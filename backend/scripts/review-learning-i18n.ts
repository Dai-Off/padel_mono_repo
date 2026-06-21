/* eslint-disable no-console */
// Revisión del endpoint POST /daily-lesson/localize: simula su lógica EXACTA
// (fetch por ids → ensamblar puzzle → localizar → sanitizar → orden de entrada)
// contra la BBDD real y verifica orden, idioma, clave de respuesta y fallback.
//   npx ts-node -r dotenv/config scripts/review-learning-i18n.ts
import { getSupabaseServiceRoleClient } from '../src/lib/supabase';
import { localizeQuestionContent, ContentI18n } from '../src/lib/learningQuestionI18n';
import { sanitizeContent } from '../src/routes/learningAlgorithm';

// Set mixto, en un orden deliberadamente "raro" para comprobar preservación de orden.
const REQUEST_IDS = [
  'ef0a8dc5-ecd8-4896-9222-ff4e5ea3b4eb', // puzzle
  '477bb0d6-5f7b-4fc5-a4a2-f542eb5d395a', // test_classic
  '23c4a339-312c-48cd-9613-2c2b3e465647', // multi_select
  '84d7b562-1650-467f-a8cf-f9311b5e2b2d', // true_false
  '0ee036cb-174d-4e30-a9f2-12282f175d4b', // match_columns
  '37b43167-8a93-46ca-a814-9460ac9acbfa', // order_sequence
];

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// Réplica de la lógica del endpoint para una lista de ids + locale.
async function localizeEndpoint(ids: string[], locale: string) {
  const supabase = getSupabaseServiceRoleClient();
  const [contentRes, puzzlesRes] = await Promise.all([
    supabase.from('learning_questions')
      .select('id, type, area, has_video, video_url, content, content_locale, content_i18n')
      .in('id', ids),
    supabase.from('learning_puzzles')
      .select('question_id, statement, intro_frame, initial_frame, options, schema_version')
      .in('question_id', ids),
  ]);
  if (contentRes.error) throw contentRes.error;
  if (puzzlesRes.error) throw puzzlesRes.error;
  const rowById = new Map((contentRes.data ?? []).map((r: any) => [String(r.id), r]));
  const puzzleByQ = new Map((puzzlesRes.data ?? []).map((p: any) => [String(p.question_id), p]));
  return ids.map((id) => {
    const r = rowById.get(String(id));
    if (!r) return null;
    let content: Record<string, unknown>;
    if (r.type === 'puzzle') {
      const p = puzzleByQ.get(String(id));
      content = p ? { schema_version: p.schema_version, statement: p.statement, intro_frame: p.intro_frame, initial_frame: p.initial_frame, options: p.options } : {};
    } else {
      content = (r.content ?? {}) as Record<string, unknown>;
    }
    content = localizeQuestionContent(r.type, content, r.content_locale, r.content_i18n as ContentI18n, locale);
    return { id: r.id, type: r.type, content: sanitizeContent(r.type, content) };
  }).filter((q): q is NonNullable<typeof q> => q !== null);
}

async function main() {
  console.log('[localize endpoint] orden, idioma, clave de respuesta y fallback\n');

  const es = await localizeEndpoint(REQUEST_IDS, 'es');
  const zhHK = await localizeEndpoint(REQUEST_IDS, 'zh-HK');
  const zhCN = await localizeEndpoint(REQUEST_IDS, 'zh-CN');
  const fr = await localizeEndpoint(REQUEST_IDS, 'fr'); // sin traducción → fallback

  // Orden y count
  check('count == ids pedidos (es)', es.length === REQUEST_IDS.length, { got: es.length });
  check('orden preservado == orden de entrada', es.every((q, i) => q.id === REQUEST_IDS[i]), es.map((q) => q.id));
  check('orden preservado tambien en zh-HK', zhHK.every((q, i) => q.id === REQUEST_IDS[i]));

  // Helper para sacar campos por id
  const byId = (arr: any[]) => new Map(arr.map((q) => [q.id, q]));
  const E = byId(es), H = byId(zhHK), C = byId(zhCN), F = byId(fr);

  const tcId = '477bb0d6-5f7b-4fc5-a4a2-f542eb5d395a';
  const msId = '23c4a339-312c-48cd-9613-2c2b3e465647';
  const tfId = '84d7b562-1650-467f-a8cf-f9311b5e2b2d';
  const pzId = 'ef0a8dc5-ecd8-4896-9222-ff4e5ea3b4eb';

  // Idioma aplicado (zh-HK distinto de es) y fallback (fr == es)
  check('test_classic: zh-HK traduce question', H.get(tcId).content.question !== E.get(tcId).content.question);
  check('test_classic: zh-CN traduce question', C.get(tcId).content.question !== E.get(tcId).content.question);
  check('test_classic: zh-HK != zh-CN (tradicional vs simplificado)', H.get(tcId).content.question !== C.get(tcId).content.question);
  check('fallback: fr cae al base (== es) cuando no hay traducción', F.get(tcId).content.question === E.get(tcId).content.question);

  // CLAVE DE RESPUESTA intacta en todos los idiomas
  check('test_classic: correct_index intacto en todos los idiomas',
    [H, C, F].every((m) => m.get(tcId).content.correct_index === E.get(tcId).content.correct_index),
    { es: E.get(tcId).content.correct_index, zhHK: H.get(tcId).content.correct_index });
  check('multi_select: correct_indices intacto',
    [H, C, F].every((m) => JSON.stringify(m.get(msId).content.correct_indices) === JSON.stringify(E.get(msId).content.correct_indices)));
  check('true_false: correct_answer intacto',
    [H, C, F].every((m) => m.get(tfId).content.correct_answer === E.get(tfId).content.correct_answer));

  // multi_select: misma cantidad de opciones tras traducir (paridad)
  check('multi_select: nº de opciones preservado',
    [H, C].every((m) => m.get(msId).content.options.length === E.get(msId).content.options.length));

  // puzzle: traduce statement + options[].text pero preserva is_correct e id
  const pe = E.get(pzId).content, ph = H.get(pzId).content;
  check('puzzle: zh-HK traduce statement', ph.statement !== pe.statement);
  check('puzzle: zh-HK traduce options[].text', ph.options[0].text !== pe.options[0].text);
  check('puzzle: is_correct preservado por opción',
    ph.options.every((o: any, i: number) => o.is_correct === pe.options[i].is_correct));
  check('puzzle: id de opción preservado',
    ph.options.every((o: any, i: number) => o.id === pe.options[i].id));
  check('puzzle: initial_frame intacto (no se traduce la estructura)',
    JSON.stringify(ph.initial_frame) === JSON.stringify(pe.initial_frame));

  console.log(`\n========================================`);
  console.log(`RESULTADO: ${pass} OK, ${fail} FALLOS`);
  console.log(`========================================`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
