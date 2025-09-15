# LLM Proxy - AI Agent with Knowledge Base Integration

A flexible LLM proxy that allows you to create AI agents with custom knowledge bases, supporting multiple LLM providers (OpenAI GPT and Google Gemini), and both text and image inputs.

## Features

- 🤖 **Multiple LLM Providers**: Support for OpenAI GPT and Google Gemini
- 📚 **Knowledge Base Integration**: Upload and search through documents (PDF, DOCX, TXT, MD, images)
- 🖼️ **Image Support**: Process and understand images in conversations
- 💬 **Real-time Streaming**: Get responses as they're generated
- 🎨 **Beautiful Web Interface**: Modern, responsive UI for easy interaction
- ⚙️ **Customizable System Prompts**: Define your agent's behavior and personality
- 📊 **Analytics**: Track knowledge base usage and statistics
- 🔄 **Conversation History**: Maintain context across multiple interactions

## Quick Start

### 1. Installation

```bash
# Clone or download the project
cd llm-proxy

# Install dependencies
npm install
```

### 2. Configuration

Copy the example environment file and add your API keys:

```bash
cp env.example .env
```

Edit `.env` with your API keys:

```env
# LLM API Keys
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_API_KEY=your_google_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=development

# Knowledge Base Configuration
KNOWLEDGE_BASE_PATH=./knowledge_base
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=pdf,docx,txt,md,jpg,jpeg,png,gif

# LLM Configuration
DEFAULT_LLM_PROVIDER=openai
DEFAULT_MODEL=gpt-4
MAX_TOKENS=4000
TEMPERATURE=0.7
```

### 3. Run the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### 4. Access the Interface

Open your browser and go to `http://localhost:3000`

## Usage

### Web Interface

1. **Upload Knowledge**: Drag and drop files or click to upload documents to your knowledge base
2. **Set System Prompt**: Define how your agent should behave and respond
3. **Choose Provider**: Select between OpenAI GPT or Google Gemini
4. **Start Chatting**: Ask questions and get responses based on your knowledge base

### API Endpoints

#### Chat
- `POST /api/chat` - Send a message and get a response
- `POST /api/chat/stream` - Get streaming responses

#### Knowledge Base
- `POST /api/knowledge` - Upload a document
- `GET /api/knowledge` - List all documents
- `GET /api/knowledge/search?q=query` - Search documents
- `DELETE /api/knowledge/:id` - Delete a document
- `GET /api/knowledge/stats` - Get knowledge base statistics

#### Configuration
- `GET /api/providers` - List available LLM providers
- `POST /api/system-prompt` - Update system prompt
- `POST /api/clear-history` - Clear conversation history
- `GET /api/history` - Get conversation history

### Example API Usage

```javascript
// Send a message
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "What is the main topic of the uploaded documents?",
    provider: "openai",
    model: "gpt-4"
  })
});

const data = await response.json();
console.log(data.content);

// Upload a document
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('description', 'Important document');

const uploadResponse = await fetch('/api/knowledge', {
  method: 'POST',
  body: formData
});
```

## Supported File Types

- **Text**: PDF, DOCX, TXT, MD, HTML
- **Images**: JPG, JPEG, PNG, GIF
- **Maximum file size**: 10MB (configurable)

## LLM Providers

### OpenAI
- **Models**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo, GPT-4 Vision
- **Features**: Text and image processing, streaming responses
- **Setup**: Get API key from [OpenAI Platform](https://platform.openai.com/)

### Google Gemini
- **Models**: Gemini Pro, Gemini Pro Vision
- **Features**: Text and image processing, streaming responses
- **Setup**: Get API key from [Google AI Studio](https://makersuite.google.com/)

## Architecture

```
src/
├── config/           # Configuration management
├── providers/        # LLM provider implementations
│   ├── BaseProvider.js
│   ├── OpenAIProvider.js
│   ├── GoogleProvider.js
│   └── ProviderFactory.js
├── knowledge/        # Knowledge base system
│   └── KnowledgeBase.js
├── agents/           # Agent implementation
│   └── Agent.js
├── routes/           # API routes
│   └── chat.js
└── index.js          # Main server file

public/
└── index.html        # Web interface
```

## Customization

### Adding New LLM Providers

1. Create a new provider class extending `BaseProvider`
2. Implement required methods: `generateResponse`, `generateStreamResponse`, etc.
3. Add the provider to `ProviderFactory`

### Customizing the Knowledge Base

The knowledge base system is modular and can be extended to support:
- Additional file types
- Custom content extraction
- Vector embeddings for semantic search
- Database storage instead of file system

### System Prompt Templates

You can create different system prompts for different use cases:

```javascript
// Technical support agent
const techSupportPrompt = `You are a technical support agent. Use the knowledge base to help users with technical issues. Be patient, clear, and provide step-by-step solutions.`;

// Research assistant
const researchPrompt = `You are a research assistant. Analyze the provided documents and provide comprehensive, well-sourced answers. Always cite your sources.`;

// Creative writer
const creativePrompt = `You are a creative writing assistant. Use the knowledge base as inspiration and help users develop their creative projects.`;
```

## Deployment

### Environment Variables for Production

```env
NODE_ENV=production
PORT=3000
OPENAI_API_KEY=your_production_key
GOOGLE_API_KEY=your_production_key
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Troubleshooting

### Common Issues

1. **API Key Errors**: Ensure your API keys are correctly set in the `.env` file
2. **File Upload Issues**: Check file size limits and allowed file types
3. **Memory Issues**: Large knowledge bases may require more memory
4. **Rate Limiting**: Monitor API usage to avoid rate limits

### Debug Mode

Set `NODE_ENV=development` to enable detailed error messages and logging.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the API documentation
3. Open an issue on GitHub

---

**Built with ❤️ for the AI community**
