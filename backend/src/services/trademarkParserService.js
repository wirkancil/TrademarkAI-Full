const { TrademarkData, TrademarkSearchResult, TRADEMARK_PATTERNS } = require('../types/trademarkTypes');

/**
 * Service untuk parsing dan ekstraksi data merek terstruktur
 */
class TrademarkParserService {
  constructor() {
    this.patterns = TRADEMARK_PATTERNS;
  }

  /**
   * Enhanced parsing untuk page-based chunks dengan parallel processing
   * @param {Array} pageChunks - Array page chunks dengan metadata
   * @param {string} fullText - Full text sebagai fallback
   * @returns {Promise<TrademarkData[]>} - Array data merek yang diekstrak
   */
  async parseTrademarkDataEnhanced(pageChunks, fullText) {
    try {
      console.log(`🔍 Enhanced parsing: Processing ${pageChunks.length} page chunks`);
      
      // Filter pages yang mengandung trademark data
      const trademarkPages = pageChunks.filter(chunk => chunk.hasTrademarkData);
      console.log(`📋 Found ${trademarkPages.length} pages with trademark data`);
      
      // Process trademark pages in parallel
      const trademarkPromises = trademarkPages.map(async (pageChunk, index) => {
        return this.parsePageChunk(pageChunk, index);
      });
      
      const pageResults = await Promise.all(trademarkPromises);
      const trademarks = pageResults.flat().filter(tm => tm && this.isValidTrademark(tm));
      
      // Fallback: jika tidak ada hasil dari page-based parsing, gunakan traditional parsing
      if (trademarks.length === 0) {
        console.log('⚠️ No results from page-based parsing, falling back to traditional parsing');
        return this.extractTrademarkData(fullText);
      }
      
      // Deduplicate berdasarkan nomor permohonan
      const uniqueTrademarks = this.deduplicateTrademarks(trademarks);
      
      console.log(`✅ Enhanced parsing extracted ${uniqueTrademarks.length} unique trademark entries`);
      return uniqueTrademarks;
    } catch (error) {
      console.error('❌ Error in enhanced trademark parsing:', error);
      // Fallback ke traditional parsing
      return this.extractTrademarkData(fullText);
    }
  }

  /**
   * Parse individual page chunk untuk trademark data
   * @param {object} pageChunk - Page chunk dengan content dan metadata
   * @param {number} pageIndex - Index halaman
   * @returns {Promise<TrademarkData[]>} - Array trademark data dari halaman ini
   */
  async parsePageChunk(pageChunk, pageIndex) {
    try {
      const { content, pageNumber } = pageChunk;
      
      // Gunakan regex patterns yang lebih spesifik untuk format DJKI
      const djkiPatterns = {
        applicationNumber: /(?:Nomor Permohonan|No\. Permohonan)\s*:?\s*([A-Z]{1,3}\d{10,15})/gi,
        applicantName: /(?:Nama Pemohon|Pemohon)\s*:?\s*([^\n\r]{3,100})/gi,
        receptionDate: /(?:Tanggal Penerimaan|Tgl\. Penerimaan)\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/gi,
        trademarkName: /(?:Nama Merek|Merek)\s*:?\s*([^\n\r]{2,50})/gi,
        goodsClass: /(?:Kelas Barang|Kelas)\s*:?\s*(\d{1,2})/gi,
        address: /(?:Alamat Pemohon|Alamat)\s*:?\s*([^\n\r]{10,200})/gi
      };
      
      const trademarks = [];
      
      // Cari semua matches untuk application number sebagai anchor
      const appNumberMatches = [...content.matchAll(djkiPatterns.applicationNumber)];
      
      for (const appMatch of appNumberMatches) {
        const applicationNumber = appMatch[1].trim();
        const matchIndex = appMatch.index;
        
        // Extract context around the application number (±500 characters)
        const contextStart = Math.max(0, matchIndex - 500);
        const contextEnd = Math.min(content.length, matchIndex + 1000);
        const context = content.substring(contextStart, contextEnd);
        
        // Extract other fields from context
        const trademarkData = this.extractFieldsFromContext(context, applicationNumber, pageNumber);
        
        if (trademarkData && this.isValidTrademark(trademarkData)) {
          trademarks.push(trademarkData);
        }
      }
      
      return trademarks;
    } catch (error) {
      console.error(`❌ Error parsing page chunk ${pageIndex}:`, error);
      return [];
    }
  }

  /**
   * Extract fields dari context sekitar application number
   * @param {string} context - Text context
   * @param {string} applicationNumber - Nomor permohonan
   * @param {number} pageNumber - Nomor halaman
   * @returns {TrademarkData|null} - Trademark data atau null
   */
  extractFieldsFromContext(context, applicationNumber, pageNumber) {
    try {
      const patterns = {
        applicantName: /(?:Nama Pemohon|Pemohon)\s*:?\s*([^\n\r]{3,100})/i,
        receptionDate: /(?:Tanggal Penerimaan|Tgl\. Penerimaan)\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
        trademarkName: /(?:Nama Merek|Merek)\s*:?\s*([^\n\r]{2,50})/i,
        goodsClass: /(?:Kelas Barang|Kelas)\s*:?\s*(\d{1,2})/i,
        address: /(?:Alamat Pemohon|Alamat)\s*:?\s*([^\n\r]{10,200})/i,
        trademarkType: /(?:Tipe Merek|Jenis Merek)\s*:?\s*([^\n\r]{5,30})/i
      };
      
      const extractedData = {
        applicationNumber: applicationNumber,
        pageNumber: pageNumber
      };
      
      // Extract each field
      for (const [field, pattern] of Object.entries(patterns)) {
        const match = context.match(pattern);
        if (match && match[1]) {
          extractedData[field] = this.cleanExtractedText(match[1]);
        }
      }
      
      // Create TrademarkData object
      return new TrademarkData({
        nomorPermohonan: extractedData.applicationNumber,
        namaPemohon: extractedData.applicantName || '',
        namaReferensiLabelMerek: extractedData.trademarkName || '',
        tanggalPenerimaan: extractedData.receptionDate || '',
        kelasBarangJasa: extractedData.goodsClass || '',
        alamatPemohon: extractedData.address || '',
        tipeMerek: extractedData.trademarkType || '',
        pageNumber: pageNumber,
        extractionMethod: 'enhanced-page-based'
      });
    } catch (error) {
      console.error('❌ Error extracting fields from context:', error);
      return null;
    }
  }

  /**
   * Deduplicate trademarks berdasarkan application number
   * @param {TrademarkData[]} trademarks - Array trademark data
   * @returns {TrademarkData[]} - Array trademark data yang sudah deduplicated
   */
  deduplicateTrademarks(trademarks) {
    const seen = new Set();
    const unique = [];
    
    for (const trademark of trademarks) {
      const key = trademark.applicationNumber;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(trademark);
      }
    }
    
    return unique;
  }

  /**
   * Ekstraksi data merek dari teks dokumen (traditional method)
   * @param {string} text - Teks dokumen
   * @param {string} documentId - ID dokumen
   * @returns {TrademarkData[]} - Array data merek yang diekstrak
   */
  extractTrademarkData(text, documentId = '') {
    try {
      console.log(`🔍 Extracting trademark data from document: ${documentId}`);
      
      // Split teks menjadi sections berdasarkan pattern pemisah
      const sections = this.splitIntoSections(text);
      const trademarks = [];
      
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const trademarkData = this.parseSection(section, `${documentId}_section_${i}`);
        
        if (trademarkData && this.isValidTrademark(trademarkData)) {
          trademarks.push(trademarkData);
        }
      }
      
      console.log(`✅ Extracted ${trademarks.length} trademark entries`);
      return trademarks;
    } catch (error) {
      console.error('❌ Error extracting trademark data:', error);
      return [];
    }
  }

  /**
   * Split teks menjadi sections berdasarkan pattern
   * @param {string} text - Teks input
   * @returns {string[]} - Array sections
   */
  splitIntoSections(text) {
    console.log(`📄 Input text length: ${text.length}`);
    console.log(`📄 Input text: ${text}`);
    
    // Pattern untuk memisahkan entries merek
    const sectionSeparators = [
      /(?=Nomor\s*Permohonan\s*:)/gi,
      /(?=No\.?\s*Permohonan\s*:)/gi,
      /(?=Application\s*No\.?\s*:)/gi,
      /\n\s*\n\s*\n/g, // Triple line breaks
      /={3,}/g, // Multiple equals signs
      /-{3,}/g  // Multiple dashes
    ];
    
    let sections = [text];
    
    // Apply each separator pattern
    for (const pattern of sectionSeparators) {
      const newSections = [];
      for (const section of sections) {
        const parts = section.split(pattern).filter(part => part.trim().length > 20);
        newSections.push(...parts);
      }
      sections = newSections;
    }
    
    const filteredSections = sections.filter(section => section.trim().length > 50);
    console.log(`📄 Found ${filteredSections.length} sections after filtering`);
    
    return filteredSections;
  }

  /**
   * Parse section untuk ekstraksi data merek
   * @param {string} section - Section teks
   * @param {string} sectionId - ID section
   * @returns {TrademarkData|null} - Data merek atau null
   */
  parseSection(section, sectionId) {
    try {
      console.log(`🔍 Parsing section: ${sectionId}`);
      console.log(`📝 Section text: ${section.substring(0, 300)}...`);
      
      const extractedData = {};
      
      // Ekstraksi setiap field menggunakan pattern
      for (const [field, patterns] of Object.entries(this.patterns)) {
        console.log(`🔎 Testing field ${field} with ${patterns.length} patterns`);
        let match = null;
        
        // Try each pattern in the array until one matches
        for (let i = 0; i < patterns.length && !match; i++) {
          const pattern = patterns[i];
          match = section.match(pattern);
          if (match && match[1]) {
            console.log(`✅ Pattern ${i + 1} matched for ${field}: ${match[1]}`);
            break;
          }
        }
        
        if (match && match[1]) {
          // Handle special case for tanggalPenerimaan (multiple groups)
          if (field === 'tanggalPenerimaan' && match.length > 3) {
            extractedData[field] = `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
          } else {
            extractedData[field] = this.cleanExtractedText(match[1]);
          }
          console.log(`✅ Found ${field}: ${extractedData[field]}`);
        } else {
          console.log(`❌ No match for ${field}`);
        }
      }
      
      // Clean and improve extracted data
      if (extractedData.namaReferensiLabelMerek) {
        // Clean trademark name - remove prefixes and suffixes
        extractedData.namaReferensiLabelMerek = extractedData.namaReferensiLabelMerek
          .replace(/^:\s*/, '') // Remove leading colon
          .replace(/\s+Merek\s+Kata.*$/i, '') // Remove "Merek Kata" suffix
          .replace(/\s+\d{3}.*$/, '') // Remove trailing numbers
          .trim();
        console.log(`🧹 Cleaned namaReferensiLabelMerek: ${extractedData.namaReferensiLabelMerek}`);
      }
      
      // Clean extracted data
      if (extractedData.namaPemohon) {
        extractedData.namaPemohon = this.cleanExtractedText(extractedData.namaPemohon);
        console.log(`🧹 Cleaned namaPemohon: ${extractedData.namaPemohon}`);
      }
      
      if (extractedData.namaReferensiLabelMerek) {
        extractedData.namaReferensiLabelMerek = this.cleanExtractedText(extractedData.namaReferensiLabelMerek);
        console.log(`🧹 Cleaned namaReferensiLabelMerek: ${extractedData.namaReferensiLabelMerek}`);
      }
      
      if (extractedData.uraianBarangJasa) {
        // Clean goods/services description
        extractedData.uraianBarangJasa = extractedData.uraianBarangJasa
          .replace(/^[A-Z]+\s+\d+\s*/, '') // Remove color and number prefixes
          .replace(/\s*;.*$/, '') // Keep only first part before semicolon
          .trim();
        console.log(`🧹 Cleaned uraianBarangJasa: ${extractedData.uraianBarangJasa}`);
      }
      
      // Use existing extraction methods for complex fields
      if (!extractedData.alamatPemohon) {
        extractedData.alamatPemohon = this.extractAddress(section, 'pemohon');
      }
      
      if (!extractedData.alamatKuasa) {
        extractedData.alamatKuasa = this.extractAddress(section, 'kuasa');
      }
      
      if (!extractedData.prioritas) {
        extractedData.prioritas = this.extractPriority(section);
      }
      
      if (!extractedData.artiBahasa) {
        extractedData.artiBahasa = this.extractLanguageMeaning(section);
      }
      
      const trademarkData = new TrademarkData(extractedData);
      console.log(`📊 Created TrademarkData:`, trademarkData.toJSON());
      
      const validation = trademarkData.validate();
      console.log(`🔍 Validation result:`, validation);
      
      return trademarkData;
    } catch (error) {
      console.error(`Error parsing section ${sectionId}:`, error);
      return null;
    }
  }

  /**
   * Ekstraksi alamat dari teks
   * @param {string} text - Teks input
   * @param {string} type - Tipe alamat (pemohon/kuasa)
   * @returns {string} - Alamat yang diekstrak
   */
  extractAddress(text, type) {
    const addressPatterns = {
      pemohon: /(?:Alamat\s*Pemohon|Alamat)\s*:?\s*([^\n\r]+(?:\n[^\n\r:]+)*)/i,
      kuasa: /(?:Alamat\s*Kuasa|Kuasa\s*Alamat)\s*:?\s*([^\n\r]+(?:\n[^\n\r:]+)*)/i
    };
    
    const pattern = addressPatterns[type];
    if (!pattern) return '';
    
    const match = text.match(pattern);
    if (match && match[1]) {
      return this.cleanExtractedText(match[1]);
    }
    
    return '';
  }

  /**
   * Ekstraksi informasi prioritas
   * @param {string} text - Teks input
   * @returns {string} - Informasi prioritas
   */
  extractPriority(text) {
    const priorityPatterns = [
      /(?:Prioritas|Priority)\s*:?\s*([^\n\r]+)/i,
      /(?:Hak\s*Prioritas)\s*:?\s*([^\n\r]+)/i
    ];
    
    for (const pattern of priorityPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return this.cleanExtractedText(match[1]);
      }
    }
    
    return '';
  }

  /**
   * Ekstraksi arti bahasa
   * @param {string} text - Teks input
   * @returns {string} - Arti bahasa
   */
  extractLanguageMeaning(text) {
    const meaningPatterns = [
      /(?:Arti\s*Bahasa|Terjemahan|Translation)\s*:?\s*([^\n\r]+)/i,
      /(?:Tidak\s*Ada\s*Terjemahan|No\s*Translation)/i
    ];
    
    for (const pattern of meaningPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[1]) {
          return this.cleanExtractedText(match[1]);
        } else {
          return 'Tidak Ada Terjemahan';
        }
      }
    }
    
    return '';
  }

  /**
   * Bersihkan teks yang diekstrak
   * @param {string} text - Teks input
   * @returns {string} - Teks yang sudah dibersihkan
   */
  cleanExtractedText(text) {
    if (!text) return '';
    
    return text
      .trim()
      .replace(/\s+/g, ' ') // Multiple spaces to single space
      .replace(/[\r\n]+/g, ' ') // Line breaks to space
      .replace(/\s*:\s*$/, '') // Remove trailing colon
      .trim();
  }

  /**
   * Validasi apakah data merek valid
   * @param {TrademarkData} trademarkData - Data merek
   * @returns {boolean} - Status validasi
   */
  isValidTrademark(trademarkData) {
    if (!trademarkData) return false;
    
    const validation = trademarkData.validate();
    return validation.isValid;
  }

  /**
   * Format data merek untuk penyimpanan di vector database
   * @param {TrademarkData} trademarkData - Data merek
   * @param {string} documentId - ID dokumen
   * @param {number} chunkIndex - Index chunk
   * @returns {object} - Metadata untuk vector storage
   */
  formatForVectorStorage(trademarkData, documentId, chunkIndex) {
    // Simpan semua field penting dengan batasan panjang untuk metadata Pinecone
    return {
      type: 'trademark_data',
      documentId: documentId || '',
      chunkIndex: chunkIndex || 0,
      nomorPermohonan: (trademarkData.nomorPermohonan || '').substring(0, 150),
      namaReferensiLabelMerek: (trademarkData.namaReferensiLabelMerek || '').substring(0, 300),
      namaPemohon: (trademarkData.namaPemohon || '').substring(0, 300),
      alamatPemohon: (trademarkData.alamatPemohon || '').substring(0, 400),
      kelasBarangJasa: (trademarkData.kelasBarangJasa || '').substring(0, 100),
      uraianBarangJasa: (trademarkData.uraianBarangJasa || '').substring(0, 500),
      tanggalPenerimaan: (trademarkData.tanggalPenerimaan || '').substring(0, 50),
      tanggalPublikasi: (trademarkData.tanggalPublikasi || '').substring(0, 50),
      prioritas: (trademarkData.prioritas || '').substring(0, 200),
      artiBahasa: (trademarkData.artiBahasa || '').substring(0, 300),
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Parse hasil pencarian menjadi format terstruktur
   * @param {object[]} searchResults - Hasil pencarian dari vector DB
   * @returns {TrademarkSearchResult[]} - Hasil pencarian terstruktur
   */
  parseSearchResults(searchResults) {
    return searchResults
      .filter(result => result.metadata)
      .map(result => {
        const metadata = result.metadata;
        const text = result.metadata.text || '';
        
        let extractedData;
         
         // Check if this is structured trademark data
         if (metadata.type === 'trademark_data') {
           // Use structured metadata directly
           extractedData = {
             nomorPermohonan: metadata.nomorPermohonan || '',
             tanggalPenerimaan: metadata.tanggalPenerimaan || '',
             namaPemohon: metadata.namaPemohon || '',
             alamatPemohon: metadata.alamatPemohon || '',
             namaKuasa: metadata.namaKuasa || '',
             alamatKuasa: metadata.alamatKuasa || '',
             tipeMerek: metadata.tipeMerek || '',
             namaReferensiLabelMerek: metadata.namaReferensiLabelMerek || metadata.namaMerek || '',
             artiBahasa: metadata.artiBahasa || '',
             uraianWarna: metadata.uraianWarna || '',
             kelasBarangJasa: metadata.kelasBarangJasa || '',
             uraianBarangJasa: metadata.uraianBarangJasa || '',
             statusPermohonan: metadata.statusPermohonan || '',
             tanggalPublikasi: metadata.tanggalPublikasi || '',
             nomorSertifikat: metadata.nomorSertifikat || '',
             tanggalSertifikat: metadata.tanggalSertifikat || '',
             masaBerlaku: metadata.masaBerlaku || ''
           };
         } else {
           // Legacy: Extract trademark data from the text content for page_chunk results
           
           // Try to extract trademark fields from the text
           extractedData = this.extractTrademarkFieldsFromText(text);
           
           // Fallback: extract basic info if structured extraction fails
           if (this.isEmptyExtraction(extractedData)) {
             const fallbackData = this.extractBasicInfo(text);
             Object.assign(extractedData, fallbackData);
           }
         }
        
        // Format tanggal penerimaan untuk display yang lebih baik
        const formatDate = (dateStr) => {
          if (!dateStr) return '';
          // Jika format sudah DD/MM/YYYY, biarkan
          if (dateStr.includes('/')) return dateStr.split(' ')[0]; // Ambil bagian tanggal saja
          // Jika format lain, coba parse
          try {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              return date.toLocaleDateString('id-ID');
            }
          } catch (e) {
            // Ignore parsing errors
          }
          return dateStr;
        };
        
        // Create TrademarkData from extracted fields dengan format yang lebih terstruktur
        const trademarkData = new TrademarkData({
          nomorPermohonan: extractedData.nomorPermohonan || '',
          namaReferensiLabelMerek: extractedData.namaReferensiLabelMerek || '',
          namaPemohon: extractedData.namaPemohon || '',
          alamatPemohon: extractedData.alamatPemohon || '',
          kelasBarangJasa: extractedData.kelasBarangJasa || '',
          uraianBarangJasa: extractedData.uraianBarangJasa || '',
          tanggalPenerimaan: formatDate(extractedData.tanggalPenerimaan) || '',
          tanggalPublikasi: formatDate(extractedData.tanggalPublikasi) || '',
          tipeMerek: extractedData.tipeMerek || '',
          prioritas: extractedData.prioritas || '',
          artiBahasa: extractedData.artiBahasa || '',
          uraianWarna: extractedData.uraianWarna || '',
          namaKuasa: extractedData.namaKuasa || '',
          alamatKuasa: extractedData.alamatKuasa || '',
          statusPermohonan: extractedData.statusPermohonan || '',
          nomorSertifikat: extractedData.nomorSertifikat || '',
          tanggalSertifikat: formatDate(extractedData.tanggalSertifikat) || '',
          masaBerlaku: extractedData.masaBerlaku || ''
        });
        
        return new TrademarkSearchResult({
          id: result.id,
          score: result.score,
          trademarkData: trademarkData,
          sourceDocument: result.metadata.filename || result.metadata.documentId,
          chunkId: result.id,
          confidence: this.calculateConfidence(result.score),
          matchedFields: this.identifyMatchedFields(result),
          extractedText: text
        });
      });
  }

  /**
   * Extract trademark fields from text content
   * @param {string} text - Text content to extract from
   * @returns {object} - Extracted trademark fields
   */
  extractTrademarkFieldsFromText(text) {
    const extractedData = {};
    
    // Use enhanced patterns to extract fields with multiple pattern attempts
    for (const [field, patterns] of Object.entries(this.patterns)) {
      const patternArray = Array.isArray(patterns) ? patterns : [patterns];
      
      for (const pattern of patternArray) {
        const match = text.match(pattern);
        if (match && match[1]) {
          if (field === 'tanggalPenerimaan' && match.length > 3) {
            extractedData[field] = `${match[1]}/${match[2]}/${match[3]} ${match[4] || ''}:${match[5] || ''}:${match[6] || ''}`;
          } else {
            extractedData[field] = this.cleanExtractedText(match[1]);
          }
          break; // Stop at first successful match
        }
      }
    }
    
    return extractedData;
  }

  /**
   * Check if extraction result is mostly empty
   * @param {object} extractedData - Extracted data object
   * @returns {boolean} - True if extraction is mostly empty
   */
  isEmptyExtraction(extractedData) {
    const importantFields = ['nomorPermohonan', 'namaReferensiLabelMerek', 'namaPemohon'];
    const filledFields = importantFields.filter(field => extractedData[field] && extractedData[field].trim());
    return filledFields.length < 2;
  }

  /**
   * Extract basic information as fallback
   * @param {string} text - Text content
   * @returns {object} - Basic extracted information
   */
  extractBasicInfo(text) {
    const basicData = {};
    
    // Extract JID number as application number
    const jidMatch = text.match(/JID\s+(\d{10,})/i);
    if (jidMatch) {
      basicData.nomorPermohonan = jidMatch[1];
    }
    
    // Extract date patterns
    const dateMatch = text.match(/(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})\s+(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})/i);
    if (dateMatch) {
      basicData.tanggalPenerimaan = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]} ${dateMatch[4]}:${dateMatch[5]}:${dateMatch[6]}`;
    }
    
    // Extract class number
    const classMatch = text.match(/\b(\d{1,2})\s*(?=\s*510)/i);
    if (classMatch) {
      basicData.kelasBarangJasa = classMatch[1];
    }
    
    return basicData;
  }

  /**
   * Hitung confidence score
   * @param {number} score - Similarity score
   * @returns {number} - Confidence score (0-1)
   */
  calculateConfidence(score) {
    // Convert similarity score to confidence percentage
    return Math.min(Math.max(score * 100, 0), 100);
  }

  /**
   * Search trademarks using vector similarity
   * @param {string} query - Search query
   * @param {number} topK - Number of results to return
   * @param {object} filters - Search filters
   * @returns {Promise<TrademarkSearchResult[]>} - Search results
   */
  async searchTrademarks(query, topK = 10, filters = {}) {
    try {
      console.log(`🔍 Searching trademarks for query: "${query}"`);
      
      const vectorService = require('./vectorService');
      
      // Perform vector search with higher topK to get more candidates for filtering
      const searchResults = await vectorService.search(query, {
        topK: topK * 3, // Get more results to filter from
        filter: {
          type: 'trademark_data',
          ...filters
        }
      });
      
      console.log(`📊 Found ${searchResults.length} raw results`);
      
      // Parse and format results
      const formattedResults = this.parseSearchResults(searchResults);
      
      // Filter results based on query relevance
      const filteredResults = this.filterRelevantResults(formattedResults, query);
      
      // Limit to requested topK
      const finalResults = filteredResults.slice(0, topK);
      
      console.log(`✅ Returning ${finalResults.length} filtered trademark results (from ${formattedResults.length} candidates)`);
      if (finalResults.length > 0) {
        console.log('First filtered result:', JSON.stringify(finalResults[0], null, 2));
      }
      return finalResults;
    } catch (error) {
      console.error('❌ Error searching trademarks:', error);
      throw error;
    }
  }

  /**
   * Filter results based on query relevance
   * @param {TrademarkSearchResult[]} results - Formatted search results
   * @param {string} query - Search query
   * @returns {TrademarkSearchResult[]} - Filtered relevant results
   */
  filterRelevantResults(results, query) {
    const queryLower = query.toLowerCase().trim();
    
    // If query is too short, return all results
    if (queryLower.length < 2) {
      return results;
    }
    
    const relevantResults = results.filter(result => {
      const trademark = result.trademarkData;
      if (!trademark) return false;
      
      // Check if query matches trademark name (most important)
      const namaMerek = (trademark.namaReferensiLabelMerek || '').toLowerCase();
      if (namaMerek.includes(queryLower)) {
        return true;
      }
      
      // Check if query matches applicant name
      const namaPemohon = (trademark.namaPemohon || '').toLowerCase();
      if (namaPemohon.includes(queryLower)) {
        return true;
      }
      
      // Check if query matches goods/services description
      const uraianBarang = (trademark.uraianBarangJasa || '').toLowerCase();
      if (uraianBarang.includes(queryLower)) {
        return true;
      }
      
      // Check if query matches application number
      const nomorPermohonan = (trademark.nomorPermohonan || '').toLowerCase();
      if (nomorPermohonan.includes(queryLower)) {
        return true;
      }
      
      // For high-scoring results (>0.8), be more lenient
      if (result.score > 0.8) {
        return true;
      }
      
      return false;
    });
    
    // Sort by relevance: exact matches first, then by score
    relevantResults.sort((a, b) => {
      const aName = (a.trademarkData.namaReferensiLabelMerek || '').toLowerCase();
      const bName = (b.trademarkData.namaReferensiLabelMerek || '').toLowerCase();
      
      // Exact matches first
      const aExact = aName === queryLower;
      const bExact = bName === queryLower;
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // Then by contains match
      const aContains = aName.includes(queryLower);
      const bContains = bName.includes(queryLower);
      
      if (aContains && !bContains) return -1;
      if (!aContains && bContains) return 1;
      
      // Finally by score
      return b.score - a.score;
    });
    
    console.log(`🎯 Filtered ${relevantResults.length} relevant results from ${results.length} total results for query: "${query}"`);
    
    return relevantResults;
  }

  /**
   * Identifikasi field yang cocok dalam pencarian
   * @param {object} result - Hasil pencarian
   * @returns {string[]} - Array field yang cocok
   */
  identifyMatchedFields(result) {
    const matchedFields = [];
    const metadata = result.metadata;
    
    if (!metadata || !metadata.trademarkData) return matchedFields;
    
    // Logic untuk identifikasi field yang cocok berdasarkan query
    // Ini bisa diperluas dengan analisis lebih detail
    
    return matchedFields;
  }
}

module.exports = new TrademarkParserService();