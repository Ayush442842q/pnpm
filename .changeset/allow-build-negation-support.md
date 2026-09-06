---
"@pnpm/building.commands": patch
"@pnpm/building.policy": patch
"@pnpm/installing.commands": patch
"pnpm": patch
"pacquet": patch
---

Build scripts can now be rejected before the package is installed [#14067](https://github.com/pnpm/pnpm/issues/14067):

- `pnpm add --allow-build=!<pkg>` records `<pkg>: false` in `allowBuilds` instead of a `!<pkg>: true` entry that never matched anything.
- `pnpm approve-builds <pkg>` and `pnpm approve-builds !<pkg>` now record their decision even when no packages are awaiting approval. A package that is not awaiting approval is reported with a warning instead of an error, so a typo is still visible.
