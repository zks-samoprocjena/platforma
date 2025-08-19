"""CLI commands for database management."""
import asyncio
import subprocess
import sys
from pathlib import Path

import click
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import engine, init_db
from app.importers.questionnaire_importer_v2 import import_questionnaire_from_excel


@click.group()
def cli():
    """Database management commands."""
    pass


@cli.command()
def init_migration():
    """Initialize Alembic migrations."""
    try:
        # Run alembic init command
        result = subprocess.run(
            ["alembic", "init", "migrations"],
            cwd=Path(__file__).parent.parent,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            click.echo("✓ Alembic migrations initialized")
        else:
            click.echo(f"✗ Error: {result.stderr}")
            sys.exit(1)
    except Exception as e:
        click.echo(f"✗ Error initializing migrations: {e}")
        sys.exit(1)


@cli.command()
@click.option("--message", "-m", default="Initial migration", help="Migration message")
def create_migration(message: str):
    """Create a new migration."""
    try:
        result = subprocess.run(
            ["alembic", "revision", "--autogenerate", "-m", message],
            cwd=Path(__file__).parent.parent,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            click.echo(f"✓ Migration created: {message}")
            click.echo(result.stdout)
        else:
            click.echo(f"✗ Error: {result.stderr}")
            sys.exit(1)
    except Exception as e:
        click.echo(f"✗ Error creating migration: {e}")
        sys.exit(1)


@cli.command()
def migrate():
    """Apply migrations to database."""
    try:
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            cwd=Path(__file__).parent.parent,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            click.echo("✓ Migrations applied successfully")
            click.echo(result.stdout)
        else:
            click.echo(f"✗ Error: {result.stderr}")
            sys.exit(1)
    except Exception as e:
        click.echo(f"✗ Error applying migrations: {e}")
        sys.exit(1)


@cli.command()
def test_connection():
    """Test database connection."""

    async def _test():
        try:
            async with engine.begin() as conn:
                await conn.execute("SELECT 1")
            click.echo("✓ Database connection successful")
            return True
        except SQLAlchemyError as e:
            click.echo(f"✗ Database connection failed: {e}")
            return False
        except Exception as e:
            click.echo(f"✗ Unexpected error: {e}")
            return False

    success = asyncio.run(_test())
    if not success:
        sys.exit(1)


@cli.command()
def create_tables():
    """Create all database tables (development only)."""

    async def _create():
        try:
            await init_db()
            click.echo("✓ All tables created successfully")
        except Exception as e:
            click.echo(f"✗ Error creating tables: {e}")
            sys.exit(1)

    asyncio.run(_create())


@cli.command()
@click.argument("excel_file", type=click.Path(exists=True, path_type=Path))
@click.option(
    "--validate-only", is_flag=True, help="Only validate the Excel file, don't import"
)
@click.option(
    "--force", is_flag=True, help="Force reimport even if questionnaire version exists"
)
@click.option(
    "--verbose", "-v", is_flag=True, help="Show detailed progress information"
)
def import_questionnaire(
    excel_file: Path, validate_only: bool, force: bool, verbose: bool
):
    """Import questionnaire from Excel file."""

    async def _import():
        try:
            if verbose:
                click.echo(f"📁 Starting import from: {excel_file}")
                click.echo(f"🔧 Options: validate_only={validate_only}, force={force}")

            success, import_log = await import_questionnaire_from_excel(
                excel_file, force_reimport=force, validation_only=validate_only
            )

            if success:
                if validate_only:
                    click.echo("✅ Validation completed successfully")
                else:
                    click.echo("✅ Import completed successfully")

                if verbose:
                    click.echo("\n📊 Import Statistics:")
                    click.echo(f"   Status: {import_log.status.value}")
                    click.echo(f"   Measures: {import_log.measures_count}")
                    click.echo(f"   Submeasures: {import_log.submeasures_count}")
                    click.echo(f"   Controls: {import_log.controls_count}")
                    click.echo(f"   Records created: {import_log.records_created}")
                    click.echo(f"   Records skipped: {import_log.records_skipped}")

                    if import_log.duration_seconds:
                        click.echo(f"   Duration: {import_log.duration_seconds:.2f}s")

                    if import_log.questionnaire_version_id:
                        click.echo(
                            f"   Version ID: {import_log.questionnaire_version_id}"
                        )

            else:
                click.echo("❌ Import failed")
                if import_log.error_message:
                    click.echo(f"Error: {import_log.error_message}")
                if import_log.validation_errors:
                    click.echo(f"Validation errors: {import_log.validation_errors}")
                sys.exit(1)

            if verbose and import_log.log_messages:
                click.echo("\n📝 Import Log:")
                click.echo(import_log.log_messages)

        except Exception as e:
            click.echo(f"❌ Unexpected error during import: {e}")
            sys.exit(1)

    asyncio.run(_import())


@cli.command()
@click.option("--limit", default=10, help="Number of recent imports to show")
def import_history(limit: int):
    """Show recent import history."""

    async def _show_history():
        try:
            from app.core.database import get_async_session
            from app.models.import_log import ImportLog
            from sqlalchemy import select, desc

            async with get_async_session() as db:
                result = await db.execute(
                    select(ImportLog).order_by(desc(ImportLog.created_at)).limit(limit)
                )
                imports = result.scalars().all()

            if not imports:
                click.echo("No import history found")
                return

            click.echo(f"📜 Recent Import History (last {len(imports)} imports):\n")

            for imp in imports:
                status_emoji = {
                    "completed": "✅",
                    "failed": "❌",
                    "validation_failed": "⚠️",
                    "started": "🟡",
                    "in_progress": "🔄",
                }.get(imp.status.value, "❓")

                click.echo(
                    f"{status_emoji} {imp.created_at.strftime('%Y-%m-%d %H:%M:%S')}"
                )
                click.echo(f"   Type: {imp.import_type.value}")
                click.echo(f"   File: {Path(imp.source_file).name}")
                click.echo(f"   Status: {imp.status.value}")

                if imp.status.value == "completed":
                    click.echo(
                        f"   Records: {imp.records_created} created, {imp.records_skipped} skipped"
                    )
                    if imp.duration_seconds:
                        click.echo(f"   Duration: {imp.duration_seconds:.2f}s")

                if imp.error_message:
                    click.echo(f"   Error: {imp.error_message[:100]}...")

                click.echo()

        except Exception as e:
            click.echo(f"❌ Error showing import history: {e}")
            sys.exit(1)

    asyncio.run(_show_history())


if __name__ == "__main__":
    cli()
