#!/bin/bash
# backend/db_backup.sh
# Script to dump PostgreSQL database and upload to AWS S3

# Load environment variables from .env
if [ -f .env ]; then
    export $(cat .env | sed 's/#.*//g' | xargs)
fi

BACKUP_DIR="/tmp/db_backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="backup_${DB_NAME}_${TIMESTAMP}.sql"

mkdir -p $BACKUP_DIR

echo "Starting database backup..."
PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME > $BACKUP_DIR/$BACKUP_FILE

if [ $? -eq 0 ]; then
    echo "Database backup successful: $BACKUP_FILE"
    
    # Upload to S3 if USE_AWS_S3 is enabled
    if [ "$USE_AWS_S3" = "True" ]; then
        echo "Uploading to S3 bucket: $AWS_STORAGE_BUCKET_NAME..."
        
        # We can use python to upload via boto3 since AWS CLI might not be installed
        python3 -c "
import boto3, os
s3 = boto3.client('s3', 
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'), 
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
    region_name=os.environ.get('AWS_S3_REGION_NAME', 'us-east-1')
)
file_path = os.path.join('$BACKUP_DIR', '$BACKUP_FILE')
s3.upload_file(file_path, os.environ.get('AWS_STORAGE_BUCKET_NAME'), f'database_backups/{$BACKUP_FILE}')
print('Upload complete!')
"
        if [ $? -eq 0 ]; then
            echo "Uploaded successfully. Cleaning up local file..."
            rm $BACKUP_DIR/$BACKUP_FILE
        else
            echo "Failed to upload to S3."
        fi
    fi
else
    echo "Database backup failed."
fi
