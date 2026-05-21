/**
 * Real-Skill Graph Extraction Fixtures
 *
 * Graph extraction test cases from actual downloaded SKILL.md content.
 * Input text is excerpted from real skills; expected nodes/edges are manually annotated.
 */

import type { ExpectedEdge, ExpectedNode } from './fixtures.js';

export interface GraphExtractionFixture {
  id: string;
  input: string;
  expectedNodes: ExpectedNode[];
  expectedEdges: ExpectedEdge[];
}

export const realSkillGraphFixtures: GraphExtractionFixture[] = [
  // 1. Frontend design — multiple tools, design patterns
  {
    id: 'real-frontend-design',
    input:
      'Create distinctive frontend interfaces using React and HTML/CSS. Use CSS variables for color consistency with a cohesive aesthetic theme. Implement animations with the Motion library for React components. Use typography pairings with a distinctive display font and a refined body font. Avoid generic fonts like Arial and Inter — opt instead for distinctive choices. Apply scroll-triggering and hover states for micro-interactions.',
    expectedNodes: [
      { kind: 'tool', label: 'react' },
      { kind: 'tool', label: 'html' },
      { kind: 'tool', label: 'css' },
      { kind: 'skill', label: 'frontend-design' },
      { kind: 'mitigation', label: 'use-css-variables' },
      { kind: 'mitigation', label: 'use-motion-library' },
    ],
    expectedEdges: [
      { source: 'react', target: 'frontend-design', type: 'co-occurs-with', strength: 'hard' },
      {
        source: 'use-css-variables',
        target: 'frontend-design',
        type: 'mitigates',
        strength: 'soft',
      },
      { source: 'use-motion-library', target: 'react', type: 'co-occurs-with', strength: 'soft' },
    ],
  },

  // 2. Webapp testing — tool chain, prerequisites
  {
    id: 'real-webapp-testing',
    input:
      'To test local web applications, write native Python Playwright scripts. Use the with_server.py helper to manage server lifecycle for multiple servers. Always run scripts with --help first before reading the source. For static HTML, read the file directly to identify selectors, then write a Playwright script. For dynamic webapps, check if the server is already running before proceeding.',
    expectedNodes: [
      { kind: 'tool', label: 'playwright' },
      { kind: 'tool', label: 'python' },
      { kind: 'skill', label: 'webapp-testing' },
      { kind: 'prerequisite', label: 'check-server-running' },
      { kind: 'mitigation', label: 'run-help-first' },
    ],
    expectedEdges: [
      { source: 'playwright', target: 'webapp-testing', type: 'co-occurs-with', strength: 'hard' },
      { source: 'python', target: 'playwright', type: 'requires', strength: 'hard' },
      { source: 'check-server-running', target: 'webapp-testing', type: 'order', strength: 'soft' },
      { source: 'run-help-first', target: 'webapp-testing', type: 'order', strength: 'hard' },
    ],
  },

  // 3. Network debugging — traps, cues, mitigations
  {
    id: 'real-network-debugging',
    input:
      'When debugging ECONNRESET errors or HTTP/2 RST_STREAM issues, apply falsification-first methodology. Never diagnose from one log line — use layered isolation experiments instead. Common traps include jumping to conclusions from a single error in the logs. Use env-gated runtime instrumentation for non-invasive observation. Set up counter-review agent teams to challenge single-cause assumptions. The symptom "fails after N seconds" often indicates a CDN or proxy idle timeout, not an application bug.',
    expectedNodes: [
      { kind: 'trap', label: 'jumping-to-conclusions' },
      { kind: 'cue', label: 'econnreset' },
      { kind: 'cue', label: 'fails-after-n-seconds' },
      { kind: 'mitigation', label: 'layered-isolation' },
      { kind: 'mitigation', label: 'runtime-instrumentation' },
      { kind: 'tool', label: 'cdn' },
    ],
    expectedEdges: [
      {
        source: 'layered-isolation',
        target: 'jumping-to-conclusions',
        type: 'mitigates',
        strength: 'hard',
      },
      {
        source: 'runtime-instrumentation',
        target: 'econnreset',
        type: 'mitigates',
        strength: 'soft',
      },
      { source: 'cdn', target: 'fails-after-n-seconds', type: 'co-occurs-with', strength: 'soft' },
      {
        source: 'econnreset',
        target: 'jumping-to-conclusions',
        type: 'risk-blocks',
        strength: 'soft',
      },
    ],
  },

  // 4. Excel automation — tool chain, environment-specific
  {
    id: 'real-excel-automation',
    input:
      'Create professional Excel files using openpyxl with Python. For complex xlsm financial models from investment banks, use stdlib zipfile and xml parsing because openpyxl cannot handle all macro-enabled formats. On macOS, use AppleScript to control Excel window positioning and screen capture. Requires Python 3.8+ and openpyxl installed via pip.',
    expectedNodes: [
      { kind: 'tool', label: 'openpyxl' },
      { kind: 'tool', label: 'python' },
      { kind: 'tool', label: 'excel' },
      { kind: 'environment', label: 'macos' },
      { kind: 'prerequisite', label: 'python-3.8' },
      { kind: 'mitigation', label: 'use-zipfile-xml-parsing' },
    ],
    expectedEdges: [
      { source: 'python', target: 'openpyxl', type: 'requires', strength: 'hard' },
      { source: 'openpyxl', target: 'excel', type: 'co-occurs-with', strength: 'hard' },
      {
        source: 'use-zipfile-xml-parsing',
        target: 'openpyxl',
        type: 'mitigates',
        strength: 'hard',
      },
      { source: 'macos', target: 'excel', type: 'co-occurs-with', strength: 'soft' },
      { source: 'python-3.8', target: 'python', type: 'requires', strength: 'hard' },
    ],
  },

  // 5. Claude API — SDK patterns, prerequisites, order
  {
    id: 'real-claude-api',
    input:
      'Build Claude API applications using the official Anthropic SDK. Before starting, scan the target file for non-Anthropic provider markers like import openai or gpt-4 — if found, stop and ask the user. Use prompt caching to reduce costs and latency. For streaming responses, use the streaming API. When migrating from older models, update the model ID and test tool use compatibility. Always include error handling for rate limits and API timeouts.',
    expectedNodes: [
      { kind: 'tool', label: 'anthropic-sdk' },
      { kind: 'skill', label: 'claude-api' },
      { kind: 'prerequisite', label: 'scan-for-provider-markers' },
      { kind: 'mitigation', label: 'use-prompt-caching' },
      { kind: 'trap', label: 'rate-limit-errors' },
      { kind: 'mitigation', label: 'handle-rate-limits' },
    ],
    expectedEdges: [
      { source: 'anthropic-sdk', target: 'claude-api', type: 'requires', strength: 'hard' },
      {
        source: 'scan-for-provider-markers',
        target: 'claude-api',
        type: 'order',
        strength: 'hard',
      },
      { source: 'use-prompt-caching', target: 'claude-api', type: 'mitigates', strength: 'soft' },
      {
        source: 'handle-rate-limits',
        target: 'rate-limit-errors',
        type: 'mitigates',
        strength: 'hard',
      },
      { source: 'rate-limit-errors', target: 'claude-api', type: 'risk-blocks', strength: 'soft' },
    ],
  },
];
