const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');
const { Worker } = require('worker_threads');

const vectorService = require('./vectorService');
const trademarkParserService = require('./trademarkParserService');

class DocumentService {
  constructor() {
    this.uploadDir = path.join(__dirname, '../../uploads');
    this.chunkSize = 2000; // Characters per chunk - increased for better context
    this.chunkOverlap = 400; // Overlap between chunks - increased for better continuity
    this.maxConcurrentPages = 10; // Maximum pages to process concurrently - increased for faster processing
  }

  /**
   * Process uploaded PDF file
   * @param {object} file - Multer file object
   * @returns {Promise<object>} - Processing result
   */
  async processDocument(file, requestId = null, req = null) {
    const logPrefix = requestId ? `[${requestId}]` : '';
    const startTime = Date.now();
    
    try {
      console.log(`📄 ${logPrefix} Starting document processing: ${file.originalname}`);
      console.log(`📋 ${logPrefix} File details:`, {
        size: file.size,
        mimetype: file.mimetype,
        path: file.path,
        sizeInMB: (file.size / (1024 * 1024)).toFixed(2)
      });
      
      // Update progress if available
      if (req && req.updateSubProgress) {
        req.updateSubProgress(10, 'File details validated');
      }
      
      // Validate file
      console.log(`🔍 ${logPrefix} Validating file...`);
      if (!file || file.mimetype !== 'application/pdf') {
        console.log(`❌ ${logPrefix} File validation failed: Invalid file type`);
        throw new Error('Invalid file type. Only PDF files are allowed.');
      }

      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        console.log(`❌ ${logPrefix} File validation failed: Size exceeds limit (${file.size} bytes)`);
        throw new Error('File size exceeds 50MB limit.');
      }
      console.log(`✅ ${logPrefix} File validation passed`);

      // Parse PDF
      console.log(`📖 ${logPrefix} Reading PDF buffer...`);
      const pdfReadStart = Date.now();
      const pdfBuffer = await fs.readFile(file.path);
      console.log(`✅ ${logPrefix} PDF buffer read in ${Date.now() - pdfReadStart}ms (${pdfBuffer.length} bytes)`);
      
      // Use page-based splitting with parallel processing
      console.log(`📄 ${logPrefix} Starting page-based chunking...`);
      const pageChunkStart = Date.now();
      const pageData = await this.splitIntoPageChunks(pdfBuffer);
      const pageChunkTime = Date.now() - pageChunkStart;
      console.log(`📊 ${logPrefix} Page chunking completed in ${pageChunkTime}ms:`, {
        totalPages: pageData.totalPages,
        validPageChunks: pageData.pageChunks.length,
        fullTextLength: pageData.fullText.length,
        avgTimePerPage: (pageChunkTime / pageData.totalPages).toFixed(2) + 'ms'
      });
      
      // Step 3: Text chunking
      if (req && req.nextStep) {
        req.nextStep('Text chunking and processing', { 
          pages: pageData.totalPages, 
          textLength: pageData.fullText.length 
        });
      }

      // Preprocess text with trademark-specific enhancements
      console.log(`🔧 ${logPrefix} Starting text preprocessing...`);
      const preprocessStart = Date.now();
      const preprocessedText = this.preprocessTrademarkText(pageData.fullText);
      const preprocessTime = Date.now() - preprocessStart;
      console.log(`✅ ${logPrefix} Text preprocessing completed in ${preprocessTime}ms:`, {
        originalLength: pageData.fullText.length,
        processedLength: preprocessedText.length,
        reductionPercent: ((1 - preprocessedText.length / pageData.fullText.length) * 100).toFixed(2) + '%'
      });
      
      console.log(`✂️ ${logPrefix} Creating traditional chunks...`);
      const chunkStart = Date.now();
      const traditionalChunks = this.splitIntoChunks(preprocessedText);
      const chunkTime = Date.now() - chunkStart;
      console.log(`🔄 ${logPrefix} Chunking completed in ${chunkTime}ms:`, {
        traditionalChunks: traditionalChunks.length,
        pageBasedChunks: pageData.pageChunks.length,
        avgChunkSize: Math.round(preprocessedText.length / traditionalChunks.length),
        chunkOverlap: this.chunkOverlap
      });
      
      // Step 4: Embedding generation
      if (req && req.nextStep) {
        req.nextStep('Embedding generation', { 
          totalChunks: traditionalChunks.length 
        });
      }

      // Generate document ID
      const documentId = uuidv4();
      console.log(`🆔 ${logPrefix} Generated document ID: ${documentId}`);
      
      // Extract structured trademark data with enhanced parsing
      console.log(`🔍 ${logPrefix} Starting trademark data extraction...`);
      const trademarkStart = Date.now();
      const trademarkData = await trademarkParserService.parseTrademarkDataEnhanced(pageData.pageChunks, preprocessedText);
      const trademarkTime = Date.now() - trademarkStart;
      console.log(`✅ ${logPrefix} Trademark extraction completed in ${trademarkTime}ms:`, {
        trademarkEntries: trademarkData.length,
        hasStructuredData: trademarkData.length > 0,
        trademarkPages: pageData.pageChunks.filter(chunk => chunk.hasTrademarkData).length
      });
      
      // Store document metadata
      console.log(`💾 ${logPrefix} Preparing document metadata...`);
      const baseMetadata = {
        filename: file.originalname,
        filesize: file.size,
        pages: pageData.totalPages,
        pageChunks: pageData.pageChunks.length,
        trademarkPages: pageData.pageChunks.filter(chunk => chunk.hasTrademarkData).length,
        uploadDate: new Date().toISOString(),
        hasTrademarkData: trademarkData.length > 0,
        trademarkCount: trademarkData.length,
        processingMethod: 'page-based-parallel',
        processingTimeMs: Date.now() - startTime
      };
      
      console.log(`🗄️ ${logPrefix} Storing document metadata and vectors...`);
      
      // Step 5: Vector database storage
      if (req && req.nextStep) {
        req.nextStep('Vector database storage', { 
          totalChunks: traditionalChunks.length 
        });
      }
      
      const storeStart = Date.now();
      await vectorService.storeDocumentMetadata(requestId, documentId, traditionalChunks, baseMetadata, req);
      const storeTime = Date.now() - storeStart;
      console.log(`✅ ${logPrefix} Document storage completed in ${storeTime}ms`);

      // Clean up uploaded file
      console.log(`🧹 ${logPrefix} Cleaning up temporary file...`);
      await fs.unlink(file.path);
      console.log(`✅ ${logPrefix} Temporary file cleaned up`);

      const totalTime = Date.now() - startTime;
      console.log(`🎉 ${logPrefix} Document processing completed successfully in ${totalTime}ms:`, {
        documentId,
        filename: file.originalname,
        totalProcessingTime: totalTime,
        breakdown: {
          pdfRead: pdfReadStart ? Date.now() - pdfReadStart : 0,
          pageChunking: pageChunkTime,
          preprocessing: preprocessTime,
          chunking: chunkTime,
          trademarkExtraction: trademarkTime,
          vectorStorage: storeTime
        }
      });
      
      return {
        documentId,
        filename: file.originalname,
        pages: pageData.totalPages,
        chunks: traditionalChunks.length,
        pageChunks: pageData.pageChunks.length,
        trademarkPages: pageData.pageChunks.filter(chunk => chunk.hasTrademarkData).length,
        characters: preprocessedText.length,
        trademarkEntries: trademarkData.length,
        hasStructuredData: trademarkData.length > 0,
        processingMethod: 'page-based-parallel',
        processingTimeMs: totalTime,
        status: 'processed'
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`💥 ${logPrefix} Document processing failed after ${totalTime}ms:`, {
        error: error.message,
        stack: error.stack,
        file: file ? {
          name: file.originalname,
          size: file.size,
          path: file.path
        } : 'No file info'
      });
      
      // Clean up file on error
      if (file && file.path) {
        try {
          console.log(`🧹 ${logPrefix} Cleaning up file after error...`);
          await fs.unlink(file.path);
          console.log(`✅ ${logPrefix} File cleanup completed`);
        } catch (unlinkError) {
          console.error(`❌ ${logPrefix} Error cleaning up file:`, unlinkError.message);
        }
      }
      
      throw error;
    }
  }



  /**
   * Clean and normalize text with trademark-specific preprocessing
   * @param {string} text - Raw text from PDF
   * @returns {string} - Cleaned text
   */
  cleanText(text) {
    if (!text) return '';
    
    // Trademark-specific preprocessing
    let cleanedText = text
      // Preserve trademark field codes (like 210, 220, 510, etc.)
      .replace(/(\d{3})([A-Za-z])/g, '$1 $2')
      // Normalize application numbers
      .replace(/(210|220)\s*(\d{4}\d{6,})/g, '$1 $2')
      // Preserve trademark class numbers
      .replace(/Kelas\s*(\d{1,2})/gi, 'Kelas $1')
      // Normalize dates
      .replace(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/g, '$1/$2/$3')
      // Clean up multiple spaces but preserve structure
      .replace(/\s+/g, ' ')
      // Remove excessive punctuation but keep essential ones
      .replace(/[^\w\s\u00C0-\u017F\u0100-\u024F:;,\.\/-]/g, ' ')
      // Normalize trademark-specific terms
      .replace(/Nama\s*Pemohon/gi, 'Nama Pemohon')
      .replace(/Nama\s*Referensi\s*Label\s*Merek/gi, 'Nama Referensi Label Merek')
      .replace(/Kelas\s*Barang\s*Jasa/gi, 'Kelas Barang Jasa')
      .replace(/Uraian\s*Barang\s*Jasa/gi, 'Uraian Barang Jasa')
      .replace(/Tipe\s*Merek/gi, 'Tipe Merek')
      .replace(/Arti\s*Bahasa/gi, 'Arti Bahasa')
      .replace(/Uraian\s*Warna/gi, 'Uraian Warna')
      // Remove multiple spaces
      .replace(/\s{2,}/g, ' ')
      // Trim
      .trim();
    
    return cleanedText;
  }

  /**
   * Preprocess text specifically for trademark documents
   * @param {string} text - Raw text
   * @returns {string} - Preprocessed text
   */
  preprocessTrademarkText(text) {
    // Enhanced preprocessing for better trademark data extraction
    let processedText = text
      // Standardize field separators
      .replace(/([A-Za-z]):(\s*[A-Za-z])/g, '$1: $2')
      // Ensure proper spacing around numbers
      .replace(/(\d)(\D)/g, '$1 $2')
      .replace(/(\D)(\d)/g, '$1 $2')
      // Standardize trademark status terms
      .replace(/\b(DITERIMA|DITOLAK|DALAM PROSES)\b/gi, (match) => match.toUpperCase())
      // Clean up OCR artifacts
      .replace(/[|\\]/g, ' ')
      .replace(/_{2,}/g, ' ')
      .replace(/-{2,}/g, ' ')
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    
    return this.cleanText(processedText);
  }

  /**
   * Split text into chunks with overlap and semantic awareness
   * @param {string} text - Text to split
   * @returns {string[]} - Array of text chunks
   */
  splitIntoChunks(text) {
    if (!text || text.length === 0) {
      return [];
    }

    // Try semantic chunking first for trademark documents
    const semanticChunks = this.createSemanticChunks(text);
    if (semanticChunks.length > 0) {
      console.log(`📋 Created ${semanticChunks.length} semantic chunks based on trademark structure`);
      return semanticChunks;
    }
    
    // Fallback to traditional chunking
    console.log('📋 Using traditional chunking method');
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = start + this.chunkSize;
      
      // If we're not at the end of the text, try to break at a sentence or word boundary
      if (end < text.length) {
        // Look for sentence boundary (. ! ?)
        const sentenceEnd = text.lastIndexOf('.', end);
        const exclamationEnd = text.lastIndexOf('!', end);
        const questionEnd = text.lastIndexOf('?', end);
        
        const maxSentenceEnd = Math.max(sentenceEnd, exclamationEnd, questionEnd);
        
        if (maxSentenceEnd > start + this.chunkSize * 0.5) {
          end = maxSentenceEnd + 1;
        } else {
          // Look for word boundary
          const spaceIndex = text.lastIndexOf(' ', end);
          if (spaceIndex > start + this.chunkSize * 0.5) {
            end = spaceIndex;
          }
        }
      }

      const chunk = text.slice(start, end).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }

      // Move start position with overlap
      start = end - this.chunkOverlap;
      if (start < 0) start = 0;
    }

    return chunks;
  }

  /**
   * Create semantic chunks based on DJKI trademark document structure
   * @param {string} text - Full document text
   * @returns {string[]} - Array of semantic chunks
   */
  createSemanticChunks(text) {
    const chunks = [];
    
    // Pattern untuk mendeteksi nomor permohonan sebagai boundary
    const applicationNumberPattern = /(?:210|220)\s+(\d{4}\d{6,})/g;
    const matches = [];
    let match;
    
    // Find all application numbers and their positions
    while ((match = applicationNumberPattern.exec(text)) !== null) {
      matches.push({
        number: match[1],
        position: match.index,
        fullMatch: match[0]
      });
    }
    
    if (matches.length === 0) {
      return []; // No trademark structure found, use traditional chunking
    }
    
    // Create chunks based on trademark entries
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const nextMatch = matches[i + 1];
      
      // Determine chunk boundaries
      const startPos = Math.max(0, currentMatch.position - 200); // Include some context before
      const endPos = nextMatch ? nextMatch.position : text.length;
      
      let chunkText = text.substring(startPos, endPos).trim();
      
      // Ensure chunk is not too large
      if (chunkText.length > this.chunkSize * 2) {
        // Split large trademark entries into smaller chunks
        const subChunks = this.splitLargeTrademarkEntry(chunkText);
        chunks.push(...subChunks);
      } else if (chunkText.length > 100) { // Minimum chunk size
        chunks.push(chunkText);
      }
    }
    
    return chunks;
  }

  /**
   * Split large trademark entries into manageable chunks
   * @param {string} text - Large trademark entry text
   * @returns {string[]} - Array of smaller chunks
   */
  splitLargeTrademarkEntry(text) {
    const chunks = [];
    const sections = text.split(/(?=\d{3}[A-Za-z])/); // Split on field codes like 510, 566, etc.
    
    let currentChunk = '';
    
    for (const section of sections) {
      if (currentChunk.length + section.length > this.chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = section;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + section;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 50);
  }

  /**
   * Split PDF into page-based chunks with parallel processing
   * @param {Buffer} pdfBuffer - PDF buffer
   * @returns {Promise<object>} - Page-based chunks and metadata
   */
  async splitIntoPageChunks(pdfBuffer) {
    try {
      // First, get basic PDF info with better error handling
      const pdfData = await this.parsePdfWithFallback(pdfBuffer);
      const totalPages = pdfData.numpages || 1;
      
      console.log(`📄 Processing ${totalPages} pages with parallel processing...`);
      
      // Process pages in batches for better memory management
      const pageChunks = [];
      const batchSize = this.maxConcurrentPages;
      
      for (let i = 0; i < totalPages; i += batchSize) {
        const batchEnd = Math.min(i + batchSize, totalPages);
        const batchPromises = [];
        
        for (let pageNum = i + 1; pageNum <= batchEnd; pageNum++) {
          batchPromises.push(this.extractPageContent(pdfBuffer, pageNum));
        }
        
        const batchResults = await Promise.all(batchPromises);
        pageChunks.push(...batchResults.filter(result => result.content.trim().length > 0));
        
        console.log(`✅ Processed pages ${i + 1}-${batchEnd} of ${totalPages}`);
      }
      
      return {
        totalPages,
        pageChunks,
        fullText: pdfData.text
      };
    } catch (error) {
      console.error('❌ Error in page-based splitting:', error);
      throw error;
    }
  }

  /**
   * Parse PDF with fallback options for corrupted PDFs
   * @param {Buffer} pdfBuffer - PDF buffer
   * @returns {Promise<object>} - PDF data
   */
  async parsePdfWithFallback(pdfBuffer) {
    try {
      // Try normal parsing first
      return await pdfParse(pdfBuffer);
    } catch (error) {
      console.warn('⚠️ Standard PDF parsing failed, trying with options:', error.message);
      
      try {
        // Try with different options
        return await pdfParse(pdfBuffer, {
          normalizeWhitespace: false,
          disableCombineTextItems: false
        });
      } catch (secondError) {
        console.warn('⚠️ PDF parsing with options failed, using fallback:', secondError.message);
        
        // Return minimal fallback data
        return {
          numpages: 1,
          text: 'PDF parsing failed - content could not be extracted',
          info: {
            Title: 'Corrupted PDF',
            Author: 'Unknown'
          }
        };
      }
    }
  }

  /**
   * Extract content from a specific page
   * @param {Buffer} pdfBuffer - PDF buffer
   * @param {number} pageNumber - Page number (1-based)
   * @returns {Promise<object>} - Page content and metadata
   */
  async extractPageContent(pdfBuffer, pageNumber) {
    try {
      // For now, we'll use a simple approach since pdf-parse doesn't support page-by-page extraction
      // In a production environment, you might want to use pdf2pic + OCR or pdf-lib for better page extraction
      const pdfData = await this.parsePdfWithFallback(pdfBuffer);
      const fullText = pdfData.text;
      
      // Estimate page content based on text length and page markers
      const lines = fullText.split('\n');
      const pageMarkers = lines.map((line, index) => ({
        line,
        index,
        isPageMarker: line.includes('Halaman') && line.includes('dari')
      })).filter(item => item.isPageMarker);
      
      let pageContent = '';
      
      if (pageMarkers.length > 0) {
        // Find content for specific page based on page markers
        const currentPageMarker = pageMarkers.find(marker => 
          marker.line.includes(`Halaman ${pageNumber} dari`)
        );
        
        if (currentPageMarker) {
          const nextPageMarker = pageMarkers.find(marker => 
            marker.line.includes(`Halaman ${pageNumber + 1} dari`)
          );
          
          const startIndex = Math.max(0, currentPageMarker.index - 50);
          const endIndex = nextPageMarker ? nextPageMarker.index : lines.length;
          
          pageContent = lines.slice(startIndex, endIndex).join('\n');
        }
      }
      
      // Fallback: divide text equally among pages
      if (!pageContent.trim()) {
        const textPerPage = Math.ceil(fullText.length / pdfData.numpages);
        const startPos = (pageNumber - 1) * textPerPage;
        const endPos = Math.min(startPos + textPerPage, fullText.length);
        pageContent = fullText.substring(startPos, endPos);
      }
      
      return {
        pageNumber,
        content: this.cleanText(pageContent),
        length: pageContent.length,
        hasTrademarkData: this.containsTrademarkKeywords(pageContent)
      };
    } catch (error) {
      console.error(`❌ Error extracting page ${pageNumber}:`, error);
      return {
        pageNumber,
        content: '',
        length: 0,
        hasTrademarkData: false,
        error: error.message
      };
    }
  }

  /**
   * Check if content contains trademark-related keywords
   * @param {string} content - Text content
   * @returns {boolean} - Whether content has trademark keywords
   */
  containsTrademarkKeywords(content) {
    const trademarkKeywords = [
      'Nomor Permohonan',
      'Tanggal Penerimaan',
      'Nama Pemohon',
      'Alamat Pemohon',
      'Tipe Merek',
      'Kelas Barang',
      'DID202',
      'Merek Kata',
      'Merek Lukisan'
    ];
    
    return trademarkKeywords.some(keyword => 
      content.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Get document information
   * @param {string} documentId - Document ID
   * @returns {Promise<object>} - Document information
   */
  async getDocumentInfo(documentId) {
    try {
      return await vectorService.getDocumentMetadata(documentId);
    } catch (error) {
      console.error('Error getting document info:', error);
      throw error;
    }
  }

  /**
   * Delete document and its chunks
   * @param {string} documentId - Document ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteDocument(documentId) {
    try {
      await vectorService.deleteDocument(documentId);
      console.log(`🗑️ Document deleted: ${documentId}`);
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  /**
   * List all processed documents
   * @returns {Promise<object[]>} - List of documents
   */
  async listDocuments() {
    try {
      return await vectorService.listDocuments();
    } catch (error) {
      console.error('Error listing documents:', error);
      throw error;
    }
  }
}

module.exports = new DocumentService();