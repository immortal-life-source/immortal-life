# Longevity Answers

## Status

Product concept approved for preservation, but not approved for implementation yet. Revisit only when the owner explicitly asks to proceed.

## Product promise

Longevity Answers is a source-grounded research librarian for longevity and immortality questions. It gives useful, cited explanations from the immortal.life evidence index without diagnosing, prescribing, selecting treatment, or presenting itself as medical advice.

## First-release scope

- Natural-language questions submitted from the homepage.
- Temporary, private answer pages under `/ask/session/<temporary-id>`.
- `noindex, nofollow`; excluded from the sitemap.
- Short answer, evidence snapshot, evidence by study type, uncertainties, related records, numbered citations, and evidence freshness.
- Claims generated only from retrieved, source-linked records.
- Clear separation of human trials, observational studies, reviews, animal work, and laboratory findings.
- General research questions answered normally.
- Personal medical questions transparently transformed into general evidence questions where useful.
- Diagnosis, dosage, treatment selection, medication changes, individualized risk predictions, unsafe experimentation, and criminal or self-harm instructions refused.
- Seven-day proposed retention for temporary answers, with immediate user deletion available.
- No sign-in requirement and no association of questions with an account or email.
- No raw question text in ordinary analytics.

## Evidence and safety controls

1. Classify and sanitize the question.
2. Remove unnecessary personal identifiers.
3. Retrieve records permitted for on-site AI summarization.
4. Check that the evidence is sufficient.
5. Generate only from retrieved material.
6. Validate claims and citations.
7. Run medical-advice and unsafe-output checks.
8. Fail closed with a reformulation, limited summary, refusal, or insufficient-evidence response.

Trial registration is never proof of effectiveness. Preclinical findings must remain visibly preclinical. Conflicting, corrected, or retracted evidence must remain visible rather than being flattened into a confident conclusion.

## Source permissions

Each source defaults to disallowed until explicitly approved for the relevant use:

- website display
- automated ingestion
- AI summarization
- public indexing
- free newsletter
- paid newsletter
- commercial reuse
- quotation

A directory listing is not the same as an active integration or permission to reuse source content commercially.

## Deferred features

The following are deliberately outside the first release:

- Automatic creation of permanent or indexed pages from visitor questions.
- Personalized medical answers.
- Paid answer-based or personalized newsletters.
- Commercial reuse of sources without explicit permission.
- Health-product rankings, affiliate recommendations, or sponsored treatment claims.

## Later phases

1. Internal red-team and citation testing.
2. Limited anonymous public beta with temporary `noindex` answers.
3. Curated, impersonal public knowledge pages only after evidence, privacy, source-permission, and admin checks.
4. Paid topic-based evidence briefings using only sources approved for commercial reuse.

## Operational requirements

- Global kill switch.
- Per-source disable control.
- Rate limiting and bot protection.
- Prompt-injection resistance.
- No model access to database-writing or administration functions.
- Audit metadata containing source IDs, policy outcome, model version, and timestamps without retaining unnecessary personal narratives.
- Lightweight retrieval index, caching of generalized questions, precomputed summaries, and CDN delivery to control Supabase I/O and global latency.
- Mobile-readable citations, limitations, and safety context.

## Launch rule

Implementation requires a new explicit decision. The recommended initial authorization is limited to internal testing and a temporary, private, non-personalized beta. Public indexing and paid answer-based newsletters require separate approval.
