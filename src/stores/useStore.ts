import { create } from 'zustand';
import type {
  PdfFileData,
  Highlight,
  Annotation,
  ChatMessage,
  ChatConversation,
  AppSettings,
  AIProvider,
  HighlightColor,
} from '../types';
import { DEFAULT_PROVIDERS } from '../types';

interface AppState {
  // PDF
  pdfFile: PdfFileData | null;
  pdfText: string;
  pageTexts: Map<number, string>;
  numPages: number;
  currentPage: number;
  zoom: number;

  // Annotations
  highlights: Highlight[];
  annotations: Annotation[];
  activeHighlightColor: HighlightColor;
  activeTool: 'select' | 'highlight' | 'comment';

  // AI
  conversations: ChatConversation[];
  activeConversation: string | null;
  isStreaming: boolean;
  selectedTextForAI: string;
  selectedPageForAI: number;

  // UI
  sidebarOpen: boolean;
  sidebarWidth: number;
  sidebarTab: 'chat' | 'annotations' | 'settings';
  settingsOpen: boolean;

  // Settings
  settings: AppSettings;

  // PDF Actions
  setPdfFile: (file: PdfFileData | null) => void;
  setPdfText: (text: string) => void;
  setPageText: (page: number, text: string) => void;
  setNumPages: (n: number) => void;
  setCurrentPage: (p: number) => void;
  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;

  // Annotation Actions
  addHighlight: (h: Highlight) => void;
  removeHighlight: (id: string) => void;
  updateHighlightComment: (id: string, comment: string) => void;
  addAnnotation: (a: Annotation) => void;
  removeAnnotation: (id: string) => void;
  setActiveHighlightColor: (c: HighlightColor) => void;
  setActiveTool: (t: 'select' | 'highlight' | 'comment') => void;

  // AI Actions
  setSelectedTextForAI: (text: string, page: number) => void;
  newConversation: () => string;
  addMessage: (convId: string, msg: ChatMessage) => void;
  updateLastAssistantMessage: (convId: string, content: string) => void;
  setActiveConversation: (id: string | null) => void;
  setIsStreaming: (v: boolean) => void;
  deleteConversation: (id: string) => void;

  // UI Actions
  toggleSidebar: () => void;
  setSidebarOpen: (v: boolean) => void;
  setSidebarWidth: (w: number) => void;
  setSidebarTab: (t: 'chat' | 'annotations' | 'settings') => void;
  setSettingsOpen: (v: boolean) => void;

  // Settings Actions
  updateSettings: (s: Partial<AppSettings>) => void;
  setActiveProvider: (p: AIProvider) => void;
  updateProviderConfig: (id: AIProvider, config: Partial<AppSettings['providers'][AIProvider]>) => void;
}

const uid = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

export const useStore = create<AppState>((set, get) => ({
  // ─── Initial State ───

  pdfFile: null,
  pdfText: '',
  pageTexts: new Map(),
  numPages: 0,
  currentPage: 1,
  zoom: 1.0,

  highlights: [],
  annotations: [],
  activeHighlightColor: 'yellow',
  activeTool: 'select',

  conversations: [],
  activeConversation: null,
  isStreaming: false,
  selectedTextForAI: '',
  selectedPageForAI: 0,

  sidebarOpen: true,
  sidebarWidth: 420,
  sidebarTab: 'chat',
  settingsOpen: false,

  settings: {
    providers: { ...DEFAULT_PROVIDERS },
    activeProvider: 'ollama',
    sidebarOpen: true,
    sidebarWidth: 420,
    theme: 'dark',
    sendFullPdfContext: true,
    maxContextPages: 50,
  },

  // ─── PDF ───

  setPdfFile: (file) => set({ pdfFile: file, highlights: [], annotations: [], currentPage: 1, pageTexts: new Map() }),
  setPdfText: (text) => set({ pdfText: text }),
  setPageText: (page, text) =>
    set((s) => {
      const newMap = new Map(s.pageTexts);
      newMap.set(page, text);
      return { pageTexts: newMap };
    }),
  setNumPages: (n) => set({ numPages: n }),
  setCurrentPage: (p) => set({ currentPage: p }),
  setZoom: (z) => set({ zoom: Math.max(0.25, Math.min(5, z)) }),
  zoomIn: () => set((s) => ({ zoom: Math.min(5, s.zoom + 0.15) })),
  zoomOut: () => set((s) => ({ zoom: Math.max(0.25, s.zoom - 0.15) })),
  zoomReset: () => set({ zoom: 1.0 }),

  // ─── Annotations ───

  addHighlight: (h) => set((s) => ({ highlights: [...s.highlights, h] })),
  removeHighlight: (id) => set((s) => ({ highlights: s.highlights.filter((h) => h.id !== id) })),
  updateHighlightComment: (id, comment) =>
    set((s) => ({
      highlights: s.highlights.map((h) => (h.id === id ? { ...h, comment } : h)),
    })),
  addAnnotation: (a) => set((s) => ({ annotations: [...s.annotations, a] })),
  removeAnnotation: (id) => set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),
  setActiveHighlightColor: (c) => set({ activeHighlightColor: c }),
  setActiveTool: (t) => set({ activeTool: t }),

  // ─── AI ───

  setSelectedTextForAI: (text, page) => set({ selectedTextForAI: text, selectedPageForAI: page }),
  newConversation: () => {
    const id = uid();
    const conv: ChatConversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
    };
    set((s) => ({
      conversations: [...s.conversations, conv],
      activeConversation: id,
    }));
    return id;
  },
  addMessage: (convId, msg) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [...c.messages, msg],
              title:
                c.messages.length === 0 && msg.role === 'user'
                  ? msg.content.slice(0, 60) + (msg.content.length > 60 ? '…' : '')
                  : c.title,
            }
          : c
      ),
    })),
  updateLastAssistantMessage: (convId, content) =>
    set((s) => ({
      conversations: s.conversations.map((c) => {
        if (c.id !== convId) return c;
        const msgs = [...c.messages];
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') {
            msgs[i] = { ...msgs[i], content };
            break;
          }
        }
        return { ...c, messages: msgs };
      }),
    })),
  setActiveConversation: (id) => set({ activeConversation: id }),
  setIsStreaming: (v) => set({ isStreaming: v }),
  deleteConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeConversation: s.activeConversation === id ? null : s.activeConversation,
    })),

  // ─── UI ───

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  setSidebarWidth: (w) => set({ sidebarWidth: Math.max(320, Math.min(800, w)) }),
  setSidebarTab: (t) => set({ sidebarTab: t }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),

  // ─── Settings ───

  updateSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),
  setActiveProvider: (p) =>
    set((s) => ({ settings: { ...s.settings, activeProvider: p } })),
  updateProviderConfig: (id, config) =>
    set((s) => ({
      settings: {
        ...s.settings,
        providers: {
          ...s.settings.providers,
          [id]: { ...s.settings.providers[id], ...config },
        },
      },
    })),
}));
