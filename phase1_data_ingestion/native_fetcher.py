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
        all_reviews = []
        token = None
        cutoff = None
        
        if days > 0:
            cutoff = datetime.datetime.now() - datetime.timedelta(days=days)

        # 1. NEWEST reviews with Pagination
        # We attempt to reach the limit AND the date cutoff if specified
        max_pages = 5 # Safety break to avoid infinite fetching
        page_count = 0
        
        while len(all_reviews) < limit and page_count < max_pages:
            batch = reviews(
                self.app_id,
                lang='en',
                country='in', 
                sort=Sort.NEWEST,
                count=100 if limit <= 100 else 200,
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
            
            # If we've already hit dates older than our cutoff in this batch, stop fetching
            if cutoff and result and result[-1]['at'].replace(tzinfo=None) < cutoff:
                break
            
            # If no token, no more pages
            if not token:
                break

        # 2. If we still don't have enough to meet 'limit', try MOST_RELEVANT 
        # (Only if not strictly bound by 'days', as MOST_RELEVANT dates vary widely)
        if len(all_reviews) < limit and (not cutoff or len(all_reviews) == 0):
            batch_rel = reviews(
                self.app_id,
                lang='en',
                country='in',
                sort=Sort.MOST_RELEVANT,
                count=limit - len(all_reviews)
            )
            if batch_rel and isinstance(batch_rel, (tuple, list)) and len(batch_rel) > 0:
                result_relevant = batch_rel[0]
                existing_ids = {r['reviewId'] for r in all_reviews}
                for r in result_relevant:
                    if r['reviewId'] not in existing_ids:
                        if not cutoff or r['at'].replace(tzinfo=None) >= cutoff:
                            all_reviews.append(r)
        
        # Final Limit & Sort (by date descending)
        all_reviews.sort(key=lambda x: x['at'], reverse=True)
        return all_reviews[:limit]

native_fetcher = NativeFetcher()
