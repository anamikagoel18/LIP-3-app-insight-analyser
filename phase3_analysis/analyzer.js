const logger = require('../phase6_utils/logger').createPhaseLogger('ANALYZER');
const groqService = require('./services/groqService');
const geminiService = require('./services/geminiService');
require('dotenv').config();

class Analyzer {
  /**
   * Main Orchestrator with Groq-Primary Strategy (Due to Gemini 404)
   * This ensures the dashboard gets high-quality insights even if Gemini is down.
   */
  async analyze(reviews) {
    if (!reviews || reviews.length === 0) {
      logger.warn('No reviews provided for analysis.');
      return null;
    }

    logger.info(`Starting Intelligence Pipeline for ${reviews.length} reviews (Primary: Groq Llama 3.1)...`);

    let finalReport = null;
    let partialAnalyses = [];

    // --- STEP 1: BATCH EXTRACTION (Primary: Groq) ---
    try {
      // 50 reviews per batch for Groq efficiency
      partialAnalyses = await groqService.processAll(reviews, 50);
      if (partialAnalyses.length === 0) {
        throw new Error('Groq extraction returned no results.');
      }
    } catch (e) {
      logger.error(`Groq Primary Phase Failed: ${e.message}. Attempting Gemini Extraction Fallback...`);
      try {
        // Fallback: If Groq fails, try to get a single-pass synthesis from Gemini
        finalReport = await geminiService.generatePulse(reviews);
        if (finalReport) {
            finalReport.metadata = {
              total_reviews_analyzed: reviews.length,
              engine: "gemini-1.5-flash (Fallback)",
              analysis_date: new Date().toISOString()
            };
            logger.info('Analysis complete using Gemini Fallback strategy.');
            return finalReport;
        }
      } catch (gemError) {
        logger.error(`Gemini Fallback also failed: ${gemError.message}`);
      }
    }

    // --- STEP 2: CONSOLIDATION (Primary: Groq) ---
    if (partialAnalyses.length > 0) {
      logger.info('Consolidating partial analyses into final intelligence report...');
      
      const prompt = `
        Synthesize the following app review cluster analysis into a final report.
        
        Requirements:
        1. Select the TOP 3 most representative VERBATIM quotes.
        2. Generate 5 SPECIFIC, ACTIONABLE recommendations (e.g., "Fix KYC bank upload").
        3. Assign Top 5 Themes with status and impact.
        
        Data:
        ${JSON.stringify(partialAnalyses, null, 2)}

        Return STRICT JSON format:
        {
          "executive_summary": "string",
          "top_themes": [{"theme": "string", "status": "Improving/Critical/Neutral", "impact": "High/Medium/Low"}],
          "weekly_pulse": {
            "total_reviews": ${reviews.length},
            "top_themes": [{"name": "string", "description": "string", "count": "number of reviews"}],
            "quotes": ["string"],
            "action_ideas": ["string"]
          }
        }
      `;

      try {
        const groq = require('groq-sdk');
        const client = new groq({ apiKey: process.env.GROQ_API_KEY });
        const completion = await client.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.3-70b-versatile',
            response_format: { type: "json_object" }
        });
        
        finalReport = JSON.parse(completion.choices[0].message.content);
        
        // Enrich with metadata
        finalReport.metadata = {
            total_reviews_analyzed: reviews.length,
            engine: "groq-llama-3.1-70b-versatile",
            analysis_date: new Date().toISOString()
        };

        logger.info('Analysis complete using Groq Primary strategy.');
      } catch (err) {
        logger.error(`Groq Consolidation Phase Failed: ${err.message}. Trying Gemini Consolidation...`);
        try {
          finalReport = await geminiService.generatePulse(partialAnalyses);
          if (finalReport) {
            finalReport.metadata = {
                total_reviews_analyzed: reviews.length,
                engine: "groq-extraction + gemini-consolidation",
                analysis_date: new Date().toISOString()
            };
            logger.info('Analysis complete using Hybrid strategy (Groq + Gemini).');
          }
        } catch (gemError) {
            logger.error(`Final Gemini Consolidation also failed: ${gemError.message}`);
        }
      }
    }

    return finalReport;
  }
}

module.exports = new Analyzer();
