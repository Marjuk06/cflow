'use client';

import { useState, useEffect } from 'react';
import { Menu, X, BookOpen, Code2, Loader2, Plus, Upload, CheckCircle2, Trash2, AlertTriangle, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Added optional algorithms to the type
export type Problem = {
  id: number;
  title: string;
  category: string;
  code: string;
  algorithm_en?: string;
  algorithm_bn?: string;
};

// NOTICE: We changed onSelectCode to onSelectProblem so we can pass the WHOLE object to page.tsx!
export default function Sidebar({ onSelectProblem, currentCode }: { onSelectProblem: (p: Problem) => void, currentCode: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Form States
  const [isUploadMode, setIsUploadMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null); // Tracks if we are editing vs creating
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newAlgoEn, setNewAlgoEn] = useState('');
  const [newAlgoBn, setNewAlgoBn] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  const [problemToDelete, setProblemToDelete] = useState<{ id: number, title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchProblems = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('practice_problems').select('*').order('id', { ascending: true });
    if (!error && data) setProblems(data);
    setIsLoading(false);
  };

  useEffect(() => { fetchProblems(); }, []);

  // Handles both Create New AND Update Existing
  const handleUpload = async () => {
    if (!newTitle || !newCategory) return;
    setIsUploading(true);

    const payload = { 
      title: newTitle, category: newCategory, code: currentCode,
      algorithm_en: newAlgoEn, algorithm_bn: newAlgoBn 
    };

    let error;
    if (editingId) {
      // UPDATE EXISTING
      const res = await supabase.from('practice_problems').update(payload).eq('id', editingId);
      error = res.error;
    } else {
      // CREATE NEW
      const res = await supabase.from('practice_problems').insert([payload]);
      error = res.error;
    }

    setIsUploading(false);

    if (!error) {
      setSuccessMsg(true);
      fetchProblems(); 
      setTimeout(() => {
        setSuccessMsg(false);
        setIsUploadMode(false);
        resetForm();
      }, 1500);
    } else {
      alert("Failed to save: " + error.message);
    }
  };

  const resetForm = () => {
    setEditingId(null); setNewTitle(''); setNewCategory(''); setNewAlgoEn(''); setNewAlgoBn('');
  };

  // Triggers Edit Mode
  const startEditing = (e: React.MouseEvent, p: Problem) => {
    e.stopPropagation();
    setEditingId(p.id);
    setNewTitle(p.title);
    setNewCategory(p.category);
    setNewAlgoEn(p.algorithm_en || '');
    setNewAlgoBn(p.algorithm_bn || '');
    setIsUploadMode(true); // Open the form!
  };

  const confirmDelete = (e: React.MouseEvent, id: number, title: string) => {
    e.stopPropagation(); 
    setProblemToDelete({ id, title }); 
  };

  const executeDelete = async () => {
    if (!problemToDelete) return;
    setIsDeleting(true);
    const { error } = await supabase.from('practice_problems').delete().eq('id', problemToDelete.id);
    setIsDeleting(false);
    if (!error) {
      setProblems(problems.filter(p => p.id !== problemToDelete.id)); 
      setProblemToDelete(null); 
    } else {
      alert("Failed to delete: " + error.message);
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)} className="absolute top-4 left-4 z-50 p-2.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl text-white/70 hover:text-white hover:bg-purple-900/30 transition-all shadow-lg">
        <Menu size={20} />
      </button>

      {isOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]" onClick={() => setIsOpen(false)} />}

      <div className={`fixed top-0 left-0 h-full w-[360px] bg-[#0c1018]/95 backdrop-blur-3xl border-r border-white/10 z-[70] transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        <div className="flex items-center justify-between p-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 text-white">
            <BookOpen size={22} className="text-purple-400" />
            <h2 className="text-lg font-bold tracking-wide">Practice Sheet</h2>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setIsUploadMode(!isUploadMode);
                if (!isUploadMode) resetForm(); // Clear form when opening "New"
              }} 
              className={`p-1.5 rounded-md transition-colors ${isUploadMode && !editingId ? 'bg-purple-600/30 text-purple-300' : 'text-white/50 hover:text-white hover:bg-white/10'}`} title="Add New Problem"
            >
              {isUploadMode && !editingId ? <BookOpen size={18} /> : <Plus size={18} />}
            </button>
            <button onClick={() => setIsOpen(false)} className="p-1.5 text-white/50 hover:text-white rounded-md hover:bg-white/10 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-2 custom-scrollbar">
          {isUploadMode ? (
            <div className="bg-white/5 border border-purple-500/30 rounded-xl p-4 space-y-4 animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-2 text-purple-300 mb-2">
                {editingId ? <Pencil size={16} /> : <Upload size={16} />}
                <span className="text-sm font-bold uppercase tracking-widest">{editingId ? 'Edit Problem' : 'Upload to Cloud'}</span>
              </div>
              
              <div>
                <label className="text-xs text-white/50 pl-1">Problem Title</label>
                <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm text-white outline-none focus:border-purple-500/60" />
              </div>
              <div>
                <label className="text-xs text-white/50 pl-1">Category</label>
                <input type="text" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm text-white outline-none focus:border-purple-500/60" />
              </div>
              <div>
                <label className="text-xs text-white/50 pl-1">Algorithm (English)</label>
                <textarea value={newAlgoEn} onChange={(e) => setNewAlgoEn(e.target.value)} rows={3} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm text-white outline-none focus:border-purple-500/60 resize-none" />
              </div>
              <div>
                <label className="text-xs text-white/50 pl-1">অ্যালগরিদম (বাংলা)</label>
                <textarea value={newAlgoBn} onChange={(e) => setNewAlgoBn(e.target.value)} rows={3} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg p-2.5 text-sm text-white outline-none focus:border-purple-500/60 resize-none font-sans" />
              </div>

              <div className="bg-black/30 rounded-lg p-3 border border-white/5 text-xs text-white/40 font-mono line-clamp-2">
                {currentCode || "// No code in editor"}
              </div>

              <button onClick={handleUpload} disabled={isUploading || !newTitle || !newCategory} className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white rounded-lg p-2.5 font-bold shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:bg-purple-500 transition-colors disabled:opacity-50">
                {isUploading ? <Loader2 size={16} className="animate-spin" /> : successMsg ? <CheckCircle2 size={16} /> : <Upload size={16} />}
                {successMsg ? 'Saved!' : (editingId ? 'Update Cloud' : 'Save to Cloud')}
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-white/40 uppercase tracking-widest font-bold mb-4 ml-2">78 HSC Problems</p>
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-10 text-white/40">
                  <Loader2 size={24} className="animate-spin mb-2 text-purple-500" />
                </div>
              ) : problems.length === 0 ? (
                <div className="text-center py-10 text-white/40 text-sm">No problems found.</div>
              ) : (
                problems.map((problem) => (
                  <div key={problem.id} className="relative group">
                    <button onClick={() => { onSelectProblem(problem); setIsOpen(false); }} className="w-full text-left p-3 rounded-xl bg-white/5 border border-white/5 hover:border-purple-500/40 hover:bg-purple-900/20 transition-all">
                      <div className="flex items-center justify-between pr-14">
                        <span className="text-sm font-medium text-white/80 group-hover:text-purple-300 transition-colors">{problem.title}</span>
                      </div>
                      <p className="text-[10px] text-white/30 mt-1 uppercase tracking-wider">{problem.category}</p>
                    </button>
                    
                    {/* EDIT BUTTON */}
                    <button 
                      onClick={(e) => startEditing(e, problem)} 
                      className="absolute top-[10px] right-9 p-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded-md opacity-0 group-hover:opacity-100 transition-all"
                      title="Edit Problem"
                    >
                      <Pencil size={14} />
                    </button>

                    {/* DELETE BUTTON */}
                    <button 
                      onClick={(e) => confirmDelete(e, problem.id, problem.title)} 
                      className="absolute top-[10px] right-2 p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-md opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete Problem"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-white/10 bg-black/20 shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">CodeNest Academic</p>
          <a href="https://github.com/Marjuk06" target="_blank" rel="noopener noreferrer" className="text-[10px] text-white/30 hover:text-purple-400 transition-colors">
            Developed by Marjuk Amin
          </a>
        </div>
      </div>

      {/* Delete Modal omitted for brevity, keep the same as before! */}
      {problemToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
           {/* ... exact same delete modal code ... */}
           <div className="bg-[#0c1018] border border-white/10 shadow-2xl rounded-2xl p-6 max-w-sm w-full mx-4">
             <div className="flex items-center gap-4 mb-4">
               <div className="p-3 bg-red-500/20 rounded-full text-red-400"><AlertTriangle size={24} /></div>
               <div>
                 <h3 className="text-lg font-bold text-white">Delete Problem</h3>
                 <p className="text-xs text-white/50 mt-1">This action cannot be undone.</p>
               </div>
             </div>
             <p className="text-sm text-white/80 mb-6 bg-white/5 p-3 rounded-lg border border-white/5">
               Are you sure you want to permanently delete <span className="font-bold text-white">"{problemToDelete.title}"</span>?
             </p>
             <div className="flex items-center gap-3 justify-end">
               <button onClick={() => setProblemToDelete(null)} disabled={isDeleting} className="px-4 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors">Cancel</button>
               <button onClick={executeDelete} disabled={isDeleting} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all">
                 {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                 {isDeleting ? 'Deleting...' : 'Delete'}
               </button>
             </div>
           </div>
        </div>
      )}
    </>
  );
}