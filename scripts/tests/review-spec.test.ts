import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const command = resolve("scripts/review-spec.ts");

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "spec-review-test-"));
  const git = (...args: string[]) => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-q");
  git("config", "user.name", "Review Test");
  git("config", "user.email", "review@example.test");
  writeFileSync(join(cwd, "spec.md"), "AC: display a greeting.\n");
  git("add", ".");
  git("commit", "-qm", "spec");
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(cwd, "greeting.txt"), "Hello\n");
  git("add", ".");
  git("commit", "-qm", "implement greeting");
  const bin = mkdtempSync(join(tmpdir(), "spec-review-bin-"));
  writeFileSync(
    join(bin, "codex"),
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const prompt = fs.readFileSync(0, 'utf8');
if (!prompt.includes('AC: display a greeting.') || !args.includes('read-only') || args.includes('--ephemeral')) process.exit(9);
if (process.env.REVIEW_MUTATE_SPEC) fs.appendFileSync(process.env.REVIEW_MUTATE_SPEC, ' New AC');
if (process.env.REVIEW_RESPONSE !== 'NO_OUTPUT') fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], process.env.REVIEW_RESPONSE);
if (process.env.REVIEW_STARTED) fs.writeFileSync(process.env.REVIEW_STARTED, 'ready');
if (process.env.REVIEW_RELEASE) while (!fs.existsSync(process.env.REVIEW_RELEASE)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
process.exit(Number(process.env.REVIEW_EXIT || 0));
`
  );
  chmodSync(join(bin, "codex"), 0o755);
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env node
if (process.env.ISSUE_FAIL) process.exit(1);
if (process.env.ISSUE_HEAD) require('node:fs').writeFileSync('.git/HEAD', process.env.ISSUE_HEAD);
require('node:fs').writeSync(1, JSON.stringify({ number: 42, title: 'Greeting', body: process.env.ISSUE_BODY || 'AC: display a greeting.', comments: [], labels: [] }));
`
  );
  chmodSync(join(bin, "gh"), 0o755);
  const review = (
    response: unknown,
    extra: string[] = [],
    exit = "0",
    env: Record<string, string> = {}
  ) =>
    spawnSync("bun", [command, "--base", base, "--spec", "spec.md", ...extra], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        REVIEW_RESPONSE:
          typeof response === "string" ? response : JSON.stringify(response),
        REVIEW_EXIT: exit,
        ...env,
      },
    });
  return {
    cwd,
    bin,
    git,
    base,
    review,
    cleanup: () => {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(bin, { recursive: true, force: true });
    },
  };
}

const clean = {
  standards: { complete: true, report: "No findings.", findings: [] },
  spec: { complete: true, report: "Greeting AC satisfied.", findings: [] },
};

test("a complete clean review approves only the captured commit", () => {
  const f = fixture();
  try {
    const result = f.review(clean);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.status, "passed");
    assert.equal(report.head, f.git("rev-parse", "HEAD"));
    assert.equal(
      JSON.parse(readFileSync(report.artifact, "utf8")).status,
      "passed"
    );
    assert.equal(f.review(clean, ["--status"]).status, 0);
  } finally {
    f.cleanup();
  }
});

test("a successful process without a new report cannot reuse an earlier approval", () => {
  const f = fixture();
  try {
    assert.equal(f.review(clean).status, 0);
    const result = f.review("NO_OUTPUT");
    assert.equal(result.status, 2, result.stdout);
    assert.equal(JSON.parse(result.stdout).status, "incomplete");
    assert.equal(f.review(clean, ["--status"]).status, 2);
  } finally {
    f.cleanup();
  }
});

test("blocking AC findings stop readiness while advisory findings do not", () => {
  const f = fixture();
  try {
    const finding = {
      blocking: true,
      summary: "Greeting absent",
      evidence: "greeting.txt:1 contains no greeting",
      reference: "spec.md:1: display a greeting",
    };
    const blocked = { ...clean, spec: { ...clean.spec, findings: [finding] } };
    const result = f.review(blocked);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "findings");
    assert.equal(f.review(clean, ["--status"]).status, 1);
    assert.equal(
      f.review({
        ...clean,
        standards: {
          ...clean.standards,
          findings: [{ ...finding, blocking: false }],
        },
      }).status,
      0
    );
  } finally {
    f.cleanup();
  }
});

test("unfinished axes, malformed output, and process errors never approve", () => {
  const f = fixture();
  try {
    for (const response of [
      { ...clean, spec: { ...clean.spec, complete: false } },
      "not json",
      {},
      { ...clean, standards: { complete: true, report: "", findings: [] } },
    ]) {
      const result = f.review(response);
      assert.equal(result.status, 2, result.stdout);
      assert.equal(JSON.parse(result.stdout).status, "incomplete");
    }
    assert.equal(f.review(clean, [], "7").status, 2);
  } finally {
    f.cleanup();
  }
});

test("a new commit invalidates approval", () => {
  const f = fixture();
  try {
    assert.equal(f.review(clean).status, 0);
    f.git("commit", "--allow-empty", "-qm", "new head");
    assert.equal(f.review(clean, ["--status"]).status, 2);
  } finally {
    f.cleanup();
  }
});

test("uncommitted and untracked changes prevent review and approval reuse", () => {
  const f = fixture();
  try {
    assert.equal(f.review(clean).status, 0);
    writeFileSync(join(f.cwd, "untracked.txt"), "unreviewed");
    assert.equal(f.review(clean).status, 2);
    assert.equal(f.review(clean, ["--status"]).status, 2);
    rmSync(join(f.cwd, "untracked.txt"));
    writeFileSync(join(f.cwd, "greeting.txt"), "changed");
    assert.equal(f.review(clean).status, 2);
  } finally {
    f.cleanup();
  }
});

test("empty diffs and missing specs or refs cannot approve", () => {
  const f = fixture();
  try {
    for (const args of [
      ["--base", "HEAD"],
      ["--base", "missing-ref"],
      ["--spec", "missing.md"],
    ]) {
      assert.equal(f.review(clean, args).status, 2);
    }
  } finally {
    f.cleanup();
  }
});

test("changed external spec content invalidates approval and changes during review are rejected", () => {
  const f = fixture();
  const specDirectory = mkdtempSync(join(tmpdir(), "review-spec-input-"));
  const spec = join(specDirectory, "acceptance.md");
  writeFileSync(spec, "AC: display a greeting.");
  try {
    assert.equal(f.review(clean, ["--spec", spec]).status, 0);
    writeFileSync(spec, "AC: display a greeting. Also show the date.");
    assert.equal(f.review(clean, ["--spec", spec, "--status"]).status, 2);
    const result = f.review(clean, ["--spec", spec], "0", {
      REVIEW_MUTATE_SPEC: spec,
    });
    assert.equal(result.status, 2, result.stdout);
    assert.equal(JSON.parse(result.stdout).status, "incomplete");
  } finally {
    f.cleanup();
    rmSync(specDirectory, { recursive: true, force: true });
  }
});

test("GitHub ticket AC is reviewed, and edits or fetch errors invalidate readiness", () => {
  const f = fixture();
  try {
    const result = f.review(clean, ["--ticket", "42"]);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.deepEqual(JSON.parse(result.stdout).sources, ["spec.md", "42"]);
    assert.equal(f.review(clean, ["--ticket", "42", "--status"]).status, 0);
    assert.equal(
      f.review(clean, ["--ticket", "42", "--status"], "0", {
        ISSUE_BODY: "New acceptance criteria",
      }).status,
      2
    );
    assert.equal(
      f.review(clean, ["--ticket", "42"], "0", { ISSUE_FAIL: "1" }).status,
      2
    );
  } finally {
    f.cleanup();
  }
});

test("readiness rejects HEAD changes while fetching ticket contents", () => {
  const f = fixture();
  try {
    assert.equal(f.review(clean, ["--ticket", "42"]).status, 0);
    const result = f.review(clean, ["--ticket", "42", "--status"], "0", {
      ISSUE_HEAD: f.base,
    });
    assert.equal(f.git("rev-parse", "HEAD"), f.base);
    assert.equal(result.status, 2, result.stdout);
  } finally {
    f.cleanup();
  }
});

test("concurrent reviews cannot replace the active review's blocking result", async () => {
  const f = fixture();
  const started = join(f.cwd, ".git", "started");
  const release = join(f.cwd, ".git", "release");
  const blocking = {
    ...clean,
    spec: {
      ...clean.spec,
      findings: [
        {
          blocking: true,
          summary: "Missing greeting",
          evidence: "greeting.txt:1",
          reference: "spec.md:1",
        },
      ],
    },
  };
  const child = spawn("bun", [command, "--base", f.base, "--spec", "spec.md"], {
    cwd: f.cwd,
    env: {
      ...process.env,
      PATH: `${f.bin}:${process.env.PATH}`,
      REVIEW_RESPONSE: JSON.stringify(blocking),
      REVIEW_STARTED: started,
      REVIEW_RELEASE: release,
    },
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data.toString();
  });
  const finished = new Promise<number | null>((resolve) => {
    child.on("close", resolve);
  });
  try {
    const deadline = Date.now() + 5000;
    while (!existsSync(started) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(existsSync(started), "first reviewer started");
    assert.equal(
      f.review(clean).status,
      2,
      "a duplicate review must not run concurrently"
    );
    assert.equal(
      f.review(clean, ["--status"]).status,
      2,
      "readiness waits for the active review"
    );
    writeFileSync(release, "continue");
    assert.equal(await finished, 1, output);
    assert.equal(JSON.parse(output).status, "findings");
  } finally {
    writeFileSync(release, "continue");
    await finished;
    f.cleanup();
  }
});
