const db = require('../phase6_utils/db');
const logger = require('../phase6_utils/logger');

class Storage {
  async saveReviews(reviews) {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO reviews (reviewId, text, rating, date, helpfulCount)
      VALUES (@reviewId, @text, @rating, @date, @helpfulCount)
    `);

    const insertMany = db.transaction((revs) => {
      for (const r of revs) insert.run(r);
    });

    try {
      insertMany(reviews);
      logger.info(`Phase 2: Saved ${reviews.length} reviews to storage.`);
    } catch (error) {
      logger.error(`Phase 2 Error: ${error.message}`);
      throw error;
    }
  }

  getAllReviews() {
    return db.prepare('SELECT * FROM reviews ORDER BY date DESC').all();
  }

  async saveReport(weekStart, content) {
    const stmt = db.prepare('INSERT INTO reports (week_start, content) VALUES (?, ?)');
    const result = stmt.run(weekStart, content);
    return result.lastInsertRowid;
  }

  getLatestReport() {
    return db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 1').get();
  }
}

module.exports = new Storage();
