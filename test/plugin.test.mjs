import { readFile } from "node:fs/promises"
import { test } from "node:test"
import assert from "node:assert/strict"

test("Codex stats settings open directly without the Hesoyam menu", async () => {
  const source = await readFile(new URL("../tui.tsx", import.meta.url), "utf8")
  assert.match(source, /slash: \{ name: "codex-stats" \}/)
  assert.match(source, /run: showCodexSettings/)
  assert.doesNotMatch(source, /hesoyam/i)
})
