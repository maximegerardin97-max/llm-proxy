import Tesseract from 'tesseract.js';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import OpenAI from 'openai';

export class ImageAnalysisService {
  constructor(config) {
    this.config = config;
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.visionClient = config.google?.apiKey ? new ImageAnnotatorClient({
      keyFilename: config.google.apiKey
    }) : null;
  }

  /**
   * Analyze an image and extract text, descriptions, and UI elements
   * @param {string} imageUrl - URL or base64 of the image
   * @param {Object} options - Analysis options
   * @returns {Object} Analysis results
   */
  async analyzeImage(imageUrl, options = {}) {
    const results = {
      text: '',
      description: '',
      uiElements: [],
      colors: [],
      metadata: {}
    };

    try {
      // Run OCR and AI analysis in parallel for speed
      const [ocrResult, aiDescription] = await Promise.allSettled([
        this.extractText(imageUrl),
        this.describeImage(imageUrl)
      ]);

      if (ocrResult.status === 'fulfilled') {
        results.text = ocrResult.value;
      }

      if (aiDescription.status === 'fulfilled') {
        results.description = aiDescription.value;
      }

      // Extract UI elements if it's a mobile app screenshot
      if (options.extractUIElements) {
        results.uiElements = await this.extractUIElements(imageUrl);
      }

      // Extract dominant colors
      if (options.extractColors) {
        results.colors = await this.extractColors(imageUrl);
      }

      return results;
    } catch (error) {
      console.error('Image analysis error:', error);
      return results;
    }
  }

  /**
   * Extract text from image using OCR
   * @param {string} imageUrl - URL or base64 of the image
   * @returns {string} Extracted text
   */
  async extractText(imageUrl) {
    try {
      console.log('🔍 Running OCR on image...');
      const { data: { text } } = await Tesseract.recognize(imageUrl, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      console.log('✅ OCR completed');
      return text.trim();
    } catch (error) {
      console.error('OCR error:', error);
      return '';
    }
  }

  /**
   * Generate AI description of the image
   * @param {string} imageUrl - URL or base64 of the image
   * @returns {string} AI-generated description
   */
  async describeImage(imageUrl) {
    try {
      console.log('🤖 Generating AI description...');
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this mobile app screenshot and provide a detailed description focusing on: 1) What type of screen this is (login, onboarding, feed, etc.), 2) Key UI elements visible, 3) App name/branding, 4) User actions possible, 5) Visual design elements. Be specific and detailed."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 500
      });

      const description = response.choices[0].message.content;
      console.log('✅ AI description completed');
      return description;
    } catch (error) {
      console.error('AI description error:', error);
      return '';
    }
  }

  /**
   * Extract UI elements from mobile app screenshot
   * @param {string} imageUrl - URL or base64 of the image
   * @returns {Array} List of UI elements
   */
  async extractUIElements(imageUrl) {
    try {
      console.log('🎨 Extracting UI elements...');
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this mobile app screenshot and extract all UI elements. Return a JSON array with objects containing: {type: 'button|input|text|image|icon', text: 'visible text', position: 'top|middle|bottom|left|right|center', color: 'primary color'}. Focus on interactive elements and important text."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 1000
      });

      const uiElementsText = response.choices[0].message.content;
      // Clean up the response to extract JSON
      const jsonMatch = uiElementsText.match(/```json\s*([\s\S]*?)\s*```/) || uiElementsText.match(/\[[\s\S]*\]/);
      const cleanJson = jsonMatch ? jsonMatch[1] || jsonMatch[0] : uiElementsText;
      const uiElements = JSON.parse(cleanJson);
      console.log('✅ UI elements extracted');
      return Array.isArray(uiElements) ? uiElements : [];
    } catch (error) {
      console.error('UI elements extraction error:', error);
      return [];
    }
  }

  /**
   * Extract dominant colors from image
   * @param {string} imageUrl - URL or base64 of the image
   * @returns {Array} List of dominant colors
   */
  async extractColors(imageUrl) {
    try {
      console.log('🎨 Extracting colors...');
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this mobile app screenshot and identify the 5 most dominant colors. Return a JSON array with hex color codes like ['#FF5733', '#3498DB', '#2ECC71']. Focus on background colors, primary UI colors, and accent colors."
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 200
      });

      const colorsText = response.choices[0].message.content;
      // Clean up the response to extract JSON
      const jsonMatch = colorsText.match(/```json\s*([\s\S]*?)\s*```/) || colorsText.match(/\[[\s\S]*\]/);
      const cleanJson = jsonMatch ? jsonMatch[1] || jsonMatch[0] : colorsText;
      const colors = JSON.parse(cleanJson);
      console.log('✅ Colors extracted');
      return Array.isArray(colors) ? colors : [];
    } catch (error) {
      console.error('Color extraction error:', error);
      return [];
    }
  }

  /**
   * Process multiple images in batch
   * @param {Array} imageUrls - Array of image URLs
   * @param {Object} options - Processing options
   * @returns {Array} Array of analysis results
   */
  async processBatch(imageUrls, options = {}) {
    console.log(`🔄 Processing batch of ${imageUrls.length} images...`);
    const results = [];
    
    // Process in smaller batches to avoid rate limits
    const batchSize = options.batchSize || 5;
    for (let i = 0; i < imageUrls.length; i += batchSize) {
      const batch = imageUrls.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(imageUrls.length / batchSize)}`);
      
      const batchResults = await Promise.allSettled(
        batch.map(url => this.analyzeImage(url, options))
      );
      
      results.push(...batchResults.map(result => 
        result.status === 'fulfilled' ? result.value : { error: result.reason }
      ));
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < imageUrls.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('✅ Batch processing completed');
    return results;
  }
}

export default ImageAnalysisService;
