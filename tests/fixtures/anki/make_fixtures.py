"""
Builds the Anki fixture packages for tests/src/workflows/33-anki-import.test.ts
with real Anki (pip install anki). Run: python make_fixtures.py <out_dir>

Writes: basic-latest.apkg, basic-legacy.apkg, basic.colpkg and fixture.json
(the facts the tests assert, read back from the collection itself).
"""
import base64, json, os, sys, tempfile

from anki.collection import Collection, ExportAnkiPackageOptions
from anki.decks import DeckId

out = os.path.abspath(sys.argv[1])
os.makedirs(out, exist_ok=True)
tmp = tempfile.mkdtemp()
col = Collection(os.path.join(tmp, "collection.anki2"))
col.set_config("fsrs", True)

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNl7BcQAAAABJRU5ErkJggg==")
MP3 = bytes([0xFF, 0xFB, 0x90, 0x00]) + bytes(413)
col.media.write_data("hola.png", PNG)
col.media.write_data("perro gato.png", PNG + b"\x00")  # space in the name, distinct bytes
col.media.write_data("hola.mp3", MP3)
col.media.write_data("_logo.png", PNG + b"\x01")

vocab = col.decks.id("Spanish::Vocab")
grammar = col.decks.id("Spanish::Grammar")
geo = col.decks.id("Geography")

def add(model_name, fields, deck, tags=""):
    m = col.models.by_name(model_name)
    n = col.new_note(m)
    for k, v in fields.items():
        n[k] = v
    n.tags = tags.split()
    col.add_note(n, DeckId(deck))
    return n

reversed_note = add("Basic (and reversed card)", {"Front": 'hola <img src="hola.png">', "Back": "hello [sound:hola.mp3]"}, vocab, "spanish::vocab greeting")
image_only = add("Basic", {"Front": '<img src="perro%20gato.png">', "Back": "dog &amp; cat"}, vocab, "spanish::vocab")
cloze = add("Cloze", {"Text": "{{c1::Paris}} is the capital of {{c2::France::country}}", "Back Extra": "Europe"}, geo, "geo")
multi = add("Cloze", {"Text": "{{c1::Ser}} and {{c2::estar}} both mean {{c1,2::to be}}"}, grammar, "grammar")
typed = add("Basic (type in the answer)", {"Front": "perro", "Back": "dog"}, vocab)
optional = add("Basic (optional reversed card)", {"Front": "gato", "Back": "cat", "Add Reverse": "&nbsp;"}, vocab)

# A custom note type: two templates, CSS, a template-level media asset.
mm = col.models
custom = mm.new("LF Custom")
for f in ["Word", "Meaning", "Example"]:
    mm.add_field(custom, mm.new_field(f))
t1 = mm.new_template("Recognize")
t1["qfmt"] = '<img src="_logo.png"><div class="w">{{Word}}</div>'
t1["afmt"] = "{{FrontSide}}<hr id=answer>{{Meaning}}{{#Example}}<i>{{Example}}</i>{{/Example}}"
t2 = mm.new_template("Produce")
t2["qfmt"] = "{{Meaning}}"
t2["afmt"] = "{{FrontSide}}<hr id=answer>{{Word}}"
mm.add_template(custom, t1)
mm.add_template(custom, t2)
custom["css"] = ".card { font-family: serif; } .w { font-size: 30px; }"
mm.add(custom)
custom_note = add("LF Custom", {"Word": "casa", "Meaning": "house", "Example": "mi casa"}, vocab, "custom")

# Review history: answer every card of the reversed note and the cloze note a few times.
def review(card_ids, ratings):
    for cid in card_ids:
        for r in ratings:
            card = col.get_card(cid)
            card.start_timer()
            states = col._backend.get_scheduling_states(card.id)
            ans = col.sched.build_answer(card=card, states=states, rating=r)
            col.sched.answer_card(ans)

review(reversed_note.card_ids(), [2, 2])  # CardAnswer: 0 again, 1 hard, 2 good, 3 easy
review([cloze.card_ids()[0]], [0, 2])
review([custom_note.card_ids()[0]], [3])

col.sched.suspend_cards([typed.card_ids()[0]])
col.sched.set_due_date([image_only.card_ids()[0]], "7")

filtered = col.sched.get_or_create_filtered_deck(DeckId(0))
filtered.name = "Cram"
filtered.config.search_terms[0].search = "tag:custom"
filtered.config.reschedule = True
col.sched.add_or_update_filtered_deck(filtered)

def cards_of(n):
    rows = []
    for cid in n.card_ids():
        c = col.get_card(cid)
        rows.append({
            "ord": c.ord, "type": c.type, "queue": c.queue, "due": c.due, "ivl": c.ivl, "reps": c.reps, "lapses": c.lapses,
            "deck": col.decks.name(c.odid or c.did), "in_filtered": bool(c.odid),
            "stability": c.memory_state.stability if c.memory_state else None,
            "difficulty": c.memory_state.difficulty if c.memory_state else None,
            "revlog": len(col.card_stats_data(cid).revlog),
        })
    return rows

facts = {
    "anki_version": __import__("anki.buildinfo", fromlist=["version"]).version,
    "crt": col.crt,
    "notes": {
        name: {"guid": n.guid, "model": n.note_type()["name"], "fields": dict(n.items()), "tags": n.tags, "cards": cards_of(n)}
        for name, n in [("reversed", reversed_note), ("image_only", image_only), ("cloze", cloze), ("multi", multi),
                        ("typed", typed), ("optional", optional), ("custom", custom_note)]
    },
    "media": sorted(col.media.dir() and os.listdir(col.media.dir())),
}

opts = lambda legacy: ExportAnkiPackageOptions(with_scheduling=True, with_deck_configs=True, with_media=True, legacy=legacy)
col.export_anki_package(out_path=os.path.join(out, "basic-latest.apkg"), options=opts(False), limit=None)
col.export_anki_package(out_path=os.path.join(out, "basic-legacy.apkg"), options=opts(True), limit=None)
col.export_collection_package(os.path.join(out, "basic.colpkg"), include_media=True, legacy=False)
col.close()

# A second, tiny package with one image-occlusion note (a stock note type LearnForge cannot draw yet).
io_dir = tempfile.mkdtemp()
io = Collection(os.path.join(io_dir, "collection.anki2"))
img = os.path.join(io_dir, "skeleton.png")
with open(img, "wb") as f:
    f.write(PNG)
io.add_image_occlusion_notetype()
io_type = io.models.by_name("Image Occlusion")
io.add_image_occlusion_note(
    notetype_id=io_type["id"], image_path=img,
    occlusions="{{c1::image-occlusion:rect:left=.1:top=.1:width=.3:height=.2:oi=1}}{{c2::image-occlusion:rect:left=.5:top=.5:width=.2:height=.2:oi=1}}",
    header="Bones", back_extra="", tags=["anatomy"],
)
io.export_anki_package(out_path=os.path.join(out, "occlusion.apkg"), options=opts(False), limit=None)
io_note = io.get_note(io.find_notes("")[0])
facts["occlusion"] = {"guid": io_note.guid, "cards": len(io_note.card_ids()), "stock_kind": io_type.get("originalStockKind")}
io.close()

with open(os.path.join(out, "fixture.json"), "w") as f:
    json.dump(facts, f, indent=2, ensure_ascii=False)
print(json.dumps({k: v["cards"] for k, v in facts["notes"].items()}, indent=1)[:3000])
