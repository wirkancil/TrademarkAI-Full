from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class TrademarkMetadata(BaseModel):
    documentId: str
    namaMerek: str
    nomorPermohonan: str
    kelasBarangJasa: str
    namaPemohon: str
    uraianBarangJasa: str
    sourceDocument: str = "pdf"
    uploadDate: datetime = Field(default_factory=datetime.now)

class IndividualTrademark(BaseModel):
    """Model untuk merek individual (bukan chunk)"""
    trademarkId: str  # Format: documentId_merekIndex
    namaMerek: str
    nomorPermohonan: str
    kelasBarangJasa: str
    namaPemohon: str
    uraianBarangJasa: str
    documentId: str
    sourceDocument: str = "pdf"
    uploadDate: datetime = Field(default_factory=datetime.now)
    
    def get_search_text(self) -> str:
        """Text yang akan di-embedding untuk similarity search"""
        # Strategi baru: representasi komprehensif untuk satu vector per merek
        parts = []
        
        # Nama merek - prioritas utama
        parts.append(f"Nama Merek: {self.namaMerek}")
        
        # Nama pemohon - penting untuk konteks bisnis
        parts.append(f"Pemohon: {self.namaPemohon}")
        
        # Uraian barang/jasa - detail utama
        uraian = self.uraianBarangJasa
        if uraian.startswith("Kelas "):
            uraian = uraian.split(":", 1)[-1].strip()
        parts.append(f"Barang/Jasa: {uraian}")
        
        # Kelas barang/jasa - kategori
        parts.append(f"Kelas: {self.kelasBarangJasa}")
        
        # Gabungkan dengan separator yang jelas
        return " | ".join(parts)

class TextChunk(BaseModel):
    text: str
    chunk_index: int
    metadata: TrademarkMetadata

class SimilarityResult(BaseModel):
    trademark_name: str
    application_number: str
    owner_name: str
    classification: str
    description: str
    status: str = "Active"
    overall_similarity: float  # 0.0-1.0
    text_similarity: float  # 0.0-1.0
    semantic_similarity: float  # 0.0-1.0
    phonetic_similarity: float  # 0.0-1.0
    confidence_score: float  # 0.0-1.0

class SimilarityResponse(BaseModel):
    targetTrademark: str
    totalCompared: int
    similarTrademarksFound: int
    results: List[SimilarityResult]

class UploadResponse(BaseModel):
    success: bool
    message: str
    documentId: str
    filename: str
    chunksProcessed: int

class SearchRequest(BaseModel):
    trademark: str
    options: Optional[Dict[str, Any]] = Field(default_factory=dict)
    topK: int = 5
    threshold: float = 0.3