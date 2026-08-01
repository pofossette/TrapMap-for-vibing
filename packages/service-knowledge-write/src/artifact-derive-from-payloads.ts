/**
 * Retrieval-grade derivation from actual file content (Phase 14 Task 1).
 *
 * These functions derive profile/capsule content from actual SKILL.md and reference
 * text, not just title/labels placeholders. (RETR-03, CAPS-04)
 */

import type { ArtifactFilePayloadRecord } from '@trapmap/contracts';
import type {
  DerivedSkillCapsuleRecord,
  DerivedSkillProfileRecord,
} from '@trapmap/service-knowledge-read/store.js';
import { enrichCapsules } from './artifact-derive/contextual-enrichment.js';
import { extractDerivationText } from './artifact-derive/extract-files.js';
import { buildCapsuleId, buildContentHash } from './artifact-derive/hash.js';
import {
  buildSummaryFromText,
  extractKeywords,
  extractSections,
  hasStructuredCapsuleSemantics,
  parseFrontmatter,
} from './artifact-derive/parse-content.js';
import type { DerivedArtifactOutputs, PayloadDerivationContext } from './artifact-derive/types.js';

/**
 * Derive profile and capsules from actual file payloads.
 * This is the retrieval-grade derivation that produces meaningful content
 * from SKILL.md and reference text (RETR-03, CAPS-04).
 *
 * T-12-09: Derive hashes from ordered SKILL.md + references/ text only
 * T-12-10: Exclude assets/ and scripts/ bodies from profile/capsule content
 * T-12-11: Derived outputs inherit governance from artifact root
 *
 * @param payloads - File payload records with actual content
 * @param context - Derivation context with artifact metadata
 * @returns Derived artifact outputs
 */
export async function deriveFromPayloads(
  payloads: ArtifactFilePayloadRecord[],
  context: PayloadDerivationContext,
): Promise<DerivedArtifactOutputs> {
  const derivedAt = new Date().toISOString();

  // Extract derivation-eligible text (SKILL.md + references/)
  const derivationText = extractDerivationText(payloads);

  // Get derivation-eligible payloads
  const derivationEligible = payloads
    .filter((p) => p.path === 'SKILL.md' || p.path.startsWith('references/'))
    .sort((a, b) => a.path.localeCompare(b.path));

  // Compute source hash from content
  const sourceHash = buildContentHash(derivationEligible.map((p) => p.sha256));

  // Parse frontmatter from SKILL.md if present
  const skillMdPayload = payloads.find((p) => p.path === 'SKILL.md');
  const frontmatter = skillMdPayload
    ? parseFrontmatter(skillMdPayload.content)
    : { title: null, labels: [] };

  // Use provided labels merged with frontmatter labels
  const allLabels = [...new Set([...context.labels, ...frontmatter.labels])];

  // Build profile from actual text
  const summary = buildSummaryFromText(derivationText);
  const keywords = extractKeywords(derivationText, allLabels);
  const referencePaths = derivationEligible
    .filter((p) => p.path.startsWith('references/'))
    .map((p) => p.path);

  // Build content hash from actual text
  const contentHash = buildContentHash([derivationText]);

  const profile: DerivedSkillProfileRecord | null =
    derivationEligible.length > 0
      ? {
          artifactId: context.artifactId,
          revision: 1, // Will be set by caller
          sourceHash,
          title: frontmatter.title ?? context.title,
          summary,
          keywords,
          referencePaths,
          contentHash,
        }
      : null;

  // Extract sections for capsules
  const sections = skillMdPayload
    ? extractSections(skillMdPayload.content)
    : { situation: null, problem: null, goal: null };

  // Build capsule(s) from content
  const capsules: DerivedSkillCapsuleRecord[] = [];

  if (derivationEligible.length > 0 && hasStructuredCapsuleSemantics(sections)) {
    // Generate primary capsule only when explicit semantic sections exist.
    const capsuleId = buildCapsuleId(context.artifactId, 1, sourceHash, 0);
    const capsuleContent = buildSummaryFromText(derivationText);

    capsules.push({
      capsuleId,
      artifactId: context.artifactId,
      revision: 1,
      sourcePaths: derivationEligible.map((p) => p.path),
      content: capsuleContent,
      situation: sections.situation,
      problem: sections.problem,
      goal: sections.goal,
      errorText: null,
      labels: allLabels.sort(),
      scope: context.scope,
      requiredLevel: context.requiredLevel,
    });

    // Generate additional capsules from reference files if they contain distinct content
    const referencePayloads = derivationEligible.filter((p) => p.path.startsWith('references/'));

    for (const refPayload of referencePayloads) {
      if (capsules.length >= 5) break;
      const refContent = refPayload.content;

      // Check if this reference has meaningful distinct content
      const refSections = extractSections(refContent);
      if (hasStructuredCapsuleSemantics(refSections)) {
        const refCapsuleId = buildCapsuleId(context.artifactId, 1, sourceHash, capsules.length);
        const refCapsuleContent = buildSummaryFromText(refContent);

        capsules.push({
          capsuleId: refCapsuleId,
          artifactId: context.artifactId,
          revision: 1,
          sourcePaths: [refPayload.path],
          content: refCapsuleContent,
          situation: refSections.situation,
          problem: refSections.problem,
          goal: refSections.goal,
          errorText: null,
          labels: allLabels.sort(),
          scope: context.scope,
          requiredLevel: context.requiredLevel,
        });
      }
    }
  }

  // Contextual enrichment: generate contextualPrefix for each capsule
  if (context.chat && capsules.length > 0) {
    const enrichmentResult = await enrichCapsules(capsules, {
      chat: context.chat,
      documentTitle: context.title,
      labels: allLabels,
      documentContent: derivationText,
      sourceHash,
      ...(context.enrichmentCache ? { cache: context.enrichmentCache } : {}),
      ...(context.enrichmentEnabled !== undefined
        ? { enrichmentEnabled: context.enrichmentEnabled }
        : {}),
    });
    capsules.splice(0, capsules.length, ...enrichmentResult.capsules);
  }

  // Build client manifest for all files
  const referenceFiles = payloads.filter((p) => p.path.startsWith('references/'));
  const assetFiles = payloads.filter((p) => p.path.startsWith('assets/'));
  const scriptFiles = payloads.filter((p) => p.path.startsWith('scripts/'));

  const clientManifest: DerivedArtifactOutputs['clientManifest'] =
    referenceFiles.length > 0 || assetFiles.length > 0 || scriptFiles.length > 0
      ? {
          artifactId: context.artifactId,
          revision: 1,
          references: referenceFiles
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((p) => ({
              path: p.path,
              sha256: p.sha256,
              sizeBytes: p.sizeBytes,
              mediaType: p.mediaType,
            })),
          assets: assetFiles
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((p) => ({
              path: p.path,
              sha256: p.sha256,
              sizeBytes: p.sizeBytes,
              mediaType: p.mediaType,
            })),
          scripts: scriptFiles
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((p) => ({
              path: p.path,
              sha256: p.sha256,
              capability: `Script: ${p.path}`,
              argsSchemaSummary: '',
              sideEffectSummary: '',
              defaultPolicy: 'manual' as const,
            })),
          sourceHash,
        }
      : null;

  return {
    profile,
    capsules,
    clientManifest,
    sourceHash,
    derivedAt,
  };
}
