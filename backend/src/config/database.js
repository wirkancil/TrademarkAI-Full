const { Pinecone } = require('@pinecone-database/pinecone');
const { OpenAI } = require('openai');

class DatabaseConfig {
  constructor() {
    this.pinecone = null;
    this.openai = null;
    this.index = null;
  }

  async initializePinecone() {
    try {
      this.pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      });

      // Get or create index
      const indexName = process.env.PINECONE_INDEX_NAME || 'trademark-search';
      
      try {
        this.index = this.pinecone.index(indexName);
        console.log(`✅ Connected to Pinecone index: ${indexName}`);
      } catch (error) {
        console.log(`📝 Creating new Pinecone index: ${indexName}`);
        await this.pinecone.createIndex({
          name: indexName,
          dimension: 1536, // text-embedding-3-small default dimension
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });
        
        // Wait for index to be ready
        await new Promise(resolve => setTimeout(resolve, 10000));
        this.index = this.pinecone.index(indexName);
        console.log(`✅ Created and connected to Pinecone index: ${indexName}`);
      }
    } catch (error) {
      console.error('❌ Failed to initialize Pinecone:', error);
      throw error;
    }
  }

  initializeOpenAI() {
    try {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      console.log('✅ OpenAI client initialized');
    } catch (error) {
      console.error('❌ Failed to initialize OpenAI:', error);
      throw error;
    }
  }

  async initialize() {
    await this.initializePinecone();
    this.initializeOpenAI();
  }

  getPineconeIndex() {
    if (!this.index) {
      throw new Error('Pinecone index not initialized');
    }
    return this.index;
  }

  getOpenAIClient() {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }
    return this.openai;
  }
}

const dbConfig = new DatabaseConfig();

module.exports = dbConfig;