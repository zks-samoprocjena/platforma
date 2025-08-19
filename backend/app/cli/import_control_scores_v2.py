"""CLI command to import control scoring data with submeasure context."""
import asyncio
import logging
from pathlib import Path
import click
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.services.control_scoring_import_service import ControlScoringImportService as ControlScoringImportServiceV2


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def import_control_scores(data_dir: str, clear_existing: bool = False):
    """Import control scores with submeasure context."""
    
    # Create database connection
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        async with async_session() as session:
            service = ControlScoringImportServiceV2(session)
            
            if clear_existing:
                logger.warning("Clearing existing scoring data...")
                await service.clear_existing_data()
            
            logger.info(f"Importing control scores from {data_dir}")
            stats = await service.import_all_data(data_dir)
            
            # Print statistics
            print("\n=== Import Statistics ===")
            print(f"Controls processed: {stats['controls_processed']}")
            print(f"Requirements created: {stats['requirements_created']}")
            print(f"Requirements updated: {stats['requirements_updated']}")
            print(f"Control-submeasure mappings created: {stats['control_submeasure_mappings_created']}")
            print(f"Rating guidance created: {stats['rating_guidance_created']}")
            print(f"Submeasure requirements created: {stats['submeasure_requirements_created']}")
            
            if stats['warnings']:
                print(f"\nWarnings ({len(stats['warnings'])}):")
                for warning in stats['warnings'][:10]:
                    print(f"  - {warning}")
                if len(stats['warnings']) > 10:
                    print(f"  ... and {len(stats['warnings']) - 10} more")
            
            if stats['errors']:
                print(f"\nErrors ({len(stats['errors'])}):")
                for error in stats['errors']:
                    print(f"  - {error}")
            
            # Run validation
            print("\n=== Validation Results ===")
            validation = await service.validate_import()
            
            print(f"Total control requirements: {validation['control_requirements']['total']}")
            print(f"  - With submeasure context: {validation['control_requirements']['with_submeasure']}")
            print(f"  - Without submeasure context: {validation['control_requirements']['without_submeasure']}")
            
            print("\nRequirements by security level:")
            for level, count in validation['control_requirements']['by_level'].items():
                print(f"  - {level}: {count}")
            
            print(f"\nControl-submeasure mappings: {validation['control_submeasure_mappings']}")
            print(f"Controls with rating guidance: {validation['rating_guidance']['controls_with_guidance']}")
            
            if validation['submeasure_thresholds']:
                print("\nSubmeasure thresholds by level:")
                for level, count in validation['submeasure_thresholds'].items():
                    print(f"  - {level}: {count}")
            
            if validation['issues']:
                print("\nPotential issues:")
                for issue in validation['issues']:
                    print(f"  - {issue}")
            
    finally:
        await engine.dispose()


@click.command()
@click.option(
    '--data-dir',
    default='/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/enhanced_extraction',
    help='Directory containing extracted data files'
)
@click.option(
    '--clear-existing',
    is_flag=True,
    help='Clear existing scoring data before import'
)
def main(data_dir: str, clear_existing: bool):
    """Import control scoring requirements with submeasure context."""
    asyncio.run(import_control_scores(data_dir, clear_existing))


if __name__ == "__main__":
    main()