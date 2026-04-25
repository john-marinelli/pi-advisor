import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { NOTES_FILENAME } from "./types.js";

const advisorWriteSchema = Type.Object({
	content: Type.String({ description: "Content to write to PI_ADVISOR_NOTES.md" }),
});

export const advisorWriteTool: ToolDefinition<typeof advisorWriteSchema, undefined> = {
	name: "advisor_write",
	label: "advisor_write",
	description:
		"Write content to PI_ADVISOR_NOTES.md. Creates the file if it doesn't exist, overwrites if it does. This is the only file you can write to.",
	promptSnippet: "Write your findings and recommendations to PI_ADVISOR_NOTES.md",
	promptGuidelines: [
		"Use advisor_write to create or overwrite PI_ADVISOR_NOTES.md with your findings and recommendations",
	],
	parameters: advisorWriteSchema,

	async execute(_toolCallId, { content }, signal, _onUpdate, ctx) {
		const absolutePath = resolve(ctx.cwd, NOTES_FILENAME);
		const dir = dirname(absolutePath);

		return withFileMutationQueue(absolutePath, async () => {
			if (signal?.aborted) throw new Error("Operation aborted");

			await mkdir(dir, { recursive: true });
			if (signal?.aborted) throw new Error("Operation aborted");

			await writeFile(absolutePath, content, "utf-8");
			if (signal?.aborted) throw new Error("Operation aborted");

			return {
				content: [
					{ type: "text", text: `Successfully wrote ${content.length} bytes to ${NOTES_FILENAME}` },
				],
				details: undefined,
			};
		});
	},
};
