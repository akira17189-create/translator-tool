// popup/popup.js
'use strict';

(function () {
  // ─── DOM refs ──────────────────────────────────────────────────────────
  const statusPill   = document.getElementById('statusPill');
  const statusText   = document.getElementById('statusText');
  const alertCard    = document.getElementById('alertCard');
  const toggleCard   = document.getElementById('toggleCard');
  const tEnabled     = document.getElementById('toggleEnabled');
  const tBi          = document.getElementById('toggleBilingual');
  const tHover       = document.getElementById('toggleHover');
  const tSite        = document.getElementById('toggleSite');
  const retryBtn     = document.getElementById('retryBtn');
  const settingsBtn  = document.getElementById('openSettings');
  const siteLabel    = document.getElementById('siteLabel');

  // ─── Helpers ───────────────────────────────────────────────────────────
  function sendMessage(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(resp);
        });
      } catch (e) { resolve(null); }
    });
  }

  function sendToTab(msg) {
    return new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (!tabs[0]) return resolve(null);
        chrome.tabs.sendMessage(tabs[0].id, msg, resp => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(resp);
        });
      });
    });
  }

  function getCurrentHostname() {
    return new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (!tabs[0] || !tabs[0].url) return resolve('');
        try { resolve(new URL(tabs[0].url).hostname); }
        catch { resolve(''); }
      });
    });
  }

  function renderStatus(online) {
    statusPill.classList.toggle('offline', !online);
    statusText.textContent = online ? '已连接' : '未连接';
    alertCard.hidden  = online;
    toggleCard.hidden = !online;
  }

  function renderToggle(btn, on) {
    btn.classList.toggle('on', !!on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  // ─── Init ──────────────────────────────────────────────────────────────
  async function init() {
    const status = await sendMessage({ type: 'CHECK_STATUS' });
    const online = !!(status && status.online);
    renderStatus(online);

    const hostname = await getCurrentHostname();
    if (siteLabel && hostname) {
      siteLabel.textContent = hostname;
    }

    const prefs = await new Promise(resolve =>
      chrome.storage.local.get(
        ['translateEnabled', 'bilingualEnabled', 'hoverEnabled'],
        resolve
      )
    );
    // Master defaults to ON
    renderToggle(tEnabled, prefs.translateEnabled ?? true);
    renderToggle(tBi,      prefs.bilingualEnabled ?? true);
    renderToggle(tHover,   prefs.hoverEnabled     ?? false);

    // Per-site toggle: undefined = default ON (translate by default).
    // Only false means "explicitly disabled here".
    if (hostname) {
      const sitePrefs = await new Promise(resolve =>
        chrome.storage.local.get(['site:' + hostname], resolve)
      );
      const siteVal = sitePrefs['site:' + hostname];
      renderToggle(tSite, siteVal !== false);
    }
  }

  // ─── Wire toggles ──────────────────────────────────────────────────────
  // Master switch — when off, nothing else translates.
  tEnabled.addEventListener('click', async () => {
    const next = !tEnabled.classList.contains('on');
    renderToggle(tEnabled, next);
    await new Promise(r => chrome.storage.local.set({ translateEnabled: next }, r));
    sendToTab({ type: 'TOGGLE_ENABLED', enabled: next });
  });

  tBi.addEventListener('click', async () => {
    const next = !tBi.classList.contains('on');
    renderToggle(tBi, next);
    await new Promise(r => chrome.storage.local.set({ bilingualEnabled: next }, r));
    sendToTab({ type: 'TOGGLE_BILINGUAL', enabled: next });
  });

  tHover.addEventListener('click', async () => {
    const next = !tHover.classList.contains('on');
    renderToggle(tHover, next);
    await new Promise(r => chrome.storage.local.set({ hoverEnabled: next }, r));
    sendToTab({ type: 'TOGGLE_HOVER', enabled: next });
  });

  // Per-site toggle — store explicit true/false. OFF really means "don't
  // translate this site"; ON means "translate this site". No more "remove
  // key on off" tristate weirdness.
  tSite.addEventListener('click', async () => {
    const next = !tSite.classList.contains('on');
    renderToggle(tSite, next);
    const hostname = await getCurrentHostname();
    if (!hostname) return;
    await new Promise(r => chrome.storage.local.set({ ['site:' + hostname]: next }, r));
    sendToTab({ type: 'TOGGLE_SITE', enabled: next });
  });

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      sendToTab({ type: 'RETRY_ALL' });
      // Brief visual feedback
      retryBtn.textContent = '重试中…';
      setTimeout(() => { retryBtn.textContent = '重试翻译'; }, 1500);
    });
  }

  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  init();
})();
