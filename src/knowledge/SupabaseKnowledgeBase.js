import { createClient } from '@supabase/supabase-js';
import { ImageAnalysisService } from '../services/ImageAnalysisService.js';

export class SupabaseKnowledgeBase {
  constructor(config) {
    this.config = config;
    this.supabaseUrl = config.supabase?.url;
    this.supabaseKey = config.supabase?.serviceRoleKey || config.supabase?.anonKey;
    this.tableName = config.supabase?.tableName || 'flows';
    this.storageBucket = config.supabase?.storageBucket || 'flows';
    
    if (!this.supabaseUrl || !this.supabaseKey) {
      throw new Error('Supabase URL and key are required');
    }
    
    // Only create client if we have valid URL and key
    if (this.supabaseUrl && this.supabaseKey && this.supabaseUrl.startsWith('http')) {
      this.client = createClient(this.supabaseUrl, this.supabaseKey);
    } else {
      throw new Error('Invalid Supabase configuration');
    }
    
    // Initialize image analysis service
    this.imageAnalysis = new ImageAnalysisService(config);
  }

  async initialize() {
    try {
      console.log('🔧 Initializing Supabase knowledge base...');
      console.log('🔧 URL:', this.supabaseUrl);
      console.log('🔧 Key (first 20 chars):', this.supabaseKey?.substring(0, 20) + '...');
      console.log('🔧 Table:', this.tableName);
      console.log('🔧 Bucket:', this.storageBucket);
      
      // Test connection
      const { data, error } = await this.client
        .from(this.tableName)
        .select('count', { count: 'exact', head: true });
      
      if (error) {
        console.error('❌ Supabase table connection failed:', error);
        throw new Error(`Supabase connection failed: ${error.message}`);
      }
      
      console.log(`✅ Connected to Supabase table. Found ${data?.length || 0} screens in knowledge base.`);
      
      // Test storage connection
      console.log('🔧 Testing storage connection...');
      const { data: storageData, error: storageError } = await this.client.storage
        .from(this.storageBucket)
        .list('', { limit: 1 });
      
      if (storageError) {
        console.error('❌ Supabase storage connection failed:', storageError);
        throw new Error(`Supabase storage connection failed: ${storageError.message}`);
      }
      
      console.log(`✅ Connected to Supabase storage. Found ${storageData?.length || 0} items in root folder.`);
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Supabase knowledge base:', error);
      throw error;
    }
  }

  async searchDocuments(query, options = {}) {
    try {
      console.log('🔍 Supabase search starting for query:', query);
      console.log('🔍 Using bucket:', this.storageBucket);
      console.log('🔍 Using URL:', this.supabaseUrl);
      
      // First, try to search in image analysis metadata
      const analysisResults = await this.searchImageAnalysis(query, options);
      if (analysisResults.length > 0) {
        console.log('🎯 Found', analysisResults.length, 'matches from image analysis');
        return analysisResults;
      }
      
      // Fallback to filename/path search
      console.log('📁 Falling back to filename search...');
      const allFiles = await this.getAllFilesRecursively('');
      console.log('📁 Total files found:', allFiles.length);
      
      // Filter files that match the query
      const searchTerms = query.toLowerCase().split(' ');
      const matchingFiles = allFiles.filter(file => {
        const fileName = file.name.toLowerCase();
        const fullPath = file.fullPath.toLowerCase();
        const matches = searchTerms.some(term => fileName.includes(term) || fullPath.includes(term));
        if (matches) {
          console.log('✅ Match found:', file.name, 'in path:', file.fullPath);
        }
        return matches;
      });

      console.log('🎯 Matching files:', matchingFiles.length);

      // Transform to expected format
      const results = matchingFiles.map(file => ({
        id: file.id || file.fullPath,
        filename: file.name,
        type: file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg') ? 'image' : 'file',
        title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
        description: `File from ${file.fullPath.split('/')[0]} flow`,
        content: file.name,
        text: file.name,
        url: `${this.supabaseUrl}/storage/v1/object/public/${this.storageBucket}/${file.fullPath}`,
        image_url: file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg') 
          ? `${this.supabaseUrl}/storage/v1/object/public/${this.storageBucket}/${file.fullPath}` 
          : null,
        created_at: file.created_at,
        updated_at: file.updated_at,
        metadata: {
          size: file.metadata?.size,
          mimetype: file.metadata?.mimetype,
          flow: file.fullPath.split('/')[0] // Extract flow name from path
        },
        score: 1,
        relevance: 1
      }));

      // Apply limit
      return results.slice(0, options.limit || 10);
    } catch (error) {
      console.error('Supabase search error:', error);
      return [];
    }
  }

  /**
   * Search using image analysis metadata
   */
  async searchImageAnalysis(query, options = {}) {
    try {
      // Search in image_analysis table for matching content
      const { data, error } = await this.client
        .from('image_analysis')
        .select(`
          *,
          files:file_path
        `)
        .or(`text.ilike.%${query}%,description.ilike.%${query}%,ui_elements.ilike.%${query}%`)
        .limit(options.limit || 10);

      if (error) {
        console.log('No image analysis data found, using filename search');
        return [];
      }

      return data.map(item => ({
        id: item.id,
        filename: item.filename,
        type: 'image',
        title: item.filename.replace(/\.[^/.]+$/, ''),
        description: item.description || `Analyzed image from ${item.flow}`,
        content: item.text || '',
        text: item.text || '',
        url: `${this.supabaseUrl}/storage/v1/object/public/${this.storageBucket}/${item.file_path}`,
        image_url: `${this.supabaseUrl}/storage/v1/object/public/${this.storageBucket}/${item.file_path}`,
        created_at: item.created_at,
        updated_at: item.updated_at,
        metadata: {
          analysis: {
            text: item.text,
            description: item.description,
            uiElements: item.ui_elements,
            colors: item.colors,
            flow: item.flow
          }
        },
        score: 1,
        relevance: 1
      }));
    } catch (error) {
      console.error('Image analysis search error:', error);
      return [];
    }
  }

  async getAllFilesRecursively(folderPath = '') {
    const allFiles = [];
    
    try {
      console.log(`🔍 Listing folder: "${folderPath}" in bucket: "${this.storageBucket}"`);
      
      const { data: items, error } = await this.client.storage
        .from(this.storageBucket)
        .list(folderPath, { limit: 1000 });

      if (error) {
        console.error(`❌ Error listing folder ${folderPath}:`, error);
        console.error(`❌ Error details:`, JSON.stringify(error, null, 2));
        return allFiles;
      }

      console.log(`📁 Found ${items?.length || 0} items in folder: "${folderPath}"`);
      if (items && items.length > 0) {
        console.log(`📄 Items:`, items.map(item => item.name));
      }
      
      if (items) {
        for (const item of items) {
          const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name;
          
          // Check if it's a file by looking for file extensions or metadata
          const isFile = item.metadata?.mimetype || 
                        item.name.includes('.') || 
                        (item.metadata && !item.metadata.mimetype && item.name.includes('.'));
          
          console.log(`📄 Item: ${item.name}, isFile: ${isFile}, metadata:`, item.metadata);
          
          if (isFile) {
            // It's a file
            allFiles.push({
              ...item,
              fullPath: fullPath
            });
            console.log(`✅ Added file: ${fullPath}`);
          } else {
            // It's a folder, recurse into it
            console.log(`📁 Recursing into folder: ${fullPath}`);
            const subFiles = await this.getAllFilesRecursively(fullPath);
            allFiles.push(...subFiles);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error in getAllFilesRecursively for ${folderPath}:`, error);
      console.error(`❌ Error stack:`, error.stack);
    }
    
    console.log(`📊 Returning ${allFiles.length} files from folder: "${folderPath}"`);
    return allFiles;
  }

  async getDocument(id) {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        throw new Error(`Document not found: ${error.message}`);
      }

      return {
        id: data.id,
        filename: data.title || `Screen ${data.id}`,
        type: 'screen',
        title: data.title,
        description: data.description,
        content: data.content,
        text: data.content || data.description || data.title,
        url: data.url,
        image_url: data.image_url,
        created_at: data.created_at,
        updated_at: data.updated_at,
        metadata: {
          width: data.width,
          height: data.height,
          device: data.device,
          platform: data.platform,
          tags: data.tags
        }
      };
    } catch (error) {
      console.error('Supabase get document error:', error);
      return null;
    }
  }

  async getAllDocuments(options = {}) {
    try {
      const allFiles = await this.getAllFilesRecursively('');
      
      // Apply limit
      const limitedFiles = allFiles.slice(0, options.limit || 100);

      return limitedFiles.map(file => ({
        id: file.id || file.fullPath,
        filename: file.name,
        type: file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg') ? 'image' : 'file',
        title: file.name.replace(/\.[^/.]+$/, ''),
        description: `File from ${file.fullPath.split('/')[0]} flow`,
        content: file.name,
        text: file.name,
        url: `${this.supabaseUrl}/storage/v1/object/public/${this.storageBucket}/${file.fullPath}`,
        image_url: file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg') 
          ? `${this.supabaseUrl}/storage/v1/object/public/${this.storageBucket}/${file.fullPath}` 
          : null,
        created_at: file.created_at,
        updated_at: file.updated_at,
        metadata: {
          size: file.metadata?.size,
          mimetype: file.metadata?.mimetype,
          flow: file.fullPath.split('/')[0]
        }
      }));
    } catch (error) {
      console.error('Supabase get all documents error:', error);
      return [];
    }
  }

  async addDocument(document) {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .insert([{
          title: document.title,
          description: document.description,
          content: document.content,
          url: document.url,
          image_url: document.image_url,
          width: document.metadata?.width,
          height: document.metadata?.height,
          device: document.metadata?.device,
          platform: document.metadata?.platform,
          tags: document.metadata?.tags
        }])
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to add document: ${error.message}`);
      }

      return {
        id: data.id,
        filename: data.title || `Screen ${data.id}`,
        type: 'screen',
        title: data.title,
        description: data.description,
        content: data.content,
        text: data.content || data.description || data.title,
        url: data.url,
        image_url: data.image_url,
        created_at: data.created_at,
        updated_at: data.updated_at,
        metadata: {
          width: data.width,
          height: data.height,
          device: data.device,
          platform: data.platform,
          tags: data.tags
        }
      };
    } catch (error) {
      console.error('Supabase add document error:', error);
      throw error;
    }
  }

  async updateDocument(id, updates) {
    try {
      const { data, error } = await this.client
        .from(this.tableName)
        .update({
          title: updates.title,
          description: updates.description,
          content: updates.content,
          url: updates.url,
          image_url: updates.image_url,
          width: updates.metadata?.width,
          height: updates.metadata?.height,
          device: updates.metadata?.device,
          platform: updates.metadata?.platform,
          tags: updates.metadata?.tags,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update document: ${error.message}`);
      }

      return {
        id: data.id,
        filename: data.title || `Screen ${data.id}`,
        type: 'screen',
        title: data.title,
        description: data.description,
        content: data.content,
        text: data.content || data.description || data.title,
        url: data.url,
        image_url: data.image_url,
        created_at: data.created_at,
        updated_at: data.updated_at,
        metadata: {
          width: data.width,
          height: data.height,
          device: data.device,
          platform: data.platform,
          tags: data.tags
        }
      };
    } catch (error) {
      console.error('Supabase update document error:', error);
      throw error;
    }
  }

  async deleteDocument(id) {
    try {
      const { error } = await this.client
        .from(this.tableName)
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(`Failed to delete document: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error('Supabase delete document error:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      const allFiles = await this.getAllFilesRecursively('');
      
      return {
        totalDocuments: allFiles.length,
        source: 'supabase',
        storageBucket: this.storageBucket
      };
    } catch (error) {
      console.error('Supabase get stats error:', error);
      return {
        totalDocuments: 0,
        source: 'supabase',
        storageBucket: this.storageBucket
      };
    }
  }

  /**
   * Process and analyze images in the knowledge base
   * @param {Object} options - Processing options
   */
  async processImages(options = {}) {
    try {
      console.log('🔄 Starting image processing...');
      
      // Get all image files
      const allFiles = await this.getAllFilesRecursively('');
      const imageFiles = allFiles.filter(file => 
        file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg')
      );
      
      console.log(`📸 Found ${imageFiles.length} images to process`);
      
      // Check which images are already processed
      const { data: existingAnalysis } = await this.client
        .from('image_analysis')
        .select('file_path');
      
      const existingPaths = new Set(existingAnalysis?.map(item => item.file_path) || []);
      const unprocessedImages = imageFiles.filter(file => 
        !existingPaths.has(file.fullPath)
      );
      
      console.log(`🆕 ${unprocessedImages.length} new images to analyze`);
      
      if (unprocessedImages.length === 0) {
        console.log('✅ All images already processed');
        return { processed: 0, total: imageFiles.length };
      }
      
      // Process images in batches
      const batchSize = options.batchSize || 5;
      let processed = 0;
      
      for (let i = 0; i < unprocessedImages.length; i += batchSize) {
        const batch = unprocessedImages.slice(i, i + batchSize);
        console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(unprocessedImages.length / batchSize)}`);
        
        const imageUrls = batch.map(file => 
          `${this.supabaseUrl}/storage/v1/object/public/${this.storageBucket}/${file.fullPath}`
        );
        
        // Analyze images
        const analysisResults = await this.imageAnalysis.processBatch(imageUrls, {
          extractUIElements: true,
          extractColors: true,
          batchSize: batchSize
        });
        
        // Store results in database
        const analysisData = batch.map((file, index) => {
          const result = analysisResults[index];
          return {
            file_path: file.fullPath,
            filename: file.name,
            flow: file.fullPath.split('/')[0],
            text: result.text || '',
            description: result.description || '',
            ui_elements: result.uiElements || [],
            colors: result.colors || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        });
        
        const { error: insertError } = await this.client
          .from('image_analysis')
          .insert(analysisData);
        
        if (insertError) {
          console.error('Error storing analysis data:', insertError);
        } else {
          processed += batch.length;
          console.log(`✅ Processed ${batch.length} images`);
        }
        
        // Add delay between batches
        if (i + batchSize < unprocessedImages.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      console.log(`🎉 Image processing completed! Processed ${processed} images`);
      return { processed, total: imageFiles.length };
      
    } catch (error) {
      console.error('Image processing error:', error);
      throw error;
    }
  }

  /**
   * Process a single image
   * @param {string} filePath - Path to the image file
   */
  async processSingleImage(filePath) {
    try {
      console.log(`🔄 Processing single image: ${filePath}`);
      
      const imageUrl = `${this.supabaseUrl}/storage/v1/object/public/${this.storageBucket}/${filePath}`;
      
      // Analyze the image
      const analysis = await this.imageAnalysis.analyzeImage(imageUrl, {
        extractUIElements: true,
        extractColors: true
      });
      
      // Store in database
      const analysisData = {
        file_path: filePath,
        filename: filePath.split('/').pop(),
        flow: filePath.split('/')[0],
        text: analysis.text || '',
        description: analysis.description || '',
        ui_elements: analysis.uiElements || [],
        colors: analysis.colors || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const { error } = await this.client
        .from('image_analysis')
        .upsert(analysisData, { onConflict: 'file_path' });
      
      if (error) {
        throw new Error(`Failed to store analysis: ${error.message}`);
      }
      
      console.log(`✅ Image processed and stored: ${filePath}`);
      return analysisData;
      
    } catch (error) {
      console.error('Single image processing error:', error);
      throw error;
    }
  }
}
