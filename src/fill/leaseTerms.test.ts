import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEASE_TERMS, isLeaseTerm, leaseTermOptions } from './leaseTerms';
import { toFactualApplicant } from '../find/factualApplicant';
import { toRoomListing } from '../find/findFilters';

test('hosts and renters choose from the same stay lengths', () => {
  assert.deepEqual([...LEASE_TERMS], ['Month-to-month', '3 months', '6 months', '9 months', '12+ months']);
  assert.ok(isLeaseTerm('9 months'));
  assert.ok(!isLeaseTerm('Until lease ends'));
});

test('an older saved lease term stays selectable instead of being replaced', () => {
  assert.deepEqual(leaseTermOptions('6 months'), [...LEASE_TERMS]);
  assert.deepEqual(leaseTermOptions('Until lease ends'), [...LEASE_TERMS, 'Until lease ends']);
  assert.deepEqual(leaseTermOptions(null), [...LEASE_TERMS]);
});

test('the Passport stay length passes the allowlist only when it is a known term', () => {
  assert.equal(toFactualApplicant({ stayLength: '12+ months' }).stayLength, '12+ months');
  assert.equal(toFactualApplicant({ stayLength: 'forever' }).stayLength, null);
});

test('the 0005 SQL check lists exactly the same values', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0005_passport_stay_length.sql', import.meta.url), 'utf8');
  const inList = sql.match(/stay_length in \(([^)]*)\)/)?.[1] ?? '';
  const values = [...inList.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(values, [...LEASE_TERMS]);
});

test('every term shows on Find cards', () => {
  const base = {
    id: 'x', title: null, description: null, neighborhood: 'Mission', city: 'San Francisco', rentCents: 100000, depositCents: null,
    availableFrom: null, beds: null, baths: null, amenities: [], houseRules: null, status: 'published' as const,
    videoUrl: null, thumbUrl: null, publishedAt: null,
    host: { id: 'h', firstName: null, photoUrl: null, phoneVerified: false, idVerified: false }, housemates: [],
  };
  const shown = LEASE_TERMS.map((t) => toRoomListing({ ...base, leaseTerm: t }, '2026-11-20').leaseTerm);
  assert.deepEqual(shown, ['Month-to-month', '3 Months', '6 Months', '9 Months', '12+ Months']);
});
