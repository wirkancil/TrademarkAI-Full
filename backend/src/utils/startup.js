const dbConfig = require('../config/database');

class StartupService {
  /**
   * Initialize all required services
   */
  async initialize() {
    try {
      console.log('🚀 Starting backend initialization...');
      
      // Initialize database connections
      await this.initializeDatabases();
      
      // Verify API connections
      await this.verifyConnections();
      
      console.log('✅ Backend initialization completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Backend initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize database connections
   */
  async initializeDatabases() {
    try {
      console.log('📊 Initializing databases...');
      
      // Initialize Pinecone and OpenAI
      await dbConfig.initialize();
      
      console.log('✅ Database connections established');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Verify API connections
   */
  async verifyConnections() {
    try {
      console.log('🔍 Verifying API connections...');
      
      // Skip API verification in development mode with placeholder keys
      if (process.env.NODE_ENV === 'development' && 
          (process.env.OPENAI_API_KEY === 'your_openai_api_key_here' || 
           process.env.PINECONE_API_KEY === 'your_pinecone_api_key_here')) {
        console.log('⚠️  Development mode: Skipping API connection verification');
        console.log('💡 To enable full functionality, please set valid API keys in .env file');
        return;
      }
      
      // Test OpenAI connection
      await this.testOpenAIConnection();
      
      // Test Pinecone connection  
      await this.testPineconeConnection();
      
      console.log('✅ All API connections verified');
    } catch (error) {
      console.error('❌ API connection verification failed:', error);
      throw error;
    }
  }

  /**
   * Test OpenAI connection
   */
  async testOpenAIConnection() {
    try {
      const openai = dbConfig.getOpenAIClient();
      
      // Test with a simple embedding request
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: 'test connection',
        dimensions: 1536
      });
      
      if (response.data && response.data.length > 0) {
        console.log('✅ OpenAI connection verified');
      } else {
        throw new Error('Invalid response from OpenAI');
      }
    } catch (error) {
      console.error('❌ OpenAI connection test failed:', error);
      throw new Error(`OpenAI connection failed: ${error.message}`);
    }
  }

  /**
   * Test Pinecone connection
   */
  async testPineconeConnection() {
    try {
      const index = dbConfig.getPineconeIndex();
      
      // Test with index stats
      const stats = await index.describeIndexStats();
      
      if (stats) {
        console.log('✅ Pinecone connection verified');
        console.log(`📊 Index stats: ${stats.totalVectorCount} vectors, ${stats.dimension} dimensions`);
      } else {
        throw new Error('Invalid response from Pinecone');
      }
    } catch (error) {
      console.error('❌ Pinecone connection test failed:', error);
      throw new Error(`Pinecone connection failed: ${error.message}`);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      console.log('🛑 Initiating graceful shutdown...');
      
      // Close database connections if needed
      // Add any cleanup logic here
      
      console.log('✅ Graceful shutdown completed');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
}

const startupService = new StartupService();

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('📡 SIGTERM received');
  await startupService.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📡 SIGINT received');
  await startupService.shutdown();
  process.exit(0);
});

module.exports = startupService;