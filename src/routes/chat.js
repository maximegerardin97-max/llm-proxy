import express from 'express';
import multer from 'multer';
import { Agent } from '../agents/Agent.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';
import crypto from 'crypto';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['pdf', 'docx', 'txt', 'md', 'jpg', 'jpeg', 'png', 'gif', 'html'];
    const fileExt = file.originalname.split('.').pop().toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error(`File type .${fileExt} not allowed`), false);
    }
  }
});

// Initialize agent (this would typically be done in a more sophisticated way)
let agent = null;

export function initializeAgent(config) {
  agent = new Agent(config);
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      const val = decodeURIComponent(pair.slice(idx + 1).trim());
      cookies[key] = val;
    }
  });
  return cookies;
}

function getOrCreateSessionId(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  const headerId = req.header('X-Session-Id') || req.header('x-session-id');
  const bodyId = req.body?.sessionId;
  const queryId = req.query?.sessionId;
  const cookieId = cookies.sessionId;
  const incoming = headerId || bodyId || queryId || cookieId;
  if (incoming) return incoming;
  const newId = crypto.randomUUID();
  res.cookie('sessionId', newId, { httpOnly: false, sameSite: 'Lax' });
  return newId;
}

// Get available providers
router.get('/providers', (req, res) => {
  try {
    const providers = ProviderFactory.getAvailableProviders(req.app.locals.config);
    res.json({ providers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message, provider, model, temperature, maxTokens } = req.body;
    const sessionId = getOrCreateSessionId(req, res);
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!agent) {
      return res.status(500).json({ error: 'Agent not initialized' });
    }

    // Handle both text and multimodal messages
    let userMessage = message;
    if (Array.isArray(message)) {
      // Multimodal content - pass as is
      userMessage = message;
    } else if (typeof message === 'string') {
      // Text content - wrap in text format for consistency
      userMessage = [{ type: 'text', text: message }];
    }

    const response = await agent.generateResponse(userMessage, {
      provider,
      model,
      temperature,
      maxTokens,
      sessionId
    });

    res.json({ ...response, sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Streaming chat endpoint
router.post('/chat/stream', async (req, res) => {
  try {
    const { message, provider, model, temperature, maxTokens } = req.body;
    const sessionId = getOrCreateSessionId(req, res);
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!agent) {
      return res.status(500).json({ error: 'Agent not initialized' });
    }

    // Handle both text and multimodal messages
    let userMessage = message;
    if (Array.isArray(message)) {
      // Multimodal content - pass as is
      userMessage = message;
    } else if (typeof message === 'string') {
      // Text content - wrap in text format for consistency
      userMessage = [{ type: 'text', text: message }];
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { stream, relevantDocuments } = await agent.generateStreamResponse(userMessage, {
      provider,
      model,
      temperature,
      maxTokens,
      sessionId
    });

    // Send relevant documents first
    res.write(`data: ${JSON.stringify({ type: 'session', sessionId })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'documents', documents: relevantDocuments })}\n\n`);

    // Stream the response
    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
        res.write(`data: ${JSON.stringify({ type: 'content', content: chunk.choices[0].delta.content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload knowledge base file
router.post('/knowledge', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!agent) {
      return res.status(500).json({ error: 'Agent not initialized' });
    }

    const { description, tags } = req.body;
    const metadata = {
      description,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : []
    };

    const document = await agent.addKnowledge(req.file, metadata);
    res.json(document);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search knowledge base
router.get('/knowledge/search', async (req, res) => {
  try {
    const { q, limit } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    if (!agent) {
      return res.status(500).json({ error: 'Agent not initialized' });
    }

    const results = await agent.searchKnowledge(q, { limit: parseInt(limit) || 10 });
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all knowledge base documents
router.get('/knowledge', async (req, res) => {
  try {
    if (!agent) {
      return res.status(500).json({ error: 'Agent not initialized' });
    }

    const documents = await agent.getAllKnowledge();
    res.json({ documents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete knowledge base document
router.delete('/knowledge/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!agent) {
      return res.status(500).json({ error: 'Agent not initialized' });
    }

    await agent.deleteKnowledge(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get knowledge base stats
router.get('/knowledge/stats', async (req, res) => {
  try {
    if (!agent) {
      return res.status(500).json({ error: 'Agent not initialized' });
    }

    const stats = await agent.getKnowledgeStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Set system prompt
router.post('/system-prompt', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!agent) {
      return res.status(500).json({ error: 'Agent not initialized' });
    }

    agent.setSystemPrompt(prompt);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear conversation history
router.post('/clear-history', async (req, res) => {
  try {
    if (!agent) {
      return res.status(500).json({ error: 'Agent not initialized' });
    }

    const sessionId = req.body?.sessionId || req.header('X-Session-Id') || req.header('x-session-id');
    if (sessionId) {
      agent.clearHistoryForSession(sessionId);
    } else {
      agent.clearHistory();
    }
    res.json({ success: true, sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conversation history
router.get('/history', async (req, res) => {
  try {
    if (!agent) {
      return res.status(500).json({ error: 'Agent not initialized' });
    }

    const sessionId = req.query?.sessionId || req.header('X-Session-Id') || req.header('x-session-id');
    const history = sessionId ? agent.getHistoryForSession(sessionId) : agent.getHistory();
    res.json({ history, sessionId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
