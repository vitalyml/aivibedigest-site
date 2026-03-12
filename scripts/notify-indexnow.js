const fs = require("fs");
const path = require("path");
const { SITE_URL, INDEXNOW_KEY, sortedIssues, issueUrl } = require("./build-site");

const ROOT = path.resolve(__dirname, "..");

const INDEXNOW_ENDPOINTS = [
  "https://yandex.com/indexnow",
  "https://www.bing.com/indexnow",
];
const LIVE_SITE_TIMEOUT_MS = 10 * 60 * 1000;
const LIVE_SITE_POLL_INTERVAL_MS = 10 * 1000;
const LIVE_SITE_PROBES = [
  { file: "index.html", urlPath: "/index.html" },
  { file: "sitemap.xml", urlPath: "/sitemap.xml" },
  { file: `${INDEXNOW_KEY}.txt`, urlPath: `/${INDEXNOW_KEY}.txt` },
];

function getAllUrls() {
  return [
    `${SITE_URL}/`,
    `${SITE_URL}/digest/`,
    ...sortedIssues.map((issue) => `${SITE_URL}${issueUrl(issue)}`),
  ];
}

function shouldWaitForLiveSite() {
  return /^(1|true|yes)$/i.test(process.env.WAIT_FOR_LIVE_SITE ?? "");
}

function readPositiveIntegerEnv(name, fallback) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLiveSiteExpectations() {
  const probes = [...LIVE_SITE_PROBES];
  const latestIssue = sortedIssues[0];

  if (latestIssue) {
    probes.push({
      file: path.join("digest", latestIssue.slug, "index.html"),
      urlPath: issueUrl(latestIssue),
    });
  }

  return probes.map((probe) => ({
    ...probe,
    expected: fs.readFileSync(path.join(ROOT, probe.file), "utf8").trim(),
  }));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.text()).trim();
}

async function waitForLiveSite() {
  if (!shouldWaitForLiveSite()) {
    return;
  }

  const timeoutMs = readPositiveIntegerEnv("LIVE_SITE_TIMEOUT_MS", LIVE_SITE_TIMEOUT_MS);
  const pollIntervalMs = readPositiveIntegerEnv(
    "LIVE_SITE_POLL_INTERVAL_MS",
    LIVE_SITE_POLL_INTERVAL_MS
  );
  const expectations = getLiveSiteExpectations();
  const deadline = Date.now() + timeoutMs;

  console.log(`Waiting for ${SITE_URL} to serve the latest files...`);

  while (Date.now() <= deadline) {
    let allMatched = true;

    for (const probe of expectations) {
      const cacheBustedUrl = `${SITE_URL}${probe.urlPath}?ts=${Date.now()}`;

      try {
        const actual = await fetchText(cacheBustedUrl);

        if (actual !== probe.expected) {
          allMatched = false;
          console.log(`  WAIT ${probe.urlPath} is not updated yet`);
          break;
        }
      } catch (error) {
        allMatched = false;
        console.log(`  WAIT ${probe.urlPath} -> ${error.message}`);
        break;
      }
    }

    if (allMatched) {
      console.log("Public site is serving the latest files.");
      return;
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for ${SITE_URL} to serve the latest files.`);
}

async function notify(endpoint, urls) {
  const body = JSON.stringify({
    host: new URL(SITE_URL).host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body,
  });

  return { endpoint, status: response.status, ok: response.ok };
}

async function main() {
  await waitForLiveSite();

  const urls = getAllUrls();
  console.log(`Submitting ${urls.length} URLs to IndexNow...`);

  const results = await Promise.allSettled(
    INDEXNOW_ENDPOINTS.map((endpoint) => notify(endpoint, urls))
  );

  let hasSuccess = false;

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { endpoint, status, ok } = result.value;
      console.log(`  ${ok ? "OK" : "FAIL"} ${endpoint} → ${status}`);
      if (ok) hasSuccess = true;
    } else {
      console.error(`  ERROR: ${result.reason.message}`);
    }
  }

  if (!hasSuccess) {
    console.error("No endpoint accepted the submission.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
