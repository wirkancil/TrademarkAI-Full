import re
import pdfplumber
from typing import Dict, List, Optional
from pathlib import Path
from loguru import logger
from .models import TrademarkMetadata, IndividualTrademark

class PDFProcessor:
    def __init__(self):
        self.metadata_patterns = {
            'namaMerek': r'Nama Merek\s*:\s*(.+)',
            'nomorPermohonan': r'Nomor Permohonan\s*:\s*(.+)',
            'kelasBarangJasa': r'Kelas\s*:\s*(.+)',
            'namaPemohon': r'Pemohon\s*:\s*(.+)',
            'uraianBarangJasa': r'Uraian Barang/Jasa\s*:\s*(.+)'
        }
        
        # Pattern untuk format tabel DJKI
        self.djki_table_pattern = re.compile(
            r'^\s*(\d+)\s+([A-Z0-9]+)\s+(\d{2}/\d{2}/\d{4})\s+(\d+)\s+(.+?)(?=\n\s*\d+\s+[A-Z0-9]+|$)',
            re.MULTILINE | re.DOTALL
        )
        
        # Pattern untuk header DJKI
        self.djki_header_patterns = [
            r'DIREKTORAT JENDERAL KEKAYAAN INTELEKTUAL',
            r'DIREKTORAT MEREK DAN INDUKSI',
            r'DAFTAR.*PERMOHONAN.*MEREK',
            r'PENERIMAAN.*PUBLIKASI'
        ]
    
    def extract_text(self, file_path: Path) -> str:
        """Extract text from PDF using pdfplumber"""
        try:
            with pdfplumber.open(file_path) as pdf:
                text = ""
                for page in pdf.pages:
                    text += page.extract_text() or ""
                
                if not text.strip():
                    raise ValueError("No text could be extracted from PDF")
                
                logger.info(f"Successfully extracted {len(text)} characters from PDF")
                return text
                
        except Exception as e:
            logger.error(f"Error extracting text from PDF: {str(e)}")
            raise
    
    def parse_metadata(self, text: str) -> TrademarkMetadata:
        """Parse trademark metadata from extracted text dengan multiple strategi"""
        
        # 1. Cek apakah ini format DJKI
        if self._is_djki_format(text):
            logger.info("Detected DJKI format PDF")
            djki_data = self._parse_djki_format_complete(text)
            if djki_data:
                return djki_data
        
        # 2. Coba parsing format label (Nama Merek: XXX)
        label_data = self._parse_label_format(text)
        if label_data:
            logger.info("Detected label format PDF")
            return label_data
        
        # 3. Fallback: parsing manual dari tabel
        table_data = self._parse_table_format(text)
        if table_data:
            logger.info("Detected table format PDF")
            return table_data
        
        # 4. Ultimate fallback: buat metadata minimal
        logger.warning("Could not detect any known format, creating minimal metadata")
        return self._create_minimal_metadata(text)
    
    def _is_djki_format(self, text: str) -> bool:
        """Cek apakah ini format DJKI berdasar header dan struktur"""
        # Cek header DJKI
        for pattern in self.djki_header_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        
        # Cek apakah ada data tabel DJKI
        matches = self.djki_table_pattern.findall(text)
        return len(matches) > 0
    
    def _parse_djki_format_complete(self, text: str) -> Optional[TrademarkMetadata]:
        """Parse format DJKI dengan detail lengkap"""
        logger.info("Parsing DJKI format...")
        
        # Cari semua entri dalam format tabel
        matches = self.djki_table_pattern.findall(text)
        
        if not matches:
            logger.warning("No DJKI table data found")
            return None
        
        logger.info(f"Found {len(matches)} trademark entries in DJKI format")
        
        # Cari entri dengan kata "pinus" atau merek yang mengandung kata penting
        target_entries = []
        for match in matches:
            no_urut, nomor_permohonan, tanggal, kelas, nama_merek = match
            
            # Bersihkan nama merek
            nama_merek = nama_merek.strip()
            
            # Simpan semua entri untuk analisis
            target_entries.append({
                'no': no_urut,
                'nomorPermohonan': nomor_permohonan,
                'tanggal': tanggal,
                'kelasBarangJasa': kelas,
                'namaMerek': nama_merek
            })
            
            logger.debug(f"Entry: {no_urut} | {nomor_permohonan} | {tanggal} | {kelas} | {nama_merek}")
        
        # Cari entri yang mengandung kata kunci
        keyword_matches = [entry for entry in target_entries if 'pinus' in entry['namaMerek'].lower()]
        
        if keyword_matches:
            selected_entry = keyword_matches[0]
            logger.info(f"Selected keyword match: {selected_entry['namaMerek']}")
        else:
            # Ambil entri pertama sebagai fallback
            selected_entry = target_entries[0]
            logger.info(f"Selected first entry as fallback: {selected_entry['namaMerek']}")
        
        # Generate document ID
        import uuid
        doc_id = f"djki-{selected_entry['nomorPermohonan'].lower()}"
        
        # Buat deskripsi berdasarkan kelas
        kelas_desc = self._get_class_description(selected_entry['kelasBarangJasa'])
        
        return TrademarkMetadata(
            documentId=doc_id,
            namaMerek=selected_entry['namaMerek'],
            nomorPermohonan=selected_entry['nomorPermohonan'],
            kelasBarangJasa=selected_entry['kelasBarangJasa'],
            namaPemohon="DJKI",  # Default untuk data DJKI
            uraianBarangJasa=f"Kelas {selected_entry['kelasBarangJasa']}: {kelas_desc}. Total {len(target_entries)} merek dalam dokumen."
        )
    
    def _extract_all_djki_entries(self, text: str) -> List[Dict]:
        """Extract SEMUA entri DJKI sebagai list (tidak hanya satu)"""
        table_matches = self.djki_table_pattern.findall(text)
        
        if not table_matches:
            return []
        
        # Extract data pemohon dan uraian dari section detail
        detail_data = self._extract_detail_sections(text)
        
        all_entries = []
        for i, match in enumerate(table_matches):
            try:
                # Setiap match adalah tuple dengan groups dari regex
                no_urut = match[0].strip() if len(match) > 0 else str(i+1)
                nomor_permohonan = match[1].strip() if len(match) > 1 else ""
                tanggal = match[2].strip() if len(match) > 2 else ""
                kelas = match[3].strip() if len(match) > 3 else ""
                nama_merek = match[4].strip() if len(match) > 4 else ""
                
                # Bersihkan nama merek dari newlines dan multiple spaces
                nama_merek = re.sub(r'\s+', ' ', nama_merek).strip()
                
                if nama_merek:  # Hanya tambahkan jika ada nama merek
                    # Cari data detail untuk nomor permohonan ini
                    detail_info = detail_data.get(nomor_permohonan, {})
                    
                    # Buat uraian dari kelas barang/jasa
                    uraian_barang_jasa = f"Kelas {kelas}" if kelas else ""
                    
                    all_entries.append({
                        'no': no_urut,
                        'nomor': nomor_permohonan,
                        'tanggal': tanggal,
                        'kelas': kelas,
                        'nama_merek': nama_merek,
                        'pemohon': detail_info.get('pemohon', ''),
                        'uraian': uraian_barang_jasa
                    })
                    
            except Exception as e:
                logger.warning(f"Error parsing entry {i}: {str(e)}")
                continue
        
        logger.info(f"Extracted {len(all_entries)} DJKI entries from PDF")
        return all_entries
    
    def _extract_detail_sections(self, text: str) -> Dict[str, Dict[str, str]]:
        """Extract detail sections containing pemohon and uraian information"""
        details = {}
        lines = text.split('\n')

        current_nomor = None
        current_pemohon = None
        current_uraian = None

        for i, line in enumerate(lines):
            # Look for nomor permohonan pattern
            nomor_match = re.search(r'Nomor Permohonan\s*:\s*(\w+)', line)
            if nomor_match:
                current_nomor = nomor_match.group(1)

            # Look for pemohon pattern (730 Nama Pemohon :)
            if '730 Nama Pemohon :' in line:
                # Check if nama pemohon is on the same line after the colon
                pemohon_part = line.split('730 Nama Pemohon :', 1)[1].strip()
                if pemohon_part:
                    current_pemohon = pemohon_part
                else:
                    # Nama pemohon is on the next line (if it's not "Alamat Pemohon")
                    if i + 1 < len(lines):
                        next_line = lines[i + 1].strip()
                        if next_line and not next_line.startswith('Alamat Pemohon'):
                            current_pemohon = next_line

            # Look for uraian barang/jasa pattern (510 Uraian Barang/Jasa :)
            if '510 Uraian Barang/Jasa :' in line:
                # Uraian could be on the same line after the colon or on next lines
                uraian_part = line.split('510 Uraian Barang/Jasa :', 1)[1].strip()
                if uraian_part:
                    current_uraian = uraian_part
                else:
                    # Check next lines for uraian content (handle multi-line uraian with ===)
                    uraian_lines = []
                    for j in range(i + 1, min(i + 8, len(lines))):  # Check up to 7 next lines
                        next_line = lines[j].strip()
                        # Stop if we hit another section or empty line (but allow ===)
                        if not next_line or (re.match(r'^\d+\s', next_line) and '===' not in next_line) or ('Nomor Permohonan' in next_line and '===' not in next_line):
                            break
                        uraian_lines.append(next_line)

                    if uraian_lines:
                        current_uraian = ' '.join(uraian_lines)
                        # Remove === markers if present
                        if current_uraian.startswith('===') and current_uraian.endswith('==='):
                            current_uraian = current_uraian[3:-3].strip()

            # Save details when we have nomor and at least one of pemohon/uraian
            if current_nomor and (current_pemohon or current_uraian):
                if current_nomor not in details:
                    details[current_nomor] = {}

                if current_pemohon:
                    details[current_nomor]['pemohon'] = current_pemohon
                if current_uraian:
                    details[current_nomor]['uraian'] = current_uraian

                # Reset for next entry
                current_pemohon = None
                current_uraian = None

        logger.info(f"Found {len(details)} detail entries with pemohon/uraian data")
        return details
    
    def _parse_label_format(self, text: str) -> Optional[TrademarkMetadata]:
        """Parse format label (Nama Merek: XXX)"""
        metadata = {}
        
        for field, pattern in self.metadata_patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                metadata[field] = match.group(1).strip()
            else:
                metadata[field] = ""
        
        # Jika tidak ada data yang ditemukan, return None
        if not any(metadata.values()):
            return None
        
        # Generate document ID
        import uuid
        metadata['documentId'] = f"doc-{uuid.uuid4().hex[:8]}"
        
        return TrademarkMetadata(**metadata)
    
    def _parse_table_format(self, text: str) -> Optional[TrademarkMetadata]:
        """Parse format tabel umum (bukan DJKI)"""
        # Coba cari baris yang mengandung data tabel dengan pemisah tab atau spasi ganda
        lines = text.split('\n')
        
        for line in lines:
            # Cari baris yang terlihat seperti data tabel (banyak spasi/tab)
            if '  ' in line and len(line.split()) >= 3:
                parts = line.strip().split()
                if len(parts) >= 3:
                    # Asumsikan: [nomor] [kode] [nama_merek]
                    import uuid
                    doc_id = f"table-{uuid.uuid4().hex[:8]}"
                    
                    return TrademarkMetadata(
                        documentId=doc_id,
                        namaMerek=" ".join(parts[2:]),  # Ambil bagian nama
                        nomorPermohonan=parts[1] if len(parts) > 1 else "",
                        kelasBarangJasa="",
                        namaPemohon="",
                        uraianBarangJasa=f"Extracted from table format: {line.strip()}"
                    )
        
        return None
    
    def _create_minimal_metadata(self, text: str) -> TrademarkMetadata:
        """Buat metadata minimal untuk fallback terakhir"""
        import uuid
        
        # Coba ekstrak kata yang mungkin adalah nama merek (kata yang di-capitalize)
        words = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*', text)
        potential_trademark = " ".join(words[:3]) if words else "Unknown Trademark"
        
        doc_id = f"minimal-{uuid.uuid4().hex[:8]}"
        
        return TrademarkMetadata(
            documentId=doc_id,
            namaMerek=potential_trademark,
            nomorPermohonan="",
            kelasBarangJasa="",
            namaPemohon="",
            uraianBarangJasa=f"Minimal extraction from {len(text)} characters of text"
        )
    
    def _get_class_description(self, class_num: str) -> str:
        """Deskripsi singkat untuk kelas barang/jasa"""
        class_descriptions = {
            "1": "Bahan kimia untuk industri",
            "2": "Cat, pewarna, bahan penyamak",
            "3": "Kosmetik, sabun, minyak wangi",
            "4": "Oli, pelumas, bahan bakar",
            "5": "Obat-obatan, bahan medis"
        }
        return class_descriptions.get(class_num, f"Kelas {class_num}")
    
    def parse_trademarks_list(self, text: str) -> List[IndividualTrademark]:
        """Parse daftar merek individual dari teks PDF"""
        from datetime import datetime
        
        # Ekstrak detail sections dulu untuk mapping pemohon dan uraian
        details = self._extract_detail_sections(text)
        
        # Coba format DJKI dulu - ambil SEMUA entri
        all_entries = self._extract_all_djki_entries(text)
        if all_entries:
            # Convert semua entri ke IndividualTrademark
            trademarks = []
            for i, entry in enumerate(all_entries):
                # Generate unique ID untuk setiap merek - tambahkan index untuk menghindari duplicate
                trademark_id = f"djki-{entry['nomor'].lower()}-{entry['kelas']}-{i}"
                document_id = f"djki-{entry['nomor'].lower()}"  # Document ID untuk merek ini
                
                # Gunakan uraian detail dari mapping jika tersedia, fallback ke deskripsi kelas
                nomor_permohonan = entry['nomor']
                if nomor_permohonan in details and 'uraian' in details[nomor_permohonan]:
                    # Gunakan uraian detail yang sudah diekstrak
                    uraian = details[nomor_permohonan]['uraian']
                    # Remove === markers if present (start and/or end)
                    if uraian.startswith('==='):
                        uraian = uraian[3:].strip()
                    if uraian.endswith('==='):
                        uraian = uraian[:-3].strip()
                else:
                    # Fallback ke deskripsi kelas generik
                    kelas_desc = self._get_class_description(entry['kelas'])
                    uraian = f"Kelas {entry['kelas']}: {kelas_desc}"
                
                # Gunakan pemohon dari mapping jika tersedia
                nama_pemohon = entry['pemohon'] or "Tidak Diketahui"
                if nomor_permohonan in details and 'pemohon' in details[nomor_permohonan]:
                    nama_pemohon = details[nomor_permohonan]['pemohon']
                
                trademarks.append(IndividualTrademark(
                    trademarkId=trademark_id,
                    namaMerek=entry['nama_merek'],
                    nomorPermohonan=entry['nomor'],
                    kelasBarangJasa=entry['kelas'],
                    namaPemohon=nama_pemohon,
                    uraianBarangJasa=uraian,
                    documentId=document_id,
                    sourceDocument="pdf",
                    uploadDate=datetime.now()
                ))
            
            logger.info(f"Successfully parsed {len(trademarks)} individual trademarks")
            return trademarks
        
        # Coba format lainnya
        logger.warning("Format DJKI tidak ditemukan, coba format lainnya...")
        return []

    def debug_parse(self, text: str) -> Dict:
        """Debug parsing untuk melihat hasil"""
        result = {
            'extracted_text_length': len(text),
            'djki_format_detected': self._is_djki_format(text),
            'trademarks_list_count': 0,
            'sample_trademarks': [],
            'errors': []
        }
        
        try:
            # Coba extract semua entries dulu
            all_entries = self._extract_all_djki_entries(text)
            result['total_entries_found'] = len(all_entries)
            
            if all_entries:
                result['sample_raw_entries'] = all_entries[:3]  # Sample 3 entries
            
            # Coba parse sebagai daftar merek
            trademarks_list = self.parse_trademarks_list(text)
            result['trademarks_list_count'] = len(trademarks_list)
            
            # Ambil sample 5 merek pertama
            if trademarks_list:
                result['sample_trademarks'] = [
                    {
                        'trademarkId': tm.trademarkId,
                        'namaMerek': tm.namaMerek,
                        'nomorPermohonan': tm.nomorPermohonan,
                        'kelasBarangJasa': tm.kelasBarangJasa,
                        'namaPemohon': tm.namaPemohon
                    }
                    for tm in trademarks_list[:5]
                ]
            
            logger.info(f"Debug parse results: {result}")
            
        except Exception as e:
            result['errors'].append(f"Error parsing trademarks list: {str(e)}")
            logger.error(f"Debug parse error: {str(e)}")
        
        return result
    
    def extract_and_parse(self, file_path: Path) -> tuple[str, TrademarkMetadata]:
        """Extract text and parse metadata in one step"""
        text = self.extract_text(file_path)
        metadata = self.parse_metadata(text)
        
        logger.info(f"Extracted {len(text)} characters, parsed metadata: {metadata.namaMerek}")
        return text, metadata
    
    def extract_trademarks_list(self, pdf_path: Path) -> tuple[str, List[IndividualTrademark]]:
        """Extract text and return list of individual trademarks"""
        text = self.extract_text(pdf_path)
        trademarks = self.parse_trademarks_list(text)
        
        logger.info(f"Extracted {len(text)} characters from PDF")
        logger.info(f"Found {len(trademarks)} individual trademarks")
        
        return text, trademarks