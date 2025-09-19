import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../db/supabase.js';
import { Agent } from '../agents/Agent.js';
import config from '../config/index.js';

const router = express.Router();

// Helper: check conversation ownership
async function ensureConversationOwnership(conversationId, userId) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select('id, user_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.user_id !== userId) {
    const err = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }
}

// List messages
router.get('/messages', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Database is not configured on the server' });
    const conversationId = req.query.conversation_id;
    if (!conversationId) return res.status(400).json({ error: 'conversation_id is required' });
    await ensureConversationOwnership(conversationId, req.user.id);

    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('id', { ascending: true });
    if (error) throw error;
    res.json({ messages: data || [] });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Add user message and trigger agent (non-streaming)
router.post('/messages', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Database is not configured on the server' });
    const { conversation_id, message, provider, model, temperature, maxTokens, source } = req.body || {};
    if (!conversation_id) return res.status(400).json({ error: 'conversation_id is required' });
    if (!message) return res.status(400).json({ error: 'message is required' });
    await ensureConversationOwnership(conversation_id, req.user.id);

    // Insert user message
    const userInsert = {
      conversation_id,
      user_id: req.user.id,
      role: 'user',
      content: { 
        type: Array.isArray(message) ? 'multimodal' : 'text', 
        value: message 
      },
      source: source || 'web',
      is_final: true,
    };
    const { error: insertErr } = await supabaseAdmin.from('messages').insert(userInsert);
    if (insertErr) throw insertErr;

    // Get system prompt and settings from app_settings table
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('app_settings')
      .select('system_prompt, provider, model')
      .eq('key', 'default')
      .single();
    
    const systemPrompt = settings?.system_prompt;
    const defaultProvider = settings?.provider;
    const defaultModel = settings?.model;
    
    if (!systemPrompt) {
      throw new Error('Design copilot system prompt not found in app_settings table');
    }
    
    // Use Agent with knowledge base integration (non-streaming)
    const agent = new Agent(config, systemPrompt);
    
    console.log('Using Agent with knowledge base for design analysis (non-streaming)');
    console.log('Message:', message);
    console.log('Settings:', { systemPrompt, defaultProvider, defaultModel });
    
    // Generate response using Agent
    const response = await agent.generateResponse(message, {
      provider: provider || defaultProvider,
      model: model || defaultModel,
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 1000
    });
    
    const assistantMessage = response.content || 'No response generated';
    
    console.log('Agent response:', assistantMessage);

    // Insert assistant message
    const assistantInsert = {
      conversation_id,
      user_id: req.user.id,
      role: 'assistant',
      content: { type: 'text', value: assistantMessage },
      source: 'agent',
      is_final: true,
    };
    const { data: inserted, error: insertErr2 } = await supabaseAdmin.from('messages').insert(assistantInsert).select('*').single();
    if (insertErr2) throw insertErr2;

    // Update conversation updated_at
    await supabaseAdmin.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation_id);

    res.json({ message: inserted });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;

// Streaming assistant response with near real-time persistence
router.post('/messages/stream', requireAuth, async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(500).json({ error: 'Database is not configured on the server' });
    const { conversation_id, message, provider, model, temperature, maxTokens, source } = req.body || {};
    if (!conversation_id) return res.status(400).json({ error: 'conversation_id is required' });
    if (!message) return res.status(400).json({ error: 'message is required' });
    await ensureConversationOwnership(conversation_id, req.user.id);

    // Insert user message first
    const userInsert = {
      conversation_id,
      user_id: req.user.id,
      role: 'user',
      content: { 
        type: Array.isArray(message) ? 'multimodal' : 'text', 
        value: message 
      },
      source: source || 'web',
      is_final: true,
    };
    const { error: insertErr } = await supabaseAdmin.from('messages').insert(userInsert);
    if (insertErr) throw insertErr;

    // Streaming setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Get system prompt and settings from app_settings table
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('app_settings')
      .select('system_prompt, provider, model')
      .eq('key', 'default')
      .single();
    
    const systemPrompt = settings?.system_prompt;
    const defaultProvider = settings?.provider;
    const defaultModel = settings?.model;
    
    if (!systemPrompt) {
      throw new Error('Design copilot system prompt not found in app_settings table');
    }
    
    // Use Agent with knowledge base integration
    const agent = new Agent(config, systemPrompt);
    
    console.log('Using Agent with knowledge base for design analysis');
    console.log('Message:', message);
    console.log('Settings:', { systemPrompt, defaultProvider, defaultModel });
    
    // Debug: Check if knowledge base is working
    console.log('Agent knowledge base type:', agent.knowledgeBase?.constructor?.name);
    console.log('Knowledge base config:', agent.config.knowledgeBase);
    
    // Generate streaming response using Agent
    const agentResponse = await agent.generateStreamResponse(message, {
      provider: provider || defaultProvider,
      model: model || defaultModel,
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 1000
    });
    
    const stream = agentResponse.stream;
    
    // Process streaming response from Agent
    let fullText = '';
    let chunkIndex = 0;

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          chunkIndex++;
          
          // Send chunk to client
          res.write(`data: ${JSON.stringify({ type: 'content', content: delta })}\n\n`);
          
          // Persist chunk to database
          const chunkInsert = {
            conversation_id,
            user_id: req.user.id,
            role: 'assistant',
            content: { 
              type: 'text', 
              value: delta 
            },
            chunk_index: chunkIndex,
            is_final: false,
            source: 'agent'
          };
          await supabaseAdmin.from('messages').insert(chunkInsert);
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', content: `Streaming error: ${error.message}` })}\n\n`);
      res.end();
      return;
    }

    // Send final message and persist
    if (fullText.trim()) {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      
      // Persist final assembled message
      const finalInsert = {
        conversation_id,
        user_id: req.user.id,
        role: 'assistant',
        content: { 
          type: 'text', 
          value: fullText 
        },
        is_final: true,
        source: 'agent'
      };
      await supabaseAdmin.from('messages').insert(finalInsert);
      
      console.log('Stream finished. Has content:', !!fullText, 'Assembled:', fullText);
    }

    res.end();
  } catch (err) {
    // In SSE, send error and end
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    } catch (_) {}
    res.end();
  }
});


