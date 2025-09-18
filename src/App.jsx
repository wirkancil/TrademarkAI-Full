import React, { useState, useCallback, useEffect } from 'react';
import './App.css';

const App = () => {
  const [activeTab, setActiveTab] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [similarityQuery, setSimilarityQuery] = useState('');
  const [similarityResults, setSimilarityResults] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [similarityError, setSimilarityError] = useState('');
  const [topK, setTopK] = useState(5);
  const [includePhonetic, setIncludePhonetic] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);

  const API_BASE_URL = 'http://localhost:8004';

  // Search functionality
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setSearchError('');
    setSearchResults([]);

    try {
      const response = await fetch(`${API_BASE_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          top_k: topK
        }),
      });

      if (!response.ok) {
        throw new Error('Search request failed');
      }

      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      setSearchError(`Search error: ${error.message}`);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, topK, API_BASE_URL]);

  // Similarity analysis functionality
  const handleSimilarityAnalysis = useCallback(async () => {
    if (!similarityQuery.trim()) return;
    
    setIsAnalyzing(true);
    setSimilarityError('');
    setSimilarityResults([]);

    try {
      const response = await fetch(`${API_BASE_URL}/similarity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trademark: similarityQuery,
          topK: topK,
          threshold: 0.3,
          options: {
            include_phonetic: includePhonetic
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Similarity analysis failed');
      }

      const data = await response.json();
      setSimilarityResults(data.results || []);
    } catch (error) {
      setSimilarityError(`Analysis error: ${error.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [similarityQuery, topK, includePhonetic, API_BASE_URL]);

  // File upload functionality
  const handleFileSelect = useCallback((file) => {
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setUploadError('');
      setUploadResult('');
      setUploadProgress(0);
    } else {
      setUploadError('Please select a PDF file');
    }
  }, []);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragActive(true);
    }
  }, []);

  const handleDragOut = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  }, [handleFileSelect]);

  const handleFileUpload = useCallback(async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError('');
    setUploadResult('');
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`${API_BASE_URL}/upload/stream`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.progress !== undefined) {
                setUploadProgress(data.progress);
              }
              if (data.status === 'completed') {
                setUploadResult(data.message || 'File uploaded and processed successfully!');
                setSelectedFile(null);
                setUploadProgress(0);
              } else if (data.status === 'error') {
                setUploadError(data.error || 'Upload failed');
              } else if (data.error) {
                setUploadError(data.error);
              }
            } catch (e) {
              console.log('Parse error:', e);
            }
          }
        }
      }
    } catch (error) {
      setUploadError(`Upload error: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [selectedFile, API_BASE_URL]);

  const removeFile = useCallback(() => {
    setSelectedFile(null);
    setUploadError('');
    setUploadResult('');
    setUploadProgress(0);
  }, []);

  // Help section state
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="App">
      {/* Header */}
      <header className="App-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo-icon">™</div>
            <div className="logo-text">
              <h1>TrademarkAI</h1>
              <p>Intelligent Search & Analysis</p>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="main-nav">
        <div className="nav-container">
          <div className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              <span className="tab-icon">🔍</span>
              Search Trademarks
            </button>
            <button
              className={`nav-tab ${activeTab === 'similarity' ? 'active' : ''}`}
              onClick={() => setActiveTab('similarity')}
            >
              <span className="tab-icon">📊</span>
              Similarity Analysis
            </button>
            <button
              className={`nav-tab ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <span className="tab-icon">📄</span>
              Upload PDF
            </button>
            <button
              className={`nav-tab help-tab ${activeTab === 'help' ? 'active' : ''}`}
              onClick={() => setActiveTab('help')}
            >
              <span className="tab-icon">❓</span>
              Help & Guide
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {/* Search Tab */}
        {activeTab === 'search' && (
          <div className="tab-panel">
            <div className="panel-header">
              <h2>Intelligent Trademark Search</h2>
              <p>Find trademarks using AI-powered semantic search</p>
            </div>
            
            <div className="modern-search-form">
              <div className="search-input-group">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter trademark name or description..."
                  className="modern-search-input"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  className="modern-search-button"
                >
                  {isSearching ? (
                    <div className="loading-spinner"></div>
                  ) : (
                    <span>🔍</span>
                  )}
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>
              
              {searchError && (
                <div className="modern-error">
                  <span className="error-icon">⚠️</span>
                  {searchError}
                </div>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="results-container">
                <div className="results-header">
                  <h3>Search Results</h3>
                  <div className="results-count">
                    {searchResults.length} results found
                  </div>
                </div>
                
                <div className="results-grid">
                  {searchResults.map((result, index) => (
                    <div key={index} className="result-card">
                      <div className="card-header">
                        <h4>{result.trademark_name || 'Unknown Trademark'}</h4>
                        <div className="confidence-badge">
                          {((result.similarity_score || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                      
                      <div className="card-content">
                        <div className="info-row">
                          <span className="info-label">Owner:</span>
                          <span className="info-value">{result.owner_name || 'N/A'}</span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Class:</span>
                          <span className="info-value">{result.classification || 'N/A'}</span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Status:</span>
                          <span className="info-value">{result.status || 'Unknown'}</span>
                        </div>
                        
                        {result.description && (
                          <div className="description-row">
                            <div className="info-label">Description:</div>
                            <p className="description-text">{result.description}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Similarity Analysis Tab */}
        {activeTab === 'similarity' && (
          <div className="tab-panel">
            <div className="panel-header">
              <h2>Advanced Similarity Analysis</h2>
              <p>Comprehensive trademark similarity assessment with phonetic analysis</p>
            </div>
            
            <div className="analysis-form">
              <div className="input-section">
                <label className="input-label">Trademark Query</label>
                <textarea
                  value={similarityQuery}
                  onChange={(e) => setSimilarityQuery(e.target.value)}
                  placeholder="Enter trademark name or description for analysis..."
                  className="analysis-input"
                  rows="3"
                />
              </div>
              
              <div className="options-section">
                <div className="option-group">
                  <label className="option-label">Top K Results</label>
                  <select
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="option-select"
                  >
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                  </select>
                </div>
                
                <div className="checkbox-group">
                  <label className="modern-checkbox">
                    <input
                      type="checkbox"
                      checked={includePhonetic}
                      onChange={(e) => setIncludePhonetic(e.target.checked)}
                    />
                    <span className="checkmark"></span>
                    Include Phonetic Analysis
                  </label>
                </div>
              </div>
              
              <button
                onClick={handleSimilarityAnalysis}
                disabled={isAnalyzing || !similarityQuery.trim()}
                className="analysis-button"
              >
                {isAnalyzing ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <span>📊</span>
                )}
                {isAnalyzing ? 'Analyzing...' : 'Analyze Similarity'}
              </button>
              
              {similarityError && (
                <div className="modern-error">
                  <span className="error-icon">⚠️</span>
                  {similarityError}
                </div>
              )}
            </div>

            {similarityResults.length > 0 && (
              <div className="analysis-results">
                <div className="results-summary">
                  <h3>Analysis Summary</h3>
                  <div className="summary-stats">
                    <div className="stat-item">
                      <span className="stat-label">Query</span>
                      <span className="stat-value">{similarityQuery}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Results</span>
                      <span className="stat-value">{similarityResults.length}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Phonetic</span>
                      <span className="stat-value">{includePhonetic ? 'Enabled' : 'Disabled'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="similarity-cards">
                  {similarityResults.map((result, index) => (
                    <div key={index} className="similarity-card">
                      <div className="similarity-header">
                        <h4>{result.trademark_name || 'Unknown Trademark'}</h4>
                        <div className="overall-score">
                          <span className="score-percentage">
                            {((result.overall_similarity || 0) * 100).toFixed(1)}%
                          </span>
                          <span className="score-label">Overall</span>
                        </div>
                      </div>
                      
                      <div className="trademark-details">
                        <div className="detail-row">
                          <span className="detail-label">Owner:</span>
                          <span className="detail-value">{result.owner_name || 'N/A'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Classification:</span>
                          <span className="detail-value">{result.classification || 'N/A'}</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Status:</span>
                          <span className="detail-value">{result.status || 'Unknown'}</span>
                        </div>
                        
                        {result.description && (
                          <div className="detail-description">
                            <div className="detail-label">Description:</div>
                            <p className="detail-value">{result.description}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="similarity-breakdown">
                        <h5>Similarity Breakdown</h5>
                        <div className="breakdown-grid">
                          <div className="breakdown-item">
                            <span className="breakdown-label">Text Similarity</span>
                            <span className="breakdown-value">
                              {((result.text_similarity || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="breakdown-item">
                            <span className="breakdown-label">Semantic Similarity</span>
                            <span className="breakdown-value">
                              {((result.semantic_similarity || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          {includePhonetic && result.phonetic_similarity && (
                            <div className="breakdown-item">
                              <span className="breakdown-label">Phonetic Similarity</span>
                              <span className="breakdown-value">
                                {((result.phonetic_similarity || 0) * 100).toFixed(1)}%
                              </span>
                            </div>
                          )}
                          <div className="breakdown-item">
                            <span className="breakdown-label">Confidence</span>
                            <span className="breakdown-value">
                              {((result.confidence_score || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="tab-panel">
            <div className="panel-header">
              <h2>PDF Document Upload</h2>
              <p>Upload trademark documents for intelligent processing and analysis</p>
            </div>
            
            <div className="upload-container">
              <div
                className={`upload-zone ${isDragActive ? 'drag-active' : ''} ${selectedFile ? 'has-file' : ''}`}
                onDragEnter={handleDragIn}
                onDragLeave={handleDragOut}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('fileInput').click()}
              >
                {selectedFile ? (
                  <div className="file-preview">
                    <div className="file-icon">📄</div>
                    <div className="file-info">
                      <h4>{selectedFile.name}</h4>
                      <p>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile();
                      }}
                      className="remove-file-btn"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <div className="upload-icon">📤</div>
                    <h3>Drop your PDF file here</h3>
                    <p>or click to browse</p>
                  </div>
                )}
              </div>
              
              <input
                id="fileInput"
                type="file"
                accept="application/pdf"
                onChange={(e) => handleFileSelect(e.target.files[0])}
                style={{ display: 'none' }}
              />
              
              {selectedFile && (
                <div className="upload-actions">
                  <button
                    onClick={handleFileUpload}
                    disabled={isUploading}
                    className="upload-process-btn"
                  >
                    {isUploading ? (
                      <div className="loading-spinner"></div>
                    ) : (
                      <span>📤</span>
                    )}
                    {isUploading ? 'Processing...' : 'Process Document'}
                  </button>
                </div>
              )}
              
              {isUploading && (
                <div className="progress-container">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <div className="progress-info">
                    <span className="progress-percentage">{uploadProgress}%</span>
                    <span className="progress-status">Processing document...</span>
                  </div>
                </div>
              )}
              
              {uploadError && (
                <div className="upload-result error">
                  <span className="result-icon">❌</span>
                  {uploadError}
                </div>
              )}
              
              {uploadResult && (
                <div className="upload-result success">
                  <span className="result-icon">✅</span>
                  {uploadResult}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Help Tab */}
        {activeTab === 'help' && (
          <div className="tab-panel">
            <div className="panel-header">
              <h2>Application Guide & Help</h2>
              <p>Complete guide for using all TrademarkAI features</p>
            </div>
            
            <div className="help-section-full">
              <div className="help-content-full">
                <div className="help-grid">
                  <div className="help-card">
                    <div className="help-card-header">
                      <span className="help-icon">🔍</span>
                      <h3>Search Trademarks</h3>
                    </div>
                    <div className="help-card-content">
                      <p><strong>How to Use:</strong></p>
                      <ol>
                        <li>Enter trademark keywords in the search field</li>
                        <li>Click "Search" button or press Enter</li>
                        <li>Results will display matching trademarks</li>
                      </ol>
                      <p><strong>Tips:</strong> Use specific keywords for more accurate results</p>
                    </div>
                  </div>
                  
                  <div className="help-card">
                    <div className="help-card-header">
                      <span className="help-icon">📊</span>
                      <h3>Similarity Analysis</h3>
                    </div>
                    <div className="help-card-content">
                      <p><strong>How to Use:</strong></p>
                      <ol>
                        <li>Select "Similarity Analysis" tab</li>
                        <li>Enter trademark name or description to analyze</li>
                        <li>Configure Top K Results (how many results to show)</li>
                        <li>Enable/disable Phonetic Analysis for sound-based matching</li>
                        <li>Click "Analyze Similarity" to see results</li>
                      </ol>
                      <p><strong>Results:</strong> Comprehensive similarity score 0-100% with detailed breakdown</p>
                    </div>
                  </div>
                  
                  <div className="help-card">
                    <div className="help-card-header">
                      <span className="help-icon">📄</span>
                      <h3>Upload PDF</h3>
                    </div>
                    <div className="help-card-content">
                      <p><strong>How to Use:</strong></p>
                      <ol>
                        <li>Click upload area or drag & drop PDF file</li>
                        <li>Ensure file contains trademark list</li>
                        <li>Wait for upload and extraction process</li>
                        <li>Data will be automatically saved to database</li>
                      </ol>
                      <p><strong>Format:</strong> PDF files from DJKI or trademark list format</p>
                    </div>
                  </div>
                  
                  <div className="help-card">
                    <div className="help-card-header">
                      <span className="help-icon">🎯</span>
                      <h3>Search Types Explained</h3>
                    </div>
                    <div className="help-card-content">
                      <p><strong>Semantic Search:</strong></p>
                      <p>AI-powered search that understands meaning and context. Finds trademarks that are conceptually similar even if they use different words. Example: Searching "sport shoes" will also find "athletic footwear".</p>
                      
                      <p><strong>Phonetic Analysis:</strong></p>
                      <p>Sound-based matching that finds trademarks with similar pronunciation. Useful for catching potential conflicts that sound alike but are spelled differently. Example: "Nike" vs "Naik" or "Adidas" vs "Adeedas".</p>
                      
                      <p><strong>Top K Results:</strong></p>
                      <p>Parameter that controls how many search results to display. Options: 3, 5, 10, or 15 results. Higher values show more potential matches but may include less relevant results.</p>
                      
                      <p><strong>Best Practice:</strong> Start with semantic search for comprehensive results, then use phonetic analysis for audio-based conflicts. Adjust Top K based on how thorough you want the search to be.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <div className="footer-content">
          <p>© 2024 TrademarkAI. Advanced AI-powered trademark intelligence.</p>
          <div className="footer-links">
            <span>Powered by</span>
            <span>•</span>
            <span>Semantic Search</span>
            <span>•</span>
            <span>Machine Learning</span>
            <span>•</span>
            <span>Vector Database</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;