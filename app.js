// ============================================================
// VEQUENCE — Shared application layer
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://oezsicxbgrkeytlshodi.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lenNpY3hiZ3JrZXl0bHNob2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMDk0NDIsImV4cCI6MjEwMzY4NTQ0Mn0.NigZre0SWOczfQfRjMAOV_6HHLa-lJIcdgB-jjlDdJk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Synthetic email for helper accounts (no real inbox). Unique per username. */
export function helperEmail(username) {
  const u = String(username || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  return `vhelper+${u}@v.com`;
}

/**
 * Secondary auth client that does not touch the main session storage.
 * Used so admins can create helper accounts without being signed out.
 */
export function createEphemeralAuthClient() {
  const memory = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: memory,
      storageKey: 'vequence-ephemeral'
    }
  });
}

// ------------------------------------------------------------
// Theme
// ------------------------------------------------------------

export const THEMES = ['light', 'warm', 'dark'];

export function getTheme() {
  return localStorage.getItem('vequence-theme') || 'light';
}

export function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'light';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('vequence-theme', t);
}

// Apply immediately so pages don't flash
applyTheme(getTheme());

// ------------------------------------------------------------
// Toasts
// ------------------------------------------------------------

export function toast(message, type = 'info') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'error' ? ' error' : '');
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ------------------------------------------------------------
// Small utilities
// ------------------------------------------------------------

export function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Robust relative time — handles ISO strings, missing Z, and future skew */
export function timeAgo(dateStr) {
  if (!dateStr) return '';
  let d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';

  // If the string has no timezone and looks like Postgres-style, treat as UTC
  if (typeof dateStr === 'string' && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(dateStr.trim())) {
    const asUtc = new Date(dateStr.trim().replace(' ', 'T') + 'Z');
    if (!Number.isNaN(asUtc.getTime())) d = asUtc;
  }

  let seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 0) seconds = 0; // clock skew / future timestamps

  if (seconds < 45) return 'just now';
  if (seconds < 90) return '1 minute ago';

  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ];
  for (const [name, secs] of units) {
    const val = Math.floor(seconds / secs);
    if (val >= 1) return `${val} ${name}${val === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}

/**
 * Estimate reading time from markdown.
 * Strips syntax so code fences, links, images, and punctuation don't inflate the count.
 * Uses ~230 wpm (typical for online non-fiction) and always returns at least 1.
 */
/**
 * Count readable words in markdown (strips syntax so code/links/images
 * don't inflate the number). Used by readingTime and the editor hint.
 */
export function wordCount(markdown) {
  let text = String(markdown || '');
  // Fenced code blocks — readers usually skim
  text = text.replace(/```[\s\S]*?```/g, ' ');
  // Inline code
  text = text.replace(/`[^`]+`/g, ' ');
  // Images ![alt](url)
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ');
  // Links [label](url) → keep label only
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Footnote refs
  text = text.replace(/\[\^\d+\]/g, ' ');
  // Headings / emphasis / horizontal rules / list markers / blockquotes
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/(\*\*|__|\*|_|~~)/g, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  text = text.replace(/^>\s?/gm, '');
  text = text.replace(/^---+$/gm, ' ');
  // HTML tags if any
  text = text.replace(/<[^>]+>/g, ' ');
  // Collapse whitespace
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * Estimate reading time from markdown.
 * ~230 wpm for research-style online non-fiction; always at least 1.
 */
export function readingTime(markdown) {
  const words = wordCount(markdown);
  if (words === 0) return 1;
  return Math.max(1, Math.round(words / 230));
}

/** Human-friendly label, e.g. "1 min read" or "12 min read" */
export function readingTimeLabel(minutes) {
  const m = Math.max(1, Math.round(Number(minutes) || 1));
  return m === 1 ? '1 min read' : `${m} min read`;
}

/**
 * Resolve minutes for an article object: prefer live estimate from body
 * markdown when available, otherwise fall back to stored column.
 */
export function articleReadingMinutes(article) {
  if (!article) return 1;
  const md = article.content?.markdown || article.content?.body || '';
  if (md && String(md).trim()) return readingTime(md);
  return Math.max(1, Number(article.reading_time_minutes) || 1);
}

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
}

export function avatarHtml(user, size) {
  const style = size ? ` style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.37)}px"` : '';
  if (user?.avatar_url) {
    return `<img class="avatar" src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.display_name || user.username || '')}"${style}>`;
  }
  const label = user?.display_name || user?.username || '';
  return `<span class="avatar"${style}>${escapeHtml(initials(label))}</span>`;
}

export function qs(params) {
  const url = new URL(window.location.href);
  if (params) return url.searchParams.get(params);
  return url.searchParams;
}

/**
 * Sanitize a "next" redirect target.
 * Only allow same-origin relative paths (no protocol, no //, no javascript:).
 * Falls back to a safe default when the value is missing or unsafe.
 */
export function safeNextUrl(fallback = 'index.html') {
  const params = new URLSearchParams(window.location.search);
  let next = params.get('next') || '';
  try {
    // If someone passed a full URL, keep only path + search + hash on our origin
    if (/^https?:\/\//i.test(next) || next.startsWith('//')) {
      const u = new URL(next, window.location.origin);
      if (u.origin !== window.location.origin) return fallback;
      next = u.pathname + u.search + u.hash;
    }
  } catch (_) {
    return fallback;
  }
  // Must be a relative path starting with / or a plain filename
  if (!next || next.includes('://') || next.startsWith('//') || /^javascript:/i.test(next)) {
    return fallback;
  }
  // Normalize: allow "index.html", "/index.html", "article.html?slug=x"
  if (next.startsWith('/')) next = next.slice(1);
  // Block path traversal
  if (next.includes('..')) return fallback;
  return next || fallback;
}

/** Build a safe auth redirect URL that returns the user here after login. */
export function authRedirectUrl(authPage = 'auth.html') {
  const here = window.location.pathname.split('/').pop() || 'index.html';
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  const next = encodeURIComponent(here + search + hash);
  return `${authPage}?next=${next}`;
}

/** Format a tag: strip #, title-case words, keep lowercase slug storage optional */
export function formatTagLabel(raw) {
  let t = (raw || '').trim().replace(/^#+/, '');
  if (!t) return '';
  // Title-case each word/segment
  t = t.split(/[\s_-]+/).filter(Boolean).map(w =>
    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join(' ');
  return t;
}

export function formatTagSlug(raw) {
  return slugify(formatTagLabel(raw)).replace(/-/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
}

// ------------------------------------------------------------
// Markdown renderer
// ------------------------------------------------------------

export function renderMarkdown(md) {
  if (!md) return '';
  let src = md.replace(/\r\n/g, '\n');

  const blocks = [];
  src = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = blocks.length;
    blocks.push(`<pre><code${lang ? ` class="lang-${escapeHtml(lang)}"` : ''}>${escapeHtml(code.trim())}</code></pre>`);
    return `\u0000BLOCK${idx}\u0000`;
  });

  const lines = src.split('\n');
  let html = '';
  let inList = null;
  let inQuote = false;

  const closeList = () => { if (inList) { html += `</${inList}>`; inList = null; } };
  const closeQuote = () => { if (inQuote) { html += `</blockquote>`; inQuote = false; } };

  const inline = (text) => {
    let t = escapeHtml(text);
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, alt, url, caption) => caption
        ? `<figure><img src="${url}" alt="${alt}"><figcaption>${caption}</figcaption></figure>`
        : `<img src="${url}" alt="${alt}">`);
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/\[\^(\d+)\]/g, '<sup class="citation-ref"><a href="#source-$1">$1</a></sup>');
    t = t.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    return t;
  };

  for (let raw of lines) {
    const line = raw;

    if (/^\u0000BLOCK\d+\u0000$/.test(line.trim())) {
      closeList(); closeQuote();
      const idx = line.trim().match(/\d+/)[0];
      html += blocks[idx];
      continue;
    }

    if (/^\s*$/.test(line)) { closeList(); closeQuote(); continue; }

    if (/^---+$/.test(line.trim())) { closeList(); closeQuote(); html += '<hr>'; continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList(); closeQuote();
      const level = h[1].length + 1;
      const tag = level === 2 ? 'h2' : 'h3';
      html += `<${tag}>${inline(h[2])}</${tag}>`;
      continue;
    }

    if (/^>\s?/.test(line)) {
      if (!inQuote) { closeList(); html += '<blockquote>'; inQuote = true; }
      html += `<p>${inline(line.replace(/^>\s?/, ''))}</p>`;
      continue;
    }
    closeQuote();

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul) {
      if (inList !== 'ul') { closeList(); html += '<ul>'; inList = 'ul'; }
      html += `<li>${inline(ul[1])}</li>`;
      continue;
    }
    if (ol) {
      if (inList !== 'ol') { closeList(); html += '<ol>'; inList = 'ol'; }
      html += `<li>${inline(ol[1])}</li>`;
      continue;
    }
    closeList();

    html += `<p>${inline(line)}</p>`;
  }
  closeList(); closeQuote();
  return html;
}

// ------------------------------------------------------------
// Auth state + header
// ------------------------------------------------------------

let currentSession = null;
let currentProfile = null;

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  currentSession = data.session;
  return currentSession;
}

function isPlaceholderProfile(profile) {
  if (!profile) return true;
  const uname = (profile.username || '').toLowerCase();
  const dname = (profile.display_name || '').trim();
  return (
    uname.startsWith('user_') ||
    !uname ||
    uname.length < 3 ||
    dname === 'User' ||
    dname === ''
  );
}

export async function ensureProfile(session) {
  if (!session?.user) return null;

  let user = session.user;
  try {
    const { data: gu } = await supabase.auth.getUser();
    if (gu?.user) user = gu.user;
  } catch (_) {}

  const meta = user.user_metadata || {};
  const metaUsername = (meta.username || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  const metaDisplay = (meta.display_name || meta.full_name || meta.name || meta.username || '').trim();

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existing && !isPlaceholderProfile(existing)) {
    currentProfile = existing;
    return existing;
  }

  let username = metaUsername;
  if (!username || username.length < 3) {
    const emailLocal = (user.email || '').split('@')[0] || '';
    const cleaned = emailLocal.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
    username = cleaned.length >= 3 ? cleaned : ('user_' + user.id.replace(/-/g, '').slice(0, 8));
  }

  const { data: taken } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (taken && taken.id !== user.id) {
    username = username.slice(0, 20) + '_' + user.id.replace(/-/g, '').slice(0, 6);
  }

  let display_name = metaDisplay;
  if (!display_name || display_name === 'User') {
    display_name = username.startsWith('user_') ? (user.email || 'Member') : username;
  }

  const payload = { id: user.id, username, display_name };
  if (existing?.avatar_url) payload.avatar_url = existing.avatar_url;
  if (existing?.bio) payload.bio = existing.bio;

  const { data: saved, error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    console.warn('ensureProfile failed:', error.message);
    currentProfile = existing || { id: user.id, username, display_name, avatar_url: null, bio: null };
    return currentProfile;
  }

  currentProfile = saved;
  return saved;
}


export function adminBadgeHtml(profile) {
  return profile?.is_admin ? '<span class="admin-badge" title="Vequence administrator">ADMIN</span>' : '';
}

export async function getCurrentProfile() {
  const session = await getSession();
  if (!session) {
    currentProfile = null;
    return null;
  }
  if (currentProfile && currentProfile.id === session.user.id) return currentProfile;
  return await ensureProfile(session);
}

export async function isAdmin() {
  const session = await getSession();
  if (!session) return false;
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

export async function requireAdmin(redirectTo = 'auth.html') {
  const session = await requireAuth(redirectTo);
  if (!session) return null;
  const admin = await isAdmin();
  if (!admin) {
    window.location.replace('index.html');
    return null;
  }
  return session;
}

export async function requireAuth(redirectTo = 'auth.html') {
  const session = await getSession();
  if (!session) {
    // Use replace so the login page does not leave a back-stack entry to a gated page
    const here = (window.location.pathname.split('/').pop() || 'index.html') + (window.location.search || '') + (window.location.hash || '');
    window.location.replace(`${redirectTo}?next=${encodeURIComponent(here)}`);
    return null;
  }
  await ensureProfile(session);
  return session;
}

export async function signOut() {
  await supabase.auth.signOut();
  currentSession = null;
  currentProfile = null;
  window.location.replace('index.html');
}

function settingsIcon() {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
}

export async function initHeader(activeLink) {
  const mount = document.getElementById('site-header');
  if (!mount) return;
  mount.classList.add('site-header');

  const session = await getSession();
  const profile = session ? await getCurrentProfile() : null;

  // Order: [avatar] Discover Write · Settings  (or Sign in when logged out)
  mount.innerHTML = `
    <div class="shell">
      <a href="index.html" class="wordmark">Ve<span>quence</span></a>
      <form class="header-search" action="index.html" method="get">
        <input type="text" name="q" placeholder="Search articles and people" value="${escapeHtml(qs('q') || '')}">
      </form>
      <nav class="header-nav">
        ${session ? `
          <div class="header-user">
            <button class="header-user-btn" id="user-menu-btn" title="Account">
              ${avatarHtml(profile)}
            </button>
            <div class="header-dropdown" id="user-dropdown">
              <a href="profile.html?u=${encodeURIComponent(profile?.username || '')}">Your profile</a>
              <a href="editor.html">Write an article</a>
              <a href="settings.html">Settings</a>
              ${profile?.is_admin ? '<a href="admin.html" class="admin-menu-link">Admin</a>' : ''}
              <button id="logout-btn">Sign out</button>
            </div>
          </div>
        ` : ''}
        <a href="index.html" class="nav-link ${activeLink === 'discover' ? 'active' : ''}">Discover</a>
        ${session
          ? `<a href="editor.html" class="nav-link ${activeLink === 'write' ? 'active' : ''}">Write</a>
             <a href="settings.html" class="nav-link nav-icon-link ${activeLink === 'settings' ? 'active' : ''}" title="Settings">${settingsIcon()}</a>`
          : `<a href="auth.html" class="btn btn-outline btn-sm">Sign in</a>`}
      </nav>
    </div>
  `;

  const btn = document.getElementById('user-menu-btn');
  const dd = document.getElementById('user-dropdown');
  if (btn && dd) {
    btn.addEventListener('click', (e) => { e.stopPropagation(); dd.classList.toggle('open'); });
    document.addEventListener('click', () => dd.classList.remove('open'));
  }
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', signOut);

  return { session, profile };
}

export function initFooter() {
  const mount = document.getElementById('site-footer');
  if (!mount) return;
  mount.innerHTML = `
    <div class="shell site-footer">
      <span>© 2026 Vequence. All rights reserved.</span>
    </div>
  `;
}


// ------------------------------------------------------------
// Language detection + auto-translate to English (on publish)
// Uses MyMemory free API (no key). Markdown structure is preserved:
// code fences are left untouched; other blocks are translated.
// ------------------------------------------------------------

const TRANSLATE_ENDPOINT = 'https://api.mymemory.translated.net/get';

function sampleForLanguageDetect(text) {
  const cleaned = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/[#>*_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 400);
}

/**
 * Detect language code for a text sample.
 * Returns 'en' when unsure or on failure (fail-open so publish is never blocked).
 */
export async function detectLanguage(text) {
  const sample = sampleForLanguageDetect(text);
  if (!sample || sample.length < 12) return 'en';

  const cjk = (sample.match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/g) || []).length;
  const cyr = (sample.match(/[\u0400-\u04FF]/g) || []).length;
  const arab = (sample.match(/[\u0600-\u06FF]/g) || []).length;
  const letters = (sample.match(/\p{L}/gu) || []).length || 1;
  if (cjk / letters > 0.25) return 'zh';
  if (cyr / letters > 0.25) return 'ru';
  if (arab / letters > 0.25) return 'ar';

  try {
    const url = TRANSLATE_ENDPOINT + '?q=' + encodeURIComponent(sample) + '&langpair=aut|en';
    const res = await fetch(url);
    if (!res.ok) return 'en';
    const data = await res.json();
    let detected =
      (data && data.responseData && data.responseData.detectedLanguage) ||
      (data && data.matches && data.matches[0] && data.matches[0].source) ||
      null;
    // Some responses nest differently
    if (!detected && data && data.responseData && typeof data.responseData.translatedText === 'string') {
      // If aut|en and text barely changed + high match, treat as English later
    }
    let code = String(detected || '').toLowerCase().split(/[-_]/)[0];
    if (!/^[a-z]{2,3}$/.test(code)) {
      // Fallback: if translation is nearly identical, assume English
      const translated = (data && data.responseData && data.responseData.translatedText) || '';
      if (translated && translated.trim().toLowerCase() === sample.trim().toLowerCase()) return 'en';
      code = 'en';
    }
    return code;
  } catch (_) {
    return 'en';
  }
}

async function translatePlainChunk(text, sourceLang) {
  const q = String(text || '');
  if (!q.trim()) return q;
  try {
    const url =
      TRANSLATE_ENDPOINT +
      '?q=' + encodeURIComponent(q.slice(0, 450)) +
      '&langpair=' + encodeURIComponent(sourceLang + '|en');
    const res = await fetch(url);
    if (!res.ok) return q;
    const data = await res.json();
    const out = data && data.responseData && data.responseData.translatedText;
    if (!out || /INVALID SOURCE LANGUAGE|QUERY LENGTH LIMIT/i.test(out)) return q;
    return out;
  } catch (_) {
    return q;
  }
}

/** Split long plain text into ~400 char chunks on whitespace/sentence boundaries. */
function chunkText(text, maxLen = 400) {
  const s = String(text || '');
  if (s.length <= maxLen) return [s];
  const parts = [];
  let rest = s;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf(' ', maxLen);
    if (cut < maxLen * 0.5) cut = maxLen;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function translateTextToEnglish(text, sourceLang = 'aut') {
  const chunks = chunkText(text, 400);
  const out = [];
  for (const c of chunks) {
    out.push(await translatePlainChunk(c, sourceLang === 'en' ? 'aut' : sourceLang));
  }
  return out.join(' ');
}

/**
 * Translate markdown to English while preserving fenced code blocks.
 * Other segments are translated as plain text (headings markers kept lightly).
 */
export async function translateMarkdownToEnglish(markdown, sourceLang = 'aut') {
  const src = String(markdown || '');
  if (!src.trim()) return src;

  const parts = [];
  const re = /```[\s\S]*?```/g;
  let last = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: src.slice(last, m.index) });
    parts.push({ type: 'code', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ type: 'text', value: src.slice(last) });

  const out = [];
  for (const p of parts) {
    if (p.type === 'code') {
      out.push(p.value);
      continue;
    }
    // Translate paragraph-ish slices to keep structure
    const blocks = p.value.split(/(\n{2,})/);
    for (const block of blocks) {
      if (/^\n+$/.test(block) || !block.trim()) {
        out.push(block);
        continue;
      }
      // Keep pure markdown-only lines (hr, empty headings) as-is
      if (/^\s*(---+|\*\s*\*\s*\*)\s*$/.test(block)) {
        out.push(block);
        continue;
      }
      const translated = await translateTextToEnglish(block, sourceLang);
      out.push(translated);
    }
  }
  return out.join('');
}

/**
 * If the article is not English, translate title/subtitle/body/evidence to English.
 * Returns { title, subtitle, markdown, evidenceSummary, translated, sourceLang }.
 * Fail-open: on errors, returns originals with translated:false.
 */
export async function ensureEnglishArticle({ title, subtitle, markdown, evidenceSummary }) {
  const probe = [title, subtitle, markdown].filter(Boolean).join('\n\n');
  let sourceLang = 'en';
  try {
    sourceLang = await detectLanguage(probe);
  } catch (_) {
    sourceLang = 'en';
  }

  if (!sourceLang || sourceLang === 'en') {
    return { title, subtitle, markdown, evidenceSummary, translated: false, sourceLang: 'en' };
  }

  try {
    const [tTitle, tSub, tMd, tEv] = await Promise.all([
      title ? translateTextToEnglish(title, sourceLang) : Promise.resolve(title),
      subtitle ? translateTextToEnglish(subtitle, sourceLang) : Promise.resolve(subtitle),
      markdown ? translateMarkdownToEnglish(markdown, sourceLang) : Promise.resolve(markdown),
      evidenceSummary ? translateTextToEnglish(evidenceSummary, sourceLang) : Promise.resolve(evidenceSummary)
    ]);
    return {
      title: tTitle || title,
      subtitle: tSub || subtitle,
      markdown: tMd || markdown,
      evidenceSummary: tEv || evidenceSummary,
      translated: true,
      sourceLang
    };
  } catch (_) {
    return { title, subtitle, markdown, evidenceSummary, translated: false, sourceLang };
  }
}

export const INTEREST_TOPICS = [
  'Neuroscience', 'Technology', 'Health', 'Economics',
  'Physics', 'Psychology', 'Climate', 'AI & ML'
];
