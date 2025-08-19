#!/usr/bin/env python3
"""Run database migration manually."""

import sys
from pathlib import Path

# Add app to path  
sys.path.insert(0, str(Path(__file__).parent))

import asyncio
from sqlalchemy import text
from app.core.database import engine

async def run_migration():
    """Run the import_logs table migration."""
    
    # Execute each statement separately
    statements = [
        # Create table
        """CREATE TABLE IF NOT EXISTS import_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
            import_type VARCHAR(50) NOT NULL,
            source_file VARCHAR(500) NOT NULL,
            file_hash VARCHAR(64) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'started',
            progress_percentage INTEGER NOT NULL DEFAULT 0,
            records_processed INTEGER NOT NULL DEFAULT 0,
            records_created INTEGER NOT NULL DEFAULT 0,
            records_updated INTEGER NOT NULL DEFAULT 0,
            records_skipped INTEGER NOT NULL DEFAULT 0,
            questionnaire_version_id UUID,
            measures_count INTEGER,
            submeasures_count INTEGER,
            controls_count INTEGER,
            started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
            completed_at TIMESTAMP WITH TIME ZONE,
            log_messages TEXT,
            error_message TEXT,
            validation_errors TEXT,
            is_forced_reimport BOOLEAN NOT NULL DEFAULT FALSE,
            validation_only BOOLEAN NOT NULL DEFAULT FALSE
        )""",
        # Create indexes
        "CREATE INDEX IF NOT EXISTS ix_import_logs_created_at ON import_logs(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_import_logs_import_type ON import_logs(import_type)",
        "CREATE INDEX IF NOT EXISTS ix_import_logs_status ON import_logs(status)"
    ]
    
    try:
        async with engine.begin() as conn:
            for i, stmt in enumerate(statements, 1):
                print(f"Executing statement {i}/{len(statements)}...")
                await conn.execute(text(stmt))
        print("✅ Migration completed successfully!")
        
        # Verify table exists
        async with engine.begin() as conn:
            result = await conn.execute(text(
                "SELECT table_name FROM information_schema.tables WHERE table_name = 'import_logs'"
            ))
            if result.scalar():
                print("✅ import_logs table created and verified")
            else:
                print("❌ import_logs table not found after migration")
                
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run_migration())