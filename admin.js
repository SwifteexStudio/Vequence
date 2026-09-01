// ============================================================
// VEQUENCE — Admin API (Vercel serverless function)
// ------------------------------------------------------------
// Every privileged action (granting/revoking admin, banning/
// unbanning a user, deleting any article) is executed HERE,
// server-side, using the Supabase service role key. The browser
// never sees that key. This route re-checks on every call that
// the caller is a signed-in, non-banned admin before doing
// anything — a client claiming "I'm an admin" is never trusted.
//
// Required Vercel environment variables (Project Settings → 
// Environment Variables — NOT prefixed with NEXT_PUBLIC_ / VITE_,
// so they stay server-only):
//   SUPABASE_URL               e.g. https://oezsicxbgrkeytlshodi.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  Project Settings → API → service_role key
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Identify the caller from their Supabase access token.
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Missing session token' });

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  const callerId = userData.user.id;

  // 2. Confirm the caller is an admin in good standing.
  const { data: callerProfile, error: callerErr } = await supabaseAdmin
    .from('users')
    .select('id, is_admin, is_banned')
    .eq('id', callerId)
    .single();

  if (callerErr || !callerProfile?.is_admin || callerProfile.is_banned) {
    return res.status(403).json({ error: 'Admin privileges required' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { action, targetUserId, articleId, reason } = body;

  try {
    switch (action) {
      // -------------------------------------------------------
      case 'grant_admin': {
        if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
        const { error } = await supabaseAdmin.from('users').update({ is_admin: true }).eq('id', targetUserId);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      // -------------------------------------------------------
      case 'revoke_admin': {
        if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
        if (targetUserId === callerId) {
          return res.status(400).json({ error: 'You cannot revoke your own admin access' });
        }
        const { error } = await supabaseAdmin.from('users').update({ is_admin: false }).eq('id', targetUserId);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      // -------------------------------------------------------
      case 'ban_user': {
        if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
        if (targetUserId === callerId) {
          return res.status(400).json({ error: 'You cannot ban yourself' });
        }
        // Actually blocks sign-in / token refresh at the Supabase Auth level.
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          ban_duration: '876000h' // ~100 years
        });
        if (authError) throw authError;

        const { error } = await supabaseAdmin
          .from('users')
          .update({ is_banned: true, banned_reason: reason || null, banned_at: new Date().toISOString() })
          .eq('id', targetUserId);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      // -------------------------------------------------------
      case 'unban_user': {
        if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          ban_duration: 'none'
        });
        if (authError) throw authError;

        const { error } = await supabaseAdmin
          .from('users')
          .update({ is_banned: false, banned_reason: null, banned_at: null })
          .eq('id', targetUserId);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      // -------------------------------------------------------
      case 'delete_article': {
        if (!articleId) return res.status(400).json({ error: 'articleId required' });

        const { data: article } = await supabaseAdmin
          .from('articles')
          .select('id')
          .eq('id', articleId)
          .maybeSingle();
        if (!article) return res.status(404).json({ error: 'Article not found' });

        // Clean up dependent rows first (FK order), then the article itself.
        await supabaseAdmin.from('sources').delete().eq('article_id', articleId);
        await supabaseAdmin.from('article_tags').delete().eq('article_id', articleId);
        await supabaseAdmin.from('likes').delete().eq('article_id', articleId);
        await supabaseAdmin.from('bookmarks').delete().eq('article_id', articleId);
        await supabaseAdmin.from('comments').delete().eq('article_id', articleId);
        const { error } = await supabaseAdmin.from('articles').delete().eq('id', articleId);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }

      // -------------------------------------------------------
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
