import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ArrowRight, 
  BookOpen, 
  BarChart3, 
  BrainCircuit,
  ChevronRight,
  Filter,
  Trash2,
  Eye,
  Cloud,
  History,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { analyzePDFs, generateStudyNotes, type AnalysisResult, type NoteAnalysisResult } from "./lib/gemini";

type Step = "UPLOAD" | "PROCESSING" | "RESULTS" | "NOTE_RESULTS";

interface FileWithStatus {
  file: File;
  status: "idle" | "analyzing" | "analyzed" | "error";
  result?: AnalysisResult;
}

interface AnalysisReport {
  id: string;
  result: AnalysisResult;
  fileNames: string[];
  timestamp: number;
  subject: string;
  isCombined: boolean;
}

interface NoteReport {
  id: string;
  result: NoteAnalysisResult;
  fileNames: string[];
  timestamp: number;
  subject: string;
  chapterName: string;
}

export default function App() {
  const [step, setStep] = useState<Step>("UPLOAD");
  const [analysisType, setAnalysisType] = useState<"EXAM" | "NOTE">("EXAM");
  const [library, setLibrary] = useState<FileWithStatus[]>([]);
  const [reports, setReports] = useState<AnalysisReport[]>(() => {
    const saved = localStorage.getItem("cerebral_reports");
    return saved ? JSON.parse(saved) : [];
  });
  const [noteReports, setNoteReports] = useState<NoteReport[]>(() => {
    const saved = localStorage.getItem("cerebral_notes");
    return saved ? JSON.parse(saved) : [];
  });
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [currentNote, setCurrentNote] = useState<NoteReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Quiz State
  const [quizIdx, setQuizIdx] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState<number | null>(null);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [score, setScore] = useState(0);

  const resetQuiz = () => {
    setQuizIdx(0);
    setSelectedOpt(null);
    setIsAnswerRevealed(false);
    setScore(0);
  };

  // Sync reports to localStorage
  React.useEffect(() => {
    localStorage.setItem("cerebral_reports", JSON.stringify(reports));
  }, [reports]);

  React.useEffect(() => {
    localStorage.setItem("cerebral_notes", JSON.stringify(noteReports));
  }, [noteReports]);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files)
        .filter((f: File) => f.type === "application/pdf")
        .map(f => ({ file: f, status: "idle" as const }));
      setLibrary(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setLibrary(prev => prev.filter((_, i) => i !== index));
  };

  const startAnalysis = async () => {
    const idleFiles = library.filter(item => item.status === "idle");
    if (idleFiles.length === 0) return;

    if (analysisType === "EXAM") {
      if (reports.length >= 10) {
        setError("Analysis limit reached (max 10). Please delete an existing report from your history to start a new analysis.");
        return;
      }
    } else {
      if (noteReports.length >= 10) {
        setError("Notes limit reached (max 10). Please delete an existing study report to start a new one.");
        return;
      }
    }
    
    setStep("PROCESSING");
    setError(null);
    setProgress(5);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 240000); // Increased to 240 seconds (4 mins) for deep 'vast' analysis

    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev < 60) return prev + Math.random() * 5;
        if (prev < 85) return prev + Math.random() * 2;
        if (prev < 95) return prev + Math.random() * 0.5;
        if (prev < 98) return prev + 0.1;
        if (prev < 99.9) return prev + 0.01; // Extremely slow crawl at the end
        return prev;
      });
    }, 1500);

    try {
      const fileData = await Promise.all(
        idleFiles.map(async (item) => {
          return new Promise<{ data: string; mimeType: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = (reader.result as string).split(",")[1];
              resolve({ data: base64, mimeType: item.file.type });
            };
            reader.onerror = reject;
            reader.readAsDataURL(item.file);
          });
        })
      );

      if (analysisType === "EXAM") {
        const analysisResult = await analyzePDFs(fileData);
        if (controller.signal.aborted) return;
        clearTimeout(timeoutId);
        clearInterval(progressInterval);
        setProgress(100);
        
        const subjects = analysisResult.questions.map(q => q.subject);
        const subjectCounts = subjects.reduce((acc, s) => {
          acc[s] = (acc[s] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const mainSubject = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown Subject";

        const newReport: AnalysisReport = {
          id: Date.now().toString(),
          result: analysisResult,
          fileNames: idleFiles.map(f => f.file.name),
          timestamp: Date.now(),
          subject: mainSubject,
          isCombined: idleFiles.length > 1
        };

        setReports(prev => [newReport, ...prev].slice(0, 10));
        setCurrentResult(analysisResult);
        resetQuiz();
        setTimeout(() => {
          setStep("RESULTS");
          setProgress(0);
        }, 800);
      } else {
        const noteResult = await generateStudyNotes(fileData);
        if (controller.signal.aborted) return;
        clearTimeout(timeoutId);
        clearInterval(progressInterval);
        setProgress(100);

        const newNoteReport: NoteReport = {
          id: Date.now().toString(),
          result: noteResult,
          fileNames: idleFiles.map(f => f.file.name),
          timestamp: Date.now(),
          subject: noteResult.chapterContext.subject,
          chapterName: noteResult.chapterContext.chapterName
        };

        setNoteReports(prev => [newNoteReport, ...prev].slice(0, 10));
        setCurrentNote(newNoteReport);
        setTimeout(() => {
          setStep("NOTE_RESULTS");
          setProgress(0);
        }, 800);
      }
      
      // Clear library of the files used
      setLibrary(prev => prev.filter(item => item.status !== "idle"));
    } catch (err) {
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      console.error(err);
      
      const isTimeout = err instanceof Error && (err.name === 'AbortError' || err.message.includes('abort'));
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      setError(isTimeout 
        ? "The analysis took longer than 4 minutes and was timed out. This often happens with very long textbooks or multiple large papers. Try uploading one chapter at a time for the best results."
        : `Analysis failed: ${errorMessage}. Please try refreshing and re-uploading individual files.`);
      
      setLibrary(prev => prev.map(item => 
        item.status === "idle" ? { ...item, status: "error" } : item
      ));
      setStep("UPLOAD");
    }
  };

  const cancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStep("UPLOAD");
  };

  const goToInsights = () => {
    console.log("Navigating to insights. Current result:", !!currentResult);
    if (currentResult) {
      setStep("RESULTS");
      return;
    }
    
    // Fallback: find the first analyzed paper in the library
    const firstAnalyzed = library.find(item => item.status === "analyzed" && item.result);
    console.log("Fallback check. Found analyzed paper:", !!firstAnalyzed);
    if (firstAnalyzed?.result) {
      setCurrentResult(firstAnalyzed.result);
      resetQuiz();
      setStep("RESULTS");
    }
  };

  const removeReport = (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
    if (currentResult && reports.find(r => r.id === id)?.result === currentResult) {
      setCurrentResult(null);
      setStep("UPLOAD");
    }
  };

  const removeNoteReport = (id: string) => {
    setNoteReports(prev => prev.filter(r => r.id !== id));
    if (currentNote?.id === id) {
      setCurrentNote(null);
      setStep("UPLOAD");
    }
  };

  const hasAnyResults = reports.length > 0;
  const hasAnyNotes = noteReports.length > 0;

  // Safety net: if we're in RESULTS step but have no result, try to find one or go back to UPLOAD
  React.useEffect(() => {
    if (step === "RESULTS" && !currentResult) {
      if (reports.length > 0) {
        setCurrentResult(reports[0].result);
      } else {
        setStep("UPLOAD");
      }
    }
  }, [step, currentResult, reports]);

  return (
    <div className="min-h-screen bg-[#0B1120] text-white font-sans selection:bg-blue-500/30">
      <header className="border-b border-gray-800/50 bg-[#0B1120]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <h1 className="font-bold text-2xl tracking-tight font-display">Cerebral</h1>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <button 
                onClick={() => setStep("UPLOAD")}
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${step === "UPLOAD" || step === "PROCESSING" ? "text-white" : "text-gray-400 hover:text-white"}`}
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
              <button 
                onClick={goToInsights}
                disabled={!hasAnyResults}
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${step === "RESULTS" ? "text-white" : "text-gray-400 hover:text-white"} ${!hasAnyResults ? "opacity-30 cursor-not-allowed" : "opacity-100"}`}
              >
                <BarChart3 className="w-4 h-4" />
                Insights
              </button>
              <button 
                onClick={() => {
                  if (currentNote) setStep("NOTE_RESULTS");
                  else if (hasAnyNotes) setStep("UPLOAD");
                }}
                disabled={!hasAnyNotes && step !== "UPLOAD"}
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${step === "NOTE_RESULTS" ? "text-white" : "text-gray-400 hover:text-white"} ${!hasAnyNotes && step !== "UPLOAD" ? "opacity-30 cursor-not-allowed" : "opacity-100"}`}
              >
                <BrainCircuit className="w-4 h-4" />
                Notes
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {step === "RESULTS" && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setStep("UPLOAD")}
                className="border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
              >
                New Analysis
              </Button>
            )}
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {step === "UPLOAD" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {error && (
                <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-4 text-red-400 max-w-2xl mx-auto mb-8">
                  <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold uppercase tracking-widest text-xs">Analysis Error</p>
                    <p className="text-sm leading-relaxed">{error}</p>
                    <Button 
                      variant="link" 
                      className="text-red-400 p-0 h-auto text-xs font-bold underline"
                      onClick={() => setError(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}

              <div className="text-center space-y-4 max-w-4xl mx-auto">
                <div className="inline-flex p-1 bg-gray-900 rounded-lg border border-gray-800 mb-4">
                  <button 
                    onClick={() => setAnalysisType("EXAM")}
                    className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-bold transition-all ${analysisType === "EXAM" ? "bg-blue-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"}`}
                  >
                    <FileText className="w-4 h-4" />
                    Exam Mode
                  </button>
                  <button 
                    onClick={() => setAnalysisType("NOTE")}
                    className={`flex items-center gap-2 px-6 py-2 rounded-md text-sm font-bold transition-all ${analysisType === "NOTE" ? "bg-purple-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"}`}
                  >
                    <BrainCircuit className="w-4 h-4" />
                    Study Mode
                  </button>
                </div>
                <h2 className="text-7xl font-bold tracking-tight font-display bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-500 py-2">
                  {analysisType === "EXAM" ? "Master Your Papers." : "Scribe Your Success."}
                </h2>
                <p className="text-gray-400 text-xl leading-relaxed max-w-3xl mx-auto">
                  {analysisType === "EXAM" 
                    ? "Upload your past exam papers. Our AI tutor analyzes patterns, categorizes difficulty, and builds targeted practice sets for your weakest areas."
                    : "Upload your textbook chapters or messy class notes. AI extracts summary insights, concise study notes, and comprehension questions to simplify learning."}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-7 space-y-6">
                  <Card className={`bg-[#111827] border-gray-800 shadow-2xl overflow-hidden transition-all duration-500 ${analysisType === "NOTE" ? "ring-2 ring-purple-500/30" : "ring-2 ring-blue-500/30"}`}>
                    <CardHeader>
                      <CardTitle className="text-xl">Step 1: Upload {analysisType === "EXAM" ? "Papers" : "Materials"}</CardTitle>
                      <CardDescription className="text-gray-400">Drag and drop PDF {analysisType === "EXAM" ? "exams" : "textbooks or notes"} to begin analysis.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="drag-drop-area relative group">
                        <div className="flex flex-col items-center justify-center space-y-4 text-center py-8">
                          <div className={`w-16 h-16 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 ${analysisType === "EXAM" ? "bg-blue-500/10 text-blue-500" : "bg-purple-500/10 text-purple-500"}`}>
                            <Cloud className="w-8 h-8" />
                          </div>
                          <div className="space-y-1">
                            <p className="text-xl font-semibold">Drag & Drop PDFs</p>
                            <p className="text-sm text-gray-400">or click to browse from your computer</p>
                          </div>
                          <input
                            type="file"
                            multiple
                            accept=".pdf"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          />
                        </div>
                      </div>

                      {library.length > 0 && (
                        <div className="mt-8 space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Queued Materials ({library.length})</h3>
                            <Button variant="ghost" size="sm" onClick={() => setLibrary([])} className="text-[10px] text-gray-500 hover:text-red-500">Clear All</Button>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {library.map((item, i) => (
                              <div key={i} className="flex items-center justify-between p-3 bg-[#0B1120] border border-gray-800 rounded-lg">
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <FileText className={`w-4 h-4 shrink-0 ${analysisType === "EXAM" ? "text-blue-500" : "text-purple-500"}`} />
                                  <span className="text-xs truncate font-medium text-gray-300">{item.file.name}</span>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => removeFile(i)} className="h-6 w-6 text-gray-600 hover:text-red-500">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            ))}
                          </div>

                          <div className="pt-2">
                             {(analysisType === "EXAM" ? reports.length : noteReports.length) >= 10 ? (
                               <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl text-center">
                                 <p className="text-xs font-bold text-red-500 uppercase tracking-widest">Storage Full (10/10)</p>
                                 <p className="text-[10px] text-gray-500 mt-1">Delete an old report to proceed.</p>
                               </div>
                             ) : (
                               <Button 
                                className={`w-full h-12 text-lg text-white font-semibold transition-all shadow-lg ${analysisType === "EXAM" ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20" : "bg-purple-600 hover:bg-purple-700 shadow-purple-500/20"}`}
                                onClick={startAnalysis}
                               >
                                {library.length > 1 
                                  ? `Process ${library.length} Together` 
                                  : analysisType === "EXAM" ? "Analyze This Paper" : "Generate Study Notes"}
                                <ChevronRight className="ml-2 w-5 h-5" />
                               </Button>
                             )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="lg:col-span-5 space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-gray-400 uppercase tracking-widest">
                      <History className={`w-4 h-4 ${analysisType === 'EXAM' ? 'text-blue-500' : 'text-purple-500'}`} />
                      <span>{analysisType === 'EXAM' ? 'Exam Reports' : 'Study Scribes'} ({(analysisType === 'EXAM' ? reports : noteReports).length}/10)</span>
                    </div>
                    {(analysisType === 'EXAM' ? reports : noteReports).length > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          if (confirm(`Clear all your ${analysisType === 'EXAM' ? 'exam report' : 'study note'} history?`)) {
                            if (analysisType === 'EXAM') {
                              setReports([]);
                              setCurrentResult(null);
                            } else {
                              setNoteReports([]);
                              setCurrentNote(null);
                            }
                          }
                        }}
                        className="text-[10px] text-gray-600 hover:text-red-500 font-bold tracking-widest uppercase"
                      >
                        Clear
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    {analysisType === "EXAM" ? (
                      reports.length === 0 ? (
                        <div className="p-12 border border-dashed border-gray-800 rounded-xl text-center space-y-2 bg-[#111827]/30">
                          <BarChart3 className="w-8 h-8 text-gray-700 mx-auto" />
                          <p className="text-gray-600 text-xs">No exam reports found</p>
                        </div>
                      ) : (
                        reports.map((report) => (
                          <motion.div 
                            key={report.id}
                            layout
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`p-4 bg-[#111827] border ${currentResult === report.result ? 'border-blue-500' : 'border-gray-800'} rounded-xl group hover:border-gray-700 cursor-pointer transition-all`}
                            onClick={() => {
                              setCurrentResult(report.result);
                              resetQuiz();
                              setStep("RESULTS");
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                               <Badge variant="outline" className="text-[8px] bg-blue-500/5 text-blue-400 border-blue-500/10 uppercase tracking-tighter">Exam Analysis</Badge>
                               <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeReport(report.id); }} className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3 text-red-500" /></Button>
                            </div>
                            <h4 className="font-bold text-sm truncate text-white">{report.subject}</h4>
                            <p className="text-[10px] text-gray-500 truncate">{report.fileNames.join(", ")}</p>
                          </motion.div>
                        ))
                      )
                    ) : (
                      noteReports.length === 0 ? (
                        <div className="p-12 border border-dashed border-gray-800 rounded-xl text-center space-y-2 bg-[#111827]/30">
                          <BrainCircuit className="w-8 h-8 text-gray-700 mx-auto" />
                          <p className="text-gray-600 text-xs">No study notes found</p>
                        </div>
                      ) : (
                        noteReports.map((report) => (
                          <motion.div 
                            key={report.id}
                            layout
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`p-4 bg-[#111827] border ${currentNote?.id === report.id ? 'border-purple-500' : 'border-gray-800'} rounded-xl group hover:border-gray-700 cursor-pointer transition-all`}
                            onClick={() => {
                              setCurrentNote(report);
                              setStep("NOTE_RESULTS");
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                               <Badge variant="outline" className="text-[8px] bg-purple-500/5 text-purple-400 border-purple-500/10 uppercase tracking-tighter">Study Studio</Badge>
                               <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); removeNoteReport(report.id); }} className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3 text-red-500" /></Button>
                            </div>
                            <h4 className="font-bold text-sm truncate text-white">{report.chapterName}</h4>
                            <p className="text-[10px] text-gray-500 truncate">{report.subject}</p>
                          </motion.div>
                        ))
                      )
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "PROCESSING" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto text-center space-y-8 py-20"
            >
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 border-4 border-blue-900 rounded-full"></div>
                <motion.div 
                  className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                ></motion.div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <BrainCircuit className="w-10 h-10 text-blue-500" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-3xl font-bold font-display">
                    {progress > 95 ? "Perfecting the Report..." : "AI is analyzing..."}
                  </h2>
                  <p className="text-gray-400">
                    {progress > 95 
                      ? "Generating your 'vast' summary and marking schemes. This takes extra time for high-quality results."
                      : "Extracting chapters, identifying topics, and calculating marking weightage."}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Progress value={progress} className="h-2 bg-gray-800" />
                  <div className="flex justify-between items-center px-1">
                    <p className="text-[10px] font-mono text-blue-500 uppercase tracking-widest font-bold">{Math.round(progress)}% Complete</p>
                    {progress > 90 && (
                      <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-[9px] text-gray-500 font-medium italic"
                      >
                        Taking longer than usual due to document complexity...
                      </motion.p>
                    )}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={cancelAnalysis}
                  className="text-gray-500 hover:text-white"
                >
                  Cancel Analysis
                </Button>
              </div>
            </motion.div>
          )}

          {step === "RESULTS" && currentResult && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2 mb-12">
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 px-3 py-1 text-xs font-bold tracking-widest uppercase">Combined Analysis Report</Badge>
                <h2 className="text-4xl font-bold font-display">Your Personalized Insights</h2>
                <p className="text-gray-400">Merged data from all uploaded papers for a unified study strategy.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-[#111827] border-gray-800 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="uppercase tracking-wider text-[10px] font-bold text-gray-500">Total Extracted Questions</CardDescription>
                    <CardTitle className="text-4xl font-bold">{currentResult.questions.length}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                        {currentResult.questions.filter(q => q.difficulty === 'easy').length} Easy
                      </Badge>
                      <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                        {currentResult.questions.filter(q => q.difficulty === 'medium').length} Medium
                      </Badge>
                      <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                        {currentResult.questions.filter(q => q.difficulty === 'hard').length} Hard
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-[#111827] border-gray-800 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="uppercase tracking-wider text-[10px] font-bold text-gray-500">Top Topic Analysis</CardDescription>
                    <CardTitle className="text-4xl font-bold">{currentResult.repeatedPatterns.length}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-400 truncate">{currentResult.repeatedPatterns[0] || "Found common subject themes"}</p>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-blue-600 text-white border-none shadow-xl shadow-blue-600/20">
                <CardHeader className="pb-2 text-center">
                  <CardDescription className="uppercase tracking-wider text-[10px] font-bold text-blue-100 italic">Combined Chapter Weightage Result</CardDescription>
                  <CardTitle className="text-3xl font-bold">
                    Primary Focus: {currentResult.chapterWeightage.sort((a, b) => b.totalMarks - a.totalMarks)[0]?.chapter || "N/A"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <p className="text-lg text-blue-100 font-medium">
                    This topic contributes {currentResult.chapterWeightage.sort((a, b) => b.totalMarks - a.totalMarks)[0]?.totalMarks || 0} marks to your total exam score.
                  </p>
                </CardContent>
              </Card>

              <Tabs defaultValue="analysis" className="w-full flex flex-col items-center">
                <TabsList className="grid w-full max-w-2xl grid-cols-3 h-12 bg-[#111827] p-1 border border-gray-800 shadow-sm mb-12">
                    <TabsTrigger value="analysis" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Combined Insights
                    </TabsTrigger>
                    <TabsTrigger value="questions" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                      <FileText className="w-4 h-4 mr-2" />
                      Question Bank
                    </TabsTrigger>
                    <TabsTrigger value="practice" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                      <BrainCircuit className="w-4 h-4 mr-2" />
                      AI Practice Set
                    </TabsTrigger>
                  </TabsList>

                <TabsContent value="analysis" className="mt-0 w-full flex flex-col gap-8">
                  <Card className="bg-[#111827] border-gray-800 shadow-sm w-full">
                    <CardHeader>
                      <CardTitle className="text-xl font-display">Combined Topic Patterns</CardTitle>
                      <CardDescription className="text-gray-400">Common themes identified across your entire paper sets</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 gap-4">
                        {currentResult.repeatedPatterns.length > 0 ? (
                          currentResult.repeatedPatterns.map((pattern, i) => (
                            <div key={i} className="flex gap-4 p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
                              <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-4 h-4 text-blue-500" />
                              </div>
                              <p className="text-sm leading-relaxed text-gray-300">{pattern}</p>
                            </div>
                          ))
                        ) : (
                          <div className="col-span-full text-center py-8 text-gray-500 italic">
                            No significant patterns identified in these papers.
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-[#111827] border-gray-800 shadow-sm w-full">
                    <CardHeader>
                      <CardTitle className="text-xl font-display">Chapter Weightage</CardTitle>
                      <CardDescription className="text-gray-400">Ranked by total marks assigned (Combined Analysis)</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-6">
                        {currentResult.chapterWeightage
                          .sort((a, b) => b.totalMarks - a.totalMarks)
                          .map((item, i) => (
                            <div key={i} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono text-gray-500">0{i + 1}</span>
                                  <span className="font-medium">{item.chapter}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-bold border-gray-700">
                                    {item.totalMarks} MARKS
                                  </Badge>
                                  <Badge className={
                                    item.importance === 'high' ? "bg-red-500/10 text-red-500" :
                                    item.importance === 'medium' ? "bg-yellow-500/10 text-yellow-500" :
                                    "bg-blue-500/10 text-blue-500"
                                  }>
                                    {item.importance.toUpperCase()}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <Progress value={(item.totalMarks / currentResult.questions.reduce((acc, q) => acc + q.marks, 0)) * 100} className="h-1.5 bg-gray-800" />
                                <span className="text-xs font-bold w-12 text-right text-gray-400">{item.count}q</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="questions" className="mt-0 w-full">
                  <Card className="bg-[#111827] border-gray-800 shadow-sm w-full">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-display">Categorized Questions</CardTitle>
                        <CardDescription className="text-gray-400">All extracted questions with AI labeling</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" className="border-gray-700">
                        <Filter className="w-4 h-4 mr-2" />
                        Filter
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-[600px] pr-4">
                        <div className="space-y-4">
                          {currentResult.questions.map((q, i) => (
                            <div key={i} className="p-4 bg-[#0B1120] border border-gray-800 rounded-xl hover:border-blue-500/50 transition-all group">
                              <div className="flex items-start justify-between gap-4 mb-3">
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider border-gray-700">
                                    {q.subject}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider border-gray-700">
                                    {q.chapter}
                                  </Badge>
                                </div>
                                <div className={`w-3 h-3 rounded-full shrink-0 ${
                                  q.difficulty === 'easy' ? 'bg-green-500' :
                                  q.difficulty === 'medium' ? 'bg-yellow-500' :
                                  'bg-red-500'
                                } shadow-[0_0_8px_rgba(0,0,0,0.5)]`} title={q.difficulty}></div>
                              </div>
                              <p className="text-sm font-medium leading-relaxed text-gray-200">{q.text}</p>
                              <div className="mt-4 flex items-center gap-2 text-[10px] text-gray-500 font-mono uppercase">
                                <span>Topic: {q.topic}</span>
                                <Separator orientation="vertical" className="h-3 bg-gray-800" />
                                <span>Marks: {q.marks}</span>
                                <Separator orientation="vertical" className="h-3 bg-gray-800" />
                                <span>Difficulty: {q.difficulty}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="practice" className="mt-0 w-full">
                  <div className="max-w-3xl mx-auto w-full space-y-8 min-h-[500px]">
                    <div className="text-center space-y-2 mb-8">
                      <h3 className="text-3xl font-bold font-display">Extreme MCQ Challenge</h3>
                      <p className="text-gray-400">Master the hardest concepts with interactive theory and numerical questions.</p>
                      <div className="flex items-center justify-center gap-4 mt-4">
                         <div className="px-4 py-1 bg-[#111827] border border-gray-800 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest text-blue-500">
                           Question {quizIdx + 1} / {currentResult.practiceQuestions.length}
                         </div>
                         <div className="px-4 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest text-green-500">
                           Accuracy: {quizIdx > 0 ? Math.round((score / quizIdx) * 100) : 0}%
                         </div>
                      </div>
                    </div>

                    {currentResult.practiceQuestions[quizIdx] ? (
                      <motion.div
                        key={quizIdx}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                      >
                        <Card className="bg-[#111827] border-gray-800 border-2 overflow-hidden shadow-2xl relative">
                          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-purple-600" />
                          <CardHeader className="pb-4">
                            <div className="flex items-center justify-between mb-4">
                              <Badge variant="outline" className="border-gray-700 text-gray-400 font-mono tracking-widest">
                                {currentResult.practiceQuestions[quizIdx].topic}
                              </Badge>
                              <Badge className="bg-red-500/20 text-red-500 border-red-500/30 font-bold uppercase text-[9px]">
                                {currentResult.practiceQuestions[quizIdx].difficulty}
                              </Badge>
                            </div>
                            <CardTitle className="text-xl md:text-2xl leading-tight font-display text-white">
                              {currentResult.practiceQuestions[quizIdx].text}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-6 pb-8">
                            <div className="grid grid-cols-1 gap-3">
                              {currentResult.practiceQuestions[quizIdx].options.map((option, oIdx) => {
                                const isCorrect = oIdx === currentResult.practiceQuestions[quizIdx].correctAnswer;
                                const isSelected = selectedOpt === oIdx;
                                
                                let bgColor = "bg-[#0B1120] hover:bg-gray-800 border-gray-800";
                                if (isAnswerRevealed) {
                                  if (isCorrect) bgColor = "bg-green-500/20 border-green-500 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.1)]";
                                  else if (isSelected) bgColor = "bg-red-500/20 border-red-500 text-red-400";
                                } else if (isSelected) {
                                  bgColor = "bg-blue-600/10 border-blue-600 text-blue-400";
                                }

                                return (
                                  <button
                                    key={oIdx}
                                    disabled={isAnswerRevealed}
                                    onClick={() => setSelectedOpt(oIdx)}
                                    className={`w-full p-4 text-left border-2 rounded-xl transition-all flex items-center gap-4 ${bgColor} ${!isAnswerRevealed && "active:scale-[0.98]"}`}
                                  >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 font-bold text-xs ${
                                      isAnswerRevealed && isCorrect ? "bg-green-500 border-green-500 text-[#0B1120]" :
                                      isAnswerRevealed && isSelected ? "bg-red-500 border-red-500 text-[#0B1120]" :
                                      isSelected ? "bg-blue-600 border-blue-600 text-white" :
                                      "bg-gray-800 border-gray-700 text-gray-500"
                                    }`}>
                                      {String.fromCharCode(65 + oIdx)}
                                    </div>
                                    <span className="font-medium text-sm md:text-base">{option}</span>
                                  </button>
                                );
                              })}
                            </div>

                            {isAnswerRevealed && (
                              <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`p-6 rounded-2xl border ${selectedOpt === currentResult.practiceQuestions[quizIdx].correctAnswer ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}
                              >
                                <div className="flex items-center gap-3 mb-3">
                                  {selectedOpt === currentResult.practiceQuestions[quizIdx].correctAnswer ? 
                                    <CheckCircle2 className="w-5 h-5 text-green-500" /> : 
                                    <AlertCircle className="w-5 h-5 text-red-500" />
                                  }
                                  <h4 className="font-bold uppercase tracking-widest text-xs">
                                    {selectedOpt === currentResult.practiceQuestions[quizIdx].correctAnswer ? 'Brilliant Decision!' : 'Incorrect Analysis'}
                                  </h4>
                                </div>
                                <div className="space-y-3">
                                  <p className="text-sm text-gray-300 leading-relaxed italic">
                                    <span className="font-bold text-gray-400 not-italic mr-1">Explanation:</span>
                                    {currentResult.practiceQuestions[quizIdx].explanation}
                                  </p>
                                </div>
                              </motion.div>
                            )}
                          </CardContent>
                          <CardFooter className="pt-0 pb-8 flex flex-col md:flex-row gap-4 border-t border-gray-800 pt-6">
                            {!isAnswerRevealed ? (
                              <Button 
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12"
                                disabled={selectedOpt === null}
                                onClick={() => {
                                  setIsAnswerRevealed(true);
                                  if (selectedOpt === currentResult.practiceQuestions[quizIdx].correctAnswer) {
                                    setScore(prev => prev + 1);
                                  }
                                }}
                              >
                                Check Intelligence Analysis
                                <ChevronRight className="w-5 h-5 ml-2" />
                              </Button>
                            ) : (
                              <div className="flex flex-col md:flex-row gap-3 w-full">
                                {selectedOpt !== currentResult.practiceQuestions[quizIdx].correctAnswer && (
                                  <Button 
                                    variant="outline"
                                    className="flex-1 border-gray-700 hover:bg-gray-800 text-gray-300 font-bold"
                                    onClick={() => {
                                      setIsAnswerRevealed(false);
                                      setSelectedOpt(null);
                                    }}
                                  >
                                    <History className="w-4 h-4 mr-2" />
                                    Retry Question
                                  </Button>
                                )}
                                <Button 
                                  className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold h-12"
                                  onClick={() => {
                                    setQuizIdx(prev => prev + 1);
                                    setSelectedOpt(null);
                                    setIsAnswerRevealed(false);
                                  }}
                                >
                                  {quizIdx === currentResult.practiceQuestions.length - 1 ? 'Conclude Analysis' : 'Next Strategic Question'}
                                  <ChevronRight className="w-5 h-5 ml-2" />
                                </Button>
                              </div>
                            )}
                          </CardFooter>
                        </Card>
                      </motion.div>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-12 border border-gray-800 rounded-[2rem] bg-[#111827] text-center space-y-8 shadow-2xl"
                      >
                        <div className="w-24 h-24 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto ring-4 ring-blue-600/20">
                          <CheckCircle2 className="w-12 h-12 text-blue-500" />
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-4xl font-bold font-display">Challenge Concluded</h4>
                          <p className="text-gray-400 max-w-sm mx-auto">You've finished the extreme interactive quiz. Check your final stats below.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                          <div className="p-4 bg-[#0B1120] border border-gray-800 rounded-2xl">
                             <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Total Score</p>
                             <p className="text-2xl font-bold text-white">{score} / {currentResult.practiceQuestions.length}</p>
                          </div>
                          <div className="p-4 bg-[#0B1120] border border-gray-800 rounded-2xl">
                             <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Final IQ Rank</p>
                             <p className="text-2xl font-bold text-blue-500">
                               {score === currentResult.practiceQuestions.length ? 'Elite' : 
                                score >= currentResult.practiceQuestions.length * 0.7 ? 'Senior' : 'Novice'}
                             </p>
                          </div>
                        </div>
                        <div className="pt-4 flex justify-center gap-4">
                          <Button 
                            variant="outline" 
                            className="bg-transparent border-gray-700 text-gray-400 hover:text-white"
                            onClick={() => {
                              setQuizIdx(0);
                              setScore(0);
                              setSelectedOpt(null);
                              setIsAnswerRevealed(false);
                            }}
                          >
                            Restart Quiz
                          </Button>
                          <Button 
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8"
                            onClick={() => setStep("UPLOAD")}
                          >
                            New Analysis
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
          {step === "NOTE_RESULTS" && currentNote && (
            <motion.div
              key="note-results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-4xl mx-auto space-y-12"
            >
              <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
                <div className="space-y-2 text-left">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 px-3 py-1 text-xs font-bold tracking-widest uppercase">Note Studio Report</Badge>
                    <Badge variant="outline" className="border-gray-700 text-gray-500 uppercase tracking-widest text-[9px] font-bold">
                       {currentNote.result.chapterContext.difficultyEstimate}
                    </Badge>
                  </div>
                  <h2 className="text-5xl font-bold font-display">{currentNote.result.chapterContext.chapterName}</h2>
                  <p className="text-gray-400 text-lg">{currentNote.result.chapterContext.subject}</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="border-gray-800 hover:bg-gray-800 text-xs font-bold" onClick={() => window.print()}>
                    Export PDF
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-12">
                {/* Summary Section */}
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-5 h-5 text-purple-500" />
                    <h3 className="text-xl font-bold uppercase tracking-widest text-gray-300">Detailed Chapter Summary</h3>
                  </div>
                  <div className="p-10 bg-[#111827] border border-gray-800 rounded-[2rem] relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />
                    <div className="prose prose-invert max-w-none">
                      <p className="text-gray-300 text-xl leading-relaxed first-letter:text-6xl first-letter:font-bold first-letter:text-purple-500 first-letter:mr-4 first-letter:float-left first-letter:leading-none">
                        {currentNote.result.summary}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Key Chapters/Short Notes */}
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-5 h-5 text-purple-500" />
                    <h3 className="text-xl font-bold uppercase tracking-widest text-gray-300">Distilled Concepts</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentNote.result.shortNotes.map((note, i) => (
                      <Card key={i} className="bg-[#111827] border-gray-800 hover:border-purple-500/30 transition-colors">
                        <CardHeader className="pb-3 px-6 pt-6">
                          <CardTitle className="text-sm font-bold text-purple-400 uppercase tracking-wide">{note.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="px-6 pb-6">
                          <ul className="space-y-2 pb-2">
                            {note.content.map((point, pi) => (
                              <li key={pi} className="text-xs text-gray-400 flex items-start gap-2 leading-relaxed">
                                <CheckCircle2 className="w-3 h-3 text-purple-500/50 mt-1 shrink-0" />
                                {point}
                              </li>
                            ))}
                          </ul>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>

                {/* Comprehension Questions */}
                <section className="space-y-6">
                  <div className="flex items-center gap-3">
                    <BrainCircuit className="w-5 h-5 text-purple-500" />
                    <h3 className="text-xl font-bold uppercase tracking-widest text-gray-300">Test Your Knowledge</h3>
                  </div>
                  <div className="space-y-4">
                    {currentNote.result.keyQuestions.map((kq, i) => (
                      <div key={i} className="group p-6 bg-[#0B1120] border border-gray-800 rounded-2xl hover:bg-gray-900/50 transition-all">
                        <div className="flex flex-col md:flex-row gap-4">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center gap-3">
                              <Badge className={`text-[9px] uppercase font-bold tracking-widest h-5 ${
                                kq.type === 'conceptual' ? 'bg-blue-500/20 text-blue-400' :
                                kq.type === 'application' ? 'bg-orange-500/20 text-orange-400' :
                                'bg-green-500/20 text-green-400'
                              }`}>
                                {kq.type}
                              </Badge>
                              <Badge variant="outline" className="text-[9px] border-gray-800 text-gray-400 uppercase tracking-widest h-5 font-bold">
                                {kq.marks} Marks
                              </Badge>
                              <span className="text-xs font-bold text-gray-500">QUESTION {i+1}</span>
                            </div>
                            <p className="text-lg font-bold text-white leading-tight">{kq.question}</p>
                            <div className="pt-2">
                              <p className="text-xs font-bold text-purple-500 uppercase tracking-widest mb-1 opacity-0 group-hover:opacity-100 transition-opacity">Model Answer</p>
                              <p className="text-sm text-gray-400 leading-relaxed italic">{kq.answer}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="pt-12 text-center border-t border-gray-800">
                 <Button variant="ghost" onClick={() => setStep("UPLOAD")} className="text-gray-500 hover:text-white">
                   <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
                   Back to Studio
                 </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
