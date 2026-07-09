#!/bin/bash
# backend/migrate_data.sh
# Script to dump SQLite data and load it into PostgreSQL

# Ensure we have activated our virtual environment
if [ -z "$VIRTUAL_ENV" ]; then
    echo "Warning: Virtual environment not activated. Attempting to activate..."
    source venv/bin/activate 2>/dev/null || echo "Could not activate venv. Please ensure it's active."
fi

echo "Step 1: Dumping existing SQLite data to JSON..."
# Temporarily turn off Postgres to dump from SQLite
export USE_POSTGRES=False
python3 manage.py dumpdata > datadump.json

if [ $? -ne 0 ]; then
    echo "Failed to dump data. Exiting."
    exit 1
fi
echo "Data dumped to datadump.json successfully."

echo "Step 2: Preparing PostgreSQL database..."
export USE_POSTGRES=True

# Apply migrations to ensure the postgres schema is ready
python3 manage.py migrate --run-syncdb

echo "Step 3: Loading data into PostgreSQL..."
# Exclude contenttypes and permissions which often conflict during loaddata
python3 manage.py shell -c "
from django.contrib.contenttypes.models import ContentType
ContentType.objects.all().delete()
"

python3 manage.py loaddata datadump.json

if [ $? -eq 0 ]; then
    echo "Migration completed successfully!"
    echo "You can now safely delete datadump.json and db.sqlite3 after confirming everything works."
else
    echo "Data load failed. Please review the errors above."
fi
