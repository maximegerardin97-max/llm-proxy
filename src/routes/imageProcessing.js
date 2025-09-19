import express from 'express';
import config from '../config/index.js';
import { SupabaseKnowledgeBase } from '../knowledge/SupabaseKnowledgeBase.js';

const router = express.Router();

// Initialize knowledge base for image processing
const knowledgeBase = new SupabaseKnowledgeBase(config);

// Process all images in the knowledge base
router.post('/process-images', async (req, res) => {
  try {
    const { batchSize = 5, startFrom = 0 } = req.body;
    
    console.log('🚀 Starting image processing...');
    const result = await knowledgeBase.processImages({ 
      batchSize: parseInt(batchSize),
      startFrom: parseInt(startFrom)
    });
    
    res.json({
      success: true,
      message: `Image processing completed`,
      processed: result.processed,
      total: result.total,
      remaining: result.total - result.processed
    });
  } catch (error) {
    console.error('Image processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Process a single image
router.post('/process-single', async (req, res) => {
  try {
    const { filePath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'filePath is required'
      });
    }
    
    console.log(`🔄 Processing single image: ${filePath}`);
    const result = await knowledgeBase.processSingleImage(filePath);
    
    res.json({
      success: true,
      message: 'Image processed successfully',
      data: result
    });
  } catch (error) {
    console.error('Single image processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get processing status
router.get('/image-status', async (req, res) => {
  try {
    const allFiles = await knowledgeBase.getAllFilesRecursively('');
    const imageFiles = allFiles.filter(file => 
      file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg')
    );
    
    // Check processed images
    const { data: processedImages, error } = await knowledgeBase.client
      .from('image_analysis')
      .select('file_path');
    
    if (error) {
      console.log('No processed images found, starting fresh');
      const processedCount = 0;
      const totalCount = imageFiles.length;
      const remainingCount = totalCount - processedCount;
      
      return res.json({
        success: true,
        total: totalCount,
        processed: processedCount,
        remaining: remainingCount,
        progress: 0
      });
    }
    
    const processedCount = processedImages?.length || 0;
    const totalCount = imageFiles.length;
    const remainingCount = totalCount - processedCount;
    
    res.json({
      success: true,
      total: totalCount,
      processed: processedCount,
      remaining: remainingCount,
      progress: totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test image analysis on a single image
router.post('/test-analysis', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'imageUrl is required'
      });
    }
    
    console.log('🧪 Testing image analysis...');
    const analysis = await knowledgeBase.imageAnalysis.analyzeImage(imageUrl, {
      extractUIElements: true,
      extractColors: true
    });
    
    res.json({
      success: true,
      analysis: analysis
    });
  } catch (error) {
    console.error('Test analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
