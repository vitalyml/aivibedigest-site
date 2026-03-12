# aivibedigest-site

Статический сайт [AI Vibe Digest](https://www.aivibedigest.com) — ежедневный AI-дайджест в Telegram.

## Структура

| Путь | Назначение |
|------|-----------|
| `data/issues.js` | Данные всех выпусков |
| `scripts/build-site.js` | Генератор сайта (HTML, sitemap, robots.txt) |
| `scripts/upsert-issue.js` | Добавление/обновление выпуска |
| `scripts/notify-indexnow.js` | Уведомление поисковиков через IndexNow |

## Команды

```bash
npm run build             # Только сборка сайта
npm run notify-indexnow   # Ручной запуск уведомления IndexNow
npm test                  # Запуск тестов
```

## Добавление выпуска

```bash
node scripts/upsert-issue.js --input issue.json
# или
cat issue.json | node scripts/upsert-issue.js
```

Поле `telegramPostUrl` опционально — если передано, на странице дайджеста появится ссылка на пост в Telegram.

## Сборка

`npm run build` генерирует:

- `index.html` — главная с 3 последними выпусками
- `digest/index.html` — архив всех выпусков
- `digest/{slug}/index.html` — страница каждого выпуска
- `sitemap.xml` — карта сайта
- `robots.txt`
- `{key}.txt` — ключ IndexNow для верификации

Автоматический запуск `notify-indexnow` происходит после push в `main` через GitHub Actions: workflow ждёт,
пока публичный сайт начнёт отдавать актуальные `index.html`, `sitemap.xml` и файл ключа, и только потом
отправляет уведомление в IndexNow.

## SEO

- `<link rel="canonical">` на всех страницах
- Open Graph мета-теги (`og:title`, `og:description`, `og:url`, `og:type`, `og:locale`)
- Яндекс.Метрика (счётчик 107395453)
- IndexNow — мгновенное уведомление поисковиков о новых страницах
- Автоматическая генерация sitemap.xml
