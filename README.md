# OpenCode Codex Stats

Show Codex usage limits in the OpenCode terminal sidebar.

- Remaining usage for the short and weekly windows, reset countdowns, and available reset credits.
- Configurable display and refresh interval via `/codex-stats`.

## Requirements

- OpenCode V2 (developed against 2.4.2).
- An OpenAI account connected with ChatGPT OAuth via `/connect`. API keys are not supported.
- An OpenAI model selected in the current session. The sidebar displays the plugin in a session.

## Install

### From npm

After the package is published, add it to `~/.config/opencode/opencode.json` or
`opencode.jsonc`, keeping any existing entries:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-codex-stats"]
}
```

### From source

```sh
git clone https://github.com/kissejau/opencode-codex-stats.git
```

Add the **absolute path** of the cloned directory to the `plugins` list in
`~/.config/opencode/opencode.json` or `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-codex-stats"]
}
```

On Windows, use a path valid on the machine running OpenCode. If replacing an
older copy, remove its plugin entry first to avoid loading both.

### Ask an AI agent

Give your agent the repository URL and ask:

> Install https://github.com/kissejau/opencode-codex-stats for OpenCode V2
> using the source instructions in its README. Preserve my existing configuration.

## Usage

Open a session using an OpenAI model and check the sidebar. Run `/codex-stats`
to choose which rows to show and set the polling interval. If usage is
unavailable, reconnect OpenAI through `/connect` and check that the sidebar is
visible. Some accounts may not report every value.

The plugin sends your OpenAI OAuth access token and account ID to
`https://chatgpt.com/backend-api/wham/usage` to fetch usage data. This
undocumented endpoint may change.

## Development

Run the tests with `npm test`. Develop changes in a `feature/...` or `fix/...`
branch and submit them to `dev`; `main` is reserved for releases.
