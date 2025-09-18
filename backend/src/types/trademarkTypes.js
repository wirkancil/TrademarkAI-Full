/**
 * Trademark Data Types and Schemas
 * Struktur data merek sesuai format DJKI Indonesia
 */

/**
 * Interface untuk data merek terstruktur
 */
class TrademarkData {
  constructor(data = {}) {
    this.nomorPermohonan = data.nomorPermohonan || '';
    this.tanggalPenerimaan = data.tanggalPenerimaan || '';
    this.prioritas = data.prioritas || '';
    this.namaPemohon = data.namaPemohon || '';
    this.alamatPemohon = data.alamatPemohon || '';
    this.namaKuasa = data.namaKuasa || '';
    this.alamatKuasa = data.alamatKuasa || '';
    this.tipeMerek = data.tipeMerek || '';
    this.namaReferensiLabelMerek = data.namaReferensiLabelMerek || '';
    this.artiBahasa = data.artiBahasa || '';
    this.uraianWarna = data.uraianWarna || '';
    this.kelasBarangJasa = data.kelasBarangJasa || '';
    this.uraianBarangJasa = data.uraianBarangJasa || '';
    this.statusPermohonan = data.statusPermohonan || '';
    this.tanggalPublikasi = data.tanggalPublikasi || '';
    this.nomorSertifikat = data.nomorSertifikat || '';
    this.tanggalSertifikat = data.tanggalSertifikat || '';
    this.masaBerlaku = data.masaBerlaku || '';
  }

  /**
   * Validasi data merek
   */
  validate() {
    const errors = [];
    
    if (!this.nomorPermohonan) {
      errors.push('Nomor permohonan wajib diisi');
    }
    
    if (!this.namaReferensiLabelMerek) {
      errors.push('Nama merek wajib diisi');
    }
    
    if (!this.kelasBarangJasa) {
      errors.push('Kelas barang/jasa wajib diisi');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert ke format untuk pencarian
   */
  toSearchableText() {
    return [
      this.namaReferensiLabelMerek,
      this.namaPemohon,
      this.uraianBarangJasa,
      this.kelasBarangJasa,
      this.nomorPermohonan
    ].filter(Boolean).join(' ');
  }

  /**
   * Convert ke format JSON dengan alias field untuk kompatibilitas frontend
   */
  toJSON() {
    return {
      nomorPermohonan: this.nomorPermohonan,
      tanggalPenerimaan: this.tanggalPenerimaan,
      prioritas: this.prioritas,
      namaPemohon: this.namaPemohon,
      alamatPemohon: this.alamatPemohon,
      namaKuasa: this.namaKuasa,
      alamatKuasa: this.alamatKuasa,
      tipeMerek: this.tipeMerek,
      namaReferensiLabelMerek: this.namaReferensiLabelMerek,
      // Alias untuk kompatibilitas frontend
      namaMerek: this.namaReferensiLabelMerek,
      artiBahasa: this.artiBahasa,
      uraianWarna: this.uraianWarna,
      kelasBarangJasa: this.kelasBarangJasa,
      uraianBarangJasa: this.uraianBarangJasa,
      statusPermohonan: this.statusPermohonan,
      tanggalPublikasi: this.tanggalPublikasi,
      nomorSertifikat: this.nomorSertifikat,
      tanggalSertifikat: this.tanggalSertifikat,
      masaBerlaku: this.masaBerlaku
    };
  }
}

/**
 * Schema untuk hasil pencarian merek terstruktur
 */
class TrademarkSearchResult {
  constructor(data = {}) {
    this.id = data.id || '';
    this.score = data.score || 0;
    this.trademarkData = new TrademarkData(data.trademarkData || {});
    this.sourceDocument = data.sourceDocument || '';
    this.chunkId = data.chunkId || '';
    this.confidence = data.confidence || 0;
    this.matchedFields = data.matchedFields || [];
    this.extractedText = data.extractedText || '';
  }

  /**
   * Format untuk display di frontend dengan struktur lengkap
   */
  toDisplayFormat() {
    return {
      id: this.id,
      score: this.score,
      confidence: this.confidence,
      trademark: {
        nomorPermohonan: this.trademarkData.nomorPermohonan,
        tanggalPenerimaan: this.trademarkData.tanggalPenerimaan,
        namaPemohon: this.trademarkData.namaPemohon,
        alamatPemohon: this.trademarkData.alamatPemohon,
        namaReferensiLabelMerek: this.trademarkData.namaReferensiLabelMerek,
        // Alias untuk kompatibilitas frontend
        namaMerek: this.trademarkData.namaReferensiLabelMerek,
        tipeMerek: this.trademarkData.tipeMerek,
        kelasBarangJasa: this.trademarkData.kelasBarangJasa,
        uraianBarangJasa: this.trademarkData.uraianBarangJasa,
        prioritas: this.trademarkData.prioritas,
        artiBahasa: this.trademarkData.artiBahasa,
        uraianWarna: this.trademarkData.uraianWarna,
        namaKuasa: this.trademarkData.namaKuasa,
        alamatKuasa: this.trademarkData.alamatKuasa,
        statusPermohonan: this.trademarkData.statusPermohonan,
        tanggalPublikasi: this.trademarkData.tanggalPublikasi,
        nomorSertifikat: this.trademarkData.nomorSertifikat,
        tanggalSertifikat: this.trademarkData.tanggalSertifikat,
        masaBerlaku: this.trademarkData.masaBerlaku
      },
      source: {
        document: this.sourceDocument,
        chunkId: this.chunkId,
        matchedFields: this.matchedFields
      },
      // Format terstruktur untuk display yang mudah dibaca
      displayData: {
        'Nomor Permohonan': this.trademarkData.nomorPermohonan || '-',
        'Tanggal Penerimaan': this.trademarkData.tanggalPenerimaan || '-',
        'Nama Pemohon': this.trademarkData.namaPemohon || '-',
        'Alamat Pemohon': this.trademarkData.alamatPemohon || '-',
        'Nama Referensi Label Merek': this.trademarkData.namaReferensiLabelMerek || '-',
        'Nama Merek': this.trademarkData.namaReferensiLabelMerek || '-',
        'Tipe Merek': this.trademarkData.tipeMerek || '-',
        'Kelas Barang/Jasa': this.trademarkData.kelasBarangJasa || '-',
        'Uraian Barang/Jasa': this.trademarkData.uraianBarangJasa || '-'
      }
    };
  }
}

/**
 * Pattern untuk ekstraksi data merek dari teks
 */
const TRADEMARK_PATTERNS = {
  // Enhanced patterns for DJKI trademark documents based on actual format
  nomorPermohonan: [
    /JID\s+(\d{10,})/i,
    /210\s+220\s+320\s+\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4}[^J]*JID\s+(\d{10,})/i,
    /Nomor\s*Permohonan[^:]*:?\s*([\d\s\/]+)/i,
    /Application\s*Number[^:]*:?\s*([\d\s]+)/i
  ],
  tanggalPenerimaan: [
    /210\s+220\s+320\s+(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})\s+(\d{1,2})\s*:\s*(\d{2})\s*:\s*(\d{2})/i,
    /Tanggal\s*Penerimaan[^:]*:?\s*(\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*\d{4})/i,
    /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/i
  ],
  namaPemohon: [
    /Nama\s*Pemohon\s*:?\s*([^\n\r]+?)(?=\s*(?:Jl\.|Jalan|Gang|Alamat|Nama\s*Kuasa|730|$))/i,
    /730\s*Alamat\s*Pemohon\s*Nama\s*Pemohon\s*:?\s*([^\n\r]+?)(?=\s*(?:Jl\.|Jalan|Gang|$))/i,
    /Applicant[^:]*:?\s*([^\n\r]+?)(?=\s*(?:Address|Alamat|$))/i,
     /Pemohon\s*:?\s*([^\n\r]+?)(?=\s*(?:Alamat|Address|$))/i
   ],
  namaReferensiLabelMerek: [
    /Nama\s*Referensi\s*Label\s*Merek\s*:?\s*([^\n\r]+?)(?=\s*(?:Tipe\s*Merek|566|$))/i,
    /Label\s*Merek\s*:?\s*([^\n\r]+?)(?=\s*(?:Tipe|566|$))/i,
    /Mark\s*Name[^:]*:?\s*([^\n\r]+?)(?=\s*(?:Type|Class|Tipe|$))/i,
     /([A-Z][A-Z0-9\s&.-]{2,})(?=\s*(?:Tipe\s*Merek|Type|Class|566|$))/i,
     /^\s*([A-Z][A-Z0-9\s&.-]{2,})\s*$/im
   ],
  kelasBarangJasa: [
    /511\s*Kelas\s*Barang\/Jasa\s*:?\s*(\d{1,2})/i,
    /Kelas\s*Barang\/Jasa\s*:?\s*(\d{1,2})/i,
    /591[^5]*511\s*Kelas\s*Barang\/Jasa\s*:?\s*(\d{1,2})/i,
    /Class[^:]*:?\s*(\d{1,2})/i,
     /Kelas\s*:?\s*(\d{1,2})/i,
     /\b(\d{1,2})\b(?=\s*(?:Uraian|Description))/i
   ],
  uraianBarangJasa: [
    /510\s*Uraian\s*Barang\/Jasa\s*:?\s*([^\n\r]+?)(?=\s*(?:Nomor|Halaman|\d{3}|$))/i,
    /Uraian\s*Barang[^:]*:?\s*([^\n\r]+?)(?=\s*(?:Nomor|$))/i,
    /Goods\s*Services[^:]*:?\s*([^\n]+?)(?=\n|$)/i
  ],
  tipeMerek: [
    /Tipe\s*Merek\s*:?\s*([^\n\r]+?)(?=\s*(?:566|Arti|$))/i,
    /Type[^:]*:?\s*([^\n]+?)(?=\n|$)/i,
    /Mark\s*Type[^:]*:?\s*([^\n]+?)/i
  ],
  uraianWarna: [
    /591\s*Uraian\s*Warna\s*:?\s*([^\n\r]+?)(?=\s*(?:511|\d{3}|$))/i,
    /Uraian\s*Warna[^:]*:?\s*([^\n\r]+?)(?=\s*(?:511|$))/i,
    /Color[^:]*:?\s*([^\n]+?)(?=\n|$)/i
  ],
  artiBahasa: [
    /566\s*Arti\s*Bahasa\s*:?\s*([^\n\r]+?)(?=\s*(?:591|\d{3}|$))/i,
    /Arti\s*Bahasa[^:]*:?\s*([^\n\r]+?)(?=\s*(?:591|$))/i,
    /Meaning[^:]*:?\s*([^\n]+?)(?=\n|$)/i
  ],
  alamatPemohon: [
    /(?:Jl\.|Jalan|Gang)\s*([^\n\r]+?)(?=\s*(?:Kabupaten|Provinsi|Nama\s*Kuasa|740|$))/i,
    /730[^:]*([^N]+?)(?=\s*Nama\s*Kuasa|$)/i,
    /Address[^:]*:?\s*([^\n]+?)(?=\n|$)/i
  ],
  namaKuasa: [
    /Nama\s*Kuasa\s*Alamat\s*Kuasa\s*:?\s*([^\n\r]+?)(?=\s*(?:Jl\.|Jalan|$))/i,
    /740\s*Nama\s*Kuasa[^:]*:?\s*([^\n\r]+?)(?=\s*(?:Jl\.|$))/i,
    /Agent[^:]*:?\s*([^\n]+?)(?=\n|$)/i
  ],
  alamatKuasa: [
    /Alamat\s*Kuasa[^:]*:?\s*([^\n\r]+?)(?=\s*(?:Nama\s*Referensi|$))/i,
    /Agent\s*Address[^:]*:?\s*([^\n]+?)(?=\n|$)/i
  ]
};

/**
 * Kelas Nice untuk klasifikasi merek
 */
const NICE_CLASSES = {
  1: 'Bahan kimia untuk industri, ilmu pengetahuan dan fotografi',
  2: 'Cat, pernis, lak',
  3: 'Sediaan untuk membersihkan dan mengkilapkan, sabun, kosmetik',
  4: 'Minyak dan lemak industri, lilin, bahan bakar',
  5: 'Sediaan farmasi dan veteriner, sediaan sanitasi',
  // ... tambahkan kelas lainnya sesuai kebutuhan
};

module.exports = {
  TrademarkData,
  TrademarkSearchResult,
  TRADEMARK_PATTERNS,
  NICE_CLASSES
};