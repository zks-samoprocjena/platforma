"""Debug script to find how submeasures appear in text."""
import pdfplumber
import re


def find_submeasure_patterns(pdf_path: str):
    """Find patterns for submeasures in the PDF."""
    
    # Various patterns to try
    patterns = [
        re.compile(r'(\d+\.\d+)\.?\s*(?:Podmjera|podmjera)', re.IGNORECASE),
        re.compile(r'(?:Podmjera|podmjera)\s*(\d+\.\d+)', re.IGNORECASE),
        re.compile(r'(\d+\.\d+)(?:\.|:)?\s*[A-Z]', re.MULTILINE),  # 1.1. or 1.1: followed by capital letter
        re.compile(r'^(\d+\.\d+)\.', re.MULTILINE),  # Line starting with submeasure number
        re.compile(r'Podskup[a-z]*\s*(?:mjere\s*)?(\d+\.\d+)', re.IGNORECASE),
    ]
    
    with pdfplumber.open(pdf_path) as pdf:
        # Check pages 5-10 where we know tables exist
        for page_num in range(4, min(15, len(pdf.pages))):
            page = pdf.pages[page_num]
            text = page.extract_text()
            
            if not text:
                continue
            
            print(f"\n--- Page {page_num + 1} ---")
            
            # Look for table references
            table_matches = re.findall(r'(?:tbl|Tablica)\s+(\d+)', text)
            if table_matches:
                print(f"Tables found: {table_matches}")
            
            # Try each pattern
            found_any = False
            for i, pattern in enumerate(patterns):
                matches = pattern.findall(text)
                if matches:
                    print(f"Pattern {i+1} matches: {matches}")
                    found_any = True
            
            # If no patterns matched but we have tables, show text snippets
            if not found_any and table_matches:
                print("No submeasure patterns found. Text preview:")
                lines = text.split('\n')
                
                # Find lines with table references and show context
                for i, line in enumerate(lines):
                    if re.search(r'(?:tbl|Tablica)\s+\d+', line):
                        print(f"\nAround table reference:")
                        # Show 5 lines before
                        for j in range(max(0, i-5), i):
                            print(f"  -{i-j}: {lines[j][:100]}")
                        print(f"  >>> {line}")
                        # Show 2 lines after
                        for j in range(i+1, min(i+3, len(lines))):
                            print(f"  +{j-i}: {lines[j][:100]}")
                        break


if __name__ == "__main__":
    pdf_path = "/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/službena_dokumentacija/Prilog B - Okvir za evaluaciju.pdf"
    find_submeasure_patterns(pdf_path)