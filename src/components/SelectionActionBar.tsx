import { Sparkles, Highlighter, Copy } from 'lucide-react';
import { RefObject } from 'react';

interface Props {
  rect: DOMRect;
  containerRef: RefObject<HTMLDivElement | null>;
  onAskAI: () => void;
  onHighlight: () => void;
}

export default function SelectionActionBar({ rect, containerRef, onAskAI, onHighlight }: Props) {
  const container = containerRef.current;
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();

  // Position the bar above the selection
  const top = rect.top - containerRect.top + container.scrollTop - 44;
  const left = rect.left - containerRect.left + container.scrollLeft + rect.width / 2;

  const handleCopy = () => {
    const sel = window.getSelection();
    if (sel) {
      navigator.clipboard.writeText(sel.toString());
    }
  };

  return (
    <div
      className="selection-action-bar"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        transform: 'translateX(-50%)',
      }}
    >
      <button className="primary" onClick={onAskAI}>
        <Sparkles size={14} />
        Ask AI
      </button>
      <button onClick={onHighlight}>
        <Highlighter size={14} />
        Highlight
      </button>
      <button onClick={handleCopy}>
        <Copy size={14} />
        Copy
      </button>
    </div>
  );
}
