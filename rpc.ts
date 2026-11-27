import { Rpc } from "@opencode/plugin/rpc"
import { POLL_INTERVAL_SECONDS } from "./settings.ts"

const window = {
  type: "object",
  properties: {
    usedPercent: { type: "number" },
    resetsAt: { type: "number" },
  },
  required: ["usedPercent"],
  additionalProperties: false,
} as const

export const CodexLimits = Rpc.define({
  id: "opencode-codex-stats",
  methods: {
    read: {
      input: {
        type: "object",
        properties: {
          refresh: { type: "boolean" },
          pollIntervalSeconds: { type: "integer", enum: POLL_INTERVAL_SECONDS },
        },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ready", "stale", "unavailable"] },
          hourly: window,
          weekly: window,
          availableResets: { type: "integer", minimum: 0 },
          checkedAt: { type: "number" },
          message: { type: "string" },
        },
        required: ["status"],
        additionalProperties: false,
      },
    },
  },
  events: {},
})
