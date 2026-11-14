import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { runAxeScan } from '../src/scanner/axe-adapter';

/**
 * Bundled, on-demand scanner entrypoint. This is NOT a registered content
 * script: the background injects scanner.js after the user clicks Analyze and
 * activeTab grants temporary access to the active tab. WXT assigns the
 * returned scan promise to `globalThis.fixfirstAxeScan`; the background reads
 * that value through a second executeScript call in the same isolated world.
 * No page message channel is used.
 */
export default defineUnlistedScript({
  main: () => runAxeScan(document),
  globalName: 'fixfirstAxeScan',
});
