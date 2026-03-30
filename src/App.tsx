/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Package, 
  Trash2, 
  RotateCcw, 
  LayoutDashboard, 
  Info,
  ChevronRight,
  ChevronDown,
  Maximize2,
  Minimize2,
  Undo2,
  Redo2,
  Eraser
} from 'lucide-react';
import { 
    MEDICINES, 
      BOX_TYPES, 
        CABINET_WIDTH, 
          CABINET_HEIGHT, 
            CABINET_DEPTH,
              LAYERS_COUNT,
                Medicine,
                  BoxType,
                    PlacedBox
                    } from './constants';

// Scale factor for visualization (1cm = 10px)
const SCALE = 12;

export default function App() {
  const [layers, setLayers] = useState<PlacedBox[][]>(Array(LAYERS_COUNT).fill([]));
  const [history, setHistory] = useState<PlacedBox[][][]>([Array(LAYERS_COUNT).fill([])]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [activeLayer, setActiveLayer] = useState(1); // 0-indexed internally, but 1-4 for UI
  const [selectedMedicine, setSelectedMedicine] = useState<Medicine | null>(null);
  const [draggedBoxType, setDraggedBoxType] = useState<BoxType | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  const [previewRotated, setPreviewRotated] = useState<Record<string, boolean>>({});

  const cabinetRef = useRef<HTMLDivElement>(null);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const getBestMedicineFit = (boxW: number, boxH: number, med: Medicine) => {
      const shorterMedicineDim = Math.min(med.width, med.height);
        
          // Check depth constraint
            if (shorterMedicineDim > CABINET_DEPTH) {
                return { count: 0, cols: 0, rows: 0, medW: 0, medH: 0, layers: 0 };
                  }

                    // Calculate depth layers
                      const depthLayers = Math.floor(CABINET_DEPTH / shorterMedicineDim);

                        // Orientation 1: med.width x med.height
                          const cols1 = Math.floor(boxW / med.width);
                            const rows1 = Math.floor(boxH / med.height);
                              const flatCount1 = cols1 * rows1;
                                const totalCount1 = flatCount1 * depthLayers;

                                  // Orientation 2: med.height x med.width
                                    const cols2 = Math.floor(boxW / med.height);
                                      const rows2 = Math.floor(boxH / med.width);
                                        const flatCount2 = cols2 * rows2;
                                          const totalCount2 = flatCount2 * depthLayers;

                                            if (totalCount1 >= totalCount2 && totalCount1 > 0) {
                                                return { count: totalCount1, cols: cols1, rows: rows1, medW: med.width, medH: med.height, layers: depthLayers };
                                                  } else if (totalCount2 > 0) {
                                                      return { count: totalCount2, cols: cols2, rows: rows2, medW: med.height, medH: med.width, layers: depthLayers };
                                                        }
                                                          return { count: 0, cols: 0, rows: 0, medW: 0, medH: 0, layers: 0 };
                                                          };
  }
    return { count: 0, cols: 0, rows: 0, medW: 0, medH: 0 };
  };

  const calculateCapacity = (box: BoxType, med: Medicine, isBoxRotated: boolean) => {
    const boxW = isBoxRotated ? box.height : box.width;
    const boxH = isBoxRotated ? box.width : box.height;
    return getBestMedicineFit(boxW, boxH, med).count;
  };

  const saveToHistory = (newLayers: PlacedBox[][]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newLayers))); // Deep clone to avoid reference issues
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setLayers(newLayers);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setLayers(JSON.parse(JSON.stringify(history[newIndex])));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setLayers(JSON.parse(JSON.stringify(history[newIndex])));
    }
  };

  // Check for collision or boundary violation
  const checkCollision = (layerIndex: number, boxId: string | null, x: number, y: number, w: number, h: number) => {
    // Boundary check - use a small epsilon to avoid floating point issues
    const EPS = 0.01;
    if (x < -EPS || y < -EPS || x + w > CABINET_WIDTH + EPS || y + h > CABINET_HEIGHT + EPS) {
      return true;
    }

    // Collision check with other boxes
    return layers[layerIndex].some(other => {
      if (other.id === boxId) return false;
      const otherType = BOX_TYPES.find(bt => bt.id === other.boxTypeId)!;
      const otherW = other.isRotated ? otherType.height : otherType.width;
      const otherH = other.isRotated ? otherType.width : otherType.height;
      
      return (
        x < other.x + otherW - EPS &&
        x + w > other.x + EPS &&
        y < other.y + otherH - EPS &&
        y + h > other.y + EPS
      );
    });
  };

  const addBoxToLayer = (boxType: BoxType, x: number, y: number, isRotated: boolean = false) => {
    // Ensure we use the original dimensions for calculation
    const originalBox = BOX_TYPES.find(bt => bt.id === boxType.id)!;
    const w = isRotated ? originalBox.height : originalBox.width;
    const h = isRotated ? originalBox.width : originalBox.height;

    if (checkCollision(activeLayer, null, x, y, w, h)) {
      alert('此位置無法放置藥盒（重疊或超出邊界）');
      return;
    }

    const newBox: PlacedBox = {
      id: Math.random().toString(36).substr(2, 9),
      boxTypeId: boxType.id,
      x,
      y,
      isRotated,
    };

    const newLayers = [...layers];
    newLayers[activeLayer] = [...newLayers[activeLayer], newBox];
    saveToHistory(newLayers);
  };

  const findAndPlaceBox = (boxType: BoxType) => {
    const isRotated = !!previewRotated[boxType.id];
    const w = isRotated ? boxType.height : boxType.width;
    const h = isRotated ? boxType.width : boxType.height;

    // Scan for available spot (0.5cm increments)
    for (let y = 0; y <= CABINET_HEIGHT - h; y += 0.5) {
      for (let x = 0; x <= CABINET_WIDTH - w; x += 0.5) {
        if (!checkCollision(activeLayer, null, x, y, w, h)) {
          addBoxToLayer(boxType, x, y, isRotated);
          return;
        }
      }
    }
    alert('藥櫃空間不足，無法自動送入此藥盒');
  };

  const toggleBoxRotation = (layerIndex: number, boxId: string) => {
    const newLayers = [...layers];
    const layer = [...newLayers[layerIndex]];
    const boxIndex = layer.findIndex(b => b.id === boxId);
    
    if (boxIndex !== -1) {
      const box = layer[boxIndex];
      const boxType = BOX_TYPES.find(bt => bt.id === box.boxTypeId)!;
      const nextRotated = !box.isRotated;
      const w = nextRotated ? boxType.height : boxType.width;
      const h = nextRotated ? boxType.width : boxType.height;

      if (!checkCollision(layerIndex, boxId, box.x, box.y, w, h)) {
        layer[boxIndex] = {
          ...box,
          isRotated: nextRotated,
          medicineCount: box.medicineId ? calculateCapacity(boxType, MEDICINES.find(m => m.id === box.medicineId)!, nextRotated) : undefined
        };
        newLayers[layerIndex] = layer;
        saveToHistory(newLayers);
      } else {
        alert('空間不足，無法旋轉藥盒');
      }
    }
  };

  const updateBoxPosition = (layerIndex: number, boxId: string, x: number, y: number) => {
    const newLayers = [...layers];
    const layer = [...newLayers[layerIndex]];
    const boxIndex = layer.findIndex(b => b.id === boxId);
    
    if (boxIndex !== -1) {
      const box = layer[boxIndex];
      const boxType = BOX_TYPES.find(bt => bt.id === box.boxTypeId)!;
      const w = box.isRotated ? boxType.height : boxType.width;
      const h = box.isRotated ? boxType.width : boxType.height;

      // Snap to grid (0.5cm)
      const snappedX = Math.round(x * 2) / 2;
      const snappedY = Math.round(y * 2) / 2;

      // Clamp to boundaries
      const finalX = Math.max(0, Math.min(CABINET_WIDTH - w, snappedX));
      const finalY = Math.max(0, Math.min(CABINET_HEIGHT - h, snappedY));

      // Check collision at the final snapped/clamped position
      if (!checkCollision(layerIndex, boxId, finalX, finalY, w, h)) {
        layer[boxIndex] = {
          ...box,
          x: finalX,
          y: finalY,
        };
        newLayers[layerIndex] = layer;
        saveToHistory(newLayers);
      } else {
        // If collision, we don't update state, which causes Framer Motion 
        // to animate the box back to its previous valid position.
        // We can optionally show a small toast or feedback here.
      }
    }
  };

  const removeBox = (layerIndex: number, boxId: string) => {
    const newLayers = [...layers];
    newLayers[layerIndex] = newLayers[layerIndex].filter(b => b.id !== boxId);
    saveToHistory(newLayers);
  };

  const fillMedicine = (layerIndex: number, boxId: string, medicine: Medicine) => {
    const newLayers = [...layers];
    const layer = [...newLayers[layerIndex]];
    const boxIndex = layer.findIndex(b => b.id === boxId);
    
    if (boxIndex !== -1) {
      const box = layer[boxIndex];
      const boxType = BOX_TYPES.find(bt => bt.id === box.boxTypeId)!;
      const capacity = calculateCapacity(boxType, medicine, box.isRotated);
      
      layer[boxIndex] = {
        ...box,
        medicineId: medicine.id,
        medicineCount: capacity
      };
      newLayers[layerIndex] = layer;
      saveToHistory(newLayers);
    }
  };

  const clearAll = () => {
    setConfirmDialog({
      show: true,
      title: '清空所有藥櫃',
      message: '確定要清空所有藥櫃的排布嗎？此操作無法撤銷。',
      onConfirm: () => {
        saveToHistory(Array(LAYERS_COUNT).fill([]));
        setConfirmDialog(null);
      }
    });
  };

  const clearCurrentLayer = () => {
    setConfirmDialog({
      show: true,
      title: `清空第 ${activeLayer + 1} 層`,
      message: `確定要清空第 ${activeLayer + 1} 層的排布嗎？`,
      onConfirm: () => {
        const newLayers = [...layers];
        newLayers[activeLayer] = [];
        saveToHistory(newLayers);
        setConfirmDialog(null);
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Package size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">藥櫃智慧排布模擬器</h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Pharmacy Cabinet Optimizer</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-full p-1 mr-2">
            <button 
              onClick={undo}
              disabled={historyIndex === 0}
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-full transition-all disabled:opacity-30 disabled:hover:bg-transparent"
              title="上一步"
            >
              <Undo2 size={18} />
            </button>
            <button 
              onClick={redo}
              disabled={historyIndex === history.length - 1}
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-white rounded-full transition-all disabled:opacity-30 disabled:hover:bg-transparent"
              title="下一步"
            >
              <Redo2 size={18} />
            </button>
          </div>
          
          <div className="h-6 w-[1px] bg-slate-200 mx-1" />

          <button 
            onClick={clearCurrentLayer}
            className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-full transition-colors"
            title="清空當前層"
          >
            <Eraser size={20} />
          </button>
          <button 
            onClick={clearAll}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
            title="清空所有"
          >
            <RotateCcw size={20} />
          </button>
          <button 
            onClick={() => setShowInfo(!showInfo)}
            className={`p-2 rounded-full transition-colors ${showInfo ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
          >
            <Info size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar - Assets */}
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">藥盒類型 (點擊送入 / 雙擊旋轉)</h2>
            <div className="grid grid-cols-2 gap-3">
              {BOX_TYPES.map(box => {
                const isRotated = !!previewRotated[box.id];
                const displayW = isRotated ? box.height : box.width;
                const displayH = isRotated ? box.width : box.height;
                
                return (
                  <div 
                    key={box.id}
                    draggable
                    onDragStart={() => setDraggedBoxType({ ...box, width: displayW, height: displayH })}
                    onClick={() => {
                      if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current);
                        clickTimeoutRef.current = null;
                        // Double click: Rotate
                        setPreviewRotated(prev => ({ ...prev, [box.id]: !prev[box.id] }));
                      } else {
                        clickTimeoutRef.current = setTimeout(() => {
                          // Single click: Place
                          findAndPlaceBox(box);
                          clickTimeoutRef.current = null;
                        }, 250);
                      }
                    }}
                    className="group cursor-pointer p-3 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-all select-none"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">{box.id}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{displayW}x{displayH}</span>
                    </div>
                    <div className="flex items-center justify-center h-20">
                      <motion.div 
                        animate={{ rotate: isRotated ? 90 : 0 }}
                        className="border-2 border-dashed border-slate-300 rounded shadow-sm group-hover:border-indigo-400 transition-colors"
                        style={{ 
                          width: box.width * 2, 
                          height: box.height * 2,
                          backgroundColor: box.color
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">藥品清單 (依使用量排序)</h2>
            <div className="space-y-2">
              {MEDICINES.sort((a, b) => b.usage - a.usage).map(med => (
                <button
                  key={med.id}
                  onClick={() => setSelectedMedicine(med)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 group ${
                    selectedMedicine?.id === med.id 
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                      : 'bg-white border-slate-100 hover:border-indigo-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center bg-slate-100 rounded-lg p-1 w-12 h-12 flex-shrink-0 group-hover:bg-white transition-colors overflow-hidden">
                    <div 
                      className="rounded-sm shadow-sm border border-white/20" 
                      style={{ 
                        width: Math.min(med.width * 3, 40), 
                        height: Math.min(med.height * 3, 40),
                        backgroundColor: med.color 
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{med.name}</p>
                    <div className="flex justify-between items-center mt-0.5">
                      <span className={`text-[10px] font-medium ${selectedMedicine?.id === med.id ? 'text-indigo-100' : 'text-slate-400'}`}>
                        週用量: {med.usage} | 尺寸: {med.width}x{med.height}cm
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={14} className={selectedMedicine?.id === med.id ? 'text-white' : 'text-slate-300 group-hover:text-indigo-400'} />
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main Workspace */}
        <section className="flex-1 bg-[#f1f5f9] p-8 overflow-y-auto flex flex-col items-center gap-8 custom-scrollbar">
          {/* Layer Selection */}
          <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200">
            {[1, 2, 3, 4].map(num => (
              <button
                key={num}
                onClick={() => setActiveLayer(num - 1)}
                className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${
                  activeLayer === num - 1 
                    ? 'bg-indigo-600 text-white shadow-md' 
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                第 {num} 層
              </button>
            ))}
          </div>

          {/* Cabinet Layer Visualization */}
          <div className="relative">
            <div className="mb-4 flex justify-between items-end">
              <div>
                <h3 className="text-lg font-bold text-slate-800">藥櫃第 {activeLayer + 1} 層</h3>
                <p className="text-xs text-slate-500">尺寸: {CABINET_WIDTH}cm x {CABINET_HEIGHT}cm | 比例 1cm = {SCALE}px</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    當前佔用寬度: {layers[activeLayer].reduce((max, b) => {
                      const bt = BOX_TYPES.find(t => t.id === b.boxTypeId)!;
                      return Math.max(max, b.x + (b.isRotated ? bt.height : bt.width));
                    }, 0).toFixed(1)} / {CABINET_WIDTH} cm
                  </span>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    當前佔用高度: {layers[activeLayer].reduce((max, b) => {
                      const bt = BOX_TYPES.find(t => t.id === b.boxTypeId)!;
                      return Math.max(max, b.y + (b.isRotated ? bt.width : bt.height));
                    }, 0).toFixed(1)} / {CABINET_HEIGHT} cm
                  </span>
                </div>
              </div>
              <div className="flex gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full" /> 拖曳藥盒至此
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" /> 點選藥品後點擊藥盒
                </div>
              </div>
            </div>

            <div 
              ref={cabinetRef}
              className="bg-white rounded-2xl shadow-2xl border-[8px] border-slate-800 relative overflow-hidden"
              style={{ 
                width: CABINET_WIDTH * SCALE + 16, 
                height: CABINET_HEIGHT * SCALE + 16,
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!draggedBoxType || !cabinetRef.current) return;
                
                const rect = cabinetRef.current.getBoundingClientRect();
                const x = (e.clientX - rect.left - 8) / SCALE;
                const y = (e.clientY - rect.top - 8) / SCALE;
                
                // Snap to grid (0.5cm)
                const snappedX = Math.round(x * 2) / 2;
                const snappedY = Math.round(y * 2) / 2;
                
                // Use the rotation from the draggedBoxType (which was set in onDragStart)
                const originalBox = BOX_TYPES.find(bt => bt.id === draggedBoxType.id)!;
                const isRotated = draggedBoxType.width !== originalBox.width;
                
                addBoxToLayer(originalBox, snappedX, snappedY, isRotated);
                setDraggedBoxType(null);
              }}
            >
              {/* Grid Background - 0.5cm increments */}
              <div 
                className="absolute inset-0 pointer-events-none opacity-[0.03]"
                style={{ 
                  backgroundImage: `linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)`,
                  backgroundSize: `${SCALE / 2}px ${SCALE / 2}px`
                }}
              />

              {/* Placed Boxes */}
              <AnimatePresence>
                {layers[activeLayer].map((box) => {
                  const boxType = BOX_TYPES.find(bt => bt.id === box.boxTypeId)!;
                  const medicine = box.medicineId ? MEDICINES.find(m => m.id === box.medicineId) : null;
                  const w = box.isRotated ? boxType.height : boxType.width;
                  const h = box.isRotated ? boxType.width : boxType.height;
                  
                  return (
                    <motion.div
                      key={box.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        x: box.x * SCALE,
                        y: box.y * SCALE,
                        width: w * SCALE,
                        height: h * SCALE,
                      }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="absolute group cursor-pointer z-10"
                      style={{
                        backgroundColor: boxType.color,
                      }}
                      onClick={() => {
                        if (selectedMedicine) {
                          fillMedicine(activeLayer, box.id, selectedMedicine);
                        } else {
                          toggleBoxRotation(activeLayer, box.id);
                        }
                      }}
                    >
                      <div className="absolute inset-0 border border-slate-300 group-hover:border-indigo-500 transition-colors" />

                      {/* Medicine Filling Visualization - Precise Pixel Grid */}
                      {medicine && box.medicineCount && (
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                          {(() => {
                            const fit = getBestMedicineFit(w, h, medicine);
                            const items = [];
                            for (let r = 0; r < fit.rows; r++) {
                              for (let c = 0; c < fit.cols; c++) {
                                if (items.length < fit.count) {
                                  items.push(
                                    <div
                                      key={`${r}-${c}`}
                                      className="absolute border border-white/10"
                                      style={{
                                        backgroundColor: medicine.color,
                                        opacity: 0.85,
                                        width: fit.medW * SCALE,
                                        height: fit.medH * SCALE,
                                        left: c * fit.medW * SCALE,
                                        top: r * fit.medH * SCALE,
                                        boxShadow: 'inset 0 0 4px rgba(0,0,0,0.1)'
                                      }}
                                    />
                                  );
                                }
                              }
                            }
                            return items;
                          })()}
                        </div>
                      )}

                      {/* Medicine Name and Count Label - Always Visible */}
                      {medicine && box.medicineCount && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <div className="bg-white/95 px-2 py-1 rounded-lg shadow-lg border border-slate-200">
                            <p className="text-[10px] font-bold text-slate-800 whitespace-nowrap">{medicine.name}</p>
                            <p className="text-[8px] text-slate-600 text-center mt-0.5">x {box.medicineCount}</p>
                          </div>
                        </div>
                      )}

                      {/* Box Info Overlay */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 text-white transition-opacity p-1 text-center pointer-events-none">
                        <p className="text-[10px] font-bold">{boxType.id}{box.isRotated ? ' (旋轉)' : ''}</p>
                        {medicine ? (
                          <p className="text-[8px] leading-tight mt-1">{medicine.name} x{box.medicineCount}</p>
                        ) : (
                          <p className="text-[8px] mt-1">點擊旋轉 / 點藥品放入</p>
                        )}
                        <div className="flex gap-2 mt-2 pointer-events-auto">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeBox(activeLayer, box.id);
                            }}
                            className="p-1 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Legend / Info Panel */}
          {showInfo && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl w-full bg-white rounded-3xl p-8 shadow-xl border border-slate-200"
            >
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Info className="text-indigo-600" /> 排布設計原則
              </h3>
              <div className="grid md:grid-cols-3 gap-8">
                <div className="space-y-3">
                  <h4 className="font-bold text-indigo-600 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
                    黃金層位 (2-3層)
                  </h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    將<b>使用頻率最高</b>（週用量 {'>'} 50）的藥品放置在第 2 層與第 3 層。這兩層位於視線與腰部之間，最易拿取，可大幅提升工作效率。
                  </p>
                </div>
                <div className="space-y-3">
                  <h4 className="font-bold text-emerald-600 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-emerald-600 rounded-full" />
                    尺寸最佳化
                  </h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    根據藥品尺寸選擇合適藥盒。大型藥品（如帝拔癲）建議使用 <b>A6</b> 或 <b>A3</b> 藥盒；小型藥品則使用 <b>A1</b> 以節省空間。
                  </p>
                </div>
                <div className="space-y-3">
                  <h4 className="font-bold text-amber-600 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-amber-600 rounded-full" />
                    儲備管理
                  </h4>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    第 1 層（頂層）放置低頻率或備用藥品；第 4 層（底層）放置較重或大體積的補給品。保持藥櫃整潔，標籤朝外。
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </section>
      </main>

      {/* Footer / Status Bar */}
      <footer className="bg-white border-t border-slate-200 px-6 py-3 flex justify-between items-center text-[11px] font-medium text-slate-400">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
            系統狀態: 運行中
          </div>
          <div>總藥品數: {MEDICINES.length}</div>
          <div>已排布藥盒: {layers.flat().length}</div>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Maximize2 size={12} /> 50x30cm 標準單元</span>
          <span>© 2026 藥劑科智慧管理系統</span>
        </div>
      </footer>

      {/* Custom Confirmation Dialog */}
      <AnimatePresence>
        {confirmDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-2">{confirmDialog.title}</h3>
                <p className="text-sm text-slate-500">{confirmDialog.message}</p>
              </div>
              <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3">
                <button 
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={confirmDialog.onConfirm}
                  className="px-6 py-2 text-sm font-bold bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-md transition-all"
                >
                  確定清空
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}} />
    </div>
  );
}
