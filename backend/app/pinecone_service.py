from typing import List, Optional, Dict, Any
from pinecone import Pinecone, ServerlessSpec
from loguru import logger
from .config import settings
from .models import TextChunk, IndividualTrademark

class PineconeService:
    def __init__(self):
        self.api_key = settings.pinecone_api_key
        self.index_name = settings.pinecone_index_name
        self.index_host = settings.pinecone_index_host
        
        # Initialize Pinecone
        pc = Pinecone(api_key=self.api_key)
        self.index = pc.Index(self.index_name)
        
        logger.info(f"Initialized Pinecone service with index: {self.index_name}")
    
    def upsert_vectors(self, chunks: List[TextChunk], embeddings: List[List[float]]) -> bool:
        """Upsert vectors to Pinecone"""
        if len(chunks) != len(embeddings):
            raise ValueError("Number of chunks must match number of embeddings")
        
        vectors = []
        for chunk, embedding in zip(chunks, embeddings):
            vector = {
                "id": f"{chunk.metadata.documentId}_chunk_{chunk.chunk_index}",
                "values": embedding,
                "metadata": {
                    "documentId": chunk.metadata.documentId,
                    "namaMerek": chunk.metadata.namaMerek,
                    "nomorPermohonan": chunk.metadata.nomorPermohonan,
                    "kelasBarangJasa": chunk.metadata.kelasBarangJasa,
                    "namaPemohon": chunk.metadata.namaPemohon,
                    "uraianBarangJasa": chunk.metadata.uraianBarangJasa,
                    "text": chunk.text,
                    "chunkIndex": chunk.chunk_index,
                    "type": "trademark_data",
                    "sourceDocument": chunk.metadata.sourceDocument,
                    "uploadDate": chunk.metadata.uploadDate.isoformat()
                }
            }
            vectors.append(vector)
        
        try:
            self.index.upsert(vectors=vectors)
            logger.info(f"Successfully upserted {len(vectors)} vectors to Pinecone")
            return True
            
        except Exception as e:
            logger.error(f"Error upserting vectors to Pinecone: {str(e)}")
            raise
    
    def upsert_trademarks(self, trademarks: List[IndividualTrademark], embeddings: List[List[float]]) -> dict:
        """Upsert individual trademarks to Pinecone (NEW STRATEGY) with optimized batching and timeout handling"""
        if len(trademarks) != len(embeddings):
            raise ValueError("Number of trademarks must match number of embeddings")
        
        # Reduced batch size for better timeout handling
        batch_size = 50  # Reduced from 100 to 50
        total_processed = 0
        failed_count = 0
        failed_ids = []
        max_retries = 3
        
        logger.info(f"Starting upsert of {len(trademarks)} trademarks in batches of {batch_size}")
        
        for i in range(0, len(trademarks), batch_size):
            batch_trademarks = trademarks[i:i + batch_size]
            batch_embeddings = embeddings[i:i + batch_size]
            batch_num = i//batch_size + 1
            total_batches = (len(trademarks) + batch_size - 1)//batch_size
            
            vectors = []
            for trademark, embedding in zip(batch_trademarks, batch_embeddings):
                vector = {
                    "id": trademark.trademarkId,
                    "values": embedding,
                    "metadata": {
                        "trademarkId": trademark.trademarkId,
                        "namaMerek": trademark.namaMerek,
                        "nomorPermohonan": trademark.nomorPermohonan,
                        "kelasBarangJasa": trademark.kelasBarangJasa,
                        "namaPemohon": trademark.namaPemohon,
                        "uraianBarangJasa": trademark.uraianBarangJasa,
                        "documentId": trademark.documentId,
                        "type": "individual_trademark",
                        "sourceDocument": trademark.sourceDocument,
                        "uploadDate": trademark.uploadDate.isoformat(),
                        "searchText": trademark.get_search_text()
                    }
                }
                vectors.append(vector)
            
            # Retry mechanism for each batch
            retry_count = 0
            batch_success = False
            
            while retry_count < max_retries and not batch_success:
                try:
                    logger.info(f"Upserting batch {batch_num}/{total_batches} (attempt {retry_count + 1}): {len(vectors)} trademarks")
                    self.index.upsert(vectors=vectors)
                    total_processed += len(vectors)
                    batch_success = True
                    logger.info(f"✅ Batch {batch_num}/{total_batches} completed successfully")
                    
                    # Add small delay between batches to avoid rate limits
                    if batch_num < total_batches:
                        import time
                        time.sleep(0.5)  # 500ms delay between batches
                        
                except Exception as e:
                    retry_count += 1
                    logger.warning(f"⚠️ Batch {batch_num} attempt {retry_count} failed: {str(e)}")
                    
                    if retry_count < max_retries:
                        # Exponential backoff
                        import time
                        delay = min(2 ** retry_count, 10)  # Max 10 seconds
                        logger.info(f"Retrying in {delay} seconds...")
                        time.sleep(delay)
                    else:
                        logger.error(f"❌ Batch {batch_num} failed after {max_retries} attempts")
                        failed_count += len(vectors)
                        failed_ids.extend([v["id"] for v in vectors])
        
        logger.info(f"Upsert completed: {total_processed} successful, {failed_count} failed")
        if failed_count > 0:
            logger.warning(f"Failed trademark IDs (first 10): {failed_ids[:10]}")
        
        return {
            "success": True,
            "total_processed": total_processed,
            "failed_count": failed_count,
            "failed_ids": failed_ids
        }
    
    def query_similar_vectors(self, query_embedding: List[float], top_k: int = 5, 
                            filter_dict: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Query similar vectors from Pinecone"""
        try:
            query_params = {
                "vector": query_embedding,
                "top_k": top_k,
                "include_metadata": True
            }
            
            if filter_dict:
                query_params["filter"] = filter_dict
            
            response = self.index.query(**query_params)
            
            matches = []
            for match in response.get("matches", []):
                matches.append({
                    "id": match["id"],
                    "score": match["score"],
                    "metadata": match["metadata"]
                })
            
            logger.info(f"Found {len(matches)} similar vectors")
            return matches
            
        except Exception as e:
            logger.error(f"Error querying Pinecone: {str(e)}")
            raise
    
    def delete_document_vectors(self, document_id: str) -> bool:
        """Delete all vectors for a specific document"""
        try:
            # Get all vectors for this document
            response = self.index.query(
                vector=[0.0] * settings.embedding_dimension,
                top_k=10000,
                include_metadata=True,
                filter={"documentId": {"$eq": document_id}}
            )
            
            if response.get("matches"):
                vector_ids = [match["id"] for match in response["matches"]]
                self.index.delete(ids=vector_ids)
                logger.info(f"Deleted {len(vector_ids)} vectors for document {document_id}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error deleting vectors: {str(e)}")
            raise
    
    def get_stats(self) -> Dict[str, Any]:
        """Get index statistics"""
        try:
            stats = self.index.describe_index_stats()
            return {
                "total_vectors": stats.get("total_vector_count", 0),
                "dimension": stats.get("dimension", 0),
                "index_fullness": stats.get("index_fullness", 0)
            }
            
        except Exception as e:
            logger.error(f"Error getting Pinecone stats: {str(e)}")
            return {"total_vectors": 0, "dimension": 0, "index_fullness": 0}