import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { readFileSync } from "node:fs"
import { transformSync } from "@babel/core"
import typescript from "@babel/preset-typescript"
import solid from "babel-preset-solid"

registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith("/tui.tsx")) return nextLoad(url, context)
    const filename = new URL(url).pathname
    const source = readFileSync(new URL(url), "utf8")
    const { code } = transformSync(source, {
      filename,
      configFile: false,
      babelrc: false,
      presets: [[solid, { moduleName: "@opentui/solid", generate: "universal" }], typescript],
    })
    return { format: "module", source: code, shortCircuit: true }
  },
})

const { testRender } = await import("@opentui/solid")
const { default: plugin } = await import("../tui.tsx")
let slot
const ctx = {
  client: { rpc: () => ({ read: () => new Promise(() => {}) }) },
  storage: {
    memory: () => [{
      status: "ready",
      now: Date.now(),
      hourly: { usedPercent: 28 },
      weekly: { usedPercent: 96 },
    }, () => {}],
    store: (_name, { initial }) => [initial, () => {}],
  },
  theme: { text: { muted: "#aaaaaa", base: "#ffffff", feedback: {
    error: { base: "#ff0000" }, warning: { base: "#ffff00" },
  } } },
  keymap: { layer: () => {} },
  ui: {
    slot: ({ render }) => { slot = render; return () => {} },
    model: { current: () => ({ providerID: "openai" }) },
  },
  data: {
    session: { get: () => ({ model: { providerID: "openai" } }) },
    on: () => () => {},
  },
}
const cleanup = plugin.setup(ctx)
try {
  const view = await testRender(() => slot({ sessionID: "test" }), { width: 40, height: 10 })
  try {
    await view.renderOnce()
    let lines = view.captureCharFrame().split("\n")
    const hourly = lines.find((line) => line.includes("hourly"))
    const weekly = lines.find((line) => line.includes("weekly"))
    assert.equal(hourly.indexOf("█"), weekly.indexOf("░"))
    assert.equal(hourly.indexOf("("), weekly.indexOf("("))

    view.resize(24, 10)
    await view.renderOnce()
    lines = view.captureCharFrame().split("\n")
    assert.ok(lines.some((line) => line.includes("hourly") && line.includes("72%")))
    assert.ok(lines.some((line) => line.includes("weekly") && line.includes("4%")))
    assert.ok(lines.filter((line) => line.includes("(—)")).length >= 2)
  } finally {
    await view.dispose()
  }
} finally {
  cleanup()
}
