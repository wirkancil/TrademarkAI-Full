const vectorService = require('../services/vectorService');
const trademarkParserService = require('../services/trademarkParserService');
const Joi = require('joi');

class SearchController {
  /**
   * Structured trademark search
   */
  async searchTrademarks(req, res) {
    try {
      // Validate request body
      const schema = Joi.object({
        query: Joi.string().required().min(1).max(500),
        topK: Joi.number().integer().min(1).max(50).default(10),
        filters: Joi.object({
          kelasBarangJasa: Joi.string().allow(''),
          namaPemohon: Joi.string().allow(''),
          tanggalPenerimaan: Joi.string().allow('')
        }).default({})
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        console.log('❌ Trademark search validation error:', error.details[0].message);
        console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
        return res.status(400).json({
          error: 'Invalid request',
          message: error.details[0].message
        });
      }

      const { query, topK, filters } = value;
      
      console.log(`🔍 Processing trademark search: "${query}" with filters:`, filters);
      
      // Search for trademark data
      const results = await trademarkParserService.searchTrademarks(query, topK, filters);
      
      // Format results untuk display yang lebih terstruktur
      const formattedResults = results.map(result => result.toDisplayFormat());
      
      res.json({
        success: true,
        data: {
          query,
          results: formattedResults,
          count: formattedResults.length,
          filters,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Trademark search error:', error);
      
      res.status(500).json({
        error: 'Search failed',
        message: error.message || 'Failed to search trademarks'
      });
    }
  }

  /**
   * Get document summary
   */
  async getDocumentSummary(req, res) {
    try {
      const { documentId } = req.params;
      
      if (!documentId) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Document ID is required'
        });
      }
      
      console.log(`📄 Getting summary for document: ${documentId}`);
      
      // Get document chunks
      const chunks = await vectorService.getDocumentChunks(documentId);
      
      if (!chunks || chunks.length === 0) {
        return res.status(404).json({
          error: 'Document not found',
          message: 'No chunks found for the specified document ID'
        });
      }
      
      // Combine all chunks text
      const fullText = chunks.map(chunk => chunk.metadata.text || '').join(' ');
      const summary = fullText.substring(0, 500) + (fullText.length > 500 ? '...' : '');
      
      res.json({
        success: true,
        data: {
          documentId,
          summary,
          chunkCount: chunks.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Document summary error:', error);
      
      res.status(500).json({
        error: 'Summary failed',
        message: error.message || 'Failed to get document summary'
      });
    }
  }

  /**
   * Debug endpoint to check raw Pinecone data
   */
  async debugPineconeData(req, res) {
    try {
      console.log('🔍 Debug: Fetching Pinecone stats...');
      
      // Get stats from Pinecone
      const stats = await vectorService.getStats();
      
      // Try to get some sample data using search
      let sampleData = null;
      try {
        const searchResults = await vectorService.search('test', { topK: 5 });
        sampleData = searchResults;
      } catch (searchError) {
        console.log('Could not fetch sample data:', searchError.message);
      }
      
      res.json({
        success: true,
        data: {
          stats,
          sampleData,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Debug Pinecone error:', error);
      
      res.status(500).json({
        error: 'Debug failed',
        message: error.message
      });
    }
  }

  /**
   * Raw vector search endpoint for debugging
   */
  async rawVectorSearch(req, res) {
    try {
      const { query, topK = 5 } = req.body;
      
      if (!query) {
        return res.status(400).json({
          error: 'Query is required'
        });
      }
      
      console.log(`🔍 Raw vector search for: "${query}"`);
      
      // Perform raw vector search
      const searchResults = await vectorService.search(query, { topK });
      
      // Return raw results with full text content
      const rawResults = searchResults.map(result => ({
        id: result.id,
        score: result.score,
        text: result.text,
        metadata: result.metadata,
        documentId: result.documentId,
        chunkIndex: result.chunkIndex
      }));
      
      res.json({
        success: true,
        data: rawResults,
        query,
        count: rawResults.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Raw vector search error:', error);
      
      res.status(500).json({
        error: 'Raw search failed',
        message: error.message
      });
    }
  }

  /**
   * Test trademark extraction from sample text
   */
  async testTrademarkExtraction(req, res) {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Text is required for extraction testing'
        });
      }
      
      console.log('🧪 Testing trademark extraction...');
      
      const extractedTrademarks = trademarkParserService.extractTrademarks(text);
      
      res.json({
        success: true,
        data: {
          inputText: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
          extractedTrademarks,
          count: extractedTrademarks.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Extraction test error:', error);
      
      res.status(500).json({
        error: 'Extraction test failed',
        message: error.message || 'Failed to test trademark extraction'
      });
    }
  }

  /**
   * Get search suggestions/autocomplete
   */
  async getSuggestions(req, res) {
    try {
      const { q } = req.query;
      
      if (!q || q.length < 2) {
        return res.json({
          success: true,
          data: {
            suggestions: [],
            count: 0
          }
        });
      }
      
      console.log(`💡 Getting suggestions for: "${q}"`);
      
      // Simple suggestions based on common trademark terms
      const commonTerms = [
        'merek kata', 'merek lukisan', 'kosmetik', 'makanan', 'minuman',
        'pakaian', 'elektronik', 'farmasi', 'teknologi', 'otomotif'
      ];
      
      const suggestions = commonTerms
        .filter(term => term.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 5);
      
      res.json({
        success: true,
        data: {
          query: q,
          suggestions,
          count: suggestions.length,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Suggestions error:', error);
      
      res.status(500).json({
        error: 'Suggestions failed',
        message: error.message || 'Failed to get suggestions'
      });
    }
  }

  /**
   * Get database statistics
   */
  async getStats(req, res) {
    try {
      console.log('📊 Getting database statistics...');
      
      const stats = await vectorService.getStats();
      
      res.json({
        success: true,
        data: {
          ...stats,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Stats error:', error);
      
      res.status(500).json({
        error: 'Stats failed',
        message: error.message || 'Failed to get database statistics'
      });
    }
  }
}

module.exports = new SearchController();