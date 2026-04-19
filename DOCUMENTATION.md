# Cerebral AI: Technical Documentation

Cerebral AI is a high-performance academic analysis tool designed to transform static study materials (PDFs) into interactive learning experiences. It operates in two primary modes: **Exam Mode** (for past paper analysis and interactive MCQ testing) and **Study Mode** (for textbook distillation and vast summaries).

---

## 1. Coarse-Grain Architecture

The application is built using a modern **React + TypeScript + Vite** stack, leveraging **Gemini 3.1 Pro** for advanced document intelligence.

### High-Level Flow
1.  **Ingestion**: User uploads PDF files via the browser.
2.  **Conversion**: PDFs are converted to base64 strings and sent to the AI service.
3.  **Intelligence**: The AI engine processes the content based on the selected mode (Exam vs. Study).
4.  **Presentation**: Results are rendered into interactive dashboards, detailed summaries, or a gamified MCQ quiz.

### Key Infrastructure
-   **Frontend**: React 18 with Tailwind CSS and Framer Motion (`motion/react`) for animations.
-   **AI Engine**: Google Gemini API via the `@google/generative-ai` SDK.
-   **State Management**: Local React state (`useState`) with `localStorage` persistence for saved reports.

---

## 2. Key Files & Responsibilities

### `src/App.tsx`
The "Brain" of the UI. It manages the entire application lifecycle, including:
-   **Navigation State**: Tracks the current view (`UPLOAD`, `PROCESSING`, `RESULTS`, etc.).
-   **Mode Management**: Toggles between `EXAM` and `NOTE` analysis.
-   **File Storage**: Manages the local library of uploaded files and saved reports.
-   **Interactive Quiz State**: Handles scoring, accuracy, and question indexing for the MCQ challenge.

### `src/lib/gemini.ts`
The AI Integration Layer. It encapsulates all logic related to structured data extraction:
-   **JSON Schema Enforcement**: Uses the Gemini `responseSchema` to ensure the AI always returns valid, typed JSON.
-   **Prompt Engineering**: Contains the expert system instructions for "Extreme Hardness" in MCQs and "Vast Depth" in summaries.
-   **Repair Logic**: Includes a robust `extractAndRepairJson` utility to handle edge cases in AI string output.

---

## 3. Fine-Grain Functional Details

### Analysis Pipeline
#### `startAnalysis` (in `App.tsx`)
The entry point for all intelligence operations.
-   **Progression**: Manages a simulated progress bar that slows down as it approaches 100% to manage user expectations during long AI generations.
-   **Abort Logic**: Uses `AbortController` to allow users to cancel long-running requests or catch 4-minute timeouts.
-   **Diversion**: Routes the file data to either `analyzePDFs` or `generateStudyNotes` based on the active mode.

#### `analyzePDFs` (in `gemini.ts`)
-   **Role**: Processes exam papers.
-   **Logic**: Instructs Gemini to perform "Exhaustive Extraction" of every question and then generate a set of **Extreme MCQs**.
-   **Output**: Returns an `AnalysisResult` containing repeated patterns, chapter weightage, and the practice question bank.

#### `generateStudyNotes` (in `gemini.ts`)
-   **Role**: Distills textbooks.
-   **Logic**: Hardcoded for a "Vast Summary" mission.
-   **Output**: Returns a `NoteAnalysisResult` featuring short notes, subjective questions with marks, and a comprehensive chapter summary.

### User Experience Systems
#### `resetQuiz` (in `App.tsx`)
A critical utility function that clears `quizIdx`, `selectedOpt`, `isAnswerRevealed`, and `score`. This is called every time a new report is loaded to ensure the user starts the MCQ challenge from Question 1.

#### `handleFileChange` (in `App.tsx`)
Filters for `application/pdf` and populates the `library` state. It ensures only valid documents are queued for analysis.

---

## 4. Component Standards

The UI relies heavily on high-quality component libraries to maintain a "Production-Grade" feel:
-   **Shadcn UI**: Used for structural elements (`Card`, `Tabs`, `ScrollArea`, `Badge`).
-   **Lucide React**: Provides consistent iconography across both Study and Exam modes.
-   **Tailwind CSS**: Utility classes drive the "Cyber-Academic" aesthetic (dark blues, deep purples, and high-contrast text).
