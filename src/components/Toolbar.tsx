import {
  FolderOpen,
  ZoomIn,
  ZoomOut,
  MousePointer2,
  Highlighter,
  MessageSquarePlus,
  PanelRightOpen,
  PanelRightClose,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useStore } from '../stores/useStore';
import type { HighlightColor } from '../types';

const HIGHLIGHT_COLORS: { id: HighlightColor; bg: string; label: string }[] = [
  { id: 'yellow', bg: 'bg-yellow-400', label: 'Yellow' },
  { id: 'green', bg: 'bg-emerald-400', label: 'Green' },
  { id: 'blue', bg: 'bg-blue-400', label: 'Blue' },
  { id: 'pink', bg: 'bg-pink-400', label: 'Pink' },
  { id: 'orange', bg: 'bg-orange-400', label: 'Orange' },
];

export default function Toolbar() {
  const {
    pdfFile,
    currentPage,
    numPages,
    zoom,
    activeTool,
    activeHighlightColor,
    sidebarOpen,
    setCurrentPage,
    zoomIn,
    zoomOut,
    zoomReset,
    setActiveTool,
    setActiveHighlightColor,
    toggleSidebar,
    setSettingsOpen,
  } = useStore();

  const openFile = () => {
    if (window.electronAPI) {
      window.electronAPI.openPdf();
    } else {
      // Fallback: file input for web/dev mode
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          useStore.getState().setPdfFile({
            path: file.name,
            name: file.name,
            data: base64,
          });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }
  };

  return (
    <div className="titlebar-nodrag flex items-center h-11 px-3 bg-surface-1 border-b border-surface-3 gap-1 flex-shrink-0">
      {/* File */}
      <ToolbarButton icon={<FolderOpen size={16} />} label="Open PDF" onClick={openFile} />

      {pdfFile && (
        <>
          <Divider />

          {/* Page nav */}
          <ToolbarButton
            icon={<ChevronLeft size={16} />}
            label="Previous page"
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          />
          <span className="text-xs text-text-secondary font-mono px-1 min-w-[80px] text-center select-none">
            {currentPage} / {numPages}
          </span>
          <ToolbarButton
            icon={<ChevronRight size={16} />}
            label="Next page"
            onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
            disabled={currentPage >= numPages}
          />

          <Divider />

          {/* Zoom */}
          <ToolbarButton icon={<ZoomOut size={16} />} label="Zoom out" onClick={zoomOut} />
          <button
            onClick={zoomReset}
            className="text-xs text-text-secondary font-mono px-2 py-1 rounded hover:bg-surface-3 transition-colors min-w-[52px] text-center"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ToolbarButton icon={<ZoomIn size={16} />} label="Zoom in" onClick={zoomIn} />

          <Divider />

          {/* Tools */}
          <ToolbarButton
            icon={<MousePointer2 size={16} />}
            label="Select"
            active={activeTool === 'select'}
            onClick={() => setActiveTool('select')}
          />
          <ToolbarButton
            icon={<Highlighter size={16} />}
            label="Highlight"
            active={activeTool === 'highlight'}
            onClick={() => setActiveTool('highlight')}
          />
          <ToolbarButton
            icon={<MessageSquarePlus size={16} />}
            label="Comment"
            active={activeTool === 'comment'}
            onClick={() => setActiveTool('comment')}
          />

          {/* Color picker (visible when highlight tool active) */}
          {activeTool === 'highlight' && (
            <div className="flex items-center gap-1 ml-1">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.id}
                  title={c.label}
                  onClick={() => setActiveHighlightColor(c.id)}
                  className={`w-5 h-5 rounded-full ${c.bg} transition-all ${
                    activeHighlightColor === c.id
                      ? 'ring-2 ring-white ring-offset-1 ring-offset-surface-1 scale-110'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side */}
      {pdfFile && (
        <span className="text-xs text-text-muted truncate max-w-[200px] mr-2" title={pdfFile.name}>
          {pdfFile.name}
        </span>
      )}

      <ToolbarButton
        icon={<Settings size={16} />}
        label="Settings"
        onClick={() => setSettingsOpen(true)}
      />
      <ToolbarButton
        icon={sidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        label="Toggle sidebar"
        onClick={toggleSidebar}
      />
    </div>
  );
}

// ─── Sub-components ───

function ToolbarButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? 'bg-accent/20 text-accent-light'
          : disabled
            ? 'text-text-muted cursor-not-allowed opacity-40'
            : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary'
      }`}
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-surface-3 mx-1" />;
}
