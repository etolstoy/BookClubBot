#!/usr/bin/env python3
"""Apply an approved Jev report with a SQLite backup and optimistic edit checks.

Dry run by default. Stop review writers before --apply; keep the audit and backup.
"""
import argparse
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def apply_report(database, report_path, output_dir, apply=False):
    database, report_path, output_dir = map(Path, (database, report_path, output_dir))
    if not database.is_file():
        raise ValueError('Database does not exist')
    raw = report_path.read_bytes()
    report = json.loads(raw)
    rows = report['results']
    if (report['model'] != 'jev-1.14.0' or report['rubricVersion'] != 'v2'
            or report.get('errors') or report['summary']['completed'] != len(rows)
            or len({r['review_id'] for r in rows}) != len(rows)):
        raise ValueError('Report is incomplete, duplicated, or uses an unapproved model/rubric')
    for row in rows:
        if (row.get('error') or row.get('model') != report['model']
                or row['actual'] not in ('positive', 'neutral', 'negative', None)):
            raise ValueError('Invalid prediction')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    audit = {'reportSha256': hashlib.sha256(raw).hexdigest(), 'createdAt': stamp,
             'committed': False, 'changes': [], 'skipped': [], 'unchanged': 0}
    connection = sqlite3.connect(database, timeout=30)
    connection.row_factory = sqlite3.Row
    try:
        if apply:
            output_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
            backup = output_dir / f'bookclub-before-jev-{stamp}.db'
            with sqlite3.connect(backup) as dest:
                connection.backup(dest)
                if dest.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('Backup integrity check failed')
            os.chmod(backup, 0o600)
            audit['backup'] = str(backup)
        connection.execute('BEGIN IMMEDIATE' if apply else 'BEGIN')
        before = [tuple(r) for r in connection.execute('SELECT * FROM reviews ORDER BY id')]
        columns = [r[1] for r in connection.execute('PRAGMA table_info(reviews)')]
        sentiment_index = columns.index('sentiment')
        for row in rows:
            current = connection.execute('SELECT * FROM reviews WHERE id=?', (row['review_id'],)).fetchone()
            if current is None:
                audit['skipped'].append({'id': row['review_id'], 'reason': 'deleted'})
                continue
            if (current['review_text'] != row['review_text']
                    or current['book_id'] != row['book_id']
                    or current['sentiment'] != row['stored_sentiment']):
                audit['skipped'].append({'id': row['review_id'], 'reason': 'edited since snapshot'})
                continue
            if row['actual'] == current['sentiment']:
                audit['unchanged'] += 1
                continue
            audit['changes'].append({'id': row['review_id'], 'before': current['sentiment'],
                                     'after': row['actual'],
                                     'textSha256': hashlib.sha256(row['review_text'].encode()).hexdigest()})
            if apply:
                connection.execute('UPDATE reviews SET sentiment=? WHERE id=?', (row['actual'], row['review_id']))
        if apply:
            after = [tuple(r) for r in connection.execute('SELECT * FROM reviews ORDER BY id')]
            strip = lambda values: [r[:sentiment_index] + r[sentiment_index + 1:] for r in values]
            if strip(before) != strip(after):
                raise ValueError('Non-sentiment review data changed; refusing to commit')
            if connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Database integrity check failed')
            audit_path = output_dir / f'jev-backfill-{stamp}.json'
            audit['auditPath'] = str(audit_path)
            audit_path.write_text(json.dumps(audit, indent=2) + '\n')
            os.chmod(audit_path, 0o600)
            connection.commit()
            audit['committed'] = True
            audit_path.write_text(json.dumps(audit, indent=2) + '\n')
        else:
            connection.rollback()
        return audit
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database')
    parser.add_argument('report')
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    result = apply_report(args.database, args.report, args.output_dir, args.apply)
    print(json.dumps({**{k: v for k, v in result.items() if k not in ('changes', 'skipped')},
                      'changedCount': len(result['changes']), 'skipped': result['skipped']}))
