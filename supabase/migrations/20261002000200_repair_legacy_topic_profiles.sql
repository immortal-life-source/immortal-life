-- The first 82 topics pre-date database-owned matching profiles. The complete
-- taxonomy reindex therefore skipped those topics even though the ingestion
-- workers' maintained matcher knew their terminology. Move that exact,
-- reviewed terminology into the database so all 180 topics are evaluated by
-- the same rules and restart the resumable taxonomy pass from a clean boundary.

with profiles as (
  select slug, terms, requires_ageing_context
  from jsonb_to_recordset($profiles$
  [
    {"slug":"rapamycin","terms":["rapamycin","sirolimus","everolimus","rapalog","mtor inhibitor"],"requires_ageing_context":false},
    {"slug":"senolytics","terms":["senolytic","senomorphic","cellular senescence","senescent cell"],"requires_ageing_context":false},
    {"slug":"partial-reprogramming","terms":["partial reprogramming","epigenetic reprogramming","yamanaka factor","oskm"],"requires_ageing_context":false},
    {"slug":"metformin","terms":["metformin"],"requires_ageing_context":false},
    {"slug":"glp-1-therapies","terms":["glp-1","glp1","semaglutide","tirzepatide","liraglutide"],"requires_ageing_context":true},
    {"slug":"exercise","terms":["exercise","physical activity","cardiorespiratory fitness"],"requires_ageing_context":true},
    {"slug":"caloric-restriction","terms":["caloric restriction","calorie restriction","intermittent fasting","time-restricted eating"],"requires_ageing_context":true},
    {"slug":"sleep","terms":["sleep","circadian"],"requires_ageing_context":true},
    {"slug":"epigenetic-clocks","terms":["epigenetic clock","dna methylation age","biological age clock","phenoage","grim age","grimage"],"requires_ageing_context":false},
    {"slug":"plasma-exchange","terms":["plasma exchange","plasmapheresis","plasma dilution"],"requires_ageing_context":true},
    {"slug":"stem-cells","terms":["stem cell","progenitor cell"],"requires_ageing_context":true},
    {"slug":"gene-therapy","terms":["gene therapy","gene transfer","genome editing","crispr"],"requires_ageing_context":true},
    {"slug":"genomic-instability","terms":["genomic instability","dna damage","dna repair"],"requires_ageing_context":true},
    {"slug":"telomeres-telomerase","terms":["telomere","telomerase"],"requires_ageing_context":true},
    {"slug":"epigenetic-alterations","terms":["epigenetic alteration","chromatin","histone","dna methylation"],"requires_ageing_context":true},
    {"slug":"proteostasis","terms":["proteostasis","protein homeostasis","protein aggregation"],"requires_ageing_context":true},
    {"slug":"autophagy","terms":["autophagy","macroautophagy","lysosomal"],"requires_ageing_context":true},
    {"slug":"nutrient-sensing","terms":["nutrient sensing","ampk","igf-1","insulin signaling","insulin signalling"],"requires_ageing_context":true},
    {"slug":"mitochondrial-function","terms":["mitochondrial dysfunction","mitochondrial function","mitophagy"],"requires_ageing_context":true},
    {"slug":"intercellular-communication","terms":["intercellular communication","cell-cell communication","extracellular vesicle"],"requires_ageing_context":true},
    {"slug":"chronic-inflammation","terms":["inflammaging","inflammageing","chronic inflammation"],"requires_ageing_context":true},
    {"slug":"microbiome-dysbiosis","terms":["microbiome","dysbiosis","gut microbiota"],"requires_ageing_context":true},
    {"slug":"nad-metabolism","terms":["nad+","nad metabolism","nicotinamide riboside","nicotinamide mononucleotide","nmn"],"requires_ageing_context":true},
    {"slug":"sirtuins","terms":["sirtuin","sirt1","sirt3","sirt6"],"requires_ageing_context":true},
    {"slug":"spermidine","terms":["spermidine"],"requires_ageing_context":true},
    {"slug":"urolithin-a","terms":["urolithin a","urolithin-a"],"requires_ageing_context":true},
    {"slug":"taurine","terms":["taurine"],"requires_ageing_context":true},
    {"slug":"glycine-glynac","terms":["glycine","glynac","glycine n-acetylcysteine"],"requires_ageing_context":true},
    {"slug":"alpha-ketoglutarate","terms":["alpha-ketoglutarate","alpha ketoglutarate","akg"],"requires_ageing_context":true},
    {"slug":"acarbose","terms":["acarbose"],"requires_ageing_context":true},
    {"slug":"canagliflozin","terms":["canagliflozin","sglt2 inhibitor","sglt-2 inhibitor"],"requires_ageing_context":true},
    {"slug":"17alpha-estradiol","terms":["17alpha-estradiol","17-alpha estradiol","17 estradiol"],"requires_ageing_context":true},
    {"slug":"ketogenic-diets","terms":["ketogenic diet","ketosis","ketone body"],"requires_ageing_context":true},
    {"slug":"protein-restriction","terms":["protein restriction","methionine restriction","amino acid restriction","bcaa restriction"],"requires_ageing_context":true},
    {"slug":"young-blood-parabiosis","terms":["parabiosis","young blood","young plasma","circulating factors"],"requires_ageing_context":true},
    {"slug":"heat-cold-hormesis","terms":["hormesis","sauna","heat exposure","cold exposure","heat shock protein"],"requires_ageing_context":true},
    {"slug":"frailty","terms":["frailty","frailty index"],"requires_ageing_context":true},
    {"slug":"sarcopenia","terms":["sarcopenia","muscle aging","muscle ageing"],"requires_ageing_context":true},
    {"slug":"cognitive-aging","terms":["cognitive aging","cognitive ageing","brain aging","brain ageing"],"requires_ageing_context":true},
    {"slug":"cardiovascular-aging","terms":["cardiovascular aging","cardiovascular ageing","vascular aging","vascular ageing","arterial stiffness"],"requires_ageing_context":true},
    {"slug":"immune-aging","terms":["immunosenescence","immune aging","immune ageing","immune resilience"],"requires_ageing_context":true},
    {"slug":"ovarian-aging","terms":["ovarian aging","ovarian ageing","reproductive longevity","ovarian reserve"],"requires_ageing_context":true},
    {"slug":"longevity-genetics","terms":["longevity gene","longevity genetics","exceptional longevity","lifespan genetics"],"requires_ageing_context":true},
    {"slug":"centenarian-biology","terms":["centenarian","supercentenarian","exceptional longevity"],"requires_ageing_context":false},
    {"slug":"biological-age-biomarkers","terms":["biological age","aging biomarker","ageing biomarker","pace of aging","pace of ageing"],"requires_ageing_context":true},
    {"slug":"proteomic-aging","terms":["proteomic aging","proteomic ageing","proteomic clock","protein aging signature"],"requires_ageing_context":false},
    {"slug":"metabolomic-aging","terms":["metabolomic aging","metabolomic ageing","metabolomic clock","metabolic age"],"requires_ageing_context":false},
    {"slug":"transcriptomic-aging","terms":["transcriptomic aging","transcriptomic ageing","transcriptomic clock","gene expression age"],"requires_ageing_context":false},
    {"slug":"single-cell-aging","terms":["single-cell aging","single cell aging","single-cell ageing","single cell ageing"],"requires_ageing_context":false},
    {"slug":"multi-omics-aging","terms":["multi-omics aging","multiomics aging","multi-omics ageing","multiomic ageing"],"requires_ageing_context":false},
    {"slug":"rna-splicing-aging","terms":["rna splicing","alternative splicing","spliceosome"],"requires_ageing_context":true},
    {"slug":"clonal-hematopoiesis","terms":["clonal hematopoiesis","clonal haematopoiesis","chip"],"requires_ageing_context":true},
    {"slug":"extracellular-matrix-aging","terms":["extracellular matrix","mechanobiology","tissue stiffness","fibrosis"],"requires_ageing_context":true},
    {"slug":"glycation-ages","terms":["advanced glycation end product","glycation","age crosslink"],"requires_ageing_context":true},
    {"slug":"oxidative-stress","terms":["oxidative stress","redox homeostasis","reactive oxygen species"],"requires_ageing_context":true},
    {"slug":"ferroptosis-aging","terms":["ferroptosis","iron-dependent cell death"],"requires_ageing_context":true},
    {"slug":"cell-competition","terms":["cell competition","fitness selection"],"requires_ageing_context":true},
    {"slug":"senescence-sasp","terms":["sasp","senescence-associated secretory phenotype","senomorphic"],"requires_ageing_context":true},
    {"slug":"thymic-aging","terms":["thymic aging","thymic ageing","thymic involution","thymic regeneration"],"requires_ageing_context":false},
    {"slug":"hematopoietic-stem-cell-aging","terms":["hematopoietic stem cell aging","haematopoietic stem cell ageing","aged hematopoietic stem cell"],"requires_ageing_context":false},
    {"slug":"neuroinflammation","terms":["neuroinflammation"],"requires_ageing_context":true},
    {"slug":"blood-brain-barrier-aging","terms":["blood-brain barrier","neurovascular"],"requires_ageing_context":true},
    {"slug":"glymphatic-clearance","terms":["glymphatic","brain waste clearance"],"requires_ageing_context":true},
    {"slug":"kidney-aging","terms":["kidney aging","kidney ageing","renal aging","renal ageing"],"requires_ageing_context":false},
    {"slug":"liver-aging","terms":["liver aging","liver ageing","hepatic aging","hepatic ageing"],"requires_ageing_context":false},
    {"slug":"lung-aging","terms":["lung aging","lung ageing","pulmonary aging","pulmonary ageing"],"requires_ageing_context":false},
    {"slug":"skin-aging","terms":["skin aging","skin ageing","photoaging","photoageing"],"requires_ageing_context":true},
    {"slug":"bone-aging","terms":["bone aging","bone ageing","osteoporosis","skeletal aging"],"requires_ageing_context":true},
    {"slug":"joint-cartilage-aging","terms":["cartilage aging","cartilage ageing","osteoarthritis","joint aging"],"requires_ageing_context":true},
    {"slug":"vision-aging","terms":["vision aging","vision ageing","retinal aging","ocular aging","age-related macular degeneration"],"requires_ageing_context":false},
    {"slug":"hearing-aging","terms":["age-related hearing loss","presbycusis","hearing aging","hearing ageing"],"requires_ageing_context":false},
    {"slug":"oral-health-aging","terms":["oral health","periodontitis","edentulism"],"requires_ageing_context":true},
    {"slug":"cancer-and-aging","terms":["cancer","tumor","tumour"],"requires_ageing_context":true},
    {"slug":"multimorbidity","terms":["multimorbidity","multiple chronic conditions"],"requires_ageing_context":true},
    {"slug":"physiological-resilience","terms":["physiological resilience","physical resilience","recovery resilience"],"requires_ageing_context":true},
    {"slug":"circadian-rhythms","terms":["circadian rhythm","chronobiology","circadian clock"],"requires_ageing_context":true},
    {"slug":"time-restricted-eating","terms":["time-restricted eating","time restricted feeding","early time-restricted"],"requires_ageing_context":true},
    {"slug":"mediterranean-diet","terms":["mediterranean diet","mediterranean dietary pattern"],"requires_ageing_context":true},
    {"slug":"resistance-training","terms":["resistance training","strength training"],"requires_ageing_context":true},
    {"slug":"aerobic-fitness","terms":["cardiorespiratory fitness","aerobic fitness","vo2 max","vo2max"],"requires_ageing_context":true},
    {"slug":"digital-biomarkers","terms":["digital biomarker","wearable","passive sensing"],"requires_ageing_context":true},
    {"slug":"regenerative-medicine","terms":["regenerative medicine","tissue engineering","organoid","biomaterial"],"requires_ageing_context":true}
  ]
  $profiles$::jsonb) as profile(slug text, terms text[], requires_ageing_context boolean)
)
update public.intelligence_topics topic
set matching_terms = profiles.terms,
    requires_ageing_context = profiles.requires_ageing_context,
    updated_at = now()
from profiles
where topic.slug = profiles.slug;

do $$
declare
  enabled_count integer;
  incomplete_count integer;
begin
  select count(*), count(*) filter (where cardinality(matching_terms) = 0)
  into enabled_count, incomplete_count
  from public.intelligence_topics
  where enabled;
  if enabled_count <> 180 then
    raise exception 'Expected 180 enabled topics, found %', enabled_count;
  end if;
  if incomplete_count <> 0 then
    raise exception 'Every enabled topic must have a controlled matching profile; % remain empty', incomplete_count;
  end if;
end
$$;

-- The previous pass evaluated part of research and all trials while the 82
-- profiles above were empty. Restart both resumable cursors so every retained
-- record is evaluated against the same complete 180-topic taxonomy.
update public.topic_taxonomy_reindex_runs
set taxonomy_version = 'longevity-taxonomy-180-v2',
    status = 'pending',
    cursor_id = 0,
    upper_bound_id = case entity_kind
      when 'research' then coalesce((select max(id) from public.research_items), 0)
      else coalesce((select max(id) from public.clinical_trials), 0)
    end,
    records_processed = 0,
    started_at = now(),
    completed_at = null,
    last_error = null,
    updated_at = now()
where taxonomy_version = 'longevity-taxonomy-180-v1';

do $schedule$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'immortal-life-trial-taxonomy-reindex' limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'immortal-life-trial-taxonomy-reindex', '* * * * *',
    $job$select public.process_trial_taxonomy_reindex(400);$job$
  );
end
$schedule$;

select public.refresh_topic_coverage_readiness();
select public.process_trial_taxonomy_reindex(400);
select public.process_priority_topic_taxonomy_reindex();

notify pgrst, 'reload schema';
