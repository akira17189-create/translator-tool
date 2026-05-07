// background/service-worker.js
// MV3 service worker — proxies all requests to the desktop HTTP server.
//
// Message types handled:
//   TRANSLATE    { text, mode }          → POST /translate
//   LOOKUP       { word }                → POST /lookup
//   CHECK_STATUS {}                      → GET  /status
//   ADD_WORD     { entry }               → POST /wordbook/add
//   GET_GLOSSARY {}                      → GET  /glossary
//
// All fetch failures return { error: "offline" } — no thrown exceptions.

'use strict';

const DEFAULT_PORT = 27463;

// ─── Port resolution ────────────────────────────────────────────────────────
function getPort() {
  return new Promise(resolve => {
    chrome.storage.local.get(['port'], prefs => {
      resolve(prefs.port || DEFAULT_PORT);
    });
  });
}

// ─── Safe fetch → always resolves, never throws ────────────────────────────
// Default 5s for fast endpoints (status/lookup/glossary/wordbook), 35s for
// /translate since LLM calls can legitimately take 20–30 seconds for full
// chapter paragraphs (matches translate.js's 30s LLM timeout + buffer).
async function safeFetch(path, options = {}, timeoutMs = 5000) {
  const port = await getPort();
  const url  = `http://127.0.0.1:${port}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { error: 'offline' };
    return res.json();
  } catch (_) {
    clearTimeout(timer);
    return { error: 'offline' };
  }
}

// ─── Handlers ──────────────────────────────────────────────────────────────
function handleTranslate({ text, mode = 'word' }) {
  // Selection translations (word/sentence) need to feel snappy — a 15s
  // ceiling is plenty for short text and means a stuck LLM fails fast and
  // the popup shows a clear error instead of spinning for a minute and a
  // half. Paragraph batches stay at 95s because long-form output legitimately
  // takes ~30s on busy days.
  const isSelection = mode === 'word' || mode === 'sentence';
  const timeoutMs = isSelection ? 15000 : 95000;
  return safeFetch('/translate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text, sourceLang: 'en', targetLang: 'zh', mode }),
  }, timeoutMs);
}

function handleLookup({ word }) {
  return safeFetch('/lookup', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ word }),
  });
}

function handleCheckStatus() {
  return safeFetch('/status').then(data => {
    if (data.error) return { online: false };
    return { online: !!(data && data.running) };
  });
}

function handleAddWord({ entry }) {
  return safeFetch('/wordbook/add', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(entry),
  });
}

function handleGetGlossary() {
  return safeFetch('/glossary');
}

// ─── Message router ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  let promise;

  switch (msg.type) {
    case 'TRANSLATE':    promise = handleTranslate(msg);    break;
    case 'LOOKUP':       promise = handleLookup(msg);       break;
    case 'CHECK_STATUS': promise = handleCheckStatus();     break;
    case 'ADD_WORD':     promise = handleAddWord(msg);      break;
    case 'GET_GLOSSARY': promise = handleGetGlossary();     break;
    default:             return false;
  }

  promise.then(sendResponse);
  return true; // keep message channel open for async response
});

// ─── On install: set storage defaults ────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    ['port', 'translateEnabled', 'bilingualEnabled'],
    prefs => {
      const defaults = {};
      if (prefs.port             === undefined) defaults.port             = DEFAULT_PORT;
      if (prefs.translateEnabled === undefined) defaults.translateEnabled = true;
      if (prefs.bilingualEnabled === undefined) defaults.bilingualEnabled = true;
      if (Object.keys(defaults).length) {
        chrome.storage.local.set(defaults);
      }
    }
  );
});
