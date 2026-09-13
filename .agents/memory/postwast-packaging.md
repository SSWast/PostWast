---
name: PostWast package distribution
description: The non-obvious requirements for distributing PostWast to independent developers.
---

The public package must publish built ESM JavaScript, declaration files, README,
and public-use terms. Source-only exports and a private workspace package are
not sufficient for independent consumers. The Web Component entrypoint has a
registration side effect and must remain marked as such for bundlers.

**Why:** A developer outside this workspace cannot rely on TypeScript source
resolution or workspace aliases, and tree-shaking can silently remove custom
element registration.

**How to apply:** Keep package exports pointed at `dist`, run the package build
before packing, preserve the Web Component side-effect declaration, and verify
the tarball contents before release.