import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDownloadIdForMedia,
  calculateDownloadProgress,
  computeTotalOfflineBytes,
  extractFileFormatLabel,
  formatFileSize,
  inferFileNameFromUrl,
  parseOfflineDownloadsStorage,
  removeOfflineDownload,
  serializeOfflineDownloadsStorage,
  upsertOfflineDownload,
  validateDirectVideoUrl,
  type OfflineDownloadItem,
} from './offlineDownloadsRules';

function makeSampleItem(overrides: Partial<OfflineDownloadItem> = {}): OfflineDownloadItem {
  return {
    downloadId: 'movie:157336',
    tmdbId: 157336,
    mediaType: 'movie',
    title: 'Интерстеллар',
    originalTitle: 'Interstellar',
    year: '2014',
    posterPath: '/poster.jpg',
    genres: [{ id: 878, name: 'Фантастика' }],
    voteAverage: 8.5,
    source: 'download',
    filePath: '/Users/test/Library/Application Support/CineScope/downloads/interstellar.mp4',
    webBlobKey: null,
    fileName: 'interstellar.mp4',
    fileSizeBytes: 2_147_483_648,
    qualityLabel: '4K',
    sourceUrl: 'https://nas.local/movies/interstellar.mp4',
    addedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

test('formatFileSize formats bytes, KB, MB, and GB cleanly', () => {
  assert.equal(formatFileSize(0), '0 Б');
  assert.equal(formatFileSize(-10), '0 Б');
  assert.equal(formatFileSize(512), '512 Б');
  assert.equal(formatFileSize(1536), '1.5 КБ');
  assert.equal(formatFileSize(10 * 1024 * 1024), '10 МБ');
  assert.equal(formatFileSize(2.5 * 1024 * 1024 * 1024), '2.5 ГБ');
});

test('extractFileFormatLabel identifies video extensions and strips query strings', () => {
  assert.equal(extractFileFormatLabel('movie.4k.mkv'), 'MKV');
  assert.equal(extractFileFormatLabel('https://example.com/v/film.mp4?token=123'), 'MP4');
  assert.equal(extractFileFormatLabel('clip.MOV#t=10'), 'MOV');
  assert.equal(extractFileFormatLabel('stream.webm'), 'WEBM');
  assert.equal(extractFileFormatLabel('no-extension'), 'VIDEO');
});

test('validateDirectVideoUrl accepts http/https and rejects empty or unsafe schemes', () => {
  assert.equal(validateDirectVideoUrl('').ok, false);
  assert.equal(validateDirectVideoUrl('not-a-url').ok, false);
  assert.equal(validateDirectVideoUrl('javascript:alert(1)').ok, false);
  assert.equal(validateDirectVideoUrl('file:///etc/passwd').ok, false);

  const valid = validateDirectVideoUrl('  https://nas.local:8096/film.mkv  ');
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.url, 'https://nas.local:8096/film.mkv');
  }
});

test('calculateDownloadProgress handles known totals, clamping, and unknown totals', () => {
  assert.equal(calculateDownloadProgress(50, 100), 50);
  assert.equal(calculateDownloadProgress(150, 100), 100);
  assert.equal(calculateDownloadProgress(0, 100), 0);
  assert.equal(calculateDownloadProgress(500, null), null);
  assert.equal(calculateDownloadProgress(500, 0), null);
});

test('parseOfflineDownloadsStorage round-trips valid state and drops corrupted entries', () => {
  const item = makeSampleItem();
  const serialized = serializeOfflineDownloadsStorage({
    version: 1,
    items: [item],
  });
  const parsed = parseOfflineDownloadsStorage(serialized);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].downloadId, 'movie:157336');
  assert.equal(parsed.items[0].qualityLabel, '4K');

  assert.deepEqual(parseOfflineDownloadsStorage(null), { version: 1, items: [] });
  assert.deepEqual(parseOfflineDownloadsStorage('{broken'), { version: 1, items: [] });

  const mixed = parseOfflineDownloadsStorage(
    JSON.stringify({
      version: 1,
      items: [
        item,
        { downloadId: 'bad', title: 'No file path or blob', fileName: 'a.mp4' },
      ],
    }),
  );
  assert.equal(mixed.items.length, 1);
});

test('upsertOfflineDownload, removeOfflineDownload, computeTotalOfflineBytes, and helpers work accurately', () => {
  const first = makeSampleItem({ fileSizeBytes: 1_000_000 });
  const second = makeSampleItem({
    downloadId: 'tv:1399',
    tmdbId: 1399,
    mediaType: 'tv',
    title: 'Игра престолов',
    fileSizeBytes: 2_500_000,
  });

  let list = upsertOfflineDownload([], first);
  list = upsertOfflineDownload(list, second);
  assert.equal(list.length, 2);
  assert.equal(computeTotalOfflineBytes(list), 3_500_000);

  const updatedFirst = makeSampleItem({ fileSizeBytes: 4_000_000, qualityLabel: '1080p' });
  list = upsertOfflineDownload(list, updatedFirst);
  assert.equal(list.length, 2);
  assert.equal(list[0].downloadId, 'movie:157336');
  assert.equal(list[0].qualityLabel, '1080p');

  list = removeOfflineDownload(list, 'tv:1399');
  assert.equal(list.length, 1);
  assert.equal(buildDownloadIdForMedia('movie', 157336), 'movie:157336');
  assert.equal(inferFileNameFromUrl('https://cdn.local/Interstellar_4K.mkv', 'Интерстеллар'), 'Interstellar_4K.mkv');
});
