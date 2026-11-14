import React, { useState } from 'react';
import { 
  X, 
  Sparkles, 
  Wand2, 
  Layers, 
  Check, 
  Download, 
  ArrowLeftRight, 
  Maximize2, 
  Eye,
  Info,
  Sliders
} from 'lucide-react';
import { RoomListing, StagedImage } from '../types';
import { geminiService } from '../services/geminiService';

interface AiStagingStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomListing;
  onSaveStagedImageToRoom: (roomId: string, image: StagedImage) => void;
}

export const AiStagingStudioModal: React.FC<AiStagingStudioModalProps> = ({
  isOpen,
  onClose,
  room,
  onSaveStagedImageToRoom,
}) => {
  const [selectedSize, setSelectedSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [selectedStyle, setSelectedStyle] = useState('Boho Plant Sanctuary & Warm Oak');
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeViewMode, setActiveViewMode] = useState<'staged' | 'original' | 'split'>('staged');
  const [stagedResultUrl, setStagedResultUrl] = useState<string | null>(null);
  const [modelUsedInfo, setModelUsedInfo] = useState<string>('gemini-3-pro-image-preview');
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const stylePresets = [
    {
      name: 'Boho Plant Sanctuary & Warm Oak',
      desc: 'Lush potted monstera, macrame, woven rugs, soft linen bedding, sunny boho vibe',
      icon: '🌿',
    },
    {
      name: 'Scandinavian Hygge & Light Pine',
      desc: 'Clean lines, neutral cream tones, fluffy knit throws, warm minimalist aesthetic',
      icon: '🕯️',
    },
    {
      name: 'Minimalist Japandi Zen',
      desc: 'Low platform bed, bamboo accents, tatami textures, serene clutter-free space',
      icon: '🎋',
    },
    {
      name: 'High-Tech Remote Work Studio',
      desc: 'Dual monitor desk, Herman Miller chair, subtle ambient neon backlighting, clean cable setup',
      icon: '💻',
    },
    {
      name: 'Industrial Loft & Exposed Brick',
      desc: 'Matte black steel pipe rack, cognac leather armchair, Edison bulb warm glow',
      icon: '🧱',
    },
    {
      name: 'Luxury Boutique Hotel Suite',
      desc: 'Velvet headboard, brass accents, crisp 800-thread Egyptian cotton sheets, modern art',
      icon: '✨',
    },
  ];

  const handleGenerate = async () => {
    setIsGenerating(true);
    setSaveSuccess(false);

    const fullPrompt = `${room.title}. Style: ${selectedStyle}. ${customPrompt ? `Additional details: ${customPrompt}.` : ''} High resolution architectural interior photography, vertical view, warm natural sunlight.`;

    try {
      const result = await geminiService.generateRoomImage(
        fullPrompt,
        '9:16',
        selectedSize,
        selectedStyle
      );

      setStagedResultUrl(result.imageUrl);
      setModelUsedInfo(result.modelUsed);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToRoom = () => {
    if (!stagedResultUrl) return;

    const newStagedImage: StagedImage = {
      id: `staged-${Date.now()}`,
      url: stagedResultUrl,
      style: selectedStyle,
      size: selectedSize,
      createdAt: 'Just now',
      prompt: customPrompt || selectedStyle,
    };

    onSaveStagedImageToRoom(room.id, newStagedImage);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full sm:max-w-4xl max-h-[92vh] bg-zinc-950 border border-zinc-800 sm:rounded-3xl flex flex-col md:flex-row shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Side: Preview Canvas / Before-After Comparison */}
        <div className="flex-1 bg-zinc-900/60 p-4 sm:p-6 flex flex-col items-center justify-center relative border-b md:border-b-0 md:border-r border-zinc-800 min-h-[320px] md:min-h-0">
          {/* View Mode Toggle Header */}
          <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
            <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md p-1 rounded-full border border-white/10 text-xs">
              <button
                onClick={() => setActiveViewMode('original')}
                className={`px-3 py-1 rounded-full transition-colors ${
                  activeViewMode === 'original' ? 'bg-white text-zinc-950 font-bold' : 'text-zinc-300'
                }`}
              >
                Original
              </button>
              <button
                onClick={() => setActiveViewMode('staged')}
                className={`px-3 py-1 rounded-full transition-colors ${
                  activeViewMode === 'staged' ? 'bg-pink-500 text-white font-bold' : 'text-zinc-300'
                }`}
              >
                Staged
              </button>
              <button
                onClick={() => setActiveViewMode('split')}
                className={`px-3 py-1 rounded-full transition-colors ${
                  activeViewMode === 'split' ? 'bg-indigo-600 text-white font-bold' : 'text-zinc-300'
                }`}
              >
                Side-by-Side
              </button>
            </div>

            <span className="text-[10px] font-mono uppercase bg-zinc-900/90 text-pink-300 px-2.5 py-1 rounded-full border border-pink-500/30">
              {selectedSize} Resolution
            </span>
          </div>

          {/* Visual Canvas Display */}
          <div className="w-full max-w-sm aspect-[9/16] rounded-2xl overflow-hidden relative shadow-2xl border border-zinc-800 bg-black flex items-center justify-center">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-pink-500/20 text-pink-400 flex items-center justify-center border border-pink-500/40 animate-pulse">
                  <Sparkles className="w-6 h-6 animate-spin" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-white">Generating {selectedSize} Virtual Staging</h4>
                  <p className="text-xs text-zinc-400 font-mono">model: gemini-3-pro-image-preview</p>
                  <p className="text-[11px] text-pink-300">Styling with {selectedStyle}...</p>
                </div>
              </div>
            ) : activeViewMode === 'split' && stagedResultUrl ? (
              <div className="w-full h-full flex">
                <div className="w-1/2 h-full overflow-hidden relative border-r border-white/20">
                  <img
                    src={room.fallbackThumbnail}
                    alt="Original"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-2 left-2 text-[10px] bg-black/70 text-white px-2 py-0.5 rounded backdrop-blur-md">
                    Original
                  </span>
                </div>
                <div className="w-1/2 h-full overflow-hidden relative">
                  <img
                    src={stagedResultUrl}
                    alt="Staged"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-2 right-2 text-[10px] bg-pink-600 text-white px-2 py-0.5 rounded backdrop-blur-md font-bold">
                    {selectedSize} Staged
                  </span>
                </div>
              </div>
            ) : activeViewMode === 'original' || !stagedResultUrl ? (
              <div className="w-full h-full relative">
                <img
                  src={room.fallbackThumbnail}
                  alt={room.title}
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-3 left-3 text-xs bg-black/70 backdrop-blur-md text-white px-2.5 py-1 rounded-lg border border-white/10 font-medium">
                  Original Room Footage
                </span>
              </div>
            ) : (
              <div className="w-full h-full relative group">
                <img
                  src={stagedResultUrl}
                  alt="Staged room render"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                  <span className="text-xs bg-black/75 backdrop-blur-md text-pink-300 px-2.5 py-1 rounded-lg border border-pink-500/30 font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                    <span>{selectedStyle.split('&')[0]}</span>
                  </span>
                  <span className="text-[10px] bg-black/80 font-mono text-zinc-300 px-2 py-1 rounded-md">
                    {selectedSize}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Model info watermark */}
          <div className="mt-3 text-[11px] text-zinc-500 font-mono flex items-center gap-1.5">
            <span>Powered by</span>
            <span className="text-zinc-300 font-semibold">{modelUsedInfo}</span>
          </div>
        </div>

        {/* Right Side: Configuration & Affordances */}
        <div className="w-full md:w-96 p-5 sm:p-6 flex flex-col justify-between overflow-y-auto space-y-6">
          <div className="space-y-5">
            {/* Modal Title */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <span>AI Room Staging Studio</span>
                </h3>
                <p className="text-xs text-zinc-400">Restyle and visualize your future space</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* MANDATORY AFFORDANCE: Image Size Specification (1K, 2K, 4K) */}
            <div className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-2">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span>Target Resolution Affordance</span>
                <span className="text-[10px] text-pink-400 font-mono">gemini-3-pro-image-preview</span>
              </label>

              <div className="grid grid-cols-3 gap-2 pt-1">
                {(['1K', '2K', '4K'] as const).map((size) => {
                  const isSelected = selectedSize === size;
                  const resolutionLabel =
                    size === '1K' ? '1024 × 1792' : size === '2K' ? '1440 × 2560' : '2160 × 3840';
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSelectedSize(size)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        isSelected
                          ? 'bg-pink-500/20 border-pink-500 text-white shadow-md shadow-pink-500/20'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="font-black text-sm">{size}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">{resolutionLabel}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Style Presets */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                Interior Design Aesthetic
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {stylePresets.map((preset) => {
                  const isSelected = selectedStyle === preset.name;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setSelectedStyle(preset.name)}
                      className={`w-full p-2.5 rounded-xl text-left border flex items-start gap-2.5 transition-all ${
                        isSelected
                          ? 'bg-indigo-600/20 border-indigo-500 text-white'
                          : 'bg-zinc-900/50 border-zinc-800/80 text-zinc-300 hover:bg-zinc-900'
                      }`}
                    >
                      <span className="text-lg">{preset.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white truncate">{preset.name}</div>
                        <div className="text-[11px] text-zinc-400 line-clamp-1">{preset.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Prompt Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">
                Custom Staging Details (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Add an acoustic guitar stand and a fiddle leaf fig tree..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-xs placeholder-zinc-500 focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-3 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-pink-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
            >
              <Wand2 className="w-4 h-4" />
              <span>{isGenerating ? 'Generating...' : `Generate ${selectedSize} Staging Render`}</span>
            </button>

            {stagedResultUrl && (
              <div className="flex gap-2">
                <button
                  onClick={handleSaveToRoom}
                  className="flex-1 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs rounded-xl border border-zinc-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{saveSuccess ? 'Saved to Listing ✓' : 'Save to Room Card'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
