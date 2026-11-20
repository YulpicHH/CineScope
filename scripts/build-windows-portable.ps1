param(
    [string]$Target = "x86_64-pc-windows-msvc"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$TauriConfPath = Join-Path $RepoRoot "src-tauri/tauri.conf.json"

if (-not (Test-Path $TauriConfPath)) {
    throw "Не найден файл конфигурации $TauriConfPath"
}

$TauriConf = Get-Content -Raw -Encoding UTF8 $TauriConfPath | ConvertFrom-Json
$ProductName = if ($TauriConf.productName) { [string]$TauriConf.productName } else { "CineScope" }
$Version = if ($TauriConf.version) { [string]$TauriConf.version } else { "1.0.0" }

$CandidateExes = @(
    (Join-Path $RepoRoot "src-tauri/target/$Target/release/cinescope.exe"),
    (Join-Path $RepoRoot "src-tauri/target/release/cinescope.exe")
)

$SourceExe = $CandidateExes | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $SourceExe) {
    throw "Не найден собранный бинарник cinescope.exe. Сначала выполните 'npm run tauri:build:win'."
}

$OutputDir = Join-Path $RepoRoot "src-tauri/target/$Target/release/bundle/portable"
$StagingRoot = Join-Path $OutputDir "staging"
$StagingFolder = Join-Path $StagingRoot "${ProductName}-Portable"
$ZipName = "${ProductName}_${Version}_x64-portable.zip"
$ZipPath = Join-Path $OutputDir $ZipName

if (Test-Path $StagingRoot) {
    Remove-Item -Recurse -Force $StagingRoot
}
New-Item -ItemType Directory -Force -Path $StagingFolder | Out-Null

Copy-Item -Path $SourceExe -Destination (Join-Path $StagingFolder "${ProductName}.exe") -Force

$ReadmeContent = @"
CineScope ${Version} — Портативная версия для Windows (x64)
============================================================

1. ЗАПУСК
   Распакуйте архив в любую папку и запустите CineScope.exe.
   Установка в систему и права администратора не требуются.

2. ПРЕДУПРЕЖДЕНИЕ WINDOWS SMARTSCREEN
   Поскольку сборка не подписана платным EV-сертификатом, при первом запуске
   Windows Defender SmartScreen может показать предупреждение.
   Нажмите «Подробнее» -> «Выполнить в любом случае».

3. ТРЕБОВАНИЯ
   Windows 10 (1803+) или Windows 11 (64-bit) с Microsoft Edge WebView2 Runtime.
   В Windows 11 и актуальной Windows 10 компонент WebView2 уже встроен.
   Если при запуске система сообщит об отсутствии WebView2, скачайте официальный
   Evergreen Bootstrapper: https://developer.microsoft.com/microsoft-edge/webview2/

4. ПЛЕЕР 4K И НАСТРОЙКИ
   По умолчанию фильмы открываются во встроенном окне CineScope (WebView2 4K).
   В настройках приложения также можно переключиться на изолированные чистые окна
   Google Chrome, Microsoft Edge или Mozilla Firefox.

5. ХРАНЕНИЕ ДАННЫХ
   Ваша коллекция, история и API-ключи (TMDB / Kinopoisk) сохраняются локально
   в профиле Windows (%APPDATA%\com.yulpichh.cinescope) и никуда не передаются.
"@

$Utf8WithBom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText(
    (Join-Path $StagingFolder "README-Windows.txt"),
    $ReadmeContent,
    $Utf8WithBom
)

if (Test-Path $ZipPath) {
    Remove-Item -Force $ZipPath
}

Compress-Archive -Path $StagingFolder -DestinationPath $ZipPath -CompressionLevel Optimal -Force
Remove-Item -Recurse -Force $StagingRoot

Write-Host "Портативный архив успешно собран: $ZipPath"
