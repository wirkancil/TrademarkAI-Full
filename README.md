# TrademarkAI

Advanced AI-powered trademark search and similarity analysis with PDF processing capabilities.

## Features

- **AI-Powered Search**: Intelligent trademark similarity search using advanced embeddings
- **PDF Processing**: Upload and analyze trademark documents in PDF format
- **Hybrid Search**: Combine text and semantic search for better results
- **Progress Tracking**: Real-time upload and processing progress
- **Modern UI**: Clean and intuitive interface built with React and Tailwind CSS

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Python (FastAPI), Node.js (Express)
- **AI/ML**: OpenAI Embeddings, Pinecone Vector Database
- **File Processing**: PDF parsing and text extraction

## Quick Start

### Prerequisites

- Node.js 16+
- Python 3.8+
- OpenAI API Key
- Pinecone API Key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/wirkancil/TrademarkAI.git
cd TrademarkAI
```

2. Install frontend dependencies:
```bash
npm install
```

3. Install backend dependencies:
```bash
cd backend
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
# Copy .env.example to .env and fill in your API keys
cp .env.example .env
```

5. Start the development servers:
```bash
# Frontend
npm run dev

# Backend (in another terminal)
cd backend && python main.py
```

## Environment Variables

Create a `.env` file in the root directory with:

```env
# Frontend
VITE_API_BASE_URL=http://localhost:8000

# Backend
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_ENVIRONMENT=your_pinecone_environment
PINECONE_INDEX_NAME=trademark-embeddings
```

## Usage

1. Upload trademark documents via the web interface
2. Search for similar trademarks using text queries
3. View similarity scores and detailed results
4. Analyze PDF documents for trademark information

## License

MIT License
