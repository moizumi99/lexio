# Lexio

**AI-native PDF reader** — highlight, annotate, and ask AI about any passage with full document context.

<p align="center">
  <img src="docs/screenshot.png" alt="Lexio screenshot" width="800" />
</p>

---

## What is Lexio?

Lexio combines a full-featured PDF reader with integrated AI chat. Select any passage, click **Ask AI**, and get an explanation grounded in the entire document — not just the snippet you selected.

**Why another PDF reader?** Because copying text from your PDF viewer, switching to a chat window, pasting context, and explaining what you're reading is a workflow that should be one click.

## Features

### PDF Reader
- **Smooth rendering** via PDF.js with zoom, scroll, and page navigation
- **Text selection** with native-feeling text layer
- **Multi-color highlights** (yellow, green, blue, pink, orange)
- **Comments** on any highlighted passage
- **Annotation export** to JSON
- **Keyboard shortcuts** for everything
- **Drag & drop** PDF files

### AI Integration
- **One-click "Ask AI"** — select text and get instant explanations
- **Full document context** — the AI sees your entire PDF, not just the selection
- **Streaming responses** with real-time token rendering
- **Multiple conversations** per document
- **4 AI backends** with unified interface:

| Provider | Type | Setup |
|----------|------|-------|
| **Ollama** | Local, free | Install [Ollama](https://ollama.com), run `ollama pull llama3.2` |
| **Claude** | Cloud API | [Get API key](https://console.anthropic.com/settings/keys) |
| **OpenAI** | Cloud API | [Get API key](https://platform.openai.com/api-keys) |
| **Gemini** | Cloud API | [Get API key](https://aistudio.google.com/app/apikey) |

## Getting Started

### Prerequisites
- **Node.js** ≥ 18
- **npm** ≥ 9
- (Optional) [Ollama](https://ollama.com) for local AI inference

### Install & Run

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/lexio.git
cd lexio

# Install dependencies
npm install

# Start in development mode
npm run dev
```

The app opens an Electron window with hot-reload. Edit any source file and changes appear instantly.

### Configure AI Providers

1. Click the **⚙️ Settings** button in the toolbar
2. Select a provider from the left panel
3. For cloud providers: paste your API key and toggle **Enabled**
4. For Ollama: ensure the server is running (`ollama serve`) and set the model
5. Click **Save**

### Build for Distribution

```bash
# Build for your platform
npm run package

# Platform-specific
npm run package:linux   # AppImage + .deb
npm run package:mac     # .dmg
npm run package:win     # NSIS installer
```

Built packages appear in the `release/` directory.

## Usage

### Basic Workflow

1. **Open** a PDF via toolbar button, `Cmd/Ctrl+O`, or drag & drop
2. **Read** — scroll, zoom, navigate pages
3. **Highlight** — switch to highlight tool, select text (choose colors in toolbar)
4. **Ask AI** — select any text → click "Ask AI" in the floating toolbar
5. **Chat** — continue the conversation in the sidebar with follow-up questions
6. **Export** — `Cmd/Ctrl+Shift+E` to export all annotations

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open PDF | `Cmd/Ctrl + O` |
| Toggle sidebar | `Cmd/Ctrl + \` |
| Zoom in | `Cmd/Ctrl + =` |
| Zoom out | `Cmd/Ctrl + -` |
| Reset zoom | `Cmd/Ctrl + 0` |
| Export annotations | `Cmd/Ctrl + Shift + E` |
| Send message | `Enter` |
| New line in chat | `Shift + Enter` |

## Architecture

```
lexio/
├── electron/            # Electron main process
│   ├── main.ts          # Window management, menus, IPC
│   └── preload.ts       # Secure bridge between main/renderer
├── src/
│   ├── components/      # React UI components
│   │   ├── PDFViewer    # PDF.js rendering + text layer
│   │   ├── AISidebar    # Chat interface + conversation management
│   │   ├── Toolbar      # Controls, tools, zoom
│   │   └── Settings     # Provider configuration
│   ├── providers/       # AI backend abstraction
│   │   └── ai-providers # Ollama, Claude, OpenAI, Gemini
│   ├── stores/          # Zustand state management
│   └── types.ts         # TypeScript type definitions
├── vite.config.ts       # Vite + Electron build config
└── package.json
```

### Key Design Decisions

- **PDF.js** for rendering — battle-tested, handles complex PDFs well
- **Zustand** for state — minimal boilerplate, great TypeScript support
- **Streaming everywhere** — all 4 providers use SSE/streaming for responsive chat
- **Full document context** — the entire PDF text is included in the system prompt so the AI can reference any part of the document
- **Provider abstraction** — adding a new AI backend is ~50 lines of code

## Adding a New AI Provider

Create a new provider in `src/providers/ai-providers.ts`:

```typescript
const myProvider: AIProviderInterface = {
  async chat(messages, systemPrompt, config, signal, cb) {
    // 1. Make streaming request to your API
    // 2. Parse SSE/streaming response
    // 3. Call cb.onToken(text) for each chunk
    // 4. Call cb.onDone() when complete
  },
};

// Register it
export const providers = {
  ...providers,
  myProvider: myProvider,
};
```

Then add it to `DEFAULT_PROVIDERS` in `src/types.ts`.

## Contributing

Contributions welcome! Some areas that could use help:

- [ ] Persistent annotation storage (save/load per PDF)
- [ ] Freehand drawing / ink annotations
- [ ] PDF form filling
- [ ] Search within PDF
- [ ] Thumbnail sidebar / page overview
- [ ] Multi-PDF support (tabs)
- [ ] RAG pipeline for very large documents (chunking + embeddings)
- [ ] Plugin system for custom AI tools
- [ ] i18n / localization

### Development

```bash
npm run dev        # Start with hot-reload
npm run build      # Production build
npm run package    # Create distributable
```

## License

MIT — see [LICENSE](LICENSE) for details.

---

Built with [Electron](https://electronjs.org), [React](https://react.dev), [PDF.js](https://mozilla.github.io/pdf.js/), and [Zustand](https://zustand-demo.pmnd.rs/).
