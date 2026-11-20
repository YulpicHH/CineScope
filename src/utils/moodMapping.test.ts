import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMoodReasonFallback, getMoodGenresForMediaType } from './moodMapping';

test('getMoodGenresForMediaType maps movie vs tv genre IDs accurately', () => {
  const movieRes = getMoodGenresForMediaType(['visual_beauty'], 'movie');
  assert.deepEqual(movieRes.genreIds.sort(), [12, 14, 878].sort());

  const tvRes = getMoodGenresForMediaType(['visual_beauty'], 'tv');
  assert.deepEqual(tvRes.genreIds.sort(), [10759, 10765].sort());

  const twistRes = getMoodGenresForMediaType(['plot_twist'], 'movie');
  assert.equal(twistRes.sortBy, 'vote_average.desc');
  assert.ok(twistRes.minVoteCount >= 1000);
});

test('buildMoodReasonFallback creates Russian explanation based on mood and genres', () => {
  const explanation = buildMoodReasonFallback(['mysterious'], ['Детектив', 'Триллер']);
  assert.ok(explanation.includes('Атмосферное и загадочное'));
  assert.ok(explanation.includes('детектив, триллер'));
});
