"""
app.py — Flask News Feed with First-Party Analytics

Routes:
  /                    → Home feed (latest news)
  /category/<name>     → Filtered news by category
  /dashboard           → Internal analytics dashboard

Tracking:
  @app.before_request hook logs every page view to SQLite.
  Flask session stores clickstream path for each visitor.
"""

import os
import uuid
import requests as http_requests
from datetime import datetime
from flask import Flask, render_template, request, session, redirect, url_for
from dotenv import load_dotenv
import analytics

# ──────────────────────────────────────────
#  Configuration
# ──────────────────────────────────────────

load_dotenv()

app = Flask(__name__)
app.secret_key = os.urandom(24).hex()

NEWSDATA_API_KEY = os.getenv('NEWSDATA_API_KEY', '')
NEWSDATA_BASE_URL = 'https://newsdata.io/api/1/latest'

# Supported news categories for the sidebar
CATEGORIES = [
    'top', 'business', 'technology', 'entertainment',
    'health', 'science', 'sports', 'politics',
    'environment', 'food', 'world'
]

# Initialize the analytics database
analytics.init_db()


# ──────────────────────────────────────────
#  First-Party Tracking (before_request hook)
# ──────────────────────────────────────────

@app.before_request
def track_request():
    """Log every page request and maintain clickstream session data."""
    # Skip static file requests and favicon
    if request.path.startswith('/static') or request.path == '/favicon.ico':
        return

    # Assign a session ID if not already set
    if 'sid' not in session:
        session['sid'] = str(uuid.uuid4())[:8]
        session['clickstream'] = []

    # Log the page view
    analytics.log_pageview(
        path=request.path,
        session_id=session.get('sid'),
        user_agent=request.headers.get('User-Agent', ''),
        referrer=request.headers.get('Referer', 'Direct'),
        ip=request.remote_addr
    )

    # Update clickstream (ordered list of pages visited this session)
    clickstream = session.get('clickstream', [])
    clickstream.append(request.path)
    # Keep last 50 entries to avoid session bloat
    session['clickstream'] = clickstream[-50:]

    # Persist clickstream to database
    analytics.update_clickstream(
        session_id=session['sid'],
        path_chain=' → '.join(session['clickstream'])
    )


# ──────────────────────────────────────────
#  News Data API Helper
# ──────────────────────────────────────────

def fetch_news(category=None):
    """
    Fetch latest news articles from the News Data API.
    Returns a list of article dicts or an empty list on failure.
    """
    if not NEWSDATA_API_KEY or NEWSDATA_API_KEY == 'paste_your_key_here':
        return [], 'API key not configured. Please add your key to the .env file.'

    params = {
        'apikey': NEWSDATA_API_KEY,
        'language': 'en',
    }
    if category and category != 'top':
        params['category'] = category

    try:
        resp = http_requests.get(NEWSDATA_BASE_URL, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if data.get('status') == 'success':
            articles = data.get('results', [])
            # Clean up articles — ensure required fields exist
            cleaned = []
            for a in articles:
                cleaned.append({
                    'title': a.get('title', 'Untitled'),
                    'description': a.get('description', ''),
                    'link': a.get('link', '#'),
                    'source_name': a.get('source_name', 'Unknown'),
                    'source_icon': a.get('source_icon', ''),
                    'image_url': a.get('image_url', ''),
                    'pubDate': a.get('pubDate', ''),
                    'category': a.get('category', []),
                    'creator': a.get('creator', []),
                })
            return cleaned, None
        else:
            return [], data.get('results', {}).get('message', 'API returned an error.')

    except http_requests.exceptions.Timeout:
        return [], 'Request timed out. Please try again.'
    except http_requests.exceptions.ConnectionError:
        return [], 'Could not connect to the News API. Check your internet connection.'
    except http_requests.exceptions.RequestException as e:
        return [], f'API request failed: {str(e)}'
    except (ValueError, KeyError) as e:
        return [], f'Failed to parse API response: {str(e)}'


# ──────────────────────────────────────────
#  Routes
# ──────────────────────────────────────────

@app.route('/')
def index():
    """Home page — show latest news articles."""
    articles, error = fetch_news()
    return render_template(
        'index.html',
        articles=articles,
        error=error,
        categories=CATEGORIES,
        active_category='top',
        page_title='Latest News'
    )


@app.route('/category/<category_name>')
def category(category_name):
    """Filtered news feed for a specific category."""
    if category_name not in CATEGORIES:
        return redirect(url_for('index'))

    # Track the category hit
    analytics.log_category(category_name)

    articles, error = fetch_news(category=category_name)
    return render_template(
        'category.html',
        articles=articles,
        error=error,
        categories=CATEGORIES,
        active_category=category_name,
        page_title=f'{category_name.title()} News'
    )


@app.route('/dashboard')
def dashboard():
    """Internal analytics dashboard — displays all tracked data."""
    # Gather analytics data
    total_views = analytics.get_total_pageviews()
    unique_sessions = analytics.get_unique_sessions()
    top_page = analytics.get_top_page()
    top_category = analytics.get_top_category()
    page_stats = analytics.get_pageview_stats()
    category_stats = analytics.get_category_stats()
    clickstreams = analytics.get_clickstreams(limit=15)
    recent_views = analytics.get_recent_views(limit=25)
    hourly_dist = analytics.get_hourly_distribution()

    # Calculate max values for progress bar scaling
    max_page_hits = max((p['hits'] for p in page_stats), default=1)
    max_cat_hits = max((c['count'] for c in category_stats), default=1)
    max_hourly = max(hourly_dist.values()) if hourly_dist else 1

    return render_template(
        'dashboard.html',
        total_views=total_views,
        unique_sessions=unique_sessions,
        top_page=top_page,
        top_category=top_category,
        page_stats=page_stats,
        max_page_hits=max_page_hits,
        category_stats=category_stats,
        max_cat_hits=max_cat_hits,
        clickstreams=clickstreams,
        recent_views=recent_views,
        hourly_dist=hourly_dist,
        max_hourly=max_hourly,
        categories=CATEGORIES,
        active_category=None,
        page_title='Analytics Dashboard'
    )


# ──────────────────────────────────────────
#  Template Filters
# ──────────────────────────────────────────

@app.template_filter('timeago')
def timeago_filter(iso_string):
    """Convert an ISO timestamp to a human-readable relative time."""
    try:
        dt = datetime.fromisoformat(iso_string)
        diff = datetime.now() - dt
        seconds = int(diff.total_seconds())
        if seconds < 60:
            return f'{seconds}s ago'
        elif seconds < 3600:
            return f'{seconds // 60}m ago'
        elif seconds < 86400:
            return f'{seconds // 3600}h ago'
        else:
            return f'{seconds // 86400}d ago'
    except (ValueError, TypeError):
        return iso_string or '—'


@app.template_filter('truncate_ua')
def truncate_ua_filter(ua_string):
    """Shorten a User-Agent string for display."""
    if not ua_string:
        return '—'
    if len(ua_string) > 60:
        return ua_string[:57] + '...'
    return ua_string


# ──────────────────────────────────────────
#  Run
# ──────────────────────────────────────────

if __name__ == '__main__':
    print('\n' + '═' * 52)
    print('  📰  The Daily Digest — News Intelligence')
    print('  🌐  http://localhost:5000')
    print('  📊  http://localhost:5000/dashboard')
    print('  🔑  API Key: ' + ('✅ Configured' if NEWSDATA_API_KEY and NEWSDATA_API_KEY != 'paste_your_key_here' else '❌ Not set — edit .env'))
    print('═' * 52 + '\n')
    app.run(debug=True, port=5000)
