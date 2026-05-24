"use strict";

const NOTE_KEY = "simpleStickyNoteText";
const MAX_CHARS = 5000;
const EXPORT_DIR = "SimpleStickyNotepad";
const THEME_KEY = "simpleStickyNoteTheme";
const LOAD_LIMIT_BYTES = 1024 * 128;
const FS_DB_NAME = "SimpleStickyNotepadFileSystem";
const FS_STORE_NAME = "handles";
const FS_DIRECTORY_KEY = "directory";

const noteText = document.getElementById("noteText");
const charCount = document.getElementById("charCount");
const saveState = document.getElementById("saveState");
const statusDot = document.getElementById("statusDot");
const dirLabel = document.getElementById("dirLabel");
const saveNoteButton = document.getElementById("saveNote");
const saveFileButton = document.getElementById("saveFile");
const loadFileButton = document.getElementById("loadFile");
const setDirectoryButton = document.getElementById("setDirectory");
const openStickyButton = document.getElementById("openSticky");
const clearNoteButton = document.getElementById("clearNote");
const openOptionsButton = document.getElementById("openOptions");
const filePicker = document.getElementById("filePicker");
const toastHost = document.getElementById("toastHost");

let dbPromise = null;

function showToast(message) {
  if (!toastHost) {
    return;
  }

  const item = document.createElement("div");
  item.className = "toast flex items-center gap-2.5 p-3 rounded-lg border";
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "w-5 h-5 flex-none");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "icons.svg#ssn-icon-toast");
  icon.appendChild(use);
  
  const text = document.createElement("span");
  text.className = "text-sm font-medium";
  text.textContent = message;

  item.appendChild(icon);
  item.appendChild(text);

  toastHost.appendChild(item);

  window.setTimeout(function () {
    item.remove();
  }, 2500);
}

function setSaveState(text, saved) {
  saveState.textContent = text;
  statusDot.classList.toggle('unsaved', !saved);
}

function sanitizeNote(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.slice(0, MAX_CHARS);
}

function sanitizeFilename(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 80);
}

function updateCounter() {
  charCount.textContent = String(noteText.value.length) + " / " + String(MAX_CHARS);
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

function getDefaultFilename() {
  return "note-" + getTimestamp() + ".txt";
}

function getDb() {
  if (!dbPromise) {
    dbPromise = new Promise(function (resolve, reject) {
      const request = indexedDB.open(FS_DB_NAME, 1);

      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(FS_STORE_NAME)) {
          db.createObjectStore(FS_STORE_NAME);
        }
      };

      request.onsuccess = function () {
        resolve(request.result);
      };

      request.onerror = function () {
        dbPromise = null;
        reject(request.error);
      };
    });
  }
  return dbPromise;
}

async function putDirectoryHandle(handle) {
  const db = await getDb();
  return new Promise(function (resolve, reject) {
    const transaction = db.transaction(FS_STORE_NAME, "readwrite");
    transaction.oncomplete = resolve;
    transaction.onerror = function () {
      return reject(transaction.error);
    };
    transaction.objectStore(FS_STORE_NAME).put(handle, FS_DIRECTORY_KEY);
  });
}

async function getDirectoryHandle() {
  const db = await getDb();
  return new Promise(function (resolve, reject) {
    const transaction = db.transaction(FS_STORE_NAME, "readonly");
    const store = transaction.objectStore(FS_STORE_NAME);
    const request = store.get(FS_DIRECTORY_KEY);

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

async function hasDirectoryAccess(handle) {
  if (!handle || typeof handle.queryPermission !== "function") {
    return false;
  }

  const options = { mode: "readwrite" };
  let permission = await handle.queryPermission(options);

  if (permission === "granted") {
    return true;
  }

  if (typeof handle.requestPermission !== "function") {
    return false;
  }

  permission = await handle.requestPermission(options);
  return permission === "granted";
}

async function writeToDirectory(handle, filename, text) {
  const safeName = sanitizeFilename(filename) || getDefaultFilename();
  const fileHandle = await handle.getFileHandle(safeName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(new Blob([text], { type: "text/plain;charset=utf-8" }));
  await writable.close();
}

async function writeWithSavePicker(text) {
  if (typeof window.showSaveFilePicker !== "function") {
    return false;
  }

  const fileHandle = await window.showSaveFilePicker({
    suggestedName: getDefaultFilename(),
    startIn: "documents",
    types: [
      {
        description: "Text files",
        accept: {
          "text/plain": [".txt", ".md", ".log"],
          "application/json": [".json"]
        }
      }
    ]
  });

  const writable = await fileHandle.createWritable();
  await writable.write(new Blob([text], { type: "text/plain;charset=utf-8" }));
  await writable.close();
  return true;
}

async function saveCurrentNote() {
  const value = sanitizeNote(noteText.value);
  noteText.value = value;
  updateCounter();
  setSaveState("Saving...", false);

  try {
    await chrome.storage.local.set({ [NOTE_KEY]: value });
    setSaveState("Saved", true);
    return true;
  } catch (error) {
    setSaveState("Save failed", false);
    showToast("Save failed");
    return false;
  }
}

function scheduleAutoSave() {
  window.clearTimeout(saveTimer);
  setSaveState("Unsaved", false);
  saveTimer = window.setTimeout(function () {
    saveCurrentNote();
  }, 350);
}

async function chooseDirectory() {
  if (typeof window.showDirectoryPicker !== "function") {
    showToast("Directory picker unavailable");
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: "simple-sticky-notepad",
      mode: "readwrite",
      startIn: "documents"
    });

    const ok = await hasDirectoryAccess(handle);
    if (!ok) {
      showToast("Directory access denied");
      return;
    }

    await putDirectoryHandle(handle);
    dirLabel.textContent = "Directory: " + handle.name;
    showToast("Directory set: " + handle.name);
  } catch (error) {
    if (error && error.name === "AbortError") {
      showToast("Directory canceled");
      return;
    }

    showToast("Directory setup failed");
  }
}

async function refreshDirectoryLabel() {
  try {
    const handle = await getDirectoryHandle();

    if (handle && typeof handle.name === "string") {
      dirLabel.textContent = "Directory: " + handle.name;
      return;
    }
  } catch (error) {
    dirLabel.textContent = "Directory: Documents picker";
    return;
  }

  dirLabel.textContent = "Directory: Documents picker";
}

function saveFileWithDownloadsFallback(text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });

  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = "";
  }

  activeObjectUrl = URL.createObjectURL(blob);

  chrome.downloads.download({
    url: activeObjectUrl,
    filename: EXPORT_DIR + "/" + getDefaultFilename(),
    conflictAction: "uniquify",
    saveAs: false
  }, function (downloadId) {
    if (chrome.runtime.lastError || typeof downloadId !== "number") {
      showToast("File save failed");
      return;
    }

    showToast("Saved to Downloads/" + EXPORT_DIR);
  });
}

async function saveNoteAsFile() {
  window.clearTimeout(saveTimer);
  const saved = await saveCurrentNote();
  if (!saved) {
    return;
  }
    const text = sanitizeNote(noteText.value);

    try {
      const directoryHandle = await getDirectoryHandle();

      if (directoryHandle && await hasDirectoryAccess(directoryHandle)) {
        await writeToDirectory(directoryHandle, getDefaultFilename(), text);
        showToast("Saved to " + directoryHandle.name);
        return;
      }

      if (await writeWithSavePicker(text)) {
        showToast("File saved");
        return;
      }
    } catch (error) {
      if (error && error.name === "AbortError") {
        showToast("File save canceled");
        return;
      }
    }

    saveFileWithDownloadsFallback(text);
}

function loadTextFile(file) {
  if (!file) {
    return;
  }

  const allowedTypes = {
    "": true,
    "text/plain": true,
    "text/markdown": true,
    "application/json": true
  };

  const fileName = typeof file.name === "string" ? file.name.toLowerCase() : "";
  const hasAllowedExtension = fileName.endsWith(".txt") ||
    fileName.endsWith(".md") ||
    fileName.endsWith(".log") ||
    fileName.endsWith(".json");

  if (!allowedTypes[file.type] && !hasAllowedExtension) {
    showToast("Unsupported file type");
    return;
  }

  if (file.size > LOAD_LIMIT_BYTES) {
    showToast("File too large");
    return;
  }

  const reader = new FileReader();

  reader.onload = async function () {
    const value = sanitizeNote(String(reader.result || ""));
    noteText.value = value;
    updateCounter();
    window.clearTimeout(saveTimer);
    const saved = await saveCurrentNote();
    if (saved) {
      showToast("Loaded");
    }
  };

  reader.onerror = function () {
    showToast("Load failed");
  };

  reader.readAsText(file, "UTF-8");
}

async function loadFromDocumentsPicker() {
  if (typeof window.showOpenFilePicker === "function") {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: false,
        startIn: "documents",
        types: [
          {
            description: "Text files",
            accept: {
              "text/plain": [".txt", ".md", ".log"],
              "application/json": [".json"]
            }
          }
        ]
      });

      if (handles && handles.length > 0) {
        const file = await handles[0].getFile();
        loadTextFile(file);
      }

      return;
    } catch (error) {
      if (error && error.name === "AbortError") {
        showToast("Load canceled");
        return;
      }
    }
  }

  filePicker.value = "";
  filePicker.click();
}

async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length < 1 || typeof tabs[0].id !== "number") {
      return null;
    }
    return tabs[0];
  } catch (error) {
    return null;
  }
}

async function openStickyOnActiveTab() {
  openStickyButton.disabled = true;
  try {
    const saved = await saveCurrentNote();
    if (!saved) {
      return;
    }

    const tab = await getActiveTab();
    if (!tab) {
      showToast("No active tab found");
      return;
    }

    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "SIMPLE_STICKY_OPEN", note: sanitizeNote(noteText.value) });

    if (!response || response.ok !== true) {
      showToast("Open failed. Refresh page");
    } else {
      showToast("Sticky opened");
    }
  } catch (error) {
    showToast("Cannot open sticky on this page");
  } finally {
    openStickyButton.disabled = false;
  }
}

chrome.storage.local.get([NOTE_KEY, THEME_KEY], function (result) {
  const noteValue = sanitizeNote(result[NOTE_KEY]);
  const theme = result[THEME_KEY];

  if (theme && theme !== 'system') {
    document.body.classList.add(theme);
  }

  noteText.value = noteValue;
  updateCounter();
  setSaveState("Ready", true);
  refreshDirectoryLabel();
});

noteText.addEventListener("input", function () {
  noteText.value = sanitizeNote(noteText.value);
  updateCounter();
  scheduleAutoSave();
});

saveNoteButton.addEventListener("click", async function () {
  window.clearTimeout(saveTimer);
  const saved = await saveCurrentNote();
  if (saved) {
    showToast("Saved");
  }
});

saveFileButton.addEventListener("click", function () {
  saveNoteAsFile();
});

loadFileButton.addEventListener("click", function () {
  loadFromDocumentsPicker();
});

setDirectoryButton.addEventListener("click", function () {
  chooseDirectory();
});

filePicker.addEventListener("change", function () {
  if (!filePicker.files || filePicker.files.length < 1) {
    return;
  }

  loadTextFile(filePicker.files[0]);
});

openStickyButton.addEventListener("click", function () {
  window.clearTimeout(saveTimer);
  openStickyOnActiveTab();
});

openOptionsButton.addEventListener("click", function () {
  chrome.runtime.openOptionsPage();
});

clearNoteButton.addEventListener("click", async function () {
  if (window.confirm("Are you sure you want to clear the note? This action cannot be undone.")) {
    window.clearTimeout(saveTimer);
    noteText.value = "";
    updateCounter();
    const saved = await saveCurrentNote();
    if (saved) {
      showToast("Cleared");
    }
  }
});

window.addEventListener("unload", function () {
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = "";
  }
});

chrome.runtime.onMessage.addListener(async function (message) {
  if (message && message.type === "SIMPLE_STICKY_COMMAND" && message.command === "save-note") {
    window.clearTimeout(saveTimer);
    const saved = await saveCurrentNote();
    if (saved) {
      showToast("Saved");
    }
  }
});
