# Toggle Annotations Feature (#2)

- [x] Add `removeHighlight` to destructured store values in PDFViewer.tsx
- [x] Update `handleHighlightSelection` to check for existing matching highlight and toggle
- [x] Update direct annotation path in `handleMouseUp` with same toggle logic
- [x] Test toggle behavior for highlight, underline, and strikeout
- [x] Test that undo/redo still works after toggle-remove and toggle-add

# Fix Copy Button (#3)

- [x] Create GitHub issue
- [x] Add `text` prop to SelectionActionBar Props interface
- [x] Change `handleCopy` to use the `text` prop
- [x] Pass `text={selectionInfo.text}` in PDFViewer's render
- [x] Test copy/paste works

# Fix Ctrl-C and Edit→Copy (#4)

- [x] Create GitHub issue
- [x] Add `selectedText` + `setSelectedText` to store
- [x] Update PDFViewer to write selection to store
- [x] Add Ctrl-C handler in App.tsx
- [x] Add `onCopy` IPC in preload.ts
- [x] Replace `{ role: 'copy' }` with custom IPC in main.ts
- [x] Listen for `menu:copy` in App.tsx
- [x] Test Ctrl-C copies selected text
- [x] Test Edit→Copy menu copies selected text
