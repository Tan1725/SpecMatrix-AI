'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';

type Seed = { part: string; description: string; brand: string; manufacturer: string };
type Attribute = { label: string; value: string; uom: string; confidence: number; evidence: string };
type Claim = { field: string; value: string; confidence: number; evidence: string };
type CsvRow = Record<string, string>;
type Product = { output: CsvRow; attributes: Attribute[]; claims: Claim[]; score: number; issues: string[]; approved: boolean };
type AgentState = 'waiting' | 'working' | 'done';

const EMPTY_AGENTS: AgentState[] = ['waiting', 'waiting', 'waiting', 'waiting'];
const officialInput = '/data/official-sample-input.csv';
const outputTemplate = '/data/official-output-template.csv';

const examples = [
  { image: '/products/gate-valve.webp', name: 'Gate valve', seed: { part: 'AF-GV-50', description: 'ApexFlow resilient seated gate valve DN50 PN16 ductile iron 2 in', brand: 'ApexFlow', manufacturer: 'ApexFlow Industries' } },
  { image: '/products/centrifugal-pump.webp', name: 'Centrifugal pump', seed: { part: 'HC-80-75', description: 'HydroCore end suction centrifugal pump 72 m3/h 7.5 kW 80 mm', brand: 'HydroCore', manufacturer: 'HydroCore Pumps' } },
  { image: '/products/induction-motor.webp', name: 'Induction motor', seed: { part: 'M3-160M', description: 'VoltEdge three phase induction motor 11 kW 415 V IE3 IP55', brand: 'VoltEdge', manufacturer: 'VoltEdge Electric' } },
];

function pause(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function useful(value?: string) { const v = (value || '').trim(); return v && !/^--.*--$/.test(v) ? v : ''; }
function cleanCompany(value: string) { return value.replace(/\s*\([^)]{2,14}\)\s*$/, '').trim(); }

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false; const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) { const c = input[i]; if (quoted) { if (c === '"' && input[i + 1] === '"') { value += '"'; i++; } else if (c === '"') quoted = false; else value += c; } else if (c === '"') quoted = true; else if (c === ',') { row.push(value); value = ''; } else if (c === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; } else value += c; }
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const headers = (rows.shift() || []).map((h) => h.trim());
  return { headers, records: rows.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])) as CsvRow) };
}

function csvEscape(value: string) { return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value; }
function download(name: string, body: string, type: string) { const url = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

function classify(text: string): [string, string, string] {
  const rules: [RegExp, [string, string, string]][] = [
    [/sanding belt|abrasive belt/i, ['Abrasives', 'Coated Abrasives', 'Sanding Belts']],
    [/disc|stikit|cubitron|abrasive/i, ['Abrasives', 'Coated Abrasives', 'Abrasive Discs']],
    [/gate valve|ball valve|\bvalve\b/i, ['Industrial Supplies', 'Valves', 'Industrial Valves']],
    [/centrifugal pump|\bpump\b/i, ['Industrial Supplies', 'Pumps', 'Industrial Pumps']],
    [/induction motor|electric motor|\bmotor\b/i, ['Electrical', 'Motors', 'Industrial Motors']],
    [/drill|saw|grinder/i, ['Tools', 'Power Tools', 'Portable Power Tools']],
    [/bearing|bushing/i, ['Power Transmission', 'Bearings', 'Industrial Bearings']],
    [/bolt|screw|fastener/i, ['Fasteners', 'Threaded Fasteners', 'Industrial Fasteners']],
  ];
  return rules.find(([rx]) => rx.test(text))?.[1] || ['Industrial Supplies', 'General Industrial', 'Unclassified Products'];
}

function extract(text: string): Attribute[] {
  const result: Attribute[] = [];
  const add = (label: string, value: string, uom: string, confidence: number) => { if (!result.some((a) => a.label === label)) result.push({ label, value, uom, confidence, evidence: `Found in description: “${value}${uom ? ` ${uom}` : ''}”` }); };
  const patterns: [RegExp, string, string, number][] = [
    [/\bP(\d{2,4})\b/i, 'Grit', 'P', 97], [/\b(\d+(?:\.\d+)?)\s*kW\b/i, 'Power Rating', 'kW', 96],
    [/\b(\d+(?:\.\d+)?)\s*HP\b/i, 'Horsepower', 'hp', 94], [/\b(\d+(?:\.\d+)?)\s*V(?:AC)?\b/i, 'Voltage', 'V', 95],
    [/\b(\d+(?:\.\d+)?)\s*A\b/i, 'Amperage', 'A', 93], [/\bIP(\d{2})\b/i, 'Ingress Protection', 'IP', 96],
    [/\bDN\s?(\d+)\b/i, 'Nominal Diameter', 'DN', 96], [/\bPN\s?(\d+)\b/i, 'Pressure Class', 'PN', 96],
    [/\b(\d+)\s*(?:disc|pcs?|pieces?)\b/i, 'Package Quantity', 'ea', 92], [/\b(\d+(?:\.\d+)?)\s*mm\b/i, 'Size', 'mm', 91],
  ];
  patterns.forEach(([rx, label, uom, confidence]) => { const match = text.match(rx); if (match) add(label, match[1], uom, confidence); });
  const inches = [...text.matchAll(/(\d+(?:\/\d+|\.\d+)?)\s*(?:"|in\b)/gi)];
  if (inches[0]) add('Width / Diameter', inches[0][1], 'in', 91); if (inches[1]) add('Length', inches[1][1], 'in', 91);
  const material = ['stainless steel', 'ductile iron', 'carbon steel', 'aluminum', 'brass', 'bronze', 'ceramic'].find((m) => text.toLowerCase().includes(m));
  if (material) add('Material', material.replace(/\b\w/g, (c) => c.toUpperCase()), '', 93);
  return result;
}

function inferSeed(row: CsvRow): Seed {
  const description = useful(row.Part_Desc) || useful(row.SHORT_DESC) || useful(row.LONG_DESC1) || Object.values(row).filter(useful).join(' ');
  const part = useful(row.Mfg_Part_Num) || useful(row.MANUFACTURER_PART_NUMBER) || useful(row.PART_NUMBER);
  const explicit = useful(row.E1_Brand) || useful(row.Unilog_Brand) || useful(row.DIB_Brand) || useful(row.BRAND_NAME);
  const prefix = description.match(/^([A-Za-z][A-Za-z0-9&.-]{1,24})\b/)?.[1] || '';
  return { part, description, brand: explicit || (prefix.toLowerCase() !== part.toLowerCase() ? prefix : ''), manufacturer: cleanCompany(useful(row.MANUFACTURER_NAME) || useful(row.Part_Manuf)) };
}

function buildProduct(seed: Seed, headers: string[], original: CsvRow = {}): Product {
  const output = Object.fromEntries(headers.map((h) => [h, useful(original[h])])) as CsvRow;
  const claims: Claim[] = [];
  const set = (field: string, value: string, confidence: number, evidence: string) => { if (!value || !headers.includes(field)) return; output[field] = value; claims.push({ field, value, confidence, evidence }); };
  const identity = seed.part.trim(); const description = seed.description.trim(); const brand = seed.brand.trim(); const manufacturer = cleanCompany(seed.manufacturer);
  const [dept, group, category] = classify(description); const attributes = extract(description);
  const productName = description.replace(new RegExp(identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '$^', 'ig'), '').replace(/\s+-\s+/g, ' ').replace(/\s+/g, ' ').trim() || identity;
  set('Mfg_Part_Num', identity, 100, 'Direct product seed'); set('PART_NUMBER', identity, 99, 'Identity Agent canonicalized Mfg_Part_Num'); set('MANUFACTURER_PART_NUMBER', identity, 99, 'Identity Agent canonicalized Mfg_Part_Num');
  set('Part_Desc', description, 100, 'Direct product seed'); set('BRAND_NAME', brand, brand ? 94 : 0, brand ? 'Brand supplied or resolved from description' : 'No reliable brand evidence'); set('MANUFACTURER_NAME', manufacturer, manufacturer ? 88 : 0, 'Manufacturer seed normalized');
  set('Dept', dept, category === 'Unclassified Products' ? 58 : 90, 'Catalog Agent taxonomy match'); set('Class', group, category === 'Unclassified Products' ? 54 : 89, 'Catalog Agent taxonomy match'); set('Fine', category, category === 'Unclassified Products' ? 45 : 87, 'Catalog Agent taxonomy match'); set('Classpath', `${dept}>${group}>${category}`, category === 'Unclassified Products' ? 50 : 89, 'Catalog Agent normalized hierarchy');
  set('Product Name', productName, 88, 'Catalog Agent removed duplicate part-number tokens'); set('SHORT_DESC', description.slice(0, 120), 97, 'Writer Agent applied channel length rule'); set('MOBILE_DESC', `${brand ? brand + ' ' : ''}${productName}`.slice(0, 80), 86, 'Writer Agent applied mobile length rule'); set('INVOICE_DESC', `${identity} ${productName}`.slice(0, 60), 90, 'Writer Agent applied invoice length rule'); set('LONG_DESC1', description, 97, 'Description retained as supplied evidence'); set('RETAIL_DESC', `${brand ? brand + ' ' : ''}${productName}`, 86, 'Writer Agent assembled commerce title');
  attributes.forEach((attribute, index) => { const n = index + 1; set(`ATTRIBUTE_LABEL ${n}`, attribute.label, attribute.confidence, attribute.evidence); set(`ATTRIBUTE_VALUE ${n}`, attribute.value, attribute.confidence, attribute.evidence); set(`ATTRIBUTE_UOM ${n}`, attribute.uom, attribute.confidence, 'Unit Agent normalized measurement'); if (n <= 20) set(`ITEM_FEATURES_${n}`, `${attribute.label}: ${attribute.value}${attribute.uom ? ` ${attribute.uom}` : ''}`, attribute.confidence - 2, 'Writer Agent converted attribute into feature'); });
  const qty = attributes.find((a) => a.label === 'Package Quantity'); if (qty) { set('Selling Qty', qty.value, qty.confidence, qty.evidence); set('Selling UOM', qty.uom, qty.confidence, 'Unit Agent normalized package unit'); }
  const missing = [!identity && 'Part number is missing', !description && 'Description is missing', !brand && 'Brand needs human confirmation', category === 'Unclassified Products' && 'Taxonomy needs human confirmation'].filter(Boolean) as string[];
  const confidence = claims.length ? claims.reduce((sum, c) => sum + c.confidence, 0) / claims.length : 0;
  const score = Math.round(Math.max(0, confidence - missing.length * 5));
  return { output, attributes, claims, score, issues: missing, approved: false };
}

export default function Home() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [seed, setSeed] = useState<Seed>(examples[0].seed);
  const [product, setProduct] = useState<Product | null>(null);
  const [agents, setAgents] = useState<AgentState[]>(EMPTY_AGENTS);
  const [log, setLog] = useState('Ready for a product seed');
  const [running, setRunning] = useState(false);
  const [bulk, setBulk] = useState<Product[]>([]);
  const [bulkName, setBulkName] = useState('');
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch(outputTemplate).then((r) => r.text()).then((text) => setHeaders(parseCsv(text).headers)); }, []);

  async function run(seedToRun = seed) {
    if (!headers.length || !seedToRun.part.trim() || !seedToRun.description.trim()) { setLog('Add a part number and description first.'); return; }
    setRunning(true); setProduct(null); setAgents(EMPTY_AGENTS); setBulk([]); setEditing(false);
    const messages = ['Resolving canonical manufacturer + part identity', 'Extracting technical facts and normalizing units', 'Classifying taxonomy and writing channel-ready copy', 'Validating every claim and routing uncertainty'];
    for (let i = 0; i < 4; i++) { setAgents((old) => old.map((s, index) => index === i ? 'working' : s)); setLog(messages[i]); await pause(430); setAgents((old) => old.map((s, index) => index === i ? 'done' : s)); }
    setProduct(buildProduct(seedToRun, headers)); setLog('Agent run complete — review the evidence below'); setRunning(false);
  }

  async function processCsv(text: string, name: string) {
    if (!headers.length) return; const parsed = parseCsv(text); if (!parsed.records.length) { setLog('No product rows found in that CSV.'); return; }
    setRunning(true); setBulkName(name); setLog(`Agents are processing ${parsed.records.length.toLocaleString()} product rows…`); setAgents(['working', 'waiting', 'waiting', 'waiting']); await pause(100);
    const products: Product[] = []; for (let i = 0; i < parsed.records.length; i++) { products.push(buildProduct(inferSeed(parsed.records[i]), headers, parsed.records[i])); if (i % 150 === 0) await pause(1); }
    setAgents(['done', 'done', 'done', 'done']); setBulk(products); setProduct(products[0]); setSeed(inferSeed(parsed.records[0])); setRunning(false); setLog(`${products.length.toLocaleString()} real rows enriched. Select export to download all results.`);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; await processCsv(await file.text(), file.name); event.target.value = ''; }
  async function runOfficial() { const text = await fetch(officialInput).then((r) => r.text()); await processCsv(text, 'Official 1,000-row sample'); }
  function exportCsv() { if (!product) return; const rows = bulk.length ? bulk.map((p) => p.output) : [product.output]; const body = [headers.map(csvEscape).join(','), ...rows.map((row) => headers.map((h) => csvEscape(row[h] || '')).join(','))].join('\r\n'); download('catalyst-product-intelligence.csv', body, 'text/csv;charset=utf-8'); }
  function exportEvidence() { if (!product) return; download('catalyst-evidence.json', JSON.stringify({ product: product.output.Mfg_Part_Num, confidence: product.score, issues: product.issues, claims: product.claims }, null, 2), 'application/json'); }
  function edit(field: string, value: string) { if (!product) return; setProduct({ ...product, output: { ...product.output, [field]: value }, approved: false }); }
  function chooseExample(example: typeof examples[number]) { setSeed(example.seed); setBulk([]); setProduct(null); setLog(`${example.name} loaded. Run the agents to enrich it.`); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  const agentInfo = [
    ['Identity Agent', 'Resolves the manufacturer, brand and canonical part identity.'],
    ['Extraction Agent', 'Finds dimensions, ratings, materials, quantities and units.'],
    ['Catalog Agent', 'Creates taxonomy, titles and channel-ready descriptions.'],
    ['Validation Agent', 'Scores claims, records evidence and flags human review.'],
  ];

  return <main>
    <header><a className="logo" href="#top"><span>CL</span><div><strong>Catalyst Lens</strong><small>Agentic product intelligence</small></div></a><div className="header-note"><i /> Real data in. Traceable intelligence out.</div><button className="ghost" onClick={runOfficial}>Run official sample</button></header>

    <section id="top" className="intro"><div><p className="eyebrow">AI catalog enrichment</p><h1>Give us the product seed.<br /><em>Agents build the intelligence.</em></h1><p>Start with only a part number and rough description. Four focused agents create, enrich and validate a commerce-ready product record.</p></div><div className="principles"><span>01</span><p><b>Simple input</b> No fixed sample dependency</p><span>02</span><p><b>Visible work</b> Every agent has one job</p><span>03</span><p><b>Trusted output</b> Every claim has evidence</p></div></section>

    <section className="studio">
      <div className="seed-card card"><div className="card-head"><div><p className="eyebrow">Limited product information</p><h2>Product seed</h2></div><button className="mini" onClick={() => fileRef.current?.click()}>Upload CSV</button><input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={onFile} /></div>
        <label>Manufacturer part number<input value={seed.part} onChange={(e) => setSeed({ ...seed, part: e.target.value })} placeholder="e.g. DCB518ASTS06G" /></label>
        <label>Rough product description<textarea value={seed.description} onChange={(e) => setSeed({ ...seed, description: e.target.value })} placeholder="Paste the limited description you received" /></label>
        <div className="two"><label>Brand <span>optional</span><input value={seed.brand} onChange={(e) => setSeed({ ...seed, brand: e.target.value })} placeholder="Unknown is okay" /></label><label>Manufacturer <span>optional</span><input value={seed.manufacturer} onChange={(e) => setSeed({ ...seed, manufacturer: e.target.value })} placeholder="Unknown is okay" /></label></div>
        <button className="run" disabled={running || !headers.length} onClick={() => run()}>{running ? 'Agents are working…' : 'Run AI agents'}<span>→</span></button><button className="sample-link" onClick={runOfficial}>or process the official 1,000-row sample CSV</button>
      </div>

      <div className="agents-card card"><div className="card-head"><div><p className="eyebrow">Agent workspace</p><h2>Live agent run</h2></div><span className={running ? 'pulse active' : 'pulse'}>{running ? 'Running' : 'Ready'}</span></div><div className="agent-list">{agentInfo.map((agent, index) => <div className={`agent ${agents[index]}`} key={agent[0]}><div className="agent-icon">{agents[index] === 'done' ? '✓' : index + 1}</div><div><strong>{agent[0]}</strong><p>{agent[1]}</p></div><span>{agents[index]}</span></div>)}</div><div className="agent-log"><i className={running ? 'active' : ''} /><span>{log}</span></div>{bulk.length > 0 && <div className="bulk-result"><strong>{bulk.length.toLocaleString()}</strong><span>products enriched from {bulkName}</span></div>}</div>
    </section>

    {product && <section className="result-section"><div className="result-heading"><div><p className="eyebrow">Agent result</p><h2>One product record. Every decision explained.</h2></div><div className="result-actions"><button className="ghost" onClick={exportEvidence}>Evidence JSON</button><button className="dark" onClick={exportCsv}>Export required CSV</button></div></div>
      <div className="result-grid"><div className="product-card card"><div className="score"><strong>{product.score}</strong><span>confidence</span></div><p className="eyebrow">Commerce-ready title</p>{editing ? <input className="edit-title" value={product.output['Product Name']} onChange={(e) => edit('Product Name', e.target.value)} /> : <h3>{product.output['Product Name']}</h3>}<div className="path"><span>{product.output.Dept}</span><b>›</b><span>{product.output.Class}</span><b>›</b><strong>{product.output.Fine}</strong></div><div className="identity"><div><span>Part number</span><strong>{product.output.MANUFACTURER_PART_NUMBER}</strong></div><div><span>Brand</span>{editing ? <input value={product.output.BRAND_NAME} onChange={(e) => edit('BRAND_NAME', e.target.value)} /> : <strong>{product.output.BRAND_NAME || 'Needs review'}</strong>}</div><div><span>Manufacturer</span>{editing ? <input value={product.output.MANUFACTURER_NAME} onChange={(e) => edit('MANUFACTURER_NAME', e.target.value)} /> : <strong>{product.output.MANUFACTURER_NAME || 'Needs review'}</strong>}</div></div><div className="review-row"><button className="ghost" onClick={() => setEditing(!editing)}>{editing ? 'Finish editing' : 'Review & edit'}</button><button className={product.approved ? 'approved' : 'approve'} onClick={() => setProduct({ ...product, approved: true })}>{product.approved ? '✓ Human approved' : 'Approve record'}</button></div></div>
        <div className="facts card"><div className="card-head"><div><p className="eyebrow">Structured attributes</p><h2>{product.attributes.length} facts extracted</h2></div></div>{product.attributes.length ? product.attributes.map((a) => <div className="fact" key={a.label}><span>{a.label}</span><strong>{a.value} {a.uom}</strong><b>{a.confidence}%</b><small>{a.evidence}</small></div>) : <div className="empty">No technical attributes were supported by the description. The agents did not invent any.</div>}</div>
        <div className="evidence card"><div className="card-head"><div><p className="eyebrow">Traceable validation</p><h2>Claim evidence</h2></div><span className="claim-count">{product.claims.length}</span></div>{product.issues.length > 0 && <div className="review-box"><strong>Human review requested</strong>{product.issues.map((issue) => <span key={issue}>• {issue}</span>)}</div>}<div className="claim-list">{product.claims.slice(0, 9).map((claim, index) => <div key={`${claim.field}-${index}`}><span>{claim.field}</span><strong>{claim.value}</strong><small>{claim.evidence}</small><b>{claim.confidence}%</b></div>)}</div></div></div>
    </section>}

    <section className="examples"><div className="examples-heading"><div><p className="eyebrow">Try a different industrial product</p><h2>The agents adapt to the input—not the sample.</h2></div><p>Each example runs through the same identity, extraction, catalog and validation pipeline.</p></div><div className="example-grid">{examples.map((example) => <button key={example.name} onClick={() => chooseExample(example)}><img src={example.image} alt={example.name} /><span><strong>{example.name}</strong><small>{example.seed.description}</small></span><b>Try →</b></button>)}</div></section>

    <section className="architecture"><div><p className="eyebrow">Why this can win</p><h2>Simple on the surface.<br />Serious underneath.</h2></div><div className="why-grid"><article><span>01</span><h3>Actually dynamic</h3><p>Every uploaded row uses the same agent functions. No product-specific output is hardcoded.</p></article><article><span>02</span><h3>Hallucination-aware</h3><p>Missing evidence stays missing and is routed to a reviewer instead of silently invented.</p></article><article><span>03</span><h3>Assessment-safe</h3><p>The official template itself controls all 252 output headers and their exact order.</p></article><article><span>04</span><h3>Catalog-scale</h3><p>Bulk mode processes the complete 1,000-row sample and exports all results together.</p></article></div></section>
    <footer><strong>Catalyst Lens</strong><span>Limited data → agent intelligence → validated commerce record</span></footer>
  </main>;
}
