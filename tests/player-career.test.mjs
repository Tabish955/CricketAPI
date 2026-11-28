import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCareerTables, parseProfileBiography } from '../src/player-career.js';
import { parseProfileHtml } from '../src/providers.js';

test('transposed career table preserves formats, zeros, missing and provider labels', () => {
  const html = `<h2>Batting Career Summary</h2><table><tr><th></th><th>Test</th><th>T20</th></tr><tr><td>Matches</td><td>90</td><td>0</td></tr><tr><td>Highest</td><td>224*</td><td>-</td></tr></table>`;
  assert.deepEqual(parseCareerTables(html).batting.formats, [
    { format: 'Test', statistics: { Matches: '90', Highest: '224*' } },
    { format: 'T20', statistics: { Matches: '0', Highest: null } },
  ]);
  assert.equal(parseCareerTables(html).bowling, null);
});
test('legacy format rows preserve bowling figures and null placeholders', () => {
  const html = `<table><caption>Bowling Career Summary</caption><tr><th></th><th>M</th><th>BBI</th></tr><tr><td>ODI</td><td>350</td><td>1/14</td></tr><tr><td>IPL</td><td>278</td><td>-/-</td></tr></table>`;
  assert.deepEqual(parseCareerTables(html).bowling.formats[1], { format: 'IPL', statistics: { M: '278', BBI: null } });
});
test('recent form and irregular tables are not career data', () => {
  assert.deepEqual(parseCareerTables('<h2>Batting Form</h2><table><tr><th></th><th>Test</th></tr><tr><td>Runs</td><td>100</td></tr></table>'), { batting: null, bowling: null });
  assert.equal(parseCareerTables('<h2>Batting Career Summary</h2><table><tr><th></th><th>Test</th></tr><tr><td>Runs</td></tr></table>').batting, null);
});
test('biography uses explicit container, strips markup and excludes executable content', () => {
  assert.equal(parseProfileBiography('<nav>Profile</nav><div class="cb-player-bio"><p>A &amp; B.</p><script>bad()</script><p>Second paragraph.</p></div><footer>Other news</footer>'), 'A & B.\n\nSecond paragraph.');
  assert.equal(parseProfileBiography('<h3>SUMMARY</h3><p>Unverified page layout.</p>'), null);
});
test('profile additions are nullable and existing identity fields remain unchanged', () => {
  const p = parseProfileHtml('<h1 class="cb-font-40">Example Player</h1>', '265');
  assert.equal(p.name, 'Example Player');
  assert.equal(p.playerId, '265');
  assert.equal(p.biography, null);
  assert.deepEqual(p.careerStats, { batting: null, bowling: null });
  assert.equal(p.careerUpdatedAt, null);
});

test('observed modern div heading and section#player-bio are supported without importing rankings', () => {
  const html = `<title>Kane Williamson Profile - ICC Ranking, Age, Career Info &amp; Stats | Cricbuzz.com</title><div><h3>PERSONAL INFORMATION</h3><div>Born</div><div>August 08, 1990 (36 years)</div></div><div><div><div>Batting Career Summary</div><div></div></div><table><tr><th></th><th>Test</th></tr><tr><td>Matches</td><td>110</td></tr></table></div><div><div>ICC RANKINGS</div><table><tr><th>Format</th><th>Current Rank</th></tr><tr><td>Test</td><td>--</td></tr></table></div><section id="player-bio"><div>First paragraph.<br><br>Second paragraph.</div></section>`;
  const profile = parseProfileHtml(html, '6326');
  assert.equal(profile.name, 'Kane Williamson');
  assert.equal(profile.personalInfo.born, 'August 08, 1990 (36 years)');
  assert.equal(profile.biography, 'First paragraph.\n\nSecond paragraph.');
  assert.equal(profile.careerStats.batting.formats[0].statistics.Matches, '110');
  assert.equal(profile.careerStats.bowling, null);
});
