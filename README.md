<p align="center">
  <img src="src/assets/logo.svg" alt="Lexio" width="80" height="80" />
</p>

<h1 align="center">Lexio</h1>

<p align="center">
  <strong>The AI-native PDF reader.</strong><br />
  Highlight, annotate, and ask AI about any passage — with full document context.
</p>

<p align="center">
  <a href="#getting-started"><strong>Get Started</strong></a> &nbsp;&middot;&nbsp;
  <a href="#features"><strong>Features</strong></a> &nbsp;&middot;&nbsp;
  <a href="#ai-providers"><strong>AI Providers</strong></a> &nbsp;&middot;&nbsp;
  <a href="#contributing"><strong>Contributing</strong></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-8b7cf7?style=flat-square" alt="Platforms" />
  <img src="https://img.shields.io/badge/license-MIT-6c5ce7?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/electron-33-4834d4?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/react-18-61dafb?style=flat-square&logo=react&logoColor=white" alt="React" />
</p>

<br />

<!-- Replace with an actual screenshot of your app -->
<!-- <p align="center">
  <img src="docs/screenshot.png" alt="Lexio in action" width="900" />
</p> -->

---

## Why Lexio?

Reading a PDF, copying a passage, switching to ChatGPT, pasting context, and explaining what you need — that workflow should be **one click**.

Lexio embeds AI directly into the reading experience. Select any text, hit **Ask AI**, and get an answer grounded in the *entire* document — not just the snippet you selected. No tab switching, no copy-pasting, no lost context.

---

## Features

### PDF Reader
- Smooth rendering powered by **PDF.js** with zoom, scroll, and page navigation
- Word-by-word **text selection** with professional overlay styling
- **Multi-color highlights** — yellow, green, blue, pink, orange
- **Underline** and **strikethrough** annotation tools
- **Comments** on any highlighted passage
- **Undo / Redo** for all annotation actions
- Export annotations to **JSON** or save directly into the **PDF**
- **Drag & drop** to open files
- **Ctrl+Scroll** zoom

### AI Chat
- **One-click "Ask AI"** from the floating selection toolbar
- **Full document context** — the AI sees your entire PDF, not just the selection
- **Streaming responses** with real-time token rendering
- **Multiple conversations** per document
- **4 built-in providers** — bring your own API key, or run fully local

### Desktop App
- Native **macOS, Linux, and Windows** builds via Electron
- Keyboard shortcuts for everything
- Dark theme optimized for focused reading
- Resizable AI sidebar with conversation history
- Page thumbnail sidebar for quick navigation

---

## AI Providers

Lexio ships with four providers out of the box. Use one — or all of them.

| Provider | Type | Default Model | Setup |
|----------|------|---------------|-------|
| **Ollama** | Local, free | `llama3.2` | Install [Ollama](https://ollama.com), run `ollama pull llama3.2` |
| **Claude** | Cloud API | `claude-sonnet-4` | [Get API key](https://console.anthropic.com/settings/keys) |
| **OpenAI** | Cloud API | `gpt-4o` | [Get API key](https://platform.openai.com/api-keys) |
| **Gemini** | Cloud API | `gemini-2.0-flash` | [Get API key](https://aistudio.google.com/app/apikey) |

> **Privacy first** — Ollama runs entirely on your machine. No data ever leaves your computer.

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9
- *(Optional)* [Ollama](https://ollama.com) for local AI — no API key needed

### Install & Run

```bash
git clone https://github.com/YOUR_USERNAME/lexio.git
cd lexio
npm install
npm run dev
```

The app opens an Electron window with hot-reload. Edit any source file and see changes instantly.

### Configure AI

1. Click the **Settings** icon in the toolbar
2. Select a provider
3. For cloud providers — paste your API key and toggle **Enabled**
4. For Ollama — make sure the server is running (`ollama serve`)
5. Choose your model and start chatting

### Build for Distribution

```bash
npm run package          # Current platform
npm run package:linux    # AppImage + .deb
npm run package:mac      # .dmg
npm run package:win      # NSIS installer
```

Packages appear in the `release/` directory.

---

## Usage

### Workflow

1. **Open** a PDF — toolbar button, `Cmd/Ctrl+O`, or drag & drop
2. **Read** — scroll, zoom (`Ctrl+Scroll`), navigate pages
3. **Highlight** — pick a tool and color from the toolbar, then select text
4. **Ask AI** — select any passage, click **Ask AI** in the floating bar
5. **Chat** — follow up with more questions in the sidebar
6. **Save** — `Cmd/Ctrl+S` to save annotations into the PDF

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open PDF | `Cmd/Ctrl + O` |
| Save PDF | `Cmd/Ctrl + S` |
| Save PDF As | `Cmd/Ctrl + Shift + S` |
| Undo | `Cmd/Ctrl + Z` |
| Redo | `Cmd/Ctrl + Shift + Z` |
| Toggle AI sidebar | `Cmd/Ctrl + \` |
| Zoom in / out | `Cmd/Ctrl + =` / `Cmd/Ctrl + -` |
| Reset zoom | `Cmd/Ctrl + 0` |
| Export annotations | `Cmd/Ctrl + Shift + E` |
| Send message | `Enter` |
| New line in chat | `Shift + Enter` |

---

## Architecture

```
lexio/
├── electron/
│   ├── main.ts              # Window management, menus, IPC handlers
│   └── preload.ts           # Secure context bridge
├── src/
│   ├── components/
│   │   ├── PDFViewer.tsx     # PDF.js rendering + text selection engine
│   │   ├── AISidebar.tsx     # Chat interface + conversation management
│   │   ├── Toolbar.tsx       # Tools, zoom, navigation, colors
│   │   ├── SettingsPanel.tsx # Provider configuration
│   │   ├── ThumbnailSidebar.tsx
│   │   ├── AnnotationsPanel.tsx
│   │   ├── SelectionActionBar.tsx
│   │   ├── CommentModal.tsx
│   │   └── WelcomeScreen.tsx
│   ├── providers/
│   │   └── ai-providers.ts  # Ollama, Claude, OpenAI, Gemini
│   ├── stores/
│   │   └── useStore.ts      # Zustand state (PDF, annotations, AI, UI)
│   ├── utils/
│   │   └── pdf-save.ts      # PDF annotation export
│   └── types.ts
├── vite.config.ts
└── package.json
```

### Design Decisions

| Choice | Rationale |
|--------|-----------|
| **PDF.js** | Battle-tested PDF rendering with text layer support |
| **Zustand** | Minimal boilerplate, excellent TypeScript DX |
| **Streaming** | All 4 providers use SSE for responsive real-time chat |
| **Full-doc context** | Entire PDF text in the system prompt so AI can reference anything |
| **Relative rects** | Highlights stored as 0-1 fractions — zoom-independent by design |
| **Viewport math** | Text selection computed from PDF coordinates, not DOM — accurate at any zoom |

---

## Extending Lexio

### Adding a New AI Provider

Create a provider in `src/providers/ai-providers.ts`:

```typescript
const myProvider: AIProviderInterface = {
  async chat(messages, systemPrompt, config, signal, callbacks) {
    // 1. Make a streaming request to your API
    // 2. Parse the SSE / streaming response
    // 3. Call callbacks.onToken(text) for each chunk
    // 4. Call callbacks.onDone() when complete
  },
};
```

Then register it in `DEFAULT_PROVIDERS` in `src/types.ts`.

---

## Contributing

Contributions are welcome! Here are some areas that could use help:

- [ ] Persistent annotation storage (save/load per PDF)
- [ ] Freehand drawing / ink annotations
- [ ] PDF form filling
- [ ] Full-text search within PDF
- [ ] Multi-PDF tabs
- [ ] RAG pipeline for very large documents
- [ ] Plugin system for custom AI tools
- [ ] i18n / localization

```bash
npm run dev        # Development with hot-reload
npm run build      # Production build
npm run package    # Create distributable
```

---

## Tech Stack

[Electron](https://electronjs.org) &middot; [React](https://react.dev) &middot; [TypeScript](https://typescriptlang.org) &middot; [Vite](https://vitejs.dev) &middot; [PDF.js](https://mozilla.github.io/pdf.js/) &middot; [pdf-lib](https://pdf-lib.js.org/) &middot; [Zustand](https://zustand-demo.pmnd.rs/) &middot; [Tailwind CSS](https://tailwindcss.com) &middot; [Lucide](https://lucide.dev)

## License

MIT — see [LICENSE](LICENSE) for details.
