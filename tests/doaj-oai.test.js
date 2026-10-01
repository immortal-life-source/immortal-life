import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDoajOaiPage } from '../supabase/functions/_shared/doaj-oai.ts';

const PAGE = `<?xml version="1.0"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <ListRecords>
    <record>
      <header><identifier>oai:doaj.org/article:abc123</identifier><datestamp>2026-09-01T02:17:44Z</datestamp></header>
      <metadata><oai_doaj:doajArticle xmlns:oai_doaj="http://doaj.org/features/oai_doaj/1.0/">
        <oai_doaj:language>eng</oai_doaj:language><oai_doaj:publisher>Example Publisher</oai_doaj:publisher>
        <oai_doaj:journalTitle>Healthy Ageing</oai_doaj:journalTitle><oai_doaj:publicationDate>2026-08-01</oai_doaj:publicationDate>
        <oai_doaj:doi>10.1000/example</oai_doaj:doi><oai_doaj:title>Exercise &amp; healthy ageing</oai_doaj:title>
        <oai_doaj:authors><oai_doaj:author><oai_doaj:name>Ada Example</oai_doaj:name></oai_doaj:author></oai_doaj:authors>
        <oai_doaj:keywords><oai_doaj:keyword>physical activity</oai_doaj:keyword></oai_doaj:keywords>
        <oai_doaj:abstract>This content must not be retained by the parser.</oai_doaj:abstract>
      </oai_doaj:doajArticle></metadata>
    </record>
    <record><header status="deleted"><identifier>oai:doaj.org/article:gone456</identifier><datestamp>2026-08-31T00:00:00Z</datestamp></header></record>
    <resumptionToken completeListSize="13500000" cursor="300">next-token</resumptionToken>
  </ListRecords>
</OAI-PMH>`;

test('DOAJ OAI-PMH parser preserves resumable metadata and deletion signals', () => {
  const page = parseDoajOaiPage(PAGE);
  assert.equal(page.records.length, 1);
  assert.deepEqual(page.deletedIds, ['gone456']);
  assert.equal(page.resumptionToken, 'next-token');
  assert.equal(page.completeListSize, 13_500_000);
  assert.equal(page.cursor, 300);
  assert.equal(page.lastDatestamp, '2026-08-31T00:00:00Z');
  assert.deepEqual(page.records[0], {
    externalId: 'abc123', datestamp: '2026-09-01T02:17:44Z',
    title: 'Exercise & healthy ageing', authors: ['Ada Example'],
    journal: 'Healthy Ageing', publishedOn: '2026-08-01',
    doi: '10.1000/example', keywords: ['physical activity'],
    language: 'eng', publisher: 'Example Publisher',
  });
  assert.doesNotMatch(JSON.stringify(page), /must not be retained/i);
});

test('DOAJ OAI-PMH parser exposes protocol errors without inventing records', () => {
  const page = parseDoajOaiPage('<OAI-PMH><error code="badResumptionToken">expired</error></OAI-PMH>');
  assert.equal(page.errorCode, 'badResumptionToken');
  assert.deepEqual(page.records, []);
  assert.equal(page.completeListSize, null);
  assert.equal(page.cursor, null);
});
