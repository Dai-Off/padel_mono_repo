/* eslint-disable no-console */
// Exporta los campos de TEXTO traducibles de todas las preguntas para poder
// traducirlas. Solo lectura. Ejecutar:
//   npx ts-node -r dotenv/config scripts/export-learning-questions.ts
import { getSupabaseServiceRoleClient } from '../src/lib/supabase';

async function main() {
  const supabase = getSupabaseServiceRoleClient();

  const { data: qs, error } = await supabase
    .from('learning_questions')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;

  const rows = qs ?? [];
  console.log('===COLUMNS===');
  console.log(rows[0] ? Object.keys(rows[0]).join(', ') : '(sin filas)');
  const puzzleIds = rows.filter((r: any) => r.type === 'puzzle').map((r: any) => r.id);
  const puzzleByQ = new Map<string, any>();
  if (puzzleIds.length > 0) {
    const { data: puzzles, error: pErr } = await supabase
      .from('learning_puzzles')
      .select('question_id, statement, options')
      .in('question_id', puzzleIds);
    if (pErr) throw pErr;
    for (const p of puzzles ?? []) puzzleByQ.set(String((p as any).question_id), p);
  }

  // Resumen por estado y tipo.
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const r of rows as any[]) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byType[r.type] = (byType[r.type] ?? 0) + 1;
  }

  // Extrae solo los campos de texto traducibles por tipo.
  function textOf(r: any): any {
    const c = r.content ?? {};
    switch (r.type) {
      case 'test_classic':
      case 'multi_select':
        return { question: c.question, options: c.options, explanation: c.explanation };
      case 'true_false':
        return { statement: c.statement, explanation: c.explanation };
      case 'match_columns':
        return { question: c.question, pairs: c.pairs, explanation: c.explanation };
      case 'order_sequence':
        return { question: c.question, steps: c.steps, explanation: c.explanation };
      case 'puzzle': {
        const p = puzzleByQ.get(String(r.id));
        return {
          statement: p?.statement,
          options: (p?.options ?? []).map((o: any) => ({ id: o.id, text: o.text, explanation: o.explanation })),
        };
      }
      default:
        return {};
    }
  }

  const out = rows.map((r: any) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    content_locale: r.content_locale,
    has_i18n: r.content_i18n && Object.keys(r.content_i18n).length > 0,
    text: textOf(r),
  }));

  console.log('===SUMMARY===');
  console.log('total', rows.length, 'byStatus', JSON.stringify(byStatus), 'byType', JSON.stringify(byType));

  const fs = require('fs');
  const path = require('path');
  const outPath = path.join(__dirname, 'learning-questions-export.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('WROTE', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
