import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../db/supabase.js';

const router = express.Router();

// List conversations for current user
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Database is not configured on the server' });
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json({ conversations: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create conversation
router.post('/conversations', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Database is not configured on the server' });
    const { title, page_name } = req.body || {};
    // Ensure profile exists (dev fallback convenience)
    await supabaseAdmin
      .from('profiles')
      .upsert({ id: req.user.id, email: req.user.email }, { onConflict: 'id' });
    const insert = {
      user_id: req.user.id,
      title: title || null,
      page_name: page_name || null,
    };
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .insert(insert)
      .select('*')
      .single();

    if (error) throw error;
    res.json({ conversation: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update conversation (rename title / set page_name)
router.put('/conversations/:id', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Database is not configured on the server' });
    const id = req.params.id;
    const { title, page_name } = req.body || {};

    // Ownership check
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('conversations')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing || existing.user_id !== req.user.id) return res.status(404).json({ error: 'Conversation not found' });

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update({
        ...(typeof title !== 'undefined' ? { title } : {}),
        ...(typeof page_name !== 'undefined' ? { page_name } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ conversation: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Archive/unarchive conversation
router.post('/conversations/:id/archive', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Database is not configured on the server' });
    const id = req.params.id;
    const { archived = true } = req.body || {};

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('conversations')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing || existing.user_id !== req.user.id) return res.status(404).json({ error: 'Conversation not found' });

    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update({ archived: !!archived, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ conversation: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete conversation (and cascading messages via FK)
router.delete('/conversations/:id', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Database is not configured on the server' });
    const id = req.params.id;

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('conversations')
      .select('id, user_id')
      .eq('id', id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing || existing.user_id !== req.user.id) return res.status(404).json({ error: 'Conversation not found' });

    const { error } = await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


