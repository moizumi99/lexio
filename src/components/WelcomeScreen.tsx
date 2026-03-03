import { FileText, Upload } from 'lucide-react';
import { useStore } from '../stores/useStore';

export default function WelcomeScreen() {
  const { setPdfFile } = useStore();

  const handleClick = () => {
    if (window.electronAPI) {
      window.electronAPI.openPdf();
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          setPdfFile({ path: file.name, name: file.name, data: base64 });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center border border-accent/10">
          <FileText size={40} className="text-accent-light" strokeWidth={1.2} />
        </div>
        <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-surface-2 border border-surface-3 flex items-center justify-center shadow-lg">
          <span className="text-lg">✨</span>
        </div>
      </div>

      <h1 className="text-2xl font-semibold text-text-primary mb-2 tracking-tight">
        Welcome to Lexio
      </h1>
      <p className="text-sm text-text-secondary max-w-md leading-relaxed mb-8">
        Open a PDF to start reading. Highlight passages, add comments, and ask AI to explain
        anything — with full document context.
      </p>

      <button
        onClick={handleClick}
        className="flex items-center gap-2.5 px-6 py-3 bg-accent hover:bg-accent-dim text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-accent/20"
      >
        <Upload size={18} />
        Open a PDF
      </button>

      <p className="text-xs text-text-muted mt-4">
        or drag & drop a file anywhere · <kbd className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-[11px]">⌘O</kbd> to open
      </p>

      <div className="mt-12 grid grid-cols-3 gap-4 max-w-lg">
        <Feature icon="🖍️" title="Highlight" desc="Multi-color annotations" />
        <Feature icon="💬" title="Comment" desc="Add notes to passages" />
        <Feature icon="✨" title="Ask AI" desc="Explain any passage" />
      </div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="text-center">
      <span className="text-2xl">{icon}</span>
      <p className="text-xs font-medium text-text-secondary mt-1">{title}</p>
      <p className="text-[10px] text-text-muted">{desc}</p>
    </div>
  );
}
