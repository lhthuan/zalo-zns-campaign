"use client";

import { useEffect, useRef, useState } from "react";

// Zalo's preview page hard-codes a 375px-wide card with outer margins and
// relies on the viewport to scroll. Inside our narrower, fixed-height iframe
// that produced both scrollbars, so let the card shrink to the frame width
// and size the iframe to its content instead.
const FIT_CSS = `
html, body { margin: 0 !important; overflow: hidden !important; height: auto !important; }
.preview-container { width: auto !important; max-width: 375px !important; margin: 0 auto !important; }
`;

const MIN_HEIGHT = 200;

export function ZnsPreviewFrame({ html, title }: { html: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let observer: ResizeObserver | null = null;

    function attach() {
      observer?.disconnect();
      // srcDoc + allow-same-origin keeps the frame same-origin with us, so
      // its document is readable; bail quietly if a browser says otherwise.
      const doc = iframe?.contentDocument;
      if (!doc?.body) return;
      const style = doc.createElement("style");
      style.textContent = FIT_CSS;
      doc.head?.appendChild(style);

      const measure = () => setHeight(Math.max(MIN_HEIGHT, Math.ceil(doc.body.scrollHeight)));
      measure();
      observer = new ResizeObserver(measure);
      observer.observe(doc.body);
    }

    iframe.addEventListener("load", attach);
    return () => {
      iframe.removeEventListener("load", attach);
      observer?.disconnect();
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      title={title}
      sandbox="allow-scripts allow-same-origin"
      scrolling="no"
      style={{ height }}
      className="block w-full border-0"
    />
  );
}
