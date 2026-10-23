# Figures on cards: contract for connected apps

Status: in place since built-in note types version 2 (October 2026). Lecture Scribe is built against this.

A figure is a picture that carries part of a card's answer. Decorative pictures do not belong on cards. Words with a relevant picture help; a picture that is only decoration hurts.

## 1. Figure fields

The built-in note types `open`, `choice` and `cloze` each have two optional fields:

| Field name | Shown | Use |
|---|---|---|
| `Figure` | back, below the answer (before the explanation / extra) | the full figure |
| `Front figure` | front, below the question | the same figure with the parts the question asks for hidden |

- Send them in `fields` by these exact names (`POST /notes`, `PUT /notes/:id`). Matching is case-insensitive; the stored keys are `f4`/`f5` (open), `f10`/`f11` (choice), `f3`/`f4` (cloze).
- Empty or missing means no figure; the templates render nothing for an empty field. Send `""` to remove one.
- A front figure only makes sense with parts hidden. On the back, when both are filled, the front version is hidden and the full figure shows below the answer. A cloze card with only a front figure shows it on the back too.
- Value: HTML, one of:
  - inline SVG: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" …>…</svg>`
    - **`viewBox` is required**; it is what lets the figure scale to the screen width. `width`/`height` attributes are fine.
    - Draw in `currentColor` (strokes, fills, `<text fill="currentColor">`), so it follows light and dark mode. Plain black (`#000`, `black`) is turned into `currentColor` in dark mode as a fallback; other hard colours stay as they are.
    - No `<script>`, no event attributes, no `<foreignObject>`, no external references. The API does not strip them (cards render in a sandboxed frame), but the zoom view shows figures with scripts off, so a figure must work without them.
  - an uploaded picture: `<img src="/images/<id>" alt="…">` with the id from section 2. Write `/images/<id>` exactly; the API turns it into a signed `/media/…` URL in responses and back on writes.
- Size: one field may hold at most 60 000 characters, and each rendered side of the card at most 100 KB (both figures sit on the back of an open or choice card, since the back repeats the front). Aim for SVGs under 20 KB.

## 2. Uploading a picture with the app token

`POST /images`, `multipart/form-data`, the file in the field `file`.

- Types for an app token: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`. Anything else answers 400. Max 10 MB per file; the account's media quota (default 5 GB) applies.
- Optional field `card_id`: must be a card of the same account, else 404. Not needed for figures.
- Answer `201`: `{ "id": "<uuid>", "url": "/images/<uuid>", "cardId": null, "filename": "…", "mimeType": "…", "createdAt": "…" }`.
- The file belongs to the token's user. Put `<img src="/images/<id>">` into a figure field.
- An uploaded SVG is only ever shown through `<img>` and served with `Content-Security-Policy: script-src 'none'`, so it cannot run code and does not see the page's colours: `currentColor` there is black. For drawings that must follow dark mode, send inline SVG (section 1) instead of an upload.

## 3. Rewriting a note with the app token

`PUT /notes/:id` with body `{ "fields": { … } }`.

- Allowed only for notes whose `source_ref` starts with `scribe:` (notes the app created with `POST /notes`). Any other note answers `403 APP_TOKEN_SCOPE`.
- Only `fields` may be sent. `tags`, `topic_id` or `concept` in the body answer `403 APP_TOKEN_SCOPE`.
- `fields` is merged: fields not sent keep their value. Every card of the note renders again.
- The edit throws away tutor questions written for the old content (also when only a figure changed), so the next study session asks a fresh one.
- Caution for the app: the learner may have edited the note in LearnForge since the upload. A rewrite overwrites those fields.

## 4. What the learner sees

- Flip review, card detail, card editor: the figure scales to the width; a tall image stays within about two thirds of the screen height; a tap or click opens it full screen (wide drawings pan sideways on a phone). In dark mode an uploaded image gets a white backing.
- Tutor mode: the question is written from the card's text. The front figure appears below the question; after the answer the full figure replaces it, above the explanation. A card whose front is only a picture (image occlusion, a bare diagram) is shown as the card itself and rated by hand.
- Lists: rows show a thumbnail of the first uploaded image, or a picture icon for a drawn figure.

## 5. Checklist for Scribe

1. Field names exactly `Figure` and `Front figure`.
2. Inline SVG has a `viewBox`, uses `currentColor`, has no script.
3. Front figure only together with hidden parts, never the full answer.
4. Slide pictures: upload first, then `<img src="/images/<id>">` with the returned id.
5. `PUT /notes/:id` sends `{ fields }` only, and only for notes it created with a `scribe:` source_ref.
6. Each side stays under 100 KB; one field under 60 000 characters.
