const dbConfig = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class VectorService {
  constructor() {
    this.namespace = 'trademark-documents';
  }

  /**
   * Store document chunks in Pinecone
   * @param {string} documentId - Document ID
   * @param {string[]} chunks - Text chunks
   * @param {number[][]} embeddings - Embedding vectors
   * @param {object} metadata - Document metadata
   * @returns {Promise<boolean>} - Success status
   */
  async storeDocumentChunks(documentId, chunks, embeddings, metadata, requestId = null) {
    const logPrefix = requestId ? `[${requestId}]` : '';
    const startTime = Date.now();
    
    try {
      console.log(`🗄️ ${logPrefix} Starting Pinecone storage for document: ${documentId}`);
      
      if (chunks.length !== embeddings.length) {
        console.error(`❌ ${logPrefix} Mismatch: ${chunks.length} chunks vs ${embeddings.length} embeddings`);
        throw new Error('Chunks and embeddings arrays must have the same length');
      }

      console.log(`📊 ${logPrefix} Preparing ${chunks.length} vectors for Pinecone upsert...`);
      const index = dbConfig.getPineconeIndex();
      
      // Prepare vectors for upsert
      const vectorPrepStart = Date.now();
      const vectors = chunks.map((chunk, i) => ({
        id: `${documentId}_chunk_${i}`,
        values: embeddings[i],
        metadata: {
          documentId,
          chunkIndex: i,
          text: chunk,
          ...metadata,
          createdAt: new Date().toISOString()
        }
      }));
      const vectorPrepTime = Date.now() - vectorPrepStart;
      console.log(`✅ ${logPrefix} Vector preparation completed in ${vectorPrepTime}ms`);

      // Upsert in batches (Pinecone has limits) - increased for better performance
      const batchSize = 200;
      const totalBatches = Math.ceil(vectors.length / batchSize);
      console.log(`📦 ${logPrefix} Starting batch upsert: ${totalBatches} batches of max ${batchSize} vectors each`);
      
      let totalUpsertTime = 0;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batchNumber = Math.floor(i / batchSize) + 1;
        const batch = vectors.slice(i, i + batchSize);
        
        console.log(`📤 ${logPrefix} Upserting batch ${batchNumber}/${totalBatches} (${batch.length} vectors)...`);
        const batchStartTime = Date.now();
        
        await index.namespace(this.namespace).upsert(batch);
        
        const batchTime = Date.now() - batchStartTime;
        totalUpsertTime += batchTime;
        console.log(`✅ ${logPrefix} Batch ${batchNumber}/${totalBatches} completed in ${batchTime}ms`);
        
        // Log progress for large uploads
        if (totalBatches > 5) {
          const progress = (batchNumber / totalBatches * 100).toFixed(1);
          const avgBatchTime = totalUpsertTime / batchNumber;
          const estimatedTimeRemaining = avgBatchTime * (totalBatches - batchNumber);
          console.log(`📈 ${logPrefix} Upsert progress: ${batchNumber}/${totalBatches} (${progress}%) - ETA: ${Math.round(estimatedTimeRemaining)}ms`);
        }
      }
      
      console.log(`🎯 ${logPrefix} All batches upserted in ${totalUpsertTime}ms (avg: ${Math.round(totalUpsertTime / totalBatches)}ms per batch)`);

      // Store document metadata separately with a valid non-zero vector
      console.log(`📋 ${logPrefix} Storing document metadata vector...`);
      const metadataStartTime = Date.now();
      // Create a small random vector to avoid zero-vector error
      const metadataVector = new Array(1536).fill(0).map(() => Math.random() * 0.001);
      
      await index.namespace(this.namespace).upsert([{
        id: `${documentId}_metadata`,
        values: metadataVector,
        metadata: {
          type: 'document_metadata',
          documentId,
          totalChunks: chunks.length,
          ...metadata
        }
      }]);
      
      const metadataTime = Date.now() - metadataStartTime;
      console.log(`✅ ${logPrefix} Document metadata vector stored in ${metadataTime}ms`);
      
      const totalTime = Date.now() - startTime;
      console.log(`🎉 ${logPrefix} Pinecone storage completed successfully in ${totalTime}ms:`, {
        documentId,
        totalVectors: chunks.length + 1, // +1 for metadata vector
        chunkVectors: chunks.length,
        metadataVectors: 1,
        totalBatches,
        batchSize,
        vectorPrepTime,
        totalUpsertTime,
        metadataTime,
        totalTime,
        avgTimePerVector: Math.round(totalTime / chunks.length)
      });
      
      return true;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`💥 ${logPrefix} Pinecone storage failed after ${totalTime}ms:`, {
        documentId,
        error: error.message,
        stack: error.stack,
        totalChunks: chunks.length,
        namespace: this.namespace
      });
      throw error;
    }
  }

  /**
   * Search for similar chunks
   * @param {number[]} queryEmbedding - Query embedding vector
   * @param {number} topK - Number of results to return
   * @param {object} filter - Optional metadata filter
   * @returns {Promise<object[]>} - Search results
   */
  async searchSimilarChunks(queryEmbedding, topK = 10, filter = {}) {
    try {
      const index = dbConfig.getPineconeIndex();
      
      // Build search filter
      let searchFilter = { ...filter };
      
      // If no specific type filter is provided, prioritize trademark_data entries
      if (!filter.type) {
        searchFilter.type = 'trademark_data';
      }

      console.log('🔍 Search filter being used:', JSON.stringify(searchFilter, null, 2));
      
      const queryRequest = {
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        includeValues: false,
        filter: searchFilter
      };

      const results = await index.namespace(this.namespace).query(queryRequest);
      
      return results.matches.map(match => ({
        id: match.id,
        score: match.score,
        documentId: match.metadata.documentId,
        chunkIndex: match.metadata.chunkIndex,
        text: match.metadata.text,
        filename: match.metadata.filename,
        metadata: match.metadata
      }));
    } catch (error) {
      console.error('Error searching similar chunks:', error);
      throw error;
    }
  }

  /**
   * Get document metadata
   * @param {string} documentId - Document ID
   * @returns {Promise<object>} - Document metadata
   */
  async getDocumentMetadata(documentId) {
    try {
      const index = dbConfig.getPineconeIndex();
      
      const result = await index.namespace(this.namespace).fetch([`${documentId}_metadata`]);
      
      if (!result.vectors || !result.vectors[`${documentId}_metadata`]) {
        throw new Error('Document not found');
      }

      return result.vectors[`${documentId}_metadata`].metadata;
    } catch (error) {
      console.error('Error getting document metadata:', error);
      throw error;
    }
  }

  /**
   * Delete document and all its chunks
   * @param {string} documentId - Document ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteDocument(documentId) {
    try {
      const index = dbConfig.getPineconeIndex();
      
      // First, get all chunk IDs for this document
      const searchResults = await index.namespace(this.namespace).query({
        vector: new Array(1536).fill(0).map(() => Math.random() * 0.001), // Non-zero dummy vector
        topK: 10000, // Large number to get all chunks
        includeMetadata: true,
        includeValues: false,
        filter: { documentId }
      });

      const idsToDelete = searchResults.matches.map(match => match.id);
      
      // Add metadata ID
      idsToDelete.push(`${documentId}_metadata`);

      // Delete in batches
      const batchSize = 1000;
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize);
        await index.namespace(this.namespace).deleteMany(batch);
      }

      console.log(`🗑️ Deleted ${idsToDelete.length} vectors for document ${documentId}`);
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  }

  /**
   * List all documents
   * @returns {Promise<object[]>} - List of documents
   */
  async listDocuments() {
    try {
      const index = dbConfig.getPineconeIndex();
      
      const results = await index.namespace(this.namespace).query({
        vector: new Array(1536).fill(0).map(() => Math.random() * 0.001), // Non-zero dummy vector
        topK: 1000, // Adjust based on expected number of documents
        includeMetadata: true,
        includeValues: false,
        filter: { type: 'document_metadata' }
      });

      return results.matches.map(match => ({
        documentId: match.metadata.documentId,
        filename: match.metadata.filename,
        pages: match.metadata.pages,
        totalChunks: match.metadata.totalChunks,
        filesize: match.metadata.filesize,
        uploadDate: match.metadata.uploadDate
      }));
    } catch (error) {
      console.error('Error listing documents:', error);
      throw error;
    }
  }

  /**
   * Store page-based document chunks in vector database
   * @param {string} documentId - Document ID
   * @param {Array} pageChunks - Page-based chunks with metadata
   * @param {object} metadata - Document metadata
   * @returns {Promise<boolean>} - Success status
   */
  async storePageBasedDocument(documentId, pageChunks, metadata) {
    try {
      console.log(`📄 Storing ${pageChunks.length} page-based chunks for document: ${documentId}`);
      
      const index = dbConfig.getPineconeIndex();
      
      // Process page chunks in batches - increased for better performance
      const batchSize = 100;
      let totalStored = 0;
      
      for (let i = 0; i < pageChunks.length; i += batchSize) {
        const batch = pageChunks.slice(i, i + batchSize);
        const vectors = [];
        
        for (const pageChunk of batch) {
          if (pageChunk.content && pageChunk.content.trim().length > 0) {
            // Generate embedding for page content
            const embedding = await this.generateEmbedding(pageChunk.content);
            
            vectors.push({
              id: `${documentId}_page_${pageChunk.pageNumber}`,
              values: embedding,
              metadata: {
                documentId,
                pageNumber: pageChunk.pageNumber,
                text: pageChunk.content,
                hasTrademarkData: pageChunk.hasTrademarkData,
                contentLength: pageChunk.length,
                chunkType: 'page-based',
                ...metadata,
                createdAt: new Date().toISOString()
              }
            });
          }
        }
        
        if (vectors.length > 0) {
          console.log(`🔄 Upserting ${vectors.length} vectors to Pinecone namespace: ${this.namespace}`);
          
          // Retry mechanism for large document handling
          const maxRetries = 3;
          let retryCount = 0;
          let success = false;
          
          while (retryCount < maxRetries && !success) {
            try {
              const upsertResult = await index.namespace(this.namespace).upsert(vectors);
              console.log(`✅ Upserted ${vectors.length} vectors successfully`);
              success = true;
            } catch (upsertError) {
              retryCount++;
              console.warn(`⚠️ Upsert attempt ${retryCount} failed:`, upsertError.message);
              
              if (retryCount < maxRetries) {
                // Exponential backoff
                const delay = Math.pow(2, retryCount) * 1000;
                console.log(`⏳ Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              } else {
                console.error(`❌ All upsert attempts failed for batch`);
                throw upsertError;
              }
            }
          }
          
          totalStored += vectors.length;
          console.log(`📤 Stored page batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pageChunks.length / batchSize)} (${vectors.length} pages)`);
          
          // Add delay between batches for large documents to avoid rate limits
          if (pageChunks.length > 100) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }
      
      console.log(`✅ Successfully stored ${totalStored} page-based chunks`);
      
      // Wait for Pinecone indexing, then verify data was stored
      console.log('⏳ Waiting for Pinecone indexing...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.verifyStoredData(documentId, totalStored);
      
      return true;
    } catch (error) {
      console.error('❌ Error storing page-based document:', error);
      throw error;
    }
  }

  /**
   * Verify that data was successfully stored in Pinecone
   * @param {string} documentId - Document ID to verify
   * @param {number} expectedCount - Expected number of stored vectors
   */
  async verifyStoredData(documentId, expectedCount) {
     try {
       const index = dbConfig.getPineconeIndex();
       
       // First, check namespace stats
       try {
         const stats = await index.describeIndexStats();
         console.log(`📊 Pinecone index stats:`, stats);
       } catch (statsError) {
         console.log('📊 Could not get index stats:', statsError.message);
       }
       
       // Query for vectors with this document ID
        const queryResult = await index.namespace(this.namespace).query({
          vector: new Array(1536).fill(0.1), // Dummy query vector
          filter: { documentId: documentId },
          topK: Math.min(expectedCount, 100),
          includeMetadata: true
        });
       
       console.log(`🔍 Verification: Found ${queryResult.matches.length} vectors for document ${documentId} (expected: ${expectedCount})`);
       
       if (queryResult.matches.length === 0) {
         console.warn(`⚠️ No vectors found in Pinecone for document ${documentId}`);
         
         // Try querying without filter to see if there's any data at all
         const generalQuery = await index.namespace(this.namespace).query({
           vector: new Array(1536).fill(0.1),
           topK: 5,
           includeMetadata: true
         });
         console.log(`🔍 General query found ${generalQuery.matches.length} total vectors in namespace`);
         if (generalQuery.matches.length > 0) {
           console.log(`📋 Sample existing data:`, {
             id: generalQuery.matches[0].id,
             metadata: generalQuery.matches[0].metadata
           });
         }
       } else {
         console.log(`✅ Data verification successful - ${queryResult.matches.length} vectors found`);
         // Log first match for debugging
         if (queryResult.matches[0]) {
           console.log(`📋 Sample stored data:`, {
             id: queryResult.matches[0].id,
             score: queryResult.matches[0].score,
             metadata: queryResult.matches[0].metadata ? Object.keys(queryResult.matches[0].metadata) : 'none'
           });
         }
       }
     } catch (error) {
       console.error('❌ Error verifying stored data:', error);
     }
   }

  /**
   * Generate embedding for text using OpenAI
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} - Embedding vector
   */
  async generateEmbedding(text, logPrefix = '') {
    const startTime = Date.now();
    
    try {
      // Truncate text if too long (OpenAI has token limits)
      const maxLength = 8000; // Conservative limit
      const originalLength = text.length;
      const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;
      
      if (originalLength > maxLength) {
        console.log(`✂️ ${logPrefix} Text truncated from ${originalLength} to ${maxLength} characters`);
      }
      
      console.log(`🧠 ${logPrefix} Generating embedding for text (${truncatedText.length} chars)...`);
      
      // Use the configured OpenAI client
      const openai = dbConfig.getOpenAIClient();
      
      const apiStartTime = Date.now();
      const response = await openai.embeddings.create({
        input: truncatedText,
        model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
      });
      const apiTime = Date.now() - apiStartTime;
      
      const totalTime = Date.now() - startTime;
      console.log(`✅ ${logPrefix} Embedding generated successfully in ${totalTime}ms:`, {
        textLength: truncatedText.length,
        apiCallTime: apiTime,
        embeddingDimensions: response.data[0].embedding.length,
        model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
        tokensUsed: response.usage?.total_tokens || 'unknown'
      });
      
      return response.data[0].embedding;
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`💥 ${logPrefix} Embedding generation failed after ${totalTime}ms:`, {
        error: error.message,
        textLength: text.length,
        errorCode: error.code,
        errorType: error.type
      });
      
      // Return a random vector as fallback (1536 dimensions for text-embedding-3-small)
      console.warn(`⚠️ ${logPrefix} Using fallback random embedding due to API error`);
      return new Array(1536).fill(0).map(() => Math.random() * 0.001);
    }
  }

  /**
   * Store document metadata
   * @param {string} documentId - Document ID
   * @param {Array} chunks - Document chunks
   * @param {object} metadata - Document metadata
   * @returns {Promise<void>}
   */
  async storeDocumentMetadata(requestId, documentId, chunks, metadata, req = null) {
    const logPrefix = requestId ? `[${requestId}]` : '';
    const startTime = Date.now();
    
    try {
      console.log(`📝 ${logPrefix} Starting document metadata storage for: ${documentId}`);
      console.log(`📊 ${logPrefix} Processing ${chunks.length} chunks for embedding generation`);
      
      // Store document chunks with embeddings
      const embeddings = [];
      
      // Generate embeddings for chunks with progress tracking
      console.log(`🧠 ${logPrefix} Starting embedding generation for ${chunks.length} chunks...`);
      const embeddingStartTime = Date.now();
      
      for (let i = 0; i < chunks.length; i++) {
        const chunkStartTime = Date.now();
        const chunk = chunks[i];
        const chunkLogPrefix = `${logPrefix} [Chunk ${i + 1}/${chunks.length}]`;
        const chunkProgress = Math.round(((i + 1) / chunks.length) * 100);
        
        console.log(`🔄 ${chunkLogPrefix} Processing chunk (${chunk.length} chars)...`);
        
        // Update sub-progress for embedding generation
        if (req && req.updateSubProgress) {
          req.updateSubProgress(chunkProgress, `Generating embedding for chunk ${i + 1}/${chunks.length}`);
        }
        
        const embedding = await this.generateEmbedding(chunk, chunkLogPrefix);
        embeddings.push(embedding);
        
        const chunkTime = Date.now() - chunkStartTime;
        const progress = ((i + 1) / chunks.length * 100).toFixed(1);
        console.log(`✅ ${chunkLogPrefix} Completed in ${chunkTime}ms (${progress}% total progress)`);
        
        // Log progress every 10 chunks or at milestones
        if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
          const avgTimePerChunk = (Date.now() - embeddingStartTime) / (i + 1);
          const estimatedTimeRemaining = avgTimePerChunk * (chunks.length - i - 1);
          console.log(`📈 ${logPrefix} Embedding progress: ${i + 1}/${chunks.length} (${progress}%) - ETA: ${Math.round(estimatedTimeRemaining)}ms`);
        }
      }
      
      const embeddingTime = Date.now() - embeddingStartTime;
      console.log(`🎯 ${logPrefix} All embeddings generated in ${embeddingTime}ms (avg: ${Math.round(embeddingTime / chunks.length)}ms per chunk)`);
      
      // Store chunks with embeddings
      console.log(`🗄️ ${logPrefix} Starting Pinecone storage...`);
      const storageStartTime = Date.now();
      
      // Update progress for storage phase
      if (req && req.updateSubProgress) {
        req.updateSubProgress(90, 'Storing vectors in database');
      }
      
      await this.storeDocumentChunks(documentId, chunks, embeddings, metadata, requestId);
      const storageTime = Date.now() - storageStartTime;
      
      const totalTime = Date.now() - startTime;
      console.log(`🎉 ${logPrefix} Document metadata storage completed in ${totalTime}ms:`, {
        documentId,
        totalChunks: chunks.length,
        totalEmbeddings: embeddings.length,
        embeddingTime,
        storageTime,
        totalTime,
        avgEmbeddingTime: Math.round(embeddingTime / chunks.length),
        avgStorageTime: Math.round(storageTime / chunks.length)
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`💥 ${logPrefix} Document metadata storage failed after ${totalTime}ms:`, {
        documentId,
        error: error.message,
        stack: error.stack,
        chunksProcessed: embeddings?.length || 0,
        totalChunks: chunks.length
      });
      throw error;
    }
  }

  /**
   * Store trademark data
   * @param {string} trademarkId - Trademark ID
   * @param {string} searchableText - Searchable text content
   * @param {object} metadata - Trademark metadata
   * @returns {Promise<void>}
   */
  async storeTrademarkData(requestId, documentId, trademarks) {
    const logPrefix = requestId ? `[${requestId}]` : '';
    const startTime = Date.now();
    
    try {
      console.log(`🏷️ ${logPrefix} Starting trademark data storage for document: ${documentId}`);
      console.log(`📊 ${logPrefix} Processing ${trademarks.length} trademark entries`);
      
      const index = dbConfig.getPineconeIndex();
      const vectors = [];
      
      // Process each trademark
      for (let i = 0; i < trademarks.length; i++) {
        const trademark = trademarks[i];
        const trademarkId = `${documentId}-trademark-${i + 1}`;
        const trademarkLogPrefix = `${logPrefix} [Trademark ${i + 1}/${trademarks.length}]`;
        
        console.log(`🔄 ${trademarkLogPrefix} Processing: ${trademark.namaReferensiLabelMerek}`);
        
        // Create searchable text
        const searchableText = [
          trademark.namaReferensiLabelMerek,
          trademark.namaPemohon,
          trademark.uraianBarangJasa,
          trademark.kelasBarangJasa,
          trademark.nomorPermohonan
        ].filter(Boolean).join(' ');
        
        // Generate embedding
        const embeddingStartTime = Date.now();
        const embedding = await this.generateEmbedding(searchableText, trademarkLogPrefix);
        const embeddingTime = Date.now() - embeddingStartTime;
        
        console.log(`🧠 ${trademarkLogPrefix} Embedding generated in ${embeddingTime}ms`);
        
        // Prepare vector for batch upsert
        vectors.push({
          id: trademarkId,
          values: embedding,
          metadata: {
            ...trademark,
            text: searchableText,
            type: 'trademark',
            documentId,
            createdAt: new Date().toISOString()
          }
        });
      }
      
      // Batch upsert all trademark vectors
      console.log(`📤 ${logPrefix} Upserting ${vectors.length} trademark vectors to Pinecone...`);
      const upsertStartTime = Date.now();
      
      await index.namespace(this.namespace).upsert(vectors);
      
      const upsertTime = Date.now() - upsertStartTime;
      const totalTime = Date.now() - startTime;
      
      console.log(`✅ ${logPrefix} Trademark data storage completed:`, {
        totalTrademarks: trademarks.length,
        upsertTime: `${upsertTime}ms`,
        totalTime: `${totalTime}ms`,
        avgTimePerTrademark: `${Math.round(totalTime / trademarks.length)}ms`
      });
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`💥 ${logPrefix} Trademark data storage failed after ${totalTime}ms:`, {
        error: error.message,
        documentId,
        trademarkCount: trademarks.length,
        errorCode: error.code
      });
      throw error;
    }
  }

  /**
   * Clear all data from Pinecone namespace
   * @returns {Promise<boolean>} - Success status
   */
  async clearAllData() {
    try {
      console.log('🧹 Starting to clear all data from Pinecone...');
      const index = dbConfig.getPineconeIndex();
      
      // Delete all vectors in the namespace
      await index.namespace(this.namespace).deleteAll();
      
      console.log('✅ All data cleared from Pinecone namespace');
      return true;
    } catch (error) {
      console.error('❌ Error clearing Pinecone data:', error);
      throw error;
    }
  }

  /**
   * Get statistics about the vector database
   * @returns {Promise<object>} - Database statistics
   */
  async getStats() {
    try {
      const index = dbConfig.getPineconeIndex();
      const stats = await index.describeIndexStats();
      
      return {
        totalVectors: stats.totalVectorCount,
        dimension: stats.dimension,
        indexFullness: stats.indexFullness,
        namespaces: stats.namespaces
      };
    } catch (error) {
      console.error('Error getting database stats:', error);
      throw error;
    }
  }

  /**
   * Search using text query (generates embeddings internally)
   * @param {string} query - Search query text
   * @param {object} options - Search options
   * @returns {Promise<object[]>} - Search results
   */
  async search(query, options = {}) {
    try {
      const { topK = 10, filter = {} } = options;
      
      console.log(`🔍 Performing vector search for: "${query}"`);
      
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Perform similarity search
      const results = await this.searchSimilarChunks(queryEmbedding, topK, filter);
      
      console.log(`📊 Found ${results.length} search results`);
      return results;
    } catch (error) {
      console.error('❌ Error performing search:', error);
      throw error;
    }
  }


}

module.exports = new VectorService();