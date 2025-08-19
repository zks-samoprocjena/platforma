"""CLI command to import control scoring requirements."""
import asyncio
import click
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.services.control_scoring_import_service import ControlScoringImportService


async def import_scoring_data(data_dir: str, dry_run: bool = False):
    """Import control scoring requirements from extracted data."""
    # Create database connection
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        service = ControlScoringImportService(session)
        
        if dry_run:
            click.echo("DRY RUN MODE - No changes will be saved")
            
        click.echo(f"Importing data from: {data_dir}")
        
        try:
            # Run import
            stats = await service.import_all_data(data_dir)
            
            # Display results
            click.echo("\nImport Statistics:")
            click.echo(f"  Controls processed: {stats['controls_processed']}")
            click.echo(f"  Requirements created: {stats['requirements_created']}")
            click.echo(f"  Requirements updated: {stats['requirements_updated']}")
            click.echo(f"  Rating guidance created: {stats['rating_guidance_created']}")
            click.echo(f"  Submeasure requirements: {stats['submeasure_requirements_created']}")
            
            if stats['errors']:
                click.echo("\nErrors encountered:")
                for error in stats['errors']:
                    click.echo(f"  - {error}")
            
            # Validate import
            click.echo("\nValidating import...")
            validation = await service.validate_import()
            
            click.echo("\nValidation Results:")
            click.echo("Control Requirements by Level:")
            for level, count in validation['control_requirements'].items():
                click.echo(f"  {level}: {count} controls")
            
            click.echo(f"\nRating Guidance:")
            click.echo(f"  Controls with guidance: {validation['rating_guidance']['controls_with_guidance']}")
            
            if validation['issues']:
                click.echo("\nValidation Issues:")
                for issue in validation['issues']:
                    click.echo(f"  - {issue}")
            
            if dry_run:
                await session.rollback()
                click.echo("\nDRY RUN - Changes rolled back")
            else:
                await session.commit()
                click.echo("\nImport completed successfully!")
                
        except Exception as e:
            await session.rollback()
            click.echo(f"\nERROR: Import failed - {str(e)}", err=True)
            raise
        finally:
            await engine.dispose()


@click.command()
@click.option(
    '--data-dir',
    default='/mnt/shared/_Projects/ai/specijalisticki_rad/dokumentacija/enhanced_extraction',
    help='Directory containing extracted JSON files'
)
@click.option(
    '--dry-run',
    is_flag=True,
    help='Run import without saving changes'
)
def import_scoring_requirements(data_dir: str, dry_run: bool):
    """Import control scoring requirements from extracted data files."""
    data_path = Path(data_dir)
    
    if not data_path.exists():
        click.echo(f"ERROR: Data directory not found: {data_dir}", err=True)
        return
    
    # Check for required files
    required_files = [
        "prilog_b_parsed.json",
        "prilog_c_parsed.json",
        "submeasure_requirements_lookup.json"
    ]
    
    missing_files = []
    for file_name in required_files:
        if not (data_path / file_name).exists():
            missing_files.append(file_name)
    
    if missing_files:
        click.echo("ERROR: Missing required files:", err=True)
        for file in missing_files:
            click.echo(f"  - {file}", err=True)
        return
    
    # Run import
    asyncio.run(import_scoring_data(data_dir, dry_run))


if __name__ == "__main__":
    import_scoring_requirements()