const test = require("node:test");
const assert = require("node:assert/strict");

const { getTelegramPostUrl, renderIssuePage, renderSectionBody } = require("./build-site");

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

  const result = renderIssuePage(issue);

  assert.equal(getTelegramPostUrl(issue), "https://t.me/test/123");
  assert.match(
    result,
    /<a class="nav-link" href="https:\/\/t\.me\/test\/123" target="_blank" rel="noopener noreferrer">Открыть пост выпуска в Telegram<\/a>/
  );
});
