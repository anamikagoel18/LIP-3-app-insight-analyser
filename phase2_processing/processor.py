import re
import hashlib
import datetime
from typing import List, Dict, Any

class Processor:
    def __init__(self):
        self.critical_keywords = ['crash', 'failed', 'error', 'stuck', 'bug', 'refund', 'issue']
        
        self.feature_keywords = [
            'kyc', 'onboarding', 'us stocks', 'mutual fund', 'portfolio', 'charge', 'brokerage', 
            'support', 'login', 'otp', 'federal', 'bank', 'withdraw', 'deposit', 'nps', 'etf', 'sip',
            'interface', 'ui', 'ux', 'dashboard', 'verification', 'account', 'wallet'
        ]

        self.problem_keywords = [
            'slow', 'lag', 'bad', 'poor', 'worst', 'ridiculous', 'pathetic', 'useless', 
            'difficult', 'hard', 'waste', 'cheat', 'fraud', 'hidden', 'scam', 'terrible', 'annoying'
        ]

        self.request_keywords = [
            'please add', 'should have', 'would be better', 'wish', 'want', 'improve', 'bring',
            'need', 'suggest', 'feature', 'option'
        ]

        self.low_signal_phrases = [
            'good', 'very good', 'nice', 'best', 'ok', 'excellent', 'super', 'perfect', 'awesome', 'great',
            'good app', 'very good app', 'nice app', 'best app', 'ok app', 'good service', 'nice service',
            'issue resolved', 'problem solved', 'thank you', 'thanks', 'very helpful', 'helpful app',
            'all good', 'everything fine', 'fast download', 'wow', 'love it', 'fantastic', 'well improve',
            'best investment app', 'excellent investment app', 'excellent app', 'the best app', 'marvelous app',
            'best app ever', 'love the app', 'amazing app', 'worst app seen', 'scam app', 'fraud app',
            'this scam and fraud', 'this is scam app', 'worst app ever seen'
        ]

        # Common English stop words for heuristic language detection
        self.english_stop_words = [
            'the', 'and', 'this', 'that', 'with', 'from', 'have', 'your', 'for', 'not', 'are', 'was', 'but',
            'they', 'their', 'there', 'which', 'about', 'when', 'more', 'what', 'some', 'could', 'them',
            'is', 'it', 'to', 'my', 'of', 'on', 'in', 'be', 'at', 'an', 'as', 'by', 'if', 'or', 'so'
        ]

    def is_english(self, text: str) -> bool:
        words = text.lower().split()
        if not words: return False
        
        # Simple blacklist for common non-English markers (Hinglish)
        non_english_markers = ['hai', 'hi', 'ko', 'ka', 'ke', 'ki', 'se', 'tha', 'raha']
        if any(w in words for w in non_english_markers):
            return False

        english_word_count = sum(1 for word in words if word in self.english_stop_words)
        
        if len(words) > 8:
            return english_word_count >= 2
        return english_word_count > 0

    def is_incoherent(self, text: str) -> bool:
        # Check for repetitive characters (e.g., "aaaaa")
        if re.search(r'(.)\1{4,}', text):
            return True
        
        words = text.split()
        for word in words:
            # Long words without vowels
            if len(word) > 20 and not re.search(r'[aeiou]', word, re.I):
                return True
        return False

    def is_insightful(self, text: str) -> bool:
        lower_text = text.lower().strip()
        words = lower_text.split()
        word_count = len(words)
        
        has_feature = any(kw in lower_text for kw in self.feature_keywords)
        
        # Clean alpha-numeric only for phrase checking
        clean_lower = re.sub(r'[^\w\s]', '', lower_text).strip()

        # 1. Blacklist check (explicitly useless phrases)
        if any(phrase in clean_lower and len(clean_lower) < len(phrase) + 5 for phrase in self.low_signal_phrases):
            return False

        # 2. Minimum 4 words to avoid ultra-short vague text
        if word_count < 4:
            return False

        # 3. Stricter Detail Rule: If no feature keyword, require more depth
        if not has_feature and word_count < 8:
            return False

        # 4. Feature-specific feedback is generally kept
        if has_feature and word_count >= 3:
            return True

        # 5. Whitelists
        if any(kw in lower_text for kw in self.critical_keywords): return True
        if any(kw in lower_text for kw in self.problem_keywords): return True
        if any(kw in lower_text for kw in self.request_keywords): return True

        # 6. Detailed User Experience (15+ words if no keywords)
        if word_count >= 15 and clean_lower not in self.low_signal_phrases:
            return True

        return False

    def strip_emojis(self, text: str) -> str:
        # Simple regex-based emoji stripping
        return re.sub(r'[^\x00-\x7F]+', '', text)

    def normalize_for_dedup(self, text: str) -> str:
        return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', '', text.lower().strip()))

    def process(self, reviews: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        unique_raw_map = {}
        for r in reviews:
            text = r.get('content') or r.get('text')
            if not text: continue
            
            normalized = self.normalize_for_dedup(text)
            if normalized not in unique_raw_map:
                unique_raw_map[normalized] = r

        unique_reviews = list(unique_raw_map.values())
        
        cleaned = []
        for r in unique_reviews:
            raw_text = r.get('content') or r.get('text', '')
            text = self.strip_emojis(raw_text.strip())
            user_name = (r.get('userName') or '').lower().strip()
            lower_text = text.lower().strip()

            if self.is_incoherent(text): continue
            if lower_text == user_name: continue
            if not self.is_english(text): continue
            if not self.is_insightful(text): continue

            cleaned.append(r)

        processed = []
        for r in cleaned:
            raw_text = r.get('content') or r.get('text', '').strip()
            
            # PII Scrubbing
            scrubbed_text = re.sub(r'[a-zA-Z0-9._%+-]+@ [a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[EMAIL]', raw_text)
            scrubbed_text = re.sub(r'\b\d{10}\b', '[PHONE]', scrubbed_text)

            review_date = r.get('at') or r.get('date')
            if isinstance(review_date, str):
                try:
                    # Handle different date formats
                    if review_date.endswith('Z'):
                        date_obj = datetime.datetime.fromisoformat(review_date.replace('Z', '+00:00'))
                    else:
                        date_obj = datetime.datetime.fromisoformat(review_date)
                except:
                    date_obj = datetime.datetime.now()
            else:
                date_obj = review_date or datetime.datetime.now()

            processed.append({
                'reviewId': r.get('reviewId') or r.get('id') or hashlib.md5(f"{raw_text}{review_date}".encode()).hexdigest(),
                'text': scrubbed_text,
                'rating': r.get('score') or r.get('rating'),
                'date': date_obj.isoformat() if hasattr(date_obj, 'isoformat') else str(date_obj),
                'helpfulCount': r.get('thumbsUpCount') or r.get('thumbsUp') or 0
            })

        return processed

processor = Processor()
