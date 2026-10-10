# Upstream provenance

- Source repository: `dmmulroy/anti-slop` (installed through the `install-anti-slop` skill bundle).
- Exact source commit: unknown; the installer bundle did not provide a verifiable source revision or pristine snapshot identifier.
- Installed generic plugin: `tools/oxlint/anti-slop/index.ts` and its adjacent `rules/`, `shared/`, and `vendor/` assets.
- Installed Effect plugin assets: `tools/oxlint/anti-slop/effect/` are included but not registered; this project has no direct `effect` dependency.
- Intentional deviations: none to the vendored rule sources. Registration and rule configuration live in `vite.config.ts`.
