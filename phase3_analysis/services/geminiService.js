const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const logger = require('../../phase6_utils/logger').createPhaseLogger('GEMINI-SERVICE');
require('dotenv').config();

class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Use gemini-1.5-flash for maximum TPM availability and speed
    this.model = this.genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" },
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
    });
  }

  async generatePulse(groqResults) {
    logger.info('GeminiService: Synthesizing final Weekly Pulse (High-Capacity Engine)...');
    
    const prompt = `
      You are an expert app analyst. Synthesize the following pre-processed thematic extraction results into a high-fidelity Weekly Pulse report.

      Requirements:
      1. Top 5 Themes: Refine the theme names to be product-specific. Assign status (Improving/Critical/Neutral) and impact (High/Medium).
      2. Weekly Pulse Themes: Each theme in the weekly pulse must have a 'name' and a 'description'.
      3. 3 Best User Quotes: Select the 3 most representative VERBATIM quotes from the data. 
      4. 5 Strategic Action Ideas: Generate SPECIFIC, actionable recommendations (e.g., "Fix Federal Bank statement upload error").

      Pre-processed Data:
      ${JSON.stringify(groqResults, null, 2)}

      Return STRICT JSON format:
      {
        "top_themes": [{"theme": "string", "status": "string", "impact": "string"}],
        "weekly_pulse": {
          "total_reviews": number,
          "top_themes": [{ "name": "string", "description": "string", "count": number }],
          "quotes": ["string"],
          "action_ideas": ["string"]
        },
        "executive_summary": "string",
        "priority_bug_fixes": ["string"]
      }
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return JSON.parse(response.text());
    } catch (error) {
      logger.error(`Gemini Intelligence Generation failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new GeminiService();
