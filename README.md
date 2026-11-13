# FixFirst — Accessibility Audit Browser Extension

Scans the page you are on for accessibility issues (contrast, missing alt text, unlabeled
controls, …) and produces a plain-English report with suggested fixes you can copy. AI
suggestions are optional and **bring-your-own-key**: no built-in API, no account, no backend.

> 📐 Implementation plan, architecture, and the full task checklist live in
> [`docs/ACCESSIBILITY_EXTENSION_PLAN.md`](docs/ACCESSIBILITY_EXTENSION_PLAN.md).

## Current status

**Phase 0 + Phase 1 implemented and verified** (scaffold, extension shell, contracts, settings/key storage, side-panel UI with consent UX, tests, quality gates — lint/typecheck/tests/build all green). Two runtime spike checks (T01/T02) still want a 2-minute manual pass after loading the unpacked build; see the plan's handoff checklist. The deterministic page scanner ships in Phase 2 — clicking **Analyze** reports that honestly rather than scanning.

## Getting started

```bash
npm install          # also runs `wxt prepare` to generate .wxt types
npm run icons        # regenerate public/icon/*.png (only needed if icons change)
npm run dev          # development build with HMR
npm run verify       # lint + typecheck + tests + production build
```

Load the unpacked build in Chrome:

1. Run `npm run build` (output: `.output/chrome-mv3/`).
2. Open `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select `.output/chrome-mv3/`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | WXT dev server with auto-reload |
| `npm run build` | Production MV3 build |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (typescript-eslint + react-hooks) |
| `npm test` | Vitest unit/component tests |
| `npm run verify` | All of the above in order |

## Permissions (why each exists)

| Permission | Why |
|---|---|
| `activeTab` + `scripting` | Inject the scanner into the **active tab only when the user clicks Analyze**. No permanent page access. |
| `storage` | Settings and — only if the user explicitly opts in — the API key on this device. Never synced. |
| `sidePanel` | The report UI lives in Chrome's side panel. |
| `optional_host_permissions: https://*/*` | **Declared but never auto-granted.** A specific `https://host/*` is requested at runtime only for a user-configured AI endpoint. |

## Privacy and security ground rules

- No API keys, page content, or findings ever leave the browser unless the user configures an
  AI endpoint, gives consent, and runs an AI analysis.
- The local scan is fully local; it never calls the network.
- Keys are stored only in memory (session) or unencrypted `chrome.storage.local` (explicit
  opt-in), are never synced, logged, or echoed back to the UI.
- The extension never edits the audited page; "copy fix" only copies text.

## Repository layout

```
entrypoints/          WXT entrypoints (background service worker, side panel UI)
src/shared/           Typed contracts + runtime validation shared by all contexts
src/background/       Settings/key service and the message router
src/storage/          Settings/key storage adapter (chrome.storage or in-memory for tests)
src/components/       React UI (App, SettingsView, StatusRegion)
src/styles/           Side panel styles
tests/                Vitest unit, service, and component tests
scripts/              Dependency-free icon generator
docs/                 Build plan (task checklist, architecture, resume protocol)
```
