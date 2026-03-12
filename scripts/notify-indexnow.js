const { SITE_URL, INDEXNOW_KEY, sortedIssues, issueUrl } = require("./build-site");

const INDEXNOW_ENDPOINTS = [
  "https://yandex.com/indexnow",
  "https://www.bing.com/indexnow",
];

function getAllUrls() {
  return [
    `${SITE_URL}/`,
    `${SITE_URL}/digest/`,
    ...sortedIssues.map((issue) => `${SITE_URL}${issueUrl(issue)}`),
  ];
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
  const urls = getAllUrls();
  console.log(`Submitting ${urls.length} URLs to IndexNow...`);

  const results = await Promise.allSettled(
    INDEXNOW_ENDPOINTS.map((endpoint) => notify(endpoint, urls))
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { endpoint, status, ok } = result.value;
      console.log(`  ${ok ? "OK" : "FAIL"} ${endpoint} → ${status}`);
    } else {
      console.error(`  ERROR: ${result.reason.message}`);
    }
  }
}

main();
