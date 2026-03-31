const crypto = require('crypto');
const logger = require('../phase6_utils/logger');

class Processor {
  constructor() {
    this.criticalKeywords = ['crash', 'failed', 'error', 'stuck', 'bug', 'refund', 'issue'];
    
    this.featureKeywords = [
      'kyc', 'onboarding', 'us stocks', 'mutual fund', 'portfolio', 'charge', 'brokerage', 
      'support', 'login', 'otp', 'federal', 'bank', 'withdraw', 'deposit', 'nps', 'etf', 'sip',
      'interface', 'ui', 'ux', 'dashboard', 'verification', 'account', 'wallet'
    ];

    this.problemKeywords = [
      'slow', 'lag', 'bad', 'poor', 'worst', 'ridiculous', 'pathetic', 'useless', 
      'difficult', 'hard', 'waste', 'cheat', 'fraud', 'hidden', 'scam', 'terrible', 'annoying'
    ];

    this.requestKeywords = [
      'please add', 'should have', 'would be better', 'wish', 'want', 'improve', 'bring',
      'need', 'suggest', 'feature', 'option'
    ];

    this.lowSignalPhrases = [
      'good', 'very good', 'nice', 'best', 'ok', 'excellent', 'super', 'perfect', 'awesome', 'great',
      'good app', 'very good app', 'nice app', 'best app', 'ok app', 'good service', 'nice service',
      'issue resolved', 'problem solved', 'thank you', 'thanks', 'very helpful', 'helpful app',
      'all good', 'everything fine', 'fast download', 'wow', 'love it', 'fantastic', 'well improve',
      'best investment app', 'excellent investment app', 'excellent app', 'the best app', 'marvelous app',
      'best app ever', 'love the app', 'amazing app', 'worst app seen', 'scam app', 'fraud app',
      'this scam and fraud', 'this is scam app', 'worst app ever seen'
    ];

    // Expanded common English function words for better heuristic language detection
    this.englishStopWords = [
      'the', 'and', 'this', 'that', 'with', 'from', 'have', 'your', 'for', 'not', 'are', 'was', 'but',
      'they', 'their', 'there', 'which', 'about', 'when', 'more', 'what', 'some', 'could', 'them',
      'is', 'it', 'to', 'my', 'of', 'on', 'in', 'be', 'at', 'an', 'as', 'by', 'if', 'or', 'so'
    ];
  }

  isEnglish(text) {
    const words = text.toLowerCase().split(/\s+/);
    // Simple blacklist for very common non-English markers found in Hinglish/other languages
    const nonEnglishMarkers = ['hai', 'hi', 'hi', 'ko', 'ka', 'ke', 'ki', 'se', 'tha', 'raha'];
    if (words.some(w => nonEnglishMarkers.includes(w))) return false;

    const englishWordCount = words.filter(word => this.englishStopWords.includes(word)).length;
    
    // Require at least 2 English stop words for quality assurance in long reviews
    if (words.length > 8) return englishWordCount >= 2;
    // For short reviews, at least one solid English function word is required
    return englishWordCount > 0;
  }

  isIncoherent(text) {
    if (/(.)\1{4,}/.test(text)) return true;
    const words = text.split(/\s+/);
    for (const word of words) {
        if (word.length > 20 && !/[aeiou]/i.test(word)) return true;
    }
    return false;
  }

  isInsightful(text) {
    const lowerText = text.toLowerCase().trim();
    const wordCount = text.split(/\s+/).length;
    const hasFeature = this.featureKeywords.some(kw => lowerText.includes(kw));
    const cleanLower = lowerText.replace(/[^\w\s]/g, '').trim();

    // 1. Blacklist check early (explicitly useless phrases)
    if (this.lowSignalPhrases.some(phrase => cleanLower.includes(phrase) && cleanLower.length < phrase.length + 5)) {
        // If it's just the phrase or the phrase plus 1 small word, it's low signal
        return false;
    }

    // 2. Minimum 4 words to avoid ultra-short vague text
    if (wordCount < 4) return false;

    // 3. Stricter Detail Rule:
    // If it lacks a specific feature keyword, require more depth (min 8 words) for problems/bugs
    if (!hasFeature && wordCount < 8) return false;

    // 4. Feature-specific feedback is generally kept if it has some length
    if (hasFeature && wordCount >= 3) return true;

    // 5. Whitelists (Only if they passed the stricter length test above)
    if (this.criticalKeywords.some(kw => lowerText.includes(kw))) return true;
    if (this.problemKeywords.some(kw => lowerText.includes(kw))) return true;
    if (this.requestKeywords.some(kw => lowerText.includes(kw))) return true;

    // 6. Detailed User Experience (15+ words if no keywords)
    if (wordCount >= 15 && !this.lowSignalPhrases.includes(cleanLower)) return true;

    return false;
  }

  stripEmojis(text) {
    // This regex matches most emojis including country flags and skin tone modifiers
    return text.replace(/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g, '');
  }

  normalizeForDedup(text) {
    return text.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  }

  process(reviews) {
    logger.info(`Phase 2: Processing ${reviews.length} reviews (Aggressive Filtering)...`);

    const uniqueRawMap = new Map();
    reviews.forEach(r => {
      if (!r.text) return;
      const normalized = this.normalizeForDedup(r.text);
      if (!uniqueRawMap.has(normalized)) {
          uniqueRawMap.set(normalized, r);
      }
    });

    const uniqueReviews = Array.from(uniqueRawMap.values());
    logger.info(`Phase 2: After fuzzy deduplication, ${uniqueReviews.length} unique raw reviews remain.`);

    const cleaned = uniqueReviews.filter(r => {
        const text = this.stripEmojis(r.text.trim());
        const userName = (r.userName || '').toLowerCase().trim();
        const lowerText = text.toLowerCase().trim();

        if (this.isIncoherent(text)) return false;
        if (lowerText === userName) return false;
        if (!this.isEnglish(text)) return false;
        if (!this.isInsightful(text)) return false;

        return true;
    });

    const processed = cleaned.map(r => {
        const cleanText = r.text.trim();
        const scrubbedText = cleanText
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
          .replace(/\b\d{10}\b/g, '[PHONE]');

        return {
          reviewId: r.id || crypto.createHash('md5').update(r.text + r.date).digest('hex'),
          text: scrubbedText,
          rating: r.score,
          date: new Date(r.date).toISOString(),
          helpfulCount: r.thumbsUp || 0
        };
    });

    logger.info(`Phase 2: Aggressive cleaning complete. ${processed.length} high-fidelity reviews retained.`);
    return processed;
  }
}

module.exports = new Processor();
