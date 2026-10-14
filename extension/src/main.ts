// @ts-nocheck
// Runs in the page's own JavaScript world. Wraps window.fetch so that a comment
// request whose text contains an armed marker is rewritten into a GIF comment.

(() => {
  // Prevent the script from loading twice in the same tab
  const LOADED_FLAG = Symbol.for('gcfy.hook');
  if (window[LOADED_FLAG]) return;
  window[LOADED_FLAG] = true;

  // ---------------------------------------------------------------------------
  // 1. CONSTANTS & REGEX PATTERNS (What those symbol strings mean)
  // ---------------------------------------------------------------------------

  // Matches any YouTube internal API URL: "/youtubei/v1/"
  const YOUTUBE_API_URL = /\/youtubei\/v1\//;

  // Matches comment or community post endpoints: "/youtubei/v1/comment/" or "/youtubei/v1/backstage/"
  const COMMENT_OR_POST_URL = /\/youtubei\/v1\/(comment|backstage)\//;

  // Matches ONLY new comments or replies (not edits or community posts):
  // "/youtubei/v1/comment/create_comment" or "/youtubei/v1/comment/create_comment_reply"
  // followed by either "?" (query string) or the end of the URL ("$").
  const CREATE_COMMENT_URL = /\/youtubei\/v1\/comment\/create_comment(_reply)?(\?|$)/;

  // Matches the secret marker inserted into the comment box: "[[gif:123456789:abc123xyz]]"
  // Group 1: (\d{1,20})       -> 1 to 20 digits (the Tenor GIF ID)
  // Group 2: ([a-z0-9]{8,32}) -> 8 to 32 lowercase letters/numbers (the security nonce)
  const GIF_MARKER_REGEX = /\[\[gif:(\d{1,20}):([a-z0-9]{8,32})\]\]/;

  // Matches a 1-to-20 digit number (Tenor ID)
  const VALID_ID_REGEX = /^\d{1,20}$/;

  // Matches an 8-to-32 character alphanumeric string (Nonce)
  const VALID_NONCE_REGEX = /^[a-z0-9]{8,32}$/;

  // How long an "armed" GIF request stays valid (3 minutes)
  const ARM_TTL_MS = 3 * 60 * 1000;

  // Wait times before retrying if YouTube temporarily blocks the request (1.5s, then 4s)
  const RETRY_DELAYS_MS = [1500, 4000];

  // Stores pending GIF posts: Map<nonce, { id, ratedG, expires }>
  const armedMarkers = new Map();

  // True if injected before YouTube's scripts loaded, or once we see YouTube use window.fetch
  let isHookLive = document.readyState === 'loading';

  // ---------------------------------------------------------------------------
  // 2. SMALL HELPER FUNCTIONS
  // ---------------------------------------------------------------------------

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function sendToContentScript(message) {
    window.postMessage({ gcfy: 'to-content', ...message }, location.origin);
  }

  // ---------------------------------------------------------------------------
  // 3. MESSAGING WITH CONTENT.JS (Arming & Disarming the GIF Marker)
  // ---------------------------------------------------------------------------

  function isFromSamePage(event) {
    return event.source === window && event.origin === location.origin;
  }

  function isValidArmRequest(msg) {
    if (!msg || typeof msg !== 'object') return false;
    if (msg.type !== 'arm') return false;
    if (typeof msg.id !== 'string' || !VALID_ID_REGEX.test(msg.id)) return false;
    if (typeof msg.nonce !== 'string' || !VALID_NONCE_REGEX.test(msg.nonce)) return false;
    return true;
  }

  function armMarker(msg) {
    if (!isHookLive) {
      sendToContentScript({ type: 'refused', nonce: msg.nonce });
      return;
    }

    armedMarkers.set(msg.nonce, {
      id: msg.id,
      ratedG: msg.ratedG === true,
      expires: Date.now() + ARM_TTL_MS,
    });

    sendToContentScript({ type: 'armed', nonce: msg.nonce });
  }

  function disarmMarker(msg) {
    armedMarkers.delete(msg.nonce);
  }

  function handlePageMessage(event) {
    if (!isFromSamePage(event)) return;

    const msg = event.data;
    if (!msg || msg.gcfy !== 'to-main') return;

    if (isValidArmRequest(msg)) {
      armMarker(msg);
    } else if (msg.type === 'disarm') {
      disarmMarker(msg);
    }
  }

  window.addEventListener('message', handlePageMessage);

  // ---------------------------------------------------------------------------
  // 4. INTERCEPTING WINDOW.FETCH
  // ---------------------------------------------------------------------------

  // Extracts and decompresses the JSON text from a fetch() request
  async function readRequestBody(input, init) {
    const isRequestObject = input instanceof Request;

    // Get headers from `init` if provided, otherwise from the `Request` object
    let rawHeaders = {};
    if (init && init.headers) {
      rawHeaders = init.headers;
    } else if (isRequestObject) {
      rawHeaders = input.headers;
    }
    const headers = new Headers(rawHeaders);

    // Read the body into an ArrayBuffer
    let buffer;
    if (init && init.body != null) {
      buffer = await new Response(init.body).arrayBuffer();
    } else if (isRequestObject) {
      buffer = await input.clone().arrayBuffer();
    } else {
      return null;
    }

    // YouTube often compresses (gzips) request bodies. If gzipped, decompress it first.
    const isGzipped = headers.get('content-encoding') === 'gzip';
    let text;
    if (isGzipped) {
      const decompressedStream = new Blob([buffer])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
      text = await new Response(decompressedStream).text();
    } else {
      text = new TextDecoder().decode(buffer);
    }

    return { headers, text };
  }

  const originalFetch = window.fetch;

  window.fetch = function (input, init) {
    let url = '';
    try {
      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof Request) {
        url = input.url;
      } else {
        url = String(input);
      }
    } catch {
      // Ignore URL parsing errors and pass through to originalFetch
    }

    // If we see a YouTube API call pass through our wrapper, we know the hook is working
    if (!isHookLive && YOUTUBE_API_URL.test(url)) {
      isHookLive = true;
    }

    // If this isn't a comment or post request, let YouTube's normal fetch handle it
    if (!COMMENT_OR_POST_URL.test(url)) {
      return originalFetch.apply(this, arguments);
    }

    return handleWatchedRequest.call(this, url, input, init, arguments);
  };

  // ---------------------------------------------------------------------------
  // 5. REWRITING THE COMMENT REQUEST TO INCLUDE THE GIF
  // ---------------------------------------------------------------------------

  async function handleWatchedRequest(url, input, init, originalArgs) {
    let parsedRequest = null;
    try {
      parsedRequest = await readRequestBody(input, init);
    } catch {
      // If we can't read the body, leave the request alone
    }

    // Check if the request body contains our [[gif:id:nonce]] marker
    const markerMatch = parsedRequest ? parsedRequest.text.match(GIF_MARKER_REGEX) : null;
    if (!markerMatch) {
      // No marker found: this is a normal comment, let it go through untouched
      return originalFetch.apply(this, originalArgs);
    }

    // Extract the matched parts from [[gif:id:nonce]]
    const [fullMarker, gifId, nonce] = markerMatch;
    const armedEntry = armedMarkers.get(nonce);
    armedMarkers.delete(nonce); // Use each nonce only once

    let bodyJson = null;
    try {
      bodyJson = JSON.parse(parsedRequest.text);
    } catch {
      // Handled by the validation check below
    }

    // Separate the user's typed comment text from our marker at the end
    const fullCommentText =
      bodyJson && typeof bodyJson.commentText === 'string'
        ? bodyJson.commentText.trim()
        : '';

    let userOwnText = null;
    if (fullCommentText.endsWith(fullMarker)) {
      userOwnText = fullCommentText.slice(0, -fullMarker.length).trim();
    }

    // Verify everything is legitimate before sending
    const isAllowedEndpoint = CREATE_COMMENT_URL.test(url);
    const hasNoExtraMarkers = userOwnText !== null && !GIF_MARKER_REGEX.test(userOwnText);
    const isArmedAndUnexpired =
      armedEntry && armedEntry.id === gifId && armedEntry.expires >= Date.now();

    const isValidGifRequest =
      Boolean(bodyJson) && isAllowedEndpoint && hasNoExtraMarkers && Boolean(isArmedAndUnexpired);

    if (!isValidGifRequest) {
      sendToContentScript({
        type: 'result',
        nonce,
        ok: false,
        error: 'This box cannot take a GIF, or the request expired. Nothing was posted.',
      });
      throw new TypeError('GIF comment marker blocked');
    }

    // Tell content.js we intercepted the comment and are sending it now
    sendToContentScript({ type: 'seen', nonce });

    // Replace the marker with the `tenorId` field that YouTube's backend expects
    if (userOwnText) {
      bodyJson.commentText = userOwnText;
    } else {
      delete bodyJson.commentText;
    }
    bodyJson.tenorId = gifId;

    // Since we modified the body as plain JSON text, remove the gzip header
    const headers = parsedRequest.headers;
    headers.delete('content-encoding');
    const newPayload = JSON.stringify(bodyJson);

    // Helper to send the modified request
    const sendModifiedRequest = () => {
      const updatedInit = { ...init, body: newPayload, headers };
      if (input instanceof Request) {
        return originalFetch.call(this, new Request(input, updatedInit));
      }
      return originalFetch.call(this, input, updatedInit);
    };

    // Send the request, retrying if YouTube temporarily blocks it
    const maxTries = RETRY_DELAYS_MS.length + 1;
    let response;
    let verdict;
    let attempt = 0;

    while (true) {
      attempt++;
      try {
        response = await sendModifiedRequest();
      } catch (networkError) {
        sendToContentScript({
          type: 'result',
          nonce,
          ok: false,
          error: 'The request could not be sent. Nothing was posted.',
        });
        throw networkError;
      }

      verdict = await judgeYouTubeResponse(response);

      // Only retry if the request was 'blocked', the GIF is rated G, and we have retries left
      const shouldRetry =
        verdict.kind === 'blocked' && armedEntry.ratedG && attempt < maxTries;

      if (!shouldRetry) {
        break;
      }

      sendToContentScript({ type: 'retrying', nonce, attempt: attempt + 1, tries: maxTries });
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }

    // Build a human-friendly error message if the post didn't succeed
    const errorMessage = buildErrorMessage(verdict, armedEntry.ratedG, maxTries);

    if (verdict.kind !== 'posted') {
      const isReply = /create_comment_reply(\?|$)/.test(url);
      console.warn(
        'Desktop GIFs: comment not confirmed',
        JSON.stringify({
          endpoint: isReply ? 'create_comment_reply' : 'create_comment',
          tenorId: gifId,
          ratedG: armedEntry.ratedG,
          hasText: Boolean(userOwnText),
          kind: verdict.kind,
          tries: attempt,
          httpStatus: verdict.httpStatus,
          apiStatus: verdict.apiStatus,
          actionStatus: verdict.actionStatus,
          message: verdict.message,
        })
      );
    }

    sendToContentScript({
      type: 'result',
      nonce,
      ok: verdict.kind === 'posted',
      error: errorMessage,
    });

    return response;
  }

  // ---------------------------------------------------------------------------
  // 6. PARSING YOUTUBE'S RESPONSE & BUILDING ERROR MESSAGES
  // ---------------------------------------------------------------------------

  function buildErrorMessage(verdict, isRatedG, maxTries) {
    if (verdict.kind === 'posted') {
      return null;
    }

    // Format HTTP & API status details, e.g. "HTTP 400, INVALID_ARGUMENT"
    let statusDetail = `HTTP ${verdict.httpStatus}`;
    if (verdict.apiStatus) {
      statusDetail += `, ${verdict.apiStatus}`;
    }

    // Ensure YouTube's message (if any) starts with a space and ends with punctuation
    let youtubeSaid = '';
    if (verdict.message) {
      const endsWithPunctuation = /[.!?]$/.test(verdict.message);
      youtubeSaid = endsWithPunctuation ? ` ${verdict.message}` : ` ${verdict.message}.`;
    }

    switch (verdict.kind) {
      case 'gif':
        if (verdict.message) {
          return `YouTube turned this GIF comment down:${youtubeSaid} Nothing was posted.`;
        }
        return 'YouTube does not accept this GIF. Try a different one. Nothing was posted.';

      case 'blocked':
        if (isRatedG) {
          return `YouTube is not taking GIF comments from desktop for your account or network right now (tried ${maxTries} times). The GIF is not the cause, so another one will not help. Try again later. Nothing was posted.`;
        }
        return 'YouTube turned this GIF comment down. Either Tenor does not rate the GIF G, or YouTube is not taking GIF comments from desktop for your account or network right now. Nothing was posted.';

      case 'rejected':
        return `YouTube rejected this GIF comment (${statusDetail}).${youtubeSaid} Nothing was posted.`;

      default:
        return `YouTube did not confirm this GIF comment (${statusDetail}).${youtubeSaid} Check the comments before trying again.`;
    }
  }

  // Extracts plain text from YouTube's various internal text objects
  function extractText(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (typeof value.content === 'string') return value.content;
    if (Array.isArray(value.runs)) {
      return value.runs
        .map((run) => (typeof run.text === 'string' ? run.text : ''))
        .join('');
    }
    return '';
  }

  // Recursively collects error messages from YouTube's `actions` array
  function collectErrorActions(actions) {
    if (!Array.isArray(actions)) return [];

    const results = [];
    for (const action of actions) {
      if (!action || typeof action !== 'object') continue;

      if (action.showErrorAction) {
        const errorObj = action.showErrorAction.errorMessage;
        const rendererText = extractText(errorObj?.messageRenderer?.text);
        const directText = extractText(errorObj);
        results.push(rendererText || directText);
      }

      // Check for nested commands inside commandExecutorCommand
      const nestedCommands = action.commandExecutorCommand?.commands;
      if (nestedCommands) {
        results.push(...collectErrorActions(nestedCommands));
      }
    }
    return results;
  }

  // Inspects YouTube's HTTP response and categorizes the outcome
  async function judgeYouTubeResponse(response) {
    let json = null;
    try {
      json = await response.clone().json();
    } catch {
      // Response wasn't JSON
    }

    const actionResult = json?.actionResult;
    const errors = json
      ? [
          ...collectErrorActions(json.actions),
          ...collectErrorActions(json.onResponseReceivedActions),
          ...collectErrorActions(json.onResponseReceivedEndpoints),
        ]
      : [];

    const apiStatus = typeof json?.error?.status === 'string' ? json.error.status : null;
    const actionStatus = typeof actionResult?.status === 'string' ? actionResult.status : null;

    // Combine any unique error messages YouTube returned
    const allMessages = [
      extractText(json?.error?.message),
      ...errors,
      extractText(actionResult?.feedbackText),
    ].filter(Boolean);
    const uniqueMessages = [...new Set(allMessages)];
    const message = uniqueMessages.join(' ');

    // Determine the result category
    let kind = 'uncertain';

    if (response.ok && actionStatus === 'STATUS_SUCCEEDED' && errors.length === 0) {
      kind = 'posted';
    } else if (response.status === 400 && apiStatus === 'INVALID_ARGUMENT') {
      kind = 'blocked';
    } else if (response.ok && !actionResult && errors.length > 0) {
      kind = 'gif';
    } else if (
      (response.status >= 400 && response.status < 500) ||
      errors.length > 0 ||
      actionStatus === 'STATUS_FAILED'
    ) {
      kind = 'rejected';
    }

    return {
      kind,
      httpStatus: response.status,
      apiStatus,
      actionStatus,
      message,
    };
  }
})();