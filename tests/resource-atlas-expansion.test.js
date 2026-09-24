'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('resource atlas covers the complete WHO primary-registry network represented in the expansion', () => {
  const migration = read('supabase/migrations/20260916000300_global_resource_atlas_expansion.sql');
  const registries = [
    'rebec', 'chictr', 'cris-korea', 'ctri-india', 'rpcec-cuba', 'eu-ctr', 'drks',
    'irct', 'itmctr', 'lbctr', 'tctr', 'pactr', 'repec', 'slctr',
  ];
  for (const id of registries) assert.match(migration, new RegExp(`'${id}'`));
  assert.match(migration, /WHO-recognised primary registry/g);
});

test('atlas adds dedicated ageing data, review, and worldwide regulator categories', () => {
  const migration = read('supabase/migrations/20260916000300_global_resource_atlas_expansion.sql');
  for (const type of ['ageing_data', 'systematic_reviews']) assert.match(migration, new RegExp(`'${type}'`));
  for (const region of ['Africa', 'Middle East']) assert.match(migration, new RegExp(`'${region}'`));
  for (const resource of ['who-ageing-data', 'hagr', 'gateway-global-aging', 'uk-biobank', 'clsa', 'cochrane-library', 'anvisa', 'sahpra', 'medsafe']) {
    assert.match(migration, new RegExp(`'${resource}'`));
  }
});

test('resource page provides task-first shortcuts and readable regional coverage', () => {
  const template = read('intelligence-template.html');
  const client = read('intelligence.js');
  assert.match(template, /Find registered trials/);
  assert.match(template, /Check medicines/);
  assert.match(template, /Read evidence summaries/);
  assert.match(template, /Explore ageing data/);
  assert.match(template, /resourceRegionGrid/);
  assert.match(client, /resource-region-card/);
  assert.match(client, /by_region_jurisdictions/);
  assert.doesNotMatch(template, /resourceMapNodes/);
  assert.match(client, /data-resource-preset/);
});

test('expanded link monitoring is bounded and includes new official hosts', () => {
  const monitor = read('supabase/functions/check-resource-health/index.ts');
  assert.match(monitor, /const batchSize = 8/);
  for (const host of ['pactr.samrc.ac.za', 'platform.who.int', 'www.sahpra.org.za', 'www.gov.br']) {
    assert.match(monitor, new RegExp(host.replaceAll('.', '\\.')));
  }
});
