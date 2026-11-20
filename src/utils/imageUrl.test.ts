import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBackdropImageProps,
  buildPosterImageProps,
  buildProfileImageProps,
  buildTmdbImageUrl,
} from './imageUrl';

test('buildTmdbImageUrl resolves relative TMDB paths and preserves absolute URLs', () => {
  assert.equal(buildTmdbImageUrl(null), null);
  assert.equal(
    buildTmdbImageUrl('/abc.jpg', 'w780'),
    'https://image.tmdb.org/t/p/w780/abc.jpg',
  );
  assert.equal(
    buildTmdbImageUrl('https://cdn.example.com/poster.jpg', 'w500'),
    'https://cdn.example.com/poster.jpg',
  );
});

test('buildPosterImageProps serves Retina-grade w780 candidates for cards and detail posters', () => {
  const card = buildPosterImageProps('/poster.jpg', 'card');
  assert.ok(card);
  assert.equal(card.src, 'https://image.tmdb.org/t/p/w500/poster.jpg');
  assert.ok(card.srcSet?.includes('/w780/poster.jpg 780w'));
  assert.ok(card.sizes);

  const detail = buildPosterImageProps('/poster.jpg', 'detail');
  assert.ok(detail);
  assert.equal(detail.src, 'https://image.tmdb.org/t/p/w780/poster.jpg');
  assert.ok(detail.srcSet?.includes('/w780/poster.jpg 780w'));

  const thumb = buildPosterImageProps('/poster.jpg', 'thumb');
  assert.ok(thumb);
  assert.equal(thumb.src, 'https://image.tmdb.org/t/p/w342/poster.jpg');
  assert.ok(thumb.srcSet?.includes('/w185/poster.jpg 185w'));
});

test('buildBackdropImageProps and buildProfileImageProps provide Retina srcSet descriptors', () => {
  const backdrop = buildBackdropImageProps('/bg.jpg');
  assert.ok(backdrop);
  assert.equal(backdrop.src, 'https://image.tmdb.org/t/p/w1280/bg.jpg');
  assert.ok(backdrop.srcSet?.includes('/original/bg.jpg 1920w'));

  const profile = buildProfileImageProps('/actor.jpg');
  assert.ok(profile);
  assert.equal(profile.src, 'https://image.tmdb.org/t/p/w300/actor.jpg');
  assert.ok(profile.srcSet?.includes('/h632/actor.jpg 421w'));
});
