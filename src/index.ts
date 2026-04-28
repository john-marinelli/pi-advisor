import type {
  BuildSystemPromptOptions,
  ExtensionContext,
  ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { isSafeCommand, requiresApprovalForCommand } from "./bash-guard.js";
import { advisorEditTool } from "./advisor-edit.js";
import { advisorWriteTool } from "./advisor-write.js";

const ADVISOR_TOOLS = [
  "read",
  "bash",
  "grep",
  "find",
  "ls",
  "advisor_write",
  "advisor_edit",
];

const ADVISOR_ONLY_TOOLS = new Set(["advisor_write", "advisor_edit"]);
const MODE_ENTRY_TYPE = "pi-advisor-mode";

type AdvisorMode = "advisor" | "agent";
const APPROVAL_BLOCK_REASON = "Blocked by pi-advisor: approval required.";

/**
 * Build a minimal system prompt from systemPromptOptions,
 * including only the sections the advisor needs instead of
 * the full default prompt.
 */
function buildAdvisorPrompt(opts: BuildSystemPromptOptions): string {
  const parts: string[] = [];

  // Core advisor instructions
  parts.push(`[PI ADVISOR - ADVISOR MODE]
You are an advisor. You can only read and explore the codebase.
You CANNOT modify any files except PI_ADVISOR_NOTES.md.
- Use read, bash, grep, find, ls to explore
- Bash is restricted to read-only commands
- Prefer responding directly to the user rather than writing to PI_ADVISOR_NOTES.md, unless asked to do so
- Use code in examples if appropriate when responding to the user
- When asked to document findings in PI_ADVISOR_NOTES.md, be succinct and include code examples
- Be concise while still explaining thoroughly
- Using bash commands that will alter anything or executing python scripts is disallowed
- Use advisor_write to create PI_ADVISOR_NOTES.md when asked to document findings
- Use advisor_edit to update PI_ADVISOR_NOTES.md`);

  // Working directory
  parts.push(`Working directory: ${opts.cwd}`);

  // Tool snippets (one-line descriptions, much shorter than full schemas)
  if (opts.toolSnippets && Object.keys(opts.toolSnippets).length > 0) {
    const activeSnippets = (opts.selectedTools ?? [])
      .filter((name) => opts.toolSnippets![name])
      .map((name) => `- ${name}: ${opts.toolSnippets![name]}`);
    if (activeSnippets.length > 0) {
      parts.push("Available tools:\n" + activeSnippets.join("\n"));
    }
  }

  // Project context files (AGENTS.md, etc.)
  if (opts.contextFiles && opts.contextFiles.length > 0) {
    const contextParts = opts.contextFiles.map(
      (f) => `--- ${f.path} ---\n${f.content}`,
    );
    parts.push("Project context:\n" + contextParts.join("\n\n"));
  }

  // Skills
  if (opts.skills && opts.skills.length > 0) {
    const skillParts = opts.skills
      .filter((s) => !s.disableModelInvocation)
      .map((s) => `- ${s.name}: ${s.description} (${s.filePath})`);
    if (skillParts.length > 0) {
      parts.push("Skills:\n" + skillParts.join("\n"));
    }
  }

  // Custom prompt guidelines
  if (opts.promptGuidelines && opts.promptGuidelines.length > 0) {
    parts.push("Guidelines:\n" + opts.promptGuidelines.join("\n"));
  }

  // Any user-provided append system prompt
  if (opts.appendSystemPrompt) {
    parts.push(opts.appendSystemPrompt);
  }

  // Custom system prompt (from --system-prompt, SYSTEM.md, or custom templates)
  if (opts.customPrompt) {
    parts.push(opts.customPrompt);
  }

  return parts.join("\n\n");
}

function summarizeForApproval(text: string, maxLength = 800): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 13)}\n...[truncated]`;
}

async function confirmAction(
  ctx: ExtensionContext,
  title: string,
  message: string,
): Promise<{ block: true; reason: string } | undefined> {
  if (!ctx.hasUI) {
    return {
      block: true,
      reason: `${APPROVAL_BLOCK_REASON} No interactive UI is available to confirm the action.`,
    };
  }

  const approved = await ctx.ui.confirm(title, message, { signal: ctx.signal });
  if (approved) return undefined;

  return { block: true, reason: APPROVAL_BLOCK_REASON };
}

export default function(pi: ExtensionAPI) {
  let mode: AdvisorMode = "advisor";
  let regularTools: string[] | undefined;

  // Register custom tools
  pi.registerTool(advisorWriteTool);
  pi.registerTool(advisorEditTool);

  function getCurrentRegularTools(): string[] {
    const activeTools = pi.getActiveTools().filter((name) => !ADVISOR_ONLY_TOOLS.has(name));

    if (activeTools.length > 0) return activeTools;

    return pi
      .getAllTools()
      .map((tool) => tool.name)
      .filter((name) => !ADVISOR_ONLY_TOOLS.has(name));
  }

  function captureRegularTools(): string[] {
    if (regularTools && regularTools.length > 0) return regularTools;

    regularTools = getCurrentRegularTools();
    return regularTools;
  }

  function updateStatus(ctx: ExtensionContext): void {
    if (mode === "advisor") {
      ctx.ui.setStatus("pi-advisor", ctx.ui.theme.fg("accent", "ADVISOR"));
      return;
    }
    ctx.ui.setStatus("pi-advisor", ctx.ui.theme.fg("success", "AGENT"));
  }

  function setMode(nextMode: AdvisorMode, ctx: ExtensionContext, persist = false): void {
    if (mode === "agent") {
      regularTools = getCurrentRegularTools();
    }

    mode = nextMode;

    if (mode === "advisor") {
      captureRegularTools();
      pi.setActiveTools(ADVISOR_TOOLS);
    } else {
      pi.setActiveTools(captureRegularTools());
    }

    updateStatus(ctx);

    if (persist) {
      pi.appendEntry(MODE_ENTRY_TYPE, { mode });
    }
  }

  function parseModeArgument(args: string): AdvisorMode | "status" | undefined {
    const value = args.trim().toLowerCase();
    if (!value) return mode === "advisor" ? "agent" : "advisor";
    if (["on", "advisor", "readonly", "read-only"].includes(value)) return "advisor";
    if (["off", "agent", "regular", "normal"].includes(value)) return "agent";
    if (value === "status") return "status";
    return undefined;
  }

  function notifyModeChange(nextMode: AdvisorMode, ctx: ExtensionContext): void {
    ctx.ui.notify(
      nextMode === "advisor"
        ? "Advisor mode enabled. Tools are restricted to read-only exploration plus PI_ADVISOR_NOTES.md updates."
        : "Advisor mode disabled. Regular agent prompt and tools restored. Mutating bash commands plus all writes and edits now require approval.",
      "info",
    );
  }

  function toggleMode(ctx: ExtensionContext): void {
    const nextMode: AdvisorMode = mode === "advisor" ? "agent" : "advisor";
    setMode(nextMode, ctx, true);
    notifyModeChange(nextMode, ctx);
  }

  pi.registerCommand("advisor", {
    description: "Toggle pi-advisor mode, or use /advisor on, /advisor off, /advisor status",
    handler: async (args, ctx) => {
      const nextMode = parseModeArgument(args);
      if (!nextMode) {
        ctx.ui.notify("Usage: /advisor [on|off|status]", "warning");
        return;
      }

      if (nextMode === "status") {
        ctx.ui.notify(`pi-advisor is in ${mode === "advisor" ? "advisor" : "regular agent"} mode.`, "info");
        return;
      }

      setMode(nextMode, ctx, true);
      notifyModeChange(nextMode, ctx);
    },
  });

  pi.registerShortcut("shift+tab", {
    description: "Toggle between advisor and regular agent mode",
    handler: async (ctx) => toggleMode(ctx),
  });

  // Enforce strict read-only behavior in advisor mode and approval gates in agent mode.
  pi.on("tool_call", async (event, ctx) => {
    if (mode === "advisor") {
      if (event.toolName === "write" || event.toolName === "edit") {
        return {
          block: true,
          reason: "Advisor mode: use advisor_write or advisor_edit instead.",
        };
      }

      if (event.toolName !== "bash") return;
      if (isToolCallEventType("bash", event)) {
        const command = event.input.command;
        if (!isSafeCommand(command)) {
          return {
            block: true,
            reason: `Advisor mode: command blocked. Only read-only commands are allowed.\nCommand: ${command}`,
          };
        }
      }
      return;
    }

    if (isToolCallEventType("write", event)) {
      return confirmAction(
        ctx,
        "Approve file write?",
        `Allow overwrite/create for ${event.input.path}?\n\nThis write will replace the full file contents.`,
      );
    }

    if (isToolCallEventType("edit", event)) {
      const editCount = Array.isArray(event.input.edits) ? event.input.edits.length : 0;
      return confirmAction(
        ctx,
        "Approve file edit?",
        `Allow ${editCount} edit${editCount === 1 ? "" : "s"} to ${event.input.path}?`,
      );
    }

    if (isToolCallEventType("bash", event) && requiresApprovalForCommand(event.input.command)) {
      return confirmAction(
        ctx,
        "Approve bash command?",
        `This bash command is not classified as read-only:\n\n${summarizeForApproval(event.input.command)}`,
      );
    }
  });

  pi.on("before_agent_start", async (event) => {
    if (mode !== "advisor") return;

    return {
      systemPrompt: buildAdvisorPrompt(event.systemPromptOptions),
    };
  });

  // Restrict to read-only + advisor tools on session start, unless the session
  // was previously toggled to regular agent mode.
  pi.on("session_start", async (_event, ctx) => {
    captureRegularTools();

    const modeEntry = ctx.sessionManager
      .getEntries()
      .filter(
        (entry: { type: string; customType?: string }) =>
          entry.type === "custom" && entry.customType === MODE_ENTRY_TYPE,
      )
      .pop() as { data?: { mode?: AdvisorMode } } | undefined;

    const restoredMode = modeEntry?.data?.mode === "agent" ? "agent" : "advisor";
    setMode(restoredMode, ctx);
  });
}
