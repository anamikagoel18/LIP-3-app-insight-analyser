const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../data/pulse_data.db');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);

// Initialize Tables
db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        rating INTEGER NOT NULL,
        date TEXT NOT NULL,
        helpfulCount INTEGER DEFAULT 0,
        source_sort TEXT,
        last_seen TEXT
    );

    CREATE TABLE IF NOT EXISTS pulse_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        total_reviews INTEGER NOT NULL,
        review_limit INTEGER,
        time_range INTEGER,
        report_json TEXT NOT NULL
    );
`);

/**
 * Upsert a single review
 */
const upsertReview = (review) => {
    const stmt = db.prepare(`
        INSERT INTO reviews (id, text, rating, date, helpfulCount, source_sort, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            helpfulCount = excluded.helpfulCount,
            last_seen = excluded.last_seen
    `);
    
    // Map 'score' to 'rating' if necessary, and ensure a default
    const rating = review.score !== undefined ? review.score : (review.rating !== undefined ? review.rating : 0);
    const text = review.text || review.content || '';
    const date = review.date || review.at || new Date().toISOString();

    return stmt.run(
        review.id,
        text,
        rating,
        date,
        review.helpfulCount || 0,
        review.source_sort || 'unknown',
        new Date().toISOString()
    );
};

/**
 * Save a generated pulse report
 */
const savePulseReport = (report) => {
    const stmt = db.prepare(`
        INSERT INTO pulse_reports (timestamp, total_reviews, review_limit, time_range, report_json)
        VALUES (?, ?, ?, ?, ?)
    `);

    return stmt.run(
        report.timestamp || new Date().toISOString(),
        report.total_reviews || 0,
        report.review_limit || 0,
        report.time_range || 0,
        JSON.stringify(report)
    );
};

module.exports = {
    db,
    upsertReview,
    savePulseReport
};
