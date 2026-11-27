# OpenCode Codex Stats

Show Codex usage limits in the OpenCode terminal sidebar.

- Remaining usage for the short and weekly windows, reset countdowns, and available reset credits.
- Configurable display and refresh interval via `/codex-stats`.

## Requirements

- OpenCode V2 (developed against 2.4.2).
- An OpenAI account connected via `/connect` using **Codex browser (legacy)** or
  **Codex device code (legacy)**. **Sign in with ChatGPT** and **API key** are
  not supported by the current version.
- An OpenAI model selected in the current session. The sidebar displays the plugin in a session.

## Install

### From npm

Add it to `~/.config/opencode/opencode.json` or `opencode.jsonc`, keeping any
existing entries:

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

Open a session using an OpenAI model and check the sidebar. For example:

```text
Codex
hourly  63%  ██████░░░░  (2h14m)
weekly  39%  ████░░░░░░  (3d8h)
resets  3
```

The example reflects the current source; the published npm version may differ.
Percentages and bars show remaining usage; countdowns show time until reset.
Run `/codex-stats` to choose which rows to show and set the polling interval.
The `hourly` row represents the five-hour window.

The plugin sends your OpenAI OAuth access token and account ID to
`https://chatgpt.com/backend-api/wham/usage` to fetch usage data. This
undocumented endpoint may change.

## Troubleshooting

- **No Codex panel:** open a session with an OpenAI model and make sure the
  sidebar is visible. Check that the plugin is present in your configuration.
- **Usage unavailable:** use `/connect` to connect OpenAI with one of the
  supported legacy Codex methods. ChatGPT sign-in and API keys are not supported.
- **Stale or missing values:** the usage request may have failed, or your account
  may not report every value. Check the connection and try again later.

## Development

Use Node.js 24 or newer for development. Run `npm ci`, `npm run typecheck`, and
`npm test`. Develop changes in a `feature/...` or `fix/...`
branch and submit a pull request to `main`.

For a release, check the tests and package contents with `npm test` and
`npm pack --dry-run`, tag the reviewed commit on `main`, and publish that
version to npm.
