import { useEffect, useCallback } from 'react';
import { useStore } from './stores/useStore';
import Toolbar from './components/Toolbar';
import PDFViewer from './components/PDFViewer';
import AISidebar from './components/AISidebar';
import SettingsPanel from './components/SettingsPanel';
import WelcomeScreen from './components/WelcomeScreen';

export default function App() {
  const { pdfFile, sidebarOpen, sidebarWidth, settingsOpen, setPdfFile } = useStore();

  // Listen for electron IPC events
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    api.onPdfOpened((data) => {
      setPdfFile(data);
    });

    api.onToggleSidebar(() => {
      useStore.getState().toggleSidebar();
    });

    api.onZoomIn(() => useStore.getState().zoomIn());
    api.onZoomOut(() => useStore.getState().zoomOut());
    api.onZoomReset(() => useStore.getState().zoomReset());

    api.onExportAnnotations(async () => {
      const state = useStore.getState();
      const exportData = {
        file: state.pdfFile?.name,
        exportedAt: new Date().toISOString(),
        highlights: state.highlights.map((h) => ({
          page: h.page,
          text: h.text,
          color: h.color,
          comment: h.comment,
        })),
        annotations: state.annotations,
      };
      await api.saveFile(
        `${state.pdfFile?.name || 'document'}-annotations.json`,
        JSON.stringify(exportData, null, 2)
      );
    });

    // Load saved settings
    api.loadSettings().then((settings) => {
      if (settings) useStore.getState().updateSettings(settings);
    });
  }, [setPdfFile]);

  // Handle file drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          setPdfFile({
            path: file.name,
            name: file.name,
            data: base64,
          });
        };
        reader.readAsDataURL(file);
      }
    },
    [setPdfFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      className="h-screen w-screen flex flex-col bg-surface-0 overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Title bar drag region (macOS) */}
      <div className="titlebar-drag h-8 bg-surface-1 flex-shrink-0" />

      <Toolbar />

      <div className="flex flex-1 overflow-hidden">
        {/* PDF Viewer */}
        <div className="flex-1 overflow-hidden relative">
          {pdfFile ? <PDFViewer /> : <WelcomeScreen />}
        </div>

        {/* AI Sidebar */}
        {sidebarOpen && (
          <div
            className="flex-shrink-0 border-l border-surface-3 overflow-hidden"
            style={{ width: sidebarWidth }}
          >
            <AISidebar />
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {settingsOpen && <SettingsPanel />}
    </div>
  );
}
