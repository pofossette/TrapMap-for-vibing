import type { Context } from '@deepseek-ai/cordis';
import type { ZodType } from 'zod';

/** The cordis context handed to each node's `apply`. */
export type AssemblyContext = Context;

/** Deployment topology of a capability node. */
export type NodeTopology = 'embedded' | 'standalone' | 'cluster';

/**
 * A capability node: a cordis plugin (with declarative dependency metadata)
 * plus assembly-facing contract/topology declarations.
 */
export interface CapabilityNode<C = unknown> {
  /** Required, non-empty node identifier; unique within an assembly. */
  id: string;
  /** Contract id this node provides. */
  contract?: string;
  /** Contract ids whose implementation this node satisfies (validated at build). */
  implements?: string | string[];
  /** Cordis service name(s) this node provides. */
  provides?: string | string[];
  /** Required cordis service name(s) this node loads only once available. */
  inject?: readonly string[];
  /** Zod schema that cordis validates the node config against before apply. */
  configSchema?: ZodType<C>;
  /** Deployment topology (defaults to `standalone` when absent). */
  topology?: NodeTopology;
  /** Ids of child nodes attached to this node (e.g. sub-workers). */
  children?: readonly string[];
  /** Cluster declaration (replicas >= 1); only meaningful for cluster topology. */
  cluster?: { readonly replicas: number };
  /** Plugin body; may return a disposer registered by cordis on unload. */
  apply: (ctx: AssemblyContext, config: C) => unknown;
}

/** A contract-first descriptor used to validate capability nodes at build time. */
export interface ContractDescriptor {
  /** Required, non-empty contract id. */
  id: string;
  description?: string;
  /** Service name(s) the contract requires nodes to provide. */
  provides?: readonly string[];
  /** Optional config schema this contract's nodes must satisfy. */
  configSchema?: ZodType;
  /**
   * Returns contract violations for a node claiming this contract;
   * an empty array means the node satisfies the contract.
   */
  verify?: (node: CapabilityNode) => readonly string[];
}

/** A single startup validation finding. */
export interface StartupIssue {
  /** Stable machine-readable code (e.g. `DUPLICATE_NODE_ID`). */
  code: string;
  message: string;
  /** Node id the issue refers to, when applicable. */
  nodeId?: string;
}

/**
 * Thrown by `AssemblyBuilder.build()` when startup checks report issues.
 * The aggregated message lists every issue for fast localization.
 */
export class AssemblyStartupError extends Error {
  readonly issues: readonly StartupIssue[];

  constructor(issues: readonly StartupIssue[]) {
    const body = issues
      .map((issue) => {
        const where = issue.nodeId !== undefined ? ` [${issue.nodeId}]` : '';
        return `  - ${issue.code}${where}: ${issue.message}`;
      })
      .join('\n');
    super(`Assembly startup failed with ${issues.length} issue(s):\n${body}`);
    this.name = 'AssemblyStartupError';
    this.issues = issues;
  }
}
