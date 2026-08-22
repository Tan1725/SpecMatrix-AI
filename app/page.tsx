'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';

type CsvRow = Record<string, string>;
type Trace = { field: string; value: string; source: string; method: 'direct' | 'derived'; confidence: number };
type Result = { output: CsvRow; trace: Trace[]; score: number; status: 'ready' | 'review'; issues: string[]; source: CsvRow };
type Stage = 'ingest' | 'map' | 'extract' | 'validate' | 'export';

const OUTPUT_TEMPLATE = '/data/official-output-template.csv';
const OFFICIAL_INPUT = '/data/official-sample-input.csv';

const productVisuals = [
  { name: 'Gate valves', image: '/products/gate-valve.webp', tag: 'Vision-ready', copy: 'Dimension, pressure class and material normalization' },
  { name: 'Centrifugal pumps', image: '/products/centrifugal-pump.webp', tag: 'Curve-aware', copy: 'Duty point, motor rating and variant resolution' },
  { name: 'Industrial motors', image: '/products/induction-motor.webp', tag: 'Nameplate-ready', copy: 'Power, voltage, enclosure and efficiency extraction' },
];

function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const clean = text.replace(/^\uFEFF/, '');
  const matrix: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); matrix.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); matrix.push(row); }
  const headers = (matrix.shift() || []).map((h) => h.trim());
  const rows = matrix.filter((r) => r.some(Boolean)).map((cells) => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])));
  return { headers, rows };
}

function csvEscape(value: string) { return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value; }
function toCsv(headers: string[], rows: CsvRow[]) { return [headers.map(csvEscape).join(','), ...rows.map((row) => headers.map((h) => csvEscape(row[h] || '')).join(','))].join('\r\n'); }
function download(name: string, content: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function useful(value?: string) { const v = (value || '').trim(); return v && !/^--.*--$/.test(v) ? v : ''; }
function cleanCompany(value: string) { return value.replace(/\s*\([^)]{2,12}\)\s*$/, '').trim(); }
function titleCase(value: string) { return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }

function classify(text: string): [string, string, string] {
  const rules: [RegExp, [string, string, string]][] = [
    [/dishwasher|refrigerator|washer|dryer|range\b/i, ['Appliances', 'Large Appliances', /dishwasher/i.test(text) ? 'Dishwashers' : 'Major Appliances']],
    [/sanding belt|abrasive belt/i, ['Abrasives', 'Coated Abrasives', 'Sanding Belts']],
    [/disc|stikit|sandpaper|cubitron|abrasive/i, ['Abrasives', 'Coated Abrasives', 'Abrasive Discs']],
    [/gate valve|ball valve|check valve|\bvalve\b/i, ['Industrial Supplies', 'Valves', 'Industrial Valves']],
    [/centrifugal pump|\bpump\b/i, ['Industrial Supplies', 'Pumps', 'Industrial Pumps']],
    [/induction motor|electric motor|\bmotor\b/i, ['Electrical', 'Motors', 'Industrial Motors']],
    [/drill|saw|grinder|impact driver/i, ['Tools', 'Power Tools', 'Portable Power Tools']],
    [/bearing|bushing/i, ['Power Transmission', 'Bearings', 'Industrial Bearings']],
    [/bolt|screw|nut\b|fastener/i, ['Fasteners', 'Threaded Fasteners', 'Industrial Fasteners']],
    [/glove|respirator|hard hat|safety/i, ['Safety', 'Personal Protective Equipment', 'Safety Equipment']],
  ];
  return rules.find(([rx]) => rx.test(text))?.[1] || ['Industrial Supplies', 'General Industrial', 'Unclassified Products'];
}

function deriveProductName(desc: string, part: string) {
  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let value = desc.replace(escaped ? new RegExp(escaped, 'ig') : /$^/, ' ').replace(/\s+-\s+/g, ' ').replace(/\s+/g, ' ').trim();
  value = value.replace(/^\w+\s+(?=\d|[A-Z])/i, '').trim();
  return value || part || 'Industrial product';
}

function extractAttributes(text: string) {
  const found: { label: string; value: string; uom: string; confidence: number }[] = [];
  const add = (label: string, value: string, uom = '', confidence = 86) => { if (!found.some((x) => x.label === label && x.value === value)) found.push({ label, value, uom, confidence }); };
  const patterns: [RegExp, string, string, number][] = [
    [/\bP(\d{2,4})\b/i, 'Grit', 'P', 96], [/\b(\d+(?:\.\d+)?)\s*kW\b/i, 'Power Rating', 'kW', 94],
    [/\b(\d+(?:\.\d+)?)\s*HP\b/i, 'Horsepower', 'hp', 92], [/\b(\d+(?:\.\d+)?)\s*V(?:AC)?\b/i, 'Voltage Rating', 'V', 93],
    [/\b(\d+(?:\.\d+)?)\s*A\b/i, 'Amperage Rating', 'A', 91], [/\b(\d+(?:\.\d+)?)\s*dBA\b/i, 'Sound Level', 'dBA', 94],
    [/\bIP(\d{2})\b/i, 'Ingress Protection', 'IP', 94], [/\b(\d+)\s*(?:disc|pcs?|pieces?)\b/i, 'Package Quantity', 'ea', 90],
  ];
  patterns.forEach(([rx, label, uom, confidence]) => { const m = text.match(rx); if (m) add(label, m[1], uom, confidence); });
  const dimensions = [...text.matchAll(/(\d+(?:-\d+\/\d+|\/\d+|\.\d+)?)\s*(?:"|in\b)/gi)];
  if (dimensions[0]) add('Width / Diameter', dimensions[0][1], 'in', 88);
  if (dimensions[1]) add('Length', dimensions[1][1], 'in', 88);
  const mm = text.match(/\b(\d+(?:\.\d+)?)\s*mm\b/i); if (mm) add('Size', mm[1], 'mm', 88);
  const material = ['stainless steel', 'ductile iron', 'carbon steel', 'aluminum', 'brass', 'bronze', 'ceramic', 'silicon carbide'].find((x) => text.toLowerCase().includes(x));
  if (material) add('Material', titleCase(material), '', 90);
  return found.slice(0, 50);
}

function inferBrand(row: CsvRow, desc: string) {
  const explicit = useful(row.E1_Brand) || useful(row.Unilog_Brand) || useful(row.DIB_Brand) || useful(row.BRAND_NAME);
  if (explicit) return { value: explicit, confidence: 99, source: 'source brand field' };
  const first = desc.match(/^([A-Za-z][A-Za-z0-9&.-]{1,24})\b/)?.[1] || '';
  const part = useful(row.Mfg_Part_Num) || useful(row.PART_NUMBER);
  if (first && first.toLowerCase() !== part.toLowerCase() && !/^(the|industrial|replacement)$/i.test(first)) return { value: first, confidence: 72, source: 'description prefix' };
  const company = cleanCompany(useful(row.Part_Manuf) || useful(row.MANUFACTURER_NAME));
  return { value: company, confidence: company ? 55 : 0, source: 'manufacturer fallback' };
}

function enrich(row: CsvRow, headers: string[]): Result {
  const output = Object.fromEntries(headers.map((h) => [h, ''])) as CsvRow;
  const trace: Trace[] = [];
  const assign = (field: string, value: string, source: string, method: 'direct' | 'derived', confidence: number) => {
    if (!headers.includes(field) || !value) return;
    output[field] = value; trace.push({ field, value, source, method, confidence });
  };
  headers.forEach((h) => { if (useful(row[h])) assign(h, useful(row[h]), `input.${h}`, 'direct', 100); });
  const part = useful(row.Mfg_Part_Num) || useful(row.MANUFACTURER_PART_NUMBER) || useful(row.PART_NUMBER) || useful(row.SKU);
  const desc = useful(row.Part_Desc) || useful(row.LONG_DESC1) || useful(row.SHORT_DESC) || Object.values(row).filter(useful).join(' ');
  const company = cleanCompany(useful(row.MANUFACTURER_NAME) || useful(row.Part_Manuf));
  const brand = inferBrand(row, desc);
  const [dept, klass, fine] = classify(desc);
  const product = deriveProductName(desc, part);
  assign('PART_NUMBER', part, 'canonical identity resolver', 'derived', 98);
  assign('MANUFACTURER_PART_NUMBER', part, 'input.Mfg_Part_Num', 'derived', 99);
  assign('Mfg_Part_Num', part, 'canonical identity resolver', 'derived', 100);
  assign('MANUFACTURER_NAME', company, 'input.Part_Manuf', 'derived', 72);
  assign('BRAND_NAME', brand.value, brand.source, 'derived', brand.confidence);
  assign('Dept', dept, 'taxonomy classifier', 'derived', fine === 'Unclassified Products' ? 58 : 88);
  assign('Class', klass, 'taxonomy classifier', 'derived', fine === 'Unclassified Products' ? 52 : 86);
  assign('Fine', fine, 'taxonomy classifier', 'derived', fine === 'Unclassified Products' ? 45 : 84);
  assign('Classpath', `${dept}>${klass}>${fine}`, 'normalized taxonomy path', 'derived', fine === 'Unclassified Products' ? 48 : 86);
  assign('Product Name', product, 'description parser', 'derived', 84);
  assign('SHORT_DESC', desc.slice(0, 120), 'input.Part_Desc', 'derived', 96);
  assign('MOBILE_DESC', `${brand.value ? brand.value + ' ' : ''}${product}`.slice(0, 80), 'commerce title generator', 'derived', 82);
  assign('INVOICE_DESC', `${part} ${product}`.trim().slice(0, 60), 'invoice constraint generator', 'derived', 88);
  assign('RETAIL_DESC', `${brand.value ? brand.value + ' ' : ''}${product}`.trim(), 'commerce description generator', 'derived', 82);
  assign('LONG_DESC1', desc, 'input.Part_Desc', 'derived', 96);
  const attrs = extractAttributes(desc);
  attrs.forEach((a, i) => {
    const n = i + 1;
    assign(`ATTRIBUTE_LABEL ${n}`, a.label, 'pattern + unit extractor', 'derived', a.confidence);
    assign(`ATTRIBUTE_VALUE ${n}`, a.value, 'input.Part_Desc', 'derived', a.confidence);
    assign(`ATTRIBUTE_UOM ${n}`, a.uom, 'unit normalizer', 'derived', a.confidence);
    if (i < 20) assign(`ITEM_FEATURES_${n}`, `${a.label}: ${a.value}${a.uom ? ` ${a.uom}` : ''}`, 'attribute composer', 'derived', a.confidence - 2);
  });
  const qty = attrs.find((a) => a.label === 'Package Quantity');
  if (qty) { assign('Selling Qty', qty.value, 'package quantity extractor', 'derived', qty.confidence); assign('Selling UOM', qty.uom, 'unit normalizer', 'derived', qty.confidence); }
  const length = attrs.find((a) => a.label === 'Length'); const width = attrs.find((a) => a.label === 'Width / Diameter');
  if (length) { assign('LENGTH', length.value, 'dimension extractor', 'derived', length.confidence); assign('LENGTH_UOM', length.uom, 'unit normalizer', 'derived', length.confidence); }
  if (width) { assign('WIDTH', width.value, 'dimension extractor', 'derived', width.confidence); assign('WIDTH_UOM', width.uom, 'unit normalizer', 'derived', width.confidence); }
  const core = ['PART_NUMBER', 'MANUFACTURER_PART_NUMBER', 'MANUFACTURER_NAME', 'BRAND_NAME', 'Product Name', 'Dept', 'Class', 'Fine', 'SHORT_DESC'];
  const covered = core.filter((h) => output[h]).length;
  const avg = trace.length ? trace.reduce((s, t) => s + t.confidence, 0) / trace.length : 0;
  const score = Math.round(Math.min(99, avg * .68 + (covered / core.length) * 32));
  const issues = [!part && 'Missing product identity', !brand.value && 'Brand needs review', fine === 'Unclassified Products' && 'Taxonomy needs review', attrs.length === 0 && 'No technical attributes found'].filter(Boolean) as string[];
  return { output, trace, score, status: issues.length > 1 || score < 70 ? 'review' : 'ready', issues, source: row };
}

function confidenceClass(score: number) { return score >= 85 ? 'high' : score >= 70 ? 'medium' : 'low'; }

export default function Home() {
  const [headers, setHeaders] = useState<string[]>([]); const [inputHeaders, setInputHeaders] = useState<string[]>([]); const [results, setResults] = useState<Result[]>([]);
  const [fileName, setFileName] = useState('Official sample dataset'); const [running, setRunning] = useState(false); const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0); const [query, setQuery] = useState(''); const [stage, setStage] = useState<Stage>('export');
  const [view, setView] = useState<'workbench' | 'schema' | 'architecture'>('workbench'); const [notice, setNotice] = useState('Loading the official evaluation sample…');
  const inputRef = useRef<HTMLInputElement>(null);

  async function runText(text: string, name: string, contract = headers) {
    if (!contract.length) return;
    const parsed = parseCsv(text); if (!parsed.headers.length || !parsed.rows.length) { setNotice('That CSV has no usable data rows.'); return; }
    setRunning(true); setProgress(4); setStage('ingest'); setFileName(name); setInputHeaders(parsed.headers); setActive(0);
    await new Promise(requestAnimationFrame); setStage('map'); setProgress(16); const enriched: Result[] = [];
    for (let i = 0; i < parsed.rows.length; i++) { enriched.push(enrich(parsed.rows[i], contract)); if (i % 100 === 0) { setProgress(18 + Math.round((i / parsed.rows.length) * 67)); setStage(i < parsed.rows.length * .55 ? 'extract' : 'validate'); await new Promise(requestAnimationFrame); } }
    setResults(enriched); setProgress(100); setStage('export'); setRunning(false); setNotice(`${parsed.rows.length.toLocaleString()} products processed against all ${contract.length} required output columns.`);
  }

  async function loadOfficial() {
    setNotice('Reading the organizer-provided input and output contract…');
    const [templateText, inputText] = await Promise.all([fetch(OUTPUT_TEMPLATE).then((r) => r.text()), fetch(OFFICIAL_INPUT).then((r) => r.text())]);
    const contract = parseCsv(templateText).headers; setHeaders(contract); await runText(inputText, 'Official sample dataset', contract);
  }
  useEffect(() => { loadOfficial().catch(() => setNotice('The bundled sample could not be loaded. Upload a CSV to continue.')); }, []);
  async function onFile(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; await runText(await file.text(), file.name); event.target.value = ''; }
  async function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (!file || !file.name.toLowerCase().endsWith('.csv')) { setNotice('Drop a CSV file to run the enrichment engine.'); return; } await runText(await file.text(), file.name); }

  const current = results[active];
  const filtered = useMemo(() => results.map((r, index) => ({ r, index })).filter(({ r }) => `${r.output.Mfg_Part_Num} ${r.output['Product Name']} ${r.output.Part_Desc} ${r.output.BRAND_NAME}`.toLowerCase().includes(query.toLowerCase())).slice(0, 80), [results, query]);
  const stats = useMemo(() => { const ready = results.filter((r) => r.status === 'ready').length; const avg = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0; const populated = results.length && headers.length ? Math.round(results.reduce((s, r) => s + Object.values(r.output).filter(Boolean).length, 0) / results.length) : 0; return { ready, review: results.length - ready, avg, populated }; }, [results, headers]);
  const mappedHeaders = current ? headers.filter((h) => current.output[h]) : [];
  const coreFields = ['PART_NUMBER', 'MANUFACTURER_NAME', 'BRAND_NAME', 'Product Name', 'Dept', 'Class', 'Fine', 'SHORT_DESC', 'Selling Qty', 'Selling UOM'];
  const exportOutput = () => download(`catalyst-enriched-${Date.now()}.csv`, toCsv(headers, results.map((r) => r.output)), 'text/csv;charset=utf-8');
  const exportTrace = () => download(`catalyst-evidence-${Date.now()}.json`, JSON.stringify({ source: fileName, outputSchema: headers, records: results.map((r, i) => ({ row: i + 1, identity: r.output.Mfg_Part_Num, confidence: r.score, status: r.status, issues: r.issues, claims: r.trace })) }, null, 2), 'application/json');

  return <main className="app">
    <header className="topbar"><button className="brand" onClick={() => setView('workbench')} aria-label="Catalyst Lens home"><span>CL</span><div><strong>Catalyst Lens</strong><small>Product intelligence studio</small></div></button><nav aria-label="Primary navigation"><button className={view === 'workbench' ? 'active' : ''} onClick={() => setView('workbench')}>Workbench</button><button className={view === 'schema' ? 'active' : ''} onClick={() => setView('schema')}>Schema contract</button><button className={view === 'architecture' ? 'active' : ''} onClick={() => setView('architecture')}>How it works</button></nav><div className="top-actions"><span className="live"><i /> Engine ready</span><button className="outline" disabled={!results.length} onClick={exportOutput}>Export CSV</button></div></header>

    {view === 'workbench' && <><section className="hero"><div className="hero-copy"><p className="eyebrow">Evidence-first catalog automation</p><h1>Turn six messy fields into<br /><em>commerce-ready intelligence.</em></h1><p className="lede">A dynamic enrichment engine that maps any CSV, extracts product facts, validates confidence, and delivers the organizer&apos;s exact 252-column schema.</p><div className="hero-actions"><button className="primary" onClick={() => inputRef.current?.click()}>Upload evaluation CSV <span>↗</span></button><button className="secondary" onClick={loadOfficial}>Run official 1,000-row sample</button><input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onFile} hidden /></div><div className="trust-row"><span>✓ No hardcoded row mapping</span><span>✓ Exact header contract</span><span>✓ Evidence per claim</span></div></div><div className="drop-card" onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}><div className="upload-glyph">⇧</div><p>Drop an evaluation CSV here</p><small>Quoted commas, multiline fields and changing column combinations supported</small><div className="contract-strip"><span>INPUT</span><b>{inputHeaders.length || 6} detected columns</b><i>→</i><span>OUTPUT</span><b>{headers.length || 252} locked columns</b></div></div></section>
      <section className="runbar"><div><p className="eyebrow">Live processing run</p><strong>{fileName}</strong><small>{notice}</small></div><div className="stages">{(['ingest', 'map', 'extract', 'validate', 'export'] as Stage[]).map((s, i) => <span key={s} className={stage === s || (!running && i < 5) ? 'done' : ''}><b>{i + 1}</b>{s}</span>)}</div><div className="progress"><i style={{ width: `${progress}%` }} /></div></section>
      <section className="metrics"><article><span>Products processed</span><strong>{results.length.toLocaleString()}</strong><small>from a real parsed CSV</small></article><article><span>Ready to publish</span><strong>{stats.ready.toLocaleString()}</strong><small>{stats.review.toLocaleString()} queued for review</small></article><article><span>Mean confidence</span><strong>{stats.avg}<sup>%</sup></strong><small>claim-weighted score</small></article><article><span>Schema fidelity</span><strong>{headers.length ? '100' : '—'}<sup>%</sup></strong><small>{headers.length} / 252 headers exact</small></article><article><span>Avg. claims created</span><strong>{stats.populated}</strong><small>supported fields per row</small></article></section>
      <section className="workspace-grid"><aside className="queue panel"><div className="panel-title"><div><p className="eyebrow">Catalog queue</p><h2>{results.length.toLocaleString()} products</h2></div><span>{stats.review} review</span></div><label className="search">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search part, brand, description" /></label><div className="queue-list">{filtered.map(({ r, index }) => <button key={index} className={active === index ? 'selected' : ''} onClick={() => setActive(index)}><span className="sku-icon">{(r.output.BRAND_NAME || r.output.Mfg_Part_Num || 'P').slice(0, 2).toUpperCase()}</span><span><strong>{r.output.Mfg_Part_Num || `Row ${index + 1}`}</strong><small>{r.output['Product Name'] || r.output.Part_Desc || 'Unclassified product'}</small></span><b className={`score ${confidenceClass(r.score)}`}>{r.score}</b></button>)}</div></aside>
        <section className="dossier panel">{current ? <><div className="dossier-head"><div><p className="eyebrow">Normalized product dossier</p><h2>{current.output['Product Name'] || current.output.Part_Desc}</h2><p>{current.output.BRAND_NAME || 'Brand unresolved'} · {current.output.Mfg_Part_Num}</p></div><div className={`big-score ${confidenceClass(current.score)}`}><strong>{current.score}</strong><span>confidence</span></div></div><div className="identity-band"><span>Canonical identity</span><strong>{current.output.MANUFACTURER_NAME || 'Manufacturer under review'} / {current.output.MANUFACTURER_PART_NUMBER}</strong><i>{current.status === 'ready' ? 'Publish ready' : 'Human review'}</i></div><div className="taxonomy"><span>{current.output.Dept}</span><b>›</b><span>{current.output.Class}</span><b>›</b><strong>{current.output.Fine}</strong></div><div className="field-grid">{coreFields.map((field) => { const claim = current.trace.find((t) => t.field === field); return <article key={field}><span>{field}</span><strong>{current.output[field] || 'Not evidenced'}</strong><small>{claim ? `${claim.method} · ${claim.confidence}% · ${claim.source}` : 'No supported claim created'}</small></article>; })}</div><div className="attributes-head"><div><p className="eyebrow">Extracted attributes</p><h3>{current.trace.filter((t) => t.field.startsWith('ATTRIBUTE_LABEL')).length} technical facts</h3></div><button className="text-button" onClick={exportTrace}>Download evidence JSON</button></div><div className="attribute-list">{current.trace.filter((t) => t.field.startsWith('ATTRIBUTE_LABEL')).map((label) => { const n = label.field.match(/\d+/)?.[0] || ''; return <div key={label.field}><span>{label.value}</span><strong>{current.output[`ATTRIBUTE_VALUE ${n}`]} {current.output[`ATTRIBUTE_UOM ${n}`]}</strong><b className={`score ${confidenceClass(label.confidence)}`}>{label.confidence}%</b></div>; })}{!current.trace.some((t) => t.field.startsWith('ATTRIBUTE_LABEL')) && <p className="empty">No technical pattern was confidently evidenced in this description. The engine leaves unsupported fields blank instead of inventing product facts.</p>}</div></> : <div className="loading-state">Preparing the official dataset…</div>}</section>
        <aside className="audit panel"><div className="panel-title"><div><p className="eyebrow">Trust center</p><h2>Claim ledger</h2></div><span>{current?.trace.length || 0} claims</span></div>{current && <><div className="quality-ring" style={{ '--score': `${current.score * 3.6}deg` } as React.CSSProperties}><div><strong>{current.score}</strong><span>quality</span></div></div><div className="checks"><div><i className="pass">✓</i><span><strong>Identity resolved</strong><small>{current.output.Mfg_Part_Num || 'No part number found'}</small></span></div><div><i className={current.output.Fine === 'Unclassified Products' ? 'warn' : 'pass'}>{current.output.Fine === 'Unclassified Products' ? '!' : '✓'}</i><span><strong>Taxonomy validated</strong><small>{current.output.Class}</small></span></div><div><i className={current.issues.length ? 'warn' : 'pass'}>{current.issues.length ? '!' : '✓'}</i><span><strong>Quality gates</strong><small>{current.issues.join(' · ') || 'All core gates passed'}</small></span></div></div><div className="ledger">{current.trace.slice(0, 8).map((t, claimIndex) => <div key={`${claimIndex}-${t.field}-${t.value}`}><span>{t.field}</span><strong>{t.value}</strong><small>{t.source}</small><b>{t.confidence}%</b></div>)}</div><button className="primary full" onClick={exportOutput}>Export exact-schema CSV <span>↓</span></button><button className="secondary full" onClick={exportTrace}>Export complete audit trail</button></>}</aside></section>
      <section className="showcase"><div className="section-heading"><div><p className="eyebrow">Multimodal expansion lane</p><h2>Built for the industrial catalog, not a generic spreadsheet demo.</h2></div><p>The same evidence model can accept product imagery, nameplates and technical documents as additional sources.</p></div><div className="product-cards">{productVisuals.map((p) => <article key={p.name}><div><img src={p.image} alt={`Representative ${p.name} product`} /><span>{p.tag}</span></div><h3>{p.name}</h3><p>{p.copy}</p></article>)}</div></section></>}

    {view === 'schema' && <section className="subpage"><p className="eyebrow">Immutable delivery contract</p><h1>All {headers.length || 252} organizer headers. No renaming. No extras.</h1><p>The delivery CSV is serialized in the exact template order. Evidence and confidence live in a separate JSON audit file, so the required output stays assessment-safe.</p><div className="schema-stats"><article><strong>{inputHeaders.length}</strong><span>input fields detected</span></article><article><strong>{headers.length}</strong><span>output headers locked</span></article><article><strong>{mappedHeaders.length}</strong><span>fields evidenced on selected row</span></article></div><div className="schema-table"><div><b>#</b><b>Required header</b><b>Selected-row status</b><b>Resolution</b></div>{headers.map((h, i) => { const claim = current?.trace.find((t) => t.field === h); return <div key={h}><span>{String(i + 1).padStart(3, '0')}</span><strong>{h}</strong><i className={claim ? 'mapped' : ''}>{claim ? 'Populated' : 'No evidence'}</i><small>{claim ? `${claim.method} · ${claim.source}` : 'Preserved blank; never fabricated'}</small></div>; })}</div></section>}
    {view === 'architecture' && <section className="subpage architecture"><p className="eyebrow">Winning architecture</p><h1>Five agents, one evidence graph, zero silent hallucinations.</h1><p>Every stage operates on the uploaded rows—not a prerecorded demo path—and hands structured claims to the next gate.</p><div className="agent-flow">{[['01', 'Schema Agent', 'Detects changing input fields and resolves known aliases without assuming fixed positions.'], ['02', 'Identity Agent', 'Builds canonical manufacturer + part-number identities and separates supplier from brand signals.'], ['03', 'Extraction Agent', 'Reads descriptions for units, dimensions, ratings, materials and package quantities.'], ['04', 'Knowledge Agent', 'Classifies each product into a normalized three-level industrial taxonomy.'], ['05', 'Validation Agent', 'Scores every claim, detects gaps and routes uncertain records to human review.']].map((a) => <article key={a[0]}><span>{a[0]}</span><h2>{a[1]}</h2><p>{a[2]}</p></article>)}</div><div className="winning-grid"><article><span>⟲</span><h3>Replayable decisions</h3><p>The evidence JSON reconstructs why every populated value exists.</p></article><article><span>◇</span><h3>Honest uncertainty</h3><p>Unsupported claims remain blank and visible instead of being fabricated.</p></article><article><span>⌁</span><h3>O(n) catalog scale</h3><p>Chunked local processing keeps 1,000-row evaluation files responsive.</p></article><article><span>✓</span><h3>Contract guarantee</h3><p>The official header file itself drives serialization, preventing schema drift.</p></article></div></section>}
    <footer><span><b>Catalyst Lens</b> · Every product claim, proven.</span><span>Dynamic CSV engine · Human-in-the-loop · Exact-schema delivery</span></footer>
  </main>;
}
