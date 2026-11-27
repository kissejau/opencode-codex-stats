import { execFileSync } from "node:child_process"
import test from "node:test"

test("sidebar aligns usage bars and wraps at narrow widths", {
  skip: Number(process.versions.node.split(".")[0]) < 26 ? "OpenTUI native rendering requires Node 26" : false,
}, () => {
  execFileSync(process.execPath, ["--conditions=browser", new URL("./sidebar-render.mjs", import.meta.url).pathname], {
    encoding: "utf8",
    timeout: 20_000,
    stdio: "pipe",
  })
})
