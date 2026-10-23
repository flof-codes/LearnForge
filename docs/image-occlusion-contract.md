# Image occlusion: the note contract

LearnForge stores image occlusion in **Anki's own format**, so an Anki note imports 1:1, a note from
Lecture Scribe looks exactly like one made in Anki, and an `.apkg` export can write it back unchanged.
Verified against Anki's source (`rslib/src/cloze.rs`, `rslib/src/image_occlusion/imageocclusion.rs`,
`ts/routes/image-occlusion/shapes/*`) and a note exported by Anki 26.09.3 (`tests/fixtures/anki/occlusion.apkg`).

## Note type

Built-in key **`occlusion`** ("Image Occlusion"), kind `cloze`: one card per occlusion number.

| Field | Holds |
|---|---|
| `Occlusion` | The shapes, Anki's syntax (below). Required. |
| `Image` | `<img src="/images/<uuid>">`, the picture uploaded with `POST /images`. Required. |
| `Header` | Shown above the picture on both sides. Also the note's concept unless `concept` is sent. |
| `Back Extra` | Shown under the picture on the back. |
| `Comments` | Stored, never shown (as in Anki). |

## Occlusion syntax

```
{{c1::image-occlusion:rect:left=.3762:top=.52:width=.114:height=.052:oi=1}}
```

- `cN` is the card. Several shapes with the same `cN` are asked together on one card. `{{c1,2::…}}` puts a shape on two cards.
- Positions and sizes are **fractions of the image, 0–1** (left/top from the top-left corner). Anki writes up to 4 decimals, leading zero dropped.
- Shapes:
  - `rect` — `left`, `top`, `width`, `height`
  - `ellipse` — `left`, `top` (corner of its bounding box), `rx`, `ry` (radii as fractions of image width and height)
  - `polygon` — `points=x,y x,y x,y` (at least three); `left`/`top` optional, they move the bounding box there
  - `text` — a label drawn on the image (`text`, `left`, `top`, `fs` font size as a fraction of image height, `scale`); always `c0`, never asked
- Optional on any shape: `angle` (rotation around left/top, in 1/10000 of a turn: `2500` = 90°), `fill` (colour of a covered, not-asked shape).
- `oi=1` = **hide all, guess one**: the shapes of the other cards stay covered. Without it: **hide one, guess one** — only the asked shape is covered.
- In a value, `\` and `:` are escaped with a backslash (`text=Femur\: long bone`).
- Shapes may be separated by `<br>` (Anki does that); anything outside `{{…}}` is ignored on the picture.

On the front the asked shape(s) are red, the others yellow (`oi=1`) or not drawn. On the back the asked
shape is outlined; covered shapes stay covered and "Toggle masks" lifts them. Tap the picture to zoom.

## Validation (`POST /notes`, `PUT /notes/:id`)

400 when `Image` has no `<img src=…>`, a shape name is unknown, a required number is missing or outside
−0.5…1.5 (pixel coordinates are refused), a polygon has fewer than three points, or no shape has `c1` or higher.
Notes imported from Anki are taken as Anki wrote them.

## Example: Lecture Scribe

```http
POST /images            (multipart, field "file" = the slide PNG)   → { "id": "8f0c…" }

POST /notes
Authorization: Bearer lfa_…
{
  "topic_id": "2b7e5c1a-…",
  "note_type": "occlusion",
  "fields": {
    "Occlusion": "{{c1::image-occlusion:rect:left=.3762:top=.52:width=.114:height=.052:oi=1}}<br>{{c2::image-occlusion:rect:left=.61:top=.2:width=.15:height=.06:oi=1}}<br>{{c2::image-occlusion:ellipse:left=.1:top=.7:rx=.05:ry=.04:oi=1}}",
    "Image": "<img src=\"/images/8f0c2d4e-6a1b-4c3d-9e8f-0a1b2c3d4e5f\">",
    "Header": "Brachial plexus — slide 14",
    "Back Extra": "Lecture 3, Anatomy II"
  },
  "tags": ["anatomy", "scribe"],
  "source_ref": "scribe:lecture-3:slide-14:io"
}
```

→ 201 with the note and two cards (`clozeNumber` 1 and 2). Sending the same `source_ref` again returns the
same note and creates nothing.

## Tutor and chat

The tutor serves occlusion cards as the card itself (no written question): the picture is the question,
the learner reveals the back and rates. Study cards carry `noteTypeKey: "occlusion"`.
