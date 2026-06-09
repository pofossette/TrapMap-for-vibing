/**
 * Block renderer for DiveLog parsed content.
 *
 * Receives the `parsed_blocks` JSONB array from knowledge_entries
 * and renders each block according to its type.
 *
 * Block types:
 *   - text:       plain paragraph
 *   - heading:    section heading (level 1-3)
 *   - list:       ordered or unordered list
 *   - code:       syntax-highlighted code block
 *   - warning:    caution/note callout
 *   - callout:    informational callout
 *   - dive_summary: structured dive summary (depth, time, site)
 */

// ---------------------------------------------------------------------------
// Block type definitions
// ---------------------------------------------------------------------------

export interface TextBlock {
  type: 'text';
  content: string;
}

export interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3;
  content: string;
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: string[];
}

export interface CodeBlock {
  type: 'code';
  language?: string;
  content: string;
}

export interface WarningBlock {
  type: 'warning';
  content: string;
}

export interface CalloutBlock {
  type: 'callout';
  content: string;
}

export interface DiveSummaryBlock {
  type: 'dive_summary';
  site: string;
  depth?: number;
  duration?: number;
  notes?: string;
}

export type DiveLogBlock =
  | TextBlock
  | HeadingBlock
  | ListBlock
  | CodeBlock
  | WarningBlock
  | CalloutBlock
  | DiveSummaryBlock;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BlockRendererProps {
  blocks: DiveLogBlock[];
}

// ---------------------------------------------------------------------------
// Single block renderer
// ---------------------------------------------------------------------------

function renderBlock(block: DiveLogBlock, index: number): JSX.Element {
  switch (block.type) {
    case 'text':
      return <p key={index}>{block.content}</p>;

    case 'heading': {
      switch (block.level) {
        case 1:
          return <h1 key={index}>{block.content}</h1>;
        case 2:
          return <h2 key={index}>{block.content}</h2>;
        case 3:
          return <h3 key={index}>{block.content}</h3>;
      }
      break;
    }

    case 'list': {
      const items = block.items.map((item, i) => <li key={i}>{item}</li>);
      return block.ordered ? (
        <ol key={index}>{items}</ol>
      ) : (
        <ul key={index}>{items}</ul>
      );
    }

    case 'code':
      return (
        <pre key={index}>
          <code className={block.language ? `language-${block.language}` : undefined}>
            {block.content}
          </code>
        </pre>
      );

    case 'warning':
      return (
        <div key={index} role="alert" className="block-warning">
          {block.content}
        </div>
      );

    case 'callout':
      return (
        <div key={index} className="block-callout">
          {block.content}
        </div>
      );

    case 'dive_summary':
      return (
        <div key={index} className="block-dive-summary">
          <strong>{block.site}</strong>
          {block.depth != null && <span> — {block.depth}m</span>}
          {block.duration != null && <span> / {block.duration}min</span>}
          {block.notes && <p>{block.notes}</p>}
        </div>
      );

    default: {
      // Exhaustive check — unreachable if all union branches are handled
      const _exhaustive: never = block as never;
      return <div key={index}>Unknown block type</div>;
    }
  }

  // Fallback (should be unreachable due to exhaustive switch above)
  return <div key={index}>Unknown block type</div>;
}

// ---------------------------------------------------------------------------
// Top-level component
// ---------------------------------------------------------------------------

/**
 * Renders an array of DiveLog content blocks.
 *
 * Usage:
 * ```tsx
 * <BlockRenderer blocks={entry.parsedBlocks} />
 * ```
 */
export function BlockRenderer({ blocks }: BlockRendererProps): JSX.Element {
  return <div className="dive-log-blocks">{blocks.map(renderBlock)}</div>;
}
