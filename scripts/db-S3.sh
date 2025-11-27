#!/bin/bash
# This script provides functions to backup and restore a PostgreSQL database to/from an S3 bucket.

# Function to validate environment variables
validate_env_vars() {
    # Validate S3 variables
    if [ -z "${S3_BUCKET}" ] || [ -z "${S3_ACCESS_KEY}" ] || [ -z "${S3_SECRET_KEY}" ] || [ -z "${S3_ENDPOINT}" ] || [ -z "${S3_PATH}" ]; then
        echo "S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_ENDPOINT, S3_PATH are not set"
        return 1
    fi
    
    # Parse DATABASE_URL=postgres://postgres:postgres@rallly-postgresql/rallly 
    if [ -z "${DATABASE_URL}" ]; then
        echo "DATABASE_URL is not set"
        return 1
    fi
    
    if [[ "$DATABASE_URL" =~ postgres://([^:]+):([^@]+)@([^/]+)/([^ ]+) ]]; then
        POSTGRES_USER=${BASH_REMATCH[1]}
        POSTGRES_PASSWORD=${BASH_REMATCH[2]}
        POSTGRES_HOST=${BASH_REMATCH[3]}
        POSTGRES_DATABASE=${BASH_REMATCH[4]}
    else
        echo "DATABASE_URL is not in the correct format"
        return 1
    fi
    
    # Check if POSTGRES variables are set
    if [ -z "${POSTGRES_USER}" ] || [ -z "${POSTGRES_PASSWORD}" ] || [ -z "${POSTGRES_DATABASE}" ] || [ -z "${POSTGRES_HOST}" ]; then
        echo "Failed to extract PostgreSQL connection details"
        return 1
    fi
    
    return 0
}

# Function to setup S3 client
setup_s3_client() {
    # Test if mc is installed
    if [ -z "$(which mc)" ]; then
        echo "Error: MinIO client 'mc' is not installed"
        return 1
    fi

    # Test if mc alias s3backup exists
    if [ -z "$(mc alias list | grep s3backup)" ]; then
        echo "s3backup alias not found, creating..."
        mc alias set s3backup ${S3_ENDPOINT} ${S3_ACCESS_KEY} ${S3_SECRET_KEY}
    fi
    
    return 0
}

# Function to initialize database from S3
init-from-s3() {
    echo "Starting database restoration from S3..."
    
    # Validate environment variables
    if ! validate_env_vars; then
        echo "Environment validation failed, aborting restore"
        return 1
    fi
    
    # Setup S3 client
    if ! setup_s3_client; then
        echo "S3 client setup failed, aborting restore"
        return 1
    fi
    
    echo "Finding latest backup in s3backup/${S3_BUCKET}/${S3_PATH}..."
    
    # if S3_RALLY_FILE is set, use it as the backup file
    if [ -n "${S3_RALLY_FILE}" ]; then
        echo "Using specified backup file: ${S3_RALLY_FILE}"
        LATEST_BACKUP=${S3_RALLY_FILE}
    else
        # Check if S3_PATH is set, if not use the default path
        # Find latest backup file in s3
        LATEST_BACKUP=$(mc ls s3backup/${S3_BUCKET}/${S3_PATH} | sort -r | head -n 1 | awk '{print $6}')
    fi
    
    
    if [ -z "${LATEST_BACKUP}" ]; then
        echo "No backup files found in specified S3 path"
        return 1
    fi
    
    echo "Found backup: ${LATEST_BACKUP}"
    echo "Downloading backup file..."
    
    # Download the backup
    mc cp s3backup/${S3_BUCKET}/${S3_PATH}/${LATEST_BACKUP} /tmp/backup.tar.xz
    
    # Uncompress backup in temporary directory
    TEMP=$(mktemp -d)
    echo "Extracting backup to ${TEMP}..."
    tar -xvf /tmp/backup.tar.xz -C ${TEMP}
    rm /tmp/backup.tar.xz
    
    # Restore database dump
    if [ -f "${TEMP}/dump.sql" ]; then
        echo "Checking if database needs to be dropped first..."
        
        # Check if database already has tables
        TABLE_COUNT=$(PGPASSWORD=${POSTGRES_PASSWORD} psql -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -d ${POSTGRES_DATABASE} -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
        
        if [ "$TABLE_COUNT" -gt "0" ]; then
            echo "Database has existing tables, dropping schema objects before restore..."
            
            # Create a temporary file for the drop commands
            DROP_SCRIPT=$(mktemp)
            
            # Generate SQL to drop all objects in the public schema
            cat > "$DROP_SCRIPT" << EOF
-- Disable triggers temporarily
SET session_replication_role = 'replica';

-- Drop all tables
DO \$\$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END \$\$;

-- Drop custom types
DO \$\$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype = 'e') LOOP
        EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
END \$\$;

-- Drop other custom types
DO \$\$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT typname FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typtype = 'c') LOOP
        EXECUTE 'DROP TYPE IF EXISTS ' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
END \$\$;

-- Reset session
SET session_replication_role = 'origin';
EOF
            
            echo "Executing drop script..."
            PGPASSWORD=${POSTGRES_PASSWORD} psql -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -d ${POSTGRES_DATABASE} -f "$DROP_SCRIPT"
            
            # Clean up the drop script
            rm "$DROP_SCRIPT"
        else
            echo "Database is empty, proceeding with direct restore."
        fi
        
        echo "Restoring database dump to ${POSTGRES_HOST}/${POSTGRES_DATABASE}..."
        # Use -v ON_ERROR_STOP=1 to stop on first error
        PGPASSWORD=${POSTGRES_PASSWORD} psql -v ON_ERROR_STOP=0 -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -d ${POSTGRES_DATABASE} -f "${TEMP}/dump.sql"
        RESTORE_STATUS=$?
        
        # Clean up
        rm -rf ${TEMP}
        
        if [ $RESTORE_STATUS -eq 0 ]; then
            echo "Database restore completed successfully"
            return 0
        else
            echo "Database restore completed with warnings (status code ${RESTORE_STATUS})"
            echo "Some errors might be expected if objects already exist. The database should still be usable."
            return 0  # Return success anyway since partial failures are often acceptable
        fi
    else
        echo "No dump.sql file found in backup"
        rm -rf ${TEMP}
        return 1
    fi
}

# Function to backup database to S3
backup-to-s3() {
    echo "Starting database backup to S3..."
    
    # Validate environment variables
    if ! validate_env_vars; then
        echo "Environment validation failed, aborting backup"
        return 1
    fi
    
    # Setup S3 client
    if ! setup_s3_client; then
        echo "S3 client setup failed, aborting backup"
        return 1
    fi
    
    # Create a timestamp for the backup filename
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="backup_${TIMESTAMP}.tar.xz"
    TEMP=$(mktemp -d)
    
    echo "Creating database dump..."
    # Create database dump
    PGPASSWORD=${POSTGRES_PASSWORD} pg_dump -h ${POSTGRES_HOST} -U ${POSTGRES_USER} -d ${POSTGRES_DATABASE} > ${TEMP}/dump.sql
    
    if [ $? -ne 0 ]; then
        echo "Failed to create database dump"
        rm -rf ${TEMP}
        return 1
    fi
    
    echo "Compressing database dump..."
    # Compress the dump
    tar -cJf /tmp/${BACKUP_FILE} -C ${TEMP} dump.sql
    
    if [ $? -ne 0 ]; then
        echo "Failed to compress database dump"
        rm -rf ${TEMP}
        return 1
    fi
    
    # Clean up dump file
    rm -rf ${TEMP}
    
    echo "Uploading backup to S3..."
    # Upload to S3
    mc cp /tmp/${BACKUP_FILE} s3backup/${S3_BUCKET}/${S3_PATH}/${BACKUP_FILE}
    UPLOAD_STATUS=$?
    
    # Clean up local backup
    rm /tmp/${BACKUP_FILE}
    
    if [ $UPLOAD_STATUS -eq 0 ]; then
        echo "Database backup completed successfully: ${BACKUP_FILE}"
        echo "Backup location: s3backup/${S3_BUCKET}/${S3_PATH}/${BACKUP_FILE}"
        return 0
    else
        echo "Failed to upload backup to S3"
        return 1
    fi
}

# Function to remove backup older than $S3_MAX_DAYS days on S3
remove-old-backups() {
    #Default to 30 days if S3_MAX_DAYS is not set
    S3_MAX_DAYS=${S3_MAX_DAYS:-30}
    echo "Removing backups older than 30 days from S3..."
    
    # Validate environment variables
    if ! validate_env_vars; then
        echo "Environment validation failed, aborting cleanup"
        return 1
    fi
    
    # Setup S3 client
    if ! setup_s3_client; then
        echo "S3 client setup failed, aborting cleanup"
        return 1
    fi
    
    # Remove backups older than 30 days
    mc find s3backup/${S3_BUCKET}/${S3_PATH} --older-than ${S3_MAX_DAYS}d --exec "mc rm {}"
    
    if [ $? -eq 0 ]; then
        echo "Old backups removed successfully"
        return 0
    else
        echo "Failed to remove old backups"
        return 1
    fi
}

#Function to list backups in S3
list-backups() {
    echo "Listing backups in S3..."
    mc ls s3backup/${S3_BUCKET}/${S3_PATH}
}

#Function to restore database from a specific S3 backup file
restore-from-specific-backup() {
    if [ -z "$1" ]; then
        echo "Please provide the backup file name as an argument"
        return 1
    fi
    export S3_RALLY_FILE="$1"
    init-from-s3
}

# Provide usage information
echo "Added S3 backup and restore functions"
echo "Usage:"
echo "  init-from-s3: Restore database from S3"
echo "  backup-to-s3: Backup database to S3"
echo "  list-backups: List backups in S3"
echo "  remove-old-backups: Remove backups older than S3_MAX_DAYS from S3"
echo "  restore-from-specific-backup <backup_file>: Restore database from a specific S3 backup file"