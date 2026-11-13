# Otp Agent Guide

This app was scaffolded with `remix new`. Use these conventions when continuing to build it out.

## Commands

```sh
bun i
bun run dev
bun run hmr
bun run hmr:lan
bun run start
bun test
bun run typecheck
```

Use `bun run hmr` for live server and browser updates (`bun run hmr:lan` exposes it to devices on your Wi-Fi); `bun run dev` only watches and restarts the server. `bun run start` runs in production mode without a separate build step.

## Architecture Map

`ARCHITECTURE.md` is the map of the system: the components, one line on what each does, and Mermaid diagrams of how they connect. Read it first to find your way around. `CONTEXT.md` holds the vocabulary and `docs/adr/` holds the decisions.

Keep the map current as you work. It is part of the change, not a follow-up:

- **Update `ARCHITECTURE.md` in the same PR** whenever you add, remove, rename or rewire a component. That covers a new module in `app/lib/`, a new folder in `app/actions/public/`, a new route, a new external service or storage, or a change to how data flows between parts. Update both the table row and any diagram the change touches.
- Keep each description to one line that says what the component does, not how. Link the ADR when there is one.
- `app/architecture.test.ts` fails when a component on disk is missing from the map or the map names a path that no longer exists. It can't check the arrows, so check that the diagrams still match the code.
- Start every PR description with an **Architecture** line: either `no change` or one sentence on what changed in the map.

## Building Features

Refer to ./.agents/skills/remix/SKILL.md for the Remix mental model and how to find guides and API READMEs through `node_modules/remix/INDEX.md`.

## Starter Layout

- `app/routes.ts` defines the shared route contract used by server and browser modules for type-safe hrefs
- `app/router.ts` wires routes to controllers and installs the standard Remix component renderer used by actions
- Put top-level route actions in `app/actions/controller.tsx`; add `app/actions/<route-key>/controller.tsx` for nested route maps. `app/actions/controller.test.ts` is the root controller's router smoke test
- `app/actions/home-page.tsx` and `app/actions/document.tsx` render the route-owned starter UI
- `app/actions/public/` contains the browser runtime entry and the client components it hydrates
- `app/assets.ts` owns the server-side asset pipeline used by the asset route and render middleware
- Root `public/` contains static files served unchanged from the app root
- `app/ui/theme.ts` holds the design tokens Document applies to `<html>`. Style with `v('--token')` and `space(n)` rather than literal values: colors are OKLCH, lengths are rem (px only for hairlines and pointer math). Add a token there before reaching for a new one-off value

This starter intentionally begins small; add directories like `app/data/`, `app/middleware/`, `app/ui/`, and `test/` only when you need them.
