#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ISSUES_PATH = path.join(ROOT, "data", "issues.js");
const INDENT = "  ";
const WRAP_COLUMN = 100;

function printUsage() {
  console.log(`Usage:
  node scripts/upsert-issue.js --input /path/to/issue.json
  cat issue.json | node scripts/upsert-issue.js

Options:
  -i, --input   Path to a JSON file with a single issue object
  -h, --help    Show this help
`);
}

function parseArgs(argv) {
  let inputPath;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    if (arg === "--input" || arg === "-i") {
      inputPath = argv[index + 1];
      index += 1;

      if (!inputPath) {
        throw new Error("Missing value for --input");
      }

      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { help: false, inputPath };
}

function readIssuesModule(filePath) {
  delete require.cache[filePath];

  const issues = require(filePath);

  if (!Array.isArray(issues)) {
    throw new Error("data/issues.js must export an array");
  }

  return cloneValue(issues);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => {
      resolve(input);
    });
    process.stdin.on("error", reject);
  });
}

async function readInputJson(inputPath) {
  if (inputPath === "-") {
    return readStdin();
  }

  if (inputPath) {
    return fs.readFileSync(path.resolve(process.cwd(), inputPath), "utf8");
  }

  if (process.stdin.isTTY) {
    throw new Error("Provide --input <file> or pipe JSON via stdin");
  }

  return readStdin();
}

function parseIssueJson(rawInput) {
  let issue;

  try {
    issue = JSON.parse(rawInput);
  } catch (error) {
    throw new Error(`Invalid JSON input: ${error.message}`);
  }

  if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
    throw new Error("Input JSON must be a single issue object");
  }

  if (typeof issue.slug !== "string" || issue.slug.trim() === "") {
    throw new Error('Input issue must contain a non-empty string field "slug"');
  }

  return issue;
}

function validateUniqueSlugs(issues) {
  const seen = new Set();

  for (const issue of issues) {
    if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
      throw new Error("Each exported item in data/issues.js must be an object");
    }

    if (typeof issue.slug !== "string" || issue.slug.trim() === "") {
      throw new Error("Each issue in data/issues.js must contain a non-empty slug");
    }

    if (seen.has(issue.slug)) {
      throw new Error(`Duplicate slug in data/issues.js: ${issue.slug}`);
    }

    seen.add(issue.slug);
  }
}

function upsertIssue(issues, nextIssue) {
  const existingIndex = issues.findIndex((issue) => issue.slug === nextIssue.slug);

  if (existingIndex === -1) {
    return {
      status: "inserted",
      issues: [...issues, nextIssue],
    };
  }

  const updatedIssue = {
    ...issues[existingIndex],
    ...nextIssue,
  };

  return {
    status: "updated",
    issues: issues.map((issue, index) => (index === existingIndex ? updatedIssue : issue)),
  };
}

function sortIssues(issues) {
  return [...issues].sort((left, right) => {
    const dateCompare = String(right.date || "").localeCompare(String(left.date || ""));

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return String(right.slug).localeCompare(String(left.slug));
  });
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, cloneValue(entryValue)]));
  }

  return value;
}

function formatKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function serializeValue(value, indentLevel = 0) {
  const currentIndent = INDENT.repeat(indentLevel);
  const nextIndent = INDENT.repeat(indentLevel + 1);

  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    const items = value.map((item) => `${nextIndent}${serializeValue(item, indentLevel + 1)},`);
    return `[\n${items.join("\n")}\n${currentIndent}]`;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return "{}";
    }

    const properties = entries.map(([key, entryValue]) => {
      const serializedValue = serializeValue(entryValue, indentLevel + 1);
      const propertyPrefix = `${nextIndent}${formatKey(key)}: `;
      const shouldWrapPrimitive =
        !Array.isArray(entryValue) &&
        !isPlainObject(entryValue) &&
        propertyPrefix.length + serializedValue.length > WRAP_COLUMN;

      if (shouldWrapPrimitive) {
        return `${nextIndent}${formatKey(key)}:\n${nextIndent}${INDENT}${serializedValue},`;
      }

      return `${propertyPrefix}${serializedValue},`;
    });

    return `{\n${properties.join("\n")}\n${currentIndent}}`;
  }

  throw new Error(`Unsupported value type in issue data: ${typeof value}`);
}

function renderIssuesModule(issues) {
  return `module.exports = ${serializeValue(issues)};\n`;
}

function writeFileAtomically(targetPath, content) {
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, content, "utf8");
  fs.renameSync(temporaryPath, targetPath);
}

async function main() {
  const { help, inputPath } = parseArgs(process.argv.slice(2));

  if (help) {
    printUsage();
    return;
  }

  const rawInput = await readInputJson(inputPath);
  const incomingIssue = parseIssueJson(rawInput);
  const existingIssues = readIssuesModule(ISSUES_PATH);

  validateUniqueSlugs(existingIssues);

  const { status, issues } = upsertIssue(existingIssues, incomingIssue);
  const sortedIssues = sortIssues(issues);

  validateUniqueSlugs(sortedIssues);

  writeFileAtomically(ISSUES_PATH, renderIssuesModule(sortedIssues));

  execFileSync(process.execPath, [path.join(__dirname, "build-site.js")], {
    cwd: ROOT,
    stdio: "inherit",
  });

  console.log(
    JSON.stringify(
      {
        status,
        slug: incomingIssue.slug,
        totalIssues: sortedIssues.length,
        file: path.relative(ROOT, ISSUES_PATH),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
