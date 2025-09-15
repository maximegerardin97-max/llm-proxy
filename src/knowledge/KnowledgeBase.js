import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
// import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import sharp from 'sharp';

export class KnowledgeBase {
  constructor(config) {
    this.config = config;
    this.knowledgePath = config.knowledgeBase.path;
    this.maxFileSize = config.knowledgeBase.maxFileSize;
    this.allowedTypes = config.knowledgeBase.allowedTypes;
    this.documents = new Map();
    this.initialize();
  }

  async initialize() {
    try {
      await fs.mkdir(this.knowledgePath, { recursive: true });
      await this.loadExistingDocuments();
    } catch (error) {
      console.error('Failed to initialize knowledge base:', error);
    }
  }

  async loadExistingDocuments() {
    try {
      const files = await fs.readdir(this.knowledgePath);
      for (const file of files) {
        const filePath = path.join(this.knowledgePath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile()) {
          const docId = path.basename(file, path.extname(file));
          const metadata = await this.extractMetadata(filePath);
          this.documents.set(docId, {
            id: docId,
            filename: file,
            path: filePath,
            type: path.extname(file).slice(1),
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            ...metadata
          });
        }
      }
    } catch (error) {
      console.error('Failed to load existing documents:', error);
    }
  }

  async addDocument(file, metadata = {}) {
    try {
      // Validate file
      if (file.size > this.maxFileSize) {
        throw new Error(`File too large. Maximum size: ${this.maxFileSize} bytes`);
      }

      const fileExt = path.extname(file.originalname).slice(1).toLowerCase();
      if (!this.allowedTypes.includes(fileExt)) {
        throw new Error(`File type not allowed. Allowed types: ${this.allowedTypes.join(', ')}`);
      }

      // Generate unique ID
      const docId = uuidv4();
      const filename = `${docId}.${fileExt}`;
      const filePath = path.join(this.knowledgePath, filename);

      // Save file
      await fs.writeFile(filePath, file.buffer);

      // Extract content and metadata
      const extractedData = await this.extractContent(filePath, fileExt);
      
      // Store document info
      const document = {
        id: docId,
        filename: file.originalname,
        path: filePath,
        type: fileExt,
        size: file.size,
        createdAt: new Date(),
        modifiedAt: new Date(),
        ...extractedData,
        ...metadata
      };

      this.documents.set(docId, document);
      return document;
    } catch (error) {
      throw new Error(`Failed to add document: ${error.message}`);
    }
  }

  async extractContent(filePath, fileType) {
    const content = await fs.readFile(filePath);
    
    switch (fileType) {
      case 'txt':
      case 'md':
        return {
          text: content.toString('utf-8'),
          content: content.toString('utf-8')
        };

      case 'pdf':
        // For now, we'll skip PDF parsing due to the pdf-parse package issue
        // You can implement PDF parsing later with a different library
        return {
          text: '[PDF file - content extraction not available]',
          content: '[PDF file - content extraction not available]',
          pages: 0,
          info: { title: 'PDF Document' }
        };

      case 'docx':
        const docxResult = await mammoth.extractRawText({ buffer: content });
        return {
          text: docxResult.value,
          content: docxResult.value,
          messages: docxResult.messages
        };

      case 'html':
        const html = content.toString('utf-8');
        const $ = cheerio.load(html);
        return {
          text: $.text(),
          content: $.text(),
          title: $('title').text(),
          links: $('a').map((i, el) => $(el).attr('href')).get()
        };

      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        const imageInfo = await sharp(content).metadata();
        return {
          type: 'image',
          width: imageInfo.width,
          height: imageInfo.height,
          format: imageInfo.format,
          size: imageInfo.size,
          base64: `data:image/${fileType};base64,${content.toString('base64')}`
        };

      default:
        return {
          text: content.toString('utf-8'),
          content: content.toString('utf-8')
        };
    }
  }

  async extractMetadata(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const fileType = path.extname(filePath).slice(1).toLowerCase();
      
      if (['jpg', 'jpeg', 'png', 'gif'].includes(fileType)) {
        const content = await fs.readFile(filePath);
        const imageInfo = await sharp(content).metadata();
        return {
          type: 'image',
          width: imageInfo.width,
          height: imageInfo.height,
          format: imageInfo.format
        };
      }
      
      return { type: 'text' };
    } catch (error) {
      return { type: 'unknown' };
    }
  }

  async searchDocuments(query, options = {}) {
    const results = [];
    const searchTerms = query.toLowerCase().split(' ');

    for (const [id, doc] of this.documents) {
      let score = 0;
      const searchableText = (doc.text || doc.content || '').toLowerCase();
      
      // Simple text matching score
      for (const term of searchTerms) {
        if (searchableText.includes(term)) {
          score += 1;
        }
      }

      if (score > 0) {
        results.push({
          ...doc,
          score,
          relevance: Math.min(score / searchTerms.length, 1)
        });
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.score - a.score);

    // Apply limit
    if (options.limit) {
      return results.slice(0, options.limit);
    }

    return results;
  }

  getDocument(id) {
    return this.documents.get(id);
  }

  getAllDocuments() {
    return Array.from(this.documents.values());
  }

  async deleteDocument(id) {
    const doc = this.documents.get(id);
    if (!doc) {
      throw new Error('Document not found');
    }

    try {
      await fs.unlink(doc.path);
      this.documents.delete(id);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete document: ${error.message}`);
    }
  }

  async updateDocument(id, updates) {
    const doc = this.documents.get(id);
    if (!doc) {
      throw new Error('Document not found');
    }

    const updatedDoc = { ...doc, ...updates, modifiedAt: new Date() };
    this.documents.set(id, updatedDoc);
    return updatedDoc;
  }

  getStats() {
    const docs = Array.from(this.documents.values());
    const stats = {
      totalDocuments: docs.length,
      totalSize: docs.reduce((sum, doc) => sum + doc.size, 0),
      byType: {},
      byDate: {}
    };

    docs.forEach(doc => {
      // Count by type
      stats.byType[doc.type] = (stats.byType[doc.type] || 0) + 1;
      
      // Count by date
      const date = doc.createdAt.toISOString().split('T')[0];
      stats.byDate[date] = (stats.byDate[date] || 0) + 1;
    });

    return stats;
  }
}
