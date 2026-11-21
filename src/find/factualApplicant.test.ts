/**
 * Fair-housing guard: fails if a protected-trait field or term is ever used in
 * matching, filters or summaries. If this test fails, don't loosen it: remove
 * the field. Lifestyle and logistics only (plan Part 7).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTUAL_FIELDS, PROTECTED_TRAIT_TERMS, protectedTermsIn, toFactualApplicant, toWords } from './factualApplicant';
import { LIFESTYLE_QUESTIONS } from './lifestyle';
import { FIND_FILTER_KEYS, parseFindQuery } from './findFilters';
import { BAY_AREA_CITIES } from '../geo/bayArea';
import { APPLICANT_SUMMARY_INSTRUCTION, APPLICANT_SUMMARY_SCHEMA, buildApplicantSummaryPrompt } from './hostText';
import { moveInFit, budgetFit, scoreApplicant, summarizeApplicants } from './fit';

const FULL = {
  phoneVerified: true,
  idVerified: true,
  rentHistoryVerified: false,
  passportLevel: 2,
  moveInDate: '2026-12-01',
  moveInFrom: '2026-11-25',
  moveInTo: '2026-12-10',
  stayLength: '6 months',
  budgetMinCents: 120000,
  budgetMaxCents: 160000,
  lifestyle: { sleep: 'Early bird', cleanliness: 'Tidy', guests: 'Rarely', pets: 'No pets', smoking: 'Never', wfh: 'Some days' },
  hasIntroVideo: true,
  noteLength: 120,
};

/** A raw applicant carrying protected traits, as if someone added them upstream by mistake. */
const POISONED = {
  ...FULL,
  race: 'X-RACE',
  ethnicity: 'X-ETHNICITY',
  religion: 'X-RELIGION',
  gender: 'X-GENDER',
  sex: 'X-SEX',
  age: 61,
  birthdate: '1965-01-01',
  nationalOrigin: 'X-ORIGIN',
  citizenship: 'X-CITIZEN',
  maritalStatus: 'X-MARITAL',
  familialStatus: 'X-FAMILY',
  hasChildren: true,
  disability: 'X-DISABILITY',
  sexualOrientation: 'X-ORIENTATION',
  sourceOfIncome: 'X-INCOME',
  veteranStatus: 'X-VETERAN',
  name: 'X-NAME',
  photoUrl: 'X-PHOTO',
  bio: 'X-BIO',
  note: 'X-NOTE',
  lifestyle: { ...FULL.lifestyle, religion: 'X-LIFESTYLE-RELIGION', schedule: 'Night owl' },
};

test('the term matcher finds whole words in identifiers and prose, not substrings', () => {
  assert.deepEqual(toWords('nationalOrigin_status'), ['national', 'origin', 'status']);
  assert.ok(protectedTermsIn('maritalStatus').includes('marital'));
  assert.ok(protectedTermsIn('hasChildren').includes('children'));
  assert.ok(protectedTermsIn('perfect for a young professional').includes('young'));
  assert.ok(protectedTermsIn('national origin').includes('national origin'));
  assert.deepEqual(protectedTermsIn('passportLevel moveInDate trace average stage hold'), []);
});

test('the allowlist of applicant fields has no protected traits', () => {
  for (const field of FACTUAL_FIELDS) assert.deepEqual(protectedTermsIn(field), [], `field "${field}"`);
  assert.deepEqual(Object.keys(toFactualApplicant(FULL)).sort(), [...FACTUAL_FIELDS].sort());
});

test('lifestyle questions (keys, labels, options) have no protected traits', () => {
  for (const q of LIFESTYLE_QUESTIONS) {
    for (const text of [q.key, q.label, ...q.options]) assert.deepEqual(protectedTermsIn(text), [], `lifestyle "${text}"`);
  }
});

test('Find filters have no protected traits', () => {
  for (const key of FIND_FILTER_KEYS) assert.deepEqual(protectedTermsIn(key), [], `filter "${key}"`);
  for (const c of BAY_AREA_CITIES) for (const area of [c.name, ...(c.neighborhoods ?? []).map((h) => h.name)]) assert.deepEqual(protectedTermsIn(area), [], area);
  // Unknown query params are dropped, never passed through
  const parsed = parseFindQuery({ place: 'Mission', lat: '37.76', lng: '-122.41', miles: '3', religion: 'x', age: '30', gender: 'y' });
  assert.deepEqual(Object.keys(parsed).sort(), [...FIND_FILTER_KEYS].sort());
});

test('protected traits on the input never reach the factual applicant', () => {
  const out = toFactualApplicant(POISONED);
  assert.deepEqual(Object.keys(out).sort(), [...FACTUAL_FIELDS].sort());
  const json = JSON.stringify(out);
  assert.ok(!json.includes('X-'), `leaked: ${json}`);
  assert.equal(out.lifestyle.sleep, 'Early bird', 'a legacy key never overrides the current answer');
  assert.equal(toFactualApplicant({ lifestyle: { sleep: 'X-FREE-TEXT' } }).lifestyle.sleep, undefined, 'free text is dropped');
  assert.deepEqual(Object.keys(out.lifestyle).sort(), ['cleanliness', 'guests', 'pets', 'sleep', 'smoking', 'wfh']);
});

test('the AI summary prompt, instruction and schema carry no protected traits or personal text', () => {
  const facts = toFactualApplicant(POISONED);
  const prompt = buildApplicantSummaryPrompt({ rentCents: 145000, availableFrom: '2026-12-01' }, [
    { number: 1, facts },
    { number: 2, facts: toFactualApplicant({ ...POISONED, idVerified: false }) },
  ]);
  assert.ok(!prompt.includes('X-'), 'no personal text in the prompt');
  assert.deepEqual(protectedTermsIn(prompt), [], 'prompt');
  assert.deepEqual(protectedTermsIn(APPLICANT_SUMMARY_INSTRUCTION), [], 'instruction');
  assert.deepEqual(protectedTermsIn(JSON.stringify(APPLICANT_SUMMARY_SCHEMA)), [], 'schema');
});

test('fit math and the summary only read factual fields', () => {
  const facts = toFactualApplicant(POISONED);
  const scored = scoreApplicant({ id: 'a', status: 'submitted', createdAt: '2026-11-01', facts }, { rentCents: 145000, availableFrom: '2026-12-01' });
  const same = scoreApplicant(
    { id: 'a', status: 'submitted', createdAt: '2026-11-01', facts: toFactualApplicant(FULL) },
    { rentCents: 145000, availableFrom: '2026-12-01' }
  );
  assert.deepEqual(scored, same, 'adding protected traits changes nothing');
  assert.deepEqual(protectedTermsIn(summarizeApplicants([scored])), []);
  assert.deepEqual(protectedTermsIn(moveInFit(facts, '2027-02-01').text + ' ' + budgetFit(200000, facts).text), []);
});

test('the protected-trait list covers the federal and California classes', () => {
  for (const term of ['race', 'color', 'religion', 'sex', 'national origin', 'familial status', 'disability', 'age', 'marital', 'sexual orientation', 'source of income', 'military', 'genetic', 'ancestry', 'citizenship']) {
    assert.ok((PROTECTED_TRAIT_TERMS as readonly string[]).includes(term), term);
  }
});
