import React, { useState } from 'react';
import { 
  X, 
  Video, 
  Camera, 
  Wand2, 
  Sparkles, 
  MapPin, 
  Coffee, 
  ShoppingBag, 
  Utensils, 
  Compass, 
  Check, 
  Play, 
  FileText, 
  ArrowRight, 
  CheckCircle, 
  Zap,
  Volume2
} from 'lucide-react';
import { RoomListing } from '../types';

interface AiDirectorStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyEditedListing: (updatedRoom: Partial<RoomListing>) => void;
  room?: RoomListing;
}

export const AiDirectorStudioModal: React.FC<AiDirectorStudioModalProps> = ({
  isOpen,
  onClose,
  onApplyEditedListing,
  room,
}) => {
  const [activeStep, setActiveStep] = useState<'record_guide' | 'ai_editor' | 'walkability'>('record_guide');
  const [selectedScenario, setSelectedScenario] = useState<number>(0);
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [aiScriptTiming, setAiScriptTiming] = useState<{ time: string; text: string; cue: string }[]>([]);
  const [walkabilityData, setWalkabilityData] = useState<any>(null);

  if (!isOpen) return null;

  const recordingScenarios = [
    {
      id: 0,
      title: 'Scene 1: Front Door & Common Area Reveal',
      duration: '4-6 seconds',
      objective: 'Hook the renter immediately with the welcoming entryway and sunlight flow',
      directions: [
        'Start with your camera outside the closed front door at chest height (vertical 9:16).',
        'Turn the handle and smoothly push open the door to reveal the open-concept living space.',
        'Take 3 slow steps forward and do a slow 90-degree pan across the living room and kitchen.',
        'Pro tip: Turn on all ambient lamps and open all window blinds before shooting!',
      ],
      voiceoverHook: '"POV: You just found the cleanest, sunniest flat in the neighborhood..."',
    },
    {
      id: 1,
      title: 'Scene 2: The Room for Rent Walkthrough',
      duration: '6-8 seconds',
      objective: 'Showcase bed placement, window lighting, closet space, and desk zone',
      directions: [
        'Stand at the doorway of the bedroom being rented.',
        'Walk toward the main window, panning slowly across where the bed and desk sit.',
        'Open the closet doors for 2 seconds to prove there is real hanger and storage space.',
        'Show the electrical outlets / work-from-home corner.',
      ],
      voiceoverHook: '"Here is your private sanctuary. Huge south-facing windows and super quiet..."',
    },
    {
      id: 2,
      title: 'Scene 3: Private or Shared Bathroom',
      duration: '3-4 seconds',
      objective: 'Highlight cleanliness, water pressure, and modern vanity storage',
      directions: [
        'Clean mirrors with glass cleaner prior to filming so reflections look pristine.',
        'Quick pan over the sink, vanity storage, and clean shower tile.',
        'Keep movement brisk and focused on high cleanliness standards.',
      ],
      voiceoverHook: '"Sparkling clean bathroom with awesome water pressure and lots of drawer space."',
    },
    {
      id: 3,
      title: 'Scene 4: Outdoor Balcony & Building Perks',
      duration: '4-5 seconds',
      objective: 'Show the view, fresh air, in-unit laundry, and neighborhood vibe',
      directions: [
        'Step out onto the balcony or patio and show the neighborhood tree canopy or skyline.',
        'Quick cut to the in-unit washer/dryer (renters love seeing this!).',
        'End on a warm smile or friendly wave.',
      ],
      voiceoverHook: '"Step out onto your private balcony for morning coffee. Message for a tour!"',
    },
  ];

  const handleRunAiDirector = () => {
    setIsProcessingAi(true);

    setTimeout(() => {
      const city = room?.city || 'San Francisco';
      const neighborhood = room?.neighborhood || 'Mission District';

      setGeneratedScript(
        `"POV: You just found your dream room in ${neighborhood}! ✨ Freshly renovated, sun-drenched private space with high ceilings and private bath. You're a 3-minute walk from the best cafes on Yelp, 5 mins from Whole Foods, and 4 mins to transit. Quiet roommates, all utilities included. DM us to grab a tour this weekend!"`
      );

      setAiScriptTiming([
        { time: '0:00 - 0:03', cue: 'Push front door open', text: `POV: You just unlocked your new flat in ${neighborhood}...` },
        { time: '0:03 - 0:08', cue: 'Pan bedroom & windows', text: 'Spacious private room with huge windows & afternoon golden hour light.' },
        { time: '0:08 - 0:12', cue: 'Show bathroom & in-unit W/D', text: 'Immaculate private bath and in-unit washer/dryer ready on day one.' },
        { time: '0:12 - 0:16', cue: 'Show balcony & neighborhood', text: '98 WalkScore: Coffee shops, grocery, and transit all within 5 mins. Tap Inquire to tour!' },
      ]);

      setWalkabilityData({
        walkScore: 98,
        transitScore: 92,
        bikeScore: 95,
        ratingYelp: '4.8 ★ on Yelp',
        topFood: [
          { name: 'Four Barrel Coffee', category: 'Specialty Espresso', walkTime: '2 min walk', distance: '0.1 mi', source: 'Yelp & Google' },
          { name: 'Tartine Bakery & Cafe', category: 'Artisan Pastries', walkTime: '4 min walk', distance: '0.2 mi', source: 'Google Maps' },
          { name: 'Taqueria El Farolito', category: 'Late Night Tacos', walkTime: '3 min walk', distance: '0.2 mi', source: 'Yelp Top 10' },
        ],
        topGroceries: [
          { name: 'Bi-Rite Market', category: 'Organic Produce & Deli', walkTime: '5 min walk', distance: '0.3 mi', source: 'Google' },
          { name: 'Whole Foods Market', category: 'Supermarket', walkTime: '7 min walk', distance: '0.4 mi', source: 'Google & Belly' },
        ],
        topActivities: [
          { name: 'Mission Dolores Park', category: 'Sunny Park & Skyline View', walkTime: '8 min walk', distance: '0.5 mi', source: 'Google' },
          { name: '24th St Mission BART Station', category: 'Subway / Rail', walkTime: '4 min walk', distance: '0.2 mi', source: 'Transit' },
        ],
      });

      setIsProcessingAi(false);
      setActiveStep('ai_editor');
    }, 1200);
  };

  const handleApplyToPost = () => {
    if (walkabilityData && generatedScript) {
      onApplyEditedListing({
        description: generatedScript,
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full sm:max-w-3xl max-h-[92vh] bg-zinc-950 border border-zinc-800 sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/70 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 via-rose-500 to-amber-400 text-white flex items-center justify-center shadow-lg shadow-pink-500/20">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Landlord Short-Form Creator Studio</h3>
              <p className="text-xs text-zinc-400">Step-by-step recording guide & AI auto-script director</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Navigation Tabs */}
        <div className="px-5 py-2.5 bg-zinc-900/40 border-b border-zinc-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveStep('record_guide')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                activeStep === 'record_guide'
                  ? 'bg-white text-zinc-950 shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              1. Recording Scenarios Guide
            </button>
            <button
              onClick={() => {
                if (!generatedScript) handleRunAiDirector();
                setActiveStep('ai_editor');
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                activeStep === 'ai_editor'
                  ? 'bg-pink-500 text-white shadow-md shadow-pink-500/25'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>2. AI Auto-Edit & Script</span>
            </button>
            <button
              onClick={() => {
                if (!walkabilityData) handleRunAiDirector();
                setActiveStep('walkability');
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                activeStep === 'walkability'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>3. Walkability & Hotspots</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeStep === 'record_guide' && (
            /* STEP 1: STEP-BY-STEP RECORDING INSTRUCTIONS FOR SCENARIOS */
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-pink-950/30 via-zinc-900 to-zinc-900 border border-pink-500/30">
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Camera className="w-4 h-4 text-pink-400" />
                  <span>How to Film High-Converting Room Tours (Tiktok & Reels Style)</span>
                </h4>
                <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                  Renters want authentic, steady, vertical video footage that walks them through the space. Follow these 4 shot scenarios to record each clip on your phone in under 5 minutes:
                </p>
              </div>

              {/* Scenario selector tabs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {recordingScenarios.map((sc, idx) => (
                  <button
                    key={sc.id}
                    onClick={() => setSelectedScenario(idx)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedScenario === idx
                        ? 'bg-pink-500/20 border-pink-500 text-white'
                        : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold text-pink-400">
                      Step {idx + 1}
                    </div>
                    <div className="font-bold text-xs text-white truncate mt-0.5">
                      {sc.title.split(':')[1] || sc.title}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">{sc.duration}</div>
                  </button>
                ))}
              </div>

              {/* Selected Scenario Detailed Instructions */}
              <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <h5 className="font-bold text-sm text-white">
                      {recordingScenarios[selectedScenario].title}
                    </h5>
                    <p className="text-xs text-pink-400 font-medium mt-0.5">
                      Target length: {recordingScenarios[selectedScenario].duration} • {recordingScenarios[selectedScenario].objective}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400 block">
                    Step-by-Step Filming Directions:
                  </span>
                  {recordingScenarios[selectedScenario].directions.map((dir, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs text-zinc-200">
                      <div className="w-5 h-5 rounded-full bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0 text-[11px] font-bold mt-0.5">
                        {i + 1}
                      </div>
                      <p className="leading-relaxed">{dir}</p>
                    </div>
                  ))}
                </div>

                {/* Voiceover hook prompt */}
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs space-y-1">
                  <div className="text-[10px] font-bold uppercase text-amber-400 flex items-center gap-1">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Recommended Audio Hook</span>
                  </div>
                  <p className="text-zinc-200 italic font-medium">
                    {recordingScenarios[selectedScenario].voiceoverHook}
                  </p>
                </div>
              </div>

              {/* Run AI Auto Edit Button */}
              <button
                onClick={handleRunAiDirector}
                className="w-full py-3 bg-gradient-to-r from-pink-500 via-rose-500 to-amber-500 hover:from-pink-600 hover:to-amber-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-pink-500/30 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Wand2 className="w-4 h-4" />
                <span>Compile Videos & Generate AI Script + Walkability</span>
              </button>
            </div>
          )}

          {activeStep === 'ai_editor' && (
            /* STEP 2: AI AUTO-EDITING & SCRIPT TIMING */
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-pink-400" />
                    <h4 className="font-bold text-sm text-white">AI-Generated Narration & Captions Script</h4>
                  </div>
                  <span className="text-[10px] bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full font-mono border border-pink-500/30">
                    Auto-Timed
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-zinc-100 italic bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/80 leading-relaxed">
                  {generatedScript}
                </p>
              </div>

              {/* Timeline Cues */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Timed Video Captions & Audio Cues
                </h5>

                <div className="space-y-2">
                  {aiScriptTiming.map((cue, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800 flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-bold text-pink-400 bg-pink-500/10 px-1.5 py-0.2 rounded">
                            {cue.time}
                          </span>
                          <span className="text-[11px] text-zinc-400 font-semibold truncate">
                            {cue.cue}
                          </span>
                        </div>
                        <p className="text-zinc-200 leading-snug">{cue.text}</p>
                      </div>
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-1" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setActiveStep('walkability')}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/25 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Compass className="w-4 h-4" />
                  <span>Review Walkability & Local Hotspots</span>
                </button>
              </div>
            </div>
          )}

          {activeStep === 'walkability' && walkabilityData && (
            /* STEP 3: INTEGRATED WALKABILITY BASED ON YELP, BELLY & GOOGLE */
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <Compass className="w-4 h-4 text-emerald-400" />
                    <span>Integrated Walkability & Local Discovery</span>
                  </h4>
                  <span className="text-[10px] text-emerald-300 font-mono bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                    Google Maps & Yelp Grounded
                  </span>
                </div>
                <p className="text-xs text-zinc-300">
                  RoomieReels automatically surfaces top restaurants, grocery stores, cafes, and subway access within walking distance to entice renters.
                </p>

                {/* Score Badges */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                    <div className="text-lg font-black text-emerald-400">{walkabilityData.walkScore}/100</div>
                    <div className="text-[10px] text-zinc-400">Walker's Paradise</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                    <div className="text-lg font-black text-indigo-400">{walkabilityData.transitScore}/100</div>
                    <div className="text-[10px] text-zinc-400">Rider's Paradise</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                    <div className="text-lg font-black text-pink-400">{walkabilityData.bikeScore}/100</div>
                    <div className="text-[10px] text-zinc-400">Biker's Dream</div>
                  </div>
                </div>
              </div>

              {/* Food & Dining (Yelp / Google) */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5 text-pink-400" />
                  <span>Nearby Cafes & Dining (Yelp & Google Top Picks)</span>
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {walkabilityData.topFood.map((spot: any, i: number) => (
                    <div key={i} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs space-y-1">
                      <div className="font-bold text-white truncate">{spot.name}</div>
                      <div className="text-[11px] text-zinc-400">{spot.category}</div>
                      <div className="flex items-center justify-between text-[10px] text-emerald-400 font-semibold pt-1">
                        <span>{spot.walkTime}</span>
                        <span className="text-zinc-500 font-mono">{spot.source}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grocery & Shopping (Belly & Google) */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                  <span>Grocery & Everyday Essentials (Belly & Google)</span>
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {walkabilityData.topGroceries.map((g: any, i: number) => (
                    <div key={i} className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-xs space-y-1">
                      <div className="font-bold text-white truncate">{g.name}</div>
                      <div className="text-[11px] text-zinc-400">{g.category}</div>
                      <div className="flex items-center justify-between text-[10px] text-emerald-400 font-semibold pt-1">
                        <span>{g.walkTime}</span>
                        <span className="text-zinc-500 font-mono">{g.source}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Apply CTA */}
              <button
                onClick={handleApplyToPost}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Apply AI Script & Walkability Data to Room Listing</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
