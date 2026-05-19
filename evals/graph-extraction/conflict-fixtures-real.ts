/**
 * Real-Skill Conflict Fixtures
 *
 * Conflict test pairs sourced from downloaded public skills (anthropics, daymade, ykdojo).
 */

export interface ConflictFixture {
  id: string;
  entryA: { title: string; body: string };
  entryB: { title: string; body: string };
  expectedConflictType: 'contradictory' | 'alternative' | 'superseded' | 'none';
}

export const realSkillConflictFixtures: ConflictFixture[] = [
  // 1. Contradictory: one says "use bold maximalism" vs another says "always use minimalism"
  {
    id: 'real-contradictory-design-philosophy',
    entryA: {
      title: 'Frontend Design',
      body: 'Create distinctive, production-grade frontend interfaces with high design quality. Before coding, commit to a BOLD aesthetic direction: pick an extreme like maximalist chaos, retro-futuristic, or luxury/refined. Bold maximalism works — execute with precision. NEVER use generic AI-generated aesthetics like overused font families or cliched color schemes. Maximalist designs need elaborate code with extensive animations and effects.',
    },
    entryB: {
      title: 'Clean UI Patterns',
      body: 'For production web interfaces, always use minimalist design principles. Strip away unnecessary visual elements. Use system fonts and neutral color palettes for maximum performance and accessibility. Avoid animations, elaborate effects, and bold visual choices — they distract from content and hurt performance. Keep CSS simple and use established component libraries.',
    },
    expectedConflictType: 'contradictory',
  },

  // 2. Contradictory: debugging approach — evidence-first vs assumption-first
  {
    id: 'real-contradictory-debug-approach',
    entryA: {
      title: 'Debugging Network Issues',
      body: 'Evidence-driven investigation methodology: apply falsification-first approach with layered isolation experiments. Never diagnose from one log line or one circumstantial data point. Slow down the reflex to jump to conclusions. The skill\'s job is to prevent assumption-stacking that wastes hours when a 10-minute layered experiment would resolve the issue.',
    },
    entryB: {
      title: 'Quick Debug Shortcut',
      body: 'When debugging network issues, start by checking the most common causes first: DNS resolution, firewall rules, and proxy configuration. In most cases the issue is one of these three things. If those look fine, check the application logs for the most recent error and fix that. Speed is more important than thoroughness in production incidents.',
    },
    expectedConflictType: 'contradictory',
  },

  // 3. Alternative: docx vs pdf for document output (same goal, different format)
  {
    id: 'real-alternative-docx-vs-pdf',
    entryA: {
      title: 'DOCX Document Generation',
      body: 'Create professional Word documents for reports, proposals, and documentation. A .docx file is a ZIP archive containing XML files. Support creating documents with formatting like tables of contents, headings, page numbers, letterheads. Best for collaborative editing, tracked changes, and documents that will be further edited by others.',
    },
    entryB: {
      title: 'PDF Processing',
      body: 'Create professional PDF documents for reports, presentations, and archival purposes. PDFs preserve exact formatting across all platforms and devices. Support creating PDFs with tables, charts, watermarks, and form fields. Best for final deliverables, print-ready documents, and content that should not be modified by recipients.',
    },
    expectedConflictType: 'alternative',
  },

  // 4. Alternative: research report vs fact-checking (same problem area, different approaches)
  {
    id: 'real-alternative-research-vs-factcheck',
    entryA: {
      title: 'Deep Research',
      body: 'Generate research reports through multi-pass synthesis: first gather sources, then analyze and cross-reference, finally synthesize into a structured report with citations. Produce comprehensive coverage of a topic with evidence tracking and source governance. The output is a complete document with findings, analysis, and recommendations.',
    },
    entryB: {
      title: 'Fact Checker',
      body: 'Instead of generating new research, verify existing factual claims in documents using web search and official sources. Check each claim individually against authoritative references, then propose specific corrections with user confirmation. The output is a list of verified claims with corrections where needed.',
    },
    expectedConflictType: 'alternative',
  },

  // 5. Alternative: cloning conversation vs handoff (same need, different approaches)
  {
    id: 'real-alternative-clone-vs-handoff',
    entryA: {
      title: 'Clone Conversation',
      body: 'Clone the current conversation so the user can branch off and try a different approach. Get the current session ID and project path, then run the clone script to create a full copy. The user can access the cloned conversation with claude -r and continue from the same point with a different strategy.',
    },
    entryB: {
      title: 'Handoff',
      body: 'Write or update a handoff document so the next agent with fresh context can continue this work. Capture current state, decisions made, open questions, and next steps in a structured document. Ensure continuity when context windows expire or when transitioning between agents or sessions.',
    },
    expectedConflictType: 'alternative',
  },

  // 6. Superseded: old network debugging approach superseded by evidence-driven one
  {
    id: 'real-superseded-network-debug',
    entryA: {
      title: 'Network Debug Basics',
      body: 'When debugging network issues, use ping and traceroute to check connectivity, then check if the port is open with netstat. If the server is responding, check the application logs for errors. Most issues can be resolved by restarting the service or checking firewall rules.',
    },
    entryB: {
      title: 'Debugging Network Issues',
      body: 'Evidence-driven investigation for network, streaming, and protocol-layer bugs. Applies falsification-first methodology — layered isolation experiments to pin down the responsible network layer. Use env-gated runtime instrumentation for non-invasive observation, and counter-review agent teams to challenge single-cause assumptions. This supersedes simple ping/traceroute approaches with systematic evidence gathering.',
    },
    expectedConflictType: 'superseded',
  },

  // 7. Superseded: old competitor analysis superseded by evidence-based approach
  {
    id: 'real-superseded-competitor-analysis',
    entryA: {
      title: 'Quick Competitor Review',
      body: 'Analyze competitors by visiting their websites and documentation. Summarize their features, pricing, and market positioning. Create a comparison table with key differentiators. This can be done quickly by reviewing public information and making informed assessments.',
    },
    entryB: {
      title: 'Competitors Analysis',
      body: 'Analyze competitor repositories with evidence-based approach. CRITICAL — all analysis must be based on actual cloned code, never assumptions. Clone competitor repos, examine actual implementations, track changes over time, and generate reports grounded in real code evidence rather than surface-level website reviews.',
    },
    expectedConflictType: 'superseded',
  },

  // 8. None: Excel automation and frontend design (different domains, same tools)
  {
    id: 'real-none-excel-vs-frontend',
    entryA: {
      title: 'Excel Automation',
      body: 'Create, parse, and control Excel files on macOS. Professional formatting with openpyxl, complex xlsm parsing with stdlib zipfile+xml for investment bank financial models, and Excel window control via AppleScript. Use when creating formatted Excel reports or parsing financial models.',
    },
    entryB: {
      title: 'Frontend Design',
      body: 'Create distinctive, production-grade frontend interfaces with high design quality. Build web components, pages, dashboards, React components, HTML/CSS layouts. Focus on typography, color themes, motion, spatial composition. Avoid generic AI aesthetics with bold creative choices.',
    },
    expectedConflictType: 'none',
  },

  // 9. None: GHA analysis and financial data (different domains, both data-oriented)
  {
    id: 'real-none-gha-vs-financial',
    entryA: {
      title: 'GitHub Actions Analyzer',
      body: 'Analyze GitHub Actions failures and identify root causes. Investigate workflow runs using the gh CLI. Examine logs, identify error patterns, and suggest fixes for CI/CD pipeline issues in GitHub-hosted and self-hosted runners.',
    },
    entryB: {
      title: 'Financial Data Collector',
      body: 'Collect real financial data for US publicly traded companies from free public sources. Output structured JSON with market data, historical financials, WACC inputs, and analyst estimates for DCF modeling and comps analysis.',
    },
    expectedConflictType: 'none',
  },

  // 10. None: Claude API and doc co-authoring (completely different domains)
  {
    id: 'real-none-api-vs-docs',
    entryA: {
      title: 'Claude API',
      body: 'Build, debug, and optimize Claude API and Anthropic SDK applications. Handle prompt caching, streaming, tool use, batch processing, and model selection. Supports Python and TypeScript SDKs with idiomatic patterns for building LLM-powered applications.',
    },
    entryB: {
      title: 'Document Co-authoring',
      body: 'Structured workflow for co-authoring documentation. Use when writing docs, proposals, technical specs, or decision documents. Helps users transfer context efficiently, refine content through iteration, and verify the doc works for readers with structured feedback loops.',
    },
    expectedConflictType: 'none',
  },
];
