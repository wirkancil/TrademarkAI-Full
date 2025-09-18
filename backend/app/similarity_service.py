import Levenshtein
import jellyfish
from typing import List, Dict, Any
from loguru import logger
from .models import SimilarityResult, SimilarityResponse

class SimilarityService:
    def __init__(self):
        self.phonetic_algorithms = ["metaphone", "soundex", "nysiis"]
    
    def calculate_text_similarity(self, text1: str, text2: str) -> Dict[str, float]:
        """Calculate various text similarity metrics"""
        text1 = text1.lower().strip()
        text2 = text2.lower().strip()
        
        if not text1 or not text2:
            return {"levenshtein": 0.0, "jaro_winkler": 0.0, "substring": 0.0}
        
        # Levenshtein distance (normalized)
        max_len = max(len(text1), len(text2))
        levenshtein_dist = Levenshtein.distance(text1, text2)
        levenshtein_sim = 1 - (levenshtein_dist / max_len) if max_len > 0 else 0.0
        
        # Jaro-Winkler similarity
        jaro_winkler_sim = jellyfish.jaro_winkler_similarity(text1, text2)
        
        # Substring similarity
        substring_sim = self._calculate_substring_similarity(text1, text2)
        
        return {
            "levenshtein": round(levenshtein_sim * 100, 1),
            "jaro_winkler": round(jaro_winkler_sim * 100, 1),
            "substring": round(substring_sim * 100, 1)
        }
    
    def _calculate_substring_similarity(self, text1: str, text2: str) -> float:
        """Calculate substring similarity"""
        if not text1 or not text2:
            return 0.0
        
        if text1 in text2 or text2 in text1:
            return 1.0
        
        # Calculate longest common substring
        len1, len2 = len(text1), len(text2)
        dp = [[0] * (len2 + 1) for _ in range(len1 + 1)]
        max_length = 0
        
        for i in range(1, len1 + 1):
            for j in range(1, len2 + 1):
                if text1[i-1] == text2[j-1]:
                    dp[i][j] = dp[i-1][j-1] + 1
                    max_length = max(max_length, dp[i][j])
        
        return max_length / max(len1, len2)
    
    def calculate_phonetic_similarity(self, text1: str, text2: str) -> float:
        """Calculate phonetic similarity using multiple algorithms"""
        text1 = text1.lower().strip()
        text2 = text2.lower().strip()
        
        if not text1 or not text2:
            return 0.0
        
        phonetic_scores = []
        
        # Metaphone
        metaphone1 = jellyfish.metaphone(text1)
        metaphone2 = jellyfish.metaphone(text2)
        metaphone_sim = 1.0 if metaphone1 == metaphone2 else 0.0
        phonetic_scores.append(metaphone_sim)
        
        # Soundex
        soundex1 = jellyfish.soundex(text1)
        soundex2 = jellyfish.soundex(text2)
        soundex_sim = 1.0 if soundex1 == soundex2 else 0.0
        phonetic_scores.append(soundex_sim)
        
        # NYSIIS
        nysiis1 = jellyfish.nysiis(text1)
        nysiis2 = jellyfish.nysiis(text2)
        nysiis_sim = 1.0 if nysiis1 == nysiis2 else 0.0
        phonetic_scores.append(nysiis_sim)
        
        # Average phonetic similarity
        return round(sum(phonetic_scores) / len(phonetic_scores) * 100, 1)
    
    def calculate_overall_similarity(self, target_trademark: str, 
                                   candidate_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate overall similarity between target and candidate"""
        candidate_name = candidate_metadata.get("namaMerek", "")
        
        # Text similarity
        text_similarity = self.calculate_text_similarity(
            target_trademark, 
            candidate_name
        )
        
        # Phonetic similarity
        phonetic_similarity = self.calculate_phonetic_similarity(
            target_trademark, 
            candidate_name
        )
        
        # Overall score (weighted average)
        text_weight = 0.7
        phonetic_weight = 0.3
        
        overall_score = (
            text_similarity["jaro_winkler"] * text_weight +
            phonetic_similarity * phonetic_weight
        )
        
        return {
            "trademark_name": candidate_name,
            "application_number": candidate_metadata.get("nomorPermohonan", ""),
            "owner_name": candidate_metadata.get("namaPemohon", ""),
            "classification": candidate_metadata.get("kelasBarangJasa", ""),
            "description": candidate_metadata.get("uraianBarangJasa", ""),
            "status": candidate_metadata.get("status", "Active"),
            "overall_similarity": overall_score / 100.0,  # Convert to decimal (0.0-1.0)
            "text_similarity": text_similarity['jaro_winkler'] / 100.0,  # Convert to decimal
            "semantic_similarity": text_similarity['jaro_winkler'] / 100.0,  # Same as text for now
            "phonetic_similarity": phonetic_similarity / 100.0,  # Convert to decimal
            "confidence_score": overall_score / 100.0  # Convert to decimal
        }
    
    def process_search_results(self, target_trademark: str, 
                             pinecone_results: List[Dict[str, Any]],
                             threshold: float = 0.15) -> SimilarityResponse:
        """Process Pinecone results and calculate detailed similarities"""
        
        filtered_results = []
        for result in pinecone_results:
            # Use more lenient filtering - allow lower scores if we have few results
            result_score = result.get("score", 0)
            if result_score >= threshold or (len(pinecone_results) < 3 and result_score >= threshold * 0.5):
                try:
                    similarity_data = self.calculate_overall_similarity(
                        target_trademark, 
                        result["metadata"]
                    )
                    filtered_results.append(similarity_data)
                except Exception as e:
                    logger.warning(f"Error calculating similarity for result: {e}")
                    continue
        
        # Sort by overall score descending
        filtered_results.sort(
            key=lambda x: x["overall_similarity"], 
            reverse=True
        )
        
        return SimilarityResponse(
            targetTrademark=target_trademark,
            totalCompared=len(pinecone_results),
            similarTrademarksFound=len(filtered_results),
            results=[SimilarityResult(**result) for result in filtered_results]
        )