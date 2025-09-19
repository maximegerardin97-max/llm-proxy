import { KnowledgeBase } from '../knowledge/KnowledgeBase.js';
import { SupabaseKnowledgeBase } from '../knowledge/SupabaseKnowledgeBase.js';
import { ProviderFactory } from '../providers/ProviderFactory.js';

export class Agent {
  constructor(config, systemPrompt = '') {
    this.config = config;
    this.systemPrompt = systemPrompt;
    
    // Initialize appropriate knowledge base
    if (config.knowledgeBase.type === 'supabase' && config.supabase?.url && config.supabase?.serviceRoleKey) {
      console.log('🔧 Using Supabase knowledge base');
      this.knowledgeBase = new SupabaseKnowledgeBase(config);
    } else {
      console.log('🔧 Using file-based knowledge base');
      this.knowledgeBase = new KnowledgeBase(config);
    }
    
    this.conversationHistory = [];
    this.sessionHistories = new Map();
  }

  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
  }

  async addKnowledge(file, metadata = {}) {
    return await this.knowledgeBase.addDocument(file, metadata);
  }

  async searchKnowledge(query, options = {}) {
    return await this.knowledgeBase.searchDocuments(query, options);
  }

  async generateResponse(userMessage, options = {}) {
    try {
      // Extract text content for knowledge search
      let searchQuery = '';
      if (Array.isArray(userMessage)) {
        // Extract text from multimodal content
        const textItems = userMessage.filter(item => item.type === 'text');
        searchQuery = textItems.map(item => item.text).join(' ');
      } else if (typeof userMessage === 'string') {
        searchQuery = userMessage;
      }

      // Get relevant knowledge
      console.log('🔍 Searching knowledge base for:', searchQuery);
      const relevantDocs = await this.searchKnowledge(searchQuery, { limit: 5 });
      console.log('📚 Found relevant documents:', relevantDocs.length);
      if (relevantDocs.length > 0) {
        console.log('📄 Document names:', relevantDocs.map(doc => doc.filename));
      }
      
      // Build context from knowledge base
      let context = '';
      if (relevantDocs.length > 0) {
        context = '\n\nRelevant knowledge:\n';
        relevantDocs.forEach(doc => {
          if (doc.type === 'image') {
            context += `[Image: ${doc.filename}]\n`;
          } else {
            context += `[${doc.filename}]: ${doc.text?.substring(0, 500)}...\n`;
          }
        });
        console.log('📝 Context built:', context.substring(0, 200) + '...');
      } else {
        console.log('⚠️ No relevant documents found in knowledge base');
      }

      // Determine session history (per-session if sessionId provided)
      const sessionId = options.sessionId;
      const historyForSession = sessionId
        ? (this.sessionHistories.get(sessionId) || [])
        : this.conversationHistory;

      // Prepare messages
      const messages = [
        { role: 'system', content: this.systemPrompt + context },
        ...historyForSession,
        { role: 'user', content: userMessage }
      ];

      // Get provider
      const providerName = options.provider || this.config.llm.defaultProvider;
      const provider = ProviderFactory.createProvider(providerName, this.config);

      // Generate response
      const response = await provider.generateResponse(messages, {
        model: options.model || this.config.llm.defaultModel,
        maxTokens: options.maxTokens || this.config.llm.maxTokens,
        temperature: options.temperature || this.config.llm.temperature
      });

      // Update conversation history
      const updatedHistory = [
        ...historyForSession,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: response.content }
      ];

      // Keep only last 10 exchanges (20 messages)
      const trimmed = updatedHistory.length > 20 ? updatedHistory.slice(-20) : updatedHistory;

      if (sessionId) {
        this.sessionHistories.set(sessionId, trimmed);
      } else {
        this.conversationHistory = trimmed;
      }

      return {
        ...response,
        relevantDocuments: relevantDocs.map(doc => ({
          id: doc.id,
          filename: doc.filename,
          type: doc.type,
          relevance: doc.relevance
        }))
      };
    } catch (error) {
      throw new Error(`Agent error: ${error.message}`);
    }
  }

  async generateStreamResponse(userMessage, options = {}) {
    try {
      // Extract text content for knowledge search
      let searchQuery = '';
      if (Array.isArray(userMessage)) {
        // Extract text from multimodal content
        const textItems = userMessage.filter(item => item.type === 'text');
        searchQuery = textItems.map(item => item.text).join(' ');
      } else if (typeof userMessage === 'string') {
        searchQuery = userMessage;
      }

      // Get relevant knowledge
      console.log('🔍 Searching knowledge base for:', searchQuery);
      const relevantDocs = await this.searchKnowledge(searchQuery, { limit: 5 });
      console.log('📚 Found relevant documents:', relevantDocs.length);
      if (relevantDocs.length > 0) {
        console.log('📄 Document names:', relevantDocs.map(doc => doc.filename));
      }
      
      // Build context from knowledge base
      let context = '';
      if (relevantDocs.length > 0) {
        context = '\n\nRelevant knowledge:\n';
        relevantDocs.forEach(doc => {
          if (doc.type === 'image') {
            context += `[Image: ${doc.filename}]\n`;
          } else {
            context += `[${doc.filename}]: ${doc.text?.substring(0, 500)}...\n`;
          }
        });
        console.log('📝 Context built:', context.substring(0, 200) + '...');
      } else {
        console.log('⚠️ No relevant documents found in knowledge base');
      }

      // Determine session history (per-session if sessionId provided)
      const sessionId = options.sessionId;
      const historyForSession = sessionId
        ? (this.sessionHistories.get(sessionId) || [])
        : this.conversationHistory;

      // Prepare messages
      const messages = [
        { role: 'system', content: this.systemPrompt + context },
        ...historyForSession,
        { role: 'user', content: userMessage }
      ];

      // Get provider
      const providerName = options.provider || this.config.llm.defaultProvider;
      const provider = ProviderFactory.createProvider(providerName, this.config);

      // Generate streaming response
      const stream = await provider.generateStreamResponse(messages, {
        model: options.model || this.config.llm.defaultModel,
        maxTokens: options.maxTokens || this.config.llm.maxTokens,
        temperature: options.temperature || this.config.llm.temperature
      });

      return {
        stream,
        relevantDocuments: relevantDocs.map(doc => ({
          id: doc.id,
          filename: doc.filename,
          type: doc.type,
          relevance: doc.relevance
        }))
      };
    } catch (error) {
      throw new Error(`Agent streaming error: ${error.message}`);
    }
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  getHistory() {
    return this.conversationHistory;
  }

  clearHistoryForSession(sessionId) {
    if (!sessionId) return this.clearHistory();
    this.sessionHistories.delete(sessionId);
  }

  getHistoryForSession(sessionId) {
    if (!sessionId) return this.getHistory();
    return this.sessionHistories.get(sessionId) || [];
  }

  async getKnowledgeStats() {
    return this.knowledgeBase.getStats();
  }

  async deleteKnowledge(id) {
    return await this.knowledgeBase.deleteDocument(id);
  }

  async getAllKnowledge() {
    return this.knowledgeBase.getAllDocuments();
  }
}
