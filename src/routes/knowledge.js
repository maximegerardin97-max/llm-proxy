import express from 'express';
import multer from 'multer';
import { SupabaseKnowledgeBase } from '../knowledge/SupabaseKnowledgeBase.js';

const router = express.Router();

// Configure multer for file uploads (no count limit, larger per-file size, high part limits)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
    parts: 10000, // total number of parts (fields + files)
    fields: 2000 // number of non-file fields
  }
});

// Initialize Supabase knowledge base
let knowledgeBase = null;

const initializeKnowledgeBase = (req) => {
  if (!knowledgeBase) {
    try {
      knowledgeBase = new SupabaseKnowledgeBase(req.app.locals.config);
    } catch (error) {
      console.error('Failed to initialize Supabase knowledge base:', error);
      throw error;
    }
  }
  return knowledgeBase;
};

// Get knowledge base stats
router.get('/stats', async (req, res) => {
  try {
    const kb = initializeKnowledgeBase(req);
    const stats = await kb.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search knowledge base
router.get('/search', async (req, res) => {
  try {
    const { q: query, limit = 10 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const kb = initializeKnowledgeBase(req);
    const results = await kb.searchDocuments(query, { limit: parseInt(limit) });
    res.json({ results, query, total: results.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all documents
router.get('/documents', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const kb = initializeKnowledgeBase(req);
    const documents = await kb.getAllDocuments({ limit: parseInt(limit) });
    res.json({ documents, total: documents.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific document
router.get('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const kb = initializeKnowledgeBase(req);
    const document = await kb.getDocument(id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({ document });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new document
router.post('/documents', async (req, res) => {
  try {
    const document = req.body;
    const kb = initializeKnowledgeBase(req);
    const newDocument = await kb.addDocument(document);
    res.json({ document: newDocument });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update document
router.put('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const kb = initializeKnowledgeBase(req);
    const updatedDocument = await kb.updateDocument(id, updates);
    res.json({ document: updatedDocument });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete document
router.delete('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const kb = initializeKnowledgeBase(req);
    await kb.deleteDocument(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Supabase connection
router.get('/test-connection', async (req, res) => {
  try {
    const kb = initializeKnowledgeBase(req);
    await kb.initialize();
    res.json({ 
      success: true, 
      message: 'Successfully connected to Supabase knowledge base',
      config: {
        url: req.app.locals.config.supabase.url,
        tableName: req.app.locals.config.supabase.tableName
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      config: {
        url: req.app.locals.config.supabase.url,
        tableName: req.app.locals.config.supabase.tableName
      }
    });
  }
});

// Upload files to Supabase storage (accept any number of files)
router.post('/upload', upload.any(), async (req, res) => {
  try {
    const { uploadType, flowName } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const kb = initializeKnowledgeBase(req);
    const uploadedFiles = [];

    for (const file of files) {
      try {
        let uploadPath;
        
        // Respect client-provided relative paths when present
        const hasRelativePath = file.originalname && file.originalname.includes('/');

        if (hasRelativePath) {
          uploadPath = file.originalname.replace(/^\/+/, '');
        } else {
          if (uploadType === 'handbook') {
            // Upload to handbooks folder
            uploadPath = `handbooks/${file.originalname}`;
          } else if (uploadType === 'flow') {
            // Upload to flow folder
            if (!flowName) {
              throw new Error('Flow name is required for flow uploads');
            }
            uploadPath = `${flowName}/${file.originalname}`;
          } else {
            throw new Error('Invalid upload type');
          }
        }

        // Upload to Supabase storage
        const { data, error } = await kb.client.storage
          .from(kb.storageBucket)
          .upload(uploadPath, file.buffer, {
            contentType: file.mimetype,
            upsert: true // Overwrite if exists
          });

        if (error) {
          throw new Error(`Failed to upload ${file.originalname}: ${error.message}`);
        }

        uploadedFiles.push({
          name: file.originalname,
          path: uploadPath,
          size: file.size,
          type: file.mimetype
        });

      } catch (error) {
        console.error(`Error uploading ${file.originalname}:`, error);
        // Continue with other files even if one fails
      }
    }

    res.json({
      success: true,
      uploadedCount: uploadedFiles.length,
      uploadedFiles: uploadedFiles,
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;
