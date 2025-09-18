from typing import List
from openai import OpenAI
import numpy as np
from loguru import logger
from .config import settings

class EmbeddingService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model_name = settings.openai_embedding_model
        self.dimension = settings.embedding_dimension
        
        logger.info(f"OpenAI embedding service initialized with model: {self.model_name}")
    
    def _generate_embeddings_openai(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using OpenAI API"""
        try:
            response = self.client.embeddings.create(
                model=self.model_name,
                input=texts
            )
            
            embeddings = [data.embedding for data in response.data]
            logger.info(f"Generated {len(embeddings)} embeddings using OpenAI GPT model: {self.model_name}")
            return embeddings
            
        except Exception as e:
            logger.error(f"Error with OpenAI embeddings: {str(e)}")
            raise
    
    def _generate_embeddings_batch(self, texts: List[str], batch_size: int = 10) -> List[List[float]]:
        """Generate embeddings in smaller batches to avoid token limits"""
        all_embeddings = []
        total_texts = len(texts)
        
        for i in range(0, total_texts, batch_size):
            batch = texts[i:i + batch_size]
            try:
                batch_embeddings = self._generate_embeddings_openai(batch)
                all_embeddings.extend(batch_embeddings)
                logger.info(f"Processed embedding batch {i//batch_size + 1}/{(total_texts + batch_size - 1)//batch_size}")
            except Exception as e:
                logger.error(f"Error processing batch {i//batch_size + 1}: {str(e)}")
                raise
        
        return all_embeddings
    
    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using OpenAI GPT model with automatic batching"""
        if not texts:
            return []
        
        # Estimate tokens per text (rough: 1 token ≈ 4 chars)
        avg_chars_per_text = sum(len(text) for text in texts) // len(texts)
        estimated_tokens_per_text = avg_chars_per_text // 4
        
        # OpenAI limit: ~8192 tokens per request for context
        max_tokens_per_request = 8000
        max_texts_per_batch = max(1, max_tokens_per_request // max(estimated_tokens_per_text, 1))
        
        # Use smaller batch if texts are large
        if estimated_tokens_per_text > 500:
            batch_size = min(5, max_texts_per_batch)
        else:
            batch_size = min(20, max_texts_per_batch)
        
        if len(texts) <= batch_size:
            return self._generate_embeddings_openai(texts)
        else:
            logger.info(f"Processing {len(texts)} texts in batches of {batch_size}")
            return self._generate_embeddings_batch(texts, batch_size)
    
    def calculate_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """Calculate cosine similarity between two embeddings"""
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)
        
        # Cosine similarity
        similarity = np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))
        return float(similarity)