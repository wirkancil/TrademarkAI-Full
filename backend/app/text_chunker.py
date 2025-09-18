from typing import List
from loguru import logger
from .models import TextChunk, TrademarkMetadata

class TextChunker:
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
    
    def chunk_text(self, text: str, metadata: TrademarkMetadata) -> List[TextChunk]:
        """Split text into overlapping chunks"""
        if not text.strip():
            logger.warning("Empty text provided for chunking")
            return []
        
        chunks = []
        text_length = len(text)
        start = 0
        chunk_index = 0
        
        while start < text_length:
            # Calculate end position
            end = start + self.chunk_size
            
            # If this is not the first chunk, adjust for overlap
            if chunk_index > 0:
                start = max(0, start - self.chunk_overlap)
            
            # Extract chunk
            chunk_text = text[start:end].strip()
            
            if chunk_text:
                chunk = TextChunk(
                    text=chunk_text,
                    chunk_index=chunk_index,
                    metadata=metadata
                )
                chunks.append(chunk)
                chunk_index += 1
            
            # Move start position for next chunk
            start = end
        
        logger.info(f"Created {len(chunks)} chunks from text of {text_length} characters")
        return chunks
    
    def smart_chunk_text(self, text: str, metadata: TrademarkMetadata) -> List[TextChunk]:
        """Intelligent chunking that tries to split on sentence boundaries with hard limits"""
        import re
        
        # Split into sentences
        sentences = re.split(r'[.!?]+', text)
        sentences = [s.strip() for s in sentences if s.strip()]
        
        chunks = []
        current_chunk = ""
        chunk_index = 0
        
        for sentence in sentences:
            # Force split very long sentences
            if len(sentence) > self.chunk_size:
                # Split long sentence into smaller parts
                words = sentence.split()
                temp_chunk = ""
                
                for word in words:
                    if len(temp_chunk) + len(word) + 1 > self.chunk_size and temp_chunk:
                        # Save current part
                        chunks.append(TextChunk(
                            text=temp_chunk.strip(),
                            chunk_index=chunk_index,
                            metadata=metadata
                        ))
                        chunk_index += 1
                        temp_chunk = word
                    else:
                        if temp_chunk:
                            temp_chunk += " " + word
                        else:
                            temp_chunk = word
                
                # Add remaining part of long sentence
                if temp_chunk.strip():
                    current_chunk = temp_chunk.strip()
                continue
            
            # Normal processing for regular sentences
            if len(current_chunk) + len(sentence) + 1 > self.chunk_size and current_chunk:
                # Save current chunk
                chunks.append(TextChunk(
                    text=current_chunk.strip(),
                    chunk_index=chunk_index,
                    metadata=metadata
                ))
                chunk_index += 1
                
                # Start new chunk with overlap
                overlap_size = min(self.chunk_overlap, len(current_chunk))
                current_chunk = current_chunk[-overlap_size:] + " " + sentence
            else:
                # Add to current chunk
                if current_chunk:
                    current_chunk += " " + sentence
                else:
                    current_chunk = sentence
        
        # Add remaining text as final chunk
        if current_chunk.strip():
            chunks.append(TextChunk(
                text=current_chunk.strip(),
                chunk_index=chunk_index,
                metadata=metadata
            ))
        
        logger.info(f"Smart chunking created {len(chunks)} chunks")
        return chunks
    
    def create_trademark_representation(self, trademark_data) -> str:
        """
        Create optimal text representation for single-vector-per-trademark strategy.
        Combines all relevant information into a comprehensive text for embedding.
        """
        parts = []
        
        # Nama merek - prioritas utama
        if hasattr(trademark_data, 'namaMerek') and trademark_data.namaMerek:
            parts.append(f"Nama Merek: {trademark_data.namaMerek}")
        
        # Nama pemohon - penting untuk konteks bisnis
        if hasattr(trademark_data, 'namaPemohon') and trademark_data.namaPemohon:
            parts.append(f"Pemohon: {trademark_data.namaPemohon}")
        
        # Uraian barang/jasa - detail utama
        if hasattr(trademark_data, 'uraianBarangJasa') and trademark_data.uraianBarangJasa:
            # Bersihkan uraian dari prefix "Kelas X:" jika ada
            uraian = trademark_data.uraianBarangJasa
            if uraian.startswith("Kelas "):
                uraian = uraian.split(":", 1)[-1].strip()
            parts.append(f"Barang/Jasa: {uraian}")
        
        # Kelas barang/jasa - kategori
        if hasattr(trademark_data, 'kelasBarangJasa') and trademark_data.kelasBarangJasa:
            parts.append(f"Kelas: {trademark_data.kelasBarangJasa}")
        
        # Gabungkan semua bagian
        combined_text = " | ".join(parts)
        
        logger.info(f"Created trademark representation: {len(combined_text)} characters")
        return combined_text