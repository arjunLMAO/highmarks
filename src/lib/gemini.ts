import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface AnalysisResult {
  questions: {
    text: string;
    difficulty: 'easy' | 'medium' | 'hard';
    subject: string;
    topic: string;
    chapter: string;
    marks: number;
  }[];
  repeatedPatterns: string[];
  chapterWeightage: {
    chapter: string;
    count: number;
    totalMarks: number;
    importance: 'high' | 'medium' | 'low';
  }[];
  practiceQuestions: {
    text: string;
    options: string[];
    correctAnswer: number; // 0-3 index
    explanation: string;
    topic: string;
    difficulty: 'hard' | 'extreme';
    marks: number;
  }[];
}

export interface NoteAnalysisResult {
  summary: string;
  shortNotes: {
    title: string;
    content: string[];
  }[];
  keyQuestions: {
    question: string;
    answer: string;
    type: 'conceptual' | 'factual' | 'application';
    marks: number;
  }[];
  chapterContext: {
    subject: string;
    chapterName: string;
    difficultyEstimate: 'beginner' | 'intermediate' | 'advanced';
  };
}

/**
 * Robustly extracts and repairs a JSON string from AI output.
 */
function extractAndRepairJson(text: string): string {
  // 1. Find the first '{' and the last '}'
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No valid JSON object found in response.");
  }
  
  let json = text.substring(start, end + 1);
  
  // 2. Basic cleanup for common AI slips
  // Remove trailing commas before closing braces/brackets
  json = json.replace(/,\s*([\]}])/g, '$1');
  
  // Replace smart quotes if they slipped in
  json = json.replace(/[\u201C\u201D]/g, '"');
  
  // Handle escaped line breaks that might remain literal
  json = json.replace(/\\n/g, ' ');

  return json;
}

export async function analyzePDFs(files: { data: string; mimeType: string }[]): Promise<AnalysisResult> {
  const systemInstruction = `
    You are an expert Academic Exam Analyst. Analyze the provided PDF(s) as a SINGLE combined dataset.
    
    CRITICAL MISSIONS:
    1. EXHAUSTIVE EXTRACTION: You MUST extract EVERY SINGLE question from EVERY provided paper. Do not summarize. Do not skip.
    2. LANGUAGE: All output MUST be in English. Translate precisely from any source language.
    3. COMBINED ANALYSIS: Merge insights across all papers to find subject-wide weightage and patterns.
    4. TOPIC PRECISION: Group questions by specific chapters and topics.
    5. REALISTIC MARKING: Assign 'marks' reflecting depth.
    6. EXTREME PRACTICE SET: The 'practiceQuestions' MUST be Multiple Choice Questions (MCQs).
       - FORMAT: Each practice question must have 4 options and a correct answer index (0-3).
       - DIFFICULTY: They must be EXTREMELY CHALLENGING. Focus on tricky concepts, complex numericals, and edge cases.
       - EXPLANATION: Provide a detailed explanation for the correct answer, specifically addressing common misconceptions or the step-by-step logic for numericals.
    
    OUTPUT: Return ONLY raw JSON. No markdown. No preamble.
  `;

  const prompt = `
    Extract EVERY SINGLE question from EACH paper provided. 
    Ensure the 'questions' array contains the FULL list of all questions found across ALL uploaded files. 
    Do not skip or sample - we need the complete combined question bank.
    Translate everything to English.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      ...files.map(file => ({
        inlineData: {
          data: file.data,
          mimeType: file.mimeType,
        },
      })),
      { text: prompt },
    ],
    config: {
      systemInstruction,
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                difficulty: { type: Type.STRING, enum: ['easy', 'medium', 'hard'] },
                subject: { type: Type.STRING },
                topic: { type: Type.STRING },
                chapter: { type: Type.STRING },
                marks: { type: Type.NUMBER },
              },
              required: ['text', 'difficulty', 'subject', 'topic', 'chapter', 'marks'],
            },
          },
          repeatedPatterns: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          chapterWeightage: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                chapter: { type: Type.STRING },
                count: { type: Type.INTEGER },
                totalMarks: { type: Type.NUMBER },
                importance: { type: Type.STRING, enum: ['high', 'medium', 'low'] },
              },
              required: ['chapter', 'count', 'totalMarks', 'importance'],
            },
          },
          practiceQuestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
                topic: { type: Type.STRING },
                difficulty: { type: Type.STRING, enum: ['hard', 'extreme'] },
                marks: { type: Type.NUMBER },
              },
              required: ['text', 'options', 'correctAnswer', 'explanation', 'topic', 'difficulty', 'marks'],
            },
          },
        },
        required: ['questions', 'repeatedPatterns', 'chapterWeightage', 'practiceQuestions'],
      },
    },
  });

  const rawText = response.text;
  
  if (!rawText) {
    throw new Error("The AI returned an empty response. This might happen if the PDF content is restricted or unreadable.");
  }

  try {
    const cleanedJson = extractAndRepairJson(rawText);
    return JSON.parse(cleanedJson);
  } catch (e) {
    console.error("Critical Failure: Could not parse AI JSON response.", e);
    console.error("Raw AI Response preview:", rawText.substring(0, 500));
    
    // Check if the response was likely truncated
    if (!rawText.trim().endsWith('}')) {
      throw new Error("The analysis report was too long for the AI to complete. Please try uploading fewer papers or smaller PDFs.");
    }
    
    throw new Error("The analysis failed due to a formatting error in the report. This usually happens with complex tables or special characters. Please try again.");
  }
}

export async function generateStudyNotes(files: { data: string; mimeType: string }[]): Promise<NoteAnalysisResult> {
  const systemInstruction = `
    You are an expert Academic Content Distiller. Your goal is to transform long textbook chapters or notes into high-value study materials.
    
    CRITICAL MISSIONS:
    1. VAST SUMMARY: Provide a detailed, comprehensive summary of the entire content. Do not skip major plot points, key laws, or significant historical events. The summary should be "vast" enough to replace a quick re-read of the chapter.
    2. SHORT NOTES: Break down the content into key sections. For each section, provide a title and bullet points of the most important concepts. Be thorough.
    3. KEY QUESTIONS: Generate a set of questions (with brief answers) that test comprehension. Assign realistic marks to each question based on expected depth (e.g., 1-2 for factual, 3-5 for conceptual, 6-10 for application/long answers).
    4. CHAPTER CONTEXT: Identify the subject, a descriptive name for the chapter, and estimate the difficulty level.
    
    LANGUAGE: All output MUST be in English.
    OUTPUT: Return ONLY raw JSON. No markdown.
  `;

  const prompt = `
    Thoroughly analyze the provided textbook/notes PDF(s). 
    Create comprehensive short notes, a summary, and relevant practice questions.
    Ensure everything is extracted from the source material provided.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      ...files.map(file => ({
        inlineData: {
          data: file.data,
          mimeType: file.mimeType,
        },
      })),
      { text: prompt },
    ],
    config: {
      systemInstruction,
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          shortNotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['title', 'content'],
            },
          },
          keyQuestions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                answer: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['conceptual', 'factual', 'application'] },
                marks: { type: Type.NUMBER },
              },
              required: ['question', 'answer', 'type', 'marks'],
            },
          },
          chapterContext: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              chapterName: { type: Type.STRING },
              difficultyEstimate: { type: Type.STRING, enum: ['beginner', 'intermediate', 'advanced'] },
            },
            required: ['subject', 'chapterName', 'difficultyEstimate'],
          },
        },
        required: ['summary', 'shortNotes', 'keyQuestions', 'chapterContext'],
      },
    },
  });

  const rawText = response.text;
  
  if (!rawText) {
    throw new Error("The AI returned an empty response. The notes might be too large or unreadable.");
  }

  try {
    const cleanedJson = extractAndRepairJson(rawText);
    return JSON.parse(cleanedJson);
  } catch (e) {
    console.error("Critical Failure: Could not parse Notes AI response.", e);
    throw new Error("Failed to generate notes. The content might be too complex for a single pass. Try uploading fewer pages.");
  }
}
