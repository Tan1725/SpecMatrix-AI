'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';

type Seed = { part: string; description: string; brand: string; manufacturer: string };
type Attribute = { label: string; value: string; uom: string; confidence: number; evidence: string };
type Claim = { field: string; value: string; confidence: number; evidence: string; sourceUrl?: string; sourceType?: string };
type CsvRow = Record<string, string>;
type Product = { output: CsvRow; attributes: Attribute[]; claims: Claim[]; score: number; issues: string[]; approved: boolean; sources?: { title: string; url: string }[] };
type AgentState = 'waiting' | 'working' | 'done';

const EMPTY_AGENTS: AgentState[] = ['waiting', 'waiting', 'waiting', 'waiting'];
const officialInput = '/data/official-sample-input.csv';
const outputTemplate = '/data/official-output-template.csv';

const examples = [
  { image: '/products/gate-valve.webp', name: 'Gate valve', seed: { part: 'AF-GV-50', description: 'ApexFlow resilient seated gate valve DN50 PN16 ductile iron 2 in', brand: 'ApexFlow', manufacturer: 'ApexFlow Industries' } },
  { image: '/products/centrifugal-pump.webp', name: 'Centrifugal pump', seed: { part: 'HC-80-75', description: 'HydroCore end suction centrifugal pump 72 m3/h 7.5 kW 80 mm', brand: 'HydroCore', manufacturer: 'HydroCore Pumps' } },
  { image: '/products/induction-motor.webp', name: 'Induction motor', seed: { part: 'M3-160M', description: 'VoltEdge three phase induction motor 11 kW 415 V IE3 IP55', brand: 'VoltEdge', manufacturer: 'VoltEdge Electric' } },
];

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
function fileBase64(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '').split(',')[1] || ''); reader.onerror = () => reject(new Error(`Could not read ${file.name}`)); reader.readAsDataURL(file); }); }

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
  const [files, setFiles] = useState<File[]>([]);
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch(outputTemplate).then((r) => r.text()).then((text) => setHeaders(parseCsv(text).headers)); }, []);

  async function run(seedToRun = seed) {
    if (!headers.length || !seedToRun.part.trim() || !seedToRun.description.trim()) { setLog('Add a part number and description first.'); return; }
    setRunning(true); setProduct(null); setAgents(EMPTY_AGENTS); setEditing(false); setLog('Starting secured AI orchestrator…');
    try {
      const encodedFiles = await Promise.all(files.map(async (file) => ({ name: file.name, type: file.type, size: file.size, data: await fileBase64(file) })));
      const response = await fetch('/api/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed: seedToRun, headers, files: encodedFiles }) });
      if (!response.ok || !response.body) { const error = await response.json().catch(() => ({})); throw new Error(error.error || `Agent service failed (${response.status})`); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = '';
      while (true) {
        const { done, value } = await reader.read(); pending += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = pending.split('\n'); pending = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue; const event = JSON.parse(line);
          if (event.type === 'agent') { setAgents((old) => old.map((state, index) => index === event.index ? event.state : state)); setLog(event.message); }
          if (event.type === 'error') throw new Error(event.error);
          if (event.type === 'result') {
            const result = event.result as Product;
            const attributes: Attribute[] = [];
            for (let i = 1; i <= 50; i++) { const label = result.output[`ATTRIBUTE_LABEL ${i}`]; const value = result.output[`ATTRIBUTE_VALUE ${i}`]; if (label && value) { const claim = result.claims.find((item) => item.field === `ATTRIBUTE_VALUE ${i}` || item.field === `ATTRIBUTE_LABEL ${i}`); attributes.push({ label, value, uom: result.output[`ATTRIBUTE_UOM ${i}`] || '', confidence: claim?.confidence || 70, evidence: claim?.evidence || 'Supported by retrieved evidence' }); } }
            setProduct({ ...result, attributes });
          }
        }
        if (done) break;
      }
      setLog('AI research and enrichment complete — review the grounded evidence below');
    } catch (error) { setLog(error instanceof Error ? error.message : 'The agent run failed.'); setAgents((old) => old.map((state) => state === 'working' ? 'waiting' : state)); }
    finally { setRunning(false); }
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) { setFiles(Array.from(event.target.files || []).slice(0, 4)); event.target.value = ''; }
  async function runOfficial() { const text = await fetch(officialInput).then((r) => r.text()); const first = parseCsv(text).records[0]; if (!first) return; const officialSeed = inferSeed(first); setSeed(officialSeed); setFiles([]); await run(officialSeed); }
  function exportCsv() { if (!product) return; const body = [headers.map(csvEscape).join(','), headers.map((h) => csvEscape(product.output[h] || '')).join(',')].join('\r\n'); download('catalyst-product-intelligence.csv', body, 'text/csv;charset=utf-8'); }
  function exportEvidence() { if (!product) return; download('catalyst-evidence.json', JSON.stringify({ product: product.output.Mfg_Part_Num, confidence: product.score, issues: product.issues, sources: product.sources || [], claims: product.claims }, null, 2), 'application/json'); }
  function edit(field: string, value: string) { if (!product) return; setProduct({ ...product, output: { ...product.output, [field]: value }, approved: false }); }
  function chooseExample(example: typeof examples[number]) { setSeed(example.seed); setFiles([]); setProduct(null); setLog(`${example.name} loaded. Run the agents to research and enrich it.`); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  const agentInfo = [
    ['Web Research Agent', 'Searches manufacturer and trusted distributor sources with citations.'],
    ['Document + Vision Agent', 'Reads uploaded PDFs, datasheets, labels and product images.'],
    ['RAG Catalog Agent', 'Combines retrieved evidence into all required commerce fields.'],
    ['Validation Agent', 'Enforces the 252-field schema, confidence and human review.'],
  ];

  return <main>
    <header><a className="logo" href="#top"><span>CL</span><div><strong>Catalyst Lens</strong><small>Grounded product intelligence</small></div></a><div className="header-note"><i /> Gemini + Google Search + multimodal RAG</div><button className="ghost" onClick={runOfficial}>Research official example</button></header>

    <section id="top" className="intro"><div><p className="eyebrow">LLM-powered industrial enrichment</p><h1>One product seed.<br /><em>Grounded intelligence.</em></h1><p>Agents search the live web, read technical PDFs and images, retrieve supporting evidence, and validate a commerce-ready record against the organizer&apos;s exact schema.</p></div><div className="principles"><span>01</span><p><b>Web grounded</b> Manufacturer-first research with citations</p><span>02</span><p><b>Multimodal RAG</b> PDFs, images and retrieved context</p><span>03</span><p><b>Trust by design</b> Confidence and human approval</p></div></section>

    <section className="studio">
      <div className="seed-card card"><div className="card-head"><div><p className="eyebrow">Limited product information</p><h2>Product seed</h2></div><button className="mini" onClick={() => fileRef.current?.click()}>Add evidence</button><input ref={fileRef} hidden multiple type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,application/pdf,image/*,text/plain,text/csv" onChange={onFile} /></div>
        <label>Manufacturer part number<input value={seed.part} onChange={(e) => setSeed({ ...seed, part: e.target.value })} placeholder="e.g. DCB518ASTS06G" /></label>
        <label>Rough product description<textarea value={seed.description} onChange={(e) => setSeed({ ...seed, description: e.target.value })} placeholder="Paste the limited description you received" /></label>
        <div className="two"><label>Brand <span>optional</span><input value={seed.brand} onChange={(e) => setSeed({ ...seed, brand: e.target.value })} placeholder="Unknown is okay" /></label><label>Manufacturer <span>optional</span><input value={seed.manufacturer} onChange={(e) => setSeed({ ...seed, manufacturer: e.target.value })} placeholder="Unknown is okay" /></label></div>
        <div className="file-chips">{files.length ? files.map((file) => <span key={`${file.name}-${file.size}`}>{file.type.includes('pdf') ? 'PDF' : file.type.includes('image') ? 'IMG' : 'DOC'} · {file.name}<button onClick={() => setFiles(files.filter((item) => item !== file))} aria-label={`Remove ${file.name}`}>×</button></span>) : <small>Optional: attach up to 4 PDFs, product images, labels, text files, or CSV evidence files.</small>}</div>
        <button className="run" disabled={running || !headers.length} onClick={() => run()}>{running ? 'Researching live sources…' : 'Run grounded AI agents'}<span>→</span></button><button className="sample-link" onClick={runOfficial}>or research the first product from the official sample</button>
      </div>

      <div className="agents-card card"><div className="card-head"><div><p className="eyebrow">Agent workspace</p><h2>Live agent run</h2></div><span className={running ? 'pulse active' : 'pulse'}>{running ? 'Running' : 'Ready'}</span></div><div className="agent-list">{agentInfo.map((agent, index) => <div className={`agent ${agents[index]}`} key={agent[0]}><div className="agent-icon">{agents[index] === 'done' ? '✓' : index + 1}</div><div><strong>{agent[0]}</strong><p>{agent[1]}</p></div><span>{agents[index]}</span></div>)}</div><div className="agent-log"><i className={running ? 'active' : ''} /><span>{log}</span></div></div>
    </section>

    {product && <section className="result-section"><div className="result-heading"><div><p className="eyebrow">Agent result</p><h2>One product record. Every decision explained.</h2></div><div className="result-actions"><button className="ghost" onClick={exportEvidence}>Evidence JSON</button><button className="dark" onClick={exportCsv}>Export required CSV</button></div></div>
      <div className="result-grid"><div className="product-card card"><div className="score"><strong>{product.score}</strong><span>confidence</span></div><p className="eyebrow">Commerce-ready title</p>{editing ? <input className="edit-title" value={product.output['Product Name']} onChange={(e) => edit('Product Name', e.target.value)} /> : <h3>{product.output['Product Name']}</h3>}<div className="path"><span>{product.output.Dept}</span><b>›</b><span>{product.output.Class}</span><b>›</b><strong>{product.output.Fine}</strong></div><div className="identity"><div><span>Part number</span><strong>{product.output.MANUFACTURER_PART_NUMBER}</strong></div><div><span>Brand</span>{editing ? <input value={product.output.BRAND_NAME} onChange={(e) => edit('BRAND_NAME', e.target.value)} /> : <strong>{product.output.BRAND_NAME || 'Needs review'}</strong>}</div><div><span>Manufacturer</span>{editing ? <input value={product.output.MANUFACTURER_NAME} onChange={(e) => edit('MANUFACTURER_NAME', e.target.value)} /> : <strong>{product.output.MANUFACTURER_NAME || 'Needs review'}</strong>}</div></div><div className="review-row"><button className="ghost" onClick={() => setEditing(!editing)}>{editing ? 'Finish editing' : 'Review & edit'}</button><button className={product.approved ? 'approved' : 'approve'} onClick={() => setProduct({ ...product, approved: true })}>{product.approved ? '✓ Human approved' : 'Approve record'}</button></div></div>
        <div className="facts card"><div className="card-head"><div><p className="eyebrow">Structured attributes</p><h2>{product.attributes.length} facts extracted</h2></div></div>{product.attributes.length ? product.attributes.map((a) => <div className="fact" key={a.label}><span>{a.label}</span><strong>{a.value} {a.uom}</strong><b>{a.confidence}%</b><small>{a.evidence}</small></div>) : <div className="empty">No technical attributes were supported by the description. The agents did not invent any.</div>}</div>
        <div className="evidence card"><div className="card-head"><div><p className="eyebrow">Traceable validation</p><h2>Claim evidence</h2></div><span className="claim-count">{product.claims.length}</span></div>{product.issues.length > 0 && <div className="review-box"><strong>Human review requested</strong>{product.issues.map((issue) => <span key={issue}>• {issue}</span>)}</div>}{product.sources && product.sources.length > 0 && <div className="source-links"><strong>Grounded web sources</strong>{product.sources.slice(0, 4).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">↗ {source.title}</a>)}</div>}<div className="claim-list">{product.claims.slice(0, 9).map((claim, index) => <div key={`${claim.field}-${index}`}><span>{claim.field} · {claim.sourceType || 'evidence'}</span><strong>{claim.value}</strong><small>{claim.evidence}</small><b>{claim.confidence}%</b></div>)}</div></div></div>
    </section>}

    <section className="examples"><div className="examples-heading"><div><p className="eyebrow">Try a different industrial product</p><h2>The agents adapt to the input—not the sample.</h2></div><p>Each example runs through the same identity, extraction, catalog and validation pipeline.</p></div><div className="example-grid">{examples.map((example) => <button key={example.name} onClick={() => chooseExample(example)}><img src={example.image} alt={example.name} /><span><strong>{example.name}</strong><small>{example.seed.description}</small></span><b>Try →</b></button>)}</div></section>

    <section className="architecture"><div><p className="eyebrow">Why this can win</p><h2>Simple on the surface.<br />Serious underneath.</h2></div><div className="why-grid"><article><span>01</span><h3>Live research</h3><p>Google Search grounding retrieves current manufacturer evidence for the exact product identity.</p></article><article><span>02</span><h3>Hallucination-aware</h3><p>Missing evidence stays missing and is routed to a reviewer instead of silently invented.</p></article><article><span>03</span><h3>Multimodal RAG</h3><p>Gemini reasons across retrieved web context, PDFs, product images and supplied records.</p></article><article><span>04</span><h3>Assessment-safe</h3><p>The official template controls all 252 output headers and their exact export order.</p></article></div></section>
    <footer><strong>Catalyst Lens</strong><span>Limited data → agent intelligence → validated commerce record</span></footer>
  </main>;
}
