"use client";

import { useEffect, useRef } from "react";

/**
 * The wrapper around anything served for an iframe.
 *
 * Two jobs, both of which exist because the page is about to be shown inside
 * somebody else's.
 *
 * **The theme is decided by the URL, not by the visitor.** The site stores a
 * preference in localStorage, which inside an iframe belongs to this origin
 * rather than to the host page — so an embed would otherwise inherit whatever
 * the reader last chose on the ratings site, which is nothing to do with the
 * page they are looking at now. The inline script runs on parse, before the
 * content below it paints, so there is no flash of the wrong theme.
 *
 * **It reports its own height.** An iframe cannot size itself to its content,
 * so the embed snippet carries an optional four-line listener; this is the
 * other half of it. Sent on mount and on every resize, and harmless when
 * nobody is listening.
 */
export default function EmbedFrame({
  theme,
  children,
}: {
  theme: "light" | "dark";
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;

    const send = () => {
      const height = Math.ceil(el.getBoundingClientRect().height) + 24;
      // No target origin to restrict to — the whole point is that this is
      // embedded on sites we do not know about. The message carries a public
      // bracket's pixel height and nothing else.
      window.parent?.postMessage({ type: "alpreps:height", height }, "*");
    };

    send();
    const ro = new ResizeObserver(send);
    ro.observe(el);
    // Fonts landing after first paint change the height; without this the
    // frame settles a few pixels short and clips its last row.
    document.fonts?.ready.then(send).catch(() => {});
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.setAttribute('data-theme','${theme}');`,
        }}
      />
      {/*
        The site's own canvas — and the wash over it — would draw a visible
        rectangle on the host's page, which is the one thing an embed should
        not do. Transparent lets it take whatever background it is dropped
        onto; the cards inside still carry their own surface colour, so the
        bracket keeps its shape either way.
      */}
      <style>{"html,body{background:transparent!important}body::before{display:none!important}"}</style>
      <div ref={box} className="p-3">
        {children}
      </div>
    </>
  );
}
