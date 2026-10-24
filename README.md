# 📝 Full-Stack Notes App

A clean, responsive, full-stack personal notes application built with **React**, **Vite**, **Node.js**, **Express**, and **SQLite**. Users can create, view, edit, and delete notes with local database persistence.

---

## 🚀 Features

- **Create Notes:** Add new notes with a title and content.
- **Dedicated View Button:** Every note card features an **"👁 View"** button and supports direct card clicks to open the note in full detail.
- **Read-Only View Modal:** View full note content, creation timestamp, and last updated timestamp in an accessible modal dialog.
- **Edit Notes:** Update existing notes via an edit modal (`PUT /api/notes/:id`).
- **Delete Notes:** Remove notes with a browser confirmation prompt (`DELETE /api/notes/:id`).
- **Dynamic Badge:** Real-time note counter displaying the total count of saved notes.
- **User Feedback:** Loading spinner while fetching data, friendly empty-state screen, and error alert banners with retry buttons.
- **Responsive & Accessible Design:** Fully responsive layout for mobile, tablet, and desktop screens with keyboard navigation support.
- **Theme Support:** Clean modern UI that respects system light and dark display preferences.
- **Local Persistence:** Data is stored in a local SQLite database file using Node's built-in SQLite engine.

---

## 🛠️ Technology Stack

### Frontend
- **React 19** (`^19.2.8`) – Component UI and local state
- **Vite 8** (`^8.3.0`) – Build tool and hot-reloading development server
- **Vanilla CSS** – Custom responsive styling (no external CSS libraries)
- **Native Fetch API** – Communicates with backend REST API

### Backend
- **Node.js** – JavaScript server runtime
- **Express 5** (`^5.3.0`) – RESTful API server
- **SQLite (`node:sqlite`)** – Local relational database using Node's native synchronous SQLite module
- **CORS** (`^2.8.6`) – Cross-Origin Resource Sharing middleware

---

## 📁 Project Structure

```text
note_app/
├── public/              # Static assets (favicons, SVG icons)
├── src/
│   ├── assets/          # SVG and image assets
│   ├── App.jsx          # Main React component & application logic
│   ├── App.css          # Notes App styles & modal layouts
│   ├── index.css        # Base typography & CSS variables
│   └── main.jsx         # React application entry point
├── server/
│   ├── index.js         # Express server & REST API route handlers
│   ├── db.js            # SQLite database table schema initialization
│   ├── package.json     # Backend dependencies (express, cors)
│   └── notes.db         # SQLite database file (excluded from Git)
├── package.json         # Frontend dependencies & Vite scripts
├── vite.config.js       # Vite build configuration
└── .gitignore           # Git ignore rules for node_modules and database
```

---

## 🔌 REST API Endpoints

The backend runs on `http://localhost:5000` and provides the following endpoints:

| Method | Endpoint | Description | Status Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Server health check and status | `200` |
| `GET` | `/api/notes` | Fetch all notes (sorted by newest first) | `200`, `500` |
| `GET` | `/api/notes/:id` | Fetch a single note by ID | `200`, `404`, `500` |
| `POST` | `/api/notes` | Create a new note (`title`, `content` required) | `201`, `400`, `500` |
| `PUT` | `/api/notes/:id` | Update an existing note | `200`, `400`, `404`, `500` |
| `DELETE` | `/api/notes/:id` | Delete a note by ID | `200`, `404`, `500` |

---

## 💻 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (version **22.5.0** or higher is required for native `node:sqlite` support)
- Git

### Installation

1. **Clone the repository:**
   ```bash
   git clone git@github.com:sameera-elite/notes-app-fullstack.git
   cd notes-app-fullstack
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Install backend dependencies:**
   ```bash
   npm install --prefix server
   ```

### Running the Application

Run the backend and frontend in separate terminals:

1. **Start the backend server:**
   ```bash
   npm run dev --prefix server
   ```
   *The backend will start on [http://localhost:5000](http://localhost:5000)*

2. **Start the frontend application:**
   ```bash
   npm run dev
   ```
   *The frontend will start on [http://localhost:5173](http://localhost:5173)*

*(Note for Windows PowerShell: If running scripts is restricted on your machine, use `npm.cmd` instead of `npm`.)*

---

## 🛡️ License & Privacy
This repository is private and maintained by [sameera-elite](https://github.com/sameera-elite).
