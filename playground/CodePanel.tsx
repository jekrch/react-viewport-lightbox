import { useState } from "react";

/**
 * Live "view the code" panel for the playground. It regenerates a simulated
 * `<ImageViewer>` usage snippet from the current control selections, so toggling
 * a control on the page shows exactly which prop it maps to. Highlighting is a
 * tiny self-contained tokenizer — no syntax-highlighting dependency, in keeping
 * with the library's zero-dep stance.
 */
export interface CodeOptions {
  loop: boolean;
  zoom: boolean;
  zoomToCursor: boolean;
  wheelZooms: boolean;
  closeOnBackdropClick: boolean;
  swipeToClose: boolean;
  tapToToggleChrome: boolean;
  history: boolean;
  backSteps: boolean;
  badge: boolean;
  hint: boolean;
  navHeight: number;
  navInset: number;
  accent: string;
}

// Library defaults (38px arrows, ~21px bottom inset); only emit each prop once
// the control has been moved off it, so the snippet stays minimal.
const DEFAULT_NAV_HEIGHT = 38;
const DEFAULT_NAV_INSET = 21;

function buildCode(o: CodeOptions): string {
  const opts: string[] = [
    `    accent: "${o.accent}",`,
    `    loop: ${o.loop},`,
    `    zoom: ${o.zoom},`,
  ];

  // zoomToCursor only applies while zoom is on — mirror the disabled control.
  if (o.zoom) opts.push(`    zoomToCursor: ${o.zoomToCursor},`);
  // The default wheel pans a zoomed image (trackpads pinch to zoom).
  if (o.zoom && o.wheelZooms) opts.push(`    wheel: "zoom",`);
  // Defaults to true; only worth writing when turned off.
  if (!o.swipeToClose) opts.push(`    swipeToClose: false,`);
  if (o.tapToToggleChrome) opts.push(`    tapToToggleChrome: true,`);
  opts.push(`    closeOnBackdropClick: ${o.closeOnBackdropClick},`);
  if (o.history) {
    opts.push(
      `    // Back closes the viewer; ?photo=<id> links open straight onto a photo.`,
      o.backSteps
        ? `    history: { param: "photo", paging: "push" },`
        : `    history: { param: "photo" },`,
    );
  }
  if (o.hint) opts.push(`    hint: true,`);
  if (o.navHeight !== DEFAULT_NAV_HEIGHT) opts.push(`    navHeight: ${o.navHeight},`);
  if (o.navInset !== DEFAULT_NAV_INSET) opts.push(`    navInset: ${o.navInset},`);
  if (o.badge) {
    opts.push(`    renderImageOverlay: (ctx) => <span className="badge">{ctx.item.alt}</span>,`);
  }

  return [
    `import { useLightbox, type ViewerItem } from "@jekrch/react-viewport-lightbox/lazy";`,
    ``,
    `const items: ViewerItem[] = [`,
    `  { id: "1", src: "/photos/1.jpg", thumbnail: "/photos/1-thumb.jpg", alt: "First" },`,
    `  { id: "2", src: "/photos/2.jpg", thumbnail: "/photos/2-thumb.jpg", alt: "Second" },`,
    `];`,
    ``,
    `function Gallery() {`,
    `  // Loads the viewer's code when the page is idle, and each photo on`,
    `  // hover or press. Takes any viewer prop.`,
    `  const lightbox = useLightbox(items, {`,
    ...opts,
    `  });`,
    ``,
    `  return (`,
    `    <>`,
    `      {items.map((item, i) => (`,
    `        // Opens the viewer, and the image zooms out of (and back into) it.`,
    `        <button key={item.id} {...lightbox.triggerProps(i)}>`,
    `          <img src={item.thumbnail} alt={item.alt} />`,
    `        </button>`,
    `      ))}`,
    `      {lightbox.viewer}`,
    `    </>`,
    `  );`,
    `}`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Anchored patterns, tried in order against the remaining string. Single-pass
// so inserted markup is never re-scanned.
const PATTERNS: [RegExp, string][] = [
  [/^\/\/[^\n]*/, "comment"],
  [/^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/, "string"],
  [/^\b(?:import|from|type|const|return|function|true|false|null)\b/, "keyword"],
  [/^(?:useLightbox|ViewerItem)\b/, "component"],
  [/^[A-Za-z_]\w*(?=\s*=[^=])/, "prop"],
];

function highlight(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    let matched = false;
    for (const [re, cls] of PATTERNS) {
      const m = re.exec(rest);
      if (m) {
        out += `<span class="c-${cls}">${escapeHtml(m[0])}</span>`;
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += escapeHtml(code[i]);
      i += 1;
    }
  }
  return out;
}

export function CodePanel(props: CodeOptions) {
  const [copied, setCopied] = useState(false);
  const code = buildCode(props);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="pg-code">
      <div className="pg-code-bar">
        <span className="pg-code-file">Gallery.tsx</span>
        <span className="pg-code-hint">updates as you change the controls above</span>
        <button className="pg-copy" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="pg-code-body">
        <code dangerouslySetInnerHTML={{ __html: highlight(code) }} />
      </pre>
    </div>
  );
}
