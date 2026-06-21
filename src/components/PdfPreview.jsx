import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

function base64ToBytes(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4

// Renders a compiled PDF (base64) onto canvases. Pages are oversampled well
// past the display size so text stays crisp at any zoom, and scroll position is
// preserved across recompiles so live editing doesn't jump the view.
export default function PdfPreview({ pdfBase64 }) {
  const scroller = useRef(null)
  const pagesHost = useRef(null)
  const baseWidth = useRef(0) // first page width in CSS px at scale 1
  const renderToken = useRef(0)
  const [pageCount, setPageCount] = useState(0)
  const [zoom, setZoom] = useState(1.4)

  useEffect(() => {
    if (!pdfBase64) return
    const myToken = ++renderToken.current
    const savedScroll = scroller.current ? scroller.current.scrollTop : 0
    let cancelled = false
    let task

    ;(async () => {
      const bytes = base64ToBytes(pdfBase64)
      task = pdfjsLib.getDocument({ data: bytes })
      const pdf = await task.promise
      if (cancelled || myToken !== renderToken.current) return
      setPageCount(pdf.numPages)

      const host = pagesHost.current
      // Oversample: backing-store pixels per CSS pixel. Retina (dpr 2) -> 4x,
      // standard displays -> 2x. Capped to keep memory sane.
      const outputScale = Math.min((window.devicePixelRatio || 1) * 2, 4)
      const frag = document.createDocumentFragment()

      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n)
        if (cancelled || myToken !== renderToken.current) return
        const viewport = page.getViewport({ scale: zoom })
        if (n === 1) baseWidth.current = page.getViewport({ scale: 1 }).width

        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        canvas.className = 'pdf-page'

        const ctx = canvas.getContext('2d', { alpha: false })
        await page.render({
          canvasContext: ctx,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
        }).promise
        if (cancelled || myToken !== renderToken.current) return
        frag.appendChild(canvas)
      }
      // Swap in the freshly rendered pages atomically to avoid flicker.
      host.replaceChildren(frag)
      if (scroller.current) scroller.current.scrollTop = savedScroll
    })()

    return () => {
      cancelled = true
      if (task) task.destroy?.()
    }
  }, [pdfBase64, zoom])

  const clamp = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
  const zoomIn = useCallback(() => setZoom((z) => clamp(z + 0.2)), [])
  const zoomOut = useCallback(() => setZoom((z) => clamp(z - 0.2)), [])
  const fitWidth = useCallback(() => {
    if (scroller.current && baseWidth.current) {
      setZoom(clamp((scroller.current.clientWidth - 48) / baseWidth.current))
    }
  }, [])

  // Ctrl/Cmd + scroll to zoom, like a PDF viewer.
  const onWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      setZoom((z) => clamp(z - Math.sign(e.deltaY) * 0.1))
    }
  }, [])

  return (
    <div className="pdf-wrap">
      <div className="pdf-controls">
        <button onClick={zoomOut} title="Zoom out">−</button>
        <span className="pdf-zoom" onClick={() => setZoom(1)} title="Reset to 100%">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={zoomIn} title="Zoom in">+</button>
        <button onClick={fitWidth} title="Fit to width">Fit</button>
      </div>
      <div className="pdf-scroller" ref={scroller} onWheel={onWheel}>
        {!pdfBase64 && <div className="pdf-empty">Compile to see your PDF.</div>}
        <div className="pdf-pages" ref={pagesHost} />
        {pageCount > 0 && <div className="pdf-count">{pageCount} page{pageCount > 1 ? 's' : ''}</div>}
      </div>
    </div>
  )
}
