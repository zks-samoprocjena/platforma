"""Enhanced PDF extractor that preserves structure and processes in chunks."""
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import pdfplumber
import pymupdf
import json


class EnhancedPDFExtractor:
    """Extract text from PDFs while preserving structure and relationships."""
    
    def __init__(self, chunk_size: int = 20):
        self.chunk_size = chunk_size
        self.control_pattern = re.compile(r'^([A-Z]{3,4}-\d{3}):\s*(.+?)$', re.MULTILINE)
        self.table_markers = ["Ocjena", "Uvjet", "Dokumentacija", "Implementacija"]
        
    def extract_with_pymupdf(self, pdf_path: str) -> Dict[str, str]:
        """Extract text using PyMuPDF with page information."""
        doc = pymupdf.open(pdf_path)
        pages_text = {}
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text()
            pages_text[f"page_{page_num + 1}"] = text
            
        doc.close()
        return pages_text
    
    def extract_with_pdfplumber(self, pdf_path: str) -> Dict[str, any]:
        """Extract text and tables using pdfplumber."""
        extracted_data = {
            "text_by_page": {},
            "tables_by_page": {},
            "controls_found": {}
        }
        
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                page_id = f"page_{page_num + 1}"
                
                # Extract text
                text = page.extract_text()
                if text:
                    extracted_data["text_by_page"][page_id] = text
                
                # Extract tables
                tables = page.extract_tables()
                if tables:
                    extracted_data["tables_by_page"][page_id] = tables
                
                # Find controls on this page
                if text:
                    controls = self.control_pattern.findall(text)
                    if controls:
                        for code, desc in controls:
                            extracted_data["controls_found"][code] = {
                                "description": desc.strip(),
                                "page": page_num + 1
                            }
        
        return extracted_data
    
    def extract_prilog_b_structure(self, pdf_path: str) -> Dict:
        """Extract Prilog B with focus on control scores and tables."""
        print(f"Extracting Prilog B from: {pdf_path}")
        
        data = self.extract_with_pdfplumber(pdf_path)
        
        # Structure for storing results
        results = {
            "controls": {},
            "submeasure_thresholds": {},
            "tables_found": 0,
            "extraction_metadata": {
                "total_pages": len(data["text_by_page"]),
                "controls_found": len(data["controls_found"])
            }
        }
        
        # Process tables to find control scores
        for page_id, tables in data["tables_by_page"].items():
            page_num = int(page_id.split("_")[1])
            
            for table in tables:
                if self._is_control_score_table(table):
                    control_scores = self._parse_control_score_table(table, page_num)
                    results["controls"].update(control_scores)
                    results["tables_found"] += 1
                elif self._is_submeasure_threshold_table(table):
                    thresholds = self._parse_submeasure_threshold_table(table)
                    results["submeasure_thresholds"].update(thresholds)
        
        return results
    
    def extract_prilog_c_structure(self, pdf_path: str) -> Dict:
        """Extract Prilog C with focus on maintaining control-table relationships."""
        print(f"Extracting Prilog C from: {pdf_path}")
        
        data = self.extract_with_pdfplumber(pdf_path)
        
        results = {
            "controls": {},
            "rating_tables": {},
            "general_criteria": None,
            "extraction_metadata": {
                "total_pages": len(data["text_by_page"]),
                "controls_found": len(data["controls_found"])
            }
        }
        
        # Process by page to maintain proximity relationships
        for page_id, page_text in data["text_by_page"].items():
            page_num = int(page_id.split("_")[1])
            
            # Find controls on this page
            page_controls = []
            for match in self.control_pattern.finditer(page_text):
                control_code = match.group(1)
                control_desc = match.group(2).strip()
                control_pos = match.start()
                
                page_controls.append({
                    "code": control_code,
                    "description": control_desc,
                    "position": control_pos,
                    "page": page_num
                })
                
                results["controls"][control_code] = {
                    "description": control_desc,
                    "page": page_num
                }
            
            # Find tables on this page
            if page_id in data["tables_by_page"]:
                tables = data["tables_by_page"][page_id]
                
                for table_idx, table in enumerate(tables):
                    if self._is_rating_table(table):
                        # Try to associate with nearest control
                        table_text = self._table_to_text(table)
                        table_pos = page_text.find(table_text) if table_text else -1
                        
                        nearest_control = self._find_nearest_control(
                            page_controls, table_pos, page_text
                        )
                        
                        if nearest_control:
                            if nearest_control["code"] not in results["rating_tables"]:
                                results["rating_tables"][nearest_control["code"]] = []
                            
                            results["rating_tables"][nearest_control["code"]].append({
                                "table": table,
                                "page": page_num,
                                "table_index": table_idx
                            })
                        elif not results["general_criteria"] and self._is_general_criteria_table(table):
                            results["general_criteria"] = self._parse_general_criteria_table(table)
        
        return results
    
    def _is_control_score_table(self, table: List[List[str]]) -> bool:
        """Check if table contains control scores."""
        if not table or len(table) < 2:
            return False
        
        # Check for score columns (osnovna, srednja, napredna)
        header = [str(cell).lower() if cell else "" for cell in table[0]]
        return any("osnovna" in h or "srednja" in h or "napredna" in h for h in header)
    
    def _is_submeasure_threshold_table(self, table: List[List[str]]) -> bool:
        """Check if table contains submeasure thresholds."""
        if not table or len(table) < 2:
            return False
        
        # Check for Pi and T columns
        header = [str(cell).lower() if cell else "" for cell in table[0]]
        return any("pi" in h for h in header) and any("t" in h for h in header)
    
    def _is_rating_table(self, table: List[List[str]]) -> bool:
        """Check if table is a rating criteria table."""
        if not table or len(table) < 2:
            return False
        
        # Check for rating table headers
        header = [str(cell).lower() if cell else "" for cell in table[0]]
        return any("ocjena" in h for h in header) or any("uvjet" in h for h in header)
    
    def _is_general_criteria_table(self, table: List[List[str]]) -> bool:
        """Check if this is the general criteria table."""
        if not table or len(table) < 5:
            return False
        
        # General criteria table should have 5 rows (scores 1-5)
        scores_found = 0
        for row in table[1:]:
            if row and str(row[0]).strip() in ["1", "2", "3", "4", "5"]:
                scores_found += 1
        
        return scores_found == 5
    
    def _parse_control_score_table(self, table: List[List[str]], page_num: int) -> Dict:
        """Parse control scores from table."""
        scores = {}
        
        if not table or len(table) < 2:
            return scores
        
        # Find column indices
        header = [str(cell).lower() if cell else "" for cell in table[0]]
        osnovna_idx = next((i for i, h in enumerate(header) if "osnovna" in h), -1)
        srednja_idx = next((i for i, h in enumerate(header) if "srednja" in h), -1)
        napredna_idx = next((i for i, h in enumerate(header) if "napredna" in h), -1)
        
        # Parse rows
        for row in table[1:]:
            if not row or len(row) < 2:
                continue
            
            # First cell might be control code
            first_cell = str(row[0]).strip()
            control_match = self.control_pattern.match(first_cell)
            
            if control_match:
                control_code = control_match.group(1)
                
                scores[control_code] = {
                    "osnovna": self._parse_score_value(row[osnovna_idx]) if osnovna_idx >= 0 and osnovna_idx < len(row) else None,
                    "srednja": self._parse_score_value(row[srednja_idx]) if srednja_idx >= 0 and srednja_idx < len(row) else None,
                    "napredna": self._parse_score_value(row[napredna_idx]) if napredna_idx >= 0 and napredna_idx < len(row) else None,
                    "page": page_num
                }
        
        return scores
    
    def _parse_score_value(self, value: str) -> Optional[float]:
        """Parse score value from string."""
        if not value:
            return None
        
        value = str(value).strip()
        if value == '-' or value == '':
            return None
        
        # Remove >= or > symbols
        value = value.replace('≥', '').replace('>', '').strip()
        
        try:
            return float(value)
        except ValueError:
            return None
    
    def _parse_submeasure_threshold_table(self, table: List[List[str]]) -> Dict:
        """Parse submeasure thresholds from table."""
        thresholds = {}
        
        # Implementation similar to existing parser
        # Would need the actual table structure to implement properly
        
        return thresholds
    
    def _parse_general_criteria_table(self, table: List[List[str]]) -> List[Dict]:
        """Parse general rating criteria."""
        criteria = []
        
        for row in table[1:]:  # Skip header
            if row and len(row) >= 2:
                score = str(row[0]).strip()
                if score in ["1", "2", "3", "4", "5"]:
                    if len(row) >= 3:
                        # Table has both documentation and implementation columns
                        criteria.append({
                            "score": int(score),
                            "documentation_criteria": str(row[1]).strip(),
                            "implementation_criteria": str(row[2]).strip()
                        })
                    else:
                        # Table has only one criteria column
                        criteria.append({
                            "score": int(score),
                            "criterion": str(row[1]).strip()
                        })
        
        return criteria
    
    def _table_to_text(self, table: List[List[str]]) -> str:
        """Convert table to searchable text."""
        lines = []
        for row in table:
            if row:
                lines.append(" | ".join(str(cell) if cell else "" for cell in row))
        return "\n".join(lines)
    
    def _find_nearest_control(self, controls: List[Dict], table_pos: int, page_text: str) -> Optional[Dict]:
        """Find the nearest control before a table."""
        if not controls or table_pos < 0:
            return None
        
        # Find control that appears before the table
        nearest = None
        min_distance = float('inf')
        
        for control in controls:
            if control["position"] < table_pos:
                distance = table_pos - control["position"]
                if distance < min_distance:
                    min_distance = distance
                    nearest = control
        
        return nearest
    
    def extract_in_chunks(self, pdf_path: str, output_dir: str, doc_type: str = "prilog_b"):
        """Extract PDF in chunks and save results."""
        output_dir = Path(output_dir)
        output_dir.mkdir(exist_ok=True)
        
        if doc_type == "prilog_b":
            results = self.extract_prilog_b_structure(pdf_path)
        else:
            results = self.extract_prilog_c_structure(pdf_path)
        
        # Save results
        output_file = output_dir / f"{doc_type}_enhanced_extraction.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        
        print(f"Extraction complete. Results saved to: {output_file}")
        print(f"Total controls found: {len(results['controls'])}")
        
        return results


if __name__ == "__main__":
    extractor = EnhancedPDFExtractor()
    
    # Test with Prilog B
    prilog_b_path = "/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/službena_dokumentacija/Prilog B - Okvir za evaluaciju.pdf"
    if Path(prilog_b_path).exists():
        print("Extracting Prilog B...")
        results_b = extractor.extract_in_chunks(
            prilog_b_path,
            "/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/enhanced_extraction",
            "prilog_b"
        )