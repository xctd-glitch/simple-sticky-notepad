"use strict";

const DEFAULT_SIZE_KEY = "simpleStickyNoteDefaultSize";
const THEME_KEY = "simpleStickyNoteTheme";
const form = document.getElementById("optionsForm");
const widthInput = document.getElementById("defaultWidth");
const heightInput = document.getElementById("defaultHeight");
const themeInput = document.getElementById("theme");
const statusEl = document.getElementById("status");

function saveOptions(e) {
  e.preventDefault();
  const width = parseInt(widthInput.value, 10);
  const height = parseInt(heightInput.value, 10);
  const theme = themeInput.value;

  if (isNaN(width) || isNaN(height) || width < 260 || height < 190) {
    statusEl.textContent = "Invalid values. Minimum is 260x190.";
    return;
  }

  chrome.storage.local.set({
    [DEFAULT_SIZE_KEY]: { width, height },
    [THEME_KEY]: theme
  }, function() {
    if (chrome.runtime.lastError) {
      statusEl.textContent = "Error saving settings.";
    } else {
      statusEl.textContent = "Settings saved.";
    }
    window.setTimeout(function() { statusEl.textContent = ""; }, 2000);
  });
}

function restoreOptions() {
  chrome.storage.local.get([DEFAULT_SIZE_KEY, THEME_KEY], function(result) {
    const defaultSize = result[DEFAULT_SIZE_KEY];
    const theme = result[THEME_KEY];

    if (defaultSize && typeof defaultSize.width === 'number' && typeof defaultSize.height === 'number') {
      widthInput.value = defaultSize.width;
      heightInput.value = defaultSize.height;
    } else {
      widthInput.value = 334;
      heightInput.value = 250;
    }

    if (theme && ['system', 'light', 'dark', 'sepia'].includes(theme)) {
      themeInput.value = theme;
    } else {
      themeInput.value = 'system';
    }
  });
}

document.addEventListener("DOMContentLoaded", restoreOptions);
form.addEventListener("submit", saveOptions);