import { useRef, useEffect, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useStore } from '../stores/useStore';
import SelectionActionBar from './SelectionActionBar';
import CommentModal from './CommentModal';
import type { Highlight, RelativeRect, AnnotationType } from '../types';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Color mapping for highlights
const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: 'rgba(255, 235, 59, 0.4)',
  green: 'rgba(76, 175, 80, 0.4)',
  blue: 'rgba(33, 150, 243, 0.4)',
  pink: 'rgba(233, 30, 99, 0.4)',
  orange: 'rgba(255, 152, 0, 0.4)',
};

export default function PDFViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTasksRef = useRef<Map<number, any>>(new Map());

  const {
    pdfFile,
    zoom,
    currentPage,
    numPages,
    activeTool,
    activeHighlightColor,
    highlights,
    setNumPages,
    setCurrentPage,
    setPageText,
    setPdfText,
    addHighlight,
    setSelectedTextForAI,
    setSidebarOpen,
    setSidebarTab,
  } = useStore();

  const [selectionInfo, setSelectionInfo] = useState<{
    text: string;
    rect: DOMRect;
    page: number;
  } | null>(null);

  const [commentModalInfo, setCommentModalInfo] = useState<{
    text: string;
    page: number;
    rects: RelativeRect[];
  } | null>(null);

  // Helper to convert screen rects to page-relative coordinates
  const getRelativeRects = useCallback((
    rects: DOMRectList | DOMRect[],
    pageDiv: HTMLDivElement
  ): RelativeRect[] => {
    const pageRect = pageDiv.getBoundingClientRect();
    const result: RelativeRect[] = [];

    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      result.push({
        x: (r.left - pageRect.left) / pageRect.width,
        y: (r.top - pageRect.top) / pageRect.height,
        width: r.width / pageRect.width,
        height: r.height / pageRect.height,
      });
    }
    return result;
  }, []);

  // Render highlights for a specific page
  const renderHighlightsForPage = useCallback((
    pageNum: number,
    pageDiv: HTMLDivElement,
    pageWidth: number,
    pageHeight: number
  ) => {
    // Remove existing highlight overlays
    pageDiv.querySelectorAll('.highlight-layer').forEach(el => el.remove());

    const pageHighlights = highlights.filter(h => h.page === pageNum);
    if (pageHighlights.length === 0) return;

    const highlightLayer = document.createElement('div');
    highlightLayer.className = 'highlight-layer';
    highlightLayer.style.cssText = `
      position: absolute;
      left: 0; top: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    `;

    for (const highlight of pageHighlights) {
      for (const rect of highlight.rects) {
        const overlay = document.createElement('div');
        overlay.className = 'highlight-overlay';

        const left = rect.x * pageWidth;
        const top = rect.y * pageHeight;
        const width = rect.width * pageWidth;
        const height = rect.height * pageHeight;

        if (highlight.type === 'underline') {
          overlay.style.cssText = `
            position: absolute;
            left: ${left}px;
            top: ${top + height - 2}px;
            width: ${width}px;
            height: 2px;
            background: ${HIGHLIGHT_COLORS[highlight.color].replace('0.4', '0.8')};
            pointer-events: none;
          `;
        } else if (highlight.type === 'strikeout') {
          overlay.style.cssText = `
            position: absolute;
            left: ${left}px;
            top: ${top + height / 2 - 1}px;
            width: ${width}px;
            height: 2px;
            background: ${HIGHLIGHT_COLORS[highlight.color].replace('0.4', '0.8')};
            pointer-events: none;
          `;
        } else {
          // Regular highlight
          overlay.style.cssText = `
            position: absolute;
            left: ${left}px;
            top: ${top}px;
            width: ${width}px;
            height: ${height}px;
            background: ${HIGHLIGHT_COLORS[highlight.color]};
            border-radius: 2px;
            pointer-events: none;
            mix-blend-mode: multiply;
          `;
        }

        highlightLayer.appendChild(overlay);
      }
    }

    // Insert highlight layer between canvas and text layer
    const textLayer = pageDiv.querySelector('.text-layer');
    if (textLayer) {
      pageDiv.insertBefore(highlightLayer, textLayer);
    } else {
      pageDiv.appendChild(highlightLayer);
    }
  }, [highlights]);

  // ─── Load PDF ───
  useEffect(() => {
    if (!pdfFile) return;

    const loadPdf = async () => {
      const data = Uint8Array.from(atob(pdfFile.data), (c) => c.charCodeAt(0));
      const doc = await pdfjsLib.getDocument({ data }).promise;
      pdfDocRef.current = doc;
      setNumPages(doc.numPages);

      // Extract all text for AI context
      let fullText = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        setPageText(i, pageText);
        fullText += `\n--- Page ${i} ---\n${pageText}`;
      }
      setPdfText(fullText);
    };

    loadPdf();

    return () => {
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [pdfFile, setNumPages, setPageText, setPdfText]);

  // ─── Render visible pages ───
  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0) return;

    const renderPage = async (pageNum: number) => {
      const doc = pdfDocRef.current;
      if (!doc) return;

      const existing = renderTasksRef.current.get(pageNum);
      if (existing) {
        try { existing.cancel(); } catch {}
      }

      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: zoom * 1.5 }); // Render at higher res

      const pageDiv = pagesRef.current.get(pageNum);
      if (!pageDiv) return;

      // Clear previous content
      pageDiv.innerHTML = '';
      pageDiv.style.width = `${viewport.width}px`;
      pageDiv.style.height = `${viewport.height}px`;

      // Canvas
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      pageDiv.appendChild(canvas);

      const ctx = canvas.getContext('2d')!;
      const renderTask = page.render({ canvasContext: ctx, viewport });
      renderTasksRef.current.set(pageNum, renderTask);

      await renderTask.promise;

      // Text layer for selection
      const textContent = await page.getTextContent();
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'text-layer';
      textLayerDiv.style.cssText = `
        position: absolute;
        left: 0; top: 0;
        width: ${viewport.width}px;
        height: ${viewport.height}px;
        overflow: hidden;
        line-height: 1;
      `;

      // Render text spans with correct positioning
      for (const item of textContent.items as any[]) {
        if (!item.str) continue;

        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        // Font height from transform matrix (accounts for scaling and rotation)
        const fontHeight = Math.hypot(tx[2], tx[3]);

        const span = document.createElement('span');
        span.textContent = item.str;
        span.style.cssText = `
          position: absolute;
          left: ${tx[4]}px;
          top: ${tx[5] - fontHeight}px;
          font-size: ${fontHeight}px;
          font-family: sans-serif;
          white-space: pre;
          color: transparent;
          cursor: text;
        `;
        span.dataset.page = String(pageNum);
        textLayerDiv.appendChild(span);
      }

      pageDiv.appendChild(textLayerDiv);

      // Render highlight overlays for this page
      renderHighlightsForPage(pageNum, pageDiv, viewport.width, viewport.height);
    };

    // Render a window of pages around current
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(numPages, currentPage + 3);

    for (let i = start; i <= end; i++) {
      renderPage(i);
    }
  }, [pdfFile, numPages, currentPage, zoom]);

  // ─── Re-render highlights when they change ───
  useEffect(() => {
    if (!pdfDocRef.current) return;

    pagesRef.current.forEach((pageDiv, pageNum) => {
      const width = pageDiv.clientWidth;
      const height = pageDiv.clientHeight;
      if (width > 0 && height > 0) {
        renderHighlightsForPage(pageNum, pageDiv, width, height);
      }
    });
  }, [highlights, renderHighlightsForPage]);

  // ─── Scroll to current page ───
  useEffect(() => {
    const pageDiv = pagesRef.current.get(currentPage);
    if (pageDiv) {
      pageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentPage]);

  // ─── Intersection observer for page tracking ───
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute('data-page') || '1');
            setCurrentPage(pageNum);
          }
        }
      },
      { root: containerRef.current, threshold: 0.5 }
    );

    pagesRef.current.forEach((div) => observer.observe(div));

    return () => observer.disconnect();
  }, [numPages, setCurrentPage]);

  // ─── Handle text selection ───
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelectionInfo(null);
      return;
    }

    const text = sel.toString().trim();
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Determine page number from selection
    let page = currentPage;
    const startNode = range.startContainer.parentElement;
    if (startNode?.dataset?.page) {
      page = parseInt(startNode.dataset.page);
    }

    const pageDiv = pagesRef.current.get(page);
    if (!pageDiv) return;

    const clientRects = range.getClientRects();
    const relativeRects = getRelativeRects(clientRects, pageDiv);

    // Check if tool creates annotation immediately
    const annotationTools: AnnotationType[] = ['highlight', 'underline', 'strikeout'];
    if (annotationTools.includes(activeTool as AnnotationType)) {
      addHighlight({
        id: Math.random().toString(36).substring(2, 10),
        page,
        rects: relativeRects,
        text,
        color: activeHighlightColor,
        type: activeTool as AnnotationType,
        createdAt: Date.now(),
      });
      sel.removeAllRanges();
      setSelectionInfo(null);
    } else if (activeTool === 'comment') {
      // Show comment modal
      setCommentModalInfo({ text, page, rects: relativeRects });
      sel.removeAllRanges();
      setSelectionInfo(null);
    } else {
      setSelectionInfo({ text, rect, page });
    }
  }, [activeTool, activeHighlightColor, currentPage, addHighlight, getRelativeRects]);

  const handleAskAI = useCallback(() => {
    if (!selectionInfo) return;

    const pageDiv = pagesRef.current.get(selectionInfo.page);
    if (!pageDiv) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const clientRects = range.getClientRects();
    const relativeRects = getRelativeRects(clientRects, pageDiv);

    setSelectedTextForAI(selectionInfo.text, selectionInfo.page, relativeRects);
    setSidebarOpen(true);
    setSidebarTab('chat');
    setSelectionInfo(null);
    window.getSelection()?.removeAllRanges();
  }, [selectionInfo, setSelectedTextForAI, setSidebarOpen, setSidebarTab, getRelativeRects]);

  const handleHighlightSelection = useCallback((type: AnnotationType = 'highlight') => {
    if (!selectionInfo) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const pageDiv = pagesRef.current.get(selectionInfo.page);
    if (!pageDiv) return;

    const range = sel.getRangeAt(0);
    const clientRects = range.getClientRects();
    const relativeRects = getRelativeRects(clientRects, pageDiv);

    addHighlight({
      id: Math.random().toString(36).substring(2, 10),
      page: selectionInfo.page,
      rects: relativeRects,
      text: selectionInfo.text,
      color: activeHighlightColor,
      type,
      createdAt: Date.now(),
    });

    sel.removeAllRanges();
    setSelectionInfo(null);
  }, [selectionInfo, activeHighlightColor, addHighlight, getRelativeRects]);

  const handleSaveComment = useCallback((comment: string) => {
    if (!commentModalInfo) return;

    addHighlight({
      id: Math.random().toString(36).substring(2, 10),
      page: commentModalInfo.page,
      rects: commentModalInfo.rects,
      text: commentModalInfo.text,
      color: activeHighlightColor,
      type: 'highlight',
      comment,
      createdAt: Date.now(),
    });

    setCommentModalInfo(null);
  }, [commentModalInfo, activeHighlightColor, addHighlight]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto bg-surface-0 relative"
      onMouseUp={handleMouseUp}
    >
      <div className="flex flex-col items-center py-6 gap-4 min-h-full">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            data-page={pageNum}
            ref={(el) => {
              if (el) pagesRef.current.set(pageNum, el);
            }}
            className="pdf-page-container relative bg-white"
            style={{
              minHeight: 200,
              // Width will be set dynamically by render
            }}
          />
        ))}

        {numPages === 0 && pdfFile && (
          <div className="flex items-center justify-center h-full text-text-muted">
            Loading PDF…
          </div>
        )}
      </div>

      {/* Selection Action Bar */}
      {selectionInfo && (
        <SelectionActionBar
          rect={selectionInfo.rect}
          containerRef={containerRef}
          onAskAI={handleAskAI}
          onHighlight={handleHighlightSelection}
        />
      )}

      {/* Comment Modal */}
      {commentModalInfo && (
        <CommentModal
          text={commentModalInfo.text}
          onSave={handleSaveComment}
          onCancel={() => setCommentModalInfo(null)}
        />
      )}
    </div>
  );
}
