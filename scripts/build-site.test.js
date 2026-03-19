const test = require("node:test");
const assert = require("node:assert/strict");
const issues = require("../data/issues");

const {
  getTelegramPostUrl,
  renderIssuePage,
  renderSectionBody,
  renderSitemap,
} = require("./build-site");

test("renderSectionBody splits paragraphs and preserves safe links", () => {
  const input = '<a href="https://t.me/test/1">Source</a> первая новость.\n\nВторая новость.';
  const result = renderSectionBody(input);

  assert.equal(result.match(/<p>/g)?.length ?? 0, 2);
  assert.match(
    result,
    /<p><a href="https:\/\/t\.me\/test\/1" target="_blank" rel="noopener noreferrer">Source<\/a> первая новость\.<\/p>/
  );
  assert.doesNotMatch(result, /&lt;a href=/);
  assert.match(result, /<p>Вторая новость\.<\/p>/);
});

test("renderIssuePage shows Telegram post link when issue contains one", () => {
  const issue = {
    date: "2026-03-10",
    slug: "test-issue",
    lede: ["Короткий лид."],
    summary: ["Короткое summary."],
    sections: [{ title: "Блок", body: "Текст блока." }],
    eyebrow: "Выпуск от 10 марта 2026",
    pageTitle: "Тестовый выпуск",
    metaTitle: "Тестовый выпуск",
    metaDescription: "Описание",
    telegramPostUrl: "https://t.me/test/123",
  };

  const result = renderIssuePage(issue, { prev: null, next: null, nearby: [] });

  assert.equal(getTelegramPostUrl(issue), "https://t.me/test/123");
  assert.match(
    result,
    /<a class="nav-link" href="https:\/\/t\.me\/test\/123" target="_blank" rel="noopener noreferrer">Открыть пост выпуска в Telegram<\/a>/
  );
});

test("renderSitemap uses lastmod when available", () => {
  const issueWithLastmod = issues.find((i) => i.lastmod);
  const result = renderSitemap();

  if (issueWithLastmod) {
    const escaped = issueWithLastmod.lastmod.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(result, new RegExp(`<lastmod>${escaped}</lastmod>`));
  }
});
