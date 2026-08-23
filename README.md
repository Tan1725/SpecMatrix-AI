# ⚡ Catalyst Lens — Autonomous Multi-Agent Product Intelligence Platform

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-blue?style=flat-square&logo=react)](https://react.dev/)
[![Gemini 2.5](https://img.shields.io/badge/Google_Gemini-2.5_Flash-orange?style=flat-square&logo=google)](https://ai.google.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vercel](https://img.shields.io/badge/Deployment-Vercel_Edge-black?style=flat-square&logo=vercel)](https://vercel.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

> **Enterprise-Grade AI Product Content & Catalog Enrichment Engine for Industrial Distributors & B2B E-Commerce**  
> Transforms raw, incomplete, and ambiguous manufacturer part feeds into standardized, high-conversion, **252-column commerce catalogs** with full evidence traceability and zero schema drift.

---

## 🌟 Overview

Distributor catalog data is notoriously challenging: cryptic manufacturer part numbers, truncated descriptions, missing units of measure (UOM), and absent technical specifications prevent buyers from finding the right parts online.

**Catalyst Lens** solves this at scale using a cooperative **Multi-Agent AI Architecture**. It autonomously extracts, validates, standardizes, and enriches industrial product data across web sources, manufacturer specification sheets, and engineering diagrams into a unified, 252-header delivery standard.

---

## 🤖 Multi-Agent Pipeline Architecture

```mermaid
flowchart TD
    subgraph Inputs [Multimodal Ingestion]
        A1[Raw Seed Text: MPN / Brand / Description]
        A2[Technical PDF Datasheets]
        A3[Engineering CAD & Product Images]
        A4[1,000+ SKU Batch Feeds]
    end

    Inputs --> Orchestrator{Agentic Orchestrator}

    subgraph AgenticEngine [4-Agent Autonomous Intelligence Pipeline]
        direction TB
        Agent1[1. Web Research Agent\n• Google Search Grounding\n• Manufacturer Entity Resolution\n• Verifiable Source Citation]
        Agent2[2. Document + Vision Agent\n• Multimodal PDF & Image OCR\n• Technical Drawing Spec Parsing\n• Dimensional Tolerances & UOMs]
        Agent3[3. RAG Catalog Agent\n• 3-Tier Taxonomy Mapping (Dept > Class > Fine)\n• 5 Multi-Channel Description Generation\n• 252 Static Commerce Header Synthesis]
        Agent4[4. Validation & Guardrails Agent\n• LOV (List of Values) Enforcement\n• Measurement Unit Normalization\n• Hallucination Bounding & Confidence Scoring]

        Agent1 --> Agent2
        Agent2 --> Agent3
        Agent3 --> Agent4
    end

    Orchestrator --> AgenticEngine

    subgraph Outputs [Enterprise Deliverables]
        Out1[252-Column Commerce Schema]
        Out2[Slide-Over Inspection Drawer with Citations]
        Out3[Formatted Excel .xlsx Export]
        Out4[Standard Delivery CSV Export]
    end

    Agent4 --> Outputs
```

---

## 🚀 Key Features

### 1. 📐 100% 252-Column Delivery Schema Compliance
Generates production-ready catalog records mapped across all 252 delivery headers with strict adherence to standard formatting:
- **5 Multi-Channel Description Formats**:
  - `SHORT_DESC`: Concise, high-relevance search title (≤120 characters).
  - `MOBILE_DESC`: Structured mobile app layout (≤80 characters).
  - `INVOICE_DESC`: Standardized uppercase ERP invoice descriptor (≤40 characters).
  - `LONG_DESC1`: In-depth commercial product specification for web product detail pages.
  - `RETAIL_DESC` & `MARKETING_DESCRIPTION`: Customer-facing promotional copy.
- **50 Standardized Attribute Triplets**: Up to 50 individual attribute specifications structured as `ATTRIBUTE_LABEL n`, `ATTRIBUTE_VALUE n`, and `ATTRIBUTE_UOM n`.
- **20 Item Features**: Key selling points and mechanical specifications (`ITEM_FEATURES_1..20`).
- **Digital Assets & Compliance**: Asset filenames, official specification sheet references, manufacturer resource links, warranty statements, and Prop 65 compliance flags.

### 2. 📄 Autonomous Multimodal PDF & Image Ingestion
- Upload **any PDF datasheet** or **product/diagram image** without entering text fields.
- The **Document + Vision Agent** inspects the document via Gemini Multimodal Vision, extracts the Part Number, Manufacturer, Brand, dimensional ratings, voltage/pressure tolerances, and features, and triggers full catalog synthesis autonomously.

### 3. 🎯 Single-Product Focus & Table Isolation
- Click any product row or preset pill to isolate the table to **only that selected product**.
- Instant slide-over **Inspector Drawer** displays all 252 populated headers, 3-tier taxonomy breadcrumbs, normalized LOV attributes, and source evidence citations.
- Restore the full 1,000-catalog view anytime with a single click.

### 4. 📦 1,000-Item Batch Processing Engine
- High-throughput asynchronous enrichment pipeline for processing entire distributor catalogs.
- Real-time streaming progress indicators with active SKU logging and speed metrics.
- Export entire catalog results to **CSV** or multi-sheet **Excel (`.xlsx`)**.

---

## 📋 252 Delivery Schema Structure

| Column Group | Delivery Headers | Description |
| :--- | :--- | :--- |
| **Product Identifiers** | `PART_NUMBER`, `Mfg_Part_Num`, `MANUFACTURER_PART_NUMBER`, `Part_Desc` | Canonical SKU resolution & distributor cross-reference |
| **Brand & Manufacturer** | `BRAND_NAME`, `MANUFACTURER_NAME` | Normalized brand and corporate parent entities |
| **3-Tier Taxonomy** | `Dept`, `Class`, `Fine`, `Classpath` | Standardized category hierarchy (e.g. `Industrial Supplies>Valves>Industrial Valves`) |
| **Product Names** | `Product Name`, `MARKETING_DESCRIPTION` | Standardized commerce title and marketing summary |
| **Multi-Channel Descriptions** | `SHORT_DESC`, `MOBILE_DESC`, `INVOICE_DESC`, `LONG_DESC1`, `RETAIL_DESC` | Multi-channel formatted descriptors tailored for web, mobile, and ERP |
| **Digital Assets & Policies** | `MFR URL`, `Product Image`, `Specification Sheet`, `Actual Image (Yes/No)`, `Warranty`, `Prop 65`, `Selling Qty`, `Selling UOM` | Verified asset filenames, manufacturer URLs, packaging units, and safety flags |
| **Product Features** | `ITEM_FEATURES_1` through `ITEM_FEATURES_20` | Extracted product capabilities and operational highlights |
| **Product Attributes** | `ATTRIBUTE_LABEL 1..50`, `ATTRIBUTE_VALUE 1..50`, `ATTRIBUTE_UOM 1..50` | Standardized attribute triplets with normalized units of measure |

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js**: `v20.x` or `v22.x`
- **Package Manager**: `pnpm` (recommended), `npm`, or `yarn`
- **Google Gemini API Key**: (Optional for built-in sample presets; required for arbitrary product discovery and document vision)

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/catalyst-lens.git

# Navigate into the project folder
cd catalyst-console

# Install dependencies
pnpm install
```

### 2. Configure Environment Variables
Create a `.env.local` file in the root of the project:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```
*(Note: `.env.local` is excluded by `.gitignore` to prevent leaking API credentials).*

### 3. Start Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
```bash
pnpm build
pnpm start
```

---

## 🌐 Deployment to Vercel

Catalyst Lens is optimized for serverless edge deployment on Vercel:

```bash
# Deploy preview
vercel

# Deploy to production
vercel --prod
```

### Setting Environment Variables in Vercel:
1. Navigate to your project on the [Vercel Dashboard](https://vercel.com/dashboard).
2. Go to **Settings > Environment Variables**.
3. Add `GEMINI_API_KEY` with your API key.
4. Save and redeploy.

---

## 🔒 Security & Best Practices

- **Zero Credential Leaks**: All local secrets, `.env*` files, and temporary artifacts are ignored by Git.
- **Graceful Quota Resilience**: The pipeline includes intelligent fallback parsing to handle rate limits seamlessly without crashing or interrupting active batch operations.
- **Strict Evidence Grounding**: Every generated specification is audited and assigned a confidence score backed by source evidence citations.

---

## 📄 License
This project is licensed under the MIT License.
