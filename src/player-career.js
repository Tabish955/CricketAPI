import { load } from 'cheerio';

const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
const value = (s) => !s || /^(?:[-–—]+|-\/-|n\/?a)$/i.test(s) ? null : s;

/** Extract only explicitly labelled career tables. Preserve provider labels and
 * string values (e.g. 183*, 1/14); never infer formats or convert blanks to zero.
 * Both metric-by-format and format-by-metric layouts are supported.
 */
export function profilePortraitCandidate(html, name) {
  const $ = load(html);
  const normalize = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  // Only a visible portrait explicitly labelled with this profile's name.
  // Not the first image on the page (which may be a team, ad or news thumbnail).
  for (const img of $('img').toArray()) {
    if (normalize($(img).attr('alt')) !== normalize(name) || !name) continue;
    try {
      const u = new URL($(img).attr('src'));
      if (u.origin === 'https://static.cricbuzz.com' && !u.username && !u.password
        && /^\/a\/img\/v1\/(?:[a-z0-9x]+\/)?i1\/c[1-9]\d*\//i.test(u.pathname)) return u.href;
    } catch { /* No safe labelled candidate. */ }
  }
  return null;
}

export function profilePublishedIdentity(html) {
  const $ = load(html);
  const urls = [$('link[rel="canonical"]').attr('href'), $('meta[property="og:url"]').attr('content')].filter(Boolean);
  const ids = new Set();
  for (const value of urls) {
    try {
      const u = new URL(value);
      const m = u.pathname.match(/^\/profiles\/([1-9]\d{0,11})\/[^/]+\/?$/);
      if (u.origin === 'https://www.cricbuzz.com' && m && !u.username && !u.password) ids.add(m[1]);
    } catch { /* Unpublished identity remains null. */ }
  }
  return ids.size === 1 ? [...ids][0] : null;
}

export function profileNameFromTitle(html) {
  const $ = load(html);
  const title = $('meta[property="og:title"]').attr('content') || $('title').first().text();
  return clean(title).match(/^(.+?) Profile\s*-/i)?.[1] || '';
}

export function parseProfileBiography(html) {
  const $ = load(html);
  $('script,style,nav,footer').remove();
  // Explicit biography containers only; never use a page-wide text slice that
  // could accidentally import news, navigation or another player's biography.
  const container = $('#player-bio, .cb-player-bio').first();
  if (!container.length) return null;
  container.find('script,style,button').remove();
  container.find('br').replaceWith('\n');
  const paragraphs = container.find('p').toArray().map((p) => clean($(p).text())).filter(Boolean);
  const text = paragraphs.length ? paragraphs.join('\n\n') : container.text().split(/\n\s*\n/).map(clean).filter(Boolean).join('\n\n');
  return text || null;
}

export function parseCareerTables(html) {
  const $ = load(html);
  $('script, style, nav, footer').remove();
  const result = { batting: null, bowling: null };
  $('table').each((_, table) => {
    const caption = clean($(table).find('caption').text());
    // Walk preceding content, but stop at the previous table. This prevents a
    // later unrelated table from inheriting a career heading.
    let heading = caption;
    if (!heading) {
      const prior = $(table).prevAll().toArray();
      for (const node of prior) {
        if ($(node).is('table') || $(node).find('table').length) break;
        const text = clean($(node).text());
        if (/^(Batting|Bowling) Career Summary$/i.test(text)) { heading = text; break; }
        const h = $(node).find('h2,h3,h4').last();
        if (h.length) { heading = clean(h.text()); break; }
      }
    }
    const kind = /^(Batting|Bowling) Career Summary$/i.exec(heading)?.[1].toLowerCase();
    if (!kind || result[kind]) return;
    const rows = $(table).find('tr').toArray().map((tr) => $(tr).children('th,td').toArray().map((td) => clean($(td).text())));
    if (rows.length < 2 || rows[0].length < 2) return;
    const header = rows[0];
    if (new Set(header.slice(1)).size !== header.length - 1 || header.slice(1).some((s) => !s)) return;
    // Fail closed on irregular tables rather than shift metrics into wrong columns.
    if (rows.slice(1).some((r) => r.length !== header.length || !r[0])
      || new Set(rows.slice(1).map((r) => r[0])).size !== rows.length - 1) return;
    const transposed = rows.slice(1).some((r) => /^matches$/i.test(r[0]));
    const formats = transposed
      ? header.slice(1).map((format, i) => ({ format, statistics: Object.fromEntries(rows.slice(1).map((r) => [r[0], value(r[i + 1])])) }))
      : rows.slice(1).map((r) => ({ format: r[0], statistics: Object.fromEntries(header.slice(1).map((label, i) => [label, value(r[i + 1])])) }));
    result[kind] = { title: heading, formats };
  });
  return result;
}
