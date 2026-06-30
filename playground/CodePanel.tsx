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
  closeOnBackdropClick: boolean;
  accent: string;
}

function buildCode(o: CodeOptions): string {
  const lines = [
    `import { useState } from "react";`,
    `import { ImageViewer } from "@jekrch/react-viewport-lightbox";`,
    ``,
    `function Gallery() {`,
    `  const [open, setOpen] = useState(false);`,
    `  const [index, setIndex] = useState(0);`,
    ``,
    `  return (`,
    `    // Accent themes the viewer via a CSS custom property.`,
    `    <div style={{ "--rvl-accent": "${o.accent}" }}>`,
    `      {items.map((item, i) => (`,
    `        <button key={item.id} onClick={() => { setIndex(i); setOpen(true); }}>`,
    `          <img src={item.thumbnail} alt={item.alt} />`,
    `        </button>`,
    `      ))}`,
    ``,
    `      {open && (`,
    `        <ImageViewer`,
    `          items={items}`,
    `          index={index}`,
    `          loop={${o.loop}}`,
    `          zoom={${o.zoom}}`,
  ];

  // zoomToCursor only applies while zoom is on — mirror the disabled control.
  if (o.zoom) lines.push(`          zoomToCursor={${o.zoomToCursor}}`);

  lines.push(
    `          closeOnBackdropClick={${o.closeOnBackdropClick}}`,
    `          onIndexChange={setIndex}`,
    `          onClose={() => setOpen(false)}`,
    `        />`,
    `      )}`,
    `    </div>`,
    `  );`,
    `}`,
  );

  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Anchored patterns, tried in order against the remaining string. Single-pass
// so inserted markup is never re-scanned.
const PATTERNS: [RegExp, string][] = [
  [/^\/\/[^\n]*/, "comment"],
  [/^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/, "string"],
  [/^\b(?:import|from|const|return|function|true|false|null)\b/, "keyword"],
  [/^ImageViewer\b/, "component"],
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
