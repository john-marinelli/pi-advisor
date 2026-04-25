# pi-advisor - Advisor Extension for pi

A [pi-coding-agent](https://github.com/badlogic/pi-mono) extension that restricts the agent to read-only codebase exploration. The agent can only write to `PI_ADVISOR_NOTES.md`, acting as an advisor that explores, analyzes, and documents findings.

I created this extension to use in personal projects where I often want to have full control over the codebase.

Full disclosure: this extension was created with GLM-5.1 using pi after providing a detailed specification.

I hope you find it useful.

## What It Does

- Restricts the agent to read-only tools: `read`, `bash`, `grep`, `find`, `ls`
- Replaces `write` and `edit` with `advisor_write` and `advisor_edit` that only target `PI_ADVISOR_NOTES.md`
- Blocks destructive bash commands (file modification, package managers, git writes, privilege escalation, etc.)
- Builds a minimal system prompt with only the sections the advisor needs
- Shows "ADVISOR" in the status line

## Installation

For local development:

```bash
pi -e ./pi-advisor/src/index.ts
```

To install from a git repository containing this package, add it to your settings:

```json
{
  "packages": ["git:github.com/john-marinelli/pi-advisor"]
}
```

Or try temporarily:

```bash
pi -e git:github.com/john-marinelli/pi-advisor
```

## Usage

Once loaded, the agent operates in advisor mode automatically:

1. Ask the agent to explore the codebase or answer questions
2. The agent reads files and runs read-only commands
3. When asked to, pi-advisor can document the conversation in `PI_ADVISOR_NOTES.md` in the current working directory

## Allowed vs Blocked

| Action | Allowed |
|--------|---------|
| Read any file | Yes |
| Run read-only bash commands | Yes |
| Write to `PI_ADVISOR_NOTES.md` | Yes |
| Edit `PI_ADVISOR_NOTES.md` | Yes |
| Write to any other file | No |
| Run destructive bash commands | No |

## Files

```
pi-advisor/
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
