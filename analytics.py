"""
analytics.py — First-Party Analytics Engine (SQLite)

Handles all read/write operations for the self-hosted tracking system.
No external services — everything stays on the local server.
"""

import sqlite3
import os
from datetime import datetime
from contextlib import contextmanager

DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DB_PATH = os.path.join(DB_DIR, 'analytics.db')


@contextmanager
def get_db():
    """Context manager for safe SQLite connections."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    """Create tables if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS pageviews (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   TEXT    NOT NULL,
                path        TEXT    NOT NULL,
                session_id  TEXT,
                user_agent  TEXT,
                referrer    TEXT,
                ip          TEXT
            );

            CREATE TABLE IF NOT EXISTS category_hits (
                category    TEXT PRIMARY KEY,
                count       INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS clickstreams (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  TEXT    NOT NULL,
                path_chain  TEXT    NOT NULL,
                updated_at  TEXT    NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_pv_path ON pageviews(path);
            CREATE INDEX IF NOT EXISTS idx_pv_session ON pageviews(session_id);
            CREATE INDEX IF NOT EXISTS idx_pv_ts ON pageviews(timestamp);
            CREATE INDEX IF NOT EXISTS idx_cs_session ON clickstreams(session_id);
        """)


# ──────────────────────────────────────────
#  WRITE operations
# ──────────────────────────────────────────

def log_pageview(path, session_id=None, user_agent=None, referrer=None, ip=None):
    """Record a single page view."""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO pageviews (timestamp, path, session_id, user_agent, referrer, ip) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (datetime.now().isoformat(), path, session_id, user_agent, referrer, ip)
        )


def log_category(category):
    """Increment the hit counter for a news category."""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO category_hits (category, count) VALUES (?, 1) "
            "ON CONFLICT(category) DO UPDATE SET count = count + 1",
            (category,)
        )


def update_clickstream(session_id, path_chain):
    """Upsert the clickstream path for a session."""
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM clickstreams WHERE session_id = ?",
            (session_id,)
        ).fetchone()

        if existing:
            conn.execute(
                "UPDATE clickstreams SET path_chain = ?, updated_at = ? WHERE session_id = ?",
                (path_chain, datetime.now().isoformat(), session_id)
            )
        else:
            conn.execute(
                "INSERT INTO clickstreams (session_id, path_chain, updated_at) VALUES (?, ?, ?)",
                (session_id, path_chain, datetime.now().isoformat())
            )


# ──────────────────────────────────────────
#  READ operations (for dashboard)
# ──────────────────────────────────────────

def get_total_pageviews():
    """Return the total number of recorded page views."""
    with get_db() as conn:
        row = conn.execute("SELECT COUNT(*) as total FROM pageviews").fetchone()
        return row['total'] if row else 0


def get_unique_sessions():
    """Return count of unique sessions."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT COUNT(DISTINCT session_id) as total FROM pageviews WHERE session_id IS NOT NULL"
        ).fetchone()
        return row['total'] if row else 0


def get_pageview_stats():
    """Return page view counts grouped by route, sorted descending."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT path, COUNT(*) as hits FROM pageviews "
            "GROUP BY path ORDER BY hits DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def get_category_stats():
    """Return category hit counts, sorted descending."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT category, count FROM category_hits ORDER BY count DESC"
        ).fetchall()
        return [dict(r) for r in rows]


def get_clickstreams(limit=20):
    """Return recent clickstream sessions."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT session_id, path_chain, updated_at FROM clickstreams "
            "ORDER BY updated_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_recent_views(limit=30):
    """Return the most recent raw pageview entries."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT timestamp, path, session_id, user_agent, referrer, ip "
            "FROM pageviews ORDER BY id DESC LIMIT ?",
            (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_hourly_distribution():
    """Return pageview counts grouped by hour of day (0-23)."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as hits "
            "FROM pageviews GROUP BY hour ORDER BY hour"
        ).fetchall()

        # Fill in missing hours with zero
        dist = {i: 0 for i in range(24)}
        for r in rows:
            dist[r['hour']] = r['hits']
        return dist


def get_top_page():
    """Return the most-visited page path."""
    stats = get_pageview_stats()
    return stats[0]['path'] if stats else '—'


def get_top_category():
    """Return the most-requested news category."""
    stats = get_category_stats()
    return stats[0]['category'] if stats else '—'
