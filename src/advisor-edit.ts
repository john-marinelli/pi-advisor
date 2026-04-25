import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import {
	applyEditsToNormalizedContent,
	detectLineEnding,
	generateDiffString,
	normalizeToLF,
	restoreLineEndings,
	stripBom,
} from "./edit-diff.js";
import { NOTES_FILENAME } from "./types.js";

const replaceEditSchema = Type.Object(
	{
		oldText: Type.String({
			description:
				"Exact text to replace. Must be unique in PI_ADVISOR_NOTES.md and must not overlap with other edits[].oldText.",
		}),
		newText: Type.String({ description: "Replacement text." }),
	},
	{ additionalProperties: false },
);

const advisorEditSchema = Type.Object(
	{
		edits: Type.Array(replaceEditSchema, {
			description:
				"One or more targeted replacements. Each edit is matched against the original file, not incrementally.",
		}),
	},
	{ additionalProperties: false },
);

type AdvisorEditInput = { edits: Array<{ oldText: string; newText: string }> };

/** Handle legacy top-level oldText/newText and JSON-string edits */
function prepareArguments(input: unknown): AdvisorEditInput {
	if (!input || typeof input !== "object") return { edits: [] };
	const args: Record<string, unknown> = { ...input };
	if (typeof args.edits === "string") {
		try {
			const parsed = JSON.parse(args.edits);
			if (Array.isArray(parsed)) args.edits = parsed;
		} catch {
			/* ignore */
		}
	}
	const oldText = typeof args.oldText === "string" ? args.oldText : undefined;
	const newText = typeof args.newText === "string" ? args.newText : undefined;
	if (oldText === undefined || newText === undefined) {
		return { edits: Array.isArray(args.edits) ? args.edits : [] };
	}
	const existingEdits = Array.isArray(args.edits) ? [...args.edits] : [];
	const edits = [...existingEdits, { oldText, newText }];
	const { oldText: _, newText: __, ...rest } = args;
	return { ...rest, edits };
}

export const advisorEditTool: ToolDefinition<
	typeof advisorEditSchema,
	{ diff: string; firstChangedLine?: number } | undefined
> = {
	name: "advisor_edit",
	label: "advisor_edit",
	description:
		"Edit PI_ADVISOR_NOTES.md using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file. This is the only file you can edit.",
	promptSnippet: "Edit PI_ADVISOR_NOTES.md to update your notes",
	promptGuidelines: [
		"Use advisor_edit to update sections of PI_ADVISOR_NOTES.md with precise text replacements",
	],
	parameters: advisorEditSchema,
	prepareArguments,

	async execute(_toolCallId, input, signal, _onUpdate, ctx) {
		const { edits } = input;
		if (!Array.isArray(edits) || edits.length === 0) {
			throw new Error("edits must contain at least one replacement.");
		}

		const absolutePath = resolve(ctx.cwd, NOTES_FILENAME);

		return withFileMutationQueue(absolutePath, async () => {
			if (signal?.aborted) throw new Error("Operation aborted");

			// Check file exists
			try {
				await access(absolutePath, constants.R_OK | constants.W_OK);
			} catch {
				throw new Error(`File not found: ${NOTES_FILENAME}. Use advisor_write to create it first.`);
			}

			// Read
			const buffer = await readFile(absolutePath);
			const rawContent = buffer.toString("utf-8");

			// Strip BOM, normalize line endings, apply edits
			const { bom, text: content } = stripBom(rawContent);
			const originalEnding = detectLineEnding(content);
			const normalizedContent = normalizeToLF(content);
			const { baseContent, newContent } = applyEditsToNormalizedContent(
				normalizedContent,
				edits,
				NOTES_FILENAME,
			);

			// Restore and write
			const finalContent = bom + restoreLineEndings(newContent, originalEnding);
			await writeFile(absolutePath, finalContent, "utf-8");

			// Generate diff
			const diffResult = generateDiffString(baseContent, newContent);
			return {
				content: [
					{
						type: "text",
						text: `Successfully replaced ${edits.length} block(s) in ${NOTES_FILENAME}.`,
					},
				],
				details: { diff: diffResult.diff, firstChangedLine: diffResult.firstChangedLine },
			};
		});
	},
};
