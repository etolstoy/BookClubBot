#!/bin/bash

# Database Backup Restoration Script
# Usage: ./scripts/restore-backup.sh [backup-file]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Database paths
DB_PATH="prisma/data/bookclub.db"
BACKUP_DIRS=("data" "prisma/data")

echo -e "${BLUE}=== BookClub Database Backup Restoration ===${NC}\n"

# Function to list all backups
list_backups() {
  echo -e "${YELLOW}Available backups:${NC}\n"

  local found=false
  local count=1

  for dir in "${BACKUP_DIRS[@]}"; do
    if [ -d "$dir" ]; then
      while IFS= read -r file; do
        if [ -f "$file" ]; then
          found=true
          size=$(du -h "$file" | cut -f1)
          date=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d'.' -f1)
          echo -e "  ${GREEN}[$count]${NC} $file"
          echo -e "      Size: $size | Date: $date"
          count=$((count + 1))
        fi
      done < <(find "$dir" -maxdepth 1 -name "*.db*" -type f ! -name "*.db-journal" ! -name "*.db-wal" ! -name "*.db-shm" | grep -E "\.(backup|db\.)" | sort -r)
    fi
  done

  if [ "$found" = false ]; then
    echo -e "${RED}No backup files found${NC}"
    exit 1
  fi

  echo ""
}

# Function to get backup file by number
get_backup_by_number() {
  local num=$1
  local count=1

  for dir in "${BACKUP_DIRS[@]}"; do
    if [ -d "$dir" ]; then
      while IFS= read -r file; do
        if [ -f "$file" ]; then
          if [ "$count" -eq "$num" ]; then
            echo "$file"
            return 0
          fi
          count=$((count + 1))
        fi
      done < <(find "$dir" -maxdepth 1 -name "*.db*" -type f ! -name "*.db-journal" ! -name "*.db-wal" ! -name "*.db-shm" | grep -E "\.(backup|db\.)" | sort -r)
    fi
  done

  return 1
}

# Function to verify database
verify_database() {
  local db=$1

  echo -e "${YELLOW}Verifying database...${NC}"

  if ! sqlite3 "$db" "PRAGMA integrity_check;" > /dev/null 2>&1; then
    echo -e "${RED}✗ Database integrity check failed${NC}"
    return 1
  fi

  local books=$(sqlite3 "$db" "SELECT COUNT(*) FROM books;" 2>/dev/null || echo "0")
  local reviews=$(sqlite3 "$db" "SELECT COUNT(*) FROM reviews;" 2>/dev/null || echo "0")

  echo -e "${GREEN}✓ Database verified${NC}"
  echo -e "  Books: $books"
  echo -e "  Reviews: $reviews"
  echo ""

  return 0
}

# Main script
main() {
  local backup_file=""

  # If argument provided, use it
  if [ -n "$1" ]; then
    if [[ "$1" =~ ^[0-9]+$ ]]; then
      # Argument is a number
      list_backups
      backup_file=$(get_backup_by_number "$1")
      if [ -z "$backup_file" ]; then
        echo -e "${RED}Invalid backup number${NC}"
        exit 1
      fi
    else
      # Argument is a file path
      backup_file="$1"
    fi
  else
    # Interactive mode
    list_backups

    echo -e "${YELLOW}Enter backup number (or 'q' to quit):${NC} "
    read -r selection

    if [ "$selection" = "q" ] || [ "$selection" = "Q" ]; then
      echo "Cancelled"
      exit 0
    fi

    if ! [[ "$selection" =~ ^[0-9]+$ ]]; then
      echo -e "${RED}Invalid selection${NC}"
      exit 1
    fi

    backup_file=$(get_backup_by_number "$selection")
    if [ -z "$backup_file" ]; then
      echo -e "${RED}Invalid backup number${NC}"
      exit 1
    fi
  fi

  # Verify backup file exists
  if [ ! -f "$backup_file" ]; then
    echo -e "${RED}Backup file not found: $backup_file${NC}"
    exit 1
  fi

  echo -e "${BLUE}Selected backup:${NC} $backup_file"
  echo ""

  # Verify the backup before restoring
  if ! verify_database "$backup_file"; then
    echo -e "${RED}Backup file is corrupted or invalid${NC}"
    exit 1
  fi

  # Create backup of current database
  if [ -f "$DB_PATH" ]; then
    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_name="${DB_PATH}.before_restore_${timestamp}"

    echo -e "${YELLOW}Backing up current database...${NC}"
    cp "$DB_PATH" "$backup_name"
    echo -e "${GREEN}✓ Current database backed up to:${NC} $backup_name"
    echo ""
  else
    echo -e "${YELLOW}No current database found, skipping backup${NC}"
    echo ""
  fi

  # Ensure target directory exists
  mkdir -p "$(dirname "$DB_PATH")"

  # Restore the backup
  echo -e "${YELLOW}Restoring database...${NC}"
  cp "$backup_file" "$DB_PATH"

  # Remove any leftover journal/wal files
  rm -f "${DB_PATH}-journal" "${DB_PATH}-wal" "${DB_PATH}-shm"

  echo -e "${GREEN}✓ Database restored successfully${NC}"
  echo ""

  # Verify the restored database
  verify_database "$DB_PATH"

  echo -e "${GREEN}=== Restoration Complete ===${NC}"
  echo ""
  echo -e "${YELLOW}Note:${NC} If the server is running, restart it to apply changes:"
  echo -e "  npm run dev"
}

main "$@"
