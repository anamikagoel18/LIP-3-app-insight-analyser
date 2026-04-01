from google_play_scraper import Sort, reviews, reviews_all
import datetime
from typing import List, Dict, Any, Optional

class NativeFetcher:
    def __init__(self, app_id: str = "in.indwealth"):
        self.app_id = app_id

    def fetch_reviews(self, limit: int = 100, days: int = 0) -> List[Dict[str, Any]]:
        """
        Fetch reviews using the native google-play-scraper library.
        Optimized with continuation tokens for deep date filtering.
        """
        print(f"[FETCH] Requesting up to {limit} reviews (Range: {days} days)...")
        all_reviews = []
        token = None
        cutoff = None
        
        if days > 0:
            cutoff = datetime.datetime.now() - datetime.timedelta(days=days)

        # 1. NEWEST reviews with Pagination
        # We increase max_pages to 20 to ensure 90-day coverage (up to 4000 reviews)
        max_pages = 20 if days > 30 else 10
        page_count = 0
        
        while len(all_reviews) < limit and page_count < max_pages:
            print(f"[FETCH] Requesting batch {page_count + 1} (Token: {'Yes' if token else 'No'})...")
            batch = reviews(
                self.app_id,
                lang='en',
                country='in', 
                sort=Sort.NEWEST,
                count=200, # Max batch size for better performance
                continuation_token=token
            )
            
            if not batch or not isinstance(batch, (tuple, list)) or len(batch) < 2:
                break
                
            result = batch[0]
            token = batch[1]
            
            if not result:
                break
                
            filtered = result
            if cutoff:
                filtered = [r for r in result if r['at'].replace(tzinfo=None) >= cutoff]
                
            all_reviews.extend(filtered)
            page_count += 1
            
            # If the last item in the *unfiltered* result is older than our cutoff,
            # we've gone far enough back in history.
            if cutoff and result and result[-1]['at'].replace(tzinfo=None) < cutoff:
                break
            
            # If no continuation token, we've hit the end of the line
            if not token:
                break

        # 2. If we still don't have enough to meet 'limit' (and NOT strictly date-bound),
        # try MOST_RELEVANT as a fallback.
        if len(all_reviews) < limit and not cutoff:
            batch_rel = reviews(
                self.app_id,
                lang='en',
                country='in',
                sort=Sort.MOST_RELEVANT,
                count=min(200, limit - len(all_reviews))
            )
            if batch_rel and isinstance(batch_rel, (tuple, list)) and len(batch_rel) > 0:
                result_relevant = batch_rel[0]
                existing_ids = {r['reviewId'] for r in all_reviews}
                for r in result_relevant:
                    if r['reviewId'] not in existing_ids:
                        all_reviews.append(r)
        
        # Sort by date descending and truncate to limit
        all_reviews.sort(key=lambda x: x['at'], reverse=True)
        return all_reviews[:limit]

native_fetcher = NativeFetcher()
