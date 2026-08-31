// ============================================================
// VEQUENCE — Shared application layer
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://oezsicxbgrkeytlshodi.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lenNpY3hiZ3JrZXl0bHNob2RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMDk0NDIsImV4cCI6MjEwMzY4NTQ0Mn0.NigZre0SWOczfQfRjMAOV_6HHLa-lJIcdgB-jjlDdJk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

export function readingTime(markdown) {
  const words = (markdown || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
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
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

export async function requireAuth(redirectTo = 'auth.html') {
  const session = await getSession();
  if (!session) {
    window.location.href = `${redirectTo}?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return null;
  }
  await ensureProfile(session);
  return session;
}

export async function signOut() {
  await supabase.auth.signOut();
  currentSession = null;
  currentProfile = null;
  window.location.href = 'index.html';
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
        <input type="text" name="q" placeholder="Search research and articles" value="${escapeHtml(qs('q') || '')}">
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

export const INTEREST_TOPICS = [
  'Neuroscience', 'Technology', 'Health', 'Economics',
  'Physics', 'Psychology', 'Climate', 'AI & ML'
];
