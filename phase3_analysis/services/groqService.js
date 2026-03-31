const Groq = require('groq-sdk');
const logger = require('../../phase6_utils/logger').createPhaseLogger('GROQ-SERVICE');
require('dotenv').config();

class GroqService {
  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.model = 'llama-3.3-70b-versatile';
  }

  /**
   * Primary thematic extraction using Llama 3.1
   */
  async analyzeBatch(chunk, index) {
    logger.info(`GroqService: Extracting themes from Batch ${index + 1} (${chunk.length} reviews)...`);
    
    const reviewTexts = chunk.map((r, i) => `${i + 1}. [Rating: ${r.rating}] ${r.text}`).join('\n');
    
    const prompt = `
      Analyze these app reviews and return a JSON object with:
      1. 'themes': Top 5 primary themes (name, sentiment, count).
      2. 'quotes': 3 strongest VERBATIM representative quotes.
      3. 'problems': 3 most critical product problems found in these reviews.

      Reviews:
      ${reviewTexts}

      Return ONLY a JSON object in this format:
      {
        "themes": [{"name": "string", "sentiment": "string", "count": number}],
        "quotes": ["string"],
        "problems": ["string"]
      }
    `;

    try {
      const chatCompletion = await this.groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: this.model,
        response_format: { type: "json_object" }
      });
      
      const content = chatCompletion.choices[0].message.content;
      return JSON.parse(content);
    } catch (error) {
      logger.error(`Groq Batch ${index+1} failed: ${error.message}`);
      return null;
    }
  }

  async processAll(reviews, batchSize = 50) {
    logger.info(`Starting Groq Analysis Pipeline for ${reviews.length} reviews...`);
    const chunks = [];
    for (let i = 0; i < reviews.length; i += batchSize) {
      chunks.push(reviews.slice(i, i + batchSize));
    }

    const results = [];
    for (let i = 0; i < chunks.length; i++) {
        const res = await this.analyzeBatch(chunks[i], i);
        if (res) results.push(res);
        // Minimal delay for rate limits
        await new Promise(r => setTimeout(r, 500));
    }
    return results;
  }
}

module.exports = new GroqService();
