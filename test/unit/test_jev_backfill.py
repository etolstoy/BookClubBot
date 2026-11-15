import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('backfill', Path(__file__).resolve().parents[2] / 'scripts/apply-jev-sentiments.py')
backfill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backfill)


class BackfillTests(unittest.TestCase):
    def test_backup_edit_checks_nulls_and_preserving_other_columns(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            db = root / 'db.sqlite'
            with sqlite3.connect(db) as conn:
                conn.execute('CREATE TABLE reviews (id INTEGER PRIMARY KEY, book_id INTEGER, review_text TEXT, sentiment TEXT, reviewed_at TEXT)')
                conn.executemany('INSERT INTO reviews VALUES (?,?,?,?,?)', [
                    (1, 10, 'great', 'neutral', '2026-01-01'),
                    (2, 10, 'new edit', 'positive', '2026-01-01'),
                    (3, 10, 'plot', 'positive', '2026-01-01'),
                    (4, 10, 'new review', 'negative', '2026-01-01'),
                ])
            rows = [{'review_id': i, 'book_id': 10, 'review_text': text, 'stored_sentiment': old,
                     'actual': new, 'model': 'jev-1.14.0', 'error': None}
                    for i, text, old, new in [(1, 'great', 'neutral', 'positive'),
                                              (2, 'old text', 'neutral', 'negative'),
                                              (3, 'plot', 'positive', None)]]
            report = root / 'report.json'
            report.write_text(json.dumps({'model': 'jev-1.14.0', 'rubricVersion': 'v2',
                                         'summary': {'completed': 3}, 'errors': [], 'results': rows}))
            dry = backfill.apply_report(db, report, root / 'audit')
            self.assertEqual(len(dry['changes']), 2)
            self.assertFalse(dry['committed'])
            result = backfill.apply_report(db, report, root / 'audit', apply=True)
            self.assertTrue(result['committed'])
            self.assertEqual(len(result['skipped']), 1)
            with sqlite3.connect(db) as conn:
                self.assertEqual(conn.execute('SELECT sentiment FROM reviews ORDER BY id').fetchall(),
                                 [('positive',), ('positive',), (None,), ('negative',)])
                self.assertEqual(conn.execute('SELECT count(*) FROM reviews WHERE reviewed_at=?', ('2026-01-01',)).fetchone()[0], 4)
            with sqlite3.connect(result['backup']) as conn:
                self.assertEqual(conn.execute('SELECT sentiment FROM reviews WHERE id=1').fetchone()[0], 'neutral')
            self.assertTrue(json.loads(Path(result['auditPath']).read_text())['committed'])

    def test_invalid_predictions_do_not_modify_database(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            db = root / 'db.sqlite'
            db.touch()
            report = root / 'report.json'
            report.write_text(json.dumps({'model': 'wrong', 'rubricVersion': 'v2', 'errors': [],
                                         'summary': {'completed': 0}, 'results': []}))
            with self.assertRaises(ValueError):
                backfill.apply_report(db, report, root / 'audit', apply=True)
            self.assertEqual(db.stat().st_size, 0)


if __name__ == '__main__':
    unittest.main()
