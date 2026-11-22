// English (Roman) spelling of a name -> Marathi (Devanagari).
//
// First choice is Google Input Tools, which knows how Indian names are really
// spelt ("asha patil" -> "आशा पाटील"). If it cannot be reached, a simple
// letter-by-letter scheme is used instead. Either way the result is only a
// suggestion: the registration form lets the user correct it.

const GOOGLE_URL = 'https://inputtools.google.com/request';
const TIMEOUT_MS = 4000;

// ---------------------------------------------------------------------------
// Offline fallback
// ---------------------------------------------------------------------------

// Longest patterns first
const VOWELS = [
  ['aa', 'आ', 'ा'], ['ee', 'ई', 'ी'], ['ii', 'ई', 'ी'], ['oo', 'ऊ', 'ू'], ['uu', 'ऊ', 'ू'],
  ['ai', 'ऐ', 'ै'], ['au', 'औ', 'ौ'], ['ou', 'औ', 'ौ'],
  ['a', 'अ', ''], ['i', 'इ', 'ि'], ['u', 'उ', 'ु'], ['e', 'ए', 'े'], ['o', 'ओ', 'ो']
];

const CONSONANTS = [
  ['ksh', 'क्ष'], ['chh', 'छ'], ['shh', 'ष'], ['dny', 'ज्ञ'], ['gny', 'ज्ञ'],
  ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'], ['jh', 'झ'], ['th', 'थ'], ['dh', 'ध'],
  ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'], ['ng', 'ं'],
  ['k', 'क'], ['g', 'ग'], ['c', 'क'], ['j', 'ज'], ['t', 'त'], ['d', 'द'], ['n', 'न'],
  ['p', 'प'], ['f', 'फ'], ['b', 'ब'], ['m', 'म'], ['y', 'य'], ['r', 'र'], ['l', 'ल'],
  ['v', 'व'], ['w', 'व'], ['s', 'स'], ['h', 'ह'], ['z', 'झ'], ['x', 'क्स'], ['q', 'क']
];

const VIRAMA = '्';

const match = (word, i, table) => table.find(([latin]) => word.startsWith(latin, i));

const transliterateWord = (word) => {
  let out = '';
  let i = 0;
  let afterConsonant = false;

  while (i < word.length) {
    const consonant = match(word, i, CONSONANTS);
    if (consonant) {
      if (consonant[1] === 'ं') {
        // "ng" -> anusvara after a vowel sound, else treat as न + ग
        if (afterConsonant) out += 'ं'; else out += 'न्ग';
        afterConsonant = false;
        i += 2;
        continue;
      }
      if (afterConsonant) out += VIRAMA; // consonant cluster
      out += consonant[1];
      afterConsonant = true;
      i += consonant[0].length;
      continue;
    }

    const vowel = match(word, i, VOWELS);
    if (vowel) {
      out += afterConsonant ? vowel[2] : vowel[1];
      afterConsonant = false;
      i += vowel[0].length;
      continue;
    }

    // Anything else (digits, punctuation) passes through
    out += word[i];
    afterConsonant = false;
    i += 1;
  }
  return out;
};

const transliterateOffline = (text) =>
  String(text).toLowerCase().split(/(\s+)/).map((part) => (/\s/.test(part) ? part : transliterateWord(part))).join('');

// ---------------------------------------------------------------------------
// Google Input Tools
// ---------------------------------------------------------------------------

const transliterateGoogle = async (text) => {
  const params = new URLSearchParams({
    text, itc: 'mr-t-i0-und', num: '5', cp: '0', cs: '1', ie: 'utf-8', oe: 'utf-8', app: 'mallakhamb'
  });
  const res = await fetch(`${GOOGLE_URL}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Input Tools HTTP ${res.status}`);
  const body = await res.json();
  if (body[0] !== 'SUCCESS') throw new Error('Input Tools did not succeed');
  // [ "SUCCESS", [ [ input, [suggestions...], ... ], ... ] ] — one segment per chunk
  const segments = body[1] || [];
  const best = segments.map((s) => s[1]?.[0] ?? s[0]).join(' ').trim();
  const suggestions = segments.length === 1 ? segments[0][1] || [] : [best];
  if (!best) throw new Error('Input Tools returned nothing');
  return { text: best, suggestions };
};

// Small cache: the same names are typed again and again while editing
const cache = new Map();
const CACHE_LIMIT = 2000;

/** Returns { text, suggestions, source: 'google' | 'offline' }. */
const toMarathi = async (input) => {
  const text = String(input || '').trim().replace(/\s+/g, ' ');
  if (!text) return { text: '', suggestions: [], source: 'offline' };
  // Already Devanagari — nothing to do
  if (/[ऀ-ॿ]/.test(text) && !/[a-z]/i.test(text)) return { text, suggestions: [text], source: 'offline' };

  const key = text.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let result;
  try {
    result = { ...(await transliterateGoogle(text)), source: 'google' };
  } catch {
    const offline = transliterateOffline(text);
    // Not cached, so the next request tries the online service again
    return { text: offline, suggestions: [offline], source: 'offline' };
  }
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
};

module.exports = { toMarathi, transliterateOffline };
