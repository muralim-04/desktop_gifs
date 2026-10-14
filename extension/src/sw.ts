// @ts-nocheck
// Service worker (background script): the only part of the extension that talks
// to Tenor. It fetches GIFs, checks their age ratings (since YouTube only
// accepts G-rated GIFs), and returns a clean list of GIF objects to content.js.

// -----------------------------------------------------------------------------
// 1. CONSTANTS & REGEX PATTERNS (What those symbol strings mean)
// -----------------------------------------------------------------------------

const TENOR_ORIGIN = 'https://tenor.com';
const TENOR_API_BASE = 'https://tenor.googleapis.com/v2';

const CACHE_TTL_MS = 10 * 60 * 1000; // Keep cached responses for 10 minutes
const MAX_CACHE_ENTRIES = 40;        // Maximum URLs to keep in memory
const MAX_RESULTS = 50;              // Maximum GIFs returned per search
const TENOR_TIMEOUT_MS = 10000;      // Abort requests that take longer than 10 seconds

// Matches a 1-to-20 digit number (Tenor GIF ID), e.g., "1234567890"
const NUMERIC_ID_REGEX = /^\d{1,20}$/;

// Matches URLs starting with "http://" or "https://" (case-insensitive)
const HAS_HTTP_PROTOCOL_REGEX = /^https?:\/\//i;

// Matches Tenor image hostnames like "media.tenor.com" or "media1.tenor.com"
const TENOR_MEDIA_HOST_REGEX = /^media\d*\.tenor\.com$/;

// Matches a Tenor image URL starting with "https://media.tenor.com/"
const TENOR_MEDIA_URL_REGEX = /^https:\/\/media\d*\.tenor\.com\//;

// Matches the 16-character encoded ID inside a media.tenor.com URL path
const MEDIA_ID_SEGMENT_REGEX = /^[A-Za-z0-9_-]{16}$/;

// Matches the <script id="store-cache"> tag in Tenor's HTML where page data lives
const STORE_CACHE_SCRIPT_REGEX = /<script id="store-cache" type="text\/x-cache"[^>]*>([\s\S]*?)<\/script>/;

// Matches the <script id="data"> tag in Tenor's HTML where the API key lives
const API_KEY_SCRIPT_REGEX = /<script id="data" type="text\/x-cache"[^>]*>([\s\S]*?)<\/script>/;

// Stores recent responses: Map<url, { time: number, value: any }>
const responseCache = new Map();

// -----------------------------------------------------------------------------
// 2. EXTENSION LIFECYCLE & MESSAGE LISTENERS
// -----------------------------------------------------------------------------

// When the extension is first installed, inject our scripts into any YouTube
// tabs that are already open so the user doesn't have to refresh them manually.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;

  const openYouTubeTabs = await chrome.tabs.query({
    url: 'https://www.youtube.com/*',
    discarded: false,
  });

  const injectionTasks = openYouTubeTabs.map(async (tab) => {
    const target = { tabId: tab.id };
    try {
      await chrome.scripting.executeScript({ target, files: ['src/main.js'], world: 'MAIN' });
      await chrome.scripting.insertCSS({ target, files: ['src/content.css'] });
      await chrome.scripting.executeScript({ target, files: ['src/content.js'] });
    } catch {
      // Ignore if the tab was closed or navigated away during injection
    }
  });

  await Promise.all(injectionTasks);
});

// Listen for requests from content.js (featured, search, resolve, check)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    return false;
  }

  handleMessage(message).then(
    (gifs) => {
      sendResponse({ ok: true, gifs });
    },
    (error) => {
      const errorMessage = error && error.message ? error.message : String(error);
      sendResponse({ ok: false, error: errorMessage });
    }
  );

  // Returning `true` tells Chrome we will call `sendResponse` asynchronously
  return true;
});

async function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('Bad request.');
  }

  switch (msg.type) {
    case 'featured':
      return getFeaturedGifs();

    case 'search':
      if (typeof msg.query === 'string') {
        return searchGifs(msg.query);
      }
      break;

    case 'resolve':
      if (typeof msg.input === 'string') {
        return resolveGifLinkOrId(msg.input);
      }
      break;

    case 'check':
      if (typeof msg.id === 'string' && NUMERIC_ID_REGEX.test(msg.id)) {
        return checkGifRating(msg.id);
      }
      break;
  }

  throw new Error('Bad request.');
}

// -----------------------------------------------------------------------------
// 3. CACHING & FETCHING FROM TENOR
// -----------------------------------------------------------------------------

// Returns a cached result if it's less than 10 minutes old; otherwise runs `loadFn()`
async function getOrFetchCached(url, loadFn) {
  const cachedEntry = responseCache.get(url);
  const isFresh = cachedEntry && (Date.now() - cachedEntry.time < CACHE_TTL_MS);

  if (isFresh) {
    return cachedEntry.value;
  }

  const freshValue = await loadFn();
  responseCache.set(url, { time: Date.now(), value: freshValue });

  // If the cache grows past 40 items, delete the oldest item
  if (responseCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }

  return freshValue;
}

// Downloads a tenor.com web page and extracts its embedded JSON store + API keys
function fetchTenorWebPage(url) {
  return getOrFetchCached(url, async () => {
    const response = await fetch(url, {
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(TENOR_TIMEOUT_MS),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Tenor could not find that GIF.');
      }
      throw new Error(`Tenor returned HTTP ${response.status}.`);
    }

    if (new URL(response.url).origin !== TENOR_ORIGIN) {
      throw new Error('Tenor redirected somewhere unexpected.');
    }

    const html = await response.text();
    const storeMatch = html.match(STORE_CACHE_SCRIPT_REGEX);
    if (!storeMatch) {
      throw new Error('Tenor changed its page format; search is unavailable.');
    }

    return {
      store: JSON.parse(storeMatch[1]),
      keys: extractApiKeysFromHtml(html),
    };
  });
}

// Reads Tenor's own API keys from the base64-encoded `<script id="data">` tag
function extractApiKeysFromHtml(html) {
  const scriptMatch = html.match(API_KEY_SCRIPT_REGEX);
  if (!scriptMatch) return null;

  try {
    const base64Text = scriptMatch[1].trim();
    const decodedJson = atob(base64Text);
    const data = JSON.parse(decodedJson);

    if (typeof data.API_V2_KEY === 'string' && typeof data.API_V2_CLIENT_KEY === 'string') {
      return {
        key: data.API_V2_KEY,
        client_key: data.API_V2_CLIENT_KEY,
      };
    }
  } catch {
    // If keys can't be read, callers will fall back to scraping the web page's store
  }

  return null;
}

// Calls Tenor's official v2 JSON API using the keys scraped from the homepage
async function fetchTenorApi(endpointPath, extraParams) {
  const { keys } = await fetchTenorWebPage(`${TENOR_ORIGIN}/`);
  if (!keys) {
    throw new Error('Tenor changed its page format; ratings are unavailable.');
  }

  const queryParams = new URLSearchParams({
    ...keys,
    contentfilter: 'high', // 'high' tells Tenor to return G-rated GIFs only
    media_filter: 'tinygif,tinywebp,gif',
    ...extraParams,
  });

  const apiUrl = `${TENOR_API_BASE}${endpointPath}?${queryParams}`;

  return getOrFetchCached(apiUrl, async () => {
    const response = await fetch(apiUrl, {
      credentials: 'omit',
      signal: AbortSignal.timeout(TENOR_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Tenor returned HTTP ${response.status}.`);
    }

    const data = await response.json();
    if (!Array.isArray(data.results)) {
      throw new Error('Tenor sent an answer that could not be read.');
    }

    return data.results;
  });
}

// -----------------------------------------------------------------------------
// 4. FORMATTING & FILTERING GIF DATA
// -----------------------------------------------------------------------------

// Returns true if the GIF is rated G (or has no rating field attached)
function isRatedGOrUnrated(rawGif) {
  return typeof rawGif.content_rating !== 'string' || rawGif.content_rating === 'G';
}

// Converts a raw Tenor API/store result into our clean Gif object (or null if invalid)
function formatSingleGif(rawGif) {
  if (!rawGif || !NUMERIC_ID_REGEX.test(String(rawGif.id)) || !rawGif.media_formats) {
    return null;
  }

  // Skip transparent stickers and static non-animated images
  const flags = rawGif.flags || [];
  if (flags.includes('sticker') || flags.includes('static')) {
    return null;
  }

  // Pick the smallest preview format available
  const format =
    rawGif.media_formats.tinygif ||
    rawGif.media_formats.tinywebp ||
    rawGif.media_formats.gif;

  if (!format || typeof format.url !== 'string' || !TENOR_MEDIA_URL_REGEX.test(format.url)) {
    return null;
  }

  const dimensions = Array.isArray(format.dims) ? format.dims : [];
  const rawTitle = rawGif.content_description || rawGif.h1_title || 'GIF';
  const rating = typeof rawGif.content_rating === 'string' ? rawGif.content_rating : null;

  return {
    id: String(rawGif.id),
    title: String(rawTitle).slice(0, 200),
    preview: format.url,
    width: dimensions[0] || 220,
    height: dimensions[1] || 124,
    contentRating: rating,
  };
}

// Converts an array of raw Tenor results into up to 50 valid Gif objects
function formatGifList(rawResults) {
  if (!Array.isArray(rawResults)) return [];
  return rawResults
    .map(formatSingleGif)
    .filter(Boolean)
    .slice(0, MAX_RESULTS);
}

// -----------------------------------------------------------------------------
// 5. ACTIONS: FEATURED, SEARCH, RESOLVE LINK, AND CHECK RATING
// -----------------------------------------------------------------------------

// 1. Get trending/featured GIFs
async function getFeaturedGifs() {
  try {
    const apiResults = await fetchTenorApi('/featured', { limit: MAX_RESULTS });
    return formatGifList(apiResults.filter(isRatedGOrUnrated));
  } catch {
    // Fallback: use the featured GIFs embedded in the Tenor homepage HTML
    const { store } = await fetchTenorWebPage(`${TENOR_ORIGIN}/`);
    const fallbackResults = store.gifs?.featured?.results;
    return formatGifList(fallbackResults);
  }
}

// 2. Search GIFs by keyword
async function searchGifs(query) {
  // Convert "funny cat!" into URL slug "funny-cat"
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const urlSlug = words.map(encodeURIComponent).join('-');

  if (!urlSlug) {
    return getFeaturedGifs();
  }

  try {
    const apiResults = await fetchTenorApi('/search', {
      q: query.trim(),
      limit: MAX_RESULTS,
    });
    return formatGifList(apiResults.filter(isRatedGOrUnrated));
  } catch {
    // Fallback: scrape the search results page directly
    const { store } = await fetchTenorWebPage(`${TENOR_ORIGIN}/search/${urlSlug}-gifs`);
    const searchEntries = Object.values(store.universal?.search || {});
    const firstEntryResults = searchEntries[0]?.results;
    return formatGifList(firstEntryResults);
  }
}

// 3. Turn a pasted Tenor link or numeric ID into a GIF object
async function resolveGifLinkOrId(input) {
  const trimmedInput = input.trim();
  const pageUrl = buildTenorPageUrl(trimmedInput);

  const { store } = await fetchTenorWebPage(pageUrl);
  const gifsById = Object.values(store.gifs?.byId || {});
  const allResults = gifsById.flatMap((entry) => entry?.results || []);
  const gifs = formatGifList(allResults.slice(0, 1));

  if (gifs.length === 0) {
    throw new Error('That link does not point at a GIF.');
  }

  const targetGif = gifs[0];

  // Try to look up the official content rating from Tenor's API
  let ratedPosts = [];
  try {
    ratedPosts = await fetchTenorApi('/posts', {
      ids: targetGif.id,
      contentfilter: 'off',
    });
  } catch {
    // If the API fails, we still return the GIF and let YouTube decide
  }

  const matchedPost = ratedPosts.find((post) => post && String(post.id) === targetGif.id);
  if (matchedPost) {
    if (!isRatedGOrUnrated(matchedPost)) {
      throw new Error(
        `YouTube only takes GIFs that Tenor rates G. This one is rated ${matchedPost.content_rating}.`
      );
    }
    targetGif.contentRating = matchedPost.content_rating;
  }

  return gifs;
}

// Helper for `resolveGifLinkOrId`: converts an ID or URL into a `https://tenor.com/view/...` URL
function buildTenorPageUrl(text) {
  // Case A: Bare numeric ID (e.g. "12345678")
  if (NUMERIC_ID_REGEX.test(text)) {
    return `${TENOR_ORIGIN}/view/x-gif-${text}`;
  }

  // Case B: Full or partial URL
  let parsedUrl;
  try {
    const urlWithProtocol = HAS_HTTP_PROTOCOL_REGEX.test(text) ? text : `https://${text}`;
    parsedUrl = new URL(urlWithProtocol);
  } catch {
    throw new Error('That is not a Tenor link.');
  }

  // Subcase B1: Direct image link (e.g. "https://media.tenor.com/abc123xyz.../tenor.gif")
  if (TENOR_MEDIA_HOST_REGEX.test(parsedUrl.hostname)) {
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    const mediaId = pathSegments.find((segment) => MEDIA_ID_SEGMENT_REGEX.test(segment));

    if (!mediaId) {
      throw new Error('That is not a Tenor GIF link.');
    }

    const numericGifId = decodeMediaIdToNumericId(mediaId);
    return `${TENOR_ORIGIN}/view/x-gif-${numericGifId}`;
  }

  // Subcase B2: Standard page link (e.g. "https://tenor.com/view/...")
  if (parsedUrl.hostname === 'tenor.com' || parsedUrl.hostname === 'www.tenor.com') {
    return `${TENOR_ORIGIN}${parsedUrl.pathname}`;
  }

  throw new Error('That is not a Tenor link.');
}

// 4. Look up a specific GIF by ID right before posting to verify its rating
async function checkGifRating(id) {
  const results = await fetchTenorApi('/posts', { ids: id, contentfilter: 'off' });
  const matchingPost = results.find((post) => post && String(post.id) === id);
  const formattedGif = matchingPost ? formatSingleGif(matchingPost) : null;

  return formattedGif ? [formattedGif] : [];
}

// Decodes a 16-character base64url media ID from `media.tenor.com` into a 64-bit numeric GIF ID
function decodeMediaIdToNumericId(mediaId) {
  // The first 11 base64url characters hold the 8-byte (64-bit) integer ID.
  // Convert URL-safe base64 ('-' and '_') back to standard base64 ('+' and '/')
  const base64IdPart = mediaId.slice(0, 11).replace(/-/g, '+').replace(/_/g, '/') + '=';
  const binaryBytes = atob(base64IdPart);

  // Combine the 8 raw bytes into a single 64-bit BigInt
  let numericId = 0n;
  for (let i = 0; i < 8; i++) {
    const byteValue = BigInt(binaryBytes.charCodeAt(i));
    numericId = (numericId << 8n) | byteValue;
  }

  return numericId.toString();
}