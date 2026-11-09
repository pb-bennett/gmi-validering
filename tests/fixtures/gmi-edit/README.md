# Byte-exact GMI editing fixtures (M0)

Fabricated GMI files for source-preserving editing. Every name, filename, GUID,
coordinate and text value is synthetic. Nothing is copied or derived from a
delivered file. `realGrammarFamilies` contributes only wrapper and sign *shapes*.

- **Bytes are the contract.** Line endings and encoding are deliberate:
  CRLF, LF, mixed and bare CR, plus ISO-8859-1, Windows-1252 `0x86`/`0x98`,
  UTF-8 without BOM and UTF-8 with BOM. `/.gitattributes` marks `*.gmi` here as
  `-text`, so `core.autocrlf` never converts them. Do not open and save them in
  an editor.
- `manifest.json` lists each fixture with its purpose, coverage tags, expected
  reference-harness classification and the SHA-256 of the raw bytes.
- `tests/helpers/gmiEditFixtures.mjs` is the generator. To change a fixture,
  edit the generator, run `node tests/helpers/gmiEditFixtures.mjs --write`, and
  review the byte diff. `tests/gmiEditCorpus.test.mjs` fails if the files, the
  generator and the manifest disagree.
- `guard-*` fixtures are meant to be refused (read-only or parser error) or to
  contain non-editable objects. The harness reports them and never repairs them.

Optional private corpus (read-only, prints aggregate counts only):

```
GMI_EDIT_CORPUS="<dir>[;<dir>...]" node --test tests/gmiEditCorpus.test.mjs
```

Use the platform path delimiter (`;` on Windows, `:` elsewhere). Set
`GMI_EDIT_CORPUS_STRICT=1` to also require zero non-reconcilable files. Never
commit corpus files, generated copies or machine-specific paths.
