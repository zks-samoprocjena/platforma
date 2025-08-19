"""Find the A/B/C tables (Podskupovi mjere) in Prilog B."""
import pdfplumber
import re


def find_abc_tables(pdf_path: str):
    """Search for tables containing A, B, C values."""
    
    with pdfplumber.open(pdf_path) as pdf:
        print(f"Searching {len(pdf.pages)} pages for A/B/C tables...")
        
        for page_num, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            
            if tables:
                for table_idx, table in enumerate(tables):
                    if table and len(table) > 2:
                        # Check if table contains A, B, or C values
                        has_abc = False
                        abc_count = 0
                        
                        for row in table:
                            if row:
                                for cell in row:
                                    if cell and str(cell).strip() in ['A', 'B', 'C']:
                                        abc_count += 1
                                        has_abc = True
                        
                        # If table has multiple A/B/C values, it's likely what we want
                        if has_abc and abc_count > 5:
                            print(f"\nFound A/B/C table on page {page_num + 1}:")
                            print(f"  Table dimensions: {len(table)}x{len(table[0]) if table[0] else 0}")
                            print(f"  A/B/C count: {abc_count}")
                            
                            # Print the table structure
                            if len(table) > 0:
                                print(f"  Headers: {table[0]}")
                            for i, row in enumerate(table[1:5]):  # Show first few rows
                                print(f"  Row {i+1}: {row}")
                            
                            # Check for "Podskupovi" or measure indicators
                            page_text = page.extract_text()
                            if page_text:
                                # Look for measure context
                                measure_match = re.search(r'Mjera\s+(\d+)', page_text)
                                if measure_match:
                                    print(f"  Associated with Mjera {measure_match.group(1)}")
                                
                                if "podskup" in page_text.lower():
                                    print("  Contains 'podskupovi' keyword")


if __name__ == "__main__":
    pdf_path = "/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/službena_dokumentacija/Prilog B - Okvir za evaluaciju.pdf"
    find_abc_tables(pdf_path)