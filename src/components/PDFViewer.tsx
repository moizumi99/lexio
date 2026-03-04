import { useRef, useEffect, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { useStore } from '../stores/useStore';
import SelectionActionBar from './SelectionActionBar';
import CommentModal from './CommentModal';
import type { Highlight, RelativeRect, AnnotationType } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: 'rgba(255, 235, 59, 0.4)',
  green: 'rgba(76, 175, 80, 0.4)',
  blue: 'rgba(33, 150, 243, 0.4)',
  pink: 'rgba(233, 30, 99, 0.4)',
  orange: 'rgba(255, 152, 0, 0.4)',
};

// ─── Span metadata stored once at render time ───
// All coordinates are PAGE-RELATIVE (0-based from pageDiv top-left).
// This avoids any dependency on scroll position or viewport coordinates.
interface SpanMeta {
  el: HTMLElement;
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  text: string;
  col: 'left' | 'right' | 'full';
}

interface PageCache {
  all: SpanMeta[];       // reading-order sorted
  left: SpanMeta[];      // left-col + full-width, reading order
  right: SpanMeta[];     // right-col + full-width, reading order
  byEl: Map<HTMLElement, number>; // element → index in `all`
}

export default function PDFViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTasksRef = useRef<Map<number, any>>(new Map());

  // Custom selection state — all in refs to avoid re-renders during drag
  const selDragRef = useRef<{
    active: boolean;
    page: number;
    startMeta: SpanMeta;
    columnSpans: SpanMeta[];  // pre-resolved column array for this drag
    startIdx: number;         // index of startMeta in columnSpans
  } | null>(null);
  const liveSelRef = useRef<{ rects: DOMRect[]; text: string; page: number } | null>(null);
  const selLayerRef = useRef<{ layer: HTMLDivElement; page: number; divPool: HTMLDivElement[] } | null>(null);
  const pageCacheRef = useRef<Map<number, PageCache>>(new Map());

  const {
    pdfFile, zoom, currentPage, numPages, activeTool, activeHighlightColor,
    highlights, setNumPages, setCurrentPage, setPageText, setPdfText,
    addHighlight, setSelectedTextForAI, setSidebarOpen, setSidebarTab,
  } = useStore();

  const [selectionInfo, setSelectionInfo] = useState<{
    text: string; rect: DOMRect; page: number; relativeRects: RelativeRect[];
  } | null>(null);

  const [commentModalInfo, setCommentModalInfo] = useState<{
    text: string; page: number; rects: RelativeRect[];
  } | null>(null);

  // ─── Coordinate conversion ───

  const getRelativeRects = useCallback((
    rects: DOMRect[], pageDiv: HTMLDivElement
  ): RelativeRect[] => {
    const pr = pageDiv.getBoundingClientRect();
    const result: RelativeRect[] = [];
    for (const r of rects) {
      if (r.width === 0 || r.height === 0) continue;
      result.push({
        x: (r.left - pr.left) / pr.width,
        y: (r.top - pr.top) / pr.height,
        width: r.width / pr.width,
        height: r.height / pr.height,
      });
    }
    return result;
  }, []);

  // ─── Proximity hit-test ───
  // Finds the nearest span to (clientX, clientY) within the given column array.
  // Uses page-relative cached coordinates so it works regardless of scroll.
  const findNearestSpan = useCallback((
    clientX: number, clientY: number, pageNum: number, columnSpans: SpanMeta[]
  ): { meta: SpanMeta; idx: number } | null => {
    const pageDiv = pagesRef.current.get(pageNum);
    if (!pageDiv || columnSpans.length === 0) return null;
    const pr = pageDiv.getBoundingClientRect();
    // Convert mouse to page-relative coords
    const mx = clientX - pr.left;
    const my = clientY - pr.top;

    let bestDist = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < columnSpans.length; i++) {
      const s = columnSpans[i];
      // Clamp point to rect, then measure distance
      const cx = Math.max(s.left, Math.min(mx, s.right));
      const cy = Math.max(s.top, Math.min(my, s.bottom));
      const d = (cx - mx) ** 2 + (cy - my) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    // Max distance: 40px — beyond that, cursor is too far from any span
    if (bestIdx === -1 || bestDist > 40 * 40) return null;
    return { meta: columnSpans[bestIdx], idx: bestIdx };
  }, []);

  // ─── Selection overlay (reusable layer + div pool) ───

  const clearSelOverlay = useCallback(() => {
    const info = selLayerRef.current;
    if (!info) return;
    for (const div of info.divPool) div.style.display = 'none';
  }, []);

  const removeSelOverlay = useCallback(() => {
    if (selLayerRef.current) {
      selLayerRef.current.layer.remove();
      selLayerRef.current = null;
    }
  }, []);

  const renderSelOverlay = useCallback((page: number, metas: SpanMeta[]) => {
    const pageDiv = pagesRef.current.get(page);
    if (!pageDiv) return;

    // Ensure layer exists for this page
    let info = selLayerRef.current;
    if (!info || info.page !== page || !pageDiv.contains(info.layer)) {
      if (info) info.layer.remove();
      const layer = document.createElement('div');
      layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;';
      const textLayer = pageDiv.querySelector('.textLayer');
      textLayer ? pageDiv.insertBefore(layer, textLayer) : pageDiv.appendChild(layer);
      info = { layer, page, divPool: [] };
      selLayerRef.current = info;
    }

    // Grow pool if needed
    while (info.divPool.length < metas.length) {
      const div = document.createElement('div');
      div.className = 'custom-sel-rect';
      div.style.position = 'absolute';
      info.layer.appendChild(div);
      info.divPool.push(div);
    }

    // Update positions of active rects
    for (let i = 0; i < metas.length; i++) {
      const s = metas[i];
      const div = info.divPool[i];
      div.style.left = `${s.left}px`;
      div.style.top = `${s.top}px`;
      div.style.width = `${s.right - s.left}px`;
      div.style.height = `${s.bottom - s.top}px`;
      div.style.display = '';
    }
    // Hide unused pool divs
    for (let i = metas.length; i < info.divPool.length; i++) {
      info.divPool[i].style.display = 'none';
    }
  }, []);

  // ─── Highlight rendering ───
  const renderHighlightsForPage = useCallback((
    pageNum: number, pageDiv: HTMLDivElement, pageWidth: number, pageHeight: number
  ) => {
    pageDiv.querySelectorAll('.highlight-layer').forEach(el => el.remove());
    const pageHighlights = highlights.filter(h => h.page === pageNum);
    if (pageHighlights.length === 0) return;

    const highlightLayer = document.createElement('div');
    highlightLayer.className = 'highlight-layer';
    highlightLayer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';

    for (const highlight of pageHighlights) {
      for (const rect of highlight.rects) {
        const overlay = document.createElement('div');
        overlay.className = 'highlight-overlay';
        const left = rect.x * pageWidth;
        const top = rect.y * pageHeight;
        const width = rect.width * pageWidth;
        const height = rect.height * pageHeight;

        if (highlight.type === 'underline') {
          overlay.style.cssText = `position:absolute;left:${left}px;top:${top + height - 2}px;width:${width}px;height:2px;background:${HIGHLIGHT_COLORS[highlight.color].replace('0.4', '0.8')};pointer-events:none;`;
        } else if (highlight.type === 'strikeout') {
          overlay.style.cssText = `position:absolute;left:${left}px;top:${top + height / 2 - 1}px;width:${width}px;height:2px;background:${HIGHLIGHT_COLORS[highlight.color].replace('0.4', '0.8')};pointer-events:none;`;
        } else {
          overlay.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;background:${HIGHLIGHT_COLORS[highlight.color]};border-radius:2px;pointer-events:none;mix-blend-mode:multiply;`;
        }
        highlightLayer.appendChild(overlay);
      }
    }

    const textLayerEl = pageDiv.querySelector('.textLayer');
    textLayerEl ? pageDiv.insertBefore(highlightLayer, textLayerEl) : pageDiv.appendChild(highlightLayer);
  }, [highlights]);

  // ─── Load PDF ───
  useEffect(() => {
    if (!pdfFile) return;
    const loadPdf = async () => {
      const data = Uint8Array.from(atob(pdfFile.data), (c) => c.charCodeAt(0));
      const doc = await pdfjsLib.getDocument({ data }).promise;
      pdfDocRef.current = doc;
      setNumPages(doc.numPages);
      let fullText = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ');
        setPageText(i, pageText);
        fullText += `\n--- Page ${i} ---\n${pageText}`;
      }
      setPdfText(fullText);
    };
    loadPdf();
    return () => { pdfDocRef.current?.destroy(); pdfDocRef.current = null; };
  }, [pdfFile, setNumPages, setPageText, setPdfText]);

  // ─── Render visible pages ───
  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0) return;

    const renderPage = async (pageNum: number) => {
      const doc = pdfDocRef.current;
      if (!doc) return;
      const existing = renderTasksRef.current.get(pageNum);
      if (existing) { try { existing.cancel(); } catch {} }

      const page = await doc.getPage(pageNum);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: zoom });

      const pageDiv = pagesRef.current.get(pageNum);
      if (!pageDiv) return;

      pageCacheRef.current.delete(pageNum);
      pageDiv.innerHTML = '';
      pageDiv.style.width = `${viewport.width}px`;
      pageDiv.style.height = `${viewport.height}px`;

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width * dpr);
      canvas.height = Math.round(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      pageDiv.appendChild(canvas);

      const ctx = canvas.getContext('2d')!;
      const renderViewport = page.getViewport({ scale: zoom * dpr });
      const renderTask = page.render({ canvasContext: ctx, viewport: renderViewport });
      renderTasksRef.current.set(pageNum, renderTask);
      await renderTask.promise;

      const textContent = await page.getTextContent();
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.dataset.page = String(pageNum);
      pageDiv.appendChild(textLayerDiv);

      const textLayer = new TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport,
      });
      await textLayer.render();

      textLayerDiv.querySelectorAll('span').forEach(span => {
        span.dataset.page = String(pageNum);
      });

      // ─── Build span cache with PAGE-RELATIVE coordinates ───
      // Using offsetLeft/offsetTop which are relative to the positioned parent (pageDiv).
      // This is stable regardless of scroll position — unlike getBoundingClientRect().
      const rawSpans = Array.from(
        textLayerDiv.querySelectorAll('span:not([role="img"])')
      ) as HTMLElement[];

      const metas: SpanMeta[] = [];
      for (const el of rawSpans) {
        const text = el.textContent || '';
        // offsetLeft/Top are relative to the offsetParent.
        // Since textLayerDiv is position:absolute inside pageDiv which is position:relative,
        // and spans are position:absolute inside textLayerDiv with inset:0,
        // we need to use the span's own offsetLeft/offsetTop (relative to textLayerDiv).
        // But textLayerDiv itself is at inset:0 of pageDiv, so these ARE page-relative.
        const left = el.offsetLeft;
        const top = el.offsetTop;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        if (w === 0 || h === 0) continue;
        metas.push({
          el, left, top, right: left + w, bottom: top + h,
          centerX: left + w / 2, centerY: top + h / 2,
          text, col: 'left', // placeholder, assigned below
        });
      }

      // Sort in reading order: group by line (similar top), then left-to-right
      metas.sort((a, b) => {
        const lineThresh = Math.min(a.bottom - a.top, b.bottom - b.top) * 0.4;
        return Math.abs(a.top - b.top) > lineThresh ? a.top - b.top : a.left - b.left;
      });

      // ─── Detect column gap ───
      // Sort by left edge, merge intervals, find widest interior gap.
      const byLeft = metas.filter(s => s.text.trim()).slice().sort((a, b) => a.left - b.left);
      let maxGap = 0;
      let dividerX = viewport.width / 2;
      if (byLeft.length > 1) {
        let mergedRight = byLeft[0].right;
        for (let i = 1; i < byLeft.length; i++) {
          if (byLeft[i].left > mergedRight) {
            const gap = byLeft[i].left - mergedRight;
            const mid = (mergedRight + byLeft[i].left) / 2;
            if (gap > maxGap && mid > viewport.width * 0.15 && mid < viewport.width * 0.85) {
              maxGap = gap;
              dividerX = mid;
            }
          }
          mergedRight = Math.max(mergedRight, byLeft[i].right);
        }
      }
      const isMultiCol = maxGap >= 10;

      // Assign column tags and bucket
      const leftSpans: SpanMeta[] = [];
      const rightSpans: SpanMeta[] = [];
      const byEl = new Map<HTMLElement, number>();
      for (let i = 0; i < metas.length; i++) {
        const s = metas[i];
        byEl.set(s.el, i);
        const w = s.right - s.left;
        s.col = w > viewport.width * 0.55
          ? 'full'
          : (!isMultiCol || s.centerX < dividerX) ? 'left' : 'right';
        if (s.col !== 'right') leftSpans.push(s);
        if (s.col !== 'left') rightSpans.push(s);
      }

      pageCacheRef.current.set(pageNum, { all: metas, left: leftSpans, right: rightSpans, byEl });
      renderHighlightsForPage(pageNum, pageDiv, viewport.width, viewport.height);
    };

    const start = Math.max(1, currentPage - 2);
    const end = Math.min(numPages, currentPage + 3);
    for (let i = start; i <= end; i++) renderPage(i);
  }, [pdfFile, numPages, currentPage, zoom]);

  // ─── Re-render highlights when they change ───
  useEffect(() => {
    if (!pdfDocRef.current) return;
    pagesRef.current.forEach((pageDiv, pageNum) => {
      const rect = pageDiv.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        renderHighlightsForPage(pageNum, pageDiv, rect.width, rect.height);
      }
    });
  }, [highlights, renderHighlightsForPage]);

  // ─── Scroll to current page ───
  useEffect(() => {
    const pageDiv = pagesRef.current.get(currentPage);
    if (pageDiv) pageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // ─── Determine which page the cursor is over ───
  const getPageAtPoint = useCallback((clientX: number, clientY: number): number | null => {
    // Check all rendered pages
    for (const [pageNum, pageDiv] of pagesRef.current) {
      const r = pageDiv.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return pageNum;
      }
    }
    return null;
  }, []);

  // ─── Custom selection mouse handlers ───

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Determine which page the click is on
    const pageNum = getPageAtPoint(e.clientX, e.clientY);
    if (pageNum === null) {
      removeSelOverlay();
      liveSelRef.current = null;
      selDragRef.current = null;
      setSelectionInfo(null);
      return;
    }
    const cache = pageCacheRef.current.get(pageNum);
    if (!cache) {
      removeSelOverlay();
      liveSelRef.current = null;
      selDragRef.current = null;
      setSelectionInfo(null);
      return;
    }

    // First try: use the 'all' spans to find what the user clicked on
    const hit = findNearestSpan(e.clientX, e.clientY, pageNum, cache.all);
    if (!hit) {
      removeSelOverlay();
      liveSelRef.current = null;
      selDragRef.current = null;
      setSelectionInfo(null);
      return;
    }

    e.preventDefault();

    // Pick the column array that matches the clicked span
    const startMeta = hit.meta;
    const columnSpans =
      startMeta.col === 'right' ? cache.right :
      startMeta.col === 'left'  ? cache.left  :
      cache.all;
    const startIdx = columnSpans.indexOf(startMeta);

    selDragRef.current = { active: true, page: pageNum, startMeta, columnSpans, startIdx };
    liveSelRef.current = {
      page: pageNum,
      rects: [startMeta.el.getBoundingClientRect()],
      text: startMeta.text.trim(),
    };
    renderSelOverlay(pageNum, [startMeta]);
    setSelectionInfo(null);
  }, [getPageAtPoint, findNearestSpan, removeSelOverlay, renderSelOverlay]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = selDragRef.current;
    if (!drag?.active) return;

    // Find the nearest span IN THE SAME COLUMN ARRAY
    const hit = findNearestSpan(e.clientX, e.clientY, drag.page, drag.columnSpans);
    if (!hit) return;

    const endIdx = hit.idx;
    const [lo, hi] = drag.startIdx <= endIdx
      ? [drag.startIdx, endIdx]
      : [endIdx, drag.startIdx];

    const selected = drag.columnSpans.slice(lo, hi + 1);
    const wordMetas = selected.filter(s => s.text.trim().length > 0);
    const rects = wordMetas.map(s => s.el.getBoundingClientRect());
    const text = selected.map(s => s.text).join('').trim();

    liveSelRef.current = { page: drag.page, rects, text };
    renderSelOverlay(drag.page, wordMetas);
  }, [findNearestSpan, renderSelOverlay]);

  const handleMouseUp = useCallback(() => {
    const drag = selDragRef.current;
    const live = liveSelRef.current;

    if (!drag?.active || !live || !live.text.trim() || live.rects.length === 0) {
      if (drag) drag.active = false;
      return;
    }

    drag.active = false;
    const { page, rects, text } = live;
    const pageDiv = pagesRef.current.get(page);
    if (!pageDiv) return;

    const relativeRects = getRelativeRects(rects, pageDiv);
    const boundingRect = new DOMRect(
      Math.min(...rects.map(r => r.left)),
      Math.min(...rects.map(r => r.top)),
      Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left)),
      Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top))
    );

    const annotationTools: AnnotationType[] = ['highlight', 'underline', 'strikeout'];
    if (annotationTools.includes(activeTool as AnnotationType)) {
      addHighlight({
        id: Math.random().toString(36).substring(2, 10),
        page, rects: relativeRects, text, color: activeHighlightColor,
        type: activeTool as AnnotationType, createdAt: Date.now(),
      });
      removeSelOverlay();
      liveSelRef.current = null;
      selDragRef.current = null;
    } else if (activeTool === 'comment') {
      setCommentModalInfo({ text, page, rects: relativeRects });
      removeSelOverlay();
      liveSelRef.current = null;
      selDragRef.current = null;
    } else {
      setSelectionInfo({ text, rect: boundingRect, page, relativeRects });
    }
  }, [activeTool, activeHighlightColor, addHighlight, removeSelOverlay, getRelativeRects]);

  const handleAskAI = useCallback(() => {
    if (!selectionInfo) return;
    setSelectedTextForAI(selectionInfo.text, selectionInfo.page, selectionInfo.relativeRects);
    setSidebarOpen(true);
    setSidebarTab('chat');
    setSelectionInfo(null);
    removeSelOverlay();
    liveSelRef.current = null;
  }, [selectionInfo, setSelectedTextForAI, setSidebarOpen, setSidebarTab, removeSelOverlay]);

  const handleHighlightSelection = useCallback((type: AnnotationType = 'highlight') => {
    if (!selectionInfo) return;
    addHighlight({
      id: Math.random().toString(36).substring(2, 10),
      page: selectionInfo.page, rects: selectionInfo.relativeRects,
      text: selectionInfo.text, color: activeHighlightColor, type, createdAt: Date.now(),
    });
    setSelectionInfo(null);
    removeSelOverlay();
    liveSelRef.current = null;
  }, [selectionInfo, activeHighlightColor, addHighlight, removeSelOverlay]);

  const handleSaveComment = useCallback((comment: string) => {
    if (!commentModalInfo) return;
    addHighlight({
      id: Math.random().toString(36).substring(2, 10),
      page: commentModalInfo.page, rects: commentModalInfo.rects,
      text: commentModalInfo.text, color: activeHighlightColor,
      type: 'highlight', comment, createdAt: Date.now(),
    });
    setCommentModalInfo(null);
  }, [commentModalInfo, activeHighlightColor, addHighlight]);

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto bg-surface-0 relative"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="flex flex-col items-center py-6 gap-4 min-h-full">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            data-page={pageNum}
            ref={(el) => { if (el) pagesRef.current.set(pageNum, el); }}
            className="pdf-page-container relative bg-white"
            style={{ minHeight: 200 }}
          />
        ))}
        {numPages === 0 && pdfFile && (
          <div className="flex items-center justify-center h-full text-text-muted">
            Loading PDF…
          </div>
        )}
      </div>

      {selectionInfo && (
        <SelectionActionBar
          rect={selectionInfo.rect}
          containerRef={containerRef}
          onAskAI={handleAskAI}
          onHighlight={handleHighlightSelection}
        />
      )}

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
