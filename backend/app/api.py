from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pathlib import Path
import shutil
from typing import List
import uuid
from loguru import logger
import json
import asyncio

from .main_service import trademark_service
from .models import SearchRequest, SimilarityResponse, UploadResponse
from .config import settings

# Create FastAPI app
app = FastAPI(
    title="Trademark Hybrid Search API",
    description="API for trademark similarity search using hybrid approach",
    version="1.0.0"
)

# Configure CORS
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:5173", 
    "http://localhost:5174",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Trademark Hybrid Search API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        stats = await trademark_service.get_system_stats()
        return {
            "status": "healthy",
            "stats": stats
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Service unhealthy: {str(e)}"
        )

@app.post("/upload", response_model=UploadResponse)
async def upload_pdf(file: UploadFile = File(...)):
    """Upload and process PDF file"""
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No file provided"
        )
    
    # Validate file extension
    file_extension = Path(file.filename).suffix.lower()
    if file_extension not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {settings.allowed_extensions}"
        )
    
    # Generate unique filename
    unique_filename = f"{uuid.uuid4()}_{file.filename}"
    file_path = Path(settings.upload_dir) / unique_filename
    
    try:
        # Save uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process PDF
        response = await trademark_service.process_pdf(file_path, file.filename)
        return response
        
    except Exception as e:
        # Clean up file on error
        if file_path.exists():
            file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing PDF: {str(e)}"
        )

@app.post("/upload/stream")
async def upload_pdf_stream(file: UploadFile = File(...)):
    """Upload and process PDF file with streaming progress updates"""
    
    # Read file content first (before streaming)
    try:
        if not file.filename:
            return StreamingResponse(
                iter([f"data: {json.dumps({'error': 'No file provided'})}\n\n"]),
                media_type="text/plain"
            )
        
        # Validate file extension
        file_extension = Path(file.filename).suffix.lower()
        if file_extension not in settings.allowed_extensions:
            return StreamingResponse(
                iter([f"data: {json.dumps({'error': f'Invalid file type. Allowed: {settings.allowed_extensions}'})}\n\n"]),
                media_type="text/plain"
            )
        
        # Read file content
        file_content = await file.read()
        
    except Exception as e:
        return StreamingResponse(
            iter([f"data: {json.dumps({'error': f'Error reading file: {str(e)}'})}\n\n"]),
            media_type="text/plain"
        )
    
    async def generate_stream():
        file_path = None
        try:
            # Generate unique filename
            unique_filename = f"{uuid.uuid4()}_{file.filename}"
            file_path = Path(settings.upload_dir) / unique_filename
            
            # Step 1: Save file (10%)
            yield f"data: {json.dumps({'progress': 10, 'status': 'Saving file...'})}\n\n"
            
            try:
                # Save the file content we read earlier
                import aiofiles
                async with aiofiles.open(file_path, 'wb') as buffer:
                    await buffer.write(file_content)
                        
            except Exception as e:
                yield f"data: {json.dumps({'error': f'Error saving file: {str(e)}'})}\n\n"
                return
            
            # Step 2: Process PDF in streaming fashion
            try:
                logger.info(f"Streaming PDF processing: {file.filename}")
                
                # Step 2a: Extract text and parse trademarks (30%)
                yield f"data: {json.dumps({'progress': 30, 'status': 'Extracting text and trademarks...'})}\n\n"
                
                from .pdf_processor import PDFProcessor
                pdf_processor = PDFProcessor()
                text, trademarks = pdf_processor.extract_trademarks_list(file_path)
                
                if not trademarks:
                    yield f"data: {json.dumps({'error': 'No trademarks found in PDF'})}\n\n"
                    return
                
                yield f"data: {json.dumps({'progress': 50, 'status': 'Found trademarks'})}\n\n"
                
                # Step 2b: Generate embeddings (70%)
                yield f"data: {json.dumps({'progress': 70, 'status': 'Generating embeddings...'})}\n\n"
                
                from .embedding_service import EmbeddingService
                embedding_service = EmbeddingService()
                trademark_texts = [tm.get_search_text() for tm in trademarks]
                embeddings = embedding_service.generate_embeddings(trademark_texts)
                
                # Step 2c: Upsert to Pinecone (90%)
                yield f"data: {json.dumps({'progress': 90, 'status': 'Storing in database...'})}\n\n"
                
                from .pinecone_service import PineconeService
                pinecone_service = PineconeService()
                upsert_result = pinecone_service.upsert_trademarks(trademarks, embeddings)
                
                # Step 3: Complete (100%)
                success_count = upsert_result['total_processed']
                failed_count = upsert_result['failed_count']
                
                if failed_count > 0:
                    message = f'PDF processed successfully, {failed_count} failed to upload'
                else:
                    message = 'PDF processed successfully'
                    
                yield f"data: {json.dumps({'progress': 100, 'status': 'completed', 'message': message, 'details': upsert_result})}\n\n"
                
                # Clean up file
                file_path.unlink(missing_ok=True)
                
            except Exception as e:
                logger.error(f"Error processing PDF: {str(e)}")
                file_path.unlink(missing_ok=True)
                yield f"data: {json.dumps({'error': f'Error processing PDF: {str(e)}'})}\n\n"
                
        except Exception as e:
            logger.error(f"Streaming error: {str(e)}")
            yield f"data: {json.dumps({'error': f'Server error: {str(e)}'})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/plain",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable Nginx buffering
        }
    )

@app.post("/search", response_model=SimilarityResponse)
async def search_trademarks(request: dict):
    """Search for similar trademarks (Frontend compatible)"""
    try:
        # Convert frontend format to backend format
        # Frontend sends: {"query": "searchQuery", "top_k": 5}
        # Backend expects: {"trademark": "searchQuery", "topK": 5}
        
        query = request.get("query", "").strip()
        if not query:
            return SimilarityResponse(
                targetTrademark="",
                totalCompared=0,
                similarTrademarksFound=0,
                results=[]
            )
        
        search_request = SearchRequest(
            trademark=query,
            topK=request.get("top_k", settings.default_top_k),
            threshold=settings.similarity_threshold  # Use config threshold (0.15)
        )
        
        logger.info(f"Search request: '{query}' with threshold {settings.similarity_threshold}")
        response = await trademark_service.search_similar_trademarks(search_request)
        
        # Log results for debugging
        logger.info(f"Search completed: found {response.similarTrademarksFound} similar trademarks")
        
        return response
        
    except Exception as e:
        logger.error(f"Search error: {str(e)}")
        # Return empty results instead of error for better UX
        return SimilarityResponse(
            targetTrademark=request.get("query", ""),
            totalCompared=0,
            similarTrademarksFound=0,
            results=[]
        )

@app.get("/search")
async def search_trademarks_get(
    trademark: str,
    top_k: int = None,
    threshold: float = None
):
    """Search for similar trademarks (GET endpoint)"""
    try:
        # Use config defaults if not provided
        if top_k is None:
            top_k = settings.default_top_k
        if threshold is None:
            threshold = settings.similarity_threshold
            
        if not trademark.strip():
            return SimilarityResponse(
                targetTrademark="",
                totalCompared=0,
                similarTrademarksFound=0,
                results=[]
            )
        
        request = SearchRequest(
            trademark=trademark.strip(),
            topK=top_k,
            threshold=threshold
        )
        
        logger.info(f"GET search request: '{trademark}' with threshold {threshold}")
        response = await trademark_service.search_similar_trademarks(request)
        
        logger.info(f"GET search completed: found {response.similarTrademarksFound} similar trademarks")
        return response
        
    except Exception as e:
        logger.error(f"GET search error: {str(e)}")
        # Return empty results instead of error for better UX
        return SimilarityResponse(
            targetTrademark=trademark,
            totalCompared=0,
            similarTrademarksFound=0,
            results=[]
        )

@app.delete("/document/{document_id}")
async def delete_document(document_id: str):
    """Delete a document and its vectors"""
    try:
        success = await trademark_service.delete_document(document_id)
        return {"success": success, "message": f"Document {document_id} deleted"}
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error deleting document: {str(e)}"
        )

@app.post("/similarity", response_model=SimilarityResponse)
async def similarity_analysis(request: SearchRequest):
    """Advanced similarity analysis with detailed breakdown"""
    try:
        response = await trademark_service.search_similar_trademarks(request)
        return response
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error in similarity analysis: {str(e)}"
        )

@app.get("/stats")
async def get_system_stats():
    """Get system statistics"""
    try:
        stats = await trademark_service.get_system_stats()
        return stats
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error getting stats: {str(e)}"
        )

# Error handlers
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.api:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )