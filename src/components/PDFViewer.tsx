import { useRef, useEffect, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useStore } from '../stores/useStore';
import SelectionActionBar from './SelectionActionBar';
import type { Highlight } from '../types';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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

      // Text layer
      const textContent = await page.getTextContent();
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'text-layer';
      textLayerDiv.style.cssText = `
        position: absolute;
        left: 0; top: 0;
        width: ${viewport.width}px;
        height: ${viewport.height}px;
        overflow: hidden;
        opacity: 0.25;
        line-height: 1;
      `;

      // Render text spans
      for (const item of textContent.items as any[]) {
        const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const span = document.createElement('span');
        span.textContent = item.str;
        span.style.cssText = `
          position: absolute;
          left: ${tx[4]}px;
          top: ${tx[5] - item.height * viewport.scale}px;
          font-size: ${Math.abs(tx[3])}px;
          font-family: sans-serif;
          white-space: pre;
          color: transparent;
          cursor: text;
        `;
        span.dataset.page = String(pageNum);
        textLayerDiv.appendChild(span);
      }

      pageDiv.appendChild(textLayerDiv);
    };

    // Render a window of pages around current
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(numPages, currentPage + 3);

    for (let i = start; i <= end; i++) {
      renderPage(i);
    }
  }, [pdfFile, numPages, currentPage, zoom]);

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

    if (activeTool === 'highlight') {
      // Create highlight immediately
      const rects: DOMRect[] = [];
      for (let i = 0; i < range.getClientRects().length; i++) {
        rects.push(range.getClientRects()[i]);
      }
      addHighlight({
        id: Math.random().toString(36).substring(2, 10),
        page,
        rects: rects.map((r) => DOMRect.fromRect(r)),
        text,
        color: activeHighlightColor,
        createdAt: Date.now(),
      });
      sel.removeAllRanges();
      setSelectionInfo(null);
    } else {
      setSelectionInfo({ text, rect, page });
    }
  }, [activeTool, activeHighlightColor, currentPage, addHighlight]);

  const handleAskAI = useCallback(() => {
    if (!selectionInfo) return;
    setSelectedTextForAI(selectionInfo.text, selectionInfo.page);
    setSidebarOpen(true);
    setSidebarTab('chat');
    setSelectionInfo(null);
    window.getSelection()?.removeAllRanges();
  }, [selectionInfo, setSelectedTextForAI, setSidebarOpen, setSidebarTab]);

  const handleHighlightSelection = useCallback(() => {
    if (!selectionInfo) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const rects: DOMRect[] = [];
    for (let i = 0; i < range.getClientRects().length; i++) {
      rects.push(range.getClientRects()[i]);
    }

    addHighlight({
      id: Math.random().toString(36).substring(2, 10),
      page: selectionInfo.page,
      rects: rects.map((r) => DOMRect.fromRect(r)),
      text: selectionInfo.text,
      color: activeHighlightColor,
      createdAt: Date.now(),
    });

    sel.removeAllRanges();
    setSelectionInfo(null);
  }, [selectionInfo, activeHighlightColor, addHighlight]);

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
    </div>
  );
}
