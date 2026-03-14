import { Sparkles, Highlighter, Copy, Underline, Strikethrough } from 'lucide-react';
import { RefObject } from 'react';
import type { AnnotationType } from '../types';

interface Props {
  rect: DOMRect;
  containerRef: RefObject<HTMLDivElement | null>;
  text: string;
  onAskAI: () => void;
  onHighlight: (type: AnnotationType) => void;
}

export default function SelectionActionBar({ rect, containerRef, text, onAskAI, onHighlight }: Props) {
  const container = containerRef.current;
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();

  // Position the bar above the selection
  const top = rect.top - containerRect.top + container.scrollTop - 44;
  const left = rect.left - containerRect.left + container.scrollLeft + rect.width / 2;

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div
      className="selection-action-bar"
      style={{
        top: `${top}px`,
        left: `${left}px`,
        transform: 'translateX(-50%)',
      }}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <button className="primary" onClick={onAskAI}>
        <Sparkles size={14} />
        Ask AI
      </button>
      <button onClick={() => onHighlight('highlight')}>
        <Highlighter size={14} />
      </button>
      <button onClick={() => onHighlight('underline')}>
        <Underline size={14} />
      </button>
      <button onClick={() => onHighlight('strikeout')}>
        <Strikethrough size={14} />
      </button>
      <button onClick={handleCopy}>
        <Copy size={14} />
      </button>
    </div>
  );
}
