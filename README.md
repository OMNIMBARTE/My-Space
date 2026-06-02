# ✦ My Space

A personal browser start page with a Node.js/Express backend for persistent data. Features a glassmorphism UI with dark/light themes, custom wallpapers, quick-access links, a to-do list, multi-engine search, a focus timer, and a daily quote widget.

---

## ✨ Features

- **Live Clock & Greeting** — Shows real-time clock, date, and a time-aware greeting (Good morning / afternoon / evening, Om ✦)
- **Quick Links** — Add, manage, and launch your favourite URLs with custom names and emojis; persisted via the backend
- **To-Do List** — Add tasks, toggle completion, and delete; badge shows live `done / total` count
- **Multi-Engine Search** — Search Google, YouTube, Reddit, or Wikipedia directly from the page
- **Custom Wallpapers** — Upload separate wallpapers for day and night themes (stored as base64, server-side)
- **Dark / Light Theme** — Toggle with automatic wallpaper switching; theme persisted across sessions
- **Daily Quote** — Curated motivational quotes with a shuffle button
- **Focus Timer** — Pomodoro-style focus/break timer built in
- **Animated Background** — Subtle cursor glow and animated star canvas
- **Offline-friendly JSON DB** — All data (links, todos, settings, wallpapers) is stored locally in `data/db.json` and `data/wallpapers/`

---

## 🗂 Project Structure

```
my-space/
├── data/
│   ├── db.json              # JSON database (links, todos, settings)
│   └── wallpapers/
│       ├── day.txt          # Day wallpaper (base64 data-URL)
│       └── night.txt        # Night wallpaper (base64 data-URL)
├── Images/                  # App icon assets (PNG)
├── public/
│   └── index.html           # Single-page frontend (HTML + CSS + JS)
├── server.js                # Express backend & REST API
├── package.json
└── package-lock.json
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v16 or higher
- npm (comes with Node.js)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd my-space

# Install dependencies
npm install
```

### Running the App

```bash
# Production
npm start

# Development (auto-restarts on file changes, requires nodemon)
npm run dev
```

Then open [http://localhost:5500](http://localhost:5500) in your browser.

> The port can be overridden with the `PORT` environment variable:
> ```bash
> PORT=3000 npm start
> ```

---

## 🔌 API Reference

All endpoints are under `/api`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ping` | Health check |
| `GET` | `/api/settings` | Get theme/settings |
| `POST` | `/api/settings` | Update settings |
| `GET` | `/api/links` | Get all links |
| `POST` | `/api/links` | Add a new link |
| `DELETE` | `/api/links/:id` | Delete a link |
| `GET` | `/api/todos` | Get all todos |
| `POST` | `/api/todos` | Add a new todo |
| `POST` | `/api/todos/:id/toggle` | Toggle todo done/undone |
| `DELETE` | `/api/todos/:id` | Delete a todo |
| `GET` | `/api/wallpapers` | Get both wallpapers |
| `GET` | `/api/wallpapers/:slot` | Get `day` or `night` wallpaper |
| `POST` | `/api/wallpapers/:slot` | Upload a wallpaper (body: `{ dataUrl }`) |
| `DELETE` | `/api/wallpapers/:slot` | Delete a specific wallpaper |
| `DELETE` | `/api/wallpapers` | Clear both wallpapers |

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Backend | Node.js + Express |
| Database | JSON file (`db.json`) |
| Fonts | Orbitron, Syne, JetBrains Mono, Manrope (Google Fonts) |

---

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP server and REST API |

No database setup, no ORM, no build step — just Node.js and a single JSON file.

---

## 🎨 Customization

- **Name** — Change `Om` in `public/index.html` (search for `Om ✦`) to your own name
- **Quotes** — Edit the `QUOTES` array in `public/index.html` to add your own
- **Default theme** — Change `"theme": "dark"` to `"light"` in `data/db.json`
- **Port** — Set the `PORT` environment variable (default: `5500`)

---

## 📄 License

This project is for personal use. Feel free to fork and adapt it for your own start page.
