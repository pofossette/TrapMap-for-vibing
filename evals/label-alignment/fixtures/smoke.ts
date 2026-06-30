import type { LabelAlignmentEvalFixture } from '../../../packages/contracts/src/domain/evals/label-alignment.js';

export const smokeFixtures: LabelAlignmentEvalFixture[] = [
  {
    schemaVersion: 1,
    fixtureId: 'react-hooks-trap-labels',
    skillId: 'skill/react-hooks-trap',
    description: 'Label alignment smoke cases around React hooks failure modes.',
    tags: ['smoke', 'frontend', 'trap'],
    cases: [
      {
        schemaVersion: 1,
        caseId: 'react-hooks-catalog-populated',
        skillId: 'skill/react-hooks-trap',
        variantId: 'catalog-populated',
        variantGroupId: 'react-hooks-timeout-group',
        tier: 'smoke',
        synonymGroupCount: 2,
        totalRawLabels: 4,
        totalCanonicalLabels: 3,
        catalogSeed: [
          {
            id: 'lbl_react_stale_closure',
            canonicalName: 'react-stale-closure',
            aliases: ['stale closure', 'stale state bug'],
            kind: 'trap',
          },
          {
            id: 'lbl_react_duplicate_key',
            canonicalName: 'react-duplicate-key',
            aliases: ['duplicate key warning'],
            kind: 'trap',
          },
        ],
        embeddingEnabled: true,
        goldenAnnotations: [
          {
            rawLabel: 'stale closure',
            canonicalLabel: 'react-stale-closure',
            groupId: 'g-stale',
            shouldMerge: true,
          },
          {
            rawLabel: 'stale state bug',
            canonicalLabel: 'react-stale-closure',
            groupId: 'g-stale',
            shouldMerge: true,
          },
          {
            rawLabel: 'duplicate key warning',
            canonicalLabel: 'react-duplicate-key',
            groupId: 'g-key',
            shouldMerge: true,
          },
          {
            rawLabel: 'render loop',
            canonicalLabel: 'react-render-loop',
            groupId: 'g-loop',
            shouldMerge: false,
          },
        ],
        expectedAlignment: {
          canonicalGroups: [
            ['stale closure', 'stale state bug'],
            ['duplicate key warning'],
            ['render loop'],
          ],
          shouldNotMerge: [
            ['stale closure', 'render loop'],
            ['duplicate key warning', 'render loop'],
          ],
        },
        tags: ['catalog-populated', 'embedding'],
      },
      {
        schemaVersion: 1,
        caseId: 'react-hooks-catalog-empty',
        skillId: 'skill/react-hooks-trap',
        variantId: 'catalog-empty',
        variantGroupId: 'react-hooks-empty-group',
        tier: 'smoke',
        synonymGroupCount: 2,
        totalRawLabels: 3,
        totalCanonicalLabels: 2,
        catalogSeed: [],
        embeddingEnabled: false,
        goldenAnnotations: [
          {
            rawLabel: 'effect race',
            canonicalLabel: 'react-effect-race',
            groupId: 'g-race',
            shouldMerge: true,
          },
          {
            rawLabel: 'async state race',
            canonicalLabel: 'react-effect-race',
            groupId: 'g-race',
            shouldMerge: true,
          },
          {
            rawLabel: 'hydration mismatch',
            canonicalLabel: 'react-hydration-mismatch',
            groupId: 'g-hydration',
            shouldMerge: false,
          },
        ],
        expectedAlignment: {
          canonicalGroups: [['effect race', 'async state race'], ['hydration mismatch']],
          shouldNotMerge: [['effect race', 'hydration mismatch']],
        },
        tags: ['catalog-empty'],
      },
    ],
  },
  {
    schemaVersion: 1,
    fixtureId: 'backend-timeout-labels',
    skillId: 'skill/api-pagination-trap',
    description: 'Backend pagination and timeout labels reused from trap fixtures.',
    tags: ['smoke', 'backend', 'trap'],
    cases: [
      {
        schemaVersion: 1,
        caseId: 'backend-pagination-catalog-populated',
        skillId: 'skill/api-pagination-trap',
        variantId: 'catalog-populated',
        variantGroupId: 'backend-pagination-group',
        tier: 'smoke',
        synonymGroupCount: 2,
        totalRawLabels: 3,
        totalCanonicalLabels: 2,
        catalogSeed: [
          {
            id: 'lbl_api_pagination_missing',
            canonicalName: 'api-pagination-missing',
            aliases: ['missing pagination', 'unbounded list endpoint'],
            kind: 'trap',
          },
        ],
        embeddingEnabled: false,
        goldenAnnotations: [
          {
            rawLabel: 'missing pagination',
            canonicalLabel: 'api-pagination-missing',
            groupId: 'g-pagination',
            shouldMerge: true,
          },
          {
            rawLabel: 'unbounded list endpoint',
            canonicalLabel: 'api-pagination-missing',
            groupId: 'g-pagination',
            shouldMerge: true,
          },
          {
            rawLabel: 'connection pool exhaustion',
            canonicalLabel: 'db-connection-pool-exhaustion',
            groupId: 'g-pool',
            shouldMerge: false,
          },
        ],
        expectedAlignment: {
          canonicalGroups: [
            ['missing pagination', 'unbounded list endpoint'],
            ['connection pool exhaustion'],
          ],
          shouldNotMerge: [['missing pagination', 'connection pool exhaustion']],
        },
        tags: ['near-match-guard'],
      },
      {
        schemaVersion: 1,
        caseId: 'backend-pagination-catalog-empty',
        skillId: 'skill/api-pagination-trap',
        variantId: 'catalog-empty',
        variantGroupId: 'backend-pagination-empty-group',
        tier: 'smoke',
        synonymGroupCount: 2,
        totalRawLabels: 3,
        totalCanonicalLabels: 2,
        catalogSeed: [],
        embeddingEnabled: false,
        goldenAnnotations: [
          {
            rawLabel: 'missing pagination',
            canonicalLabel: 'api-pagination-missing',
            groupId: 'g-pagination',
            shouldMerge: true,
          },
          {
            rawLabel: 'unbounded list endpoint',
            canonicalLabel: 'api-pagination-missing',
            groupId: 'g-pagination',
            shouldMerge: true,
          },
          {
            rawLabel: 'connection pool exhaustion',
            canonicalLabel: 'db-connection-pool-exhaustion',
            groupId: 'g-pool',
            shouldMerge: false,
          },
        ],
        expectedAlignment: {
          canonicalGroups: [
            ['missing pagination', 'unbounded list endpoint'],
            ['connection pool exhaustion'],
          ],
          shouldNotMerge: [['missing pagination', 'connection pool exhaustion']],
        },
        tags: ['catalog-empty', 'near-match-guard'],
      },
    ],
  },
];
