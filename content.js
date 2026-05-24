"use strict";

(function () {
  const WRAP_ID = "simple-sticky-notepad-root";
  const SPRITE_WRAP_ID = "simple-sticky-notepad-sprite-wrap";
  const STYLE_ID = "simple-sticky-notepad-style";
  const NOTE_KEY = "simpleStickyNoteText";
  const MAX_CHARS = 5000;

  function safeText(value) {
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

  function getSiteKey(baseKey) {
    // Gunakan origin + pathname untuk membuat kunci yang unik untuk setiap URL halaman.
    // Ini akan mengabaikan parameter query dan fragmen hash.
    const pageUrl = (window.location.origin + window.location.pathname) || "local";
    const safePageKey = pageUrl.replace(/[^a-zA-Z0-9]/g, '_');
    return `${baseKey}_${safePageKey}`;
  }

  function createIcon(iconId) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${iconId}`);
    svg.appendChild(use);

    return svg;
  }

  async function injectSpriteSheet() {
    if (document.getElementById(SPRITE_WRAP_ID)) {
      return;
    }

    try {
      const response = await fetch(chrome.runtime.getURL("icons.svg"));
      if (!response.ok) {
        return;
      }
      const svgText = await response.text();
      const spriteWrap = document.createElement("div");
      spriteWrap.id = SPRITE_WRAP_ID;
      spriteWrap.style.display = "none";
      spriteWrap.setAttribute("aria-hidden", "true");
      spriteWrap.innerHTML = svgText;
      document.body.prepend(spriteWrap);
    } catch (error) {
      // Fail silently
    }
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const link = document.createElement("link");
    link.id = STYLE_ID;
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = chrome.runtime.getURL("tailwind-preflight.css");
    document.documentElement.appendChild(link);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function savePosition(left, top) {
    const posKey = getSiteKey("simpleStickyNotePosition");
    chrome.storage.local.set({
      [posKey]: {
        left: left,
        top: top
      }
    });
  }

  function saveSize(width, height) {
    const sizeKey = getSiteKey("simpleStickyNoteSize");
    chrome.storage.local.set({
      [sizeKey]: {
        width: width,
        height: height
      }
    });
  }


  function saveNote(value, callback) {
    chrome.storage.local.set({
      [NOTE_KEY]: safeText(value)
    }, function () {
      if (typeof callback === "function") {
        callback(!chrome.runtime.lastError);
      }
    });
  }

  function setPosition(root) {
    const posKey = getSiteKey("simpleStickyNotePosition");
    const sizeKey = getSiteKey("simpleStickyNoteSize");
    const defaultSizeKey = "simpleStickyNoteDefaultSize";

    chrome.storage.local.get([posKey, sizeKey, defaultSizeKey], function (result) {
      const pos = result[posKey];
      const siteSize = result[sizeKey];
      const defaultSize = result[defaultSizeKey];

      let sizeToUse = null;

      if (siteSize && typeof siteSize.width === "number" && typeof siteSize.height === "number") {
        sizeToUse = siteSize;
      } else if (defaultSize && typeof defaultSize.width === "number" && typeof defaultSize.height === "number") {
        sizeToUse = defaultSize;
      }

      if (sizeToUse) {
        const nextWidth = clamp(sizeToUse.width, 260, Math.max(260, window.innerWidth - 16));
        const nextHeight = clamp(sizeToUse.height, 220, Math.max(220, window.innerHeight - 16));
        root.style.width = String(nextWidth) + "px";
        root.style.height = String(nextHeight) + "px";
      } else {
        // Apply hardcoded default size if nothing is stored
        root.style.width = "334px";
        root.style.height = "250px";
      }

      if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
        root.style.left = String(clamp(pos.left, 8, window.innerWidth - 60)) + "px";
        root.style.top = String(clamp(pos.top, 8, window.innerHeight - 44)) + "px";
        return;
      }

      root.style.left = String(Math.max(12, window.innerWidth - 352)) + "px";
      root.style.top = "82px";
    });
  }

  async function saveWithBrowserPicker(text) {
    if (typeof window.showSaveFilePicker !== "function") {
      return false;
    }

    const fileHandle = await window.showSaveFilePicker({
      suggestedName: "note-" + getTimestamp() + ".txt",
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

  function saveWithBackgroundDownload(text, callback) {
    chrome.runtime.sendMessage({
      type: "SIMPLE_STICKY_SAVE_FILE",
      note: safeText(text)
    }, function (response) {
      if (chrome.runtime.lastError || !response || response.ok !== true) {
        callback(false, "File save failed");
        return;
      }

      callback(true, response.message || "File saved");
    });
  }

  function buildSticky(initialNote) {
    const root = document.createElement("section");
    root.id = WRAP_ID;
    root.className = "fixed z-[2147483647] flex flex-col overflow-hidden resize-both font-mono border rounded-md border-black bg-white text-black dark:border-white dark:bg-black dark:text-white";
    root.setAttribute("aria-label", "Simple Sticky Notepad");

    const head = document.createElement("div");
    head.className = "h-9 flex-none flex items-center justify-between gap-2 p-2 border-b cursor-move select-none border-black bg-white dark:border-white dark:bg-black";

    const title = document.createElement("div");
    title.className = "flex items-center gap-2 text-xs font-semibold tracking-tight min-w-0 text-black dark:text-white";
    title.appendChild(createIcon("ssn-icon-note"));

    const titleText = document.createElement("span");
    titleText.textContent = "Sticky Notepad";
    titleText.className = "overflow-hidden text-ellipsis whitespace-nowrap";
    title.appendChild(titleText);

    const actions = document.createElement("div");
    actions.className = "flex-none flex items-center gap-1.5";

    const saveIconButton = document.createElement("button");
    saveIconButton.type = "button";
    saveIconButton.className = "grid place-items-center w-6 h-[22px] p-0 border rounded-md cursor-pointer border-black bg-white text-black dark:border-white dark:bg-black dark:text-white";
    saveIconButton.title = "Save File";
    saveIconButton.appendChild(createIcon("ssn-icon-save"));

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "grid place-items-center w-6 h-[22px] p-0 border rounded-md cursor-pointer border-black bg-white text-black dark:border-white dark:bg-black dark:text-white";
    resetButton.title = "Reset Position";
    resetButton.appendChild(createIcon("ssn-icon-locate"));


    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "grid place-items-center w-6 h-[22px] p-0 border rounded-md cursor-pointer border-black bg-white text-black dark:border-white dark:bg-black dark:text-white";
    closeButton.title = "Close";
    closeButton.appendChild(createIcon("ssn-icon-close"));

    actions.appendChild(saveIconButton);
    actions.appendChild(resetButton);
    actions.appendChild(closeButton);

    title.querySelector("svg").className = "w-[15px] h-[15px] flex-none text-black dark:text-white";

    head.appendChild(title);
    head.appendChild(actions);

    const body = document.createElement("div");
    body.className = "flex-auto grid grid-rows-[minmax(0,1fr)_auto] gap-1.5 p-2 overflow-hidden bg-white dark:bg-black";

    const textarea = document.createElement("textarea");
    textarea.className = "block w-full h-full resize-none p-[9px] border rounded-md outline-none font-mono text-[13px] leading-[1.45] border-black bg-white text-black dark:border-white dark:bg-black dark:text-white";
    textarea.maxLength = MAX_CHARS;
    textarea.spellcheck = true;
    textarea.placeholder = "Write a quick note...";
    textarea.value = safeText(initialNote);

    const meta = document.createElement("div");
    meta.className = "flex items-center justify-between gap-2 text-[11px] overflow-hidden text-black dark:text-white";

    const count = document.createElement("span");
    count.id = "ssn-char-count";

    const metaActions = document.createElement("div");
    metaActions.className = "flex-none flex items-center gap-1.5";

    const fileButton = document.createElement("button");
    fileButton.type = "button";
    fileButton.className = "h-6 px-2 py-1 flex items-center justify-center whitespace-nowrap border rounded-md cursor-pointer text-[11px] font-semibold border-black bg-white text-black dark:border-white dark:bg-black dark:text-white";
    fileButton.textContent = "Save File";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "h-6 px-2 py-1 flex items-center justify-center whitespace-nowrap border rounded-md cursor-pointer text-[11px] font-semibold border-black bg-white text-black dark:border-white dark:bg-black dark:text-white";
    saveButton.textContent = "Save";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "h-6 px-2 py-1 flex items-center justify-center whitespace-nowrap border rounded-md cursor-pointer text-[11px] font-semibold border-black bg-white text-black dark:border-white dark:bg-black dark:text-white";
    copyButton.textContent = "Copy";

    const timeButton = document.createElement("button");
    timeButton.type = "button";
    timeButton.className = "h-6 px-2 py-1 flex items-center justify-center whitespace-nowrap border rounded-md cursor-pointer text-[11px] font-semibold border-black bg-white text-black dark:border-white dark:bg-black dark:text-white";
    timeButton.textContent = "Insert Time";

    metaActions.appendChild(fileButton);
    metaActions.appendChild(saveButton);
    metaActions.appendChild(copyButton);
    metaActions.appendChild(timeButton);

    meta.appendChild(count);
    meta.appendChild(metaActions);

    body.appendChild(textarea);
    body.appendChild(meta);

    root.appendChild(head);
    root.appendChild(body);

    let resizeObserver = null;
    let resizeTimer = 0;

    document.documentElement.appendChild(root);
    setPosition(root);

    const onResizeObserved = function () {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
          const rect = root.getBoundingClientRect();
          saveSize(rect.width, rect.height);

          const nextLeft = clamp(rect.left, 8, Math.max(8, window.innerWidth - 60));
          const nextTop = clamp(rect.top, 8, Math.max(8, window.innerHeight - 44));
          root.style.left = String(nextLeft) + "px";
          root.style.top = String(nextTop) + "px";
          savePosition(nextLeft, nextTop);
        }, 160);
    };

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(onResizeObserved);
      resizeObserver.observe(root);
    }

    function updateCount() {
      count.textContent = String(textarea.value.length) + " / " + String(MAX_CHARS);
    }

    function setStatus(text) {
      saveButton.textContent = text;
      window.setTimeout(function () {
        saveButton.textContent = "Save";
      }, 1200);
    }

    function runSave(callback) {
      const value = safeText(textarea.value);
      textarea.value = value;
      updateCount();
      saveButton.textContent = "Saving...";

      saveNote(value, function (ok) {
        if (ok) {
          setStatus("Saved");
        } else {
          setStatus("Save failed");
        }

        if (typeof callback === "function") {
          callback(ok, value);
        }
      });
    }

    async function runSaveFile() {
      runSave(async function (ok, value) {
        if (!ok) {
          fileButton.textContent = "Save failed";
          window.setTimeout(function () {
            fileButton.textContent = "Save File";
          }, 1200);
          return;
        }

        fileButton.textContent = "Saving to dir...";

        try {
          if (await saveWithBrowserPicker(value)) {
            fileButton.textContent = "Saved to dir";
            window.setTimeout(function () {
              fileButton.textContent = "Save File";
            }, 1200);
            return;
          }
        } catch (error) {
          if (error && error.name === "AbortError") {
            fileButton.textContent = "Canceled";
            window.setTimeout(function () {
              fileButton.textContent = "Save File";
            }, 1200);
            return;
          }
        }

        saveWithBackgroundDownload(value, function (saved, message) {
          fileButton.textContent = saved ? "Saved to dir" : message;
          window.setTimeout(function () {
            fileButton.textContent = "Save File";
          }, 1200);
        });
      });
    }

    let noteTimer = 0;

    textarea.addEventListener("input", function () {
      textarea.value = safeText(textarea.value);
      updateCount();
      saveButton.textContent = "Unsaved";

      window.clearTimeout(noteTimer);
      noteTimer = window.setTimeout(function () {
        runSave(null);
      }, 400);
    });

    root.addEventListener("ssn-save-command", function () {
      window.clearTimeout(noteTimer);
      runSave(null);
    });

    saveButton.addEventListener("click", function () {
      window.clearTimeout(noteTimer);
      runSave(null);
    });

    saveIconButton.addEventListener("click", function () {
      window.clearTimeout(noteTimer);
      runSaveFile();
    });

    resetButton.addEventListener("click", function () {
      const posKey = getSiteKey("simpleStickyNotePosition");
      const sizeKey = getSiteKey("simpleStickyNoteSize");
      chrome.storage.local.remove([posKey, sizeKey], function () {
        if (!chrome.runtime.lastError) {
          setPosition(root);
        }
      });
    });

    fileButton.addEventListener("click", function () {
      window.clearTimeout(noteTimer);
      runSaveFile();
    });

    copyButton.addEventListener("click", function () {
      navigator.clipboard.writeText(textarea.value).then(function () {
        copyButton.textContent = "Copied!";
        window.setTimeout(function () {
          copyButton.textContent = "Copy";
        }, 1200);
      }).catch(function () {
        copyButton.textContent = "Failed";
        window.setTimeout(function () {
          copyButton.textContent = "Copy";
        }, 1200);
      });
    });

    timeButton.addEventListener("click", function () {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timestamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      const newText = textarea.value.substring(0, start) + timestamp + textarea.value.substring(end);
      
      textarea.value = safeText(newText);
      
      const newCursorPos = start + timestamp.length;
      textarea.selectionStart = newCursorPos;
      textarea.selectionEnd = newCursorPos;
      textarea.focus();

      // Trigger autosave logic from the input handler
      updateCount();
      saveButton.textContent = "Unsaved";
      window.clearTimeout(noteTimer);
      noteTimer = window.setTimeout(function () { runSave(null); }, 400);
    });

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onHeadMouseDown = function (event) {
      if (event.target.closest("button")) {
        return;
      }
      const rect = root.getBoundingClientRect();
      dragging = true;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      event.preventDefault();
    };

    const onDocumentMouseMove = function (event) {
      if (!dragging) {
        return;
      }
      const nextLeft = clamp(event.clientX - offsetX, 8, window.innerWidth - 60);
      const nextTop = clamp(event.clientY - offsetY, 8, window.innerHeight - 44);
      root.style.left = String(nextLeft) + "px";
      root.style.top = String(nextTop) + "px";
    };

    const onDocumentMouseUp = function () {
      if (!dragging) {
        return;
      }
      dragging = false;
      const rect = root.getBoundingClientRect();
      savePosition(rect.left, rect.top);
    };

    const onWindowResize = function () {
      const rect = root.getBoundingClientRect();
      const nextWidth = clamp(rect.width, 260, Math.max(260, window.innerWidth - 16));
      const nextHeight = clamp(rect.height, 220, Math.max(220, window.innerHeight - 16));
      const nextLeft = clamp(rect.left, 8, Math.max(8, window.innerWidth - 60));
      const nextTop = clamp(rect.top, 8, Math.max(8, window.innerHeight - 44));
      root.style.width = String(nextWidth) + "px";
      root.style.height = String(nextHeight) + "px";
      root.style.left = String(nextLeft) + "px";
      root.style.top = String(nextTop) + "px";
      saveSize(nextWidth, nextHeight);
      savePosition(nextLeft, nextTop);
    };

    const cleanupAndRemove = function () {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      document.removeEventListener("mousemove", onDocumentMouseMove);
      document.removeEventListener("mouseup", onDocumentMouseUp);
      window.removeEventListener("resize", onWindowResize);
      root.remove();
    };

    closeButton.addEventListener("click", cleanupAndRemove);
    head.addEventListener("mousedown", onHeadMouseDown);
    document.addEventListener("mousemove", onDocumentMouseMove);
    document.addEventListener("mouseup", onDocumentMouseUp);
    window.addEventListener("resize", onWindowResize);

    updateCount();
    return root;
  }

  async function openSticky(initialNote) {
    injectStyle();
    await injectSpriteSheet();

    let root = document.getElementById(WRAP_ID);

    if (!root) {
      buildSticky(initialNote);
      return;
    }

    // If the root exists, ensure it's visible and update its content.
    // This handles cases where the user clicks the "Show Sticky" button multiple times.
    root.style.display = "flex";
    const textarea = root.querySelector("textarea");

    if (textarea) {
      textarea.value = safeText(initialNote);
      const countEl = root.querySelector("#ssn-char-count");
      if (countEl) {
        countEl.textContent = String(textarea.value.length) + " / " + String(MAX_CHARS);
      }
    }

    setPosition(root);
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message) {
      return false;
    }

    if (message.type === "SIMPLE_STICKY_OPEN") {
      (async function () {
        await openSticky(safeText(message.note));
        sendResponse({ ok: true });
      })();
      return true;
    }

    if (message.type === "SIMPLE_STICKY_COMMAND" && message.command === "save-note") {
      const root = document.getElementById(WRAP_ID);
      if (root && root.style.display !== "none") {
        root.dispatchEvent(new CustomEvent("ssn-save-command"));
        sendResponse({ handled: true });
      } else {
        sendResponse({ handled: false });
      }
      return true;
    }
    
    return true;
  });
}());
