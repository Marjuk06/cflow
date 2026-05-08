'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Database, Plus, Search, Trash2, Edit3, Download, Upload, Loader2, Save, X } from 'lucide-react';
import Editor from '@monaco-editor/react';

export type Problem = {
  id: number;
  title: string;
  category: string;
  code: string;
  algorithm_bn?: string;
};

export default function AdminDashboard() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Selection & Forms
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingProblem, setEditingProblem] = useState<Partial<Problem> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchProblems(); }, []);

  const fetchProblems = async () => {
    setLoading(true);
    const { data } = await supabase.from('practice_problems').select('*').order('id', { ascending: true });
    if (data) setProblems(data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editingProblem?.title || !editingProblem?.category) return alert('Title and Category are required');
    setIsSaving(true);
    
    const payload = {
      title: editingProblem.title,
      category: editingProblem.category,
      code: editingProblem.code || '',
      algorithm_bn: editingProblem.algorithm_bn || ''
    };

    if (editingProblem.id) {
      await supabase.from('practice_problems').update(payload).eq('id', editingProblem.id);
    } else {
      await supabase.from('practice_problems').insert([payload]);
    }
    
    setIsSaving(false);
    setEditingProblem(null);
    fetchProblems();
  };

  const handleDelete = async (ids: number[]) => {
    if (!confirm(`Are you sure you want to delete ${ids.length} problem(s)?`)) return;
    await supabase.from('practice_problems').delete().in('id', ids);
    setSelectedIds(new Set());
    fetchProblems();
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  // ── EXPORT / IMPORT LOGIC ──
  const exportData = () => {
    const dataToExport = selectedIds.size > 0 
      ? problems.filter(p => selectedIds.has(p.id))
      : problems; // Export all if none selected
      
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codenest_problems_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedProblems = JSON.parse(event.target?.result as string);
        if (!Array.isArray(importedProblems)) throw new Error('Invalid JSON format');
        
        // Strip IDs to create new entries safely
        const payload = importedProblems.map(p => ({
          title: p.title, category: p.category, code: p.code, algorithm_bn: p.algorithm_bn
        }));
        
        await supabase.from('practice_problems').insert(payload);
        alert(`Successfully imported ${payload.length} problems!`);
        fetchProblems();
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const filteredProblems = problems.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#080b10] text-white p-6 font-sans selection:bg-purple-500/30">
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4 bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-500/20 rounded-xl"><Database className="text-purple-400" size={24} /></div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">CodeNest Admin</h1>
            <p className="text-xs text-white/40 uppercase tracking-widest mt-1">SaaS Management Dashboard</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
            <input type="text" placeholder="Search problems..." value={search} onChange={e => setSearch(e.target.value)} 
                   className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm outline-none focus:border-purple-500/50 transition-colors" />
          </div>
          
          <button onClick={exportData} title={selectedIds.size > 0 ? "Export Selected" : "Export All"} className="p-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500 hover:text-white rounded-lg transition-colors flex items-center gap-2">
            <Download size={16} /> <span className="hidden md:inline text-xs font-bold uppercase tracking-wider">{selectedIds.size > 0 ? 'Export Selected' : 'Export All'}</span>
          </button>
          
          <button onClick={() => fileInputRef.current?.click()} className="p-2.5 bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500 hover:text-white rounded-lg transition-colors flex items-center gap-2">
            <Upload size={16} /> <span className="hidden md:inline text-xs font-bold uppercase tracking-wider">Import JSON</span>
          </button>
          <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={importData} />
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ── LEFT: DATA TABLE ── */}
        <div className={`lg:col-span-${editingProblem ? '5' : '12'} bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl transition-all duration-300 flex flex-col h-[calc(100vh-140px)]`}>
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
            <h2 className="font-bold text-white/80">Database ({filteredProblems.length})</h2>
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <button onClick={() => handleDelete(Array.from(selectedIds))} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-md text-xs font-bold transition-colors">
                  <Trash2 size={14} /> Delete ({selectedIds.size})
                </button>
              )}
              <button onClick={() => setEditingProblem({ title: '', category: 'Basic', code: '', algorithm_bn: '' })} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-md text-xs font-bold shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:bg-purple-500 transition-colors">
                <Plus size={14} /> New Problem
              </button>
            </div>
          </div>
          
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="animate-spin text-purple-500" size={32} /></div>
            ) : (
              <table className="w-full text-left text-sm text-white/70">
                <thead className="bg-black/40 text-white/40 text-[10px] uppercase tracking-widest sticky top-0 z-10 backdrop-blur-md">
                  <tr>
                    <th className="p-4 w-12"><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? new Set(filteredProblems.map(p => p.id)) : new Set())} checked={selectedIds.size === filteredProblems.length && filteredProblems.length > 0} className="accent-purple-500" /></th>
                    <th className="p-4">Title</th>
                    <th className="p-4">Category</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredProblems.map(p => (
                    <tr key={p.id} className={`hover:bg-white/5 transition-colors ${selectedIds.has(p.id) ? 'bg-purple-500/10' : ''} ${editingProblem?.id === p.id ? 'bg-purple-900/20 border-l-2 border-purple-500' : ''}`}>
                      <td className="p-4"><input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="accent-purple-500" /></td>
                      <td className="p-4 font-medium text-white">{p.title}</td>
                      <td className="p-4"><span className="px-2 py-1 bg-white/10 rounded text-[10px] uppercase tracking-wider">{p.category}</span></td>
                      <td className="p-4 flex justify-end gap-2">
                        <button onClick={() => setEditingProblem(p)} className="p-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white rounded transition-colors"><Edit3 size={14} /></button>
                        <button onClick={() => handleDelete([p.id])} className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded transition-colors"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── RIGHT: EDITOR / FORM ── */}
        {editingProblem && (
          <div className="lg:col-span-7 bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl flex flex-col h-[calc(100vh-140px)] animate-in fade-in slide-in-from-right-8">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Edit3 size={18} className="text-purple-400" /> {editingProblem.id ? 'Edit Problem' : 'Create New Problem'}
              </h2>
              <button onClick={() => setEditingProblem(null)} className="p-1.5 text-white/40 hover:text-white rounded-md hover:bg-white/10 transition-colors"><X size={18} /></button>
            </div>
            
            <div className="p-5 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold ml-1">Title</label>
                  <input type="text" value={editingProblem.title} onChange={e => setEditingProblem({...editingProblem, title: e.target.value})} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-purple-500/50" />
                </div>
                <div className="w-1/3">
                  <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold ml-1">Category</label>
                  <input type="text" value={editingProblem.category} onChange={e => setEditingProblem({...editingProblem, category: e.target.value})} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-purple-500/50" />
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold ml-1 mb-1">Algorithm (Bangla / Markdown / Math)</label>
                <textarea 
                  value={editingProblem.algorithm_bn} 
                  onChange={e => setEditingProblem({...editingProblem, algorithm_bn: e.target.value})} 
                  placeholder="ধাপ-১: শুরু করি।&#10;ধাপ-২: $A$ ও $B$ ইনপুট নিই..."
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-purple-500/50 font-sans min-h-[120px] resize-y" 
                />
              </div>

              <div className="flex-1 flex flex-col min-h-[300px]">
                <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold ml-1 mb-1">C Code</label>
                <div className="flex-1 border border-white/10 rounded-lg overflow-hidden pt-2 bg-[#1e1e1e]">
                  <Editor 
                    height="100%" language="c" theme="vs-dark" 
                    value={editingProblem.code} 
                    onChange={v => setEditingProblem({...editingProblem, code: v || ''})} 
                    options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: 'monospace' }} 
                  />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/10 bg-black/20 flex justify-end">
              <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all">
                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Save to Database
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}