const documentService = require('../services/documentService');
const Joi = require('joi');

class DocumentController {
  /**
   * Upload and process PDF document
   */
  async uploadDocument(req, res) {
    const startTime = Date.now();
    const requestId = req.requestId; // Use requestId from requestLogger middleware
    
    try {
      console.log(`🚀 [${requestId}] Upload request started at ${new Date().toISOString()}`);
      console.log(`📋 [${requestId}] Request details:`, {
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length')
      });

      if (!req.file) {
        console.log(`❌ [${requestId}] No file provided in request`);
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select a PDF file to upload',
          requestId
        });
      }

      console.log(`📤 [${requestId}] File received:`, {
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        path: req.file.path,
        sizeInMB: (req.file.size / (1024 * 1024)).toFixed(2)
      });
      
      // Start progress tracking
      req.startProgress({
        totalSteps: 5,
        stepNames: [
          'File validation',
          'PDF parsing and text extraction', 
          'Text chunking and processing',
          'Embedding generation',
          'Vector database storage'
        ]
      });
      
      // Step 1: Validate file before processing
      req.nextStep('File validation', { filename: req.file.originalname, size: req.file.size });
      if (req.file.mimetype !== 'application/pdf') {
        console.log(`❌ [${requestId}] Invalid file type: ${req.file.mimetype}`);
        req.failProgress(new Error(`Invalid file type: ${req.file.mimetype}`));
        return res.status(400).json({
          error: 'Invalid file type',
          message: 'Only PDF files are allowed',
          requestId
        });
      }

      if (req.file.size > 50 * 1024 * 1024) {
        console.log(`❌ [${requestId}] File too large: ${req.file.size} bytes`);
        return res.status(400).json({
          error: 'File too large',
          message: 'File size must be less than 50MB',
          requestId
        });
      }

      console.log(`✅ [${requestId}] File validation passed, starting processing...`);
      
      // Step 2: Process the document
      req.nextStep('PDF parsing and text extraction');
      const result = await documentService.processDocument(req.file, requestId, req);
      
      const processingTime = Date.now() - startTime;
      console.log(`🎉 [${requestId}] Upload completed successfully in ${processingTime}ms`);
      console.log(`📊 [${requestId}] Processing results:`, {
        documentId: result.documentId,
        pages: result.pages,
        chunks: result.chunks,
        trademarkEntries: result.trademarkEntries,
        processingTimeMs: processingTime
      });
      
      // Complete progress tracking
      req.completeProgress({
        documentId: result.documentId,
        filename: req.file.originalname,
        chunks: result.chunks,
        processingTimeMs: processingTime
      });
      
      res.status(201).json({
        success: true,
        message: 'Document uploaded and processed successfully',
        data: {
          ...result,
          requestId,
          processingTimeMs: processingTime
        }
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`💥 [${requestId}] Upload failed after ${processingTime}ms:`, {
        error: error.message,
        stack: error.stack,
        file: req.file ? {
          name: req.file.originalname,
          size: req.file.size
        } : 'No file'
      });
      
      // Mark progress as failed
      req.failProgress(error);
      
      res.status(500).json({
        error: 'Processing failed',
        message: error.message || 'Failed to process document',
        requestId,
        processingTimeMs: processingTime
      });
    }
  }

  /**
   * Get document information
   */
  async getDocument(req, res) {
    try {
      const { documentId } = req.params;
      
      if (!documentId) {
        return res.status(400).json({
          error: 'Missing document ID',
          message: 'Document ID is required'
        });
      }

      const document = await documentService.getDocumentInfo(documentId);
      
      res.json({
        success: true,
        data: document
      });
    } catch (error) {
      console.error('Get document error:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Document not found',
          message: 'The requested document does not exist'
        });
      }
      
      res.status(500).json({
        error: 'Retrieval failed',
        message: error.message || 'Failed to retrieve document'
      });
    }
  }

  /**
   * List all documents
   */
  async listDocuments(req, res) {
    try {
      const documents = await documentService.listDocuments();
      
      res.json({
        success: true,
        data: documents,
        count: documents.length
      });
    } catch (error) {
      console.error('List documents error:', error);
      
      res.status(500).json({
        error: 'Retrieval failed',
        message: error.message || 'Failed to retrieve documents'
      });
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(req, res) {
    try {
      const { documentId } = req.params;
      
      if (!documentId) {
        return res.status(400).json({
          error: 'Missing document ID',
          message: 'Document ID is required'
        });
      }

      await documentService.deleteDocument(documentId);
      
      res.json({
        success: true,
        message: 'Document deleted successfully'
      });
    } catch (error) {
      console.error('Delete document error:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Document not found',
          message: 'The requested document does not exist'
        });
      }
      
      res.status(500).json({
        error: 'Deletion failed',
        message: error.message || 'Failed to delete document'
      });
    }
  }

  /**
   * Get upload status/progress
   */
  async getUploadStatus(req, res) {
    try {
      // This could be enhanced with a job queue system for tracking progress
      res.json({
        success: true,
        message: 'Upload status endpoint - implement with job queue for production'
      });
    } catch (error) {
      console.error('Upload status error:', error);
      
      res.status(500).json({
        error: 'Status check failed',
        message: error.message || 'Failed to check upload status'
      });
    }
  }

  /**
   * Validate document before processing
   */
  async validateDocument(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file provided',
          message: 'Please select a file to validate'
        });
      }

      // Basic validation
      const validation = {
        filename: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        valid: req.file.mimetype === 'application/pdf' && req.file.size <= 50 * 1024 * 1024
      };

      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid file',
          message: 'File must be a PDF and less than 50MB',
          validation
        });
      }

      res.json({
        success: true,
        message: 'File is valid for processing',
        validation
      });
    } catch (error) {
      console.error('Validation error:', error);
      
      res.status(500).json({
        error: 'Validation failed',
        message: error.message || 'Failed to validate document'
      });
    }
  }

  /**
   * Clear all data from vector database
   */
  async clearAllData(req, res) {
    try {
      const vectorService = require('../services/vectorService');
      
      console.log('🧹 Clearing all data from vector database...');
      await vectorService.clearAllData();
      
      res.json({
        success: true,
        message: 'All data cleared from vector database successfully'
      });
    } catch (error) {
      console.error('Clear data error:', error);
      
      res.status(500).json({
        error: 'Clear failed',
        message: error.message || 'Failed to clear data'
      });
    }
  }
}

module.exports = new DocumentController();