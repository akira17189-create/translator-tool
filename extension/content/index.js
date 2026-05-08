// content/index.js
// Boots bilingual.js and routes popup toggle messages.
//
// Pref semantics:
//   site:<hostname> (bool, default true)
//     Persistent per-host preference. ON or undefined = "translate this site
//     by default on every visit"; false = "don't auto-translate". The popup's
//     翻译此网站 toggle controls this.
//   bilingualEnabled (bool, default true)
//     Display mode when translation runs.
//       true  → 双语对照 (source + translation both visible)
//       false → 仅显示译文 (replace mode — source hidden via CSS)
//   hoverEnabled (bool, default false)
//     Ctrl+' on hover triggers single-paragraph translate.
//
// Note: 启用翻译 (the popup's master toggle) is intentionally NOT persisted —
// it represents "is this page actively translating right now". Initialised
// from site:<host> on load, then user-controlled in-session via GET_STATE /
// TOGGLE_ENABLED messages. Closing the tab or reloading drops it.

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

  function bootFromStoredMode() {
    chrome.storage.local.get({ bilingualEnabled: true }, prefs => {
      bootBilingual(modeFromBool(prefs.bilingualEnabled));
    });
  }

  // ─── Init from saved prefs ──────────────────────────────────────────
  // Initial decision is purely site:<host>: if user has explicitly turned
  // 翻译此网站 OFF for this host, don't translate; otherwise go.
  chrome.storage.local.get(
    { bilingualEnabled: true, hoverEnabled: false },
    prefs => {
      chrome.storage.local.get([getSiteKey()], sitePrefs => {
        const siteVal = sitePrefs[getSiteKey()];
        if (siteVal !== false) {
          bootBilingual(modeFromBool(prefs.bilingualEnabled));
        }
        if (window.ttBilingual?.setHover) {
          window.ttBilingual.setHover(prefs.hoverEnabled);
        }
      });
    }
  );

  // ─── Toggle messages from popup ────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'GET_STATE') {
      // Popup uses this to render the 启用翻译 toggle to match what's
      // actually happening on the page right now.
      sendResponse({ enabled: bilingualActive });
      return;
    }

    if (msg.type === 'TOGGLE_ENABLED') {
      // 启用翻译 — current-page only, no storage write. The popup's job
      // is to send the user's intent; we just honour it directly.
      if (msg.enabled === false) {
        shutdownBilingual();
      } else {
        bootFromStoredMode();
      }
      return;
    }

    if (msg.type === 'TOGGLE_BILINGUAL') {
      // Display mode only — doesn't enable/disable.
      const mode = modeFromBool(msg.enabled);
      if (bilingualActive) {
        window.ttBilingual.setDisplayMode?.(mode);
      }
    }

    if (msg.type === 'TOGGLE_HOVER') {
      window.ttBilingual?.setHover?.(msg.enabled);
    }

    if (msg.type === 'TOGGLE_SITE') {
      // 翻译此网站 cascades into 启用翻译: flipping the persistent
      // preference also brings current-page state into line, so the user
      // sees "remember + apply now" without two clicks.
      if (msg.enabled === false) {
        shutdownBilingual();
      } else {
        bootFromStoredMode();
      }
    }

    if (msg.type === 'RETRY_ALL') {
      if (bilingualActive && window.ttBilingual.retryAll) {
        window.ttBilingual.retryAll();
      }
    }
  });
})();
