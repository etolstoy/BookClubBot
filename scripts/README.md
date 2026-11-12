# BookClub Bot Scripts

Maintenance and utility scripts for the BookClub bot.

## Build book collections

Collections are stored in SQLite: `book_collections` contains descriptions and display
order, `collection_works` contains curated metadata and optional links to native books,
and `collection_entries` contains membership, positions, mentions, votes and scores.
The API reads these tables on every request. Editing or adding records takes effect
without rebuilding or restarting the app; use Prisma Studio or a database client.
Deleting a collection removes its memberships while preserving books and reviews.
Deleting a native book clears its curated link while preserving curated metadata.

Run `npx prisma migrate deploy` to create the tables and import the initial 10
collections, 141 works and 160 positions. This import runs once, as a data migration;
subsequent deploys preserve database edits. Back up an existing database first.
`npm run collections:link` fills missing native book links using ISBN and title/author
matching. It preserves existing manual links and all edited collection fields.
Docker runs migration and linking before starting the bot. Read requests can also
recognize newly added native books without changing the database.

Run `npm run collections:build` to regenerate an offline seed snapshot from
`reports/vas3k-books/catalog.json` and the previously downloaded covers in
`data/vas3k-books/covers/`. This command works locally and makes no paid API calls.
The optional raw registry supplies alternate author spellings for catalogue matching.

The score is `M + 0.2 * log2(1 + V)`, where `M` counts different messages with a
positive opinion and `V` sums comment votes divided by the number of works in each
comment. Votes on the original topic are excluded. For the antirecommendations
collection, the same formula counts negative opinions. Neutral references, plans,
unresolved metadata, and unspecified series are excluded. Only books with a title,
author, valid ISBN, and a verified cover enter a collection.

Collections start at 15 books. They expand to 20 only if at least 20 eligible books
exist, the score spread between positions 16 and 20 is at least 0.10, and position 20
beats position 21 by at least 0.05 (if position 21 exists). These thresholds avoid
expanding a flat bracket or making a cutoff through tied or almost tied scores.
With the same mention count, the thresholds represent about 41% and 19% differences
in `1 + V`, respectively. They are practical selection rules, not significance tests.
`reports/collections-ranking/expansion.json` records the decision and positions 16–21
for every category. On the current snapshot, life-changing books and best-of-2023
expand to 20; the other eight lists stay at 15. No displayed votes or scores are added.

The coefficient and selection thresholds are defined in `src/lib/collection-ranking.ts`. The generator compares
weights 0, 0.15, 0.2, 0.25, 0.35, 0.5, and 1 and writes the full comparison to
`reports/collections-ranking/comparison.json`. At 0.2, replacing one additional
recommendation requires a 32-fold increase in `1 + V`. On the current data this
keeps the same top-15 membership as mention-first ordering in nine categories,
and replaces one book in the science collection. Larger weights bring more
single-recommendation books into the lists.

The generated `scripts/data/book-collections-seed.json` is an offline import/audit
artifact; rebuilding it does not overwrite live database edits. Runtime requests do
not read it. Cover images are packaged in `mini-app/public/collection-covers/`, with
their paths stored in the database. Report exports and extraction caches are not
needed in production. Matching uses normalized ISBN (including ISBN-10/13), then
title/author aliases or a strong, unambiguous title and author match. The generator
also contains two reviewed catalogue variants: the alternate Seven Deaths title and
the Pokrov-17 author typo (the existing review itself identifies Alexander Pelevin).
The latter is corrected in the detail response without changing stored review data.
Books absent from the database use the same book page component with zero reviews.
Both kinds of book page list their collection memberships above the reviews.
The initial migration inserts curated works separately; native books and reviews
are not inserted or changed by the collection import.

The API also provides relative popularity as `100 * score / highestScoreInCollection`,
rounded to one decimal. The cards display only the position and native review count;
votes and scores are used internally for ranking. The home tiles occupy one
horizontally scrolling row, and the source
topic link sits in the collection description card.

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
