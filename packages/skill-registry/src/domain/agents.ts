/**
 * Copied from ai-skills apps/cli/src/agents/registry.ts & targets.ts
 * Centralized agent definitions for multi-agent install (claude-code, codex, cursor, agents)
 */
export const AGENT_DEFINITIONS: Record<string, { displayName: string; skillsDir: string; globalSkillsDir: string }> = {
  'claude-code': { displayName: 'Claude Code', skillsDir: '.claude/skills', globalSkillsDir: '.claude/skills' },
  'codex': { displayName: 'Codex', skillsDir: '.codex/skills', globalSkillsDir: '.codex/skills' },
  'cursor': { displayName: 'Cursor', skillsDir: '.cursor/skills', globalSkillsDir: '.cursor/skills' },
  'windsurf': { displayName: 'Windsurf', skillsDir: '.windsurf/skills', globalSkillsDir: '.windsurf/skills' },
  'copilot': { displayName: 'Copilot', skillsDir: '.github/skills', globalSkillsDir: '.github/skills' },
  'agents': { displayName: 'Agents (universal)', skillsDir: '.agents/skills', globalSkillsDir: '.agents/skills' },
  'trapmap': { displayName: 'TrapMap', skillsDir: '.trapmap/skills', globalSkillsDir: '.trapmap/skills' },
};

export function getAgent(id: string) {
  return AGENT_DEFINITIONS[id] ?? AGENT_DEFINITIONS['trapmap'];
}

export function listAgents() {
  return Object.keys(AGENT_DEFINITIONS);
}
