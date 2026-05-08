'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Database, Plus, Search, Trash2, Edit3, Download, Upload, Loader2, Save, X, Check, Play, PanelLeftClose, PanelLeft, CheckCircle2, AlertTriangle, Wand2 } from 'lucide-react';
import Editor from '@monaco-editor/react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  EdgeProps,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import 'katex/dist/katex.min.css';
import Latex from 'react-latex-next';

// ─────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────
export type Problem = { id: number; title: string; category: string; code: string; algorithm_bn?: string; };

const NODE_W = 220; const NODE_H = 58; const DEC_W = 180; const DEC_H = 180; const CON_R = 20;

// ─────────────────────────────────────────────
// FLOWCHART NODE COMPONENTS (Mirrored perfectly)
// ─────────────────────────────────────────────
const TerminalNode = ({ data }: any) => (
  <div style={{ minWidth: 110 }} className="rounded-full bg-gradient-to-br from-purple-900/80 to-purple-800/60 backdrop-blur-xl border-2 border-purple-400/80 px-8 py-3 shadow-[0_0_28px_rgba(168,85,247,0.5)] text-white text-center font-bold tracking-widest text-sm">
    <Handle type="target" position={Position.Top} style={{ opacity:0 }} />{data.label}<Handle type="source" position={Position.Bottom} style={{ opacity:0 }} />
  </div>
);
const ProcessNode = ({ data }: any) => (
  <div style={{ minWidth: NODE_W }} className="bg-slate-800/70 backdrop-blur-xl border border-slate-500/40 px-5 py-3 shadow-[0_2px_16px_rgba(0,0,0,0.4)] text-white text-center rounded-md font-mono text-sm">
    <Handle type="target" position={Position.Top} style={{ opacity:0 }} />{data.label}<Handle type="source" position={Position.Bottom} style={{ opacity:0 }} />
  </div>
);
const IONode = ({ data }: any) => (
  <div style={{ minWidth: NODE_W, clipPath:'polygon(8% 0%,100% 0%,92% 100%,0% 100%)' }} className="bg-blue-900/60 backdrop-blur-xl border border-blue-400/50 px-8 py-3 shadow-[0_0_18px_rgba(96,165,250,0.3)] text-white text-center font-medium text-sm">
    <Handle type="target" position={Position.Top} style={{ opacity:0 }} />{data.label}<Handle type="source" position={Position.Bottom} style={{ opacity:0 }} />
  </div>
);
const DecisionNode = ({ data }: any) => {
  const size = (data.label || '').length > 20 ? Math.min(200, 120 + (data.label||'').length * 3) : 112;
  const containerSize = size + 68;
  return (
    <div className="relative flex items-center justify-center" style={{ width: containerSize, height: containerSize }}>
      <div className="absolute bg-gradient-to-br from-orange-900/60 to-amber-800/40 backdrop-blur-xl border-2 border-orange-400/70 shadow-[0_0_24px_rgba(249,115,22,0.4)] rounded-sm" style={{ width: size, height: size, transform: 'rotate(45deg)' }} />
      <div className="relative z-10 text-white text-xs font-bold text-center px-4 leading-snug" style={{ maxWidth: size - 16 }}>
        <Handle type="target" position={Position.Top} style={{ opacity:0, top: -(containerSize/2 - 10) }} />{data.label}?
        <Handle id="yes" type="source" position={Position.Left} style={{ opacity:0, left: -(containerSize/2 - 10) }} />
        <Handle id="no" type="source" position={Position.Right} style={{ opacity:0, right: -(containerSize/2 - 10) }} />
        <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity:0, bottom:-(containerSize/2 - 10) }} />
      </div>
    </div>
  );
};
const ConnectorNode = () => (
  <div style={{ width: CON_R*2, height: CON_R*2 }} className="rounded-full bg-black border-2 border-purple-400/70 shadow-[0_0_10px_rgba(168,85,247,0.4)] flex items-center justify-center">
    <Handle type="target" position={Position.Top} style={{ opacity:0 }} /><Handle type="source" position={Position.Bottom} style={{ opacity:0 }} />
    <Handle id="left" type="target" position={Position.Left} style={{ opacity:0 }} /><Handle id="right" type="target" position={Position.Right} style={{ opacity:0 }} />
    <div className="w-2 h-2 rounded-full bg-purple-400/80" />
  </div>
);
function BackEdge({ id, sourceX, sourceY, targetX, targetY, label, markerEnd, style }: EdgeProps) {
  const path = `M ${sourceX} ${sourceY} L ${sourceX - 80} ${sourceY} L ${sourceX - 80} ${targetY} L ${targetX} ${targetY}`;
  return (
    <>
      <path id={id} style={style} className="react-flow__edge-path" d={path} markerEnd={markerEnd} fill="none" />
      {label && (
        <text>
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle" style={{ fill: '#fcd34d', fontWeight: 700, fontSize: 11 }}>
            {label as string}
          </textPath>
        </text>
      )}
    </>
  );
}
const nodeTypes = { terminal:TerminalNode, process:ProcessNode, io:IONode, decision:DecisionNode, connector:ConnectorNode };
const edgeTypes = { backEdge: BackEdge };

// ─────────────────────────────────────────────
// EXACT FRONTEND LABEL ENGINE & NORMALIZERS
// ─────────────────────────────────────────────
function extractInputVars(code: string): string {
  const m = code.match(/scanf\s*\([^)]+\)/i);
  if (m) {
    const inner = m[0].replace(/scanf\s*\(/i,'').replace(/\)$/,'');
    const vars = inner.split(',').slice(1).map(p => p.trim().replace(/^&/,'').replace(/\[.*\]/,'').trim()).filter(Boolean);
    if (!vars.length) return 'Input';
    if (vars.length === 1) return `Input ${vars[0]}`;
    const last = vars.pop()!;
    return `Input ${vars.join(', ')} and ${last}`;
  }
  const gm = code.match(/(?:gets|fgets)\s*\(\s*(\w+)/i);
  return gm ? `Input ${gm[1]}` : 'Input';
}

function extractOutputVars(code: string): string {
  const norm = code.replace(/\b(ptintf|pritnf|pirntf)\b/gi,'printf');
  const m = norm.match(/printf\s*\(\s*"([^"]*)"\s*(,([^)]*))?\)/i);
  if (!m) {
    const pm = norm.match(/puts\s*\(\s*"([^"]*)"\s*\)/i);
    return pm ? `Print "${pm[1]}"` : 'Output';
  }
  const fmt = m[1], args = m[3];
  const varList = args ? args.split(',').map(v=>v.trim().replace(/^&/,'')).filter(Boolean) : [];
  if (!fmt.includes('%')) return `Print "${fmt}"`;
  if (!varList.length) return 'Output';
  if (varList.length === 1) return `Print ${varList[0]}`;
  const last = varList[varList.length-1];
  return `Print ${varList.slice(0,-1).join(', ')} and ${last}`;
}

function simplifyProcess(code: string): string {
  return code.trim().replace(/;$/,'').trim().replace(/^(unsigned\s+|signed\s+|long\s+|short\s+)?(int|float|double|char|long|short|void)\s+/,'');
}

function resolveNode(node: any): { label: string; type: string } {
  if (node.id === 'end' || node.kind === 'terminal') return { label: 'End', type: 'terminal' };
  if (node.kind === 'decision') return { label: node.label, type: 'decision' };
  if (node.kind === 'connector') return { label: '', type: 'connector' };
  const raw = (node.label || '').trim();
  const norm = raw.replace(/\b(ptintf|pritnf|pirntf)\b/gi,'printf').replace(/\bscnaf\b/gi,'scanf');
  if (/scanf|gets|fgets|cin\s*>>/.test(norm)) return { label: extractInputVars(norm), type: 'io' };
  if (/printf|puts|cout\s*<</.test(norm))     return { label: extractOutputVars(norm), type: 'io' };
  return { label: simplifyProcess(raw), type: 'process' };
}

function removePromptNodes(rawNodes: any[], rawEdges: any[]) {
  const promptIds = new Set<string>();
  rawNodes.forEach((n: any) => {
    const norm = (n.label||'').replace(/\b(ptintf|pritnf)\b/gi,'printf');
    if (!/printf|puts/.test(norm)) return;
    const m = norm.match(/printf\s*\(\s*"([^"]*)"\s*\)/i);
    if (!m || m[1].includes('%')) return;
    const successors = rawEdges.filter(e => e.source === n.id);
    for (const se of successors) {
      const succ = rawNodes.find((x:any) => x.id === se.target);
      if (succ && /scanf|gets|fgets/.test((succ.label||'').replace(/\bscnaf\b/gi,'scanf'))) {
        promptIds.add(n.id); break;
      }
    }
  });
  if (!promptIds.size) return { nodes: rawNodes, edges: rawEdges };
  const filteredNodes = rawNodes.filter((n:any) => !promptIds.has(n.id));
  let filteredEdges = [...rawEdges];
  promptIds.forEach(pid => {
    const inc = filteredEdges.filter(e => e.target === pid);
    const out = filteredEdges.filter(e => e.source === pid);
    const bypass = inc.flatMap(i => out.map(o => ({ ...o, id:`${i.id}-bp`, source:i.source })));
    filteredEdges = filteredEdges.filter(e => e.source!==pid && e.target!==pid);
    filteredEdges.push(...bypass);
  });
  return { nodes: filteredNodes, edges: filteredEdges };
}

function injectConnectors(rawNodes: any[], rawEdges: any[]) {
  let nodes = [...rawNodes], edges = [...rawEdges];
  const endIncoming = edges.filter(e => e.target === 'end');
  if (endIncoming.length >= 2) {
    const cid = 'connector-end';
    nodes.push({ id: cid, kind: 'connector', label: '' });
    edges = edges.map(e => e.target === 'end' ? { ...e, id:`${e.id}-c`, target:cid } : e);
    edges.push({ id:`${cid}-end`, source:cid, target:'end', label:'' });
  }
  return { nodes, edges };
}

function mergeReturnNodes(rawNodes: any[], rawEdges: any[]) {
  const retIds = new Set(rawNodes.filter((n:any)=>n.kind==='return_statement').map((n:any)=>n.id));
  if (!retIds.size) return { nodes: rawNodes, edges: rawEdges };
  const fixedEdges = rawEdges.map((e:any) => retIds.has(e.target) ? {...e,id:`${e.id}-m`,target:'end'} : e);
  return { nodes: rawNodes.filter((n:any) => !retIds.has(n.id)), edges: fixedEdges.filter((e:any) => !retIds.has(e.source)) };
}

function tagBackEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const posMap: Record<string,{x:number,y:number}> = {};
  nodes.forEach(n => { posMap[n.id] = n.position; });
  return edges.map(e => {
    const src = posMap[e.source], tgt = posMap[e.target];
    if (src && tgt && src.y > tgt.y + 50) {
      return { ...e, type: 'backEdge', animated: true,
        style: { stroke: '#f59e0b', strokeWidth: 2, strokeDasharray: '6 3' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
        data: { ...e.data, isBackEdge: true },
      };
    }
    return e;
  });
}

function decisionHandle(label: string): string {
  if (label === 'Yes') return 'yes';
  if (label === 'No')  return 'no';
  return 'bottom';
}

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 90, nodesep: 80 });
  nodes.forEach((n) => {
    if (n.type === 'decision') g.setNode(n.id, { width: DEC_W, height: DEC_H });
    else if (n.type === 'connector') g.setNode(n.id, { width: CON_R * 2, height: CON_R * 2 });
    else g.setNode(n.id, { width: NODE_W, height: NODE_H });
  });
  edges.forEach((e) => { if (!e.data?.isBackEdge) g.setEdge(e.source, e.target); });
  dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id);
      if (!pos) return n;
      let w = NODE_W, h = NODE_H;
      if (n.type === 'decision') { w = DEC_W; h = DEC_H; }
      if (n.type === 'connector') { w = CON_R*2; h = CON_R*2; }
      return { ...n, position: { x: pos.x - w/2, y: pos.y - h/2 } };
    }), edges,
  };
};

// ─────────────────────────────────────────────
// MAIN ADMIN COMPONENT
// ─────────────────────────────────────────────
export default function AdminDashboard() {
  // ── AUTHENTICATION STATE ──
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode === 'marjuk06') {
      setIsAuthenticated(true);
      setAuthError(false);
    } else {
      setAuthError(true);
      setPasscode('');
    }
  };

  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [toast, setToast] = useState<{show: boolean, msg: string, type: 'success'|'error'}>({show: false, msg: '', type: 'success'});
  
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingProblem, setEditingProblem] = useState<Partial<Problem> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteModal, setDeleteModal] = useState<{ show: boolean, ids: number[] }>({ show: false, ids: [] });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Added for Algorithm Preview
  const [algoTab, setAlgoTab] = useState<'edit' | 'preview'>('edit');

  const parseSteps = (rawText?: string) => {
    if (!rawText) return [];
    let cleaned = rawText;
    if (!cleaned.includes('\n')) {
      cleaned = cleaned.replace(/(ধাপ[-\s]*[১-৯0-9]+)/g, '\n$1').trim();
    }
    return cleaned.split('\n').map(s => s.trim()).filter(Boolean);
  };

  useEffect(() => { fetchProblems(); }, []);

  const showToast = (msg: string, type: 'success'|'error') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000);
  };

  const fetchProblems = async () => {
    setLoading(true);
    const { data } = await supabase.from('practice_problems').select('*').order('id', { ascending: true });
    if (data) setProblems(data);
    setLoading(false);
  };

  const handleAlgoChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let val = e.target.value;
    if (val.length > 20 && !val.includes('\n') && /(ধাপ[-\s]*[১-৯0-9]+)/.test(val)) {
      val = val.replace(/(ধাপ[-\s]*[১-৯0-9]+)/g, '\n$1').trim();
      showToast('Algorithm Auto-Formatted!', 'success');
    }
    setEditingProblem({ ...editingProblem, algorithm_bn: val });
  };

  const handleSave = async () => {
    if (!editingProblem?.title || !editingProblem?.category) return showToast('Title and Category are required', 'error');
    setIsSaving(true);
    
    let prog = 0;
    const interval = setInterval(() => { prog += 15; setSaveProgress(Math.min(prog, 90)); }, 100);

    const payload = {
      title: editingProblem.title,
      category: editingProblem.category,
      code: editingProblem.code || '',
      algorithm_bn: editingProblem.algorithm_bn || ''
    };

    let error;
    if (editingProblem.id) {
      const res = await supabase.from('practice_problems').update(payload).eq('id', editingProblem.id);
      error = res.error;
    } else {
      const res = await supabase.from('practice_problems').insert([payload]);
      error = res.error;
    }
    
    clearInterval(interval);
    setSaveProgress(100);

    setTimeout(() => {
      setIsSaving(false);
      setSaveProgress(0);
      if (error) {
        showToast(`Error: ${error.message}`, 'error');
      } else {
        showToast('Problem saved successfully!', 'success');
        setEditingProblem(null);
        setIsSidebarOpen(true);
        fetchProblems();
      }
    }, 400);
  };

  const executeDelete = async () => {
    const ids = deleteModal.ids;
    await supabase.from('practice_problems').delete().in('id', ids);
    setSelectedIds(new Set());
    setDeleteModal({ show: false, ids: [] });
    showToast(`${ids.length} problem(s) deleted.`, 'success');
    fetchProblems();
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  // ─────────────────────────────────────────────
  // 1:1 EXACT PREVIEW LOGIC
  // ─────────────────────────────────────────────
  const handlePreviewFlowchart = async () => {
    if (!editingProblem?.code) return showToast('No code to preview!', 'error');
    setIsPreviewLoading(true);
    try {
      const res = await fetch('https://cflow-api.codenestui.top/parse', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ code: editingProblem.code }),
      });
      if (!res.ok) throw new Error('Failed to parse');
      const data = await res.json();

      // Apply all Frontend Normalizers
      const { nodes: rN, edges: rE } = mergeReturnNodes(data.nodes, data.edges);
      const { nodes: pN, edges: pE } = removePromptNodes(rN, rE);
      const { nodes: cN, edges: cE } = injectConnectors(pN, pE);

      const n: Node[] = [{ id:'start', type:'terminal', position:{x:0,y:0}, data:{label:'Start'} }];
      cN.forEach((node:any) => {
        const { label, type } = resolveNode(node);
        n.push({ id:node.id, type, position:{x:0,y:0}, data:{ label } });
      });

      const e: Edge[] = [];
      cE.forEach((edge:any) => {
        const srcNode = n.find(x => x.id === edge.source);
        const srcHandle = srcNode?.type === 'decision' ? decisionHandle(edge.label) : undefined;
        e.push({
          id: edge.id, source: edge.source, target: edge.target,
          sourceHandle: srcHandle,
          label: edge.label || undefined,
          type: 'smoothstep', animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color:'#a855f7' },
          style: { stroke:'#a855f7', strokeWidth:2 },
          labelStyle: { fill:'#fff', fontWeight:700, fontSize:12 },
          labelBgStyle: { fill:'#0f0f1e', fillOpacity:0.9, rx:5, ry:5 },
          labelBgPadding: [6,3] as [number,number],
        });
      });

      const layout = getLayoutedElements(n, e);
      const taggedEdges = tagBackEdges(layout.nodes, layout.edges);
      setNodes(layout.nodes);
      setEdges(taggedEdges);
    } catch (err) {
      showToast('Failed to generate preview', 'error');
    }
    setIsPreviewLoading(false);
  };

  const exportData = () => {
    const dataToExport = selectedIds.size > 0 ? problems.filter(p => selectedIds.has(p.id)) : problems; 
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `cflow_export_${new Date().toISOString().split('T')[0]}.json`; a.click();
    showToast('Export successful!', 'success');
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        const payload = imported.map((p:any) => ({ title: p.title, category: p.category, code: p.code, algorithm_bn: p.algorithm_bn }));
        await supabase.from('practice_problems').insert(payload);
        showToast(`Imported ${payload.length} problems!`, 'success');
        fetchProblems();
      } catch (err) { showToast('Invalid JSON file.', 'error'); }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const filteredProblems = problems.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()));

  const CustomCheckbox = ({ checked, onChange }: { checked: boolean, onChange: () => void }) => (
    <div className="relative flex items-center cursor-pointer" onClick={onChange}>
      <input type="checkbox" checked={checked} readOnly className="peer appearance-none w-4 h-4 bg-black/40 border border-white/20 rounded flex-shrink-0 checked:bg-purple-600 checked:border-purple-500 transition-colors" />
      <Check className="absolute left-0 top-0 text-white w-4 h-4 p-[2px] opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity" />
    </div>
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#080b10] flex items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-900/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="relative z-10 w-full max-w-md bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-[0_0_40px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-300">
          <div className="text-center mb-8">
            <div className="inline-flex p-3 bg-purple-500/20 rounded-xl mb-4 border border-purple-500/30">
              <Database className="text-purple-400" size={28} />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-wide">C-Flow Admin</h1>
            <p className="text-xs text-white/40 uppercase tracking-widest mt-2">Restricted Access</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input type="password" autoFocus placeholder="Enter Admin Passcode" value={passcode}
                onChange={(e) => { setPasscode(e.target.value); setAuthError(false); }}
                className={`w-full bg-black/40 border ${authError ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-purple-500/50'} rounded-xl p-3.5 text-center text-white tracking-widest outline-none transition-all`} />
              {authError && <p className="text-red-400 text-xs text-center mt-2 font-medium animate-pulse">Incorrect passcode</p>}
            </div>
            <button type="submit" className="w-full py-3.5 bg-purple-600/80 hover:bg-purple-500 backdrop-blur-md border border-purple-500/50 text-white rounded-xl font-bold shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all">
              Unlock Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#080b10] text-white flex flex-col font-sans overflow-hidden selection:bg-purple-500/30">
      
      {/* ── TOAST NOTIFICATION ── */}
      <div className={`fixed bottom-6 right-6 z-[100] transition-all duration-500 ease-in-out transform ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0 pointer-events-none'}`}>
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl ${toast.type === 'success' ? 'bg-green-950/40 border-green-500/30 text-green-300' : 'bg-red-950/40 border-red-500/30 text-red-300'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span className="text-sm font-bold">{toast.msg}</span>
        </div>
      </div>

      {/* ── DELETE MODAL ── */}
      {deleteModal.show && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
           <div className="bg-[#0c1018] border border-white/10 shadow-2xl rounded-2xl p-6 max-w-sm w-full mx-4 animate-in zoom-in-95">
             <div className="flex items-center gap-4 mb-4">
               <div className="p-3 bg-red-500/20 rounded-full text-red-400"><AlertTriangle size={24} /></div>
               <div>
                 <h3 className="text-lg font-bold text-white">Confirm Deletion</h3>
                 <p className="text-xs text-white/50 mt-1">This action cannot be undone.</p>
               </div>
             </div>
             <p className="text-sm text-white/80 mb-6 bg-white/5 p-3 rounded-lg border border-white/5">
               Are you sure you want to permanently delete {deleteModal.ids.length} problem(s)?
             </p>
             <div className="flex items-center gap-3 justify-end">
               <button onClick={() => setDeleteModal({show: false, ids: []})} className="px-4 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors">Cancel</button>
               <button onClick={executeDelete} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all">
                 <Trash2 size={16} /> Delete
               </button>
             </div>
           </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="shrink-0 flex items-center justify-between p-4 bg-white/5 border-b border-white/10 backdrop-blur-xl z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/60 transition-colors">
            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg"><Database className="text-purple-400" size={20} /></div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">C-Flow Admin</h1>
              <p className="text-[10px] text-white/40 uppercase tracking-widest mt-0.5">Code Management Dashboard</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={exportData} className="px-4 py-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500 hover:text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
            <Download size={14} /> Export
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500 hover:text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
            <Upload size={14} /> Import
          </button>
          <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={importData} />
        </div>
      </header>

      {/* ── MAIN WORKSPACE ── */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ── SIDEBAR (Database List) ── */}
        <div className={`shrink-0 flex flex-col bg-black/20 border-r border-white/10 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-[320px] opacity-100' : 'w-0 opacity-0 overflow-hidden border-none'}`}>
          <div className="p-4 border-b border-white/10 space-y-3">
            <button 
              onClick={() => { setEditingProblem({ title: '', category: 'Basic', code: '', algorithm_bn: '' }); setIsSidebarOpen(false); setNodes([]); }} 
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white rounded-lg text-sm font-bold shadow-lg transition-all"
            >
              <Plus size={16} /> New Problem
            </button>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
              <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} 
                     className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs outline-none focus:border-purple-500/50" />
            </div>
            {selectedIds.size > 0 && (
               <button onClick={() => setDeleteModal({show:true, ids: Array.from(selectedIds)})} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg text-xs font-bold transition-colors">
                 <Trash2 size={14} /> Delete Selected ({selectedIds.size})
               </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
               <div className="flex justify-center py-10"><Loader2 className="animate-spin text-purple-500" size={24} /></div>
            ) : (
              <div className="divide-y divide-white/5">
                {filteredProblems.map(p => (
                  <div key={p.id} className={`p-4 hover:bg-white/5 transition-colors cursor-pointer group ${editingProblem?.id === p.id ? 'bg-purple-900/20 border-l-2 border-purple-500' : 'border-l-2 border-transparent'}`}>
                    <div className="flex items-start gap-3">
                      <div className="pt-1"><CustomCheckbox checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} /></div>
                      <div className="flex-1" onClick={() => { setEditingProblem(p); setIsSidebarOpen(false); setNodes([]); }}>
                        <h3 className="text-sm font-medium text-white/90 group-hover:text-purple-300 transition-colors line-clamp-1">{p.title}</h3>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-white/10 rounded text-[9px] uppercase tracking-wider text-white/50">{p.category}</span>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteModal({show:true, ids:[p.id]}); }} className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── EDITOR AREA (3 Panes) ── */}
        {editingProblem ? (
          <div className="flex-1 flex bg-[#0c1018] overflow-hidden">
            
            {/* PANE 1: Meta & Algorithm */}
            <div className="w-[30%] flex flex-col border-r border-white/10 bg-black/20">
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                 <h2 className="text-sm font-bold text-white flex items-center gap-2"><Edit3 size={16} className="text-purple-400"/> Details</h2>
                 <button onClick={() => { setEditingProblem(null); setIsSidebarOpen(true); }} className="text-white/40 hover:text-white"><X size={16}/></button>
              </div>
              <div className="flex-1 p-5 overflow-y-auto custom-scrollbar space-y-5">
                <div>
                  <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold ml-1">Title</label>
                  <input type="text" value={editingProblem.title} onChange={e => setEditingProblem({...editingProblem, title: e.target.value})} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-purple-500/50" />
                </div>
                <div>
                  <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold ml-1">Category</label>
                  <input type="text" value={editingProblem.category} onChange={e => setEditingProblem({...editingProblem, category: e.target.value})} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-purple-500/50" />
                </div>
                <div className="flex flex-col flex-1 min-h-[250px]">
                  <div className="flex justify-between items-end mb-2 ml-1">
                    <label className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Algorithm (Bangla / Math)</label>
                    <div className="flex items-center gap-2">
                      {/* ── EDIT / PREVIEW TOGGLE ── */}
                      <div className="flex bg-black/40 border border-white/10 rounded overflow-hidden">
                        <button onClick={() => setAlgoTab('edit')} className={`px-3 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors ${algoTab === 'edit' ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white/70'}`}>Edit</button>
                        <button onClick={() => setAlgoTab('preview')} className={`px-3 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors ${algoTab === 'preview' ? 'bg-purple-600 text-white' : 'text-white/40 hover:text-white/70'}`}>Preview</button>
                      </div>
                      <button onClick={() => handleAlgoChange({target:{value: editingProblem.algorithm_bn || ''}} as any)} title="Auto-Format Steps" className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 bg-purple-500/10 px-2 py-1 rounded transition-colors">
                        <Wand2 size={10} /> Format
                      </button>
                    </div>
                  </div>
                  
                  {/* ── CONDITIONAL RENDER ── */}
                  {algoTab === 'edit' ? (
                    <textarea value={editingProblem.algorithm_bn} onChange={handleAlgoChange} placeholder="ধাপ-১: শুরু করি।&#10;ধাপ-২: $A$ ও $B$ ইনপুট নিই..." className="w-full flex-1 bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white outline-none focus:border-purple-500/50 font-sans resize-none" />
                  ) : (
                    <div className="w-full flex-1 bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white/80 overflow-y-auto custom-scrollbar space-y-4">
                      {parseSteps(editingProblem.algorithm_bn).map((step, idx) => (
                        <div key={idx} className="flex gap-3 animate-in fade-in">
                          <div className="shrink-0 w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-[10px] font-bold text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]">
                            {idx + 1}
                          </div>
                          <div className="pt-0.5 font-sans leading-relaxed overflow-x-auto">
                            <Latex>{step}</Latex>
                          </div>
                        </div>
                      ))}
                      {!editingProblem.algorithm_bn && <div className="text-white/30 text-xs text-center mt-4">No algorithm to preview.</div>}
                    </div>
                  )}
                </div>
              </div>
              {/* GLASS SAVE BUTTON */}
              <div className="p-4 border-t border-white/10 bg-black/40 shrink-0">
                <button onClick={handleSave} disabled={isSaving} className="relative w-full overflow-hidden flex items-center justify-center gap-2 py-3 bg-purple-600/40 backdrop-blur-md border border-purple-500/50 hover:bg-purple-600/60 text-white rounded-xl font-bold shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all">
                  <div className="absolute top-0 left-0 h-full bg-purple-500 transition-all duration-100 ease-out z-0" style={{ width: `${saveProgress}%`, opacity: isSaving ? 1 : 0 }} />
                  <div className="relative z-10 flex items-center gap-2">
                    {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                    {isSaving ? 'Saving...' : 'Save to Database'}
                  </div>
                </button>
              </div>
            </div>

            {/* PANE 2: C Code Editor */}
            <div className="w-[35%] flex flex-col border-r border-white/10">
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                 <h2 className="text-sm font-bold text-white">C Code</h2>
              </div>
              <div className="flex-1 relative">
                <Editor height="100%" language="c" theme="vs-dark" value={editingProblem.code} onChange={v => setEditingProblem({...editingProblem, code: v || ''})} options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: 'monospace', padding: { top: 16 } }} />
              </div>
            </div>

            {/* PANE 3: Flowchart Preview */}
            <div className="w-[35%] flex flex-col bg-[#05050a] relative">
              <div className="absolute inset-0 bg-blue-900/10 blur-[120px] pointer-events-none" />
              <div className="relative z-10 p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                 <h2 className="text-sm font-bold text-white">Flowchart Preview</h2>
                 <button onClick={handlePreviewFlowchart} disabled={isPreviewLoading} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-md text-xs font-bold text-white transition-colors">
                   {isPreviewLoading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Preview
                 </button>
              </div>
              <div className="flex-1 relative z-10">
                {nodes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/20">
                    <span className="text-sm">Click Preview to generate flowchart</span>
                  </div>
                ) : (
                  <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView colorMode="dark" minZoom={0.1} maxZoom={2.5} proOptions={{ hideAttribution: true }}>
                    <Background color="rgba(255,255,255,0.03)" gap={24} size={1} />
                    <Controls position="bottom-right" className="!bg-black/50 !border-white/10 backdrop-blur-xl" showInteractive={false} />
                  </ReactFlow>
                )}
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-white/20 select-none">
            <Database size={64} className="mb-4 opacity-20" />
            <h2 className="text-xl font-bold">Code Management Dashboard</h2>
            <p className="text-sm mt-2">Select a problem from the sidebar or create a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}