const fs = require("fs");
const path = require("path");
const issues = require("../data/issues");

const ROOT = path.resolve(__dirname, "..");
const SITE_URL = "https://www.aivibedigest.com";
const TELEGRAM_URL = "https://t.me/+hEB8EhqtRfoyYjZi";
const ALLOWED_INLINE_TAGS = new Set(["a", "b", "strong", "i", "em", "code", "br"]);
const ISO_8601_WITH_OFFSET_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;

const sortedIssues = [...issues].sort((a, b) => b.date.localeCompare(a.date));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function writeFile(relativePath, content) {
  const targetPath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
}

function issueUrl(issue) {
  return `/digest/${issue.slug}/`;
}

function getIssueLastmod(issue) {
  return issue.lastmod ?? issue.date;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function extractHref(attributesSource) {
  const attributePattern = /([a-zA-Z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;

  while ((match = attributePattern.exec(attributesSource)) !== null) {
    if (match[1].toLowerCase() !== "href") {
      continue;
    }

    return match[3] ?? match[4] ?? match[5] ?? "";
  }

  return null;
}

function sanitizeAnchorHref(href) {
  if (typeof href !== "string") {
    return null;
  }

  const normalizedHref = href.trim();

  if (!normalizedHref) {
    return null;
  }

  try {
    const url = new URL(normalizedHref);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeInlineHtml(value) {
  const source = String(value);
  const tagPattern = /<\/?([a-zA-Z][\w:-]*)([^>]*)>/g;
  const openTags = [];
  let result = "";
  let cursor = 0;
  let match;

  while ((match = tagPattern.exec(source)) !== null) {
    const [rawTag, rawName, rawAttributes] = match;
    const tagName = rawName.toLowerCase();
    const isClosingTag = rawTag.startsWith("</");

    result += escapeHtml(source.slice(cursor, match.index));

    if (!ALLOWED_INLINE_TAGS.has(tagName)) {
      result += escapeHtml(rawTag);
      cursor = tagPattern.lastIndex;
      continue;
    }

    if (tagName === "br") {
      result += isClosingTag ? escapeHtml(rawTag) : "<br>";
      cursor = tagPattern.lastIndex;
      continue;
    }

    if (tagName === "a") {
      if (isClosingTag) {
        const lastAnchorIndex = openTags.lastIndexOf("a");

        if (lastAnchorIndex === -1) {
          result += escapeHtml(rawTag);
        } else {
          openTags.splice(lastAnchorIndex, 1);
          result += "</a>";
        }

        cursor = tagPattern.lastIndex;
        continue;
      }

      const safeHref = sanitizeAnchorHref(extractHref(rawAttributes));
      if (safeHref) {
        openTags.push("a");
        result += `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">`;
      } else {
        result += escapeHtml(rawTag);
      }

      cursor = tagPattern.lastIndex;
      continue;
    }

    if (isClosingTag) {
      const lastTagIndex = openTags.lastIndexOf(tagName);

      if (lastTagIndex === -1) {
        result += escapeHtml(rawTag);
      } else {
        openTags.splice(lastTagIndex, 1);
        result += `</${tagName}>`;
      }
    } else {
      openTags.push(tagName);
      result += `<${tagName}>`;
    }

    cursor = tagPattern.lastIndex;
  }

  result += escapeHtml(source.slice(cursor));
  return result;
}

function renderSectionBody(body) {
  const paragraphs = String(body)
    .split(/\r?\n\s*\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs
    .map((paragraph) => `            <p>${sanitizeInlineHtml(paragraph)}</p>`)
    .join("\n");
}

function getTelegramPostUrl(issue) {
  const candidate =
    issue.telegramPostUrl ??
    issue.telegramUrl ??
    issue.postUrl ??
    issue.telegramPostLink ??
    null;

  return sanitizeAnchorHref(candidate);
}

function renderHomePage() {
  const latestMarkup = sortedIssues
    .slice(0, 3)
    .map(
      (issue) => `          <div class="issue-card">
            <a class="issue-link" href="${issueUrl(issue)}">
              <strong>${escapeHtml(issue.latestTitle)}</strong>
            </a>
            <ul class="preview">${issue.summary.slice(0, 3).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
          </div>`
    )
    .join("\n\n");

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Vibe Digest — ежедневный AI-дайджест в Telegram</title>
  <meta name="description" content="AI Vibe Digest — ежедневный AI-дайджест в Telegram: модели, релизы, исследования и инструменты. Коротко и по делу." />
  <link rel="canonical" href="${SITE_URL}/" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ru_RU" />
  <meta property="og:site_name" content="AI Vibe Digest" />
  <meta property="og:title" content="AI Vibe Digest — ежедневный AI-дайджест в Telegram" />
  <meta property="og:description" content="AI Vibe Digest — ежедневный AI-дайджест в Telegram: модели, релизы, исследования и инструменты. Коротко и по делу." />
  <meta property="og:url" content="${SITE_URL}/" />
  <meta name="theme-color" content="#0b1020" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon/favicon-16x16.png">
  <link rel="icon" href="/assets/favicon/favicon.ico" type="image/x-icon">
  <link rel="manifest" href="/assets/favicon/site.webmanifest">
  <style>
    :root {
      --bg: #07111f;
      --bg2: #0b1324;
      --card: rgba(255,255,255,0.06);
      --border: rgba(255,255,255,0.12);
      --text: #eef3ff;
      --muted: #b4c1d9;
      --accent: #61a8ff;
      --accent2: #7d5cff;
      --shadow: 0 24px 80px rgba(0,0,0,.34);
      --radius: 26px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(125,92,255,.18), transparent 30%),
        radial-gradient(circle at top right, rgba(97,168,255,.16), transparent 28%),
        linear-gradient(180deg, var(--bg) 0%, var(--bg2) 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .shell {
      width: min(100%, 920px);
    }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 42px;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }

    .card::before {
      content: "";
      position: absolute;
      inset: -80px auto auto -80px;
      width: 220px;
      height: 220px;
      background: radial-gradient(circle, rgba(125,92,255,.24), transparent 70%);
      pointer-events: none;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 22px;
      font-weight: 700;
      letter-spacing: -.02em;
    }

    .mark {
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      box-shadow: 0 12px 28px rgba(97,168,255,.28);
      color: white;
      font-size: 15px;
      font-weight: 800;
    }

    h1 {
      margin: 0;
      font-size: clamp(42px, 8vw, 72px);
      line-height: .96;
      letter-spacing: -.05em;
      max-width: 9ch;
    }

    .lead {
      margin: 18px 0 0;
      max-width: 42ch;
      color: var(--muted);
      font-size: clamp(17px, 2.2vw, 20px);
      line-height: 1.55;
    }

    .sub {
      margin: 22px 0 0;
      color: #d8e3fa;
      font-size: 15px;
      max-width: 56ch;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 52px;
      padding: 0 20px;
      border-radius: 14px;
      font-weight: 700;
      text-decoration: none;
      transition: transform .18s ease, box-shadow .18s ease;
    }

    .btn:hover {
      transform: translateY(-1px);
    }

    .btn-primary {
      color: white;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      box-shadow: 0 14px 34px rgba(97,168,255,.24);
    }

    .btn-secondary {
      color: var(--text);
      background: rgba(255,255,255,.04);
      border: 1px solid var(--border);
    }

    .latest {
      margin-top: 34px;
      padding-top: 28px;
      border-top: 1px solid rgba(255,255,255,.08);
    }

    .latest-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }

    .latest-head h2 {
      margin: 0;
      font-size: 24px;
      letter-spacing: -.03em;
    }

    .latest-head a {
      color: #dbe7ff;
      font-weight: 600;
      text-decoration: none;
    }

    .latest-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .issue-card {
      padding: 18px;
      border-radius: 18px;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.08);
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }

    .issue-card:hover {
      transform: translateY(-1px);
      border-color: rgba(97,168,255,.4);
      background: rgba(255,255,255,.06);
    }

    .issue-link {
      display: block;
      color: inherit;
      text-decoration: none;
    }

    .issue-link strong {
      display: block;
      font-size: 16px;
      line-height: 1.25;
      letter-spacing: -.02em;
    }

    .preview {
      margin: 6px 0 0;
      padding-left: 18px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .preview li + li { margin-top: 3px; }

    @media (max-width: 760px) {
      .card { padding: 26px; border-radius: 22px; }
      .latest-head {
        display: block;
      }
      .latest-head a {
        display: inline-block;
        margin-top: 10px;
      }
      .latest-list { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="card">
      <div class="brand">
        <span class="mark">AI</span>
        <span>AI Vibe Digest</span>
      </div>

      <h1>AI-дайджест</h1>

      <p class="lead">
        Ежедневный AI-дайджест в Telegram: модели, релизы, исследования и инструменты — коротко и по делу.
      </p>

      <p class="sub">
        AI Vibe Digest помогает быстро понять, что произошло в мире AI за день, без ручного чтения десятков источников.
      </p>

      <div class="actions">
        <a class="btn btn-primary" href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer">Открыть Telegram-паблик</a>
        <a class="btn btn-secondary" href="/digest/">Перейти в архив</a>
      </div>

      <section class="latest" aria-labelledby="latest-digests">
        <div class="latest-head">
          <h2 id="latest-digests">Последние выпуски</h2>
          <a href="/digest/">Смотреть весь архив</a>
        </div>

        <div class="latest-list">
${latestMarkup}
        </div>
      </section>
    </section>
  </main>
  <!-- Yandex.Metrika counter -->
  <script type="text/javascript">
    (function(m,e,t,r,i,k,a){
      m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
      m[i].l=1*new Date();
      for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
      k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=107395453', 'ym');
    ym(107395453, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
  </script>
  <noscript><div><img src="https://mc.yandex.ru/watch/107395453" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
  <!-- /Yandex.Metrika counter -->
</body>
</html>
`;
}

function renderArchivePage() {
  const archiveItemsMarkup = sortedIssues
    .map(
      (issue) => `        <article class="archive-item">
          <time datetime="${issue.date}">${escapeHtml(formatHumanDate(issue.date))}</time>
          <a href="${issueUrl(issue)}">${escapeHtml(issue.archiveTitle)}</a>
          <ul class="preview">${issue.summary.slice(0, 3).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
        </article>`
    )
    .join("\n\n");

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Архив AI Vibe Digest — ежедневные AI-дайджесты</title>
  <meta name="description" content="Архив AI Vibe Digest: ежедневные AI-дайджесты про модели, исследования, релизы и инструменты с переходом на каждый выпуск." />
  <link rel="canonical" href="${SITE_URL}/digest/" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ru_RU" />
  <meta property="og:site_name" content="AI Vibe Digest" />
  <meta property="og:title" content="Архив AI Vibe Digest — ежедневные AI-дайджесты" />
  <meta property="og:description" content="Архив AI Vibe Digest: ежедневные AI-дайджесты про модели, исследования, релизы и инструменты с переходом на каждый выпуск." />
  <meta property="og:url" content="${SITE_URL}/digest/" />
  <meta name="theme-color" content="#0b1020" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon/favicon-16x16.png">
  <link rel="icon" href="/assets/favicon/favicon.ico" type="image/x-icon">
  <link rel="manifest" href="/assets/favicon/site.webmanifest">
  <style>
    :root {
      --bg: #07111f;
      --bg2: #0b1324;
      --panel: rgba(255,255,255,0.06);
      --panel-strong: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.12);
      --text: #eef3ff;
      --muted: #b4c1d9;
      --accent: #61a8ff;
      --accent2: #7d5cff;
      --shadow: 0 24px 80px rgba(0,0,0,.32);
      --radius: 26px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(125,92,255,.18), transparent 30%),
        radial-gradient(circle at top right, rgba(97,168,255,.16), transparent 28%),
        linear-gradient(180deg, var(--bg) 0%, var(--bg2) 100%);
      padding: 32px 20px 60px;
    }

    .shell {
      width: min(100%, 1040px);
      margin: 0 auto;
    }

    .frame {
      background: rgba(10, 18, 34, 0.82);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 34px;
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 28px;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      letter-spacing: -.02em;
    }

    .mark {
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      box-shadow: 0 12px 28px rgba(97,168,255,.28);
      color: white;
      font-size: 15px;
      font-weight: 800;
    }

    .top-links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .top-links a {
      color: var(--text);
      text-decoration: none;
      padding: 12px 16px;
      border-radius: 14px;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.08);
      font-weight: 600;
    }

    h1 {
      margin: 0;
      font-size: clamp(36px, 6vw, 58px);
      line-height: 1;
      letter-spacing: -.05em;
      max-width: 12ch;
    }

    .intro {
      margin-top: 18px;
      max-width: 68ch;
      color: var(--muted);
      font-size: 18px;
      line-height: 1.65;
    }

    .archive-list {
      margin-top: 30px;
      display: grid;
      gap: 14px;
    }

    .archive-item {
      display: grid;
      gap: 10px;
      padding: 22px;
      border-radius: 20px;
      background: var(--panel-strong);
      border: 1px solid rgba(255,255,255,.08);
    }

    .archive-item time {
      color: #c8d7f5;
      font-size: 13px;
      letter-spacing: .02em;
      text-transform: uppercase;
    }

    .archive-item a {
      color: var(--text);
      font-size: 20px;
      line-height: 1.2;
      letter-spacing: -.03em;
      text-decoration: none;
      font-weight: 700;
    }

    .archive-item .preview {
      margin: 6px 0 0;
      padding-left: 18px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
      max-width: 62ch;
    }
    .archive-item .preview li + li { margin-top: 3px; }

    @media (max-width: 760px) {
      .frame { padding: 24px; }
      .topbar { display: block; }
      .top-links { margin-top: 16px; }
      .archive-item a { font-size: 18px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="frame">
      <div class="topbar">
        <div class="brand">
          <span class="mark">AI</span>
          <span>AI Vibe Digest</span>
        </div>

        <nav class="top-links" aria-label="Основная навигация">
          <a href="/">Главная</a>
          <a href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer">Telegram</a>
        </nav>
      </div>

      <h1>Архив AI Vibe Digest</h1>

      <div class="intro">
        <p>Здесь собраны ежедневные AI-дайджесты AI Vibe Digest: модели, релизы, исследования, инструменты и заметные движения рынка.</p>
        <p>Архив помогает быстро перейти к нужному выпуску, посмотреть главные темы дня и читать отдельные страницы по внутренним ссылкам.</p>
      </div>

      <section class="archive-list" aria-label="Список выпусков">
${archiveItemsMarkup}
      </section>
    </section>
  </main>
  <!-- Yandex.Metrika counter -->
  <script type="text/javascript">
    (function(m,e,t,r,i,k,a){
      m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
      m[i].l=1*new Date();
      for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
      k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=107395453', 'ym');
    ym(107395453, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
  </script>
  <noscript><div><img src="https://mc.yandex.ru/watch/107395453" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
  <!-- /Yandex.Metrika counter -->
</body>
</html>
`;
}

function renderIssuePage(issue) {
  const telegramPostUrl = getTelegramPostUrl(issue);
  const summaryMarkup = issue.summary
    .map((item) => `          <li>${escapeHtml(item)}</li>`)
    .join("\n");
  const blocksMarkup = issue.sections
    .map(
      (section) => `          <section class="block">
            <h3>${escapeHtml(section.title)}</h3>
${renderSectionBody(section.body)}
          </section>`
    )
    .join("\n\n");

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(issue.metaTitle)}</title>
  <meta name="description" content="${escapeHtml(issue.metaDescription)}" />
  <link rel="canonical" href="${SITE_URL}${issueUrl(issue)}" />
  <meta property="og:type" content="article" />
  <meta property="og:locale" content="ru_RU" />
  <meta property="og:site_name" content="AI Vibe Digest" />
  <meta property="og:title" content="${escapeHtml(issue.metaTitle)}" />
  <meta property="og:description" content="${escapeHtml(issue.metaDescription)}" />
  <meta property="og:url" content="${SITE_URL}${issueUrl(issue)}" />
  <meta name="theme-color" content="#0b1020" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon/favicon-16x16.png">
  <link rel="icon" href="/assets/favicon/favicon.ico" type="image/x-icon">
  <link rel="manifest" href="/assets/favicon/site.webmanifest">
  <style>
    :root {
      --bg: #07111f;
      --bg2: #0b1324;
      --panel: rgba(255,255,255,0.06);
      --panel-strong: rgba(255,255,255,0.08);
      --border: rgba(255,255,255,0.12);
      --text: #eef3ff;
      --muted: #b4c1d9;
      --accent: #61a8ff;
      --accent2: #7d5cff;
      --shadow: 0 24px 80px rgba(0,0,0,.32);
      --radius: 26px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(125,92,255,.18), transparent 30%),
        radial-gradient(circle at top right, rgba(97,168,255,.16), transparent 28%),
        linear-gradient(180deg, var(--bg) 0%, var(--bg2) 100%);
      padding: 32px 20px 60px;
    }

    .shell {
      width: min(100%, 980px);
      margin: 0 auto;
    }

    .frame {
      background: rgba(10, 18, 34, 0.82);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 34px;
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 28px;
    }

    .topbar nav {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .topbar a,
    .cta a,
    .footer-nav a {
      color: var(--text);
      text-decoration: none;
    }

    .nav-link,
    .cta a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 0 16px;
      border-radius: 14px;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.08);
      font-weight: 600;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      letter-spacing: -.02em;
    }

    .mark {
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      box-shadow: 0 12px 28px rgba(97,168,255,.28);
      color: white;
      font-size: 15px;
      font-weight: 800;
    }

    h1 {
      margin: 0;
      font-size: clamp(34px, 5.6vw, 56px);
      line-height: 1;
      letter-spacing: -.05em;
      max-width: 14ch;
    }

    .tg-top {
      display: inline-block;
      margin-top: 18px;
      color: #8bb8ff;
      font-size: 15px;
      text-decoration: none;
    }
    .tg-top:hover { text-decoration: underline; }

    section {
      margin-top: 34px;
    }

    h2 {
      margin: 0 0 14px;
      font-size: 26px;
      line-height: 1.15;
      letter-spacing: -.03em;
    }

    .summary {
      margin: 0;
      padding-left: 20px;
      color: #dbe6fb;
      line-height: 1.8;
    }

    .blocks {
      display: grid;
      gap: 14px;
    }

    .block {
      padding: 22px;
      border-radius: 20px;
      background: var(--panel-strong);
      border: 1px solid rgba(255,255,255,.08);
    }

    .block h3 {
      margin: 0 0 10px;
      font-size: 20px;
      letter-spacing: -.02em;
    }

    .block p {
      margin: 0;
      color: var(--muted);
      line-height: 1.7;
    }

    .block p a,
    .block p a:visited {
      color: #9fd0ff;
      font-weight: 600;
      text-decoration-color: rgba(159,208,255,.7);
      text-underline-offset: 0.12em;
      text-decoration-thickness: 0.08em;
    }

    .block p a:hover,
    .block p a:focus-visible {
      color: #dff1ff;
      text-decoration-color: currentColor;
    }

    .block p + p {
      margin-top: 16px;
    }

    .cta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }

    .cta .primary {
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      border: none;
      box-shadow: 0 14px 34px rgba(97,168,255,.24);
      color: white;
    }

    .footer-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      padding-top: 26px;
      border-top: 1px solid rgba(255,255,255,.08);
    }

    @media (max-width: 760px) {
      .frame {
        padding: 24px;
        background: rgba(10, 18, 34, 0.94);
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
      }
      .topbar { display: block; }
      .topbar nav { margin-top: 16px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <article class="frame">
      <div class="topbar">
        <div class="brand">
          <span class="mark">AI</span>
          <span>AI Vibe Digest</span>
        </div>

        <nav aria-label="Навигация выпуска">
          <a class="nav-link" href="/">Главная</a>
          <a class="nav-link" href="/digest/">Архив</a>
          <a class="nav-link" href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer">Telegram</a>
        </nav>
      </div>

      <h1>${escapeHtml(formatHumanDate(issue.date))}</h1>
      ${telegramPostUrl ? `<a class="tg-top" href="${escapeHtml(telegramPostUrl)}" target="_blank" rel="noopener noreferrer">Открыть пост выпуска в Telegram</a>` : ""}

      <section aria-labelledby="summary-title">
        <h2 id="summary-title">Кратко главное</h2>
        <ul class="summary">
${summaryMarkup}
        </ul>
      </section>

      <section aria-labelledby="details-title">
        <h2 id="details-title">Подробности по блокам</h2>
        <div class="blocks">
${blocksMarkup}
        </div>
      </section>

      <section aria-labelledby="cta-title">
        <h2 id="cta-title">Продолжение</h2>
        <div class="cta">
          ${telegramPostUrl ? `<a class="nav-link" href="${escapeHtml(telegramPostUrl)}" target="_blank" rel="noopener noreferrer">Открыть пост выпуска в Telegram</a>` : ""}
          <a class="primary" href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer">Читать новые выпуски в Telegram</a>
          <a href="/digest/">Перейти в архив AI Vibe Digest</a>
        </div>
      </section>

      <nav class="footer-nav" aria-label="Нижняя навигация">
        <a href="/">На главную</a>
        <a href="/digest/">К архиву</a>
        <a href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer">В Telegram</a>
      </nav>
    </article>
  </main>
  <!-- Yandex.Metrika counter -->
  <script type="text/javascript">
    (function(m,e,t,r,i,k,a){
      m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
      m[i].l=1*new Date();
      for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
      k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=107395453', 'ym');
    ym(107395453, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
  </script>
  <noscript><div><img src="https://mc.yandex.ru/watch/107395453" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
  <!-- /Yandex.Metrika counter -->
</body>
</html>
`;
}

function renderSitemap() {
  const latestIssueLastmod = sortedIssues[0] ? getIssueLastmod(sortedIssues[0]) : null;
  const pages = [
    { url: `${SITE_URL}/`, lastmod: latestIssueLastmod },
    { url: `${SITE_URL}/digest/`, lastmod: latestIssueLastmod },
    ...sortedIssues.map((issue) => ({
      url: `${SITE_URL}${issueUrl(issue)}`,
      lastmod: getIssueLastmod(issue),
    })),
  ];

  const body = pages
    .map(
      ({ url, lastmod }) => `  <url>
    <loc>${escapeXml(url)}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ""}
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function renderRobotsTxt() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

function formatHumanDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const monthNames = [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ];

  return `${day} ${monthNames[month - 1]} ${year}`;
}

function validateIssues() {
  const seen = new Set();

  for (const issue of sortedIssues) {
    if (seen.has(issue.slug)) {
      throw new Error(`Duplicate slug: ${issue.slug}`);
    }

    if (
      issue.lastmod &&
      (!ISO_8601_WITH_OFFSET_PATTERN.test(issue.lastmod) ||
        issue.lastmod.slice(0, 10) !== issue.date)
    ) {
      throw new Error(`Invalid lastmod for ${issue.slug}: ${issue.lastmod}`);
    }

    seen.add(issue.slug);
  }
}

function build() {
  validateIssues();
  writeFile("index.html", renderHomePage());
  writeFile("digest/index.html", renderArchivePage());
  writeFile("sitemap.xml", renderSitemap());
  writeFile("robots.txt", renderRobotsTxt());

  for (const issue of sortedIssues) {
    writeFile(path.join("digest", issue.slug, "index.html"), renderIssuePage(issue));
  }
}

if (require.main === module) {
  build();
}

module.exports = {
  build,
  getTelegramPostUrl,
  renderIssuePage,
  renderSitemap,
  renderSectionBody,
  sanitizeInlineHtml,
};
