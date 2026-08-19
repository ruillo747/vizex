# Vizex

Обмен небольшими файлами **экраном и камерой** — без Wi‑Fi и Bluetooth.

Отправитель крутит QR‑кадры на экране, получатель снимает их камерой и скачивает собранный файл.

## Запуск на GitHub Pages

### 1. Создайте репозиторий

1. Зайдите на [github.com/new](https://github.com/new)
2. Имя, например: `vizex`
3. Public → **Create repository** (без README, если будете пушить этот проект)

### 2. Залейте код

На компьютере, в папке проекта:

```bash
git init
git add .
git commit -m "Vizex: обмен файлами через QR"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/vizex.git
git push -u origin main
```

Если GitHub попросит вход — используйте Personal Access Token вместо пароля  
(Settings → Developer settings → Personal access tokens).

### 3. Включите Pages

1. Запушьте обновлённый код (`git add . && git commit && git push`)
2. Дождитесь зелёного workflow — он зальёт папку `dist` в ветку `gh-pages`
3. [Settings → Pages](https://github.com/ruillo747/vizex/settings/pages):
   - **Source:** Deploy from a **branch**
   - **Branch:** `gh-pages` / folder `/ (root)` → Save

Не выбирайте ветку `main` — там исходники, сайт будет белым.

Адрес: `https://ruillo747.github.io/vizex/`

### 4. Откройте на Android

- Chrome → этот URL на **обоих** телефонах  
- Получатель: разрешите камеру  
- Сайт лучше открывать по **HTTPS** (Pages как раз такой) — иначе камера может не заработать  

Добавить на домашний экран: меню Chrome → «На экран „Домой“».

## Локально

```bash
npm install
npm run dev
```

Сборка: `npm run build` (папка `dist` — статическая, её тоже можно залить в Pages вручную).
