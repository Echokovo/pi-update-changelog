# pi-update-changelog

Interactive changelog viewer and updater for installed Pi packages.

Detects available package updates asynchronously on startup, shows commit history, GitHub releases, and raw CHANGELOGs in a TUI overlay, and installs updates directly from the list.

> [!IMPORTANT]
> This is a fork of [`mblarsen/pi-extensions`](https://github.com/mblarsen/pi-extensions), package [`@mblarsen/pi-update-changelog`](https://www.npmjs.com/package/@mblarsen/pi-update-changelog) by [Michael Bøcker-Larsen](https://github.com/mblarsen). It is extracted from that monorepo and carries one behavioural change: the `package_changelog` tool is no longer registered by default, and `/update-changelog-summary` covers the same ground on demand. See [LLM tool](#llm-tool). Everything else is upstream work under the original MIT license.

## Demo

![demo](demo.gif)

## Install

From git:

```bash
pi install git:github.com/Echokovo/pi-update-changelog
pi install git:github.com/Echokovo/pi-update-changelog@v0.1.0  # pin a release
```

Or clone it and point Pi at the directory:

```bash
git clone git@github.com:Echokovo/pi-update-changelog.git ~/ws/repos/pi-update-changelog
pi install ~/ws/repos/pi-update-changelog
```

## Usage

| Command | Description |
|---|---|
| `/update-changelog` | Open the interactive package update changelog viewer |
| `/update-changelog-summary [package]` | Fetch changelogs for pending updates and ask the model to summarize them |

## Detail views

- **commits** — chronological commit history with conventional-commit coloring (breaking changes in bold red, features in green, fixes in cyan)
- **releases** — markdown-rendered GitHub release notes with an inline `INSTALLED VERSION` marker
- **changelog** — lazily fetched raw `CHANGELOG.md` from the remote repository

## Interactive controls

- **↑↓** or **j/k** select package · **Enter** view details · **u** install update · **v** toggle view · **d** toggle dates (commits view) · **Esc** close
- In details view: **gg** top · **G** bottom · **Ctrl+U** half-page up · **Ctrl+D** half-page down

## LLM tool

`package_changelog` — fetch changelog and release notes for an npm package or GitHub repository. Shows version history and recent changes.

**The tool is not registered by default.** A registered tool is part of every request, even when unused, so the default keeps it out and `/update-changelog-summary` does the same job on demand:

```
/update-changelog-summary            # every package with a pending update
/update-changelog-summary pi-task-ui # one npm package
/update-changelog-summary owner/repo # one GitHub repository
```

The command fetches the changelogs itself and injects them into the conversation, so the model summarizes them without a tool call. The raw changelog stays out of the transcript.

To put the tool back in every request, opt in from `~/.pi/agent/settings.json`:

```json
{
  "updateChangelog": {
    "tool": true
  }
}
```

`true` (or `"always"`) registers the tool. `false`, `"auto"`, `"off"`, or no setting at all leaves it unregistered. An unrecognized value is reported as a warning instead of being guessed at. Restart Pi for a change to take effect.

> [!TIP]
> Set `export PI_OFFLINE=1` to disable Pi's built-in startup package update check and let `/update-changelog` handle all update needs cleanly.

## Development

```bash
npm ci
npm run check
```

`npm run check` runs the typecheck, the tests, and a `npm pack --dry-run` that verifies which files would be published.
