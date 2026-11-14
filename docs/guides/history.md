# Back button & deep links

[← README](../../README.md) · [All guides](README.md)

On phones, the back button or back gesture should close a full-screen viewer, not
leave the page. Pass `history` to give the open viewer its own history entry:

```tsx
<ImageViewer {...props} history={{ param: "photo" }} />
```

- Opening pushes one entry. With `param`, its URL names the open item
  (`?photo=<id>`, or whatever `value(item)` returns), and paging updates it in
  place, so one back press closes the viewer however far the user paged.
- With `paging: "push"`, each item gets its own entry instead: back steps through
  the photos the user paged to and closes from the one the viewer opened on
  (forward steps ahead again). Closing from the UI still returns to the page in
  one go. `history={{ param: "photo", paging: "push" }}`
- Back runs through `onEscape` first, so an open drawer can claim the press (return
  `true`) the same way it claims Escape. The viewer stays open and re-arms its
  entry.
- Closing from the UI steps back off the entry, restoring the URL you opened from.
  A deep-linked open (`?photo=…` already in the URL) strips the param from the
  entry underneath, so backing out lands on a closed-viewer URL.
- Browsers skip a history entry added before the user has interacted with the
  page, so on a cold deep-linked open (or a reload while open) the entry is added
  at the first click, tap, or key press instead.

To close the viewer and go somewhere else in the app (a drawer link to another
page), navigate from `ctx.close`'s callback, not right after it:

```tsx
<a onClick={() => ctx.close(() => navigate(`/taxa/${name}`))}>{name}</a>
```

The viewer leaves its history entry with an asynchronous back step. A URL you
push before that step lands becomes the entry it steps back from, so the
viewer's entry stays behind your new page and back needs an extra press. The
callback runs once the step has landed (at once without `history`), while the
close is still animating.

`history: true` gives the back-button behavior without touching the URL. While it's
on, don't write the same param yourself, and keep `history.state` intact in any
`replaceState` you make while the viewer is open (the entry is recognized by a key
in it).
