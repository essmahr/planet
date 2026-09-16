import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { COMMANDS } from "../cli/planet.ts";
import { parseFrontmatter } from "../cli/lib/frontmatter.ts";

const SKILLS_DIR = "skills";
const REQUIRED_SKILLS: string[] = ["go", "planet-proposal", "planet-intake", "planet-scoping", "planet-phasing", "planet-phase-plan", "planet-implement", "planet-retro", "planet-feedback-review"];
const HIDDEN = new Set(["planet-proposal", "planet-intake", "planet-scoping", "planet-phasing", "planet-phase-plan", "planet-implement", "planet-retro", "planet-feedback-review"]);
const WORD_BUDGET: Record<string, number> = { go: 1250, "planet-proposal": 420, "planet-intake": 1500, "planet-scoping": 1500, "planet-phasing": 1500, "planet-phase-plan": 1500, "planet-implement": 750, "planet-retro": 900, "planet-feedback-review": 900 };
const DESCRIPTION_CAP = 1536;

function skillDirs(): string[] {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

test("every required skill exists", () => {
  const present = new Set(skillDirs());
  for (const name of REQUIRED_SKILLS) assert.ok(present.has(name), `missing skills/${name}/SKILL.md`);
});

for (const name of skillDirs()) {
  test(`skills/${name}/SKILL.md follows the conventions`, () => {
    const file = join(SKILLS_DIR, name, "SKILL.md");
    const { data, body } = parseFrontmatter(readFileSync(file, "utf8"));
    assert.equal(data.name, name, "name matches the folder");
    const description = String(data.description ?? "");
    const whenToUse = String(data.when_to_use ?? "");
    assert.ok(description.length > 0, "description present");
    assert.ok(description.length + whenToUse.length <= DESCRIPTION_CAP, "description under the cap");
    assert.doesNotMatch(description + whenToUse, /[<>]/, "no angle brackets in description");
    assert.ok(typeof data.compatibility === "string" && data.compatibility.length > 0, "compatibility present");
    const metadata = data.metadata as Record<string, unknown> | undefined;
    assert.match(String(metadata?.version ?? ""), /^\d+\.\d+\.\d+$/, "metadata.version present");
    assert.match(String(data["allowed-tools"] ?? ""), /Bash\(planet \*\)/, "allowed-tools grants the planet cli");
    if (HIDDEN.has(name)) {
      assert.equal(data["user-invocable"], false, "hidden skill");
      assert.match(description, /^Only invoked by/, "negative trigger first");
    }
    if (name === "go") {
      assert.equal(data["disable-model-invocation"], true, "router is explicit-only");
      assert.match(body, /!`planet status --json`/, "status is injected at load");
      assert.match(body, /\$ARGUMENTS/, "request text is read from arguments");
    }
    assert.doesNotMatch(body, /\bScott\b/, "skill text never names the user");
    assert.doesNotMatch(body, /prior art/i, "sources replaced the prior-art line");
    const budget = WORD_BUDGET[name];
    if (budget !== undefined) assert.ok(words(body) <= budget, `body has ${words(body)} words, budget ${budget}`);
    for (const heading of ["## Critical rules", "## Steps", "## Troubleshooting"]) {
      assert.ok(body.includes(heading), `${heading} section present`);
    }
    for (const [, verb] of body.matchAll(/planet ([a-z-]+)/g)) {
      assert.ok(verb in COMMANDS, `'planet ${verb}' names a real command`);
    }
    for (const [, refFile] of body.matchAll(/references\/([a-z0-9-]+\.md)/g)) {
      assert.ok(existsSync(join(SKILLS_DIR, name, "references", refFile)), `references/${refFile} exists`);
    }
  });
}
