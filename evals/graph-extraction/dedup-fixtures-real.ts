/**
 * Real-Skill Dedup Fixtures
 *
 * Dedup test pairs sourced from downloaded public skills (anthropics, daymade, ykdojo).
 */

export interface DedupFixture {
  id: string;
  candidate: { title: string; body: string };
  existing: { title: string; body: string };
  expectedOverlapType: 'exact' | 'semantic' | 'none';
}

export const realSkillDedupFixtures: DedupFixture[] = [
  // 1. Exact: brand-guidelines copied verbatim across repos
  {
    id: 'real-exact-brand-guidelines',
    candidate: {
      title: 'Brand Guidelines',
      body: "Applies Anthropic's official brand colors and typography to any sort of artifact. Main colors include Anthropic Orange (#D97706) and Claude Cream (#FAF5EE). Typography uses specific font pairings for headings and body text. Covers branding, corporate identity, visual identity, post-processing, styling, brand colors, typography, visual formatting.",
    },
    existing: {
      title: 'Brand Guidelines',
      body: "Applies Anthropic's official brand colors and typography to any sort of artifact. Main colors include Anthropic Orange (#D97706) and Claude Cream (#FAF5EE). Typography uses specific font pairings for headings and body text. Covers branding, corporate identity, visual identity, post-processing, styling, brand colors, typography, visual formatting.",
    },
    expectedOverlapType: 'exact',
  },

  // 2. Exact: canvas-design identical across repos
  {
    id: 'real-exact-canvas-design',
    candidate: {
      title: 'Canvas Design',
      body: 'Create interactive, visually rich HTML5 canvas experiences. Use when asked to build generative art, particle systems, interactive visualizations, data simulations, or animated scenes. Supports physics simulations, procedural generation, and real-time user interaction with Canvas API and WebGL.',
    },
    existing: {
      title: 'Canvas Design',
      body: 'Create interactive, visually rich HTML5 canvas experiences. Use when asked to build generative art, particle systems, interactive visualizations, data simulations, or animated scenes. Supports physics simulations, procedural generation, and real-time user interaction with Canvas API and WebGL.',
    },
    expectedOverlapType: 'exact',
  },

  // 3. Semantic: docx vs pdf (both document generation, different formats)
  {
    id: 'real-semantic-docx-vs-pdf',
    candidate: {
      title: 'DOCX Document Generation',
      body: 'Create, read, edit, and manipulate Word documents (.docx files). A .docx file is a ZIP archive containing XML files. Support creating professional documents with formatting like tables of contents, headings, page numbers, letterheads. Extract or reorganize content, insert images, perform find-and-replace, work with tracked changes or comments.',
    },
    existing: {
      title: 'PDF Processing',
      body: 'Process PDF files including reading and extracting text/tables, combining or merging multiple PDFs, splitting PDFs apart, rotating pages, adding watermarks, creating new PDFs, filling PDF forms, encrypting/decrypting PDFs, extracting images, and OCR on scanned PDFs. Uses Python libraries like pypdf, pdfplumber, reportlab.',
    },
    expectedOverlapType: 'semantic',
  },

  // 4. Semantic: debugging-network-issues vs cloudflare-troubleshooting (both troubleshooting)
  {
    id: 'real-semantic-network-vs-cloudflare',
    candidate: {
      title: 'Debugging Network Issues',
      body: 'Evidence-driven investigation for network, streaming, and protocol-layer bugs. Use when debugging connection resets (ECONNRESET, HTTP/2 RST_STREAM), SSE stalls, CDN/proxy idle timeouts, or any incident where symptoms do not match the obvious cause. Applies falsification-first methodology with layered isolation experiments and counter-review agent teams.',
    },
    existing: {
      title: 'Cloudflare Troubleshooting',
      body: 'Investigate and resolve Cloudflare configuration issues using API-driven evidence gathering. Use when troubleshooting ERR_TOO_MANY_REDIRECTS, SSL errors, DNS issues, or any Cloudflare-related problems. Focus on systematic investigation using Cloudflare API to examine actual configuration rather than making assumptions.',
    },
    expectedOverlapType: 'semantic',
  },

  // 5. Semantic: deep-research vs fact-checker (both research/verification)
  {
    id: 'real-semantic-research-vs-factcheck',
    candidate: {
      title: 'Deep Research',
      body: 'Generate format-controlled research reports with evidence tracking, citations, source governance, and multi-pass synthesis. Use for literature reviews, market analysis, competitive landscape, policy or technical briefs. Features source-type governance, freshness checks, mandatory counter-review, and citation registry.',
    },
    existing: {
      title: 'Fact Checker',
      body: 'Verifies factual claims in documents using web search and official sources, then proposes corrections with user confirmation. Use when the user asks to fact-check, verify information, validate claims, check accuracy, or update outdated information. Supports AI model specs, technical documentation, statistics, and general factual statements.',
    },
    expectedOverlapType: 'semantic',
  },

  // 6. Semantic: financial-data-collector vs competitors-analysis (both data gathering/analysis)
  {
    id: 'real-semantic-financial-vs-competitors',
    candidate: {
      title: 'Financial Data Collector',
      body: 'Collect real financial data for any US publicly traded company from free public sources. Output structured JSON with market data (price, shares, beta), historical financials (income statement, cash flow, balance sheet), WACC inputs, and analyst estimates. Handles DCF inputs, comps analysis, and earnings review data.',
    },
    existing: {
      title: 'Competitors Analysis',
      body: 'Analyze competitor repositories with evidence-based approach. Use when tracking competitors, creating competitor profiles, or generating competitive analysis. All analysis must be based on actual cloned code, never assumptions. Supports adding competitors, generating reports, and tracking changes over time.',
    },
    expectedOverlapType: 'semantic',
  },

  // 7. Semantic: frontend-design vs webapp-testing (both frontend-related)
  {
    id: 'real-semantic-frontend-vs-testing',
    candidate: {
      title: 'Frontend Design',
      body: 'Create distinctive, production-grade frontend interfaces with high design quality. Build web components, pages, dashboards, React components, HTML/CSS layouts. Focus on typography, color themes, motion, spatial composition. Avoid generic AI aesthetics. Generate creative, polished code with exceptional attention to aesthetic details.',
    },
    existing: {
      title: 'Webapp Testing',
      body: 'Toolkit for interacting with and testing local web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, and viewing browser logs. Write Python Playwright scripts for testing web apps, including server lifecycle management and element interaction.',
    },
    expectedOverlapType: 'semantic',
  },

  // 8. Semantic: doc-coauthoring vs handoff (both document/workflow management)
  {
    id: 'real-semantic-doccoauthoring-vs-handoff',
    candidate: {
      title: 'Document Co-authoring',
      body: 'Structured workflow for co-authoring documentation. Use when writing docs, proposals, technical specs, decision docs, or similar structured content. Helps users efficiently transfer context, refine content through iteration, and verify the doc works for readers. Includes templates and feedback loops.',
    },
    existing: {
      title: 'Handoff',
      body: 'Write or update a handoff document so the next agent with fresh context can continue this work. Captures current state, decisions made, open questions, and next steps. Ensures continuity when context windows expire or when transitioning between agents or sessions.',
    },
    expectedOverlapType: 'semantic',
  },

  // 9. Semantic: handoff-oriented skill descriptions with different packaging.
  // Exercises the skill-side embedding + keyword recall path in Phase 3.
  {
    id: 'real-semantic-handoff-vs-doccoauthoring',
    candidate: {
      title: 'Engineering Handoff Notes',
      body: 'Prepare structured handoff notes for the next engineer or agent. Capture current implementation state, key decisions, unresolved risks, verification status, and concrete next actions so the next contributor can resume work without rebuilding context.',
    },
    existing: {
      title: 'Document Co-authoring',
      body: 'Structured workflow for co-authoring documentation. Use when writing docs, proposals, technical specs, decision docs, or similar structured content. Helps users efficiently transfer context, refine content through iteration, and verify the doc works for readers. Includes templates and feedback loops.',
    },
    expectedOverlapType: 'semantic',
  },

  // 10. None: claude-api vs excel-automation (completely different domains)
  {
    id: 'real-none-api-vs-excel',
    candidate: {
      title: 'Claude API',
      body: 'Build, debug, and optimize Claude API and Anthropic SDK applications. Handle prompt caching, streaming, tool use, batch processing, and model selection. Migrate code between Claude model versions. Supports Python and TypeScript SDKs with idiomatic patterns for each language.',
    },
    existing: {
      title: 'Excel Automation',
      body: 'Create, parse, and control Excel files on macOS. Professional formatting with openpyxl, complex xlsm parsing with stdlib zipfile+xml for investment bank financial models, and Excel window control via AppleScript. Use when creating formatted Excel reports, parsing financial models, or automating Excel on macOS.',
    },
    expectedOverlapType: 'none',
  },

  // 11. None: PostgreSQL-heavy skills that should recall but not dedupe.
  // Serves as a false-positive control for the mixed skill recall path.
  {
    id: 'real-none-postgres-tuning-vs-backup',
    candidate: {
      title: 'PostgreSQL Query Tuning',
      body: 'Tune slow PostgreSQL queries with EXPLAIN ANALYZE, index review, and planner inspection. Focus on latency reduction for OLTP workloads, hot query paths, and production-safe measurement.',
    },
    existing: {
      title: 'PostgreSQL Backup Recovery',
      body: 'Design PostgreSQL backup and restore workflows using WAL archiving, base backups, and recovery drills. Focus on RPO/RTO validation, restore correctness, and disaster recovery operations.',
    },
    expectedOverlapType: 'none',
  },

  // 12. None: gha (GitHub Actions) vs algorithmic-art (different domains)
  {
    id: 'real-none-gha-vs-art',
    candidate: {
      title: 'GitHub Actions Analyzer',
      body: 'Analyze GitHub Actions failures and identify root causes. Investigate workflow runs using the gh CLI to find what workflow or job failed, when, and on which commit. Examine logs, identify error patterns, and suggest fixes for CI/CD pipeline issues.',
    },
    existing: {
      title: 'Algorithmic Art',
      body: 'Create generative art using mathematical algorithms, fractals, noise functions, and procedural techniques. Build visual compositions with HTML5 Canvas, SVG, or WebGL. Support particle systems, L-systems, cellular automata, and interactive visual experiments for artistic expression.',
    },
    expectedOverlapType: 'none',
  },

  // 13. Trap exact: same trap entry with paraphrased body wording.
  // The trap canonical fingerprint (shortcut + detail + sorted labels) is
  // expected to match here, exercising the Phase 1 trap exact-fingerprint
  // lane. Jaccard scoring of the title + body text typically misses the
  // exact classification for this kind of wording change.
  {
    id: 'real-trap-exact-rmrf-quill',
    candidate: {
      title: 'Quill editor removes formatting on paste',
      body: 'When pasting rich text into Quill, the default clipboard matcher strips all but plain text formatting. Preserve pasted styles by registering a custom clipboard matcher that maps the incoming HTML to Quill delta operations, or sanitize the input HTML and reapply the desired formats after the paste event.',
    },
    existing: {
      title: 'Quill paste strips formatting',
      body: 'Pasting rich content into the Quill editor drops all formatting by default — Quill applies a plain-text clipboard matcher that ignores HTML structure. To keep styles on paste, register a custom clipboard matcher that converts the incoming HTML to Quill delta operations, or pre-process the pasted HTML and reapply the desired formatting after the paste.',
    },
    expectedOverlapType: 'exact',
  },
];
