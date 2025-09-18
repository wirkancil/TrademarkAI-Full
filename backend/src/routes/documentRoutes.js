const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { upload, handleUploadError } = require('../middleware/upload');

/**
 * @route POST /api/documents/upload
 * @desc Upload and process PDF document
 * @access Public
 */
router.post('/upload', 
  upload.single('document'),
  handleUploadError,
  documentController.uploadDocument
);

/**
 * @route POST /api/documents/validate
 * @desc Validate document before upload
 * @access Public
 */
router.post('/validate',
  upload.single('document'),
  handleUploadError,
  documentController.validateDocument
);

/**
 * @route GET /api/documents
 * @desc Get list of all documents
 * @access Public
 */
router.get('/', documentController.listDocuments);

/**
 * @route GET /api/documents/:documentId
 * @desc Get specific document information
 * @access Public
 */
router.get('/:documentId', documentController.getDocument);

/**
 * @route DELETE /api/documents/:documentId
 * @desc Delete document and its chunks
 * @access Public
 */
router.delete('/:documentId', documentController.deleteDocument);

/**
 * @route GET /api/documents/status/upload
 * @desc Get upload status (for future job queue implementation)
 * @access Public
 */
router.get('/status/upload', documentController.getUploadStatus);

/**
 * @route POST /api/documents/clear-all
 * @desc Clear all data from vector database
 * @access Public
 */
router.post('/clear-all', documentController.clearAllData);

module.exports = router;