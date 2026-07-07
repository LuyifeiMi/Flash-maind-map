# 🧠 FlashMap AI

FlashMap AI is an intelligent mind mapping and flashcard application designed to help you visualize knowledge, organize thoughts, and study effectively. Powered by Google's Gemini AI, it can automatically generate expansive mind maps and detailed flashcards from simple text prompts.

## ✨ Features

- **🤖 AI-Powered Generation:** Generate full mind maps, expand specific subtopics, or create individual nodes instantly using the Gemini API.
- **🗂️ Built-in Flashcards:** Every node in your mind map doubles as a flashcard (Question & Answer) for active recall studying.
- **☁️ Cloud Sync & Authentication:** Sign in with Google to securely save and sync your maps across devices using Firebase Firestore (also supports local storage for guest users).
- **🔒 Secure Architecture:** Built with a custom Express backend proxy to ensure your Gemini API keys remain 100% secure and hidden from the browser.
- **🎨 Interactive Canvas:** Drag-and-drop interface powered by React Flow, featuring one-click auto-layout, minimap, and smooth animations.
- **📚 Study & Review Modes:** Dedicated study modes to review entire trees or specific subtrees of your knowledge map.

## 🛠️ Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, React Flow (@xyflow/react), Framer Motion, Lucide Icons
- **Backend:** Node.js, Express (bundled via ESBuild)
- **AI Integration:** Google Gemini API (`@google/genai`)
- **Database & Auth:** Firebase (Firestore & Google Auth)

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- A Google Gemini API Key
- A Firebase Project (for Auth and Firestore)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/flashmap-ai.git
   cd flashmap-ai
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Variables:**
   Create a `.env` file in the root directory and add your secure keys:
   ```env
   # Your Gemini API Key (Secured on the backend)
   GEMINI_API_KEY="your_gemini_api_key_here"
   VITE_FIREBASE_API_KEY="your_firebase_api_key"
   VITE_FIREBASE_AUTH_DOMAIN="your_firebase_auth_domain"
   VITE_FIREBASE_PROJECT_ID="your_project_id"
   VITE_FIREBASE_STORAGE_BUCKET="your_storage_bucket"
   VITE_FIREBASE_MESSAGING_SENDER_ID="your_sender_id"
   VITE_FIREBASE_APP_ID="your_app_id"
   VITE_FIREBASE_DATABASE_ID="your_database_id"
   ```
   *(Note: Make sure your Firebase configuration in `src/firebase.ts` is also set up with your own Firebase project details).*

4. **Run the development server:**
   ```bash
   npm run dev
   ```
   This will start both the Express backend and the Vite frontend concurrently on `http://localhost:3000`.

5. **Build for Production:**
   ```bash
   npm run build
   npm run start
   ```

## 🛡️ Security Note

This project is configured as a full-stack application. The Gemini API key is securely loaded on the backend (`server.ts`) using `process.env.GEMINI_API_KEY`. The React frontend communicates with the backend via a `/api/generate` proxy route. **Your API keys are never exposed to the client-side browser.**

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/yourusername/flashmap-ai/issues).

## 📝 License

This project is licensed under the MIT License.
