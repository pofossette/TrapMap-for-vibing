import { searchExperienceGenesTool } from './experience-gene.js';
import {
  completeRemediationTool,
  getReviewDetailTool,
  listReviewQueueTool,
  reviewDecisionTool,
} from './governance-tools.js';
import { searchKnowledgeTool } from './search-knowledge.js';
import type { ToolDefinition } from './shared.js';
import { readSkillFilesTool } from './skill-files.js';
import { getSkillManifestTool } from './skill-manifest.js';
import { submitFeedbackTool } from './submit-feedback.js';
import { submitKnowledgeTool } from './submit-knowledge.js';
import { submitSkillDraftTool } from './submit-skill-draft.js';

/**
 * Registry of all TrapMap MCP tools. Populated by the tool-group tasks
 * (B3 read tools, B4 draft write tools, B5 governance tools).
 */
export const allTools: ToolDefinition[] = [
  searchKnowledgeTool,
  searchExperienceGenesTool,
  getSkillManifestTool,
  readSkillFilesTool,
  submitKnowledgeTool,
  submitSkillDraftTool,
  submitFeedbackTool,
  listReviewQueueTool,
  getReviewDetailTool,
  reviewDecisionTool,
  completeRemediationTool,
];
