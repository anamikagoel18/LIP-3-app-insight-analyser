const gplay = require('google-play-scraper').default || require('google-play-scraper');
const logger = require('../phase6_utils/logger');

const APP_ID = 'in.indwealth';
const REVIEWS_LIMIT = 5000;

class ReviewFetcher {
  /**
   * Fetch reviews from Google Play Store across multiple sorts to bypass pagination limits
   */
  async fetchReviews(limit = REVIEWS_LIMIT) {
    try {
      logger.info(`Phase 1: Multi-Source Fetch starting (Target: ${limit})...`);
      
      const sorts = [
        { name: 'NEWEST', value: gplay.sort.NEWEST },
        { name: 'HELPFULNESS', value: gplay.sort.HELPFULNESS },
        { name: 'RATING', value: gplay.sort.RATING }
      ];

      // We fetch slightly more from each to account for overlaps
      const perSortLimit = Math.max(limit, 1000);
      
      const fetchTasks = sorts.map(async (srt) => {
        logger.info(`Phase 1: Fetching up to ${perSortLimit} reviews via [${srt.name}]...`);
        let sortReviews = [];
        let nextToken = undefined;
        
        while (sortReviews.length < perSortLimit) {
          const result = await gplay.reviews({
            appId: APP_ID,
            sort: srt.value,
            num: 100,
            paginate: true,
            nextPaginationToken: nextToken
          });

          if (!result || !result.data || result.data.length === 0) break;
          sortReviews = sortReviews.concat(result.data);
          nextToken = result.nextPaginationToken;

          if (!nextToken || sortReviews.length >= perSortLimit) break;
        }
        return sortReviews;
      });

      const allResults = await Promise.all(fetchTasks);
      const combined = [].concat(...allResults);
      
      // Deduplicate using unique 'id'
      const uniqueMap = new Map();
      combined.forEach(r => {
        if (!uniqueMap.has(r.id)) {
          uniqueMap.set(r.id, r);
        }
      });

      const uniqueReviews = Array.from(uniqueMap.values());
      logger.info(`Phase 1: Multi-Source Fetch complete. [Original: ${combined.length} | Unique: ${uniqueReviews.length}].`);
      
      return uniqueReviews;
    } catch (error) {
      logger.error(`Phase 1 Error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new ReviewFetcher();
