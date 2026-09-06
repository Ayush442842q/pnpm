---
"@pnpm/resolving.npm-resolver": patch
"@pnpm/cache.api": patch
"pnpm": patch
"pacquet": patch
---

Registries that share a host but differ by URL path — one JFrog Artifactory, Nexus, AWS CodeArtifact or GitLab Packages instance serving several repositories — now get a metadata cache directory each. Previously they shared one, so resolving a package from one of them could answer with another's versions, integrity hashes and tarball URLs and fail with `ERR_PNPM_TARBALL_URL_MISMATCH` [#13558](https://github.com/pnpm/pnpm/issues/13558).
