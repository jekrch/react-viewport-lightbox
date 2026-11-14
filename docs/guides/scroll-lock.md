# Page scroll lock

[← README](../../README.md) · [All guides](README.md)

While the viewer is open, the page behind it is locked in place: it can't scroll,
and it keeps its exact scroll position when the viewer closes. Locking hides the
page's scrollbar. On desktops with space-taking scrollbars, that would normally
widen the viewport and nudge the page sideways, so the lock offsets the page by the
width the viewport gained and nothing in it moves. This is always on and needs no
setup. A root that keeps its scrollbar space anyway (`scrollbar-gutter: stable`, or
`overflow-y: scroll` on `<html>`) gets no offset, because nothing widens.

`position: fixed` elements in your page (a fixed header, a floating button) are laid
out against the viewport rather than the page, so the lock can't hold them still by
itself. While locked, it sets `--rvl-scrollbar-width` on `<html>` to the width it's
compensating for, so they can opt in with one line:

```css
.site-header {
  padding-right: var(--rvl-scrollbar-width, 0px);
}
.chat-button {
  right: calc(1rem + var(--rvl-scrollbar-width, 0px));
}
```

The variable is only set while there's a width to compensate for (never on touch
devices, overlay scrollbars, or a stable gutter, where nothing shifts), and is removed
when the viewer closes, so keep the `0px` fallback.
