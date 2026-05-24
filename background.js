"use strict";

const EXPORT_DIR = "SimpleStickyNotepad";
const MAX_CHARS = 5000;

function sanitizeNote(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.slice(0, MAX_CHARS);
}

function getTimestamp() {
  const now = new Date();

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  return String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    "-" +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
}

function textToDataUrl(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 8192;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return "data:text/plain;charset=utf-8;base64," + btoa(binary);
}

function downloadTextFile(text, sendResponse) {
  const safeText = sanitizeNote(text);
  const filename = EXPORT_DIR + "/note-" + getTimestamp() + ".txt";

  chrome.downloads.download({
    url: textToDataUrl(safeText),
    filename: filename,
    conflictAction: "uniquify",
    saveAs: false
  }, function (downloadId) {
    if (chrome.runtime.lastError || typeof downloadId !== "number") {
      sendResponse({
        ok: false,
        message: "File save failed"
      });
      return;
    }

    sendResponse({
      ok: true,
      message: "Saved to Downloads/" + EXPORT_DIR
    });
  });
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== "SIMPLE_STICKY_SAVE_FILE") {
    return false;
  }

  downloadTextFile(message.note, sendResponse);
  return true;
});

chrome.commands.onCommand.addListener(async function (command) {
  if (command !== "save-note") {
    return;
  }

  // Send to popup (if open)
  chrome.runtime.sendMessage({
    type: "SIMPLE_STICKY_COMMAND",
    command: "save-note"
  });

  // Send to active tab's content script (if sticky is open)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: "SIMPLE_STICKY_COMMAND", command: "save-note" });
    }
  } catch (error) {
    // Fail silently if tab is not accessible
  }
});
