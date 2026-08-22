'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RunState = 'complete' | 'running';
type DrawerView = 'evidence' | 'duplicate' | 'channels' | 'trace' | null;
type Attribute = { label: string; value: string; score: number; source: string; };
type ProductSample = {
  id: string;
  code: string;
  sku: string;
  image: string;
  imageAlt: string;
  name: string;
  subtitle: string;
  title: string;
  taxonomy: [string, string, string];
  taxonomyMatch: number;
  visualTags: [{ value: string; score: number }, { value: string; score: number }];
  sources: [{ type: string; name: string; detail: string }, { type: string; name: string; detail: string }, { type: string; name: string; detail: string }];
  attributes: Attribute[];
  conflict: {
    field: string;
    preferred: string;
    alternate: string;
    preferredScore: number;
    alternateScore: number;
    primaryText: string;
    secondaryText: string;
    primaryDetail: string;
    normalizedRule: string;
    channelNeed: string;
  };
  duplicate: { twin: string; variant: string; sameIdentity: string; changedDetail: string; };
  variantDiffs: [[string, string, string], [string, string, string]];
  claims: number;
  fields: number;
  rows: number;
};

const pipeline = [
  { number: '01', label: 'Ingest', detail: '3 sources', time: '0.4s' },
  { number: '02', label: 'Extract', detail: '27 claims', time: '1.2s' },
  { number: '03', label: 'Match', detail: '12 neighbors', time: '0.7s' },
  { number: '04', label: 'Enrich', detail: '23 fields', time: '1.0s' },
  { number: '05', label: 'Validate', detail: '1 conflict', time: '0.6s' },
];

const stageMessages = [
  'Registering product objects in BigQuery',
  'Extraction and vision agents are reading source material',
  'Searching the catalog vector index for product neighbors',
  'Building a normalized commerce-ready record',
  'Validating claims against taxonomy, units, and source priority',
];

const productSamples: ProductSample[] = [
  {
    id: 'valve', code: 'GV', sku: 'CAT-004183', image: '/products/gate-valve.webp',
    imageAlt: 'Black industrial gate valve with red handwheel on a neutral studio background',
    name: 'Gate valve', subtitle: 'ApexFlow · GV-50',
    title: 'ApexFlow GV-50 resilient seated gate valve, DN 50, PN 16',
    taxonomy: ['Industrial supplies', 'Valves', 'Gate valves'], taxonomyMatch: 97,
    visualTags: [{ value: 'PN16', score: 94 }, { value: 'DN50', score: 93 }],
    sources: [
      { type: 'IMG', name: 'label-photo.jpg', detail: 'Vision source · primary' },
      { type: 'PDF', name: 'AF-GV-Series.pdf', detail: 'Manufacturer · 6 pages' },
      { type: 'XLS', name: 'vendor-prices.xlsx', detail: 'Distributor · 184 rows' },
    ],
    attributes: [
      { label: 'Manufacturer', value: 'ApexFlow', score: 99, source: 'Nameplate OCR + datasheet' },
      { label: 'Product type', value: 'Resilient seated gate valve', score: 96, source: 'Vision + approved taxonomy' },
      { label: 'Nominal diameter', value: 'DN 50 / 2 in', score: 93, source: 'Casting + datasheet p. 2' },
      { label: 'Body material', value: 'Ductile iron EN-GJS-500-7', score: 91, source: 'Manufacturer datasheet' },
    ],
    conflict: {
      field: 'Pressure class', preferred: 'PN 16', alternate: 'PN 10', preferredScore: 94, alternateScore: 62,
      primaryText: '“PN16” is visible on the casting and the manufacturer datasheet states 1.6 MPa maximum working pressure.',
      secondaryText: 'The distributor workbook lists PN10, but the row lacks a matching manufacturer part number.',
      primaryDetail: '1.6 MPa · page 2', normalizedRule: '1.6 MPa → PN 16', channelNeed: 'PN class',
    },
    duplicate: { twin: 'AF-GV50-2024', variant: 'AF-GV80-2024', sameIdentity: 'Manufacturer, model family, DN50, PN16', changedDetail: 'Legacy title omits body material' },
    variantDiffs: [['Nominal diameter', 'DN50', 'DN80'], ['Face-to-face length', '178 mm', '203 mm']],
    claims: 31, fields: 23, rows: 184,
  },
  {
    id: 'pump', code: 'CP', sku: 'CAT-007426', image: '/products/centrifugal-pump.webp',
    imageAlt: 'Teal industrial centrifugal pump on a neutral studio background',
    name: 'Centrifugal pump', subtitle: 'HydroCore · HC-80',
    title: 'HydroCore HC-80 end-suction centrifugal pump, 72 m³/h, 7.5 kW',
    taxonomy: ['Industrial supplies', 'Pumps', 'Centrifugal pumps'], taxonomyMatch: 98,
    visualTags: [{ value: '7.5 KW', score: 96 }, { value: '80×65', score: 92 }],
    sources: [
      { type: 'IMG', name: 'pump-nameplate.jpg', detail: 'Vision source · primary' },
      { type: 'PDF', name: 'HC80-Datasheet.pdf', detail: 'Manufacturer · 8 pages' },
      { type: 'XLS', name: 'reseller-pumps.xlsx', detail: 'Distributor · 267 rows' },
    ],
    attributes: [
      { label: 'Manufacturer', value: 'HydroCore', score: 99, source: 'Nameplate OCR + datasheet' },
      { label: 'Product type', value: 'End-suction centrifugal pump', score: 97, source: 'Vision + approved taxonomy' },
      { label: 'Rated flow', value: '72 m³/h', score: 95, source: 'Performance curve p. 4' },
      { label: 'Total head', value: '28 m', score: 92, source: 'Duty-point table p. 4' },
    ],
    conflict: {
      field: 'Motor rating', preferred: '7.5 kW', alternate: '5.5 kW', preferredScore: 96, alternateScore: 64,
      primaryText: 'The nameplate reads 7.5 kW and the HC-80 duty table specifies a 7.5 kW motor at the selected operating point.',
      secondaryText: 'A reseller row lists 5.5 kW but references the smaller HC-65 variant in its free-text notes.',
      primaryDetail: '7.5 kW · page 4', normalizedRule: '10.05 hp → 7.5 kW', channelNeed: 'motor rating',
    },
    duplicate: { twin: 'HC-P80-2025', variant: 'HC-P100-2025', sameIdentity: 'Manufacturer, HC-80 frame, 72 m³/h duty point', changedDetail: 'Existing title omits seal material' },
    variantDiffs: [['Inlet diameter', '80 mm', '100 mm'], ['Rated flow', '72 m³/h', '110 m³/h']],
    claims: 34, fields: 26, rows: 267,
  },
  {
    id: 'motor', code: 'IM', sku: 'CAT-009871', image: '/products/induction-motor.webp',
    imageAlt: 'Blue three-phase industrial induction motor on a neutral studio background',
    name: 'Induction motor', subtitle: 'VoltEdge · M3-160M',
    title: 'VoltEdge M3-160M three-phase induction motor, 11 kW, IE3, IP55',
    taxonomy: ['Electrical equipment', 'Motors', 'Induction motors'], taxonomyMatch: 99,
    visualTags: [{ value: 'IP55', score: 96 }, { value: '11 KW', score: 95 }],
    sources: [
      { type: 'IMG', name: 'motor-nameplate.jpg', detail: 'Vision source · primary' },
      { type: 'PDF', name: 'M3-Series.pdf', detail: 'Manufacturer · 12 pages' },
      { type: 'XLS', name: 'distributor-motors.xlsx', detail: 'Distributor · 412 rows' },
    ],
    attributes: [
      { label: 'Manufacturer', value: 'VoltEdge', score: 99, source: 'Nameplate OCR + datasheet' },
      { label: 'Product type', value: 'Three-phase induction motor', score: 98, source: 'Vision + approved taxonomy' },
      { label: 'Rated power', value: '11 kW / 15 hp', score: 95, source: 'Nameplate + datasheet p. 6' },
      { label: 'Efficiency class', value: 'IE3', score: 94, source: 'Nameplate + IEC value list' },
    ],
    conflict: {
      field: 'Enclosure rating', preferred: 'IP55', alternate: 'IP54', preferredScore: 96, alternateScore: 58,
      primaryText: 'IP55 is legible on the motor nameplate and the manufacturer configuration table confirms the same enclosure rating.',
      secondaryText: 'The distributor workbook lists IP54, copied from a superseded M2-series record.',
      primaryDetail: 'IP55 · page 6', normalizedRule: 'IEC 60529 → IP55', channelNeed: 'IP rating',
    },
    duplicate: { twin: 'VE-M3-11KW-IE3', variant: 'VE-M3-15KW-IE3', sameIdentity: 'Manufacturer, M3-160M frame, 11 kW, IE3', changedDetail: 'Existing title omits mounting arrangement' },
    variantDiffs: [['Rated power', '11 kW', '15 kW'], ['Frame size', '160M', '160L']],
    claims: 38, fields: 29, rows: 412,
  },
];

function Confidence({ score }: { score: number }) {
  const tone = score >= 90 ? 'high' : score >= 75 ? 'medium' : 'low';
  return <span className={`confidence ${tone}`} aria-label={`${score}% confidence`}>{score}%</span>;
}

function Drawer({
  title,
  eyebrow,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button, a, input, [tabindex]:not([tabindex="-1"])')).filter((item) => !item.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`drawer ${wide ? 'wide' : ''}`} ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabIndex={-1}>
        <header className="drawer-header">
          <div><span className="section-kicker">{eyebrow}</span><h2 id="drawer-title">{title}</h2></div>
          <button className="drawer-close" onClick={onClose} aria-label="Close panel">×</button>
        </header>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const [productId, setProductId] = useState(productSamples[0].id);
  const [runState, setRunState] = useState<RunState>('complete');
  const [stage, setStage] = useState(4);
  const [drawer, setDrawer] = useState<DrawerView>(null);
  const [approved, setApproved] = useState(false);
  const [merged, setMerged] = useState(false);
  const [threshold, setThreshold] = useState(85);
  const [replayStep, setReplayStep] = useState(4);
  const [toast, setToast] = useState('');
  const [selectedField, setSelectedField] = useState(productSamples[0].conflict.field);
  const fileInput = useRef<HTMLInputElement>(null);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const product = productSamples.find((sample) => sample.id === productId) ?? productSamples[0];
  const replayMoments = [
    { time: '00.0s', agent: 'Orchestrator', text: `Created a new run for ${product.sku} from 3 source objects.` },
    { time: '00.8s', agent: 'Vision', text: `Read ${product.visualTags[0].value} and ${product.visualTags[1].value} from the product image.` },
    { time: '01.9s', agent: 'Retrieval', text: `Found 12 catalog neighbors; protected ${product.duplicate.variant} as a legitimate variant.` },
    { time: '02.7s', agent: 'Validator', text: `Quarantined ${product.conflict.alternate} because it conflicts with primary evidence.` },
    { time: '03.9s', agent: 'Orchestrator', text: `Routed ${product.conflict.field} to human review. No value was silently guessed.` },
  ];

  useEffect(() => {
    if (runState !== 'running') return;
    if (stage >= pipeline.length - 1) {
      const done = window.setTimeout(() => {
        setRunState('complete');
        setToast(`Enrichment complete: ${product.fields} fields enriched, 1 conflict routed safely.`);
      }, 720);
      return () => window.clearTimeout(done);
    }
    const timer = window.setTimeout(() => setStage((current) => current + 1), 720);
    return () => window.clearTimeout(timer);
  }, [runState, stage, product.fields]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const readiness = approved ? 98 : 94;
  const autoApproved = useMemo(() => Math.max(4, Math.round((100 - threshold) * 0.62)), [threshold]);
  const reviewLoad = 27 - autoApproved;

  const attributes = [
    ...product.attributes,
    { label: product.conflict.field, value: approved ? `${product.conflict.preferred} · human verified` : product.conflict.preferred, score: approved ? 100 : 78, source: approved ? 'Primary sources + reviewer' : 'Conflicting sources · review required', review: !approved },
  ];

  const selectProduct = (id: string) => {
    const nextProduct = productSamples.find((sample) => sample.id === id);
    if (!nextProduct || nextProduct.id === product.id) return;
    setProductId(nextProduct.id);
    setSelectedField(nextProduct.conflict.field);
    setApproved(false);
    setMerged(false);
    setStage(4);
    setRunState('complete');
    setReplayStep(4);
    setDrawer(null);
    setToast(`${nextProduct.name} sample loaded with 3 source files and ${nextProduct.fields} enriched fields.`);
  };

  const runDemo = () => {
    setRunState('running');
    setStage(0);
    setApproved(false);
    setMerged(false);
    setReplayStep(0);
    setDrawer(null);
    setToast('Guided run started. Watching five BigQuery-aligned stages.');
  };

  const approveClaim = () => {
    setApproved(true);
    setReplayStep(4);
    setDrawer(null);
    setToast(`${product.conflict.preferred} approved. Amazon Business and ERP channels are now publish-ready.`);
  };

  const mergeDuplicate = () => {
    setMerged(true);
    setDrawer(null);
    setToast(`Duplicate linked to ${product.duplicate.twin}. ${product.duplicate.variant} was protected.`);
  };

  const openEvidence = (field: string) => {
    setSelectedField(field);
    setDrawer('evidence');
  };

  const downloadJson = () => {
    const payload = {
      sku: product.sku,
      title: product.title,
      taxonomy: product.taxonomy.join(' > '),
      readiness,
      evidence_status: approved ? 'verified' : 'human_review_required',
      attributes: attributes.map(({ label, value, score, source }) => ({ label, value, confidence: score, source })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `catalyst-${product.id}-${product.sku.toLowerCase()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast('Commerce-ready JSON exported with field-level trust metadata.');
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" aria-label="Catalyst Lens">C</div>
        <nav aria-label="Primary navigation">
          <button className="nav-item active" aria-label="Product dossier"><span>PD</span></button>
          <button className="nav-item" onClick={() => openEvidence(product.conflict.field)} aria-label="Evidence ledger"><span>EL</span></button>
          <button className="nav-item" onClick={() => setDrawer('duplicate')} aria-label="SKU genome"><span>SG</span></button>
          <button className="nav-item" onClick={() => setDrawer('channels')} aria-label="Channel readiness"><span>CR</span></button>
          <button className="nav-item" onClick={() => setDrawer('trace')} aria-label="Query trace"><span>QT</span></button>
        </nav>
        <div className="avatar" aria-label="Signed in as Shikha N Shah">SN</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Catalyst Lens / Catalog operations</p>
            <h1>Product intelligence cockpit</h1>
          </div>
          <div className="header-actions">
            <span className="live-pill"><i /> BigQuery connected</span>
            <button className="ghost-button" onClick={() => { setApproved(false); setMerged(false); setStage(4); setRunState('complete'); setToast(`${product.name} demo reset to the review moment.`); }}>Reset demo</button>
            <button className="top-run-button" onClick={runDemo} disabled={runState === 'running'}>{runState === 'running' ? 'Agents working…' : 'Run guided demo'} <span>→</span></button>
          </div>
        </header>

        <section className="sample-switcher" aria-label="Sample product selector">
          <div className="sample-switcher-copy"><span className="section-kicker">Sample catalog</span><strong>Choose a product to enrich</strong><small>Every sample has working evidence, conflicts, duplicates, and export.</small></div>
          <div className="sample-options">
            {productSamples.map((sample) => (
              <button className={`sample-option ${sample.id === product.id ? 'active' : ''}`} key={sample.id} onClick={() => selectProduct(sample.id)} aria-pressed={sample.id === product.id}>
                <img src={sample.image} alt="" />
                <span><strong>{sample.name}</strong><small>{sample.subtitle}</small></span>
                <b>{sample.id === product.id ? 'Loaded ✓' : 'Try sample'}</b>
              </button>
            ))}
          </div>
        </section>

        <section className={`outcome-strip ${runState === 'running' ? 'is-running' : ''}`}>
          <div className="outcome-copy">
            <span className="section-kicker">Evidence-first enrichment</span>
            <h2>Messy product data in. <em>Every claim proven.</em></h2>
          </div>
          <div className="impact-metrics">
            <div><strong>{runState === 'running' ? `${Math.min(42, (stage + 1) * 8)}s` : '42s'}</strong><span>processing time</span></div>
            <div><strong>{runState === 'running' ? Math.min(product.fields, stage * 5 + 3) : product.fields}</strong><span>fields enriched</span></div>
            <div><strong>{merged ? 2 : 1}</strong><span>duplicates avoided</span></div>
            <div><strong>{readiness}%</strong><span>publish-ready</span></div>
          </div>
        </section>

        <section className="pipeline" aria-label="Enrichment pipeline">
          <div className="pipeline-copy"><span className="section-kicker">Live workflow</span><strong>Fragment → trusted SKU</strong></div>
          <div className="pipeline-steps">
            {pipeline.map((item, index) => {
              const status = runState === 'complete' || index < stage ? 'done' : index === stage ? 'current' : 'pending';
              const productDetail = index === 1 ? `${product.claims} claims` : index === 3 ? `${product.fields} fields` : item.detail;
              return (
                <div className={`pipeline-step ${status}`} key={item.number}>
                  <span>{status === 'done' ? '✓' : item.number}</span>
                  <div><p>{item.label}</p><small>{status === 'done' ? item.time : index === stage && runState === 'running' ? 'working' : productDetail}</small></div>
                  {index < pipeline.length - 1 && <i />}
                </div>
              );
            })}
          </div>
          <button className="primary-button" onClick={runDemo} disabled={runState === 'running'}>{runState === 'running' ? 'Running' : 'Replay'} <span>{runState === 'running' ? '•••' : '↻'}</span></button>
          <p className="sr-only" aria-live="polite">{runState === 'running' ? stageMessages[stage] : 'Enrichment complete'}</p>
        </section>

        <div className="content-grid">
          <section className="source-panel panel">
            <div className="panel-heading">
              <div><span className="section-kicker">01 / Raw evidence</span><h2>Source packet</h2></div>
              <button className="add-source-button" onClick={() => fileInput.current?.click()}>+ Add</button>
              <input ref={fileInput} className="sr-only" type="file" multiple accept=".pdf,.csv,.xlsx,.xls,image/*" onChange={(event) => event.target.files?.length && setToast(`${event.target.files.length} local source${event.target.files.length > 1 ? 's' : ''} staged for this demo.`)} />
            </div>
            <div className="product-visual">
              <span className="visual-label">{product.sources[0].name.toUpperCase()} · OBJECT REF</span>
              <div className="scan-line" />
              <img className="product-photo" src={product.image} alt={product.imageAlt} />
              <span className="vision-tag one">{product.visualTags[0].value} <b>{product.visualTags[0].score}%</b></span><span className="vision-tag two">{product.visualTags[1].value} <b>{product.visualTags[1].score}%</b></span>
            </div>
            <div className="file-list">
              {product.sources.map((source, index) => <div className={`file-row ${index === 0 ? 'selected' : ''}`} key={source.name}><span className={`file-type ${source.type.toLowerCase()}`}>{source.type}</span><div><strong>{source.name}</strong><small>{source.detail}</small></div><span className={`file-state ${index === 2 ? 'warning' : ''}`}>{index === 2 ? '! Conflict' : '✓ Read'}</span></div>)}
            </div>
            {runState === 'running' && <div className="agent-status"><span className="agent-orbit" /><div><strong>{pipeline[stage].label} agent</strong><small>{stageMessages[stage]}</small></div></div>}
          </section>

          <section className={`dossier-panel panel ${runState === 'running' ? 'processing' : ''}`}>
            <div className="panel-heading">
              <div><span className="section-kicker">02 / Unified record</span><h2>Trusted product dossier</h2></div>
              <span className="draft-pill">SKU · {product.sku}</span>
            </div>
            <div className="product-title-block"><div className="title-icon">{product.code}</div><div><p className="overline">Generated commerce title</p><h3>{product.title}</h3></div><span className="title-source">3 sources</span></div>
            <div className="taxonomy-row"><span>{product.taxonomy[0]}</span><i>›</i><span>{product.taxonomy[1]}</span><i>›</i><strong>{product.taxonomy[2]}</strong><b>{product.taxonomyMatch}% match</b></div>
            <div className="attribute-table">
              <div className="table-head"><span>Attribute</span><span>Normalized value + provenance</span><span>Trust</span></div>
              {attributes.map((attribute) => (
                <button className={`attribute-row ${attribute.review ? 'needs-review' : ''}`} key={attribute.label} onClick={() => openEvidence(attribute.label)}>
                  <span>{attribute.label}{attribute.review && <em>Review</em>}</span>
                  <div><strong>{attribute.value}</strong><small>{attribute.source}</small></div>
                  <div className="row-trust"><Confidence score={attribute.score} /><span>View proof ↗</span></div>
                </button>
              ))}
            </div>
            <button className="evidence-link" onClick={() => openEvidence(product.conflict.field)}><span><b>Evidence Ledger</b> · {product.claims} traceable claims, 0 unsourced values</span><strong>Open graph ↗</strong></button>
          </section>

          <aside className="decision-panel">
            <section className="readiness-card dark-card">
              <div className="card-topline"><span>Commerce readiness</span><span className="pulse">● Live</span></div>
              <div className="score-row"><strong>{readiness}</strong><span>/100</span><p>{approved ? 'All critical claims' : 'Ready after'}<br />{approved ? 'verified' : '1 human check'}</p></div>
              <div className="score-bar"><i style={{ width: `${readiness}%` }} /></div>
              <div className="score-legend"><span>23 enriched</span><span>{approved ? '0' : '1'} review</span><span>0 guessed</span></div>
              <button className="export-button" onClick={downloadJson}>Export trusted JSON <span>↓</span></button>
            </section>

            <section className={`review-card panel ${approved ? 'resolved' : ''}`}>
              <div className="panel-heading compact"><div><span className="section-kicker">Conflict Court</span><h2>{approved ? 'Decision recorded' : 'Needs your eye'}</h2></div><span className={`count-badge ${approved ? 'ok' : ''}`}>{approved ? '✓' : '1'}</span></div>
              {approved ? (
                <div className="resolved-review"><span>✓</span><div><strong>{product.conflict.preferred} verified</strong><p>Primary evidence won. Your decision is now part of the audit trail.</p></div><button onClick={() => openEvidence(product.conflict.field)}>View proof</button></div>
              ) : (
                <div className="review-item">
                  <div className="review-meta"><span className="warning-dot">!</span><small>High impact · medium confidence</small></div><h3>{product.conflict.field} conflict</h3>
                  <div className="conflict-mini"><span><small>Primary sources</small><strong>{product.conflict.preferred}</strong></span><i>versus</i><span className="losing"><small>Reseller sheet</small><strong>{product.conflict.alternate}</strong></span></div>
                  <p>Source-priority rules recommend {product.conflict.preferred}, but publication is paused because the reseller record disagrees.</p>
                  <div className="review-actions"><button onClick={() => openEvidence(product.conflict.field)}>Inspect evidence</button><button className="approve" onClick={approveClaim}>Approve {product.conflict.preferred}</button></div>
                </div>
              )}
            </section>

            <button className={`duplicate-alert panel ${merged ? 'resolved-duplicate' : ''}`} onClick={() => setDrawer('duplicate')}>
              <span className="duplicate-icon">{merged ? '✓' : '≈'}</span><div><small>SKU Genome</small><strong>{merged ? 'Duplicate linked safely' : '97% semantic twin found'}</strong><p>{merged ? 'DN80 variant preserved.' : 'Merge the twin, protect the size variant.'}</p></div><span>↗</span>
            </button>
          </aside>
        </div>

        <section className="trust-lab">
          <div className="section-heading-row"><div><span className="section-kicker">Why this wins</span><h2>Trust is a product surface, not a footnote.</h2></div><p>Every differentiator below is interactive and deterministic for a judge-ready demo.</p></div>
          <div className="feature-grid">
            <button className="feature-card evidence" onClick={() => openEvidence(product.conflict.field)}><span className="feature-number">01</span><div className="feature-symbol">⟡</div><h3>Field Evidence Ledger</h3><p>Trace any value to exact source text, vision regions, validation rules, and reviewer decisions.</p><strong>Trace {product.claims} claims ↗</strong></button>
            <button className="feature-card conflict" onClick={() => openEvidence(product.conflict.field)}><span className="feature-number">02</span><div className="feature-symbol">≠</div><h3>Conflict Court</h3><p>See contradictory sources argued by authority and recency. Uncertainty is quarantined, never hidden.</p><strong>Resolve 1 conflict ↗</strong></button>
            <button className="feature-card genome" onClick={() => setDrawer('duplicate')}><span className="feature-number">03</span><div className="feature-symbol">⁙</div><h3>SKU Genome</h3><p>Explain semantic twins and protect legitimate variants with attribute-level difference reasoning.</p><strong>Explore neighbors ↗</strong></button>
            <button className="feature-card channels" onClick={() => setDrawer('channels')}><span className="feature-number">04</span><div className="feature-symbol">▦</div><h3>Channel Readiness</h3><p>Turn one verified claim into an immediately visible unlock across marketplace and ERP schemas.</p><strong>Simulate publication ↗</strong></button>
          </div>
        </section>

        <section className="policy-section">
          <div className="policy-card panel">
            <div className="policy-copy"><span className="section-kicker">Autonomy Dial</span><h2>Choose the risk posture, before AI chooses for you.</h2><p>One policy instantly recalculates automation and human review load. Critical safety attributes always remain gated.</p></div>
            <div className="dial-control">
              <div className="dial-labels"><span>More automation</span><strong>{threshold}% trust threshold</strong><span>More control</span></div>
              <input aria-label="Auto approval confidence threshold" type="range" min="70" max="95" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
              <div className="dial-outcomes"><div><strong>{autoApproved}</strong><span>auto-approved</span></div><div><strong>{reviewLoad}</strong><span>human checks</span></div><div><strong>100%</strong><span>critical claims gated</span></div></div>
            </div>
          </div>

          <div className="replay-card panel">
            <div className="panel-heading"><div><span className="section-kicker">Decision Replay</span><h2>Scrub the AI's reasoning, second by second.</h2></div><button className="trace-button" onClick={() => setDrawer('trace')}>Query trace ↗</button></div>
            <div className="replay-stage"><span>{replayMoments[replayStep].time}</span><div><strong>{replayMoments[replayStep].agent}</strong><p>{replayMoments[replayStep].text}</p></div></div>
            <input className="replay-slider" aria-label="Decision replay step" type="range" min="0" max="4" step="1" value={replayStep} onChange={(event) => setReplayStep(Number(event.target.value))} />
            <div className="replay-ticks">{replayMoments.map((moment, index) => <button key={moment.time} className={index <= replayStep ? 'seen' : ''} onClick={() => setReplayStep(index)} aria-label={`Replay ${moment.agent} step`}><i /><span>{moment.agent}</span></button>)}</div>
          </div>
        </section>

        <footer><span>Catalyst Lens · Team Catalyst</span><p>Demo data is deterministic. Production architecture maps to BigQuery object tables, AI functions, vector search, and governed review events.</p><button onClick={runDemo}>Replay the 3-minute story →</button></footer>
      </section>

      {drawer === 'evidence' && (
        <Drawer title={`${selectedField} · Evidence Ledger`} eyebrow="Claim provenance" onClose={closeDrawer}>
          <section className="claim-hero"><div><span>Resolved value</span><strong>{selectedField === product.conflict.field ? product.conflict.preferred : attributes.find((item) => item.label === selectedField)?.value}</strong><small>{approved && selectedField === product.conflict.field ? 'Human verified' : 'AI recommendation'}</small></div><div className="claim-score"><b>{approved && selectedField === product.conflict.field ? 100 : selectedField === product.conflict.field ? 78 : 93}</b><span>trust score</span></div></section>
          {selectedField === product.conflict.field ? (
            <>
              <section className="drawer-section"><div className="drawer-section-title"><span className="section-kicker">Conflict Court</span><h3>Two values entered. One value may leave.</h3></div><div className="court-grid"><article className="court-source winner"><header><span>Primary evidence</span><Confidence score={product.conflict.preferredScore} /></header><strong>{product.conflict.preferred}</strong><p>{product.conflict.primaryText}</p><footer><b>{product.sources[0].name}</b><span>region 04</span><b>{product.sources[1].name}</b><span>manufacturer</span></footer></article><div className="court-versus">VS</div><article className="court-source loser"><header><span>Secondary evidence</span><Confidence score={product.conflict.alternateScore} /></header><strong>{product.conflict.alternate}</strong><p>{product.conflict.secondaryText}</p><footer><b>{product.sources[2].name}</b><span>row match</span><b>Authority</b><span>reseller</span></footer></article></div><div className="ruling"><span>⚖</span><div><strong>Rule verdict: prefer {product.conflict.preferred}, require human confirmation</strong><p>Two independent primary sources agree. The conflicting reseller value is retained in lineage, not deleted.</p></div></div></section>
              <section className="drawer-section"><div className="drawer-section-title"><span className="section-kicker">Evidence graph</span><h3>How the claim was assembled</h3></div><div className="provenance-graph"><div className="graph-source"><span>IMG</span><div><strong>Vision extraction</strong><small>{product.visualTags[0].value} · bbox 0.62, 0.44</small></div><b>{product.conflict.preferredScore}%</b></div><i /><div className="graph-source"><span>PDF</span><div><strong>Manufacturer spec</strong><small>{product.conflict.primaryDetail}</small></div><b>91%</b></div><i /><div className="graph-rule"><span>RULE</span><div><strong>Value normalization</strong><small>{product.conflict.normalizedRule}</small></div><b>pass</b></div><i /><div className="graph-claim"><span>CLAIM</span><div><strong>{product.conflict.field}</strong><small>{product.conflict.preferred}</small></div><b>{approved ? 'verified' : 'review'}</b></div></div></section>
              <div className="drawer-actions"><button className="secondary-button" onClick={closeDrawer}>Keep in review</button><button className="primary-action" onClick={approveClaim} disabled={approved}>{approved ? 'Decision recorded ✓' : `Approve ${product.conflict.preferred} and unlock channels`}</button></div>
            </>
          ) : (
            <section className="drawer-section"><div className="drawer-section-title"><span className="section-kicker">Evidence graph</span><h3>Three independent checks support this value</h3></div><div className="simple-evidence-list"><div><span>01</span><p><strong>Manufacturer source</strong>Exact value found in {product.sources[1].name}.</p><Confidence score={96} /></div><div><span>02</span><p><strong>Vision extraction</strong>Compatible marking detected on {product.sources[0].name}.</p><Confidence score={93} /></div><div><span>03</span><p><strong>Catalog rule</strong>Value matches the approved taxonomy and List of Values.</p><b className="pass-pill">Pass</b></div></div></section>
          )}
        </Drawer>
      )}

      {drawer === 'duplicate' && (
        <Drawer title="SKU Genome" eyebrow="Explainable duplicate detection" onClose={closeDrawer} wide>
          <section className="genome-layout">
            <div className="genome-map" aria-label="Vector neighbor constellation"><span className="map-label">VECTOR_SEARCH · 12 nearest neighbors</span><i className="orbit one" /><i className="orbit two" /><button className="genome-node hero" aria-label="Current draft">Draft<small>{product.sku}</small></button><button className="genome-node twin" aria-label="97 percent matching product">97%<small>{product.duplicate.twin}</small></button><button className="genome-node variant" aria-label="91 percent matching size variant">91%<small>{product.duplicate.variant}</small></button><span className="genome-node dot d1" /><span className="genome-node dot d2" /><span className="genome-node dot d3" /><span className="genome-node dot d4" /></div>
            <div className="genome-explanation"><span className="section-kicker">Semantic twin · merge recommended</span><h3>{product.duplicate.twin}</h3><div className="similarity-score"><strong>97%</strong><span>semantic similarity</span></div><div className="reason-list"><div><span>✓</span><p><strong>Same identity</strong>{product.duplicate.sameIdentity}</p></div><div><span>✓</span><p><strong>Same geometry</strong>Vision embedding aligns across 14 regions</p></div><div><span>!</span><p><strong>Description drift</strong>{product.duplicate.changedDetail}</p></div></div><button className="primary-action full" onClick={mergeDuplicate} disabled={merged}>{merged ? 'Twin linked ✓' : 'Link to existing SKU · keep new evidence'}</button></div>
          </section>
          <section className="variant-protection"><div><span className="variant-badge">Protected variant</span><h3>{product.duplicate.variant} is similar, not duplicate</h3><p>The embedding is close, but two identity-defining attributes disagree. Catalyst blocks an unsafe merge.</p></div><div className="variant-diff">{product.variantDiffs.map(([label, current, variant]) => <span key={label}><small>{label}</small><b>{current}</b><i>≠</i><b>{variant}</b></span>)}</div></section>
        </Drawer>
      )}

      {drawer === 'channels' && (
        <Drawer title="Channel Readiness Simulator" eyebrow="Commerce impact" onClose={closeDrawer}>
          <section className="channel-summary"><div><strong>{approved ? '3/3' : '1/3'}</strong><span>destinations ready</span></div><p>{approved ? 'One evidence-backed decision unlocked every destination.' : 'Verify one high-impact claim to unlock Amazon Business and ERP publication.'}</p></section>
          <section className="channel-matrix"><div className="matrix-head"><span>Destination</span><span>Schema</span><span>Critical fields</span><span>Status</span></div><div className="matrix-row"><strong>B2B storefront</strong><span>Unilog PIM</span><span>18 / 18</span><b className="ready">Ready</b></div><div className="matrix-row"><strong>Amazon Business</strong><span>{product.taxonomy[2]}</span><span>{approved ? '22 / 22' : '21 / 22'}</span><b className={approved ? 'ready' : 'review'}>{approved ? 'Ready' : `Needs ${product.conflict.channelNeed}`}</b></div><div className="matrix-row"><strong>ERP master</strong><span>SAP material</span><span>{approved ? '14 / 14' : '13 / 14'}</span><b className={approved ? 'ready' : 'review'}>{approved ? 'Ready' : `Needs ${product.conflict.channelNeed}`}</b></div></section>
          <section className="unlock-card"><span>High-impact review</span><h3>Approve one sourced claim → unlock two channels</h3><p>No description regeneration or full-record review required.</p><button className="primary-action full" onClick={approveClaim} disabled={approved}>{approved ? 'All destinations unlocked ✓' : `Review ${product.conflict.field.toLowerCase()} now`}</button></section>
        </Drawer>
      )}

      {drawer === 'trace' && (
        <Drawer title="Catalog Time Machine" eyebrow="Query trace · demo telemetry" onClose={closeDrawer}>
          <section className="trace-summary"><div><small>Run ID</small><strong>{product.sku}-091</strong></div><div><small>Rows processed</small><strong>{product.rows}</strong></div><div><small>Est. query cost</small><strong>$0.02</strong></div><div><small>Taxonomy</small><strong>v2026.08</strong></div></section>
          <section className="query-trace">{[
            ['00.0s', 'Object table', 'Registered PDF, image, and workbook references', 'catalog_source_objects'],
            ['00.8s', 'AI.GENERATE_TABLE', 'Extracted typed product claims from multimodal sources', `${product.claims} claims`],
            ['01.5s', 'AI.GENERATE_EMBEDDING', 'Created a semantic product vector', '768 dimensions'],
            ['02.2s', 'VECTOR_SEARCH', 'Retrieved catalog neighbors and duplicate candidates', '12 neighbors'],
            ['03.1s', 'Validation SQL', 'Applied taxonomy, List of Values, units, and source policy', '1 conflict'],
            ['03.9s', 'Review router', 'Impact-weighted uncertainty routed to Shikha', '1 action'],
          ].map(([time, name, detail, output], index) => <div className="trace-row" key={name}><span>{index + 1}</span><time>{time}</time><div><strong>{name}</strong><p>{detail}</p></div><b>{output}</b></div>)}</section>
          <section className="audit-note"><span>Demo transparency</span><p>This prototype uses deterministic sample telemetry. In production, every row maps to append-only pipeline runs, model versions, source checksums, and reviewer events.</p></section>
        </Drawer>
      )}

      {toast && <div className="toast" role="status" aria-live="polite"><span>✓</span>{toast}</div>}
    </main>
  );
}
