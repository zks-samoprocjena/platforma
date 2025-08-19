"""Extract submeasure requirement tables (A/B/C values) from Prilog B."""
import pdfplumber
import re
import json
from typing import Dict, List


def clean_table_data(table: List[List]) -> Dict:
    """Clean and structure the A/B/C table data."""
    if not table or len(table) < 5:
        return {}
    
    # Extract submeasure numbers from header row
    submeasure_row = None
    for row in table:
        if row and any(cell and re.match(r'\d+\.\d+\.?', str(cell).strip()) for cell in row):
            submeasure_row = row
            break
    
    if not submeasure_row:
        return {}
    
    # Extract submeasure numbers
    submeasures = []
    for cell in submeasure_row:
        if cell:
            match = re.match(r'(\d+\.\d+)\.?', str(cell).strip())
            if match:
                submeasures.append(match.group(1))
    
    # Extract level data
    results = {
        "submeasures": submeasures,
        "requirements": {
            "osnovna": [],
            "srednja": [],
            "napredna": []
        }
    }
    
    # Find rows with level data
    for row in table:
        if row and len(row) > 3:
            level_name = str(row[1]).lower().strip() if row[1] else ""
            
            if level_name in ["osnovna", "srednja", "napredna"]:
                # Extract A/B/C values
                values = []
                for i, cell in enumerate(row[3:]):  # Skip first 3 columns
                    if cell and str(cell).strip() in ['A', 'B', 'C']:
                        values.append(str(cell).strip())
                
                results["requirements"][level_name] = values
    
    return results


def extract_all_submeasure_requirements(pdf_path: str) -> Dict:
    """Extract all submeasure requirement tables from PDF."""
    all_requirements = {}
    
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            
            if tables:
                for table in tables:
                    if table and len(table) > 2:
                        # Check if it's an A/B/C table
                        abc_count = sum(1 for row in table if row 
                                      for cell in row if cell and str(cell).strip() in ['A', 'B', 'C'])
                        
                        if abc_count > 5:  # Likely a submeasure requirements table
                            # Extract measure number from page
                            page_text = page.extract_text()
                            measure_match = re.search(r'Mjera\s+(\d+)', page_text) if page_text else None
                            
                            if not measure_match and page_text:
                                # Try to infer from submeasure numbers
                                submeasure_match = re.search(r'(\d+)\.\d+', str(table))
                                if submeasure_match:
                                    measure_num = submeasure_match.group(1)
                                else:
                                    continue
                            else:
                                measure_num = measure_match.group(1) if measure_match else None
                            
                            if measure_num or submeasure_match:
                                clean_data = clean_table_data(table)
                                if clean_data and clean_data["submeasures"]:
                                    # Infer measure from submeasure if needed
                                    if not measure_num:
                                        measure_num = clean_data["submeasures"][0].split('.')[0]
                                    
                                    all_requirements[f"measure_{measure_num}"] = {
                                        "page": page_num + 1,
                                        "submeasures": clean_data["submeasures"],
                                        "requirements": clean_data["requirements"]
                                    }
    
    return all_requirements


def create_submeasure_lookup(requirements: Dict) -> Dict:
    """Create a lookup table for each submeasure's requirements."""
    lookup = {}
    
    for measure_key, measure_data in requirements.items():
        submeasures = measure_data["submeasures"]
        
        for level in ["osnovna", "srednja", "napredna"]:
            values = measure_data["requirements"][level]
            
            for i, submeasure in enumerate(submeasures):
                if i < len(values):
                    if submeasure not in lookup:
                        lookup[submeasure] = {}
                    lookup[submeasure][level] = values[i]
    
    return lookup


def main():
    """Extract and save submeasure requirements."""
    pdf_path = "/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/službena_dokumentacija/Prilog B - Okvir za evaluaciju.pdf"
    
    print("Extracting submeasure requirements...")
    requirements = extract_all_submeasure_requirements(pdf_path)
    
    print(f"\nFound requirements for {len(requirements)} measures")
    
    # Create submeasure lookup
    submeasure_lookup = create_submeasure_lookup(requirements)
    
    # Save both formats
    output_dir = "/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/enhanced_extraction"
    
    # Save by measure
    with open(f"{output_dir}/submeasure_requirements_by_measure.json", 'w', encoding='utf-8') as f:
        json.dump(requirements, f, ensure_ascii=False, indent=2)
    
    # Save by submeasure
    with open(f"{output_dir}/submeasure_requirements_lookup.json", 'w', encoding='utf-8') as f:
        json.dump(submeasure_lookup, f, ensure_ascii=False, indent=2)
    
    # Print summary
    print("\nSummary of requirements:")
    total_submeasures = len(submeasure_lookup)
    print(f"Total submeasures: {total_submeasures}")
    
    # Count by requirement type
    requirement_counts = {"A": 0, "B": 0, "C": 0}
    for submeasure, levels in submeasure_lookup.items():
        for level, req in levels.items():
            if req in requirement_counts:
                requirement_counts[req] += 1
    
    print("\nRequirement distribution:")
    for req, count in requirement_counts.items():
        print(f"  {req}: {count} ({count/3/total_submeasures*100:.1f}%)")
    
    # Show sample
    print("\nSample submeasure requirements:")
    for submeasure in list(submeasure_lookup.keys())[:5]:
        reqs = submeasure_lookup[submeasure]
        print(f"  {submeasure}: osnovna={reqs.get('osnovna', '?')}, "
              f"srednja={reqs.get('srednja', '?')}, "
              f"napredna={reqs.get('napredna', '?')}")


if __name__ == "__main__":
    main()