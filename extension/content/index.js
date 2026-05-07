// content/index.js
// Boots bilingual.js and routes popup toggle messages.
//
// Pref semantics:
//   bilingualEnabled (bool, default true)
//     true  → 双语对照 (source + translation both visible)
//     false → 仅显示译文 (replace mode — source hidden via CSS)
//   site:<hostname> (bool, optional)
//     true  → force-translate this site
//     false → never translate this site (master kill switch)
//     unset → translate by default
//
// Translation runs whenever the site isn't explicitly disabled. The toggle
// in the popup only changes display mode, it doesn't enable/disable
// translation any more.

'use strict';

(function () {
  let bilingualActive = false;

  function getSiteKey() {
    return 'site:' + location.hostname;
  }

  function modeFromBool(boolish) {
    return boolish === false ? 'replace' : 'bilingual';
  }

  function bootBilingual(displayMode) {
    if (!bilingualActive) {
      window.ttBilingual.init();
      bilingualActive = true;
    }
    window.ttBilingual.setDisplayMode?.(displayMode);
  }

  function shutdownBilingual() {
    if (bilingualActive) {
      window.ttBilingual.destroy();
      bilingualActive = false;
    }
  }

  // ─── Init from saved prefs ──────────────────────────────────────────
  chrome.storage.local.get(
    { bilingualEnabled: true, hoverEnabled: false },
    prefs => {
      chrome.storage.local.get([getSiteKey()], sitePrefs => {
        const siteEnabled = sitePrefs[getSiteKey()];
        const siteAllows  = (siteEnabled === false) ? false : true;

        if (siteAllows) {
          bootBilingual(modeFromBool(prefs.bilingualEnabled));
        }
        if (window.ttBilingual?.setHover) {
          window.ttBilingual.setHover(prefs.hoverEnabled);
        }
      });
    }
  );

  // ─── Toggle messages from popup ────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'TOGGLE_BILINGUAL') {
      // Repurposed: this no longer enables/disables translation, it
      // switches between bilingual ↔ replace display modes. Translation
      // is on whenever the site allows it.
      const mode = modeFromBool(msg.enabled);
      try {
        console.log('[tt-content] TOGGLE_BILINGUAL', {
          enabled: msg.enabled,
          mode,
          bilingualActive,
        });
      } catch (_) {}
      if (bilingualActive) {
        window.ttBilingual.setDisplayMode?.(mode);
      } else {
        // First toggle on a brand-new site: also start translating.
        bootBilingual(mode);
      }
    }

    if (msg.type === 'TOGGLE_HOVER') {
      window.ttBilingual?.setHover?.(msg.enabled);
    }

    if (msg.type === 'TOGGLE_SITE') {
      const key = getSiteKey();
      if (msg.enabled === null) {
        chrome.storage.local.remove(key);
      } else {
        chrome.storage.local.set({ [key]: msg.enabled });
      }
      if (msg.enabled === false) {
        shutdownBilingual();
      } else {
        chrome.storage.local.get({ bilingualEnabled: true }, prefs => {
          bootBilingual(modeFromBool(prefs.bilingualEnabled));
        });
      }
    }

    if (msg.type === 'RETRY_ALL') {
      if (bilingualActive && window.ttBilingual.retryAll) {
        window.ttBilingual.retryAll();
      }
    }
  });
})();
