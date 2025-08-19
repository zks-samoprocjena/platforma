"""Search caching service using Redis."""

import json
import hashlib
from typing import List, Optional, Dict, Any, Tuple
from uuid import UUID
from datetime import timedelta

import redis.asyncio as redis
from langchain.schema import Document
import structlog

from app.core.config import settings


logger = structlog.get_logger()


class SearchCacheService:
    """Service for caching search results in Redis."""
    
    def __init__(self):
        self.redis_client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True
        )
        self.cache_ttl = timedelta(hours=1)  # 1 hour cache
        self.cache_prefix = "search_cache"
    
    def _generate_cache_key(
        self,
        query: str,
        organization_id: UUID,
        k: int,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Generate a unique cache key for the search."""
        
        # Create a deterministic string from parameters
        key_parts = [
            query.lower().strip(),
            str(organization_id),
            str(k),
            json.dumps(filter_metadata or {}, sort_keys=True),
        ]
        
        key_string = "|".join(key_parts)
        
        # Hash to create a shorter key
        key_hash = hashlib.md5(key_string.encode()).hexdigest()
        
        return f"{self.cache_prefix}:{key_hash}"
    
    async def get_cached_results(
        self,
        query: str,
        organization_id: UUID,
        k: int,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[List[Tuple[Document, float]]]:
        """Get cached search results if available."""
        
        try:
            cache_key = self._generate_cache_key(
                query, organization_id, k, filter_metadata
            )
            
            cached_data = await self.redis_client.get(cache_key)
            
            if not cached_data:
                return None
            
            # Deserialize cached results
            cached_results = json.loads(cached_data)
            
            # Reconstruct Document objects
            results = []
            for item in cached_results:
                doc = Document(
                    page_content=item["page_content"],
                    metadata=item["metadata"]
                )
                score = item["score"]
                results.append((doc, score))
            
            logger.info(
                "search_cache_hit",
                query=query[:50],
                num_results=len(results),
            )
            
            return results
            
        except Exception as e:
            logger.error(
                "search_cache_get_error",
                error=str(e),
                query=query[:50],
            )
            return None
    
    async def cache_results(
        self,
        query: str,
        organization_id: UUID,
        k: int,
        results: List[Tuple[Document, float]],
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Cache search results."""
        
        try:
            cache_key = self._generate_cache_key(
                query, organization_id, k, filter_metadata
            )
            
            # Serialize results for caching
            cache_data = []
            for doc, score in results:
                cache_data.append({
                    "page_content": doc.page_content,
                    "metadata": doc.metadata,
                    "score": score,
                })
            
            # Store in Redis with TTL
            await self.redis_client.setex(
                cache_key,
                self.cache_ttl,
                json.dumps(cache_data),
            )
            
            logger.info(
                "search_results_cached",
                query=query[:50],
                num_results=len(results),
                ttl_seconds=self.cache_ttl.total_seconds(),
            )
            
            return True
            
        except Exception as e:
            logger.error(
                "search_cache_set_error",
                error=str(e),
                query=query[:50],
            )
            return False
    
    async def invalidate_cache_for_organization(
        self,
        organization_id: UUID,
    ) -> int:
        """Invalidate all cached searches for an organization."""
        
        try:
            # Pattern to match all cache keys for the organization
            pattern = f"{self.cache_prefix}:*{str(organization_id)}*"
            
            # Find all matching keys
            keys = []
            async for key in self.redis_client.scan_iter(match=pattern):
                keys.append(key)
            
            if keys:
                # Delete all matching keys
                deleted = await self.redis_client.delete(*keys)
                
                logger.info(
                    "organization_cache_invalidated",
                    organization_id=str(organization_id),
                    keys_deleted=deleted,
                )
                
                return deleted
            
            return 0
            
        except Exception as e:
            logger.error(
                "cache_invalidation_error",
                error=str(e),
                organization_id=str(organization_id),
            )
            return 0
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        
        try:
            # Count cache keys
            pattern = f"{self.cache_prefix}:*"
            count = 0
            
            async for _ in self.redis_client.scan_iter(match=pattern):
                count += 1
            
            # Get Redis info
            info = await self.redis_client.info("memory")
            
            return {
                "cached_searches": count,
                "memory_used_mb": round(info.get("used_memory", 0) / 1024 / 1024, 2),
                "cache_ttl_hours": self.cache_ttl.total_seconds() / 3600,
            }
            
        except Exception as e:
            logger.error("cache_stats_error", error=str(e))
            return {
                "cached_searches": 0,
                "memory_used_mb": 0,
                "cache_ttl_hours": self.cache_ttl.total_seconds() / 3600,
                "error": str(e),
            }
    
    async def close(self):
        """Close Redis connection."""
        await self.redis_client.close()