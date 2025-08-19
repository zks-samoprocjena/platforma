"""Find submeasure thresholds in Prilog B PDF."""
import pdfplumber
import re


def find_submeasure_patterns(pdf_path: str):
    """Search for submeasure threshold patterns."""
    
    # Various patterns to try
    patterns = [
        # Pattern like "1.11 2.0 2.1 2.5 3.6"
        re.compile(r'(\d+\.\d+)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)\s+(\d+\.?\d*)'),
        # Pattern with >= symbols
        re.compile(r'(\d+\.\d+)\s+[≥>]?\s*(\d+\.?\d*)\s+[≥>]?\s*(\d+\.?\d*)'),
        # Pattern in table format
        re.compile(r'Podmjera\s+(\d+\.\d+)'),
        # Generic decimal pattern
        re.compile(r'(\d+\.\d+)')
    ]
    
    with pdfplumber.open(pdf_path) as pdf:
        print(f"Searching {len(pdf.pages)} pages for submeasure thresholds...")
        
        for page_num, page in enumerate(pdf.pages):
            text = page.extract_text()
            if not text:
                continue
            
            # Look for "Podmjera" or threshold-related keywords
            if any(keyword in text for keyword in ["Podmjera", "podmjera", "Pi", "prag", "threshold"]):
                print(f"\nPage {page_num + 1} contains threshold keywords:")
                
                # Try each pattern
                for i, pattern in enumerate(patterns):
                    matches = pattern.findall(text)
                    if matches:
                        print(f"  Pattern {i+1} found {len(matches)} matches")
                        for match in matches[:3]:  # Show first 3
                            print(f"    {match}")
                
                # Also check tables
                tables = page.extract_tables()
                if tables:
                    print(f"  Found {len(tables)} tables on this page")
                    for j, table in enumerate(tables):
                        if table and len(table) > 0:
                            # Check if table contains submeasure data
                            header = str(table[0]) if table[0] else ""
                            if any(word in str(header).lower() for word in ["podmjera", "pi", "t", "prag"]):
                                print(f"    Table {j+1} appears to contain threshold data:")
                                print(f"      Headers: {table[0]}")
                                if len(table) > 1:
                                    print(f"      First row: {table[1]}")


def check_specific_pages(pdf_path: str, start_page: int = 60, num_pages: int = 10):
    """Check specific pages where thresholds might be."""
    
    with pdfplumber.open(pdf_path) as pdf:
        print(f"\nChecking pages {start_page} to {start_page + num_pages - 1}...")
        
        for i in range(start_page - 1, min(start_page + num_pages - 1, len(pdf.pages))):
            page = pdf.pages[i]
            tables = page.extract_tables()
            
            if tables:
                for table in tables:
                    if table and len(table) > 2:
                        # Look for numeric patterns in tables
                        numeric_cells = 0
                        for row in table:
                            if row:
                                for cell in row:
                                    if cell and re.match(r'^\d+\.?\d*$', str(cell).strip()):
                                        numeric_cells += 1
                        
                        if numeric_cells > 10:  # Table with many numbers
                            print(f"\nPage {i+1} has a numeric table:")
                            print(f"  Dimensions: {len(table)}x{len(table[0]) if table[0] else 0}")
                            print(f"  Headers: {table[0]}")
                            for row in table[1:4]:  # Show first 3 data rows
                                print(f"  {row}")


if __name__ == "__main__":
    pdf_path = "/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/službena_dokumentacija/Prilog B - Okvir za evaluaciju.pdf"
    
    find_submeasure_patterns(pdf_path)
    
    # Check end of document where summaries often are
    check_specific_pages(pdf_path, start_page=60, num_pages=10)