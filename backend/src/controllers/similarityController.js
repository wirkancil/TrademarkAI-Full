const similarityService = require('../services/similarityService');
const Joi = require('joi');

class SimilarityController {
  /**
   * Analisis kemiripan merek dagang
   */
  async analyzeSimilarity(req, res) {
    try {
      // Validasi request body
      const schema = Joi.object({
        trademark: Joi.string().required().min(1).max(200),
        options: Joi.object({
          topK: Joi.number().integer().min(1).max(50).default(20),
          includePhonetic: Joi.boolean().default(true),
          includeVisual: Joi.boolean().default(false),
          dateRange: Joi.object({
            start: Joi.string().isoDate().allow(''),
            end: Joi.string().isoDate().allow('')
          }).allow(null)
        }).default({})
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        console.log('❌ Similarity analysis validation error:', error.details[0].message);
        return res.status(400).json({
          error: 'Invalid request',
          message: error.details[0].message
        });
      }

      const { trademark, options } = value;
      
      console.log(`🔍 Processing similarity analysis for: "${trademark}"`);
      
      // Analisis kemiripan
      const result = await similarityService.analyzeSimilarity(trademark, options);
      
      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Similarity analysis error:', error);
      
      res.status(500).json({
        error: 'Analysis failed',
        message: error.message || 'Failed to analyze trademark similarity'
      });
    }
  }

  /**
   * Generate laporan kemiripan per periode
   */
  async generateSimilarityReport(req, res) {
    try {
      // Validasi request body
      const schema = Joi.object({
        dateRange: Joi.object({
          start: Joi.string().isoDate().required(),
          end: Joi.string().isoDate().required()
        }).required(),
        targetTrademarks: Joi.array().items(
          Joi.object({
            namaMerek: Joi.string().required(),
            nomorPermohonan: Joi.string().required()
          })
        ).default([]),
        options: Joi.object({
          maxAnalyze: Joi.number().integer().min(1).max(100).default(50)
        }).default({})
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        console.log('❌ Similarity report validation error:', error.details[0].message);
        return res.status(400).json({
          error: 'Invalid request',
          message: error.details[0].message
        });
      }

      const { dateRange, targetTrademarks, options } = value;
      
      console.log(`📊 Generating similarity report for period: ${dateRange.start} to ${dateRange.end}`);
      
      // Generate laporan
      const report = await similarityService.generateSimilarityReport(
        dateRange, 
        targetTrademarks.slice(0, options.maxAnalyze)
      );
      
      res.json({
        success: true,
        data: report,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Similarity report error:', error);
      
      res.status(500).json({
        error: 'Report generation failed',
        message: error.message || 'Failed to generate similarity report'
      });
    }
  }

  /**
   * Analisis batch untuk multiple trademarks
   */
  async batchAnalyzeSimilarity(req, res) {
    try {
      // Validasi request body
      const schema = Joi.object({
        trademarks: Joi.array().items(Joi.string().min(1).max(200)).required().min(1).max(10),
        options: Joi.object({
          topK: Joi.number().integer().min(1).max(20).default(10),
          includePhonetic: Joi.boolean().default(true),
          includeVisual: Joi.boolean().default(false),
          dateRange: Joi.object({
            start: Joi.string().isoDate().allow(''),
            end: Joi.string().isoDate().allow('')
          }).allow(null)
        }).default({})
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        console.log('❌ Batch similarity analysis validation error:', error.details[0].message);
        return res.status(400).json({
          error: 'Invalid request',
          message: error.details[0].message
        });
      }

      const { trademarks, options } = value;
      
      console.log(`🔍 Processing batch similarity analysis for ${trademarks.length} trademarks`);
      
      // Analisis setiap trademark
      const results = [];
      for (const trademark of trademarks) {
        try {
          const result = await similarityService.analyzeSimilarity(trademark, options);
          results.push({
            trademark,
            success: true,
            data: result
          });
        } catch (error) {
          console.error(`❌ Error analyzing ${trademark}:`, error.message);
          results.push({
            trademark,
            success: false,
            error: error.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      console.log(`✅ Batch analysis completed: ${successCount}/${trademarks.length} successful`);
      
      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: trademarks.length,
            successful: successCount,
            failed: trademarks.length - successCount
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Batch similarity analysis error:', error);
      
      res.status(500).json({
        error: 'Batch analysis failed',
        message: error.message || 'Failed to perform batch similarity analysis'
      });
    }
  }

  /**
   * Get similarity thresholds dan konfigurasi
   */
  async getConfiguration(req, res) {
    try {
      const config = {
        thresholds: similarityService.thresholds,
        supportedAnalysis: {
          textSimilarity: {
            algorithms: ['levenshtein', 'jaroWinkler', 'substring'],
            description: 'Analisis kemiripan nama merek berdasarkan karakter dan struktur kata'
          },
          semanticSimilarity: {
            algorithms: ['cosine'],
            description: 'Analisis kemiripan deskripsi/uraian barang/jasa berdasarkan makna'
          },
          phoneticSimilarity: {
            algorithms: ['phonetic_code'],
            description: 'Analisis kemiripan berdasarkan cara pembacaan/pengucapan'
          },
          visualSimilarity: {
            algorithms: ['planned'],
            description: 'Analisis kemiripan visual (logo, warna, font) - dalam pengembangan'
          }
        },
        limits: {
          maxTopK: 50,
          maxBatchSize: 10,
          maxReportSize: 100
        }
      };
      
      res.json({
        success: true,
        data: config,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Get configuration error:', error);
      
      res.status(500).json({
        error: 'Configuration retrieval failed',
        message: error.message || 'Failed to get similarity configuration'
      });
    }
  }

  /**
   * Update similarity thresholds (untuk admin)
   */
  async updateThresholds(req, res) {
    try {
      // Validasi request body
      const schema = Joi.object({
        thresholds: Joi.object({
          textSimilarity: Joi.number().min(0).max(1),
          phoneticSimilarity: Joi.number().min(0).max(1),
          semanticSimilarity: Joi.number().min(0).max(1),
          overallSimilarity: Joi.number().min(0).max(1)
        }).required()
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        console.log('❌ Update thresholds validation error:', error.details[0].message);
        return res.status(400).json({
          error: 'Invalid request',
          message: error.details[0].message
        });
      }

      const { thresholds } = value;
      
      // Update thresholds
      Object.assign(similarityService.thresholds, thresholds);
      
      console.log('✅ Similarity thresholds updated:', thresholds);
      
      res.json({
        success: true,
        data: {
          message: 'Thresholds updated successfully',
          newThresholds: similarityService.thresholds
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Update thresholds error:', error);
      
      res.status(500).json({
        error: 'Threshold update failed',
        message: error.message || 'Failed to update similarity thresholds'
      });
    }
  }
}

module.exports = new SimilarityController();