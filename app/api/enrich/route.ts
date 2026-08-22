export const runtime = 'edge';

type Seed = { part: string; description: string; brand?: string; manufacturer?: string };
type Source = { title: string; url: string };
type UploadedFile = { name: string; type: string; data: string; size: number };

const MODEL = 'gemini-2.5-flash';
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv']);

function jsonLine(controller: ReadableStreamDefaultController, payload: unknown) {
  controller.enqueue(new TextEncoder().encode(`${JSON.stringify(payload)}\n`));
}

async function gemini(apiKey: string, body: unknown) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = (data.error as { message?: string } | undefined)?.message || `Gemini request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
}

function modelText(data: Record<string, unknown>) {
  const candidates = data.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  return candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
}

function sourcesFrom(data: Record<string, unknown>): Source[] {
  const candidates = data.candidates as Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } }> | undefined;
  const sources = (candidates?.[0]?.groundingMetadata?.groundingChunks || []).map((chunk) => ({ title: chunk.web?.title || 'Web source', url: chunk.web?.uri || '' })).filter((source) => source.url);
  return [...new Map(sources.map((source) => [source.url, source])).values()].slice(0, 8);
}

function parseModelJson(text: string) {
  const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(clean); } catch {
    const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error('The model returned an unreadable product record. Please retry.');
  }
}

function validateOutput(raw: Record<string, unknown>, headers: string[], seed: Seed, sources: Source[]) {
  const proposed = (raw.product || {}) as Record<string, unknown>;
  const output = Object.fromEntries(headers.map((header) => [header, typeof proposed[header] === 'string' || typeof proposed[header] === 'number' ? String(proposed[header]) : '']));
  if (headers.includes('Mfg_Part_Num') && !output.Mfg_Part_Num) output.Mfg_Part_Num = seed.part;
  if (headers.includes('MANUFACTURER_PART_NUMBER') && !output.MANUFACTURER_PART_NUMBER) output.MANUFACTURER_PART_NUMBER = seed.part;
  if (headers.includes('Part_Desc') && !output.Part_Desc) output.Part_Desc = seed.description;
  const claims = Array.isArray(raw.claims) ? raw.claims.filter((claim): claim is Record<string, unknown> => !!claim && typeof claim === 'object').map((claim) => ({
    field: String(claim.field || ''), value: String(claim.value || ''), confidence: Math.max(0, Math.min(100, Number(claim.confidence) || 0)),
    evidence: String(claim.evidence || ''), sourceUrl: String(claim.sourceUrl || ''), sourceType: String(claim.sourceType || 'inference'),
  })).filter((claim) => claim.field && headers.includes(claim.field)) : [];
  const core = ['MANUFACTURER_PART_NUMBER', 'MANUFACTURER_NAME', 'BRAND_NAME', 'Product Name', 'Dept', 'Class', 'Fine', 'SHORT_DESC'];
  const coreCoverage = core.filter((field) => output[field]).length / core.length;
  const citedClaims = claims.filter((claim) => claim.sourceUrl || /input|document|image/i.test(claim.sourceType)).length;
  const evidenceRate = claims.length ? citedClaims / claims.length : 0;
  const averageClaim = claims.length ? claims.reduce((sum, claim) => sum + claim.confidence, 0) / claims.length : 0;
  const score = Math.round(Math.min(99, averageClaim * .55 + coreCoverage * 25 + evidenceRate * 20));
  const issues = [!output.MANUFACTURER_NAME && 'Manufacturer unresolved', !output.BRAND_NAME && 'Brand unresolved', !output.Fine && 'Taxonomy unresolved', !sources.length && 'No grounded web source returned', evidenceRate < .6 && 'Some claims need stronger evidence'].filter(Boolean);
  return { output, claims, score, issues, approved: false, sources };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: 'The AI service is not configured.' }, { status: 503 });
  let seed: Seed; let headers: string[]; let files: UploadedFile[];
  try { const body = await request.json() as { seed?: Seed; headers?: string[]; files?: UploadedFile[] }; seed = body.seed || {} as Seed; headers = body.headers || []; files = (body.files || []).slice(0, 4); } catch { return Response.json({ error: 'Invalid product request.' }, { status: 400 }); }
  if (!seed.part?.trim() || !seed.description?.trim() || !headers.length) return Response.json({ error: 'Part number, description, and output schema are required.' }, { status: 400 });
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) return Response.json({ error: `${file.name} is larger than 8 MB.` }, { status: 413 });
    if (!ACCEPTED_TYPES.has(file.type)) return Response.json({ error: `${file.name} is not a supported PDF, image, text, or CSV file.` }, { status: 415 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        jsonLine(controller, { type: 'agent', index: 0, state: 'working', message: 'Searching manufacturer and trusted distributor sources' });
        const identity = [seed.manufacturer, seed.brand, seed.part, seed.description].filter(Boolean).join(' | ');
        const research = await gemini(apiKey, {
          contents: [{ role: 'user', parts: [{ text: `You are the Web Research Agent for an industrial product intelligence system. Research this exact product identity: ${identity}. Prioritize manufacturer pages, official datasheets, standards bodies, and reputable distributors. Find verifiable specifications, identifiers, documents, images, taxonomy clues, packaging, dimensions, warranty, country of origin, and safety/compliance information. Clearly separate exact-product evidence from product-family inference. Do not guess. Produce a concise evidence dossier with source names and URLs.` }] }],
          tools: [{ google_search: {} }], generationConfig: { temperature: 0.1 },
        });
        const researchText = modelText(research); const sources = sourcesFrom(research);
        jsonLine(controller, { type: 'agent', index: 0, state: 'done', message: `${sources.length} grounded web sources retrieved` });
        jsonLine(controller, { type: 'agent', index: 1, state: 'working', message: files.length ? `Reading ${files.length} uploaded document/image source(s)` : 'Analyzing the supplied product seed' });
        const fileParts = files.map((file) => ({ inlineData: { mimeType: file.type, data: file.data } }));
        jsonLine(controller, { type: 'agent', index: 1, state: 'done', message: files.length ? 'Document and image evidence extracted' : 'Seed evidence extracted' });
        jsonLine(controller, { type: 'agent', index: 2, state: 'working', message: 'Running RAG and generating the commerce record' });
        const schemaPrompt = `You are the Orchestrator, RAG, Catalog, and Content Agents for industrial product enrichment.\n\nINPUT SEED:\n${JSON.stringify(seed)}\n\nGROUNDED WEB DOSSIER:\n${researchText}\n\nREQUIRED OUTPUT HEADERS (exact spelling):\n${JSON.stringify(headers)}\n\nUse the web dossier and attached files as retrieval context. Populate an exact-product commerce record. Never transfer a fact from a similar model unless you label it as an inference and lower confidence. Leave unsupported fields as empty strings. Preserve every required header exactly; do not add fields inside product. Generate concise channel-ready descriptions, approved-style taxonomy, normalized units, attributes, assets, identifiers, and compliance fields when evidenced. Return JSON only in this shape: {"product":{"HEADER":"value"},"claims":[{"field":"required header","value":"value","confidence":0,"evidence":"specific excerpt or reasoning","sourceUrl":"URL if web sourced","sourceType":"input|web|pdf|image|rag_inference"}]}. Include a claim for each non-empty enriched field.`;
        const synthesis = await gemini(apiKey, {
          contents: [{ role: 'user', parts: [...fileParts, { text: schemaPrompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        });
        const raw = parseModelJson(modelText(synthesis)) as Record<string, unknown>;
        jsonLine(controller, { type: 'agent', index: 2, state: 'done', message: 'RAG enrichment and content generation complete' });
        jsonLine(controller, { type: 'agent', index: 3, state: 'working', message: 'Checking schema, evidence coverage, and confidence' });
        const result = validateOutput(raw, headers, seed, sources);
        jsonLine(controller, { type: 'agent', index: 3, state: 'done', message: `${headers.length} headers validated; ${result.claims.length} traceable claims` });
        jsonLine(controller, { type: 'result', result });
      } catch (error) {
        jsonLine(controller, { type: 'error', error: error instanceof Error ? error.message : 'The agent run failed.' });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
