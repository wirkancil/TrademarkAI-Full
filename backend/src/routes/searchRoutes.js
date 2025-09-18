const express = require('express');
const router = express.Router();
const searchController = require('../controllers/searchController');



/**
 * @route POST /api/search/trademarks
 * @desc Structured trademark search
 * @access Public
 */
router.post('/trademarks', searchController.searchTrademarks);

/**
 * @route GET /api/search/suggestions
 * @desc Get search suggestions/autocomplete
 * @access Public
 */
router.get('/suggestions', searchController.getSuggestions);

/**
 * @route GET /api/search/stats
 * @desc Get database statistics
 * @access Public
 */
router.get('/stats', searchController.getStats);

/**
 * @route GET /api/search/debug
 * @desc Debug endpoint to check raw Pinecone data
 * @access Public
 */
router.get('/debug', searchController.debugPineconeData);

/**
 * @route POST /api/search/raw
 * @desc Raw vector search endpoint
 * @access Public
 */
router.post('/raw', searchController.rawVectorSearch);

/**
 * @route POST /api/search/test-extraction
 * @desc Test trademark extraction from sample text
 * @access Public
 */
router.post('/test-extraction', searchController.testTrademarkExtraction);

/**
 * @route GET /api/search/summary/:documentId
 * @desc Get document summary
 * @access Public
 */
router.get('/summary/:documentId', searchController.getDocumentSummary);

module.exports = router;