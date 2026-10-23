import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const editCommand = {
    name: "edit",
    description: "Edit the prompt in $EDITOR (works around Ink IME issues on Termux)",
    run({ state, actions }) {
        const file = join(tmpdir(), `fastcode-edit-${Date.now()}.md`);
        writeFileSync(file, state.draft ?? "", "utf8");
        const editor = process.env["EDITOR"] || process.env["VISUAL"] || "nano";
        const wasRaw = Boolean(process.stdin.isTTY && process.stdin.isRaw);
        try {
            if (wasRaw)
                process.stdin.setRawMode(false);
            const result = spawnSync(editor, [file], { stdio: "inherit" });
            if (result.error)
                return { message: `Could not launch ${editor}: ${result.error.message}` };
            const text = readFileSync(file, "utf8").trim();
            if (!text)
                return { message: "Editor closed with no text." };
            actions.setInput(text);
            return { message: "Draft loaded into the prompt; press Enter to send." };
        }
        finally {
            if (wasRaw)
                process.stdin.setRawMode(true);
            try {
                unlinkSync(file);
            }
            catch {
                // temp file may already be gone
            }
        }
    },
};
