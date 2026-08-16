import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis';
import {
  type ShutdownController,
  type ShutdownControllerOptions,
  createShutdownController,
} from './shutdown-controller.js';
import { startupChecks } from './startup-checks.js';
import type { AssemblyContext, CapabilityNode, ContractDescriptor } from './types.js';
import { AssemblyStartupError } from './types.js';

/** Options for {@link createAssembly}. */
export interface AssemblyOptions {
  /** Contract registry used for contract-first build-time checks. */
  contracts?: readonly ContractDescriptor[];
}

/** A running, cordis-backed assembly. */
export interface RunningAssembly {
  /** The cordis root context hosting every node's fiber. */
  ctx: Context;
  /** Unload every node fiber in reverse registration order. */
  dispose(): Promise<void>;
  /** Build a bounded shutdown controller around {@link dispose}. */
  createShutdownController(options?: ShutdownControllerOptions): ShutdownController;
}

/** A validated, bootable assembly (read-only node list). */
export interface Assembly {
  readonly nodes: readonly CapabilityNode[];
  boot(): Promise<RunningAssembly>;
}

/** Fluent assembly builder that fails loudly on invalid structure. */
export interface AssemblyBuilder {
  add<C>(node: CapabilityNode<C>, config?: C): AssemblyBuilder;
  build(): Assembly;
}

interface BuilderEntry {
  node: CapabilityNode<any>;
  config: unknown;
}

/** Bridge a capability node into a cordis object plugin (conditional optional props). */
function toCordisPlugin(node: CapabilityNode<any>): Plugin.Object<any> {
  const plugin: Plugin.Object<any> = {
    name: node.id,
    apply: (assembledCtx: AssemblyContext, config: any): unknown =>
      node.apply(assembledCtx, config),
  };
  if (node.configSchema !== undefined) plugin.Config = node.configSchema;
  if (node.inject !== undefined) plugin.inject = [...node.inject];
  if (node.provides !== undefined) plugin.provide = node.provides;
  return plugin;
}

/**
 * Create an assembly builder. `.add()` collects capability nodes in order;
 * `.build()` runs startup checks (throwing {@link AssemblyStartupError} on
 * any issue) and returns a bootable {@link Assembly}.
 */
export function createAssembly(options: AssemblyOptions = {}): AssemblyBuilder {
  const contracts = options.contracts ?? [];
  const entries: BuilderEntry[] = [];

  return {
    add<C>(node: CapabilityNode<C>, config?: C): AssemblyBuilder {
      if (entries.some((entry) => entry.node.id === node.id)) {
        throw new Error(`Assembly: duplicate node id "${node.id}"`);
      }
      entries.push({ node, config });
      return this;
    },

    build(): Assembly {
      const nodes = entries.map((entry) => entry.node);
      const issues = startupChecks(nodes, contracts);
      if (issues.length > 0) {
        throw new AssemblyStartupError(issues);
      }
      const snapshot = entries.slice();

      return {
        nodes: Object.freeze(nodes),

        async boot(): Promise<RunningAssembly> {
          const ctx = new Context();
          const fibers: Fiber[] = [];

          for (const entry of snapshot) {
            fibers.push(ctx.plugin(toCordisPlugin(entry.node), entry.config));
          }
          await Promise.all(fibers);

          const dispose = async (): Promise<void> => {
            for (let index = fibers.length - 1; index >= 0; index -= 1) {
              await fibers[index]!.dispose();
            }
          };

          return {
            ctx,
            dispose,
            createShutdownController(controllerOptions?: ShutdownControllerOptions) {
              return createShutdownController(dispose, controllerOptions);
            },
          };
        },
      };
    },
  };
}
