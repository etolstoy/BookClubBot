# BookClub Bot Scripts

Maintenance and utility scripts for the BookClub bot.

## Database Restoration

### restore-backup.sh

Restore database from a backup file with automatic verification and current database backup.

#### Usage

**Interactive mode** (recommended):
```bash
./scripts/restore-backup.sh
```

Shows a list of all available backups and prompts you to select one by number.

**Non-interactive mode** (select by number):
```bash
./scripts/restore-backup.sh 1
```

Restores the first backup from the list without prompting.

**Direct file path**:
```bash
./scripts/restore-backup.sh data/bookclub.db.prod_backup_20260122
```

Restores a specific backup file directly.

#### Features

- ✅ Lists all available backups from `data/` and `prisma/data/` directories
- ✅ Shows file size and modification date for each backup
- ✅ Verifies backup integrity before restoration
- ✅ Creates automatic backup of current database before restoring
- ✅ Restores to correct location (`prisma/data/bookclub.db`)
- ✅ Verifies restored database (integrity check + record counts)
- ✅ Cleans up leftover journal/WAL files
- ✅ Color-coded output for easy reading

#### Example Output

```
=== BookClub Database Backup Restoration ===

Available backups:

  [1] data/bookclub.db.prod_backup_20260122
      Size: 7.6M | Date: 2026-01-22 12:44:14
  [2] data/bookclub.db.local_backup_jan11
      Size: 4.3M | Date: 2026-01-21 19:40:06

Enter backup number (or 'q' to quit): 1

Selected backup: data/bookclub.db.prod_backup_20260122

Verifying database...
✓ Database verified
  Books: 616
  Reviews: 703

Backing up current database...
✓ Current database backed up to: prisma/data/bookclub.db.before_restore_20260130_134630

Restoring database...
✓ Database restored successfully

Verifying database...
✓ Database verified
  Books: 616
  Reviews: 703

=== Restoration Complete ===

Note: If the server is running, restart it to apply changes:
  npm run dev
```

#### Important Notes

- Always restart the server after restoration: `npm run dev`
- The script automatically backs up your current database before restoring
- Backup files are named with timestamps: `bookclub.db.before_restore_YYYYMMDD_HHMMSS`
- The script verifies both the source backup and restored database for safety

## Creating Manual Backups

To create a manual backup:

```bash
cp prisma/data/bookclub.db prisma/data/bookclub.db.manual_backup_$(date +%Y%m%d_%H%M%S)
```

Or use a descriptive name:

```bash
cp prisma/data/bookclub.db data/bookclub.db.before_feature_x
```

## Troubleshooting

### "No backup files found"
Make sure you have backup files with `.backup` in the filename or matching the pattern `*.db.*` in either `data/` or `prisma/data/` directories.

### "Database integrity check failed"
The backup file may be corrupted. Try a different backup.

### Changes not showing in bot
Make sure to restart the server after restoration:
```bash
npm run dev
```

### Permission denied
Make the script executable:
```bash
chmod +x scripts/restore-backup.sh
```
