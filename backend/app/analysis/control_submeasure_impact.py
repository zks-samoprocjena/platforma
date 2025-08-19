"""Analyze the impact of control-submeasure context refactoring."""
import asyncio
import json
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func, and_
from collections import defaultdict

from app.config import settings
from app.models import Control, Submeasure, ControlSubmeasureMapping, Assessment, AssessmentAnswer


async def analyze_control_submeasure_impact():
    """Analyze which controls appear in multiple submeasures and the impact."""
    
    # Create database connection
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        async with async_session() as session:
            print("Control-Submeasure Context Impact Analysis")
            print("=" * 60)
            
            # 1. Find controls that appear in multiple submeasures
            print("\n1. Controls appearing in multiple submeasures:")
            
            # Query using control_submeasure_mapping table
            multi_context_query = (
                select(
                    Control.code,
                    Control.name_hr,
                    func.count(ControlSubmeasureMapping.submeasure_id).label('submeasure_count')
                )
                .join(ControlSubmeasureMapping, Control.id == ControlSubmeasureMapping.control_id)
                .group_by(Control.code, Control.name_hr)
                .having(func.count(ControlSubmeasureMapping.submeasure_id) > 1)
                .order_by(func.count(ControlSubmeasureMapping.submeasure_id).desc())
            )
            
            result = await session.execute(multi_context_query)
            multi_context_controls = result.all()
            
            if not multi_context_controls:
                # Fallback: Check using controls table (primary submeasure)
                print("No mappings found. Checking for duplicate control codes...")
                
                dup_query = (
                    select(
                        Control.code,
                        func.count(Control.id).label('count')
                    )
                    .group_by(Control.code)
                    .having(func.count(Control.id) > 1)
                    .order_by(func.count(Control.id).desc())
                )
                
                dup_result = await session.execute(dup_query)
                duplicates = dup_result.all()
                
                for code, count in duplicates:
                    print(f"  {code}: appears {count} times")
            else:
                total_multi_context = len(multi_context_controls)
                print(f"  Total: {total_multi_context} controls")
                
                # Show top 10
                for code, name, count in multi_context_controls[:10]:
                    print(f"  {code}: {name[:40]:<40} - {count} submeasures")
                
                if total_multi_context > 10:
                    print(f"  ... and {total_multi_context - 10} more")
            
            # 2. Show specific examples with submeasure details
            print("\n2. Detailed examples of multi-context controls:")
            
            # Get details for a few example controls
            example_codes = ['POL-001', 'ORG-001', 'EDU-001']
            
            for code in example_codes:
                control = await session.execute(
                    select(Control).where(Control.code == code).limit(1)
                )
                control_obj = control.scalar_one_or_none()
                
                if control_obj:
                    # Get all submeasures this control appears in
                    submeasures_query = (
                        select(Submeasure.number, Submeasure.name_hr)
                        .join(
                            ControlSubmeasureMapping,
                            Submeasure.id == ControlSubmeasureMapping.submeasure_id
                        )
                        .where(ControlSubmeasureMapping.control_id == control_obj.id)
                        .order_by(Submeasure.number)
                    )
                    
                    submeasures = await session.execute(submeasures_query)
                    submeasure_list = submeasures.all()
                    
                    if not submeasure_list:
                        # Fallback: use primary submeasure
                        primary_sub = await session.execute(
                            select(Submeasure).where(Submeasure.id == control_obj.submeasure_id)
                        )
                        primary = primary_sub.scalar_one_or_none()
                        if primary:
                            submeasure_list = [(primary.number, primary.name_hr)]
                    
                    if submeasure_list:
                        print(f"\n  {code}: {control_obj.name_hr}")
                        for sub_num, sub_name in submeasure_list:
                            print(f"    - {sub_num}: {sub_name}")
            
            # 3. Impact on existing assessments
            print("\n3. Impact on existing assessments:")
            
            # Count total assessments
            total_assessments = await session.scalar(
                select(func.count(Assessment.id))
            )
            print(f"  Total assessments: {total_assessments}")
            
            # Count assessments with answers
            with_answers = await session.scalar(
                select(func.count(func.distinct(AssessmentAnswer.assessment_id)))
            )
            print(f"  Assessments with answers: {with_answers}")
            
            # Find potential conflicts (same control answered in assessment)
            # This would be a problem after migration
            if multi_context_controls:
                control_codes = [code for code, _, _ in multi_context_controls]
                
                # Get controls that might have conflicts
                conflict_query = (
                    select(
                        AssessmentAnswer.assessment_id,
                        Control.code,
                        func.count(AssessmentAnswer.id).label('answer_count')
                    )
                    .join(Control, AssessmentAnswer.control_id == Control.id)
                    .where(Control.code.in_(control_codes[:10]))  # Check first 10
                    .group_by(AssessmentAnswer.assessment_id, Control.code)
                    .having(func.count(AssessmentAnswer.id) > 1)
                )
                
                conflicts = await session.execute(conflict_query)
                conflict_list = conflicts.all()
                
                if conflict_list:
                    print(f"  Potential conflicts found: {len(conflict_list)}")
                    for assessment_id, control_code, count in conflict_list[:5]:
                        print(f"    Assessment {assessment_id}: {control_code} has {count} answers")
                else:
                    print("  No conflicts found (good!)")
            
            # 4. Load extracted data to show real relationships
            print("\n4. Actual control-submeasure relationships from extraction:")
            
            extracted_file = Path("/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/enhanced_extraction/prilog_b_context_aware.json")
            if extracted_file.exists():
                with open(extracted_file) as f:
                    data = json.load(f)
                
                control_mappings = data.get("control_submeasure_mapping", {})
                
                # Show controls with most submeasures
                sorted_controls = sorted(
                    control_mappings.items(),
                    key=lambda x: len(x[1]),
                    reverse=True
                )
                
                print(f"  Total controls with mappings: {len(control_mappings)}")
                print("\n  Top controls by submeasure count:")
                for control_code, submeasures in sorted_controls[:10]:
                    print(f"    {control_code}: {submeasures}")
            
            # 5. Summary and recommendations
            print("\n5. Summary and Recommendations:")
            print(f"  - {len(multi_context_controls) if multi_context_controls else 'Unknown number of'} controls appear in multiple submeasures")
            print(f"  - {with_answers} assessments would need data migration")
            print(f"  - Migration strategy: Use control's primary submeasure for existing answers")
            print(f"  - Future assessments will properly track context")
            
    finally:
        await engine.dispose()


async def generate_test_data_for_migration():
    """Generate test data to validate migration."""
    
    print("\n\nGenerating test scenarios for migration validation:")
    print("=" * 60)
    
    test_scenarios = [
        {
            "name": "Control in single submeasure",
            "control": "ACC-001",
            "submeasures": ["5.1"],
            "expected": "Simple migration using primary submeasure"
        },
        {
            "name": "Control in multiple submeasures",
            "control": "ORG-001",
            "submeasures": ["1.1", "1.4", "4.1", "4.2", "4.5", "4.7", "11.1", "12.1", "12.3", "13.1"],
            "expected": "Complex case - existing answer migrates to primary submeasure"
        },
        {
            "name": "Edge case - control with no mappings",
            "control": "TEST-001",
            "submeasures": [],
            "expected": "Should use control's submeasure_id field"
        }
    ]
    
    for scenario in test_scenarios:
        print(f"\n{scenario['name']}:")
        print(f"  Control: {scenario['control']}")
        print(f"  Submeasures: {scenario['submeasures']}")
        print(f"  Expected: {scenario['expected']}")


if __name__ == "__main__":
    print("Running control-submeasure impact analysis...")
    asyncio.run(analyze_control_submeasure_impact())
    asyncio.run(generate_test_data_for_migration())