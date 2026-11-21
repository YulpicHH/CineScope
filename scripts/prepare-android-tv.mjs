#!/usr/bin/env node
/**
 * Подготавливает сгенерированный проект `src-tauri/gen/android` для Android TV / SberBox (Салют ТВ):
 * 1. Генерирует ТВ-баннер 320x180 (tv_banner.png) на сплошном фоне #090B10 из assets/app-icon.png.
 * 2. Патчит AndroidManifest.xml (leanback, touchscreen, banner, LEANBACK_LAUNCHER, INTERNET).
 *
 * Скрипт идемпотентен: повторный запуск не создаёт дубликатов в AndroidManifest.xml.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const BANNER_WIDTH = 320;
const BANNER_HEIGHT = 180;
const BG_HEX = '#090B10';
const BG_RGB = [9, 11, 16];

function parseArgs(argv) {
  let androidDir = path.join(ROOT_DIR, 'src-tauri', 'gen', 'android');
  let iconPath = path.join(ROOT_DIR, 'assets', 'app-icon.png');

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--android-dir' && argv[i + 1]) {
      androidDir = path.resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--icon' && argv[i + 1]) {
      iconPath = path.resolve(argv[i + 1]);
      i += 1;
    }
  }

  return { androidDir, iconPath };
}

function commandExists(cmd) {
  const probe = spawnSync(cmd, ['-version'], { stdio: 'ignore' });
  return !probe.error && probe.status === 0;
}

function findImageMagickBinary() {
  if (commandExists('magick')) return 'magick';
  if (commandExists('convert')) return 'convert';
  return null;
}

function generateBannerWithImageMagick(bin, iconPath, outputPath) {
  const cleanedIcon = path.join(
    path.dirname(outputPath),
    '.tmp-tv-banner-icon.png',
  );

  try {
    // Очищаем возможные белые углы исходной иконки, заливая углы сплошным #090B10
    execFileSync(
      bin,
      [
        iconPath,
        '-alpha',
        'off',
        '-fuzz',
        '18%',
        '-fill',
        BG_HEX,
        '-draw',
        'color 0,0 floodfill',
        '-draw',
        'color 1023,0 floodfill',
        '-draw',
        'color 0,1023 floodfill',
        '-draw',
        'color 1023,1023 floodfill',
        '-resize',
        '104x104',
        cleanedIcon,
      ],
      { stdio: 'pipe' },
    );

    // Собираем баннер 320x180: тёмный фон #090B10, иконка слева и подпись CineScope справа
    try {
      execFileSync(
        bin,
        [
          '-size',
          `${BANNER_WIDTH}x${BANNER_HEIGHT}`,
          `xc:${BG_HEX}`,
          cleanedIcon,
          '-gravity',
          'West',
          '-geometry',
          '+26+0',
          '-composite',
          '-gravity',
          'West',
          '-fill',
          '#F3F5F9',
          '-font',
          'DejaVu-Sans-Bold',
          '-pointsize',
          '28',
          '-annotate',
          '+142-10',
          'CineScope',
          '-fill',
          '#60A5FA',
          '-font',
          'DejaVu-Sans',
          '-pointsize',
          '13',
          '-annotate',
          '+144+18',
          'SMART TV',
          '-alpha',
          'off',
          `PNG24:${outputPath}`,
        ],
        { stdio: 'pipe' },
      );
    } catch {
      // Если шрифт DejaVu-Sans отсутствует в системе, рендерим чистый центрированный логотип без текста
      execFileSync(
        bin,
        [
          '-size',
          `${BANNER_WIDTH}x${BANNER_HEIGHT}`,
          `xc:${BG_HEX}`,
          cleanedIcon,
          '-gravity',
          'Center',
          '-composite',
          '-alpha',
          'off',
          `PNG24:${outputPath}`,
        ],
        { stdio: 'pipe' },
      );
    }
  } finally {
    if (fs.existsSync(cleanedIcon)) {
      fs.unlinkSync(cleanedIcon);
    }
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBytes = Buffer.alloc(4);
  lenBytes.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBytes, typeBytes, data, crcBytes]);
}

function generateFallbackSolidBannerPng(outputPath) {
  const rowSize = 1 + BANNER_WIDTH * 3;
  const raw = Buffer.alloc(rowSize * BANNER_HEIGHT);

  for (let y = 0; y < BANNER_HEIGHT; y += 1) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // filter: None
    for (let x = 0; x < BANNER_WIDTH; x += 1) {
      const px = rowOffset + 1 + x * 3;
      // Тонкая акцентная полоска снизу для аккуратного вида баннера
      const isAccentBar = y >= BANNER_HEIGHT - 8;
      raw[px] = isAccentBar ? 59 : BG_RGB[0];
      raw[px + 1] = isAccentBar ? 130 : BG_RGB[1];
      raw[px + 2] = isAccentBar ? 246 : BG_RGB[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(BANNER_WIDTH, 0);
  ihdr.writeUInt32BE(BANNER_HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB (opaque)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);

  fs.writeFileSync(outputPath, png);
}

function generateTvBanner(iconPath, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const magickBin = findImageMagickBinary();
  if (magickBin && fs.existsSync(iconPath)) {
    generateBannerWithImageMagick(magickBin, iconPath, outputPath);
    console.log(
      `[prepare-android-tv] Generated 320x180 tv_banner.png via ${magickBin}: ${outputPath}`,
    );
    return;
  }

  generateFallbackSolidBannerPng(outputPath);
  console.log(
    `[prepare-android-tv] Generated fallback 320x180 tv_banner.png (ImageMagick/icon unavailable): ${outputPath}`,
  );
}

export function patchAndroidManifestXml(xml) {
  let updated = xml;

  const insertBeforeApplication = (snippet) => {
    if (updated.includes('<application')) {
      updated = updated.replace(/([ \t]*<application\b)/, `    ${snippet}\n$1`);
    } else {
      updated = updated.replace(/(<manifest\b[^>]*>)/, `$1\n    ${snippet}`);
    }
  };

  // 1. Разрешение INTERNET
  if (!/android\.permission\.INTERNET/.test(updated)) {
    insertBeforeApplication(
      '<uses-permission android:name="android.permission.INTERNET" />',
    );
  }

  // 2. Leanback feature (required="false" для универсальности на SberBox и Android)
  if (!/android\.software\.leanback/.test(updated)) {
    insertBeforeApplication(
      '<uses-feature android:name="android.software.leanback" android:required="false" />',
    );
  }

  // 3. Touchscreen feature (required="false", иначе TV-лаунчеры могут отклонить APK)
  if (!/android\.hardware\.touchscreen/.test(updated)) {
    insertBeforeApplication(
      '<uses-feature android:name="android.hardware.touchscreen" android:required="false" />',
    );
  }

  // 4. android:banner="@drawable/tv_banner" в теге <application>
  updated = updated.replace(/<application\b([^>]*)>/, (match, attrs) => {
    if (/\bandroid:banner\s*=/.test(attrs)) {
      return match.replace(
        /\bandroid:banner\s*=\s*"[^"]*"/,
        'android:banner="@drawable/tv_banner"',
      );
    }
    return `<application${attrs}\n        android:banner="@drawable/tv_banner">`;
  });

  // 5. Категория LEANBACK_LAUNCHER в intent-filter главной Activity
  if (!/android\.intent\.category\.LEANBACK_LAUNCHER/.test(updated)) {
    const launcherCategoryRe =
      /(<category\s+android:name="android\.intent\.category\.LAUNCHER"\s*\/>)/;
    if (launcherCategoryRe.test(updated)) {
      updated = updated.replace(
        launcherCategoryRe,
        '$1\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />',
      );
    } else {
      const mainActionRe =
        /(<action\s+android:name="android\.intent\.action\.MAIN"\s*\/>)/;
      if (mainActionRe.test(updated)) {
        updated = updated.replace(
          mainActionRe,
          '$1\n                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />',
        );
      }
    }
  }

  return updated;
}

function runCli() {
  const { androidDir, iconPath } = parseArgs(process.argv.slice(2));
  const mainDir = path.join(androidDir, 'app', 'src', 'main');
  const manifestPath = path.join(mainDir, 'AndroidManifest.xml');
  const bannerPath = path.join(mainDir, 'res', 'drawable', 'tv_banner.png');

  if (!fs.existsSync(manifestPath)) {
    console.error(
      `[prepare-android-tv] AndroidManifest.xml не найден: ${manifestPath}\nСначала выполните: npx tauri android init --ci`,
    );
    process.exit(1);
  }

  generateTvBanner(iconPath, bannerPath);

  const originalXml = fs.readFileSync(manifestPath, 'utf8');
  const patchedXml = patchAndroidManifestXml(originalXml);
  fs.writeFileSync(manifestPath, patchedXml, 'utf8');

  console.log(`[prepare-android-tv] Patched AndroidManifest.xml: ${manifestPath}`);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  runCli();
}
