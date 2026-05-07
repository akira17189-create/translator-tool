// content/index.js
// Boots bilingual.js and routes popup toggle messages.
//
// Pref semantics:
//   translateEnabled (bool, default true)
//     Master kill switch. Off = NO translation anywhere, period.
//   bilingualEnabled (bool, default true)
//     Display mode when translation runs.
//       true  → 双语对照 (source + translation both visible)
//       false → 仅显示译文 (replace mode — source hidden via CSS)
//   site:<hostname> (bool, default true)
//     Per-site override.
//       false → never translate this site
//       true / undefined → translate this site (subject to master)
//   hoverEnabled (bool, default false)
//     Ctrl+' on hover triggers single-paragraph translate.

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

  function shouldTranslate(prefs, sitePrefs) {
    // Master kill switch beats everything.
    if (prefs.translateEnabled === false) return false;
    // Per-site explicit OFF beats default.
    const siteVal = sitePrefs[getSiteKey()];
    if (siteVal === false) return false;
    // Otherwise translate.
    return true;
  }

  // ─── Init from saved prefs ──────────────────────────────────────────
  chrome.storage.local.get(
    { translateEnabled: true, bilingualEnabled: true, hoverEnabled: false },
    prefs => {
      chrome.storage.local.get([getSiteKey()], sitePrefs => {
        if (shouldTranslate(prefs, sitePrefs)) {
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
    if (msg.type === 'TOGGLE_ENABLED') {
      // Master switch.
      if (msg.enabled === false) {
        shutdownBilingual();
      } else {
        // Re-evaluate everything — site might still be explicitly OFF.
        chrome.storage.local.get(
          { bilingualEnabled: true },
          prefs => {
            chrome.storage.local.get([getSiteKey()], sitePrefs => {
              const siteVal = sitePrefs[getSiteKey()];
              if (siteVal === false) return;  // site explicitly off
              bootBilingual(modeFromBool(prefs.bilingualEnabled));
            });
          }
        );
      }
      return;
    }

    if (msg.type === 'TOGGLE_BILINGUAL') {
      // Display mode only — doesn't enable/disable.
      const mode = modeFromBool(msg.enabled);
      if (bilingualActive) {
        window.ttBilingual.setDisplayMode?.(mode);
      } else {
        // Translation might be off via master or per-site. Don't auto-enable
        // here — only the master and per-site toggles do that.
      }
    }

    if (msg.type === 'TOGGLE_HOVER') {
      window.ttBilingual?.setHover?.(msg.enabled);
    }

    if (msg.type === 'TOGGLE_SITE') {
      // Per-site explicit on/off.
      if (msg.enabled === false) {
        shutdownBilingual();
      } else {
        chrome.storage.local.get(
          { translateEnabled: true, bilingualEnabled: true },
          prefs => {
            if (prefs.translateEnabled === false) return;
            bootBilingual(modeFromBool(prefs.bilingualEnabled));
          }
        );
      }
    }

    if (msg.type === 'RETRY_ALL') {
      if (bilingualActive && window.ttBilingual.retryAll) {
        window.ttBilingual.retryAll();
      }
    }
  });
})();
