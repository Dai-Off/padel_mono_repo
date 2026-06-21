/* eslint-disable no-console */
// Tests unitarios de la infraestructura i18n de preguntas de lección diaria.
// No necesita BBDD ni servidor. Ejecutar: npx ts-node scripts/test-learning-i18n.ts
import {
  localizeQuestionContent,
  validateQuestionContentI18n,
  isValidLocaleTag,
} from '../src/lib/learningQuestionI18n';
import { resolveLocale } from '../src/lib/locale';

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
    if (extra !== undefined) console.log('    →', JSON.stringify(extra));
  }
}
function fakeReq(lang?: string, acceptLanguage?: string): any {
  return { query: lang === undefined ? {} : { lang }, headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {} };
}

// ===========================================================================
console.log('\n[resolveLocale] preserva variantes de chino y colapsa el resto');
check('zh-CN se preserva (NO colapsa a zh-HK)', resolveLocale(fakeReq('zh-CN')) === 'zh-CN', resolveLocale(fakeReq('zh-CN')));
check('zh-HK se preserva', resolveLocale(fakeReq('zh-HK')) === 'zh-HK');
check('zh-TW se preserva', resolveLocale(fakeReq('zh-TW')) === 'zh-TW');
check('ZH-hk normaliza a zh-HK', resolveLocale(fakeReq('ZH-hk')) === 'zh-HK');
check('zh-Hant → zh-HK', resolveLocale(fakeReq('zh-Hant')) === 'zh-HK');
check('zh-Hans-CN → zh-CN', resolveLocale(fakeReq('zh-Hans-CN')) === 'zh-CN');
check('es-ES colapsa a es', resolveLocale(fakeReq('es-ES')) === 'es');
check('en-GB colapsa a en', resolveLocale(fakeReq('en-GB')) === 'en');
check('sin lang → es', resolveLocale(fakeReq()) === 'es');
check('Accept-Language zh-CN → zh-CN', resolveLocale(fakeReq(undefined, 'zh-CN,zh;q=0.9')) === 'zh-CN');
check('query tiene prioridad sobre header', resolveLocale(fakeReq('en', 'zh-CN')) === 'en');

console.log('\n[isValidLocaleTag]');
check('es válido', isValidLocaleTag('es'));
check('zh-HK válido', isValidLocaleTag('zh-HK'));
check('zh-CN válido', isValidLocaleTag('zh-CN'));
check('vacío inválido', !isValidLocaleTag(''));
check('número inválido', !isValidLocaleTag(123 as any));

// ===========================================================================
console.log('\n[localizeQuestionContent] test_classic');
{
  const content = { question: '¿Cuál?', options: ['a', 'b', 'c', 'd'], correct_index: 2, explanation: 'porque' };
  const i18n = { 'zh-HK': { question: '問題', options: ['甲', '乙', '丙', '丁'], explanation: '因為' } };
  const es = localizeQuestionContent('test_classic', content, 'es', i18n, 'es');
  check('locale es → contenido base', eq(es, content));
  const zh = localizeQuestionContent('test_classic', content, 'es', i18n, 'zh-HK') as any;
  check('zh-HK traduce question', zh.question === '問題');
  check('zh-HK traduce options', eq(zh.options, ['甲', '乙', '丙', '丁']));
  check('zh-HK preserva correct_index', zh.correct_index === 2);
  check('zh-HK traduce explanation', zh.explanation === '因為');
  const zhcn = localizeQuestionContent('test_classic', content, 'es', i18n, 'zh-CN');
  check('zh-CN sin traducción → fallback base', eq(zhcn, content));
}

console.log('\n[localizeQuestionContent] paridad de longitud');
{
  const content = { question: '¿Cuál?', options: ['a', 'b', 'c', 'd'], correct_index: 0 };
  const i18nBad = { 'zh-HK': { question: '問題', options: ['甲', '乙', '丙'] } }; // 3 != 4
  const zh = localizeQuestionContent('test_classic', content, 'es', i18nBad, 'zh-HK') as any;
  check('options con longitud distinta → mantiene base options', eq(zh.options, ['a', 'b', 'c', 'd']));
  check('pero sí traduce question', zh.question === '問題');
}

console.log('\n[localizeQuestionContent] content_locale NO español (base en zh-HK, traducción a es)');
{
  const content = { question: '問題', options: ['甲', '乙', '丙', '丁'], correct_index: 1 };
  const i18n = { es: { question: '¿Cuál?', options: ['a', 'b', 'c', 'd'] } };
  const zhBase = localizeQuestionContent('test_classic', content, 'zh-HK', i18n, 'zh-HK');
  check('locale == content_locale → base zh-HK', eq(zhBase, content));
  const es = localizeQuestionContent('test_classic', content, 'zh-HK', i18n, 'es') as any;
  check('es traduce desde base zh-HK', es.question === '¿Cuál?' && eq(es.options, ['a', 'b', 'c', 'd']));
  check('es preserva correct_index', es.correct_index === 1);
  const en = localizeQuestionContent('test_classic', content, 'zh-HK', i18n, 'en');
  check('en sin traducción → fallback base zh-HK', eq(en, content));
}

console.log('\n[localizeQuestionContent] true_false');
{
  const content = { statement: 'V o F', correct_answer: true, explanation: 'x' };
  const i18n = { 'zh-HK': { statement: '真假', explanation: 'y' } };
  const zh = localizeQuestionContent('true_false', content, 'es', i18n, 'zh-HK') as any;
  check('traduce statement', zh.statement === '真假');
  check('preserva correct_answer', zh.correct_answer === true);
  check('traduce explanation', zh.explanation === 'y');
}

console.log('\n[localizeQuestionContent] multi_select');
{
  const content = { question: 'multi', options: ['a', 'b', 'c', 'd'], correct_indices: [0, 2] };
  const i18n = { 'zh-CN': { question: '多选', options: ['一', '二', '三', '四'] } };
  const zh = localizeQuestionContent('multi_select', content, 'es', i18n, 'zh-CN') as any;
  check('traduce question y options', zh.question === '多选' && eq(zh.options, ['一', '二', '三', '四']));
  check('preserva correct_indices', eq(zh.correct_indices, [0, 2]));
}

console.log('\n[localizeQuestionContent] match_columns');
{
  const content = { question: 'une', pairs: [{ left: 'a', right: '1' }, { left: 'b', right: '2' }, { left: 'c', right: '3' }] };
  const i18n = { 'zh-HK': { question: '配對', pairs: [{ left: '甲', right: '一' }, { left: '乙', right: '二' }, { left: '丙', right: '三' }] } };
  const zh = localizeQuestionContent('match_columns', content, 'es', i18n, 'zh-HK') as any;
  check('traduce question', zh.question === '配對');
  check('traduce pairs preservando orden', eq(zh.pairs, [{ left: '甲', right: '一' }, { left: '乙', right: '二' }, { left: '丙', right: '三' }]));
  const i18nBad = { 'zh-HK': { pairs: [{ left: '甲', right: '一' }] } };
  const zhBad = localizeQuestionContent('match_columns', content, 'es', i18nBad, 'zh-HK') as any;
  check('pairs longitud distinta → mantiene base', eq(zhBad.pairs, content.pairs));
}

console.log('\n[localizeQuestionContent] order_sequence');
{
  const content = { question: 'ordena', steps: ['p1', 'p2', 'p3'] };
  const i18n = { 'zh-HK': { steps: ['步1', '步2', '步3'] } };
  const zh = localizeQuestionContent('order_sequence', content, 'es', i18n, 'zh-HK') as any;
  check('traduce steps', eq(zh.steps, ['步1', '步2', '步3']));
  check('question sin override → base', zh.question === 'ordena');
}

console.log('\n[localizeQuestionContent] puzzle');
{
  const content = {
    schema_version: 2,
    statement: 'mueve',
    options: [
      { id: 1, is_correct: false, text: 'op1', explanation: 'e1', select_frame: { players: [], ball: { x: 1, y: 1 } } },
      { id: 2, is_correct: true, text: 'op2', explanation: 'e2' },
    ],
    initial_frame: { players: [{ id: 1, team: 1, x: 5, y: 15 }], ball: { x: 5, y: 14 } },
  };
  const i18n = { 'zh-HK': { statement: '移動', options: [{ text: '選1', explanation: '解1' }, { text: '選2', explanation: '解2' }] } };
  const zh = localizeQuestionContent('puzzle', content, 'es', i18n, 'zh-HK') as any;
  check('traduce statement', zh.statement === '移動');
  check('traduce options[].text', zh.options[0].text === '選1' && zh.options[1].text === '選2');
  check('traduce options[].explanation', zh.options[0].explanation === '解1');
  check('preserva is_correct', zh.options[0].is_correct === false && zh.options[1].is_correct === true);
  check('preserva id de opción', zh.options[0].id === 1 && zh.options[1].id === 2);
  check('preserva select_frame intacto', eq(zh.options[0].select_frame, content.options[0].select_frame));
  check('preserva initial_frame intacto', eq(zh.initial_frame, content.initial_frame));
}

// ===========================================================================
console.log('\n[validateQuestionContentI18n]');
{
  const content = { question: '¿Cuál?', options: ['a', 'b', 'c', 'd'], correct_index: 2 };
  check('válido → null', validateQuestionContentI18n('test_classic', content, { 'zh-HK': { question: '問題', options: ['甲', '乙', '丙', '丁'] } }, 'es') === null);
  check('undefined → null (opcional)', validateQuestionContentI18n('test_classic', content, undefined, 'es') === null);
  check('array → error', typeof validateQuestionContentI18n('test_classic', content, [] as any, 'es') === 'string');
  check('locale base es → error', typeof validateQuestionContentI18n('test_classic', content, { es: { question: 'x' } }, 'es') === 'string');
  check('clave de respuesta prohibida → error', typeof validateQuestionContentI18n('test_classic', content, { 'zh-HK': { correct_index: 0 } }, 'es') === 'string');
  check('options longitud distinta → error', typeof validateQuestionContentI18n('test_classic', content, { 'zh-HK': { options: ['甲', '乙'] } }, 'es') === 'string');
  check('traducción parcial (solo question) → null', validateQuestionContentI18n('test_classic', content, { 'zh-HK': { question: '問題' } }, 'es') === null);

  const puzzle = { statement: 'm', options: [{ id: 1, is_correct: false, text: 'a', explanation: 'x' }, { id: 2, is_correct: true, text: 'b', explanation: 'y' }] };
  check('puzzle options longitud distinta → error', typeof validateQuestionContentI18n('puzzle', puzzle, { 'zh-HK': { options: [{ text: 'a' }] } }, 'es') === 'string');
  check('puzzle is_correct prohibido top-level → error', typeof validateQuestionContentI18n('puzzle', puzzle, { 'zh-HK': { is_correct: true } }, 'es') === 'string');

  // content_locale no español: el locale base prohibido es zh-HK.
  check('base zh-HK: content_i18n[zh-HK] → error', typeof validateQuestionContentI18n('test_classic', content, { 'zh-HK': { question: 'x' } }, 'zh-HK') === 'string');
  check('base zh-HK: content_i18n[es] válido → null', validateQuestionContentI18n('test_classic', content, { es: { question: '¿Cuál?', options: ['a', 'b', 'c', 'd'] } }, 'zh-HK') === null);
}

// ===========================================================================
console.log(`\n========================================`);
console.log(`RESULTADO: ${passed} OK, ${failed} FALLOS`);
console.log(`========================================`);
process.exit(failed > 0 ? 1 : 0);
