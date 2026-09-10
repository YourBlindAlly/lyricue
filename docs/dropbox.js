// Shared Dropbox connection + API helper for LyriCue's web tools (the
// Lyric Editor and the Setlist Builder). Same App Key and scopes as the
// LyriCue phone app (src/cloud/dropbox/config.ts / dropboxAuth.ts), using
// the PKCE flow since these are pure client-side pages with no backend to
// hold a client secret — Dropbox's own recommended approach for this
// shape of app. Requires each page's exact URL to be added under this
// Dropbox app's OAuth 2 > Redirect URIs (a one-time setup step, same as
// the phone app's own redirect URI was added).
//
// Tokens are stored in localStorage under one shared key, so connecting
// on either page carries over to the other — no need to reconnect twice.
window.LyriCueDropbox = (function () {
  'use strict';

  var APP_KEY = '0iibd4asi022p7w';
  var REDIRECT_URI = window.location.origin + window.location.pathname;
  var TOKEN_KEY = 'lyricue_web_dropbox_tokens';
  var VERIFIER_KEY = 'lyricue_web_dropbox_verifier';

  function randomString(length) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    var randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    for (var i = 0; i < length; i++) out += chars[randomValues[i] % chars.length];
    return out;
  }

  function base64UrlEncode(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function sha256Base64Url(input) {
    var data = new TextEncoder().encode(input);
    return crypto.subtle.digest('SHA-256', data).then(base64UrlEncode);
  }

  function loadTokens() {
    try {
      var raw = localStorage.getItem(TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveTokens(tokens) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  }

  function isConnected() {
    return !!loadTokens();
  }

  function disconnect() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function startConnect() {
    var verifier = randomString(64);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    return sha256Base64Url(verifier).then(function (challenge) {
      var url =
        'https://www.dropbox.com/oauth2/authorize' +
        '?client_id=' + encodeURIComponent(APP_KEY) +
        '&response_type=code' +
        '&code_challenge=' + encodeURIComponent(challenge) +
        '&code_challenge_method=S256' +
        '&token_access_type=offline' +
        '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);
      window.location.href = url;
    });
  }

  function exchangeCodeForTokens(code) {
    var verifier = sessionStorage.getItem(VERIFIER_KEY);
    var body = new URLSearchParams({
      code: code,
      grant_type: 'authorization_code',
      client_id: APP_KEY,
      code_verifier: verifier || '',
      redirect_uri: REDIRECT_URI,
    });
    return fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).then(function (res) {
      if (!res.ok) throw new Error('Dropbox connect failed (' + res.status + ')');
      return res.json();
    }).then(function (data) {
      saveTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in - 60) * 1000,
      });
      sessionStorage.removeItem(VERIFIER_KEY);
    });
  }

  function refreshTokens(tokens) {
    var body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: APP_KEY,
    });
    return fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }).then(function (res) {
      if (!res.ok) throw new Error('Dropbox token refresh failed (' + res.status + ')');
      return res.json();
    }).then(function (data) {
      var updated = {
        accessToken: data.access_token,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + (data.expires_in - 60) * 1000,
      };
      saveTokens(updated);
      return updated;
    });
  }

  function getValidAccessToken() {
    var tokens = loadTokens();
    if (!tokens) return Promise.resolve(null);
    if (Date.now() < tokens.expiresAt) return Promise.resolve(tokens.accessToken);
    return refreshTokens(tokens).then(function (updated) { return updated.accessToken; }).catch(function () {
      disconnect();
      return null;
    });
  }

  /**
   * Completes an in-progress connect if the page was just redirected back
   * with an authorization code (checks window.location.search, cleans the
   * URL afterward). Call once on page load. Resolves true if a code was
   * present and handled (whether it succeeded or failed — check
   * isConnected() after), false if there was nothing to do.
   */
  function handleRedirectIfPresent(onStatus) {
    var params = new URLSearchParams(window.location.search);
    var code = params.get('code');
    if (!code) return Promise.resolve(false);
    if (onStatus) onStatus('Connecting to Dropbox…');
    return exchangeCodeForTokens(code)
      .then(function () {
        history.replaceState(null, '', REDIRECT_URI);
        if (onStatus) onStatus('Connected to Dropbox.');
        return true;
      })
      .catch(function (err) {
        if (onStatus) onStatus('Could not connect to Dropbox: ' + err.message);
        return true;
      });
  }

  function apiFetch(url, init) {
    return getValidAccessToken().then(function (token) {
      if (!token) throw new Error('Not connected to Dropbox.');
      return fetch(url, {
        method: 'POST',
        headers: Object.assign({ Authorization: 'Bearer ' + token }, (init && init.headers) || {}),
        body: init && init.body,
      });
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (body) {
          throw new Error('Dropbox request failed (' + res.status + '): ' + body);
        });
      }
      return res;
    });
  }

  /** Lists folders/files at `path` (''  for the root). A not-found folder resolves to an empty list, matching the phone app's own behavior (a folder Dropbox hasn't created yet, e.g. before the first setlist). */
  function listFolder(path) {
    return apiFetch('https://api.dropboxapi.com/2/files/list_folder', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path }),
    }).then(function (res) { return res.json(); })
      .then(function (data) {
        return data.entries.map(function (e) {
          return {
            name: e.name,
            path: e.path_lower,
            isFolder: e['.tag'] === 'folder',
          };
        });
      })
      .catch(function (err) {
        if (err.message.indexOf('path/not_found') !== -1) return [];
        throw err;
      });
  }

  function uploadFile(path, content, mode) {
    return apiFetch('https://content.dropboxapi.com/2/files/upload', {
      headers: {
        'Dropbox-API-Arg': JSON.stringify({ path: path, mode: mode || 'add', autorename: mode !== 'overwrite', mute: true }),
        'Content-Type': 'application/octet-stream',
      },
      body: content,
    }).then(function (res) { return res.json(); });
  }

  function downloadFile(path) {
    return apiFetch('https://content.dropboxapi.com/2/files/download', {
      headers: { 'Dropbox-API-Arg': JSON.stringify({ path: path }) },
    }).then(function (res) { return res.text(); });
  }

  function deleteFile(path) {
    return apiFetch('https://api.dropboxapi.com/2/files/delete_v2', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path }),
    }).then(function (res) { return res.json(); });
  }

  return {
    isConnected: isConnected,
    disconnect: disconnect,
    startConnect: startConnect,
    handleRedirectIfPresent: handleRedirectIfPresent,
    listFolder: listFolder,
    uploadFile: uploadFile,
    downloadFile: downloadFile,
    deleteFile: deleteFile,
  };
})();
