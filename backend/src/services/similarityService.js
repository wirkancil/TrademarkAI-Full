const { TrademarkSearchResult } = require('../types/trademarkTypes');
const vectorService = require('./vectorService');
const trademarkParserService = require('./trademarkParserService');

/**
 * Service untuk analisis kemiripan merek dagang
 * Menangani berbagai jenis similarity: tekstual, fonetik, dan visual
 */
class SimilarityService {
  constructor() {
    // Threshold untuk berbagai jenis similarity
    this.thresholds = {
      textSimilarity: 0.7,
      phoneticSimilarity: 0.8,
      semanticSimilarity: 0.6,
      overallSimilarity: 0.3  // Nilai reasonable untuk produksi
    };
  }

  /**
   * Analisis kemiripan komprehensif untuk merek dagang
   * @param {string} targetTrademark - Merek yang akan dianalisis
   * @param {object} options - Opsi pencarian
   * @returns {Promise<object>} - Hasil analisis kemiripan
   */
  async analyzeSimilarity(targetTrademark, options = {}) {
    try {
      const { 
        topK = 20, 
        includePhonetic = true, 
        includeVisual = false,
        dateRange = null 
      } = options;

      console.log(`🔍 Analyzing similarity for: "${targetTrademark}"`);

      // 1. Cari semua merek dagang yang ada
      const allTrademarks = await this.getAllTrademarks(dateRange);
      console.log(`📊 Found ${allTrademarks.length} trademarks to compare`);

      // 2. Analisis Phase 1: Kemiripan tekstual
      console.log('📝 Analyzing text similarity...');
      console.log(`📋 First trademark sample:`, JSON.stringify(allTrademarks[0], null, 2));
      const textSimilarityResults = await this.analyzeTextSimilarity(
        targetTrademark, 
        allTrademarks
      );
      console.log(`📊 Text similarity: ${textSimilarityResults.length} matches found`);
      console.log(`📊 Text similarity results:`, textSimilarityResults.slice(0, 2));

      // 3. Analisis Phase 1: Kemiripan deskripsi/uraian
      const descriptionSimilarityResults = await this.analyzeDescriptionSimilarity(
        targetTrademark,
        allTrademarks
      );

      // 4. Analisis Phase 2: Kemiripan fonetik (jika diminta)
      let phoneticSimilarityResults = [];
      if (includePhonetic) {
        phoneticSimilarityResults = await this.analyzePhoneticSimilarity(
          targetTrademark,
          allTrademarks
        );
      }

      // 5. Gabungkan semua hasil dan hitung skor gabungan
      const combinedResults = this.combineAndScoreResults(
        targetTrademark,
        textSimilarityResults,
        descriptionSimilarityResults,
        phoneticSimilarityResults
      );

      // 6. Filter hasil berdasarkan threshold dan sort
      console.log(`🔍 Combined results before filtering:`, combinedResults.length);
      console.log(`🔍 Overall similarity threshold:`, this.thresholds.overallSimilarity);
      if (combinedResults.length > 0) {
        console.log(`🔍 Sample combined result:`, JSON.stringify(combinedResults[0], null, 2));
      }
      
      // Debug logging untuk melihat skor similarity
      console.log(`🔍 Debug: Combined results count: ${combinedResults.length}`);
      combinedResults.forEach((result, index) => {
        console.log(`🔍 Result ${index + 1}: ${result.trademark.namaReferensiLabelMerek || 'Unknown'} - Score: ${result.overallScore.toFixed(3)}`);
      });
      
      const filteredResults = combinedResults
        .filter(result => result.overallScore >= this.thresholds.overallSimilarity)
        .sort((a, b) => b.overallScore - a.overallScore)
        .slice(0, topK);

      console.log(`✅ Found ${filteredResults.length} similar trademarks (threshold: ${this.thresholds.overallSimilarity})`);

      return {
        targetTrademark,
        totalCompared: allTrademarks.length,
        similarTrademarks: filteredResults,
        analysisDate: new Date().toISOString(),
        options: {
          includePhonetic,
          includeVisual,
          dateRange,
          topK
        }
      };
    } catch (error) {
      console.error('❌ Error in similarity analysis:', error);
      throw error;
    }
  }

  /**
   * Phase 1: Analisis kemiripan kata/teks menggunakan string similarity
   * @param {string} target - Target trademark
   * @param {Array} trademarks - Array semua trademark
   * @returns {Array} - Hasil analisis kemiripan teks
   */
  async analyzeTextSimilarity(target, trademarks) {
    console.log('📝 Analyzing text similarity...');
    
    const results = [];
    const targetNormalized = this.normalizeText(target);

    console.log(`📋 Sample trademark data:`, JSON.stringify(trademarks[0], null, 2));
    
    for (const trademark of trademarks) {
      // Akses field nama merek dari struktur data yang benar
      // Berdasarkan struktur metadata yang baru diupload
      const trademarkName = trademark.namaMerek || 
                           trademark.namaReferensiLabelMerek || 
                           // Fallback: ekstrak dari extractedText
                           (trademark.extractedText ? trademark.extractedText.split(' ')[0] : '') || '';
      const normalizedTrademark = this.normalizeText(trademarkName);
      
      console.log(`🔍 Processing trademark: "${trademarkName}" -> "${normalizedTrademark}"`); 
      console.log(`📋 TrademarkData keys:`, trademark.trademarkData ? Object.keys(trademark.trademarkData) : 'undefined');
      console.log(`📋 ExtractedText:`, trademark.extractedText);

      // Hitung berbagai jenis string similarity
      const levenshteinScore = this.calculateLevenshteinSimilarity(
        targetNormalized, 
        normalizedTrademark
      );
      
      const jaroWinklerScore = this.calculateJaroWinklerSimilarity(
        targetNormalized, 
        normalizedTrademark
      );

      const substringScore = this.calculateSubstringSimilarity(
        targetNormalized, 
        normalizedTrademark
      );

      // Skor gabungan untuk text similarity
      const textScore = (levenshteinScore * 0.4 + jaroWinklerScore * 0.4 + substringScore * 0.2);

      // Debug logging untuk melihat skor
      console.log(`🔍 Text similarity for "${targetNormalized}" vs "${normalizedTrademark}":
        Levenshtein: ${levenshteinScore.toFixed(3)}
        Jaro-Winkler: ${jaroWinklerScore.toFixed(3)}
        Substring: ${substringScore.toFixed(3)}
        Overall: ${textScore.toFixed(3)}
        Threshold: ${this.thresholds.textSimilarity}`);

      if (textScore >= this.thresholds.textSimilarity) {
        results.push({
          trademark,
          textSimilarity: {
            overall: textScore,
            levenshtein: levenshteinScore,
            jaroWinkler: jaroWinklerScore,
            substring: substringScore
          }
        });
      }
    }

    console.log(`📊 Text similarity: ${results.length} matches found`);
    return results;
  }

  /**
   * Phase 1: Analisis kemiripan deskripsi menggunakan semantic similarity
   * @param {string} target - Target trademark
   * @param {Array} trademarks - Array semua trademark
   * @returns {Array} - Hasil analisis kemiripan deskripsi
   */
  async analyzeDescriptionSimilarity(target, trademarks) {
    console.log('📄 Analyzing description similarity...');
    
    const results = [];

    // Generate embedding untuk target
    const targetEmbedding = await vectorService.generateEmbedding(target);

    for (const trademark of trademarks) {
      const description = trademark.uraianBarangJasa || 
                         trademark.trademarkData?.uraianBarangJasa || 
                         '';
      
      if (description.trim().length > 0) {
        // Generate embedding untuk deskripsi
        const descEmbedding = await vectorService.generateEmbedding(description);
        
        // Hitung cosine similarity
        const semanticScore = this.calculateCosineSimilarity(targetEmbedding, descEmbedding);

        if (semanticScore >= this.thresholds.semanticSimilarity) {
          results.push({
            trademark,
            descriptionSimilarity: {
              semantic: semanticScore,
              description: description.substring(0, 200) + '...'
            }
          });
        }
      }
    }

    console.log(`📊 Description similarity: ${results.length} matches found`);
    return results;
  }

  /**
   * Phase 2: Analisis kemiripan fonetik/pembacaan
   * @param {string} target - Target trademark
   * @param {Array} trademarks - Array semua trademark
   * @returns {Array} - Hasil analisis kemiripan fonetik
   */
  async analyzePhoneticSimilarity(target, trademarks) {
    console.log('🔊 Analyzing phonetic similarity...');
    
    const results = [];
    const targetPhonetic = this.generatePhoneticCode(target);

    for (const trademark of trademarks) {
      const trademarkName = trademark.namaMerek || '';
      const trademarkPhonetic = this.generatePhoneticCode(trademarkName);

      // Hitung kemiripan fonetik
      const phoneticScore = this.calculatePhoneticSimilarity(
        targetPhonetic, 
        trademarkPhonetic
      );

      if (phoneticScore >= this.thresholds.phoneticSimilarity) {
        results.push({
          trademark,
          phoneticSimilarity: {
            score: phoneticScore,
            targetPhonetic,
            trademarkPhonetic
          }
        });
      }
    }

    console.log(`📊 Phonetic similarity: ${results.length} matches found`);
    return results;
  }

  /**
   * Gabungkan semua hasil similarity dan hitung skor gabungan
   * @param {string} target - Target trademark
   * @param {Array} textResults - Hasil text similarity
   * @param {Array} descResults - Hasil description similarity
   * @param {Array} phoneticResults - Hasil phonetic similarity
   * @returns {Array} - Hasil gabungan dengan skor overall
   */
  combineAndScoreResults(target, textResults, descResults, phoneticResults) {
    const combinedMap = new Map();

    // Gabungkan hasil text similarity
    textResults.forEach(result => {
      const key = result.trademark.nomorPermohonan || 
                 result.trademark.id || 
                 result.trademark.sourceDocument;
      combinedMap.set(key, {
        trademark: result.trademark,
        textSimilarity: result.textSimilarity,
        descriptionSimilarity: null,
        phoneticSimilarity: null
      });
    });

    // Gabungkan hasil description similarity
    descResults.forEach(result => {
      const key = result.trademark.nomorPermohonan || 
                 result.trademark.id || 
                 result.trademark.sourceDocument;
      if (combinedMap.has(key)) {
        combinedMap.get(key).descriptionSimilarity = result.descriptionSimilarity;
      } else {
        combinedMap.set(key, {
          trademark: result.trademark,
          textSimilarity: null,
          descriptionSimilarity: result.descriptionSimilarity,
          phoneticSimilarity: null
        });
      }
    });

    // Gabungkan hasil phonetic similarity
    phoneticResults.forEach(result => {
      const key = result.trademark.nomorPermohonan || 
                 result.trademark.id || 
                 result.trademark.sourceDocument;
      if (combinedMap.has(key)) {
        combinedMap.get(key).phoneticSimilarity = result.phoneticSimilarity;
      } else {
        combinedMap.set(key, {
          trademark: result.trademark,
          textSimilarity: null,
          descriptionSimilarity: null,
          phoneticSimilarity: result.phoneticSimilarity
        });
      }
    });

    // Hitung skor gabungan
    const results = Array.from(combinedMap.values()).map(item => {
      const textScore = item.textSimilarity?.overall || 0;
      const descScore = item.descriptionSimilarity?.semantic || 0;
      const phoneticScore = item.phoneticSimilarity?.score || 0;

      // Weighted average (bisa disesuaikan)
      const overallScore = (
        textScore * 0.4 + 
        descScore * 0.3 + 
        phoneticScore * 0.3
      );

      return {
        ...item,
        overallScore,
        similarityBreakdown: {
          text: textScore,
          description: descScore,
          phonetic: phoneticScore
        }
      };
    });

    return results;
  }

  /**
   * Ambil semua trademark dari database
   * @param {object} dateRange - Range tanggal (opsional)
   * @returns {Array} - Array semua trademark
   */
  async getAllTrademarks(dateRange = null) {
    try {
      console.log('🔍 Getting all trademarks from vector database...');
      
      // Gunakan vector search dengan query umum untuk mendapatkan semua data
      // Query kosong tidak selalu bekerja baik, gunakan query umum seperti "merek"
      const searchResults = await vectorService.search('trademark brand', {
        topK: 10000, // Ambil banyak data
        filter: {
          type: 'trademark_data'
        }
      });

      console.log(`📊 Found ${searchResults.length} raw search results`);

      // Parse hasil menjadi format trademark
      const trademarks = trademarkParserService.parseSearchResults(searchResults);
      
      console.log(`📊 Parsed ${trademarks.length} trademarks`);
      if (trademarks.length > 0) {
        console.log('📋 Sample trademark structure:', JSON.stringify(trademarks[0], null, 2));
      }

      // Filter berdasarkan tanggal jika ada
      if (dateRange && dateRange.start && dateRange.end) {
        const filtered = trademarks.filter(tm => {
          const tmDate = new Date(tm.tanggalPenerimaan || tm.trademarkData?.tanggalPenerimaan);
          return tmDate >= new Date(dateRange.start) && tmDate <= new Date(dateRange.end);
        });
        console.log(`📊 Filtered to ${filtered.length} trademarks by date range`);
        return filtered;
      }

      return trademarks;
    } catch (error) {
      console.error('❌ Error getting all trademarks:', error);
      throw error;
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Normalize text untuk perbandingan
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Hitung Levenshtein similarity
   */
  calculateLevenshteinSimilarity(str1, str2) {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : 1 - (distance / maxLength);
  }

  /**
   * Hitung Levenshtein distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Hitung Jaro-Winkler similarity
   */
  calculateJaroWinklerSimilarity(str1, str2) {
    const jaroSim = this.jaroSimilarity(str1, str2);
    
    if (jaroSim < 0.7) return jaroSim;
    
    // Hitung common prefix (max 4 characters)
    let prefix = 0;
    for (let i = 0; i < Math.min(str1.length, str2.length, 4); i++) {
      if (str1[i] === str2[i]) {
        prefix++;
      } else {
        break;
      }
    }
    
    return jaroSim + (0.1 * prefix * (1 - jaroSim));
  }

  /**
   * Hitung Jaro similarity
   */
  jaroSimilarity(str1, str2) {
    if (str1.length === 0 && str2.length === 0) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;
    
    const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
    const str1Matches = new Array(str1.length).fill(false);
    const str2Matches = new Array(str2.length).fill(false);
    
    let matches = 0;
    let transpositions = 0;
    
    // Find matches
    for (let i = 0; i < str1.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, str2.length);
      
      for (let j = start; j < end; j++) {
        if (str2Matches[j] || str1[i] !== str2[j]) continue;
        str1Matches[i] = true;
        str2Matches[j] = true;
        matches++;
        break;
      }
    }
    
    if (matches === 0) return 0;
    
    // Find transpositions
    let k = 0;
    for (let i = 0; i < str1.length; i++) {
      if (!str1Matches[i]) continue;
      while (!str2Matches[k]) k++;
      if (str1[i] !== str2[k]) transpositions++;
      k++;
    }
    
    return (matches / str1.length + matches / str2.length + (matches - transpositions / 2) / matches) / 3;
  }

  /**
   * Hitung substring similarity
   */
  calculateSubstringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1;
    
    const longestCommonSubstring = this.longestCommonSubstring(str1, str2);
    return longestCommonSubstring.length / longer.length;
  }

  /**
   * Cari longest common substring
   */
  longestCommonSubstring(str1, str2) {
    let longest = '';
    
    for (let i = 0; i < str1.length; i++) {
      for (let j = 0; j < str2.length; j++) {
        let k = 0;
        while (i + k < str1.length && j + k < str2.length && str1[i + k] === str2[j + k]) {
          k++;
        }
        if (k > longest.length) {
          longest = str1.substring(i, i + k);
        }
      }
    }
    
    return longest;
  }

  /**
   * Hitung cosine similarity antara dua vektor
   */
  calculateCosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Generate phonetic code (simplified Soundex-like)
   */
  generatePhoneticCode(text) {
    const normalized = this.normalizeText(text);
    
    // Simplified phonetic mapping untuk bahasa Indonesia
    const phoneticMap = {
      'c': 'k', 'q': 'k', 'x': 'ks',
      'f': 'p', 'v': 'p',
      'j': 'y', 'z': 's'
    };
    
    let phonetic = normalized
      .split('')
      .map(char => phoneticMap[char] || char)
      .join('');
    
    // Remove consecutive duplicates
    phonetic = phonetic.replace(/(.)\1+/g, '$1');
    
    return phonetic;
  }

  /**
   * Hitung phonetic similarity
   */
  calculatePhoneticSimilarity(phonetic1, phonetic2) {
    return this.calculateLevenshteinSimilarity(phonetic1, phonetic2);
  }

  /**
   * Generate laporan kemiripan per periode
   * @param {object} dateRange - Range tanggal
   * @param {Array} targetTrademarks - Array merek yang akan dianalisis
   * @returns {Promise<object>} - Laporan kemiripan
   */
  async generateSimilarityReport(dateRange, targetTrademarks = []) {
    try {
      console.log('📊 Generating similarity report for period:', dateRange);
      
      const report = {
        period: dateRange,
        generatedAt: new Date().toISOString(),
        totalAnalyzed: 0,
        similarityFindings: [],
        summary: {
          highSimilarity: 0,
          mediumSimilarity: 0,
          lowSimilarity: 0
        }
      };

      // Jika tidak ada target trademark yang spesifik, ambil semua dari periode tersebut
      if (targetTrademarks.length === 0) {
        const allTrademarks = await this.getAllTrademarks(dateRange);
        targetTrademarks = allTrademarks.slice(0, 50); // Batasi untuk performa
      }

      report.totalAnalyzed = targetTrademarks.length;

      // Analisis setiap trademark
      for (const trademark of targetTrademarks) {
        const similarityResult = await this.analyzeSimilarity(
          trademark.namaMerek,
          { topK: 10, dateRange }
        );

        if (similarityResult.similarTrademarks.length > 0) {
          report.similarityFindings.push({
            targetTrademark: trademark,
            similarTrademarks: similarityResult.similarTrademarks,
            highestSimilarity: similarityResult.similarTrademarks[0]?.overallScore || 0
          });

          // Update summary
          const highestScore = similarityResult.similarTrademarks[0]?.overallScore || 0;
          if (highestScore >= 0.8) {
            report.summary.highSimilarity++;
          } else if (highestScore >= 0.7) {
            report.summary.mediumSimilarity++;
          } else {
            report.summary.lowSimilarity++;
          }
        }
      }

      console.log(`✅ Similarity report generated: ${report.similarityFindings.length} findings`);
      return report;
    } catch (error) {
      console.error('❌ Error generating similarity report:', error);
      throw error;
    }
  }
}

module.exports = new SimilarityService();