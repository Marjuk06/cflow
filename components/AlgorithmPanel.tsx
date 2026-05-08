import React from 'react';
import { X, CheckCircle2, AlignLeft, ChevronRight, Languages } from 'lucide-react';
import 'katex/dist/katex.min.css';
import Latex from 'react-latex-next';

interface AlgorithmPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  algorithmBn?: string;
  algorithmEn?: string; // Kept to prevent TS errors from page.tsx, but ignored
}

export default function AlgorithmPanel({ isOpen, onClose, title, algorithmBn }: AlgorithmPanelProps) {

  // ─────────────────────────────────────────────
  // SMART PARSER: Fixes broken copy-paste text
  // ─────────────────────────────────────────────
  const parseSteps = (rawText?: string) => {
    if (!rawText) return [];
    let cleaned = rawText;
    
    // If the text is one massive block (no line breaks), 
    // magically split it right before every "ধাপ" (Step)
    if (!cleaned.includes('\n')) {
      // Regex detects "ধাপ-১", "ধাপ ২", etc., and injects a newline
      cleaned = cleaned.replace(/(ধাপ[-\s]*[১-৯0-9]+)/g, '\n$1').trim();
    }
    
    return cleaned.split('\n').map(s => s.trim()).filter(Boolean);
  };

  const steps = parseSteps(algorithmBn);

  return (
    <>
      {/* Dark Overlay (only when open) */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[80]" 
          onClick={onClose}
        />
      )}

      {/* Sliding Panel from the RIGHT */}
      <div className={`fixed top-0 right-0 h-full w-full md:w-[400px] bg-[#0c1018]/95 backdrop-blur-3xl border-l border-white/10 z-[90] transform transition-transform duration-300 ease-in-out flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Ambient Glass Glow */}
        <div className="absolute inset-0 bg-purple-900/10 blur-[120px] pointer-events-none" />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between p-5 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-3 text-white">
            <div className="p-1.5 bg-purple-500/20 rounded-lg border border-purple-500/30">
              <AlignLeft size={18} className="text-purple-300" />
            </div>
            <h2 className="text-base font-bold tracking-wide truncate max-w-[200px]">
              {title || "Algorithm"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-md transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="relative z-10 flex-grow overflow-y-auto p-5 custom-scrollbar">
          
          {steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-white/30 text-center mt-10">
              <Languages size={32} className="mb-3 opacity-50" />
              <p className="text-sm">এই সমস্যার জন্য কোনো অ্যালগরিদম দেওয়া হয়নি।</p>
              <p className="text-xs mt-1 opacity-50">Add an algorithm via the Admin Panel!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div key={idx} className="flex gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:bg-white/10 transition-colors animate-in fade-in slide-in-from-right-4" style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}>
                  
                  {/* Step Number Circle */}
                  <div className="shrink-0 w-7 h-7 rounded-full bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-xs font-bold text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]">
                    {idx + 1}
                  </div>
                  
                  {/* Step Text + LaTeX Math Rendering */}
                  <div className="text-sm text-white/80 leading-relaxed font-sans pt-1 overflow-x-auto">
                    <Latex>{step}</Latex>
                  </div>
                </div>
              ))}
              
              {/* End of Algorithm Badge */}
              <div className="flex items-center justify-center gap-2 mt-8 mb-4 text-green-400/80 text-xs font-bold tracking-widest uppercase bg-green-900/10 py-3 rounded-xl border border-green-500/20">
                <CheckCircle2 size={16} /> End of Algorithm
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative z-10 p-4 border-t border-white/10 bg-black/20 text-center shrink-0">
           <p className="text-[10px] uppercase tracking-widest text-white/30 flex items-center justify-center gap-1">
             HSC ICT Preparation <ChevronRight size={10} />
           </p>
        </div>
      </div>
    </>
  );
}