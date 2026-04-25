# Review

Use these commands when you need to inspect submission state or process review queues.

## Knowledge Review

```bash
trapmap review-status --json
trapmap review-status <entryId> --json

trapmap review:queue --json
trapmap review:approve <entryId> --notes "Approved: reusable and verified." --json
trapmap review:reject <entryId> --notes "Rejected: duplicate or lacks evidence." --json
```

## Skill Review

```bash
trapmap skill review:queue --json
trapmap skill review:approve <artifactId> --notes "Approved: concise and scoped." --json
trapmap skill review:reject <artifactId> --notes "Rejected: needs clearer trigger." --json
```

Approve only when:

- The trigger is specific enough for automatic agent use.
- The content is compact and action-oriented.
- The workflow has a verification command or observable confirmation.
- The artifact avoids secrets, private paths, and raw transcripts.

Reject or request edits when the artifact is documentation-heavy, duplicates an existing skill/trap, lacks an `AVOID` warning for known failure modes, or invents unsupported CLI flags.

## Duplicate Resolution

```bash
trapmap skill duplicate-job fetch <candidateId> --json
trapmap skill duplicate-job resolve <candidateId> \
  --decision independent \
  --notes "Distinct enough to keep." \
  --json
trapmap skill duplicate-job apply-resolution <candidateId> --json
```

For merged duplicate decisions, include `--merged-with <entityId>` and `--merged-type trap|skill`.
