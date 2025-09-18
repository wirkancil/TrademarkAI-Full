const express = require('express');
const similarityController = require('../controllers/similarityController');
const router = express.Router();

/**
 * @route POST /api/similarity/analyze
 * @desc Analisis kemiripan untuk satu merek dagang
 * @body {
 *   trademark: string (required),
 *   options: {
 *     topK: number (default: 20),
 *     includePhonetic: boolean (default: true),
 *     includeVisual: boolean (default: false),
 *     dateRange: { start: string, end: string } (optional)
 *   }
 * }
 */
router.post('/analyze', similarityController.analyzeSimilarity);

/**
 * @route POST /api/similarity/batch-analyze
 * @desc Analisis kemiripan untuk multiple merek dagang
 * @body {
 *   trademarks: string[] (required, max 10),
 *   options: {
 *     topK: number (default: 10),
 *     includePhonetic: boolean (default: true),
 *     includeVisual: boolean (default: false),
 *     dateRange: { start: string, end: string } (optional)
 *   }
 * }
 */
router.post('/batch-analyze', similarityController.batchAnalyzeSimilarity);

/**
 * @route POST /api/similarity/report
 * @desc Generate laporan kemiripan per periode
 * @body {
 *   dateRange: { start: string, end: string } (required),
 *   targetTrademarks: object[] (optional),
 *   options: {
 *     maxAnalyze: number (default: 50)
 *   }
 * }
 */
router.post('/report', similarityController.generateSimilarityReport);

/**
 * @route GET /api/similarity/config
 * @desc Get similarity configuration dan thresholds
 */
router.get('/config', similarityController.getConfiguration);

/**
 * @route PUT /api/similarity/thresholds
 * @desc Update similarity thresholds (admin only)
 * @body {
 *   thresholds: {
 *     textSimilarity: number,
 *     phoneticSimilarity: number,
 *     semanticSimilarity: number,
 *     overallSimilarity: number
 *   }
 * }
 */
router.put('/thresholds', similarityController.updateThresholds);

module.exports = router;