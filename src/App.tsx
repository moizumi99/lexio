import { useEffect, useCallback } from 'react';
import { useStore } from './stores/useStore';
import Toolbar from './components/Toolbar';
import PDFViewer from './components/PDFViewer';
import AISidebar from './components/AISidebar';
import SettingsPanel from './components/SettingsPanel';
import WelcomeScreen from './components/WelcomeScreen';
import ThumbnailSidebar from './components/ThumbnailSidebar';
import { savePdfWithAnnotations } from './utils/pdf-save';

export default function App() {
  const { pdfFile, sidebarOpen, sidebarWidth, thumbnailSidebarOpen, settingsOpen, setPdfFile } = useStore();

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
          type: h.type,
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

    // Save PDF with annotations (in place)
    api.onSavePdf(async () => {
      const state = useStore.getState();
      if (!state.pdfFile) return;

      try {
        const modifiedPdf = await savePdfWithAnnotations(
          state.pdfFile.data,
          state.highlights
        );
        const success = await api.savePdfInPlace(state.pdfFile.path, modifiedPdf);
        if (success) {
          // Update the stored PDF data
          useStore.getState().setPdfFile({
            ...state.pdfFile,
            data: modifiedPdf,
          });
        }
      } catch (err) {
        console.error('Failed to save PDF:', err);
      }
    });

    // Save PDF as new file
    api.onSavePdfAs(async () => {
      const state = useStore.getState();
      if (!state.pdfFile) return;

      try {
        const modifiedPdf = await savePdfWithAnnotations(
          state.pdfFile.data,
          state.highlights
        );
        const savedPath = await api.savePdf(
          state.pdfFile.name.replace('.pdf', '-annotated.pdf'),
          modifiedPdf
        );
        if (savedPath) {
          console.log('PDF saved to:', savedPath);
        }
      } catch (err) {
        console.error('Failed to save PDF:', err);
      }
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
      {/* Unified toolbar with integrated title bar */}
      <Toolbar />

      <div className="flex flex-1 overflow-hidden">
        {/* Thumbnail Sidebar (left) */}
        {pdfFile && thumbnailSidebarOpen && (
          <ThumbnailSidebar />
        )}

        {/* PDF Viewer */}
        <div className="flex-1 overflow-hidden relative">
          {pdfFile ? <PDFViewer /> : <WelcomeScreen />}
        </div>

        {/* AI Sidebar (right) */}
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
