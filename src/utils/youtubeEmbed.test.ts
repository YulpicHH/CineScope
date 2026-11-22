import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildDirectYouTubeEmbedUrl,
  buildYouTubeWatchUrl,
  isValidYouTubeVideoKey,
  resolveTrailerEmbedUrl,
} from './youtubeEmbed';

test('isValidYouTubeVideoKey accepts valid YouTube IDs and rejects injection payloads', () => {
  assert.equal(isValidYouTubeVideoKey('dQw4w9WgXcQ'), true);
  assert.equal(isValidYouTubeVideoKey('abc_123-XYZ'), true);
  assert.equal(isValidYouTubeVideoKey(''), false);
  assert.equal(isValidYouTubeVideoKey('short'), false);
  assert.equal(isValidYouTubeVideoKey('bad/path?x=1'), false);
  assert.equal(isValidYouTubeVideoKey('"><script>alert(1)</script>'), false);
});

test('buildDirectYouTubeEmbedUrl and buildYouTubeWatchUrl produce clean privacy-enhanced URLs', () => {
  assert.equal(
    buildDirectYouTubeEmbedUrl('dQw4w9WgXcQ'),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1',
  );
  assert.equal(
    buildYouTubeWatchUrl('dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  assert.equal(buildDirectYouTubeEmbedUrl('../bad'), null);
  assert.equal(buildYouTubeWatchUrl('../bad'), null);
});

test('resolveTrailerEmbedUrl uses desktop Tauri loopback bridge and falls back cleanly', async () => {
  const desktopUrl = await resolveTrailerEmbedUrl('dQw4w9WgXcQ', {
    desktopTauri: true,
    invokeFn: (async (cmd: string, args?: unknown) => {
      assert.equal(cmd, 'get_trailer_embed_url');
      assert.deepEqual(args, { videoKey: 'dQw4w9WgXcQ' });
      return 'http://127.0.0.1:54321/trailer/dQw4w9WgXcQ';
    }) as never,
  });
  assert.equal(desktopUrl, 'http://127.0.0.1:54321/trailer/dQw4w9WgXcQ');

  // Falls back safely to youtube-nocookie if invoke fails
  const fallbackUrl = await resolveTrailerEmbedUrl('dQw4w9WgXcQ', {
    desktopTauri: true,
    invokeFn: (async () => {
      throw new Error('bridge unavailable');
    }) as never,
  });
  assert.equal(
    fallbackUrl,
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1',
  );

  // Web / non-desktop uses direct youtube-nocookie embed
  const webUrl = await resolveTrailerEmbedUrl('dQw4w9WgXcQ', {
    desktopTauri: false,
  });
  assert.equal(
    webUrl,
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1',
  );
});

test('Tauri CSP, index.html, and Rust trailer bridge are configured to prevent YouTube Error 153', () => {
  const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  const tauriConf = fs.readFileSync(
    path.resolve(process.cwd(), 'src-tauri/tauri.conf.json'),
    'utf8',
  );
  const bridgeRs = fs.readFileSync(
    path.resolve(process.cwd(), 'src-tauri/src/trailer_bridge.rs'),
    'utf8',
  );
  const libRs = fs.readFileSync(path.resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');

  assert.ok(
    indexHtml.includes('<meta name="referrer" content="strict-origin-when-cross-origin"'),
    'index.html must declare strict-origin-when-cross-origin referrer policy',
  );
  assert.ok(
    tauriConf.includes('http://127.0.0.1:*'),
    'tauri.conf.json frame-src CSP must allow loopback trailer bridge',
  );
  assert.ok(
    bridgeRs.includes('Referrer-Policy: strict-origin-when-cross-origin') &&
      bridgeRs.includes('referrerpolicy="strict-origin-when-cross-origin"'),
    'trailer_bridge.rs must send Referrer-Policy header and iframe referrerpolicy attribute',
  );
  assert.ok(
    bridgeRs.includes('TcpListener::bind("127.0.0.1:0")'),
    'trailer_bridge.rs must bind strictly to 127.0.0.1:0 loopback',
  );
  assert.ok(
    libRs.includes('get_trailer_embed_url') && libRs.includes('TrailerBridgeState'),
    'lib.rs must register get_trailer_embed_url command and TrailerBridgeState',
  );
});
