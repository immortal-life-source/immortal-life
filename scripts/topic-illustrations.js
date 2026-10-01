'use strict';

function hashText(value) {
  return [...String(value)].reduce((hash, character) => ((hash * 33) ^ character.charCodeAt(0)) >>> 0, 5381);
}

const motifRules = [
  ['clock', /clock|circadian|biological-age|glycan|retinal-age|brain-age|organ-specific-age/],
  ['sleep', /sleep|glymphatic/],
  ['movement', /exercise|training|fitness|walking|gait|mobility|falls|frailty|sarcopenia|grip-strength|sedentary|resilience/],
  ['heart', /heart|cardiovascular|endothelial|vascular|blood-brain-barrier|heart-rate/],
  ['brain', /brain|cognitive|mental-health|neuro|whole-brain|loneliness|social-connection/],
  ['eye', /vision|retinal/],
  ['ear', /hearing|vestibular/],
  ['lung', /lung|air-pollution/],
  ['kidney', /kidney|bladder|urinary/],
  ['liver', /liver/],
  ['bone', /bone|joint|cartilage|skeletal|chronic-pain/],
  ['skin', /skin|hair-follicle/],
  ['reproductive', /ovarian|male-reproductive|sex-differences/],
  ['gut', /gut|microbiome|probiotic|prebiotic|dietary-fiber/],
  ['immune', /immune|thymic|vaccination|inflammaging|hematopoietic|clonal-haematopoiesis|clonal-hematopoiesis/],
  ['inflammation', /inflammation|anti-inflammatory|senescence-associated-secretory|oxidative-stress|ferroptosis/],
  ['mitochondria', /mitochond|cellular-energetics|urolithin/],
  ['protein', /proteostasis|protein|translation-fidelity|rna-splicing|endoplasmic-reticulum/],
  ['recycle', /autophagy|lysosomal/],
  ['chromosome', /telomere|genomic-instability|somatic-mosaicism|transposable|nuclear-architecture/],
  ['dna', /gene|genetic|genomic|epigenetic|crispr|reprogramming|dna/],
  ['stem', /stem-cell|regenerative|bioprinting|xenotransplant|replacement|transplantation|cell-competition/],
  ['blood', /blood|plasma|parabiosis/],
  ['nutrition', /caloric|diet|fasting|nutrition|eating|amino-acid|omega-3|vitamin|magnesium|creatine|polyphenol|taurine|glycine|spermidine|ketogenic/],
  ['medicine', /rapamycin|metformin|glp-1|acarbose|canagliflozin|estradiol|fisetin|dasatinib|quercetin|resveratrol|gerotherap|enhancer|inhibition|peptide|combination|klotho/],
  ['metabolism', /metabolism|nutrient-sensing|sirtuin|nad-|alpha-ketoglutarate|glycation|lipid|calcium|iron|adipose|pancreatic|endocrine/],
  ['cell', /senolytic|senescent|single-cell|intercellular|cellular/],
  ['omics', /proteomic|metabolomic|transcriptomic|multi-omics|biomarker|homeostatic-dysregulation|digital/],
  ['cancer', /cancer|tumou?r|car-t/],
  ['cryo', /cryo|biostasis/],
  ['environment', /exposome|pollution|light-exposure|heat-cold|hormesis|smoking|alcohol/],
  ['society', /life-expectancy|lifespan-inequality|socioeconomic|blue-zones|life-course|ageism|multimorbidity|disability|activities-daily|compression-of-morbidity|preventive-gerontology|centenarian/],
];

function motifForTopic(topic) {
  const text = `${topic.slug} ${topic.name} ${topic.description || ''}`.toLowerCase();
  return motifRules.find(([, pattern]) => pattern.test(text))?.[0] || 'network';
}

function motifMarkup(motif) {
  const common = 'fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"';
  const shapes = {
    clock: `<circle cx="0" cy="0" r="88" ${common}/><path d="M0-58V2L42 28M0-88V-110M88 0h22M0 88v22M-88 0h-22" ${common}/><path d="M-34-120Q0-142 34-120" ${common}/>` ,
    sleep: `<path d="M48-92A105 105 0 1 0 94 49A84 84 0 0 1 48-92Z" ${common}/><path d="M92-92l8 20 20 8-20 8-8 20-8-20-20-8 20-8Z" ${common}/>` ,
    movement: `<circle cx="-34" cy="-86" r="24" ${common}/><path d="M-28-60L4-8l45 18M4-8l-54 26-34 68M4-8l16 63 58 42M-92 20h44l20-28 28 55 24-34h72" ${common}/>` ,
    heart: `<path d="M0 96C-24 67-91 28-91-34c0-69 83-78 91-18 8-60 91-51 91 18C91 28 24 67 0 96Z" ${common}/><path d="M-111 5h47l18-35 33 72 24-49h38l15-25 18 37h35" ${common}/>` ,
    brain: `<path d="M-5 101V-96M-8-83c-28-42-88-18-77 26-39 9-38 65 1 76-14 48 39 75 70 45M8-83c28-42 88-18 77 26 39 9 38 65-1 76 14 48-39 75-70 45M-56-47c20-9 36 2 43 20M54-44C33-52 19-38 11-20M-61 30c24 14 39 5 49-10M61 31c-24 13-39 5-49-11" ${common}/>` ,
    eye: `<path d="M-116 0Q0-103 116 0Q0 103-116 0Z" ${common}/><circle cx="0" cy="0" r="42" ${common}/><circle cx="0" cy="0" r="13" ${common}/>` ,
    ear: `<path d="M37 91c-8 26-56 24-58-8-3-45 48-44 48-88 0-34-53-48-76-18-24 31-9 84 20 91M-8 36c-4-25 28-26 30-51 2-21-22-32-37-21" ${common}/>` ,
    lung: `<path d="M0-103v89M-4-14c-18-35-46-64-69-56-28 10-36 93-27 134 9 39 65 27 88 4M4-14c18-35 46-64 69-56 28 10 36 93 27 134-9 39-65 27-88 4M-2-46l-39 31M2-46l39 31" ${common}/>` ,
    kidney: `<path d="M-21-82C-85-105-113-30-93 29c13 39 56 61 85 24 18-23-6-51-30-38M21-82C85-105 113-30 93 29 80 68 37 90 8 53-10 30 14 2 38 15M-3 47v64M3 47v64" ${common}/>` ,
    liver: `<path d="M-105-35C-52-89 48-84 101-42c29 23 16 61-18 72-49 16-116 13-164-3-30-10-41-39-24-62ZM-10-61c7 35 31 59 73 72" ${common}/>` ,
    bone: `<path d="M-78-77c-25-23-55 8-33 32l21 20 112 112 20 21c24 22 55-8 32-33 25 23 55-8 33-32L86 23-26-89-46-110c-24-22-55 8-32 33Z" ${common}/>` ,
    skin: `<path d="M-115-52C-65-83-18-21 28-55c41-30 65-13 87 5M-115-4C-65-35-18 27 28-7c41-30 65-13 87 5M-115 45C-65 14-18 76 28 42c41-30 65-13 87 5M-78-78v137M0-90v152M77-74v137" ${common}/>` ,
    reproductive: `<circle cx="-22" cy="-17" r="68" ${common}/><path d="M27 32l66 66M55 98h38V60M-71-66l-41-41M-112-66v-41h41" ${common}/>` ,
    gut: `<path d="M-68-89c-37 7-42 53-7 66-39 17-29 71 12 72-22 36 20 69 53 46 28 31 73 7 59-31 43-7 46-64 7-78 31-30 1-81-38-65-14-31-59-36-86-10ZM-42-49c31 9 25 44-6 48 34 4 42 42 12 57M31-55c-30 11-27 44 4 48-34 6-38 44-7 57" ${common}/>` ,
    immune: `<path d="M0-112c35 25 70 34 101 39 0 83-27 139-101 174C-74 66-101 10-101-73-70-78-35-87 0-112Z" ${common}/><path d="M0-65v118M-59-6H59" ${common}/>` ,
    inflammation: `<path d="M12-112c11 48-30 53-19 91 12-29 44-36 54-67 43 48 65 89 47 133-19 48-69 70-112 52-48-20-66-77-39-121 10 38 32 45 43 65-3-55 37-79 26-153Z" ${common}/>` ,
    mitochondria: `<path d="M-113 9c0-62 51-101 112-101 62 0 112 39 112 101S61 101-1 101c-61 0-112-30-112-92Z" ${common}/><path d="M-82 11c26-56 48 59 78 0S43 70 75 5" ${common}/><circle cx="-43" cy="-46" r="8" ${common}/><circle cx="43" cy="50" r="8" ${common}/>` ,
    protein: `<path d="M-104-61c24-38 58 7 27 32-35 28-2 72 31 42 39-36 79 21 38 51-34 25 12 69 47 29 33-38 74 7 56 42M-63-93c34 28 48-13 81 5 32 18 16 53 47 62 29 9 47-25 70-7" ${common}/><circle cx="-104" cy="-61" r="9" ${common}/><circle cx="95" cy="135" r="9" ${common}/>` ,
    recycle: `<path d="M-13-103c42-8 83 15 102 52l20-13-6 57-56-13 21-13C55-55 32-68 7-64M94 35c-12 39-47 67-89 69l3 25-48-32 39-42 3 23c25-2 46-18 54-41M-66 64c-31-28-42-71-25-110l-23-9 52-24 20 54-22-9c-8 24-1 49 17 65" ${common}/>` ,
    chromosome: `<path d="M-69-104c58 39 58 167 0 208M69-104C11-65 11 65 69 104M-48-84l96 168M48-84l-96 168" ${common}/><circle cx="0" cy="0" r="19" ${common}/>` ,
    dna: `<path d="M-64-113C48-60 48 60-64 113M64-113C-48-60-48 60 64 113M-38-87h76M-61-44H61M-70 0H70M-61 44H61M-38 87h76" ${common}/>` ,
    stem: `<circle cx="0" cy="-49" r="45" ${common}/><circle cx="-71" cy="54" r="36" ${common}/><circle cx="71" cy="54" r="36" ${common}/><path d="M0-4v35M0 31l-48 8M0 31l48 8M-92 54h42M50 54h42" ${common}/>` ,
    blood: `<path d="M0-118C-24-77-75-24-75 30c0 45 34 78 75 78s75-33 75-78c0-54-51-107-75-148Z" ${common}/><path d="M-35 31c10 27 29 41 57 38M-119-11h40M79-11h40M-104-31l25 20-25 20M104-31L79-11l25 20" ${common}/>` ,
    nutrition: `<circle cx="0" cy="14" r="94" ${common}/><path d="M0-80v188M-94 14H94M-62-56c34 28 34 112 0 140M62-56c-34 28-34 112 0 140M71-99c-36 4-57 25-61 61 36-4 57-25 61-61Z" ${common}/>` ,
    medicine: `<path d="M-82-69a49 49 0 0 1 69 0L82 26a49 49 0 0 1-69 69L-82 0a49 49 0 0 1 0-69ZM-48 34 34-48" ${common}/><path d="M-103 96h76M-65 58v76" ${common}/>` ,
    metabolism: `<path d="M0-104 90-52v104L0 104-90 52V-52Z" ${common}/><circle cx="0" cy="0" r="38" ${common}/><path d="M0-104V-38M90-52 33-19M90 52 33 19M0 104V38M-90 52l57-33M-90-52l57 33" ${common}/>` ,
    cell: `<circle cx="0" cy="0" r="104" ${common}/><circle cx="15" cy="-3" r="42" ${common}/><path d="M-73-40c26 13 23 34 1 52M72-37c-28 8-33 30-15 51M-54 64c21-17 46-12 59 8" ${common}/><circle cx="27" cy="-13" r="9" ${common}/>` ,
    omics: `<path d="M-104 91V33M-60 91V-17M-16 91V-72M28 91V-40M72 91V-94M116 91V9M-125 91H126" ${common}/><circle cx="-60" cy="-17" r="8" ${common}/><circle cx="28" cy="-40" r="8" ${common}/><circle cx="116" cy="9" r="8" ${common}/>` ,
    cancer: `<path d="M-83-50c7-42 56-64 88-35 31-25 79-4 75 37 38 14 39 67 4 85 5 43-43 67-76 41-31 31-83 13-88-29-41-10-44-68-3-84Z" ${common}/><path d="M-41-23 0 0l39-31M0 0l8 49M0 0l-52 35" ${common}/><circle cx="0" cy="0" r="14" ${common}/>` ,
    cryo: `<path d="M0-116V116M-101-58 101 58M-101 58 101-58M0-116l-18 22M0-116l18 22M101-58l-28-4M101-58l-10 27M101 58 73 62M101 58 91 31M0 116l-18-22M0 116l18-22M-101 58l28 4M-101 58l10-27M-101-58l28-4M-101-58l10 27" ${common}/>` ,
    environment: `<circle cx="-40" cy="-37" r="51" ${common}/><path d="M-40-116v-27M-40 42v27M-119-37h-27M39-37h27M-96-93l-20-20M16 16l20 20M16-93l20-20M-96 16l-20 20M-79 83c21-31 55-30 76-4 22-46 91-29 93 24H-91c-4-8 0-17 12-20Z" ${common}/>` ,
    society: `<circle cx="0" cy="-62" r="32" ${common}/><circle cx="-81" cy="20" r="26" ${common}/><circle cx="81" cy="20" r="26" ${common}/><path d="M-26-44-61 0M26-44 61 0M-55 24H55M0-29v102M-81 46v48M81 46v48M-113 94h226" ${common}/>` ,
    network: `<circle cx="0" cy="0" r="28" ${common}/><circle cx="-91" cy="-57" r="20" ${common}/><circle cx="91" cy="-57" r="20" ${common}/><circle cx="-75" cy="77" r="20" ${common}/><circle cx="80" cy="73" r="20" ${common}/><path d="M-25-14-73-45M25-14 73-45M-20 21-59 62M21 20l43 40M-71-37l-5 94M73-38l3 91" ${common}/>` ,
  };
  return shapes[motif] || shapes.network;
}

function topicIllustrationSvg(topic) {
  const motif = motifForTopic(topic);
  const hash = hashText(topic.slug);
  const nodes = Array.from({ length: 7 }, (_, index) => {
    const angle = ((hash >>> (index * 3)) % 360) * Math.PI / 180;
    const radius = 150 + ((hash >>> (index * 2 + 5)) % 78);
    const x = Math.round(430 + Math.cos(angle) * radius);
    const y = Math.round(235 + Math.sin(angle) * radius * .62);
    const size = 4 + ((hash >>> (index + 11)) % 7);
    return `<circle cx="${x}" cy="${y}" r="${size}"/>`;
  }).join('');
  const arcs = Array.from({ length: 3 }, (_, index) => {
    const offset = (hash >>> (index * 5)) % 44;
    return `<ellipse cx="430" cy="235" rx="${178 + offset}" ry="${86 + offset / 2}" transform="rotate(${(hash % 34) - 17 + index * 37} 430 235)"/>`;
  }).join('');
  return `<div class="topic-hero-art topic-hero-art--${motif}" data-topic-motif="${motif}" aria-hidden="true"><svg viewBox="0 0 860 470" focusable="false"><g class="topic-art-orbits">${arcs}</g><g class="topic-art-nodes">${nodes}</g><g class="topic-art-motif" transform="translate(430 235) rotate(${(hash % 15) - 7})">${motifMarkup(motif)}</g></svg></div>`;
}

module.exports = { motifForTopic, topicIllustrationSvg };
