#!/usr/bin/env python3
"""
Precise PDF parser for Prilog B - Okvir za evaluaciju.pdf
Extracts minimum scores from the 99 score tables (tbl 1 - tbl 99).
"""
import re
import pdfplumber
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PrilogBTableExtractor:
    """Extract minimum scores from the 99 score tables in Prilog B PDF."""
    
    def __init__(self, pdf_path: str):
        self.pdf_path = Path(pdf_path)
        self.control_scores = {}
        self.tables_found = 0
        
        # Pattern to match table numbers: 'tbl 1' through 'tbl 99'
        self.table_pattern = re.compile(r'tbl\s+(\d+)', re.IGNORECASE)
        
        # Pattern to match submeasure numbers: 1.1, 7.1, etc.
        self.submeasure_pattern = re.compile(r'(\d+\.\d+)')
        
        # Pattern to match control codes: XXX-NNN or XXXX-NNN
        self.control_pattern = re.compile(r'([A-Z]{3,4}-\d{3})')
        
        # Pattern to match scores: ≥3, ≥2.5, -, etc.
        self.score_pattern = re.compile(r'([≥>]?\d+(?:\.\d+)?|-)')
    
    def extract_all_tables(self) -> Dict:
        """Extract all 99 score tables from the PDF."""
        logger.info(f"Starting extraction from {self.pdf_path}")
        
        results = {
            "control_scores": {},
            "tables_extracted": [],
            "submeasures_found": {},
            "metadata": {
                "total_tables_found": 0,
                "total_controls_found": 0,
                "extraction_errors": []
            }
        }
        
        with pdfplumber.open(self.pdf_path) as pdf:
            current_submeasure = None
            
            for page_num, page in enumerate(pdf.pages):
                logger.info(f"Processing page {page_num + 1}/{len(pdf.pages)}")
                
                # Extract text from page
                page_text = page.extract_text()
                if not page_text:
                    continue
                
                # Look for submeasure numbers
                submeasure_matches = self.submeasure_pattern.findall(page_text)
                if submeasure_matches:
                    # Take the first submeasure found on page
                    current_submeasure = submeasure_matches[0]
                    logger.debug(f"Found submeasure {current_submeasure} on page {page_num + 1}")
                
                # Look for table numbers
                table_matches = self.table_pattern.findall(page_text)
                if table_matches:
                    for table_num in table_matches:
                        logger.debug(f"Found table {table_num} on page {page_num + 1}")
                        
                        # Extract table from this page
                        table_data = self._extract_table_from_page(page, table_num, current_submeasure)
                        if table_data:
                            results["tables_extracted"].append({
                                "table_number": int(table_num),
                                "submeasure": current_submeasure,
                                "page": page_num + 1,
                                "controls": table_data
                            })
                            
                            # Add to control scores
                            for control_code, scores in table_data.items():
                                if control_code not in results["control_scores"]:
                                    results["control_scores"][control_code] = {}
                                
                                if current_submeasure not in results["control_scores"][control_code]:
                                    results["control_scores"][control_code][current_submeasure] = {}
                                
                                results["control_scores"][control_code][current_submeasure] = {
                                    "osnovna": scores.get("osnovna"),
                                    "srednja": scores.get("srednja"),
                                    "napredna": scores.get("napredna"),
                                    "table": int(table_num),
                                    "page": page_num + 1
                                }
                            
                            self.tables_found += 1
        
        # Calculate maximum scores per control
        control_max_scores = self._calculate_max_scores(results["control_scores"])
        results["control_max_scores"] = control_max_scores
        
        # Update metadata
        results["metadata"]["total_tables_found"] = self.tables_found
        results["metadata"]["total_controls_found"] = len(results["control_scores"])
        
        logger.info(f"Extraction complete: {self.tables_found} tables found, {len(results['control_scores'])} controls processed")
        
        return results
    
    def _extract_table_from_page(self, page, table_num: str, submeasure: str) -> Optional[Dict]:
        """Extract score table data from a single page."""
        try:
            # Extract tables from page
            tables = page.extract_tables()
            
            for table in tables:
                if not table or len(table) < 2:
                    continue
                
                # Check if this is a score table by looking for table number in first cell
                first_row = table[0]
                if not first_row or len(first_row) < 4:
                    continue
                
                # Check if first cell contains table number
                first_cell = str(first_row[0]).lower() if first_row[0] else ""
                if f"tbl {table_num}" not in first_cell and f"tbl{table_num}" not in first_cell:
                    continue
                
                logger.debug(f"Processing score table {table_num} in submeasure {submeasure}")
                
                # Extract scores from table
                return self._parse_score_table(table, table_num, submeasure)
            
            return None
            
        except Exception as e:
            logger.error(f"Error extracting table {table_num}: {e}")
            return None
    
    def _parse_score_table(self, table: List[List], table_num: str, submeasure: str) -> Dict:
        """Parse a score table to extract control codes and minimum scores."""
        control_scores = {}
        
        # Skip header row (contains table number and column headers)
        data_rows = table[1:]
        
        for row in data_rows:
            if not row or len(row) < 4:
                continue
            
            # First column should contain control code
            control_cell = str(row[0]).strip() if row[0] else ""
            control_match = self.control_pattern.search(control_cell)
            
            if not control_match:
                continue
            
            control_code = control_match.group(1)
            
            # Extract scores from correct columns based on table structure
            # Column 0: Control code, Column 3: OSNOVNA, Column 6: SREDNJA, Column 9: NAPREDNA
            scores = {
                "osnovna": self._parse_score_value(row[3] if len(row) > 3 else None),
                "srednja": self._parse_score_value(row[6] if len(row) > 6 else None),
                "napredna": self._parse_score_value(row[9] if len(row) > 9 else None)
            }
            
            control_scores[control_code] = scores
            logger.debug(f"Extracted {control_code}: {scores}")
        
        return control_scores
    
    def _parse_score_value(self, value) -> Optional[float]:
        """Parse a score value, handling ≥ symbols and dashes."""
        if not value:
            return None
        
        value_str = str(value).strip()
        
        # Handle dash (not applicable)
        if value_str == '-' or value_str == '':
            return None
        
        # Remove ≥ or > symbols
        value_str = value_str.replace('≥', '').replace('>', '').strip()
        
        try:
            return float(value_str)
        except ValueError:
            logger.warning(f"Could not parse score value: {value}")
            return None
    
    def _calculate_max_scores(self, control_scores: Dict) -> Dict:
        """Calculate maximum minimum score for each control across all submeasures."""
        control_max_scores = {}
        
        for control_code, submeasures in control_scores.items():
            max_scores = {"osnovna": None, "srednja": None, "napredna": None}
            
            for submeasure, scores in submeasures.items():
                for level in ["osnovna", "srednja", "napredna"]:
                    score = scores.get(level)
                    if score is not None:
                        current_max = max_scores[level]
                        if current_max is None or score > current_max:
                            max_scores[level] = score
            
            control_max_scores[control_code] = max_scores
        
        return control_max_scores

def main():
    """Main extraction function."""
    pdf_path = "/mnt/shared/_Projects/ai/specijalisticki_rad/specification/original-documents/Prilog B - Okvir za evaluaciju.pdf"
    
    if not Path(pdf_path).exists():
        logger.error(f"PDF file not found: {pdf_path}")
        return
    
    extractor = PrilogBTableExtractor(pdf_path)
    results = extractor.extract_all_tables()
    
    # Save results
    output_file = "/mnt/shared/_Projects/ai/specijalisticki_rad/specification/extracted-data/prilog_b_tables_extracted.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    logger.info(f"Results saved to {output_file}")
    
    # Print summary
    print(f"\n=== EXTRACTION SUMMARY ===")
    print(f"Tables found: {results['metadata']['total_tables_found']}")
    print(f"Controls found: {results['metadata']['total_controls_found']}")
    print(f"Output file: {output_file}")
    
    # Show some examples
    print(f"\n=== EXAMPLES ===")
    for i, (control_code, max_scores) in enumerate(list(results['control_max_scores'].items())[:5]):
        print(f"{control_code}: osnovna={max_scores['osnovna']}, srednja={max_scores['srednja']}, napredna={max_scores['napredna']}")

if __name__ == "__main__":
    main()