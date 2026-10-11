/**
 * In-app port of the YouTube Ad Remover extension.
 * WebView cannot load a Chrome extension, so the same two pieces run here:
 * player responses are stripped before YouTube reads them, and any ad that
 * still starts is muted, skipped, and hidden. Network blocks match rules.json
 * and only apply while the page itself is YouTube.
 */

const AD_HOST =
  /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com)$/i;

function hostOf(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  if (!match) {
    return '';
  }
  const authority = match[1];
  const hostPort = authority.includes('@') ? authority.slice(authority.lastIndexOf('@') + 1) : authority;
  return hostPort.replace(/:\d+$/, '').toLowerCase();
}

export function isYoutubePage(url: string): boolean {
  const host = hostOf(url);
  return (
    host === 'youtu.be' ||
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com')
  );
}

export function isYoutubeAdRequest(url: string): boolean {
  const value = url.toLowerCase();
  const host = hostOf(value);
  if (AD_HOST.test(host)) {
    return true;
  }
  return (
    value.includes('/pagead/') ||
    value.includes('/api/stats/ads') ||
    value.includes('/get_midroll') ||
    value.includes('/ptracking') ||
    value.includes('googleads.g.doubleclick.net')
  );
}

export function shouldBlockYoutubeAd(requestUrl: string, pageUrl: string): boolean {
  if (!requestUrl || !isYoutubeAdRequest(requestUrl)) {
    return false;
  }
  return isYoutubePage(pageUrl) || isYoutubePage(requestUrl);
}

export const YOUTUBE_AD_SCRIPT = `
(function () {
  if (window.__ytAdBlock) return;
  var host = String(location.hostname || '').toLowerCase();
  var onYoutube = host === 'youtu.be' || host === 'youtube.com' || host.indexOf('.youtube.com') === host.length - 12 || host === 'youtube-nocookie.com' || host.indexOf('.youtube-nocookie.com') === host.length - 21;
  if (!onYoutube) return;
  window.__ytAdBlock = true;

  function isAdUrl(url) {
    var value = String(url || '').toLowerCase();
    return value.indexOf('doubleclick.net') !== -1 ||
      value.indexOf('googlesyndication.com') !== -1 ||
      value.indexOf('googleadservices.com') !== -1 ||
      value.indexOf('/pagead/') !== -1 ||
      value.indexOf('/api/stats/ads') !== -1 ||
      value.indexOf('/get_midroll') !== -1 ||
      value.indexOf('/ptracking') !== -1;
  }

  try {
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (isAdUrl(url)) return Promise.reject(new Error('blocked'));
        return origFetch.apply(this, arguments);
      };
    }
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (isAdUrl(url)) this.__ytBlocked = true;
      return origOpen.apply(this, arguments);
    };
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      if (this.__ytBlocked) {
        try { this.abort(); } catch (e) {}
        return;
      }
      return origSend.apply(this, arguments);
    };
  } catch (e) {}

  var AD_KEYS = { adPlacements: 1, adSlots: 1, playerAds: 1, adBreakHeartbeatParams: 1 };
  var AD_TEXT = /"(?:adPlacements|adSlots|playerAds|adBreakHeartbeatParams)"/;
  function prune(node, depth) {
    if (!node || typeof node !== 'object' || depth > 12) return node;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) prune(node[i], depth + 1);
      return node;
    }
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (AD_KEYS[key]) delete node[key];
      else if (node[key] && typeof node[key] === 'object') prune(node[key], depth + 1);
    }
    return node;
  }
  var origParse = JSON.parse;
  JSON.parse = function (text) {
    var result = origParse.apply(this, arguments);
    return typeof text === 'string' && AD_TEXT.test(text) ? prune(result, 0) : result;
  };
  try {
    var origText = Response.prototype.text;
    Response.prototype.json = function () {
      return origText.call(this).then(function (text) { return JSON.parse(text); });
    };
  } catch (e) {}
  function trap(name) {
    var value;
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: function () { return value; },
        set: function (next) { value = prune(next, 0); }
      });
    } catch (e) {}
  }
  trap('ytInitialPlayerResponse');
  trap('playerResponse');

  var HIDE = [
    '#masthead-ad', '#player-ads', 'ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer',
    'ytd-display-ad-renderer', 'ytd-promoted-sparkles-web-renderer', 'ytd-promoted-sparkles-text-search-renderer',
    'ytd-promoted-video-renderer', 'ytd-compact-promoted-video-renderer', 'ytd-search-pyv-renderer',
    'ytd-banner-promo-renderer', 'ytd-statement-banner-renderer', 'ytd-primetime-promo-renderer',
    'ytd-brand-video-singleton-renderer', 'ytd-brand-video-shelf-renderer', 'ytd-companion-slot-renderer',
    'ytd-action-companion-ad-renderer', 'ytd-player-legacy-desktop-watch-ads-renderer', 'ytd-merch-shelf-renderer',
    '.ytd-merch-shelf-renderer', '.ytp-ad-overlay-container', '.ytp-ad-overlay-slot', '.ytp-ad-image-overlay',
    '.ytp-featured-product', '.ytp-suggested-action', '.ytp-ad-module', '.video-ads', 'ad-slot-renderer',
    'ytm-promoted-sparkles-web-renderer', 'ytm-companion-ad-renderer', 'ytm-promoted-video-renderer',
    'ytm-companion-slot-renderer'
  ];
  var SKIP = '.ytp-skip-ad-button,.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-ad-skip-button-slot button,.videoAdUiSkipButton,button[id^="skip-button"]';
  var adState = typeof WeakMap === 'function' ? new WeakMap() : null;

  function injectStyle() {
    if (document.getElementById('yt-ad-remover-style')) return;
    var style = document.createElement('style');
    style.id = 'yt-ad-remover-style';
    style.textContent = HIDE.map(function (selector) {
      return selector + '{display:none!important;}';
    }).join('');
    (document.head || document.documentElement).appendChild(style);
  }

  function pressButton(btn) {
    try {
      var rect = btn.getBoundingClientRect();
      var opts = { bubbles: true, cancelable: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0 };
      if (window.PointerEvent) btn.dispatchEvent(new PointerEvent('pointerdown', opts));
      btn.dispatchEvent(new MouseEvent('mousedown', opts));
      if (window.PointerEvent) btn.dispatchEvent(new PointerEvent('pointerup', opts));
      btn.dispatchEvent(new MouseEvent('mouseup', opts));
      btn.click();
    } catch (e) {}
  }

  function skipAd(player, video) {
    if (adState && !adState.has(video)) {
      adState.set(video, { muted: video.muted, rate: video.playbackRate || 1 });
    }
    video.muted = true;
    try { video.playbackRate = 16; } catch (e) {}
    if (isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.2) {
      try { video.currentTime = video.duration - 0.1; } catch (e) {}
    }
    if (video.paused) video.play().catch(function () {});
  }

  function restoreVideo(video) {
    if (!adState) return;
    var saved = adState.get(video);
    if (!saved) return;
    adState.delete(video);
    video.muted = saved.muted;
    try { video.playbackRate = saved.rate; } catch (e) {}
  }

  function tick() {
    var players = document.querySelectorAll('.html5-video-player');
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      var video = player.querySelector('video');
      if (!video) continue;
      if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) skipAd(player, video);
      else restoreVideo(video);
    }
    var skips = document.querySelectorAll(SKIP);
    for (var s = 0; s < skips.length; s++) pressButton(skips[s]);
    var overlays = document.querySelectorAll('.ytp-ad-overlay-close-button');
    for (var o = 0; o < overlays.length; o++) overlays[o].click();
    var message = document.querySelector('ytd-enforcement-message-view-model');
    if (message) {
      var dialog = message.closest ? message.closest('tp-yt-paper-dialog') : null;
      if (dialog) dialog.remove();
      var backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop');
      for (var b = 0; b < backdrops.length; b++) backdrops[b].remove();
      var movie = document.querySelector('#movie_player video');
      if (movie && movie.paused) movie.play().catch(function () {});
    }
  }

  function boot() {
    injectStyle();
    setInterval(tick, 250);
  }
  if (document.documentElement) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
true;
`;
