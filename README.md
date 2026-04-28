# subdude - Advisor Extension for pi

A [pi-coding-agent](https://github.com/badlogic/pi-mono) that provides a more subdued experience (haha). It comes with two modes, advisor and agent. In the advisor mode, pi is restricted to read-only actions and helps with exploration and explanation, and can only read and edit SUBDUDE.md. In agent mode, normal functionality is restored, but all actions not available in advisor mode require approval.

I created this extension to use in personal projects where I often want to have full control over the codebase. Advisor mode's not dissimilar to the "planning" mode available in other agents like opencode, with the exception of subdude's advisor being geared toward explanation rather than preparing to execute code changes. 

Full disclosure: this extension was created with GLM-5.1 using pi after providing a detailed specification (I realize the irony here!).

I hope you find it useful.

## What It Does

- Advisor mode restricts the agent to read-only tools: `read`, `bash`, `grep`, `find`, `ls`
- Advisor mode replaces `write` and `edit` with `advisor_write` and `advisor_edit` that only target `SUBDUDE.md`
- Advisor mode blocks destructive bash commands (file modification, package managers, git writes, privilege escalation, etc.)
- Advisor mode builds a minimal system prompt with only the sections the advisor needs
- Starts in advisor mode and can toggle back to regular agent mode, with the default pi system prompt
- Requires approval in agent mode before any `write` or `edit`, and before any bash command that is not classified as read-only
- Shows "ADVISOR" or "AGENT" in the status line

## Installation

For local development:

```bash
pi -e ./subdude/src/index.ts
```

To install from a git repository containing this package, add it to your settings:

```json
{
  "packages": ["git:github.com/john-marinelli/subdude"]
}
```

Or globally:
```

pi install git:github.com/john-marinelli/subdude
```

Or try temporarily:

```bash
pi -e git:github.com/john-marinelli/subdude
```

## Usage

Once loaded, the agent starts in advisor mode automatically:

1. Ask the agent to explore the codebase or answer questions
2. The agent reads files and runs read-only commands
3. When asked to, subdude can document the conversation in `SUBDUDE.md` in the current working directory

Toggle modes with the `/advisor` command:

```text
/advisor          # Toggle between advisor and regular agent mode
/advisor on       # Enable advisor mode
/advisor off      # Restore regular agent mode
/advisor status   # Show the current mode
```

Regular agent mode restores the normal system prompt and the normal tool set for the session. The selected mode is saved in the session, so resuming that session restores the last selected mode.

While advisor mode is off, subdude still adds a safety gate:

- `write` always asks for approval
- `edit` always asks for approval
- `bash` asks for approval unless the command is classified as read-only

In non-interactive modes where confirmation UI is unavailable, these mutating actions are blocked instead of running silently.

## Allowed vs Blocked

These restrictions apply only while advisor mode is enabled:

| Action | Allowed in advisor mode |
|--------|-------------------------|
| Read any file | Yes |
| Run read-only bash commands | Yes |
| Write to `SUBDUDE.md` | Yes |
| Edit `SUBDUDE.md` | Yes |
| Write to any other file | No |
| Run destructive bash commands | No |

When advisor mode is disabled, normal tools are restored, but mutating operations still require approval first.

## Files

```
subdude/
├── package.json         # Pi package manifest
├── README.md
├── LICENSE
├── src/
│   ├── index.ts         # Extension entry point
│   ├── bash-guard.ts    # Safe/unsafe command classification
│   ├── advisor-write.ts # advisor_write tool definition
│   ├── advisor-edit.ts  # advisor_edit tool definition
│   ├── edit-diff.ts     # Edit/diff utilities
│   └── types.ts         # Shared constants
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@mariozechner/pi-coding-agent` | Extension API, `withFileMutationQueue`, `ToolDefinition` |
| `typebox` | Schema definitions |
| `diff` | Diff generation for `advisor_edit` results |

## License

MIT
