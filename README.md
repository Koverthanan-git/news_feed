# 📰 The Daily Digest — News Feed & Self-Hosted Analytics

A premium, modern, and high-performance news feed application equipped with a **fully custom, self-hosted first-party analytics system**. Built using Python (Flask) for the dynamic news feed & analytics database, Node.js (Express) for alternative logging comparison, and stylized with a sleek Vanilla CSS dark mode.

---

## ✨ Features

- **Dynamic News Aggregation:** Feeds live global news articles dynamically categorized (Business, Technology, Sports, Science) using the News Data API.
- **Sleek, Premium UI:** A fully responsive interface featuring fluid typography (`Outfit` & `Space Grotesk`), glassmorphism card layouts, custom animated gradients, and hover transitions.
- **First-Party Analytics Dashboard:** Built-in dashboard (`/dashboard`) showcasing detailed traffic insights:
  - Total page views & unique visitors.
  - Page-by-page view breakdown.
  - Top active categories.
  - Device/Browser type distributions.
  - Real-time recent visitor log.
- **No Third-Party Cookies:** Zero dependence on Google Analytics or external tracking scripts—fully self-hosted and compliant.
- **Comparison Engine:** Node.js Express server to demonstrate web server log extraction versus Flask's session & DB-based page tagging tracking.

---

## 🛠️ Tech Stack

- **Backend:** Python / Flask, Node.js / Express
- **Database:** SQLite (local first-party storage)
- **Frontend:** Jinja2 Templates, HTML5 Semantic Elements, Vanilla CSS
- **Integrations:** News Data API, `python-dotenv`

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/Koverthanan-git/news_feed.git
cd news_feed
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
NEWSDATA_API_KEY=your_actual_news_data_api_key_here
FLASK_SECRET_KEY=generate_a_random_secure_secret_key_here
PORT=5000
```
*(Note: `.env` is listed in `.gitignore` and will never be pushed to your repository)*

### 3. Setup and Run the Python (Flask) Application
Ensure you have Python installed, then set up the environment and run:

```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the application
python app.py
```
Visit the feed at `http://localhost:5000` and the analytics dashboard at `http://localhost:5000/dashboard`.

### 4. Setup and Run the Node.js Server (Optional Comparison App)
```bash
# Install node packages
npm install

# Start the Express server
npm start
```

---

## 📊 Analytics Tracking Method Comparison

This project demonstrates two first-party web analysis methods:

| Feature | Web Server Log Files (Node.js) | Session & Page Tagging (Flask + SQLite) |
| :--- | :--- | :--- |
| **Data Scope** | Low-level HTTP requests (IP, Method, Status, UA). | High-level behavioral events (Session duration, exact page views, clicks). |
| **Accuracy** | Captures bot requests and asset downloads. | Filters noise, focusing on human interactions. |
| **Storage** | Flat files on the disk (`access.log`). | Relational database (`data/analytics.db`). |
| **UX Impact** | Zero frontend impact. | Negligible frontend impact via server-side session hooks. |
