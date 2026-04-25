# Artifacts

Use these commands when you need to export or activate a skill artifact.

## Export

```bash
trapmap artifact-export --artifact <artifactId> --format bundle-json --json
trapmap artifact-export --artifact <artifactId> --format distilled-json --json
trapmap artifact-export --artifact <artifactId> --format skill-dir --output ./out
```

Use `distilled-json` for quick agent inspection, `bundle-json` for complete archival, and `skill-dir` when materializing a Claude-compatible skill directory.

## Selective Activation

```bash
trapmap activate \
  --artifact <artifactId> \
  --paths references/guide.md,scripts/helper.ts \
  --output ./activated \
  --json
```

Activate only files needed for the current task. Do not fetch every reference/script by default.

Scripts may be blocked or require manual approval depending on their activation policy. Do not execute activated scripts unless the policy and the user/session permissions allow it.
