"""Specialized parser for Prilog B and C PDFs."""
import re
import pdfplumber
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import json


class PrilogPDFParser:
    """Parse Prilog B and C PDFs to extract control data."""
    
    def __init__(self):
        # Pattern for control with scores on same line (e.g., "POL-001 - ≥4 ≥4")
        self.control_score_pattern = re.compile(
            r'([A-Z]{3,4}-\d{3})\s+([≥>]?\d+\.?\d*|-)\s+([≥>]?\d+\.?\d*|-)\s+([≥>]?\d+\.?\d*|-)'
        )
        
        # Pattern for control code and description
        self.control_desc_pattern = re.compile(
            r'^([A-Z]{3,4}-\d{3}):\s*(.+?)(?=\n[A-Z]{3,4}-\d{3}:|$)',
            re.MULTILINE | re.DOTALL
        )
        
        # Pattern for submeasure thresholds
        self.submeasure_pattern = re.compile(
            r'(\d+\.\d+)\s+[≥>]?\s*(\d+\.?\d*)\s+[≥>]?\s*(\d+\.?\d*)\s+[≥>]?\s*(\d+\.?\d*)\s+[≥>]?\s*(\d+\.?\d*)\s+[≥>]?\s*(\d+\.?\d*)\s+[≥>]?\s*(\d+\.?\d*)'
        )
        
    def parse_prilog_b(self, pdf_path: str) -> Dict:
        """Parse Prilog B PDF to extract control scores and thresholds."""
        results = {
            "controls": {},
            "submeasure_thresholds": {},
            "metadata": {
                "total_pages": 0,
                "controls_found": 0
            }
        }
        
        with pdfplumber.open(pdf_path) as pdf:
            results["metadata"]["total_pages"] = len(pdf.pages)
            
            # Process all pages
            for page_num, page in enumerate(pdf.pages):
                text = page.extract_text()
                if not text:
                    continue
                
                # Find control scores
                for match in self.control_score_pattern.finditer(text):
                    control_code = match.group(1)
                    osnovna_score = self._parse_score(match.group(2))
                    srednja_score = self._parse_score(match.group(3))
                    napredna_score = self._parse_score(match.group(4))
                    
                    results["controls"][control_code] = {
                        "osnovna": osnovna_score,
                        "srednja": srednja_score,
                        "napredna": napredna_score,
                        "page": page_num + 1
                    }
                
                # Find submeasure thresholds
                for match in self.submeasure_pattern.finditer(text):
                    submeasure = match.group(1)
                    results["submeasure_thresholds"][submeasure] = {
                        "osnovna": {
                            "individual": float(match.group(2)),
                            "average": float(match.group(3))
                        },
                        "srednja": {
                            "individual": float(match.group(4)),
                            "average": float(match.group(5))
                        },
                        "napredna": {
                            "individual": float(match.group(6)),
                            "average": float(match.group(7))
                        }
                    }
        
        results["metadata"]["controls_found"] = len(results["controls"])
        return results
    
    def parse_prilog_c(self, pdf_path: str) -> Dict:
        """Parse Prilog C PDF to extract control descriptions and rating tables."""
        results = {
            "controls": {},
            "rating_tables": {},
            "general_criteria": None,
            "metadata": {
                "total_pages": 0,
                "controls_found": 0
            }
        }
        
        with pdfplumber.open(pdf_path) as pdf:
            results["metadata"]["total_pages"] = len(pdf.pages)
            
            # First, collect all text to find controls
            full_text = ""
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    full_text += page_text + "\n"
            
            # Extract control descriptions
            for match in self.control_desc_pattern.finditer(full_text):
                control_code = match.group(1)
                description = match.group(2).strip()
                
                results["controls"][control_code] = {
                    "description": description[:200] + "..." if len(description) > 200 else description
                }
            
            # Process tables page by page
            for page_num, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                
                if tables:
                    for table in tables:
                        # Check if it's a rating criteria table
                        if self._is_rating_table(table):
                            # Check if it's the general criteria table
                            if self._is_general_criteria_table(table) and not results["general_criteria"]:
                                results["general_criteria"] = self._parse_rating_table(table)
                            else:
                                # Try to find associated control
                                page_text = page.extract_text()
                                if page_text:
                                    # Look for control codes on this page
                                    control_matches = re.findall(r'([A-Z]{3,4}-\d{3})', page_text)
                                    if control_matches:
                                        # Use the last control found before the table
                                        control_code = control_matches[-1]
                                        if control_code not in results["rating_tables"]:
                                            results["rating_tables"][control_code] = []
                                        results["rating_tables"][control_code].append({
                                            "page": page_num + 1,
                                            "criteria": self._parse_rating_table(table)
                                        })
        
        results["metadata"]["controls_found"] = len(results["controls"])
        return results
    
    def _parse_score(self, value: str) -> Optional[float]:
        """Parse score value, handling ≥ symbol and dashes."""
        if not value or value == '-':
            return None
        
        # Remove ≥ or > symbols
        value = value.replace('≥', '').replace('>', '').strip()
        
        try:
            return float(value)
        except ValueError:
            return None
    
    def _is_rating_table(self, table: List[List]) -> bool:
        """Check if table contains rating criteria."""
        if not table or len(table) < 2:
            return False
        
        # Check headers for rating-related keywords
        headers = [str(cell).lower() if cell else "" for cell in table[0]]
        rating_keywords = ["ocjena", "uvjet", "dokumentacija", "implementacija", "kriterij"]
        
        return any(keyword in header for keyword in rating_keywords for header in headers)
    
    def _is_general_criteria_table(self, table: List[List]) -> bool:
        """Check if this is the general 1-5 criteria table."""
        if not table or len(table) < 5:
            return False
        
        # Count score values 1-5
        scores_found = set()
        for row in table[1:]:
            if row and row[0]:
                try:
                    score = int(str(row[0]).strip())
                    if 1 <= score <= 5:
                        scores_found.add(score)
                except:
                    pass
        
        return len(scores_found) == 5
    
    def _parse_rating_table(self, table: List[List]) -> List[Dict]:
        """Parse rating criteria from table."""
        criteria = []
        
        if not table or len(table) < 2:
            return criteria
        
        # Determine table structure
        headers = [str(h).lower() if h else "" for h in table[0]]
        has_doc_impl = any("dokumentacija" in h for h in headers) and any("implementacija" in h for h in headers)
        
        for row in table[1:]:
            if not row or not row[0]:
                continue
            
            try:
                score = int(str(row[0]).strip())
                if 1 <= score <= 5:
                    if has_doc_impl and len(row) >= 3:
                        criteria.append({
                            "score": score,
                            "documentation_criteria": str(row[1]).strip() if row[1] else "",
                            "implementation_criteria": str(row[2]).strip() if row[2] else ""
                        })
                    elif len(row) >= 2:
                        criteria.append({
                            "score": score,
                            "criterion": str(row[1]).strip() if row[1] else ""
                        })
            except:
                continue
        
        return criteria
    
    def save_results(self, results: Dict, output_path: str):
        """Save results to JSON file."""
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"Results saved to: {output_path}")


def main():
    """Extract data from Prilog B and C PDFs."""
    parser = PrilogPDFParser()
    
    # Create output directory
    output_dir = Path("/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/enhanced_extraction")
    output_dir.mkdir(exist_ok=True)
    
    # Parse Prilog B
    prilog_b_path = "/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/službena_dokumentacija/Prilog B - Okvir za evaluaciju.pdf"
    print("Parsing Prilog B...")
    prilog_b_results = parser.parse_prilog_b(prilog_b_path)
    parser.save_results(prilog_b_results, output_dir / "prilog_b_parsed.json")
    print(f"Found {len(prilog_b_results['controls'])} controls in Prilog B")
    
    # Parse Prilog C
    prilog_c_path = "/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/službena_dokumentacija/Prilog C - Katalog kontrola.pdf"
    print("\nParsing Prilog C...")
    prilog_c_results = parser.parse_prilog_c(prilog_c_path)
    parser.save_results(prilog_c_results, output_dir / "prilog_c_parsed.json")
    print(f"Found {len(prilog_c_results['controls'])} controls in Prilog C")
    
    # Check for missing controls
    print("\nChecking for missing controls...")
    prilog_b_controls = set(prilog_b_results['controls'].keys())
    prilog_c_controls = set(prilog_c_results['controls'].keys())
    
    missing_from_b = prilog_c_controls - prilog_b_controls
    missing_from_c = prilog_b_controls - prilog_c_controls
    
    if missing_from_b:
        print(f"Missing from Prilog B: {sorted(missing_from_b)}")
    if missing_from_c:
        print(f"Missing from Prilog C: {sorted(missing_from_c)}")
    
    # Check for KRIP controls specifically
    krip_controls = [c for c in prilog_b_controls if c.startswith("KRIP")]
    print(f"\nKRIP controls found: {sorted(krip_controls)}")


if __name__ == "__main__":
    main()