from pathlib import Path
from typing import List
from loguru import logger

from .pdf_processor import PDFProcessor
from .text_chunker import TextChunker
from .embedding_service import EmbeddingService
from .pinecone_service import PineconeService
from .similarity_service import SimilarityService
from .models import UploadResponse, SimilarityResponse, SearchRequest
from .config import settings

class TrademarkService:
    def __init__(self):
        self.pdf_processor = PDFProcessor()
        self.text_chunker = TextChunker(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap
        )
        self.embedding_service = EmbeddingService()
        self.pinecone_service = PineconeService()
        self.similarity_service = SimilarityService()
        
        logger.info("Trademark service initialized")
    
    def _calculate_optimal_chunk_size(self, text_length: int) -> int:
        """Calculate optimal chunk size based on text length to avoid API limits"""
        # Absolute hard limit: max 400 tokens per chunk (1600 characters)
        # This ensures we never exceed OpenAI's 8192 token limit
        return 400  # 400 chars ≈ 100 tokens - very safe limit
        # Very aggressive chunking for large files
        # Target max 500 tokens per chunk (2000 chars)
        # For very large files, use even smaller chunks
        
        if text_length > 1000000:  # Very large files > 1M chars
            return 800  # ~200 tokens per chunk
        elif text_length > 500000:  # Large files > 500K chars
            return 1000  # ~250 tokens per chunk
        elif text_length > 100000:  # Medium large files > 100K chars
            return 1500  # ~375 tokens per chunk
        else:
            return min(settings.chunk_size, 2000)  # Default hard limit
        # Hard limit for embedding: max 8000 tokens per text
        # 1 token ≈ 4 characters, so max 2000 characters per chunk
        max_chars_per_chunk = 2000  # Hard limit for safety
        
        # Always use the smaller of configured chunk size or hard limit
        return min(settings.chunk_size, max_chars_per_chunk)
    
    def _process_chunks_in_batches(self, chunks: List, batch_size: int = 50):
        """Process chunks in smaller batches to avoid API limits"""
        total_chunks = len(chunks)
        processed = 0
        
        for i in range(0, total_chunks, batch_size):
            batch = chunks[i:i + batch_size]
            chunk_texts = [chunk.text for chunk in batch]
            
            # Generate embeddings for this batch
            embeddings = self.embedding_service.generate_embeddings(chunk_texts)
            
            # Upsert this batch to Pinecone
            self.pinecone_service.upsert_vectors(batch, embeddings)
            
            processed += len(batch)
            logger.info(f"Processed batch {i//batch_size + 1}/{(total_chunks + batch_size - 1)//batch_size}")
        
        return total_chunks
    
    async def process_pdf(self, file_path: Path, filename: str) -> UploadResponse:
        """Process PDF file dengan strategi baru: satu merek = satu vector dengan optimasi timeout"""
        try:
            logger.info(f"Processing PDF: {filename}")
            
            # Step 1: Extract text and parse individual trademarks (NEW STRATEGY)
            logger.info("Step 1: Extracting trademarks from PDF...")
            text, trademarks = self.pdf_processor.extract_trademarks_list(file_path)
            
            if not trademarks:
                raise ValueError("No trademarks found in PDF")
            
            logger.info(f"Found {len(trademarks)} individual trademarks")
            
            # Log sample trademark IDs untuk debugging
            if len(trademarks) > 0:
                logger.info(f"Sample trademark IDs: {[tm.trademarkId for tm in trademarks[:5]]}")
                logger.info(f"Duplicate check - Total: {len(trademarks)}, Unique IDs: {len(set(tm.trademarkId for tm in trademarks))}")
            
            # Step 2: Generate embeddings untuk setiap merek dengan progress logging
            logger.info("Step 2: Generating embeddings...")
            trademark_texts = [tm.get_search_text() for tm in trademarks]
            
            # Process embeddings in smaller batches to avoid memory issues
            embedding_batch_size = 100
            all_embeddings = []
            
            for i in range(0, len(trademark_texts), embedding_batch_size):
                batch_texts = trademark_texts[i:i + embedding_batch_size]
                batch_num = i//embedding_batch_size + 1
                total_embedding_batches = (len(trademark_texts) + embedding_batch_size - 1)//embedding_batch_size
                
                logger.info(f"Generating embeddings batch {batch_num}/{total_embedding_batches}: {len(batch_texts)} texts")
                batch_embeddings = self.embedding_service.generate_embeddings(batch_texts)
                all_embeddings.extend(batch_embeddings)
            
            logger.info(f"Generated {len(all_embeddings)} embeddings successfully")
            
            # Step 3: Upsert individual trademarks to Pinecone (NEW STRATEGY) with progress logging
            logger.info("Step 3: Storing trademarks in Pinecone database...")
            upsert_result = self.pinecone_service.upsert_trademarks(trademarks, all_embeddings)
            
            # Log detailed results
            logger.info(f"Upsert result: {upsert_result['total_processed']} successful, {upsert_result['failed_count']} failed")
            if upsert_result['failed_count'] > 0:
                logger.warning(f"Failed trademark IDs: {upsert_result['failed_ids'][:10]}...")  # Show first 10
            
            # Clean up uploaded file
            file_path.unlink(missing_ok=True)
            logger.info("PDF processing completed successfully")
            
            return UploadResponse(
                success=True,
                message=f"PDF processed successfully with {len(trademarks)} trademarks",
                documentId=trademarks[0].documentId if trademarks else "unknown",
                filename=filename,
                chunksProcessed=len(trademarks)  # Use chunksProcessed for compatibility
            )
            
        except Exception as e:
            logger.error(f"Error processing PDF: {str(e)}")
            # Clean up file on error
            file_path.unlink(missing_ok=True)
            raise
    
    async def search_similar_trademarks(self, request: SearchRequest) -> SimilarityResponse:
        """Search for similar trademarks"""
        try:
            logger.info(f"Searching for similar trademarks: {request.trademark}")
            
            # Step 1: Generate query embedding
            query_embedding = self.embedding_service.generate_embeddings([request.trademark])[0]
            
            # Step 2: Query Pinecone
            pinecone_results = self.pinecone_service.query_similar_vectors(
                query_embedding,
                top_k=request.topK,
                filter_dict={"type": "individual_trademark"}
            )
            
            # Step 3: Calculate detailed similarities
            response = self.similarity_service.process_search_results(
                request.trademark,
                pinecone_results,
                threshold=request.threshold
            )
            
            logger.info(f"Search completed: {response.similarTrademarksFound} similar trademarks found")
            return response
            
        except Exception as e:
            logger.error(f"Error searching trademarks: {str(e)}")
            raise
    
    async def get_system_stats(self) -> dict:
        """Get system statistics"""
        try:
            pinecone_stats = self.pinecone_service.get_stats()
            
            return {
                "pinecone": pinecone_stats,
                "config": {
                    "chunk_size": settings.chunk_size,
                    "chunk_overlap": settings.chunk_overlap,
                    "embedding_dimension": settings.embedding_dimension,
                    "similarity_threshold": settings.similarity_threshold
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting system stats: {str(e)}")
            raise
    
    async def delete_document(self, document_id: str) -> bool:
        """Delete a document and its vectors"""
        try:
            self.pinecone_service.delete_document_vectors(document_id)
            logger.info(f"Deleted document: {document_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting document: {str(e)}")
            raise

# Create service instance
trademark_service = TrademarkService()