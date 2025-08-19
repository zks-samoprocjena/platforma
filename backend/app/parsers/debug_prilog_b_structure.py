"""Debug script to understand Prilog B structure."""
import pdfplumber
import re


def analyze_pdf_structure(pdf_path: str):
    """Analyze PDF to understand its structure."""
    
    with pdfplumber.open(pdf_path) as pdf:
        print(f"Total pages: {len(pdf.pages)}")
        
        # Patterns to look for
        patterns = {
            "measure": re.compile(r'(?:Mjera|MJERA)\s+(\d+)'),
            "submeasure": re.compile(r'(?:Podmjera|PODMJERA|Podskup.*mjere)\s*(\d+\.\d+)'),
            "control": re.compile(r'([A-Z]{3,4}-\d{3})'),
            "table": re.compile(r'(?:Tablica|TABLICA|tbl)\s+(\d+)'),
            "scores": re.compile(r'(?:osnovna|srednja|napredna|OSNOVNA|SREDNJA|NAPREDNA)')
        }
        
        # Analyze first 30 pages
        for page_num in range(min(30, len(pdf.pages))):
            page = pdf.pages[page_num]
            text = page.extract_text()
            
            if not text:
                continue
            
            # Check what patterns are found
            found_patterns = []
            for pattern_name, pattern in patterns.items():
                if pattern.search(text):
                    found_patterns.append(pattern_name)
            
            if found_patterns:
                print(f"\n--- Page {page_num + 1} ---")
                print(f"Found: {', '.join(found_patterns)}")
                
                # Show specific matches
                if "submeasure" in found_patterns:
                    submeasures = patterns["submeasure"].findall(text)
                    print(f"  Submeasures: {submeasures}")
                
                if "control" in found_patterns:
                    controls = patterns["control"].findall(text)
                    print(f"  Controls: {controls[:5]}...")  # First 5
                
                # Check tables
                tables = page.extract_tables()
                if tables:
                    print(f"  Tables: {len(tables)}")
                    for i, table in enumerate(tables[:2]):  # First 2 tables
                        if table and len(table) > 0:
                            print(f"    Table {i+1} size: {len(table)}x{len(table[0]) if table[0] else 0}")
                            if len(table) > 0 and table[0]:
                                # Show first row (header)
                                header = [str(cell)[:20] if cell else "" for cell in table[0]]
                                print(f"    Header preview: {header}")
                
                # Show text snippet for submeasure context
                if "submeasure" in found_patterns:
                    lines = text.split('\n')
                    for i, line in enumerate(lines):
                        if re.search(r'(?:Podmjera|PODMJERA|Podskup)', line):
                            print(f"  Context: {line}")
                            # Show next few lines
                            for j in range(1, 4):
                                if i + j < len(lines):
                                    print(f"    +{j}: {lines[i+j][:80]}")


if __name__ == "__main__":
    pdf_path = "/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/službena_dokumentacija/Prilog B - Okvir za evaluaciju.pdf"
    analyze_pdf_structure(pdf_path)