import { defineConfig } from 'wxt';

// Manifest V3 configuration. Permissions follow the least-privilege design in
// docs/ACCESSIBILITY_EXTENSION_PLAN.md:
// - storage: settings + explicit opt-in device key storage
// - activeTab + scripting: on-demand scan of the tab the user chose to analyze
//   (no permanent <all_urls> host access; scanner ships in Phase 2, T11+)
// - sidePanel: report UI (added automatically by WXT for the sidepanel entry)
// - optional_host_permissions: broad pattern is DECLARED but never granted
//   automatically; a specific https://host/* origin is requested at runtime
//   only for a user-configured BYOK AI endpoint (T02, T10).
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FixFirst — Accessibility Audit',
    short_name: 'FixFirst',
    description:
      'Scan the page you are on for accessibility issues and get plain-English fix suggestions. Bring your own AI key.',
    version: '0.1.0',
    permissions: ['storage', 'activeTab', 'scripting'],
    optional_host_permissions: ['https://*/*'],
    icons: {
      '16': 'icon/16.png',
      '32': 'icon/32.png',
      '48': 'icon/48.png',
      '128': 'icon/128.png',
    },
  },
});
