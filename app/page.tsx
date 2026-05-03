'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  Panel,
  BaseEdge,
  EdgeProps,
  getSmoothStepPath,
  getBezierPath,
} from '@xyflow/react';
import Editor, { loader } from '@monaco-editor/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { Play, Download, RotateCcw, Terminal, Send, Eraser, AlignLeft } from 'lucide-react';
import Sidebar from '../components/sidebar';
import AlgorithmPanel from '../components/AlgorithmPanel';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────
// MONACO C Completions
// ─────────────────────────────────────────────
if (typeof window !== 'undefined') {
  loader.init().then((monaco) => {
  monaco.languages.registerCompletionItemProvider('c', {
    triggerCharacters: [' ', '\t', '(', '<', '"', '#'],
provideCompletionItems(model: any, position: any) {
        const word  = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
        startColumn: word.startColumn, endColumn: word.endColumn,
      };
      const CK = monaco.languages.CompletionItemKind;
      const s = (label: string, insert: string, detail: string, kind = CK.Snippet) => ({
        label, insertText: insert, detail, kind, range,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      });
      const kw = (label: string) => ({ label, insertText: label, kind: CK.Keyword, detail: 'keyword', range,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet });
      return { suggestions: [
        kw('int'), kw('float'), kw('double'), kw('char'), kw('void'), kw('if'), kw('else'),
        kw('while'), kw('for'), kw('do'), kw('return'), kw('break'), kw('continue'),
        kw('switch'), kw('case'), kw('struct'), kw('typedef'), kw('const'), kw('static'),
        kw('long'), kw('short'), kw('unsigned'), kw('signed'), kw('sizeof'),
        s('printf',  'printf("${1:%s}", ${2:var});', 'print formatted'),
        s('scanf',   'scanf("${1:%d}", &${2:var});', 'read input'),
        s('if',      'if(${1:cond}){\n\t${2}\n}', 'if'),
        s('if-else', 'if(${1:cond}){\n\t${2}\n} else {\n\t${3}\n}', 'if-else'),
        s('for',     'for(int ${1:i}=0; ${1:i}<${2:n}; ${1:i}++){\n\t${3}\n}', 'for loop'),
        s('while',   'while(${1:cond}){\n\t${2}\n}', 'while loop'),
        s('main',    'int main(){\n\t${1}\n\treturn 0;\n}', 'main function'),
        s('#include','#include <${1:stdio.h}>', 'include'),
      ]};
    },
  });
  monaco.languages.registerHoverProvider('c', {
provideHover(model: any, position: any) {
        const word = model.getWordAtPosition(position);
      if (!word) return null;
      const tips: Record<string,string> = {
        ptintf:'⚠ Did you mean **printf**?', pritnf:'⚠ Did you mean **printf**?',
        scnaf:'⚠ Did you mean **scanf**?', pirntf:'⚠ Did you mean **printf**?',
      };
      const tip = tips[word.word];
      return tip ? { contents: [{ value: tip }] } : null;
    },
  });
});
}

// ─────────────────────────────────────────────
// NODE SIZES
// ─────────────────────────────────────────────
const NODE_W = 220;
const NODE_H = 58;
const DEC_W  = 180;
const DEC_H  = 180;
const CON_R  = 20;

// ─────────────────────────────────────────────
// DAGRE LAYOUT — with back-edge awareness
// ─────────────────────────────────────────────
const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  // Extra ranksep/nodesep for loop back-edges to have room
  g.setGraph({ rankdir: 'TB', ranksep: 90, nodesep: 80 });

  nodes.forEach((n) => {
    if (n.type === 'decision')   g.setNode(n.id, { width: DEC_W, height: DEC_H });
    else if (n.type === 'connector') g.setNode(n.id, { width: CON_R * 2, height: CON_R * 2 });
    else g.setNode(n.id, { width: NODE_W, height: NODE_H });
  });

  // Only feed forward-edges to dagre (exclude back-edges marked as such)
  edges.forEach((e) => {
    if (!e.data?.isBackEdge) g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id);
      if (!pos) return n;
      let w = NODE_W, h = NODE_H;
      if (n.type === 'decision')   { w = DEC_W; h = DEC_H; }
      if (n.type === 'connector')  { w = CON_R*2; h = CON_R*2; }
      return { ...n, position: { x: pos.x - w/2, y: pos.y - h/2 } };
    }),
    edges,
  };
};

// ─────────────────────────────────────────────
// CUSTOM BACK-EDGE (loops back upward, routes left)
// ─────────────────────────────────────────────
function BackEdge({ id, sourceX, sourceY, targetX, targetY, label, markerEnd, style }: EdgeProps) {
  // Route the edge out to the left to avoid overlapping nodes
  const offset = 80;
  const path = `M ${sourceX} ${sourceY}
    L ${sourceX - offset} ${sourceY}
    L ${sourceX - offset} ${targetY}
    L ${targetX} ${targetY}`;
  return (
    <>
      <path id={id} style={style} className="react-flow__edge-path" d={path} markerEnd={markerEnd} fill="none" />
      {label && (
        <text>
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle"
            style={{ fill: '#fcd34d', fontWeight: 700, fontSize: 11 }}>
            {label as string}
          </textPath>
        </text>
      )}
    </>
  );
}

const edgeTypes = { backEdge: BackEdge };

// ─────────────────────────────────────────────
// NODE COMPONENTS
// ─────────────────────────────────────────────
const TerminalNode = ({ data }: any) => (
  <div style={{ minWidth: 110 }}
    className="rounded-full bg-gradient-to-br from-purple-900/80 to-purple-800/60
               backdrop-blur-xl border-2 border-purple-400/80 px-8 py-3
               shadow-[0_0_28px_rgba(168,85,247,0.5)] text-white text-center font-bold tracking-widest text-sm">
    <Handle type="target" position={Position.Top}    style={{ opacity:0 }} />
    {data.label}
    <Handle type="source" position={Position.Bottom} style={{ opacity:0 }} />
  </div>
);

const ProcessNode = ({ data }: any) => (
  <div style={{ minWidth: NODE_W }}
    className="bg-slate-800/70 backdrop-blur-xl border border-slate-500/40
               px-5 py-3 shadow-[0_2px_16px_rgba(0,0,0,0.4)]
               text-white text-center rounded-md font-mono text-sm">
    <Handle type="target" position={Position.Top}    style={{ opacity:0 }} />
    {data.label}
    <Handle type="source" position={Position.Bottom} style={{ opacity:0 }} />
  </div>
);

const IONode = ({ data }: any) => (
  <div style={{ minWidth: NODE_W, clipPath:'polygon(8% 0%,100% 0%,92% 100%,0% 100%)' }}
    className="bg-blue-900/60 backdrop-blur-xl border border-blue-400/50 px-8 py-3
               shadow-[0_0_18px_rgba(96,165,250,0.3)] text-white text-center font-medium text-sm">
    <Handle type="target" position={Position.Top}    style={{ opacity:0 }} />
    {data.label}
    <Handle type="source" position={Position.Bottom} style={{ opacity:0 }} />
  </div>
);

// Dynamic width for long conditions
const DecisionNode = ({ data }: any) => {
  const label = data.label || '';
  const size = label.length > 20 ? Math.min(200, 120 + label.length * 3) : 112;
  const containerSize = size + 68;
  return (
    <div className="relative flex items-center justify-center"
      style={{ width: containerSize, height: containerSize }}>
      <div className="absolute bg-gradient-to-br from-orange-900/60 to-amber-800/40
                      backdrop-blur-xl border-2 border-orange-400/70
                      shadow-[0_0_24px_rgba(249,115,22,0.4)] rounded-sm"
           style={{ width: size, height: size, transform: 'rotate(45deg)' }} />
      <div className="relative z-10 text-white text-xs font-bold text-center px-4 leading-snug"
           style={{ maxWidth: size - 16 }}>
        <Handle type="target" position={Position.Top}    style={{ opacity:0, top: -(containerSize/2 - 10) }} />
        {label}?
        <Handle id="yes"    type="source" position={Position.Left}   style={{ opacity:0, left:  -(containerSize/2 - 10) }} />
        <Handle id="no"     type="source" position={Position.Right}  style={{ opacity:0, right: -(containerSize/2 - 10) }} />
        <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity:0, bottom:-(containerSize/2 - 10) }} />
      </div>
    </div>
  );
};

const ConnectorNode = () => (
  <div style={{ width: CON_R*2, height: CON_R*2 }}
    className="rounded-full bg-black border-2 border-purple-400/70
               shadow-[0_0_10px_rgba(168,85,247,0.4)] flex items-center justify-center">
    <Handle type="target" position={Position.Top}    style={{ opacity:0 }} />
    <Handle type="source" position={Position.Bottom} style={{ opacity:0 }} />
    <Handle id="left"  type="target" position={Position.Left}  style={{ opacity:0 }} />
    <Handle id="right" type="target" position={Position.Right} style={{ opacity:0 }} />
    <div className="w-2 h-2 rounded-full bg-purple-400/80" />
  </div>
);

const nodeTypes = { terminal:TerminalNode, process:ProcessNode, io:IONode, decision:DecisionNode, connector:ConnectorNode };

// ─────────────────────────────────────────────
// LABEL ENGINE
// ─────────────────────────────────────────────
function extractInputVars(code: string): string {
  const m = code.match(/scanf\s*\([^)]+\)/i);
  if (m) {
    const inner = m[0].replace(/scanf\s*\(/i,'').replace(/\)$/,'');
    const vars = inner.split(',').slice(1)
      .map(p => p.trim().replace(/^&/,'').replace(/\[.*\]/,'').trim())
      .filter(Boolean);
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
  return code.trim().replace(/;$/,'').trim()
    .replace(/^(unsigned\s+|signed\s+|long\s+|short\s+)?(int|float|double|char|long|short|void)\s+/,'');
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

// ─────────────────────────────────────────────
// REMOVE PROMPT PRINTF (before scanf)
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// CONNECTOR INJECTION (merge before End)
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// MERGE RETURN NODES → end
// ─────────────────────────────────────────────
function mergeReturnNodes(rawNodes: any[], rawEdges: any[]) {
  const retIds = new Set(rawNodes.filter((n:any)=>n.kind==='return_statement').map((n:any)=>n.id));
  if (!retIds.size) return { nodes: rawNodes, edges: rawEdges };
  const fixedEdges = rawEdges.map((e:any) => retIds.has(e.target) ? {...e,id:`${e.id}-m`,target:'end'} : e);
  return {
    nodes: rawNodes.filter((n:any) => !retIds.has(n.id)),
    edges: fixedEdges.filter((e:any) => !retIds.has(e.source)),
  };
}

// ─────────────────────────────────────────────
// DETECT BACK EDGES (source Y > target Y = going upward = loop back-edge)
// Used after layout to switch edge type
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// LEGEND
// ─────────────────────────────────────────────
const Legend = () => (
  <div className="bg-black/70 backdrop-blur-xl border border-white/10 rounded-xl p-3 text-xs text-white/70 space-y-2 min-w-[160px]">
    <p className="font-bold text-white/90 tracking-wide">Legend</p>
    {[
      { shape:'rounded-full bg-purple-700 w-5 h-3', label:'Start / End' },
      { shape:'rounded-sm bg-slate-600 w-5 h-3',    label:'Process' },
      { shape:'bg-blue-700 w-5 h-3',                label:'Input / Output', skew:true },
      { shape:'rotate-45 bg-orange-700 w-3 h-3',    label:'Decision (if/while/for)' },
      { shape:'rounded-full border-2 border-purple-500 w-3 h-3', label:'Connector' },
    ].map(({shape,label,skew}:any) => (
      <div key={label} className="flex items-center gap-2">
        <div className={`shrink-0 ${shape} ${skew?'skew-x-[-12deg]':''}`} />
        <span>{label}</span>
      </div>
    ))}
    <div className="flex items-center gap-2 pt-1 border-t border-white/10">
      <div className="w-8 h-0 border-t-2 border-dashed border-yellow-400" />
      <span>Loop back-edge</span>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// SVG EXPORT
// ─────────────────────────────────────────────
function downloadFlow() {
  const svg = document.querySelector('.react-flow__renderer svg') as SVGElement | null;
  if (!svg) return;
  const blob = new Blob([svg.outerHTML], { type:'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'flowchart.svg'; a.click();
}

// ─────────────────────────────────────────────
// PRESETS
// ─────────────────────────────────────────────
const PRESETS: Record<string,string> = {
  'Max of Two': `int main(){
  int a, b;
  scanf("%d %d", &a, &b);
  if(a > b){
    printf("Max is %d", a);
  } else {
    printf("Max is %d", b);
  }
  return 0;
}`,
  'Factorial (while)': `int main(){
  int n, i = 1;
  unsigned long long fact = 1;
  scanf("%d", &n);
  if(n < 0){
    printf("Error! Negative number.");
  } else {
    while(i <= n){
      fact *= i;
      i++;
      if(fact > 1000000){
        printf("Result too large!");
        break;
      }
    }
    printf("Factorial of %d = %llu", n, fact);
  }
  return 0;
}`,
  'Sum Loop (for)': `int main(){
  int n, sum = 0;
  scanf("%d", &n);
  for(int i = 1; i <= n; i++){
    sum += i;
  }
  printf("Sum = %d", sum);
  return 0;
}`,
  'Grade Check': `int main(){
  int marks;
  scanf("%d", &marks);
  if(marks >= 90){
    printf("A Grade");
  } else if(marks >= 75){
    printf("B Grade");
  } else if(marks >= 60){
    printf("C Grade");
  } else {
    printf("Fail");
  }
  return 0;
}`,
  'Even / Odd': `int main(){
  int n;
  scanf("%d", &n);
  if(n % 2 == 0){
    printf("Even");
  } else {
    printf("Odd");
  }
  return 0;
}`,
};

// ─────────────────────────────────────────────
// DETECT SCANF VARS for interactive terminal
// ─────────────────────────────────────────────
function detectScanfVars(code: string): string[] {
  const vars: string[] = [];
  const re = /scanf\s*\(\s*"[^"]*"\s*,([^)]+)\)/gi;
  let m;
  while ((m = re.exec(code)) !== null) {
    m[1].split(',').forEach(a => {
      const v = a.trim().replace(/^&/,'').replace(/\[.*\]/,'').trim();
      if (v) vars.push(v);
    });
  }
  return vars;
}

// ─────────────────────────────────────────────
// TERMINAL TYPES
// ─────────────────────────────────────────────
interface TermLine { type:'output'|'input'|'error'|'system'; text:string }

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function Canvas() {
  const [code, setCode]                  = useState('// Open the Sidebar to select a problem,\n// or write your own C code here!');
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading]            = useState(false);
  const [error, setError]                = useState('');
  const [nodeCount, setNodeCount]        = useState(0);
  
  // Dynamic Recent Problems State (Now fetching algorithms too!)
  const [recentProblems, setRecentProblems] = useState<{id: number, title: string, code: string, algorithm_en?: string, algorithm_bn?: string}[]>([]);
  const [activeProblem, setActiveProblem] = useState<{id: number, title: string, code: string, algorithm_en?: string, algorithm_bn?: string} | null>(null);
  
  // Algorithm Panel State
  const [isAlgoOpen, setIsAlgoOpen] = useState(false);
  // Mobile View State
  const [mobileTab, setMobileTab] = useState<'editor' | 'flowchart'>('editor');
  // Draggable Button States
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragInfo = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0, moved: false });

  const handlePointerDown = (e: React.PointerEvent) => {
    dragInfo.current = { isDragging: true, startX: e.clientX, startY: e.clientY, initialX: dragOffset.x, initialY: dragOffset.y, moved: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragInfo.current.isDragging) return;
    const dx = e.clientX - dragInfo.current.startX;
    const dy = e.clientY - dragInfo.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragInfo.current.moved = true; // Detect actual dragging vs clicking
    setDragOffset({ x: dragInfo.current.initialX + dx, y: dragInfo.current.initialY + dy });
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    dragInfo.current.isDragging = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Fetch the 5 latest problems from Supabase on load
  useEffect(() => {
    const fetchRecent = async () => {
      const { data } = await supabase
        .from('practice_problems')
        .select('id, title, code, algorithm_en, algorithm_bn')
        .order('id', { ascending: false })
        .limit(5);
      
      if (data) setRecentProblems(data);
    };
    fetchRecent();
  }, []);

  const [termLines, setTermLines]   = useState<TermLine[]>([
    { type:'system', text:'>_ Ready. Press Run to execute your C program.' }
  ]);
  const [termInput, setTermInput]         = useState('');
  const [isRunning, setIsRunning]         = useState(false);
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [inputResolver, setInputResolver] = useState<((v:string)=>void)|null>(null);

  const [termHeight, setTermHeight] = useState(200);
  const termOutputRef               = useRef<HTMLDivElement>(null);
  const isDragging                  = useRef(false);
  const dragStartY                  = useRef(0);
  const dragStartH                  = useRef(0);
  const inputRef                    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (termOutputRef.current) termOutputRef.current.scrollTop = termOutputRef.current.scrollHeight;
  }, [termLines]);

  useEffect(() => {
    if (waitingForInput) inputRef.current?.focus();
  }, [waitingForInput]);

  // Drag resize
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = termHeight;
    e.preventDefault();
  }, [termHeight]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartY.current - e.clientY;
      setTermHeight(Math.max(120, Math.min(600, dragStartH.current + delta)));
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const addLine = useCallback((type: TermLine['type'], text: string) => {
    setTermLines(prev => [...prev, { type, text }]);
  }, []);

  // Interactive run
  const handleRun = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setTermLines([{ type:'system', text:'>_ Compiling...' }]);
    const vars = detectScanfVars(code);
    const inputs: string[] = [];

    if (vars.length > 0) {
      addLine('system', '>_ Program needs input values:');
      for (const v of vars) {
        addLine('system', `  Enter value for "${v}":`);
        setWaitingForInput(true);
        const val = await new Promise<string>(res => setInputResolver(() => res));
        setWaitingForInput(false);
        inputs.push(val);
        addLine('input', `  ${v} = ${val}`);
      }
    }

    addLine('system', '>_ Running...');
    try {
      const res = await fetch('https://cflow-api.codenestui.top/execute', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ code, stdin: inputs.join('\n') }),
      });
      const data = await res.json();
      if (data.error?.trim()) data.error.trim().split('\n').forEach((l:string) => addLine('error', l));
      if (data.output?.trim()) data.output.trim().split('\n').forEach((l:string) => addLine('output', l));
      if (!data.error?.trim() && !data.output?.trim()) addLine('system','Program exited (no output).');
    } catch (err:any) {
      addLine('error', `Cannot connect: ${err.message}`);
    }
    setIsRunning(false); setInputResolver(null);
  };

  const submitTermInput = () => {
    if (inputResolver) { inputResolver(termInput.trim()); setInputResolver(null); }
    setTermInput('');
  };

  // Parse → flowchart
  const handleParse = async (codeToRun = code) => {
    setLoading(true); setError('');
    try {
      const res = await fetch('https://cflow-api.codenestui.top/parse', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ code: codeToRun }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();

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
          type: 'smoothstep',
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed, color:'#a855f7' },
          style: { stroke:'#a855f7', strokeWidth:2 },
          labelStyle: { fill:'#fff', fontWeight:700, fontSize:12 },
          labelBgStyle: { fill:'#0f0f1e', fillOpacity:0.9, rx:5, ry:5 },
          labelBgPadding: [6,3] as [number,number],
        });
      });

      const layout = getLayoutedElements(n, e);
      // Tag back-edges after layout (going upward = loop back)
      const taggedEdges = tagBackEdges(layout.nodes, layout.edges);
      setNodes(layout.nodes);
      setEdges(taggedEdges);
      setNodeCount(n.length);
      if (window.innerWidth < 768) setMobileTab('flowchart');
    } catch (err:any) {
      setError(err.message || 'Cannot reach parser — is the Rust server running on :3001?');
    }
    setLoading(false);
  };

  const handlePreset = (name: string) => {
    // If you still have a PRESETS object defined, use this:
    if (typeof PRESETS !== 'undefined' && PRESETS[name]) {
      setCode(PRESETS[name]);
      handleParse(PRESETS[name]);
    }
  };
  const handleReset = () => { setNodes([]); setEdges([]); setNodeCount(0); setError(''); };
  const clearTerminal = () => setTermLines([{ type:'system', text:'>_ Terminal cleared.' }]);

  return (
    <div className="flex h-screen bg-[#080b10] text-white overflow-hidden font-sans relative">
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-purple-900/8 rounded-full blur-[200px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-900/8 rounded-full blur-[200px] pointer-events-none" />
      {/* ── SIDEBAR COMPONENT ── */}
      <Sidebar 
         onSelectProblem={(p) => { 
           setCode(p.code); 
           setActiveProblem(p); // Now selecting from the sidebar updates the Algorithms button too!
         }} 
         currentCode={code} 
      />
      {/* ── LEFT PANEL ── */}
      <div className={`w-full md:w-[38%] z-10 flex-col border-r border-white/8 bg-[#0c1018]/90 backdrop-blur-2xl ${mobileTab === 'editor' ? 'flex' : 'hidden md:flex'}`}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
          <div className='ml-14'>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-violet-300 to-blue-400 bg-clip-text text-transparent tracking-tight">
                CodeNest Flow
              </h1>
              <a href="https://github.com/Marjuk06" target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[9px] font-bold text-purple-300 hover:bg-purple-500/20 hover:text-white transition-colors uppercase tracking-widest cursor-pointer">
                By Marjuk Amin
              </a>
            </div>
            <p className="text-[11px] text-white/35 mt-1 tracking-widest uppercase">C Code → Flowchart & Algorithm</p>
          </div>
          {nodeCount > 0 && (
            <span className="text-[11px] bg-purple-900/40 border border-purple-500/30 text-purple-300 px-2.5 py-1 rounded-full">
              {nodeCount} nodes
            </span>
          )}
        </div>

        {/* Recent Uploads & Editor Tools */}
        <div className="px-4 py-2 border-b border-white/8 flex justify-between items-center">
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest mr-2">Recent:</span>
            {recentProblems.length === 0 ? (
              <span className="text-[11px] text-white/40 italic">No recent uploads</span>
            ) : (
              recentProblems.map(p => (
                <button key={p.id} 
                  onClick={() => {
                    setActiveProblem(p); // Pass the whole object now!
                    setCode(p.code); 
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
                    activeProblem?.id === p.id
                      ? 'bg-purple-600/30 border-purple-500/60 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                      : 'bg-white/5 border-white/10 text-white/45 hover:text-white/80 hover:bg-white/8'
                  }`}>
                  {p.title}
                </button>
              ))
            )}
          </div>

          <button 
            onClick={() => {
              setCode(''); 
              setActiveProblem(null); 
            }}
            title="Clear Editor"
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1.5 rounded-md text-white/30 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <Eraser size={12} />
            Clear
          </button>
        </div>

        {/* Monaco */}
        <div className="flex-grow relative overflow-hidden">
          <Editor height="100%" language="c" theme="vs-dark" value={code}
            onChange={v => setCode(v || '')}
            options={{ minimap:{enabled:false}, fontSize:13, lineNumbers:'on',
              fontFamily:'JetBrains Mono, Fira Code, monospace', padding:{top:12} }} />
        </div>

        {/* ── RESIZABLE TERMINAL ── */}
        <div style={{ height: termHeight, minHeight:120, maxHeight:600 }}
          className="flex flex-col border-t border-white/10 bg-[#05050a] relative select-none">

          {/* Drag handle */}
          <div onMouseDown={handleDragStart}
            className="absolute top-0 left-0 right-0 h-[6px] cursor-row-resize z-20 flex items-center justify-center group"
            style={{ touchAction:'none' }}>
            <div className="w-12 h-[3px] rounded-full bg-white/10 group-hover:bg-purple-500/60 transition-colors" />
          </div>

          {/* Terminal header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-1.5 border-b border-white/5 bg-black/40">
            <div className="flex items-center gap-2">
              <Terminal size={12} className="text-green-400" />
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Terminal</span>
              {isRunning && <span className="text-[10px] text-green-400 animate-pulse ml-1">● Running</span>}
              {waitingForInput && <span className="text-[10px] text-yellow-400 animate-pulse ml-1">⌨ Waiting for input…</span>}
            </div>
            <button onClick={clearTerminal} className="text-[10px] text-white/25 hover:text-white/60 transition-colors">Clear</button>
          </div>

          {/* Output */}
          <div ref={termOutputRef}
            className="flex-grow overflow-y-auto px-4 py-2 font-mono text-sm space-y-0.5"
            onClick={() => waitingForInput && inputRef.current?.focus()}>
            {termLines.map((l,i) => (
              <div key={i} className={
                l.type==='error'  ? 'text-red-400' :
                l.type==='input'  ? 'text-yellow-300' :
                l.type==='system' ? 'text-white/35 text-[11px]' : 'text-green-400'
              }>{l.text}</div>
            ))}
            {!isRunning && !waitingForInput && <div className="text-green-400/30 animate-pulse">█</div>}
          </div>

          {/* Input row */}
          <div className={`flex items-center gap-2 px-4 py-2 border-t transition-colors ${
            waitingForInput ? 'border-yellow-500/40 bg-yellow-950/20' : 'border-white/5 bg-black/30'
          }`}>
            <span className={`font-mono text-sm ${waitingForInput ? 'text-yellow-400' : 'text-white/20'}`}>
              {waitingForInput ? '›' : '$'}
            </span>
            <input ref={inputRef} type="text" value={termInput}
              onChange={e => setTermInput(e.target.value)}
              onKeyDown={e => e.key==='Enter' && submitTermInput()}
              disabled={!waitingForInput}
              placeholder={waitingForInput ? 'Type value and press Enter…' : 'Run program to interact…'}
              className={`flex-1 bg-transparent font-mono text-sm outline-none transition-colors
                ${waitingForInput
                  ? 'text-yellow-200 placeholder:text-yellow-700/60 cursor-text'
                  : 'text-white/20 placeholder:text-white/15 cursor-not-allowed'}`} />
            {waitingForInput && (
              <button onClick={submitTermInput}
                className="p-1 rounded bg-yellow-600/30 hover:bg-yellow-600/50 text-yellow-300 transition-colors">
                <Send size={12} />
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mx-4 mb-2 px-4 py-2 bg-red-950/60 border border-red-500/30 rounded-lg text-red-300 text-xs">
            ⚠ {error}
          </div>
        )}

        {/* Action bar */}
        <div className="p-4 border-t border-white/8 flex gap-2">
          <button onClick={handleRun} disabled={isRunning}
            className="px-4 flex items-center gap-2 bg-green-600/25 hover:bg-green-600/45
                       border border-green-500/50 rounded-xl py-2.5 font-bold text-sm
                       shadow-[0_0_20px_rgba(34,197,94,0.22)] text-green-300
                       disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            <Play size={15} />{isRunning?'…':'Run'}
          </button>
          <button onClick={() => handleParse()} disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 bg-purple-600/25 hover:bg-purple-600/45
                       border border-purple-500/50 rounded-xl py-2.5 font-bold text-sm
                       shadow-[0_0_20px_rgba(168,85,247,0.22)] text-white
                       disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            <Play size={15} />{loading?'Parsing…':'Generate Flowchart'}
          </button>
          <button onClick={downloadFlow} title="Export SVG"
            className="px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-white/55 hover:text-white">
            <Download size={15} />
          </button>
          <button onClick={handleReset} title="Clear canvas"
            className="px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-white/55 hover:text-white">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className={`w-full md:w-[62%] h-full z-10 relative ${mobileTab === 'flowchart' ? 'block' : 'hidden md:block'}`}>
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/15 select-none gap-4">
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
              <ellipse cx="36" cy="12" rx="18" ry="8" stroke="currentColor" strokeWidth="1.5" />
              <rect x="20" y="28" width="32" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <polygon points="36,52 20,64 52,64" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="36" y1="20" x2="36" y2="28" stroke="currentColor" strokeWidth="1.5" />
              <line x1="36" y1="42" x2="36" y2="52" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-semibold text-white/25">No flowchart yet</p>
              <p className="text-xs text-white/15 mt-1">Write C code and press Generate</p>
            </div>
          </div>
        ) : (
          <ReactFlow panActivationKeyCode={null}
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            fitView fitViewOptions={{ padding:0.18 }}
            colorMode="dark" minZoom={0.1} maxZoom={2.5}>
            <Background color="rgba(255,255,255,0.03)" gap={24} size={1} />
            <Controls className="!bg-black/70 !border-white/10 backdrop-blur-md" showInteractive={false} />
            <MiniMap
              nodeColor={n => {
                if (n.type==='terminal')  return '#7c3aed';
                if (n.type==='decision')  return '#c2410c';
                if (n.type==='io')        return '#1d4ed8';
                if (n.type==='connector') return '#a855f7';
                return '#334155';
              }}
              maskColor="rgba(0,0,0,0.6)"
              className="!bg-black/70 !border-white/10 backdrop-blur-md" />
            <Panel position="top-right"><Legend /></Panel>
          </ReactFlow>
        )}

        {/* ── FLOATING DRAGGABLE ALGORITHM BUTTON ── */}
        {activeProblem && (
          <div 
            className="absolute bottom-32 right-8 z-[60] touch-none"
            style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
          >
            <button 
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onClick={() => {
                if (!dragInfo.current.moved) setIsAlgoOpen(true); // Only open if we didn't just drag it!
              }}
              className="flex items-center gap-2 bg-purple-600/25 hover:bg-purple-600/45 border border-purple-500/50 backdrop-blur-xl px-5 py-3 rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.22)] text-white font-bold cursor-grab active:cursor-grabbing transition-colors"
            >
              <AlignLeft size={18} className="pointer-events-none" />
              <span className="pointer-events-none">Algorithms</span>
            </button>
          </div>
        )}

        {/* ── ALGORITHM PANEL ── */}
        <AlgorithmPanel 
          isOpen={isAlgoOpen} 
          onClose={() => setIsAlgoOpen(false)} 
          title={activeProblem?.title || ''}
          algorithmEn={activeProblem?.algorithm_en}
          algorithmBn={activeProblem?.algorithm_bn}
        />

      </div>
      {/* ── MOBILE BOTTOM NAVIGATION BAR ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-[#0c1018]/95 backdrop-blur-xl border-t border-white/10 flex p-2 gap-2 pb-4 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <button 
          onClick={() => setMobileTab('editor')} 
          className={`flex-1 py-3 rounded-lg flex justify-center items-center gap-2 text-xs font-bold transition-all ${mobileTab === 'editor' ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
        >
          <Terminal size={16} /> Code & Terminal
        </button>
        <button 
          onClick={() => setMobileTab('flowchart')} 
          className={`flex-1 py-3 rounded-lg flex justify-center items-center gap-2 text-xs font-bold transition-all ${mobileTab === 'flowchart' ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
        >
          <RotateCcw size={16} className="rotate-180" /> Flowchart
        </button>
      </div>
    </div>
  );
}