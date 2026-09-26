<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AURA OS project notes

- Product spec: `SPEC.md` (build stages in order; keep logic in `lib/`, layouts thin).
- Aura Battles platform (lobby, battles, squads, pose classifier, companion app, cards): `docs/aura-battles.md`.
- MOCK MODE must always work with zero API keys (`lib/env.ts`, `lib/fixtures.ts`).
- Design tokens live in `app/globals.css` (`@theme`). No rounded corners anywhere.
- Verify with `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
