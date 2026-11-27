import { latestSessionFile, readSession } from "../session/log.js";
import { readRawOutput } from "../session/raw-output.js";
import { buildProvenance } from "../session/provenance.js";

export const factsCommand = {
    name: "facts",
    description: "Show facts/raw output/provenance: /facts show <seq> | /facts provenance",
    run({ args }: any) {
        const sub = (args[0] ?? "show").toLowerCase();
        if (sub === "provenance") {
            const file = latestSessionFile();
            if (!file)
                return { message: "No session facts yet." };
            return { message: JSON.stringify(buildProvenance(file), null, 2) };
        }
        if (sub !== "show")
            return { message: "Usage: /facts show <seq> | /facts provenance" };
        const seq = Number(args[1]);
        if (!Number.isInteger(seq) || seq < 1)
            return { message: "Usage: /facts show <seq>" };
        const file = latestSessionFile();
        if (!file)
            return { message: "No session facts yet." };
        const facts = readSession(file);
        const fact = facts.find((entry: any) => entry?.seq === seq);
        if (!fact)
            return { message: `No fact #${seq} in ${file}.` };
        const rawRef = fact?.collection?.rawRef;
        if (rawRef) {
            const raw = readRawOutput(file, String(rawRef));
            if (raw === undefined)
                return { message: `Fact #${seq} references missing raw output: ${rawRef}` };
            return {
                message: `Fact #${seq} (${fact.type}): ${raw}

[rawRef=${rawRef} outputChars=${fact.collection.outputChars ?? "?"}]`,
            };
        }
        return { message: `Fact #${seq} (${fact.type}):\n${JSON.stringify(fact, null, 2)}` };
    },
};
