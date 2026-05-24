# Simple Sticky Notepad Addon

Browser extension Manifest V3 untuk Chrome dan Edge.

## Fitur

- Popup notepad sederhana.
- Sticky note floating di halaman aktif.
- Auto light/dark berdasarkan browser/OS `prefers-color-scheme`.
- No-shadow CSS: popup dan sticky floating tidak memakai shadow.
- Static shadcn/ui + Tailwind-style CSS tokens: `background`, `foreground`, `card`, `border`, `input`, `ring`, `primary`, `muted`, `accent`, dan `destructive`.
- Icon UI memakai inline SVG dengan `currentColor`.
- Tombol **Save** untuk simpan lokal ke `chrome.storage.local`.
- Tombol **Save File** untuk export note ke file.
- Tombol **Load** default memakai Documents picker.
- Tombol **Set Dir** untuk memilih directory, mulai dari Documents.
- Sticky mode punya **Save** dan **Save File**.
- Ikon floppy kanan atas di sticky sekarang menjalankan **Save File** ke Documents picker/fallback Downloads.
- Resize sticky diperbaiki: resize di panel utama, textarea full mengikuti ukuran panel, ukuran tersimpan otomatis.
- Tanpa CDN, tanpa backend, tanpa tracking.

## Catatan path Windows

Browser extension tidak boleh hardcode silent read/write langsung ke path absolut seperti:

```text
C:\Users\STRIX\Documents
```

Implementasi aman di versi ini:

1. **Load** memakai file picker dengan `startIn: "documents"`.
2. **Save File** popup:
   - kalau sudah klik **Set Dir** dan pilih Documents, file ditulis langsung ke directory itu;
   - kalau belum, Save Picker dibuka mulai dari Documents;
   - fallback terakhir: `Downloads/SimpleStickyNotepad/`.
3. **Save File** sticky:
   - klik ikon floppy kanan atas atau tombol **Save File**;
   - coba Save Picker mulai dari Documents;
   - fallback: `Downloads/SimpleStickyNotepad/`.

## Save File Fallback

Jika browser tidak mendukung File System Access API, file disimpan ke:

```text
Downloads/SimpleStickyNotepad/note-YYYYMMDD-HHMMSS.txt
```

## Load File

Tombol **Load** menerima file:

- `.txt`
- `.md`
- `.log`
- `.json`

Batas file load: 128 KB. Isi note tetap dibatasi 5000 karakter.

## Install

1. Extract ZIP.
2. Buka `chrome://extensions` atau `edge://extensions`.
3. Aktifkan **Developer mode**.
4. Klik **Load unpacked**.
5. Pilih folder `simple-sticky-notepad-addon-v1.4.1-textarea-full-resize`.
6. Refresh tab website aktif sebelum klik **Show Sticky**.

## Permission

- `storage`: menyimpan note lokal.
- `activeTab`: akses tab aktif saat tombol **Show Sticky** diklik.
- `scripting`: inject sticky UI ke tab aktif.
- `downloads`: fallback save file dari popup/sticky.

Tidak ada host permission global.
# simple-sticky-notepad
