"""Extract all tables from Prilog B to find threshold data."""
import pdfplumber
import re
import json


def extract_all_tables(pdf_path: str):
    """Extract all tables and look for threshold patterns."""
    
    all_tables = []
    submeasure_pattern = re.compile(r'(\d+\.\d+)')
    
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            
            if tables:
                for table_idx, table in enumerate(tables):
                    if table and len(table) > 0:
                        # Check if table contains submeasure numbers
                        has_submeasure = False
                        for row in table:
                            if row:
                                for cell in row:
                                    if cell and submeasure_pattern.match(str(cell).strip()):
                                        # Check if it's a submeasure number (1.x, 2.x, etc.)
                                        try:
                                            num = float(str(cell).strip())
                                            if 1.0 <= num <= 13.99:
                                                has_submeasure = True
                                                break
                                        except ValueError:
                                            pass
                                if has_submeasure:
                                    break
                        
                        if has_submeasure or "podmjera" in str(table).lower():
                            all_tables.append({
                                "page": page_num + 1,
                                "table_index": table_idx + 1,
                                "table": table,
                                "has_submeasure": has_submeasure
                            })
    
    return all_tables


def analyze_threshold_table(table):
    """Analyze a table to extract threshold data."""
    thresholds = {}
    
    # Skip header rows
    data_rows = []
    for row in table:
        if row and len(row) > 6:  # Threshold tables typically have many columns
            # Check if first cell might be submeasure
            first_cell = str(row[0]).strip() if row[0] else ""
            if re.match(r'^\d+\.\d+$', first_cell):
                data_rows.append(row)
    
    # Parse data rows
    for row in data_rows:
        if len(row) >= 7:
            try:
                submeasure = row[0]
                # Assuming structure: submeasure, Pi_osnovna, T_osnovna, Pi_srednja, T_srednja, Pi_napredna, T_napredna
                thresholds[submeasure] = {
                    "osnovna": {
                        "individual": float(row[1]) if row[1] else None,
                        "average": float(row[2]) if row[2] else None
                    },
                    "srednja": {
                        "individual": float(row[3]) if row[3] else None,
                        "average": float(row[4]) if row[4] else None
                    },
                    "napredna": {
                        "individual": float(row[5]) if row[5] else None,
                        "average": float(row[6]) if row[6] else None
                    }
                }
            except (ValueError, IndexError):
                continue
    
    return thresholds


def find_threshold_summary_table(pdf_path: str):
    """Look specifically for a summary table with all thresholds."""
    
    tables = extract_all_tables(pdf_path)
    
    print(f"Found {len(tables)} tables with potential submeasure data")
    
    # Look for the largest table with submeasure data
    largest_table = None
    max_submeasures = 0
    
    for table_info in tables:
        table = table_info["table"]
        submeasure_count = 0
        
        # Count submeasure numbers in first column
        for row in table:
            if row and row[0]:
                if re.match(r'^\d+\.\d+$', str(row[0]).strip()):
                    submeasure_count += 1
        
        if submeasure_count > max_submeasures:
            max_submeasures = submeasure_count
            largest_table = table_info
    
    if largest_table:
        print(f"\nFound likely threshold table on page {largest_table['page']} with {max_submeasures} submeasures")
        print("Table structure:")
        table = largest_table["table"]
        if len(table) > 0:
            print(f"Headers: {table[0]}")
            for i, row in enumerate(table[1:4]):  # Show first 3 data rows
                print(f"Row {i+1}: {row}")
        
        # Try to extract thresholds
        thresholds = analyze_threshold_table(table)
        if thresholds:
            print(f"\nExtracted {len(thresholds)} threshold entries")
            # Save to file
            with open("/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/enhanced_extraction/submeasure_thresholds.json", 'w') as f:
                json.dump(thresholds, f, indent=2)
            return thresholds
    
    return None


if __name__ == "__main__":
    pdf_path = "/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/službena_dokumentacija/Prilog B - Okvir za evaluaciju.pdf"
    
    thresholds = find_threshold_summary_table(pdf_path)
    
    if thresholds:
        print("\nSample thresholds extracted:")
        for submeasure, values in list(thresholds.items())[:3]:
            print(f"  {submeasure}: {values}")