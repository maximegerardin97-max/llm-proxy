import { createClient } from '@supabase/supabase-js';

export class SupabaseKnowledgeBase {
  constructor(config) {
    this.config = config;
    this.supabaseUrl = config.supabase?.url;
    this.supabaseKey = config.supabase?.key;
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
  }

  async initialize() {
    try {
      // Test connection
      const { data, error } = await this.client
        .from(this.tableName)
        .select('count', { count: 'exact', head: true });
      
      if (error) {
        throw new Error(`Supabase connection failed: ${error.message}`);
      }
      
      console.log(`✅ Connected to Supabase. Found ${data?.length || 0} screens in knowledge base.`);
      return true;
    } catch (error) {
      console.error('Failed to initialize Supabase knowledge base:', error);
      throw error;
    }
  }

  async searchDocuments(query, options = {}) {
    try {
      // Recursively get all files from all folders
      const allFiles = await this.getAllFilesRecursively('');
      
      // Filter files that match the query
      const searchTerms = query.toLowerCase().split(' ');
      const matchingFiles = allFiles.filter(file => {
        const fileName = file.name.toLowerCase();
        const fullPath = file.fullPath.toLowerCase();
        return searchTerms.some(term => fileName.includes(term) || fullPath.includes(term));
      });

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

  async getAllFilesRecursively(folderPath = '') {
    const allFiles = [];
    
    try {
      const { data: items, error } = await this.client.storage
        .from(this.storageBucket)
        .list(folderPath, { limit: 1000 });

      if (error) {
        console.error(`Error listing folder ${folderPath}:`, error);
        return allFiles;
      }

      console.log(`Found ${items.length} items in folder: ${folderPath}`);
      
      for (const item of items) {
        const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name;
        
        // Check if it's a file by looking for file extensions or metadata
        const isFile = item.metadata?.mimetype || 
                      item.name.includes('.') || 
                      (item.metadata && !item.metadata.mimetype && item.name.includes('.'));
        
        console.log(`Item: ${item.name}, isFile: ${isFile}, metadata:`, item.metadata);
        
        if (isFile) {
          // It's a file
          allFiles.push({
            ...item,
            fullPath: fullPath
          });
        } else {
          // It's a folder, recurse into it
          const subFiles = await this.getAllFilesRecursively(fullPath);
          allFiles.push(...subFiles);
        }
      }
    } catch (error) {
      console.error(`Error in getAllFilesRecursively for ${folderPath}:`, error);
    }
    
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
}
