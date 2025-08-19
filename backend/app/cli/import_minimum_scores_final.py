#!/usr/bin/env python3
"""
Final import script with manual submeasure mapping.
Maps PDF submeasures to database submeasures using known patterns.
"""
import asyncio
import json
import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, and_, func

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Database URL
DATABASE_URL = "postgresql+asyncpg://postgres:postgres@postgres:5432/assessment_db"

# Manual mapping of PDF submeasures to database submeasures
# This maps the submeasure numbers found in PDF to the actual database submeasure codes
PDF_TO_DB_SUBMEASURE_MAPPING = {
    "1.1": "1.1",
    "1.2": "1.2", 
    "1.3": "1.3",
    "1.4": "1.4",
    "1.5": "1.5",
    "1.6": "1.6",
    "1.7": "1.7",
    "1.8": "1.8",
    "1.9": "1.9",
    "1.10": "1.10",
    "1.11": "1.11",
    "2.1": "2.1",
    "2.2": "2.2",
    "2.4": "2.4",
    "2.5": "2.5",
    "2.7": "2.7",
    "2.9": "2.9",
    "3.1": "3.1",
    "3.2": "3.2",
    "3.4": "3.4",
    "3.6": "3.6",
    "3.8": "3.8",
    "4.1": "4.1",
    "4.2": "4.2",
    "4.4": "4.4",
    "4.6": "4.6",
    "4.7": "4.7",
    "4.10": "4.10",
    "4.12": "4.12",
    "5.1": "5.1",
    "5.3": "5.3",
    "5.4": "5.4",
    "5.5": "5.5",
    "5.6": "5.6",
    "5.7": "5.7",
    "5.9": "5.9",
    "5.11": "5.11",
    "6.1": "6.1",
    "6.3": "6.3",
    "6.5": "6.5",
    "7.1": "7.1",
    "7.2": "7.2",
    "7.4": "7.4",
    "7.6": "7.6",
    "8.1": "8.1",
    "8.2": "8.2",
    "8.5": "8.5",
    "9.1": "9.1",
    "9.3": "9.3",
    "9.4": "9.4",
    "9.5": "9.5",
    "10.1": "10.1",
    "10.3": "10.3",
    "10.5": "10.5",
    "11.1": "11.1",
    "11.4": "11.4",
    "11.6": "11.6",
    "12.1": "12.1",
    "12.4": "12.4",
    "12.5": "12.5",
    "12.6": "12.6",
    "12.7": "12.7",
    "12.8": "12.8",
    "13.1": "13.1",
    "13.3": "13.3",
}

async def import_minimum_scores_final():
    """Import minimum scores with predefined submeasure mapping."""
    
    # Load extracted scores
    json_path = "/tmp/prilog_b_tables_extracted.json"
    with open(json_path, 'r', encoding='utf-8') as f:
        score_data = json.load(f)
    
    logger.info(f"Loaded score data for {len(score_data.get('control_scores', {}))} controls")
    
    # Connect to database
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        try:
            from app.models.reference import Control, ControlRequirement, Submeasure, Measure
            
            # Get all controls
            controls_result = await session.execute(select(Control))
            controls_by_code = {c.code: c for c in controls_result.scalars().all()}
            logger.info(f"Found {len(controls_by_code)} controls in database")
            
            # Get all submeasures with their measure codes
            submeasures_result = await session.execute(
                select(Submeasure, Measure).join(Measure, Submeasure.measure_id == Measure.id)
            )
            submeasures_by_key = {}
            for submeasure, measure in submeasures_result.all():
                key = f"{measure.code}.{submeasure.code}"
                submeasures_by_key[key] = submeasure
            logger.info(f"Found {len(submeasures_by_key)} submeasures in database")
            
            scores_applied = 0
            mappings_processed = 0
            successful_mappings = 0
            
            # Process each control-submeasure combination
            for control_code, submeasures in score_data.get("control_scores", {}).items():
                if control_code not in controls_by_code:
                    continue
                
                control = controls_by_code[control_code]
                
                for pdf_submeasure_key, scores in submeasures.items():
                    mappings_processed += 1
                    
                    # Check if we have a mapping for this submeasure
                    if pdf_submeasure_key not in PDF_TO_DB_SUBMEASURE_MAPPING:
                        logger.debug(f"No mapping found for PDF submeasure {pdf_submeasure_key}")
                        continue
                    
                    db_submeasure_code = PDF_TO_DB_SUBMEASURE_MAPPING[pdf_submeasure_key]
                    
                    # Extract measure number from submeasure code
                    measure_code = db_submeasure_code.split('.')[0]
                    db_key = f"{measure_code}.{db_submeasure_code}"
                    
                    if db_key not in submeasures_by_key:
                        logger.debug(f"Database submeasure {db_key} not found")
                        continue
                    
                    db_submeasure = submeasures_by_key[db_key]
                    successful_mappings += 1
                    
                    # Apply scores for each level
                    for level in ['osnovna', 'srednja', 'napredna']:
                        minimum_score = scores.get(level)
                        if minimum_score is not None:
                            # Find the specific requirement
                            requirement_result = await session.execute(
                                select(ControlRequirement).where(
                                    and_(
                                        ControlRequirement.control_id == control.id,
                                        ControlRequirement.submeasure_id == db_submeasure.id,
                                        ControlRequirement.level == level
                                    )
                                )
                            )
                            
                            requirement = requirement_result.scalar_one_or_none()
                            if requirement:
                                requirement.minimum_score = float(minimum_score)
                                scores_applied += 1
                                logger.debug(f"Applied {control_code} in {pdf_submeasure_key}->{db_key} at {level}: {minimum_score}")
            
            # Commit changes
            await session.commit()
            
            logger.info(f"Import completed:")
            logger.info(f"  Total mappings processed: {mappings_processed}")
            logger.info(f"  Successful mappings: {successful_mappings}")
            logger.info(f"  Scores applied: {scores_applied}")
            
            # Verify results
            await verify_import(session)
            
            return True
            
        except Exception as e:
            logger.error(f"Import failed: {e}")
            await session.rollback()
            return False
        finally:
            await engine.dispose()

async def verify_import(session):
    """Verify the import results."""
    from app.models.reference import ControlRequirement
    
    logger.info("Verifying import results...")
    
    for level in ['osnovna', 'srednja', 'napredna']:
        total_result = await session.execute(
            select(func.count()).select_from(ControlRequirement).where(
                ControlRequirement.level == level
            )
        )
        total = total_result.scalar()
        
        with_scores_result = await session.execute(
            select(func.count()).select_from(ControlRequirement).where(
                and_(
                    ControlRequirement.level == level,
                    ControlRequirement.minimum_score.isnot(None)
                )
            )
        )
        with_scores = with_scores_result.scalar()
        
        logger.info(f"Level {level}: {with_scores}/{total} requirements have minimum scores")

if __name__ == "__main__":
    success = asyncio.run(import_minimum_scores_final())
    if success:
        print("✅ Minimum scores imported successfully!")
    else:
        print("❌ Import failed!")
        exit(1)