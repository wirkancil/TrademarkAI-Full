# Trademark Hybrid Search Backend

Backend API untuk aplikasi pencarian trademark menggunakan teknologi RAG (Retrieval Augmented Generation) dengan Pinecone vector database dan OpenAI.

## 🚀 Fitur Utama

- **Upload & Processing PDF**: Upload dokumen trademark PDF hingga 50MB
- **Text Embedding**: Menggunakan OpenAI text-embedding-3-small (1536 dimensi)
- **Vector Database**: Integrasi dengan Pinecone untuk penyimpanan dan pencarian vektor
- **RAG Processing**: Retrieval Augmented Generation untuk jawaban yang akurat
- **Hybrid Search**: Kombinasi semantic search dan keyword matching
- **Document Management**: CRUD operations untuk dokumen

## 🛠️ Teknologi

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Vector Database**: Pinecone
- **AI/ML**: OpenAI API (GPT-4, text-embedding-3-small)
- **File Processing**: pdf-parse, multer
- **Validation**: Joi
- **Security**: Helmet, CORS, Rate Limiting

## 📦 Instalasi

1. **Clone repository dan masuk ke folder backend**
   ```bash
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit file `.env` dan isi dengan API keys yang diperlukan:
   ```env
   OPENAI_API_KEY=your_openai_api_key
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_INDEX_NAME=trademark-search
   ```

4. **Jalankan server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## 🔧 Konfigurasi

### Environment Variables

| Variable | Description | Default |
|----------|-------------|----------|
| `PORT` | Server port | 3001 |
| `NODE_ENV` | Environment mode | development |
| `FRONTEND_URL` | Frontend URL for CORS | http://localhost:3000 |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `OPENAI_MODEL` | OpenAI model for chat | gpt-4-turbo-preview |
| `PINECONE_API_KEY` | Pinecone API key | - |
| `PINECONE_INDEX_NAME` | Pinecone index name | trademark-search |

### Pinecone Index Setup

Index akan dibuat otomatis dengan konfigurasi:
- **Dimension**: 1536 (sesuai text-embedding-3-small)
- **Metric**: cosine
- **Cloud**: AWS (us-east-1)

## 📚 API Endpoints

### Documents

#### Upload Document
```http
POST /api/documents/upload
Content-Type: multipart/form-data

Body:
- document: PDF file (max 50MB)
```

#### List Documents
```http
GET /api/documents
```

#### Get Document Info
```http
GET /api/documents/:documentId
```

#### Delete Document
```http
DELETE /api/documents/:documentId
```

### Search

#### RAG Search
```http
POST /api/search
Content-Type: application/json

{
  "query": "trademark registration process",
  "options": {
    "topK": 5,
    "includeContext": true,
    "useHybridSearch": true
  }
}
```

#### Semantic Search
```http
POST /api/search/semantic
Content-Type: application/json

{
  "query": "trademark classification",
  "topK": 10
}
```

#### Hybrid Search
```http
POST /api/search/hybrid
Content-Type: application/json

{
  "query": "trademark opposition",
  "topK": 10
}
```

#### Get Document Summary
```http
GET /api/search/summary/:documentId
```

#### Search Suggestions
```http
GET /api/search/suggestions?q=trademark
```

#### Database Stats
```http
GET /api/search/stats
```

## 🏗️ Arsitektur

```
src/
├── config/
│   └── database.js          # Konfigurasi Pinecone & OpenAI
├── controllers/
│   ├── documentController.js # Controller untuk dokumen
│   └── searchController.js   # Controller untuk pencarian
├── middleware/
│   └── upload.js            # Middleware upload file
├── routes/
│   ├── documentRoutes.js    # Routes dokumen
│   └── searchRoutes.js      # Routes pencarian
├── services/
│   ├── documentService.js   # Service processing dokumen
│   ├── embeddingService.js  # Service text embedding
│   ├── ragService.js        # Service RAG processing
│   └── vectorService.js     # Service vector database
└── server.js               # Entry point aplikasi
```

## 🔄 Alur RAG Processing

1. **Document Ingestion**
   - Upload PDF → Parse text → Chunking → Generate embeddings → Store in Pinecone

2. **Query Processing**
   - User query → Generate embedding → Vector search → Retrieve relevant chunks → Generate answer with LLM

3. **Hybrid Search**
   - Semantic similarity (cosine) + Keyword matching → Ranked results

## 🧪 Testing

```bash
# Run tests
npm test

# Test dengan curl
curl -X GET http://localhost:3001/health
```

## 📝 Logging

Server menggunakan Morgan untuk HTTP request logging dan console logging untuk debugging.

## 🔒 Security

- **Helmet**: Security headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **File Validation**: PDF only, max 50MB
- **Input Validation**: Joi schema validation

## 🚀 Deployment

1. Set `NODE_ENV=production`
2. Configure production database URLs
3. Set up proper logging
4. Use process manager (PM2)
5. Configure reverse proxy (Nginx)

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 License

MIT License