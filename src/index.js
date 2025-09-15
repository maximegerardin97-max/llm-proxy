import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import chatRoutes, { initializeAgent } from './routes/chat.js';
import settingsRoutes from './routes/settings.js';
import knowledgeRoutes from './routes/knowledge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Store config in app locals
app.locals.config = config;

// Initialize agent
initializeAgent(config);

// Routes
app.use('/api', chatRoutes);
app.use('/api', settingsRoutes);
app.use('/api/knowledge', knowledgeRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    providers: Object.keys(config.providers).filter(provider => {
      return config[provider]?.apiKey;
    })
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ 
    error: error.message || 'Internal server error',
    ...(config.nodeEnv === 'development' && { stack: error.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  console.log(`🚀 LLM Proxy server running on port ${PORT}`);
  console.log(`📚 Knowledge base path: ${config.knowledgeBase.path}`);
  console.log(`🤖 Available providers: ${Object.keys(config.providers).filter(provider => {
    return config[provider]?.apiKey;
  }).join(', ')}`);
  console.log(`🌐 Web interface: http://localhost:${PORT}`);
});

export default app;
