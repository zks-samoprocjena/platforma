"""Prepare final data files for import from various extracted sources."""
import json
from pathlib import Path
import logging


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def prepare_import_data():
    """Prepare all data files needed for import."""
    
    base_path = Path("/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija")
    extraction_dir = base_path / "enhanced_extraction"
    
    # Ensure extraction directory exists
    extraction_dir.mkdir(exist_ok=True)
    
    # 1. Check for context-aware Prilog B data
    context_file = extraction_dir / "prilog_b_context_aware.json"
    if context_file.exists():
        logger.info(f"✓ Context-aware Prilog B data found: {context_file}")
        with open(context_file) as f:
            data = json.load(f)
            total_controls = data.get("metadata", {}).get("total_controls", 0)
            total_mappings = data.get("metadata", {}).get("total_mappings", 0)
            logger.info(f"  - Controls: {total_controls}, Mappings: {total_mappings}")
    else:
        logger.warning(f"✗ Context-aware Prilog B data not found")
    
    # 2. Check for Prilog C data
    prilog_c_file = extraction_dir / "prilog_c_parsed.json"
    if prilog_c_file.exists():
        logger.info(f"✓ Prilog C data found: {prilog_c_file}")
        with open(prilog_c_file) as f:
            data = json.load(f)
            controls = len(data.get("controls", {}))
            rating_tables = len(data.get("rating_tables", {}))
            logger.info(f"  - Controls: {controls}, Rating tables: {rating_tables}")
    else:
        logger.warning(f"✗ Prilog C data not found")
    
    # 3. Check for submeasure requirements
    submeasure_req_file = extraction_dir / "submeasure_requirements_lookup.json"
    if submeasure_req_file.exists():
        logger.info(f"✓ Submeasure requirements found: {submeasure_req_file}")
        with open(submeasure_req_file) as f:
            data = json.load(f)
            logger.info(f"  - Submeasures with requirements: {len(data)}")
    else:
        logger.warning(f"✗ Submeasure requirements not found")
    
    # 4. Create control requirements format file
    control_req_file = extraction_dir / "control_requirements_final.json"
    if control_req_file.exists():
        logger.info(f"✓ Control requirements file found: {control_req_file}")
        with open(control_req_file) as f:
            data = json.load(f)
            logger.info(f"  - Total requirements: {len(data)}")
    else:
        logger.warning(f"✗ Control requirements file not found")
        
        # Try to create it from context-aware data
        if context_file.exists():
            logger.info("  → Creating control requirements from context-aware data...")
            from prilog_b_context_parser import PrilogBContextParser
            
            parser = PrilogBContextParser()
            with open(context_file) as f:
                context_data = json.load(f)
            
            requirements = parser.create_control_requirements_format(context_data)
            
            with open(control_req_file, 'w', encoding='utf-8') as f:
                json.dump(requirements, f, ensure_ascii=False, indent=2)
            
            logger.info(f"  → Created {len(requirements)} requirement entries")
    
    # 5. Summary
    print("\n=== Data Preparation Summary ===")
    print(f"Extraction directory: {extraction_dir}")
    
    required_files = [
        ("Context-aware Prilog B", context_file),
        ("Prilog C ratings", prilog_c_file),
        ("Submeasure requirements", submeasure_req_file),
        ("Control requirements", control_req_file)
    ]
    
    all_ready = True
    for name, file_path in required_files:
        if file_path.exists():
            print(f"✓ {name}: {file_path.name}")
        else:
            print(f"✗ {name}: MISSING")
            all_ready = False
    
    if all_ready:
        print("\n✓ All data files are ready for import!")
        print("\nTo run the import:")
        print("cd /mnt/shared/_Projects/ai/specijalisticki_rad/backend")
        print("python -m app.cli.import_control_scores_v2 --clear-existing")
    else:
        print("\n✗ Some data files are missing. Please run the extraction scripts first.")
    
    return all_ready


if __name__ == "__main__":
    prepare_import_data()