# CineScope

Персональная платформа для поиска фильмов и сериалов с каталогом, личной библиотекой, историей просмотров и подбором по настроению. Поддерживает веб-версию, **Windows 10/11 (x64)** и **macOS (Apple Silicon)**.

---

## Веб-версия (локальный запуск)

**Требования:** Node.js (>= 20)

1. Установите зависимости:
   ```bash
   npm install
   ```
2. При желании укажите API-ключи в `.env` (или введите их прямо в интерфейсе приложения / используйте демо-режим).
3. Запустите приложение:
   ```bash
   npm run dev
   ```
4. Откройте в браузере: [http://localhost:3000](http://localhost:3000)

---

## Сборка для Windows (x64)

### Требования на ПК с Windows 10 / 11
1. **Node.js 20+**
2. **Rust (MSVC toolchain)**: установите через [rustup.rs](https://rustup.rs/) (`x86_64-pc-windows-msvc`)
3. **Microsoft C++ Build Tools**: Visual Studio Build Tools с компонентом *«Разработка классических приложений на C++»* (*Desktop development with C++*)
4. **WebView2 Runtime** (уже встроен в Windows 11 и актуальную Windows 10)

### Локальная сборка установщика `.exe` и портативной версии `.zip`
```powershell
npm install

# 1. Собрать установщик NSIS (CineScope_1.0.0_x64-setup.exe)
npm run tauri:build:win

# 2. Упаковать портативный архив (CineScope_1.0.0_x64-portable.zip)
npm run tauri:build:win:portable
```

Готовые файлы появятся в каталогах:
- Установщик: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`
- Портативная версия: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/portable/`

Для отладки десктопного окна в режиме разработки:
```powershell
npm run tauri:dev
```

### Особенности Windows-версии
- **Встроенный 4K-плеер (WebView2)** выбран по умолчанию — открывает видео прямо внутри CineScope с аппаратным ускорением без сторонних браузеров.
- В настройках приложения также можно переключиться на изолированные чистые окна **Google Chrome**, **Microsoft Edge** или **Mozilla Firefox**.
- Установщик NSIS ставит приложение в профиль текущего пользователя (без запроса прав администратора), поддерживает русский и английский интерфейсы и при необходимости сам доустанавливает WebView2.

---

## Сборка для macOS (Apple Silicon)

```bash
npm install
npm run tauri:build:mac
```

---

## Единый релиз Windows + macOS (GitHub Actions)

Workflow **Release Desktop (Windows & macOS)** автоматически собирает установщик `.exe`, портативный архив `.zip` для Windows и `.dmg` для macOS и публикует их в один GitHub Release:

- **По тегу**: отправьте тег вида `v1.0.0` (`git tag v1.0.0 && git push origin v1.0.0`) — соберутся обе платформы.
- **Вручную**: откройте вкладку **Actions → Release Desktop (Windows & macOS) → Run workflow**, при необходимости выберите платформу (`all`, `windows` или `macos`) и тег релиза.
