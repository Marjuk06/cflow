'use client';

import { useState } from 'react';
import { AlignLeft, X, Languages, ChevronRight, CheckCircle2 } from 'lucide-react';

interface AlgorithmPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  algorithmEn?: string;
  algorithmBn?: string;
}

export default function AlgorithmPanel({ isOpen, onClose, title, algorithmEn, algorithmBn }: AlgorithmPanelProps) {
  // Default to Bengali since that's your primary teaching language
  const [language, setLanguage] = useState<'bn' | 'en'>('bn');

  // Helper to split the algorithm text into neat steps
  const renderSteps = (text: string | undefined, lang: 'bn' | 'en') => {
    if (!text) {
      return (
        <div className="flex flex-col items-center justify-center h-40 text-white/30 text-center">
          <Languages size={32} className="mb-3 opacity-50" />
          <p className="text-sm">
            {lang === 'bn' ? 'এই সমস্যার জন্য কোনো অ্যালগরিদম দেওয়া হয়নি।' : 'No algorithm provided for this problem.'}
          </p>
          <p className="text-xs mt-1 opacity-50">Upload an algorithm via the Sidebar!</p>
        </div>
      );
    }

    // Split by newlines and filter out empty lines
    const steps = text.split('\n').filter(step => step.trim() !== '');

    return (
      <div className="space-y-3 mt-4">
        {steps.map((step, index) => (
          <div key={index} className="flex gap-3 items-start bg-white/5 border border-white/5 rounded-xl p-3 hover:bg-white/10 transition-colors">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs font-bold border border-purple-500/30">
              {index + 1}
            </div>
            <p className="text-sm text-white/80 leading-relaxed pt-0.5">{step}</p>
          </div>
        ))}
        
        {/* End mark */}
        <div className="flex items-center gap-2 justify-center pt-4 opacity-50">
           <CheckCircle2 size={14} className="text-green-400" />
           <span className="text-xs font-bold uppercase tracking-widest text-green-400">End of Algorithm</span>
        </div>
      </div>
    );
  };

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
      <div className={`fixed top-0 right-0 h-full w-[400px] bg-[#0c1018]/95 backdrop-blur-3xl border-l border-white/10 z-[90] transform transition-transform duration-300 ease-in-out flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-black/40">
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
        <div className="flex-grow overflow-y-auto p-5">
          
          {/* Language Toggle Switch */}
          <div className="flex bg-black/50 p-1 rounded-lg border border-white/10 mb-6 relative">
            {/* Sliding highlight pill */}
            <div 
              className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white/10 border border-white/10 rounded-md transition-all duration-300 ease-in-out shadow-sm`}
              style={{ left: language === 'bn' ? '4px' : 'calc(50%)' }}
            />
            
            <button 
              onClick={() => setLanguage('bn')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold z-10 transition-colors ${language === 'bn' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              বাংলা
            </button>
            <button 
              onClick={() => setLanguage('en')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold z-10 transition-colors ${language === 'en' ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              English
            </button>
          </div>

          {/* Render the actual steps */}
          <div className="animate-in fade-in duration-300">
            {language === 'en' 
              ? renderSteps(algorithmEn, 'en') 
              : renderSteps(algorithmBn, 'bn')
            }
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-black/20 text-center">
           <p className="text-[10px] uppercase tracking-widest text-white/30 flex items-center justify-center gap-1">
             HSC ICT Preparation <ChevronRight size={10} />
           </p>
        </div>
      </div>
    </>
  );
}