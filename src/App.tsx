import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Video, 
  FileVideo, 
  Download, 
  Sparkles, 
  Play, 
  Pause, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  RotateCcw, 
  Languages, 
  ChevronRight, 
  Settings, 
  Info,
  Type as FontIcon,
  Eye,
  Sliders,
  Flame,
  Volume2
} from 'lucide-react';
import { SubtitleBlock, SubtitleTone, BurnConfig } from './types';
import { motion, AnimatePresence } from 'motion/react';

// Generates a simple mock ID
const generateId = () => Math.random().toString(36).substring(2, 9);

// Standard subtitle formatting helper (seconds -> HH:MM:SS,mmm or MM:SS)
const formatTime = (secs: number, detailed = false) => {
  if (isNaN(secs)) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs % 1) * 1000);
  
  if (detailed) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Default subtitles for our interactive Chinese Drama sample
const SAMPLE_SUBTITLES: SubtitleBlock[] = [
  {
    id: 's1',
    startTime: 1.2,
    endTime: 4.8,
    chinese: '陛下，北境传来八百里加急战报！',
    burmese: 'အရှင်မင်းကြီး၊ မြောက်ပိုင်းနယ်စပ်က အရေးပေါ် စစ်သတင်း ပို့လာပါပြီ!'
  },
  {
    id: 's2',
    startTime: 5.5,
    endTime: 9.0,
    chinese: '敌军十万铁骑已逼近幽州关口，城池危在旦夕。',
    burmese: 'ရန်သူ့မြင်းတပ် အင်အားတစ်သိန်းဟာ ယူကျိုးခံတပ်ကို ချဥ်းကပ်လာနေလို့ မြို့တော်က တုန်လှုပ်နေပါတယ်။'
  },
  {
    id: 's3',
    startTime: 10.1,
    endTime: 13.5,
    chinese: '孤……绝不退让半步！传朕旨意，御驾亲征！',
    burmese: 'ငါကိုယ်တော်... တစ်လှမ်းလေးတောင် နောက်မဆုတ်နိုင်ဘူး! အမိန့်တော်ထုတ်ပြန်စေ၊ ကိုယ်တိုင် စစ်ချီမယ်!'
  },
  {
    id: 's4',
    startTime: 14.2,
    endTime: 18.0,
    chinese: '纵然战死沙场，朕也要护我大好河山，护我幽州百姓！',
    burmese: 'တိုက်ပွဲမြေပြင်မှာ အသက်စတေးရပါစေ၊ ငါ့ရဲ့ ခမ်းနားတဲ့ အမိမြေနဲ့ ပြည်သူတွေကို ငါကိုယ်တော် ကာကွယ်မယ်!'
  },
  {
    id: 's5',
    startTime: 19.0,
    endTime: 23.5,
    chinese: '臣等誓死追随陛下，万岁万岁万万岁！',
    burmese: 'အမတ်မင်းတို့လည်း အရှင်မင်းကြီးနောက်သို့ သေတူရှင်မလိုက်ပါမည်၊ သက်တော်အရာကျော် ရှည်ပါစေ!'
  }
];

const SAMPLE_VIDEO_URL = '/api/video-proxy?url=' + encodeURIComponent('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4');

export default function App() {
  // Video and Subtitle States
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [subtitles, setSubtitles] = useState<SubtitleBlock[]>([]);
  const [activeSubtitle, setActiveSubtitle] = useState<SubtitleBlock | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  
  // App workflow state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isDemo, setIsDemo] = useState<boolean>(false);
  
  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'both' | 'burmese' | 'chinese'>('both');

  // Burning / Export state
  const [isBurning, setIsBurning] = useState<boolean>(false);
  const [burnProgress, setBurnProgress] = useState<number>(0);
  const [burnDownloadUrl, setBurnDownloadUrl] = useState<string>('');
  const [burnError, setBurnError] = useState<string>('');
  const [burnConfig, setBurnConfig] = useState<BurnConfig>({
    fontSize: 28,
    fontColor: '#FBBF24', // Amber gold
    outlineColor: '#000000',
    outlineWidth: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    verticalOffset: 12 // % from bottom
  });

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subtitleContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Update active subtitle based on video progress
  useEffect(() => {
    if (!subtitles.length) {
      setActiveSubtitle(null);
      return;
    }
    const match = subtitles.find(
      (sub) => currentTime >= sub.startTime && currentTime <= sub.endTime
    );
    setActiveSubtitle(match || null);
  }, [currentTime, subtitles]);

  // Handle tracking progress of video
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDuration(videoRef.current.duration);
    }
  };

  // Drag and drop upload support
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('video/')) {
      processSelectedVideo(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processSelectedVideo(files[0]);
    }
  };

  const processSelectedVideo = async (file: File) => {
    setVideoFile(file);
    setIsDemo(false);
    
    // Create local object URL for instant preview feedback
    const localUrl = URL.createObjectURL(file);
    setVideoUrl(localUrl);
    setSubtitles([]);
    setErrorMsg('');

    // Background upload to server for same-origin streaming (bypasses iframe sandbox block)
    try {
      const formData = new FormData();
      formData.append('video', file);
      
      const response = await fetch('/api/upload-video', {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.videoUrl) {
          console.log('[Background Upload] Successfully generated same-origin video streaming URL:', data.videoUrl);
          setVideoUrl(data.videoUrl);
        }
      }
    } catch (err) {
      console.warn('[Background Upload] Same-origin upload failed, using local Blob URL preview:', err);
    }
  };

  // Launch AI Auto Translation pipeline
  const handleAutoTranslate = async () => {
    if (!videoFile && !isDemo) {
      setErrorMsg('Please upload a video file first.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    // Array of friendly cinematic workflow logs
    const steps = [
      'Extracting spoken voice frequencies...',
      'Isolating background noise & instrumental tracks...',
      'Identifying Mandarin spoken dialog...',
      'Transcribing Chinese vocal syntax...',
      'Translating scripts into idiomatic Burmese...',
      'Structuring final timed SRT elements...'
    ];

    let currentStepIdx = 0;
    setLoadingStep(steps[currentStepIdx]);

    const stepInterval = setInterval(() => {
      if (currentStepIdx < steps.length - 1) {
        currentStepIdx++;
        setLoadingStep(steps[currentStepIdx]);
      }
    }, 4000);

    try {
      // If we are running a Demo mode, mock the transcription wait and load premium Chinese drama sample subtitles
      if (isDemo || !videoFile) {
        await new Promise((resolve) => setTimeout(resolve, 8000));
        setSubtitles(JSON.parse(JSON.stringify(SAMPLE_SUBTITLES)));
        clearInterval(stepInterval);
        setIsLoading(false);
        return;
      }

      // Otherwise, hit our live backend Express transcribe route!
      const formData = new FormData();
      formData.append('video', videoFile);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errMsg = 'Server transcription failed.';
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            const errData = await response.json();
            errMsg = errData.error || errMsg;
          } catch (_) {}
        } else {
          try {
            const errText = await response.text();
            errMsg = `Server error (${response.status}): ${errText.slice(0, 150)}`;
          } catch (_) {
            errMsg = `Server error status: ${response.status}`;
          }
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      if (data.success && data.subtitles) {
        // Map unique client IDs to each subtitle block
        const parsedSubtitles = data.subtitles.map((sub: any) => ({
          ...sub,
          id: generateId()
        }));
        setSubtitles(parsedSubtitles);
      } else {
        throw new Error('No transcription output received from Gemini.');
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to auto-translate. Please check your Gemini API key configurations.');
    } finally {
      clearInterval(stepInterval);
      setIsLoading(false);
    }
  };

  // Load standard Demo sandbox to try immediately
  const loadDemoSandbox = () => {
    setIsDemo(true);
    setVideoUrl(SAMPLE_VIDEO_URL);
    setSubtitles(JSON.parse(JSON.stringify(SAMPLE_SUBTITLES)));
    setErrorMsg('');
  };

  // Jump player to specific subtitle timeline
  const jumpToTime = (time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, time);
      videoRef.current.play();
    }
  };

  // Edit fields inline
  const updateSubtitleField = (id: string, field: 'chinese' | 'burmese', value: string) => {
    setSubtitles(prev => prev.map(sub => {
      if (sub.id === id) {
        return { ...sub, [field]: value };
      }
      return sub;
    }));
  };

  const updateSubtitleTime = (id: string, field: 'startTime' | 'endTime', value: number) => {
    setSubtitles(prev => prev.map(sub => {
      if (sub.id === id) {
        // Bound checks
        const cleanVal = Math.max(0, Number(value.toFixed(2)));
        return { ...sub, [field]: cleanVal };
      }
      return sub;
    }).sort((a, b) => a.startTime - b.startTime));
  };

  // Add and Delete subtitle frames
  const addNewSubtitle = () => {
    const defaultStart = videoRef.current ? videoRef.current.currentTime : 0;
    const defaultEnd = defaultStart + 3.0;

    const newSub: SubtitleBlock = {
      id: generateId(),
      startTime: Number(defaultStart.toFixed(2)),
      endTime: Number(defaultEnd.toFixed(2)),
      chinese: '新增字幕文本...',
      burmese: 'စာတန်းထိုးအသစ်ထည့်ပါ...'
    };

    setSubtitles(prev => [...prev, newSub].sort((a, b) => a.startTime - b.startTime));
    setEditingId(newSub.id);
  };

  const deleteSubtitle = (id: string) => {
    setSubtitles(prev => prev.filter(sub => sub.id !== id));
    if (editingId === id) setEditingId(null);
  };

  // Trigger Gemini API translation enhancement/style tone refine
  const refineSubtitles = async (tone: SubtitleTone) => {
    if (!subtitles.length) return;
    setIsLoading(true);
    setLoadingStep(`Polishing translations to a highly ${tone} Chinese drama level...`);

    try {
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtitles, tone })
      });

      if (!response.ok) {
        let errMsg = 'Failed to refine subtitles.';
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            const errData = await response.json();
            errMsg = errData.error || errMsg;
          } catch (_) {}
        } else {
          try {
            const errText = await response.text();
            errMsg = `Server error (${response.status}): ${errText.slice(0, 150)}`;
          } catch (_) {
            errMsg = `Server error status: ${response.status}`;
          }
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      if (data.success && data.subtitles) {
        const parsed = data.subtitles.map((sub: any) => ({
          ...sub,
          id: generateId()
        }));
        setSubtitles(parsed);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to refine subtitle tone.');
    } finally {
      setIsLoading(false);
    }
  };

  // Generate SRT text for download
  const generateSRTString = (lang: 'burmese' | 'chinese' | 'dual'): string => {
    return subtitles.map((sub, idx) => {
      const startStr = formatTime(sub.startTime, true);
      const endStr = formatTime(sub.endTime, true);
      let content = '';
      if (lang === 'burmese') content = sub.burmese;
      else if (lang === 'chinese') content = sub.chinese;
      else content = `${sub.chinese}\n${sub.burmese}`;

      return `${idx + 1}\n${startStr} --> ${endStr}\n${content}\n\n`;
    }).join('').trim();
  };

  const handleDownloadSRT = (lang: 'burmese' | 'chinese' | 'dual') => {
    const srtContent = generateSRTString(lang);
    const blob = new Blob([srtContent], { type: 'text/srt;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${videoFile?.name ? videoFile.name.replace(/\.[^/.]+$/, "") : "drama"}_${lang}_subtitles.srt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Canvas-based Client-side Video Burn-in Engine
  const startBurningVideo = async () => {
    const video = videoRef.current;
    if (!video || !subtitles.length) return;

    setIsBurning(true);
    setBurnProgress(0);
    setBurnDownloadUrl('');
    setBurnError('');

    // Configure canvas
    const canvas = canvasRef.current;
    if (!canvas) {
      setIsBurning(false);
      setBurnError('Canvas reference not found.');
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setIsBurning(false);
      setBurnError('Could not get 2D canvas context.');
      return;
    }

    // Set canvas resolution to match video dimensions
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    // Save playing position to restore later
    const originalTime = video.currentTime;
    const originalPlaying = !video.paused;

    let localAudioCtx: AudioContext | null = null;
    let localSourceNode: MediaElementAudioSourceNode | null = null;
    let burningActive = true;

    try {
      // Configure Audio Destination Capture safely reusing refs
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      localAudioCtx = audioCtxRef.current;
      
      if (localAudioCtx.state === 'suspended') {
        await localAudioCtx.resume();
      }

      if (!audioSourceRef.current) {
        audioSourceRef.current = localAudioCtx.createMediaElementSource(video);
      }
      localSourceNode = audioSourceRef.current;

      const destStreamNode = localAudioCtx.createMediaStreamDestination();
      
      // Clean up previous connections and connect video audio to recorder AND standard output
      localSourceNode.disconnect();
      localSourceNode.connect(destStreamNode);
      localSourceNode.connect(localAudioCtx.destination);

      // Capture video from canvas
      const videoStream = canvas.captureStream(30); // 30 FPS
      
      // Combine video track and audio track
      const combinedTracks = [
        ...videoStream.getVideoTracks(),
        ...destStreamNode.stream.getAudioTracks()
      ];
      const combinedStream = new MediaStream(combinedTracks);

      // Initialize MediaRecorder
      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
      
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(combinedStream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        burningActive = false;
        const finalBlob = new Blob(chunks, { type: 'video/webm' });
        const dlUrl = URL.createObjectURL(finalBlob);
        setBurnDownloadUrl(dlUrl);
        setIsBurning(false);

        // Reset audio connections back to default
        if (localSourceNode && localAudioCtx) {
          try {
            localSourceNode.disconnect();
            localSourceNode.connect(localAudioCtx.destination);
          } catch (_) {}
        }

        // Seek video back to original position
        video.playbackRate = 1.0;
        video.currentTime = originalTime;
        if (originalPlaying) video.play();
      };

      // Prepare video for recording
      video.currentTime = 0;
      video.playbackRate = 1.5; // Render faster!
      
      // Play video
      await video.play();
      recorder.start();

      // Burning Rendering Loop
      const renderLoop = () => {
        if (!burningActive) return;

        if (video.ended || video.currentTime >= video.duration) {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
          return;
        }

        // 1. Draw video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 2. Find and Draw Active Burmese Subtitle
        const t = video.currentTime;
        const sub = subtitles.find(s => t >= s.startTime && t <= s.endTime);
        
        if (sub) {
          ctx.save();
          
          // Font styles
          ctx.font = `bold ${burnConfig.fontSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';

          const x = canvas.width / 2;
          const y = canvas.height - (canvas.height * (burnConfig.verticalOffset / 100));

          // Subtitle background backing pill
          const paddingX = 24;
          const paddingY = 10;
          const textMetrics = ctx.measureText(sub.burmese);
          const textWidth = textMetrics.width;
          const textHeight = burnConfig.fontSize; // Approx

          ctx.fillStyle = burnConfig.backgroundColor;
          ctx.beginPath();
          ctx.roundRect(
            x - (textWidth / 2) - paddingX,
            y - textHeight - paddingY,
            textWidth + (paddingX * 2),
            textHeight + (paddingY * 2),
            8
          );
          ctx.fill();

          // Stroke Outline text
          ctx.strokeStyle = burnConfig.outlineColor;
          ctx.lineWidth = burnConfig.outlineWidth;
          ctx.strokeText(sub.burmese, x, y);

          // Fill text
          ctx.fillStyle = burnConfig.fontColor;
          ctx.fillText(sub.burmese, x, y);

          ctx.restore();
        }

        // Update progress
        const prog = Math.min(99, Math.round((video.currentTime / video.duration) * 100));
        setBurnProgress(prog);

        if (burningActive) {
          requestAnimationFrame(renderLoop);
        }
      };

      // Start rendering frame-by-frame
      requestAnimationFrame(renderLoop);

    } catch (err: any) {
      console.error('[Burn Error]', err);
      setBurnError(err?.message || 'Client-side subtitle burn-in failed. Please ensure your browser supports MediaRecorder.');
      setIsBurning(false);
      burningActive = false;
      
      // Reset connections
      if (localSourceNode && localAudioCtx) {
        try {
          localSourceNode.disconnect();
          localSourceNode.connect(localAudioCtx.destination);
        } catch (_) {}
      }

      // Restore video state
      video.playbackRate = 1.0;
      video.currentTime = originalTime;
      if (originalPlaying) {
        try {
          video.play();
        } catch (_) {}
      }
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-rose-800 selection:text-white">
      {/* Decorative Traditional Asian-themed Header */}
      <header className="border-b border-rose-950/40 bg-neutral-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="bg-rose-900/30 border border-rose-800 p-2.5 rounded-lg flex items-center justify-center shadow-lg shadow-rose-950/20">
            <Languages className="w-6 h-6 text-rose-500 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white font-serif flex items-center gap-2">
              Chinese Drama Auto Translator
              <span className="text-[10px] uppercase font-mono tracking-widest bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">
                AI Powered
              </span>
            </h1>
            <p className="text-xs text-neutral-400">Cinematic transcription & elegant Burmese translation workflow</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {videoUrl && !isLoading && (
            <button
              onClick={() => {
                setVideoFile(null);
                setVideoUrl('');
                setSubtitles([]);
              }}
              className="px-3.5 py-1.5 text-xs rounded-lg border border-neutral-800 hover:border-neutral-700 bg-neutral-900 text-neutral-300 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Start Over
            </button>
          )}

          <a 
            href="#guidelines" 
            className="text-xs text-neutral-500 hover:text-neutral-400 underline transition-all hidden sm:inline"
          >
            How it works
          </a>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-1 flex flex-col">
        {!videoUrl ? (
          /* SPLASH SCREEN: UPLOAD OR SANDBOX TRIAL */
          <div className="flex-1 flex items-center justify-center p-6 bg-gradient-to-b from-neutral-950 via-neutral-950 to-neutral-900">
            <div className="max-w-2xl w-full text-center">
              <div className="mb-8 inline-flex relative">
                <div className="absolute -inset-1 rounded-full bg-rose-800 blur-lg opacity-45"></div>
                <div className="relative bg-neutral-900 border border-rose-900/30 p-6 rounded-full">
                  <FileVideo className="w-12 h-12 text-rose-500" />
                </div>
              </div>

              <h2 className="text-3xl font-serif font-semibold text-white tracking-tight mb-3">
                Translate Chinese Dramas Effortlessly
              </h2>
              <p className="text-neutral-400 max-w-md mx-auto text-sm leading-relaxed mb-8">
                Upload your Chinese drama MP4 clip. Our Gemini translation brain listens to native spoken Mandarin, aligns subtitles, and crafts beautiful Burmese dialogs.
              </p>

              {/* Upload Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-neutral-800 hover:border-rose-900/40 hover:bg-neutral-900/30 transition-all rounded-2xl p-10 cursor-pointer mb-6 group relative"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="video/mp4,video/*"
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-neutral-500 group-hover:text-rose-500 transition-colors mx-auto mb-3" />
                <span className="block text-sm text-neutral-200 font-medium group-hover:text-rose-400 transition-colors">
                  Drag and drop Chinese Drama video file here
                </span>
                <span className="block text-xs text-neutral-500 mt-1">
                  Supports MP4, WebM up to 100MB
                </span>
              </div>

              {/* Demo Fast Trial Option */}
              <div className="flex items-center justify-center gap-3">
                <span className="text-xs text-neutral-600">or try immediately with our</span>
                <button
                  onClick={loadDemoSandbox}
                  className="px-4 py-2 text-xs bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg hover:bg-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer font-medium"
                >
                  <Flame className="w-3.5 h-3.5" /> Instant Demo Drama Clip
                </button>
              </div>

              {errorMsg && (
                <div className="mt-6 p-4 bg-rose-950/20 border border-rose-900/30 text-rose-400 rounded-lg text-xs max-w-md mx-auto">
                  {errorMsg}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* WORKSPACE VIEW: Player & Subtitle Deck */
          <div className="flex-1 flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-neutral-900">
            
            {/* Left Column: Player & Configuration options */}
            <div className="flex-1 p-6 flex flex-col justify-between bg-neutral-950/40">
              <div className="space-y-6">
                {errorMsg && (
                  <div className="p-4 bg-rose-950/30 border border-rose-900/50 text-rose-200 rounded-xl text-xs space-y-2 relative">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-rose-400 uppercase tracking-wider text-[10px] font-mono">Translation Status Error</span>
                      <button 
                        onClick={() => setErrorMsg('')} 
                        className="text-rose-400 hover:text-rose-100 transition-colors cursor-pointer text-sm font-bold"
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="font-sans leading-relaxed">{errorMsg}</p>
                  </div>
                )}

                {/* Visual Media Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
                    <span className="text-xs font-mono text-neutral-400 font-semibold uppercase">
                      {isDemo ? 'Demo Drama Playback Mode' : `Editing: ${videoFile?.name || 'Local File'}`}
                    </span>
                  </div>
                  {subtitles.length > 0 && (
                    <span className="text-[11px] font-mono text-amber-400/80 bg-amber-500/5 px-2 py-0.5 border border-amber-500/10 rounded">
                      {subtitles.length} Spoken Captions Synced
                    </span>
                  )}
                </div>

                {/* Main Video Screen Container with integrated Overlay subtitle */}
                <div className="relative aspect-video w-full bg-black rounded-xl overflow-hidden border border-neutral-900 group shadow-2xl">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    controls
                    className="w-full h-full object-contain"
                  />

                  {/* Subtitle Overlay Screen layer */}
                  {activeSubtitle && (
                    <div className="absolute inset-x-0 bottom-12 flex flex-col items-center pointer-events-none px-4 select-none">
                      {/* Original Chinese dialogue overlay (Optional tab trigger) */}
                      {activeTab !== 'burmese' && (
                        <div className="bg-black/75 px-4 py-1.5 rounded-t-lg border-b border-rose-900/20 text-sm font-sans font-medium text-neutral-300 max-w-[85%] text-center tracking-wide leading-relaxed shadow-lg">
                          {activeSubtitle.chinese}
                        </div>
                      )}
                      {/* Natural Burmese overlay */}
                      {activeTab !== 'chinese' && (
                        <div className="bg-gradient-to-r from-rose-950/90 to-rose-900/90 border border-rose-800 text-amber-300 font-sans font-bold text-lg md:text-xl px-5 py-2 rounded-b-lg shadow-2xl max-w-[90%] text-center leading-relaxed">
                          {activeSubtitle.burmese}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Subtitle Timing Timeline & Preview Playhead */}
                <div className="bg-neutral-900/40 border border-neutral-900 rounded-xl p-4">
                  <div className="flex items-center justify-between text-xs text-neutral-400 mb-2 font-mono">
                    <span>Playhead time: {formatTime(currentTime)}</span>
                    <span>Total length: {formatTime(videoDuration)}</span>
                  </div>
                  <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden relative">
                    <div 
                      className="bg-rose-600 h-full transition-all duration-75"
                      style={{ width: `${videoDuration ? (currentTime / videoDuration) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* AI Transcription Action Block if subtitles are empty */}
                {subtitles.length === 0 && (
                  <div className="bg-neutral-900/60 border border-rose-950/20 p-8 rounded-2xl text-center space-y-4">
                    <div className="w-12 h-12 bg-rose-900/20 border border-rose-800 rounded-full flex items-center justify-center mx-auto text-rose-500">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-serif font-semibold text-white">Generate Chinese & Burmese Subtitles</h3>
                      <p className="text-xs text-neutral-400 max-w-sm mx-auto mt-1">
                        Let Gemini model scan the audio frequencies, extract Mandarin Chinese dialogs, and write elegant Burmese translation segments.
                      </p>
                    </div>
                    <button
                      onClick={handleAutoTranslate}
                      disabled={isLoading}
                      className="px-6 py-2.5 bg-rose-800 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-lg shadow-rose-950/50 hover:shadow-rose-900/40 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" /> Start AI Translation
                    </button>
                  </div>
                )}

                {/* Burn Config and Burning Engine Area (Only shown once subtitles exist) */}
                {subtitles.length > 0 && (
                  <div className="bg-neutral-900/40 border border-neutral-900 p-5 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-rose-500" /> Subtitle Burn-In & Export
                      </h3>
                      <span className="text-[10px] text-neutral-500 font-mono">No server dependencies required</span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                      <div>
                        <label className="block text-neutral-400 mb-1">Font Color</label>
                        <div className="flex gap-1.5">
                          {['#FBBF24', '#FFFFFF', '#6EE7B7', '#F87171'].map(color => (
                            <button
                              key={color}
                              onClick={() => setBurnConfig(p => ({ ...p, fontColor: color }))}
                              className={`w-5 h-5 rounded border ${burnConfig.fontColor === color ? 'border-white scale-110' : 'border-neutral-800'}`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-neutral-400 mb-1">Font Size (px)</label>
                        <input
                          type="number"
                          value={burnConfig.fontSize}
                          onChange={(e) => setBurnConfig(p => ({ ...p, fontSize: Number(e.target.value) }))}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-neutral-400 mb-1">Position Offset (%)</label>
                        <input
                          type="number"
                          value={burnConfig.verticalOffset}
                          onChange={(e) => setBurnConfig(p => ({ ...p, verticalOffset: Number(e.target.value) }))}
                          className="w-full bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={startBurningVideo}
                        disabled={isBurning}
                        className="flex-1 py-2 px-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-neutral-950 font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-950/20"
                      >
                        <Flame className="w-4 h-4" /> Burn Burmese Subtitles into Video (Fast)
                      </button>

                      {burnDownloadUrl && (
                        <a
                          href={burnDownloadUrl}
                          download="drama_burmese_burned.webm"
                          className="py-2 px-4 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg text-xs transition-all text-center flex items-center justify-center gap-2"
                        >
                          <Download className="w-4 h-4" /> Save Exported Video (.webm)
                        </a>
                      )}
                    </div>

                    {burnError && (
                      <div className="p-3 bg-rose-950/20 border border-rose-900/30 text-rose-400 rounded-lg text-xs font-mono">
                        {burnError}
                      </div>
                    )}

                    {isBurning && (
                      <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between text-[11px] text-neutral-400 font-mono">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                            Rendering canvas video frames...
                          </span>
                          <span>{burnProgress}%</span>
                        </div>
                        <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                          <div className="bg-amber-500 h-full transition-all" style={{ width: `${burnProgress}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Hidden Canvas used for client side video burning/record */}
              <canvas ref={canvasRef} className="hidden" />

              {/* Instructions and Help */}
              <div id="guidelines" className="mt-8 border-t border-neutral-900 pt-6 space-y-3">
                <h4 className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5 uppercase font-serif tracking-wider">
                  <Info className="w-3.5 h-3.5 text-rose-500" /> Interactive Drama Features:
                </h4>
                <ul className="text-xs text-neutral-500 space-y-1.5 list-disc pl-4">
                  <li><strong>Clicking elements:</strong> Double-clicking any subtitle block seeking control shifts the video timeline exactly to that dialog's start time.</li>
                  <li><strong>Active Tracking:</strong> The subtitle editing column dynamically aligns and scrolls to center the currently spoken caption dialogue.</li>
                  <li><strong>SRT Downloads:</strong> Extract Burmese, Chinese, or Dual-Language SRT files in proper professional subtitle standard formats.</li>
                  <li><strong>Gemini Tone Polish:</strong> Instantly polish and transform the vocabulary into highly dramatic or ancient poetic phrasing styles.</li>
                </ul>
              </div>
            </div>

            {/* Right Column: Subtitle Deck Sidebar */}
            <div className="w-full lg:w-[480px] flex flex-col bg-neutral-900/40">
              {/* Header inside subtitle deck */}
              <div className="p-4 border-b border-neutral-900 bg-neutral-900/60 sticky top-[72px] z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold tracking-wider font-serif uppercase text-white flex items-center gap-1.5">
                    <Edit3 className="w-4 h-4 text-rose-500" /> Dialogue Deck
                  </h3>
                  
                  {subtitles.length > 0 && (
                    <button
                      onClick={addNewSubtitle}
                      className="px-2.5 py-1.5 text-[11px] bg-rose-900/40 hover:bg-rose-900/60 border border-rose-800 text-rose-200 rounded-md transition-all flex items-center gap-1 cursor-pointer font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Frame
                    </button>
                  )}
                </div>

                {subtitles.length > 0 && (
                  <div className="space-y-3">
                    {/* View overlay select tab */}
                    <div className="flex bg-neutral-950 p-1 rounded-lg border border-neutral-800/60">
                      {(['both', 'burmese', 'chinese'] as const).map(tab => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`flex-1 py-1 text-center rounded-md text-[11px] font-semibold capitalize transition-all cursor-pointer ${activeTab === tab ? 'bg-rose-800 text-white shadow' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >
                          {tab === 'both' ? 'Dual-Sub' : tab}
                        </button>
                      ))}
                    </div>

                    {/* Gemini AI Tone Adjustment Actions */}
                    <div className="p-3 bg-rose-950/10 border border-rose-900/20 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-rose-300 font-semibold flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-rose-400" /> Chinese Drama Tone Polish
                        </span>
                        <span className="text-[9px] uppercase font-mono tracking-widest bg-rose-900/20 px-1 py-0.5 rounded text-rose-400">
                          AI Edit
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                        <button
                          onClick={() => refineSubtitles('poetic')}
                          className="py-1 px-2 bg-neutral-950 hover:bg-rose-950/30 border border-neutral-800 hover:border-rose-900/40 text-neutral-300 rounded transition-colors cursor-pointer text-left"
                        >
                          📜 Ancient Poetic (Wuxia)
                        </button>
                        <button
                          onClick={() => refineSubtitles('dramatic')}
                          className="py-1 px-2 bg-neutral-950 hover:bg-rose-950/30 border border-neutral-800 hover:border-rose-900/40 text-neutral-300 rounded transition-colors cursor-pointer text-left"
                        >
                          🎭 High Dramatic Drama
                        </button>
                      </div>
                    </div>

                    {/* SRT/WebVTT Downloads block */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-neutral-500 font-semibold">Download SRT:</span>
                      <button
                        onClick={() => handleDownloadSRT('burmese')}
                        className="px-2 py-1 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 rounded text-[10px] text-neutral-300 transition-colors cursor-pointer"
                      >
                        Burmese SRT
                      </button>
                      <button
                        onClick={() => handleDownloadSRT('chinese')}
                        className="px-2 py-1 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 rounded text-[10px] text-neutral-300 transition-colors cursor-pointer"
                      >
                        Chinese SRT
                      </button>
                      <button
                        onClick={() => handleDownloadSRT('dual')}
                        className="px-2 py-1 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-900/40 rounded text-[10px] text-rose-300 font-semibold transition-colors cursor-pointer"
                      >
                        Dual SRT
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Subtitles Scrollable Stack List */}
              <div 
                ref={subtitleContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[calc(100vh-320px)] lg:max-h-[calc(100vh-140px)]"
              >
                {subtitles.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center text-center text-neutral-600 space-y-1">
                    <Video className="w-8 h-8 opacity-40 mb-2" />
                    <span className="text-xs">Dialogue deck is currently empty</span>
                    <span className="text-[10px] opacity-75">Upload video & run AI Auto Translation</span>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {subtitles.map((sub) => {
                      const isActive = activeSubtitle?.id === sub.id;
                      const isEditing = editingId === sub.id;

                      return (
                        <motion.div
                          key={sub.id}
                          layoutId={`sub-${sub.id}`}
                          className={`group rounded-xl p-3.5 border transition-all text-xs flex flex-col gap-2.5 ${isActive ? 'bg-gradient-to-r from-rose-950/20 to-neutral-900 border-rose-800/80 shadow-md shadow-rose-950/15' : 'bg-neutral-900/40 border-neutral-800/60 hover:border-neutral-700/80'}`}
                        >
                          {/* Timing Controls Header bar */}
                          <div className="flex items-center justify-between border-b border-neutral-800/50 pb-2">
                            <button
                              onClick={() => jumpToTime(sub.startTime)}
                              className="font-mono text-[10px] text-amber-400 hover:text-amber-300 hover:underline transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="w-3 h-3 fill-amber-400" />
                              {formatTime(sub.startTime)} - {formatTime(sub.endTime)}
                            </button>

                            <div className="flex items-center gap-2">
                              {/* Quick Adjustment buttons */}
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => updateSubtitleTime(sub.id, 'startTime', sub.startTime - 0.1)}
                                  className="w-4 h-4 bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-white rounded flex items-center justify-center text-[9px]"
                                  title="Shift start back 0.1s"
                                >
                                  -
                                </button>
                                <span className="text-[9px] text-neutral-500 font-mono">Start</span>
                                <button
                                  onClick={() => updateSubtitleTime(sub.id, 'startTime', sub.startTime + 0.1)}
                                  className="w-4 h-4 bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-white rounded flex items-center justify-center text-[9px]"
                                  title="Shift start forward 0.1s"
                                >
                                  +
                                </button>
                              </div>

                              <div className="w-px h-3 bg-neutral-800" />

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => updateSubtitleTime(sub.id, 'endTime', sub.endTime - 0.1)}
                                  className="w-4 h-4 bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-white rounded flex items-center justify-center text-[9px]"
                                  title="Shift end back 0.1s"
                                >
                                  -
                                </button>
                                <span className="text-[9px] text-neutral-500 font-mono">End</span>
                                <button
                                  onClick={() => updateSubtitleTime(sub.id, 'endTime', sub.endTime + 0.1)}
                                  className="w-4 h-4 bg-neutral-950 text-neutral-400 border border-neutral-800 hover:text-white rounded flex items-center justify-center text-[9px]"
                                  title="Shift end forward 0.1s"
                                >
                                  +
                                </button>
                              </div>

                              <button
                                onClick={() => deleteSubtitle(sub.id)}
                                className="text-neutral-500 hover:text-rose-500 p-0.5 rounded transition-colors cursor-pointer ml-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
                                title="Delete dialogue block"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Editable Text Area block */}
                          <div className="space-y-2">
                            {/* Chinese Text Field */}
                            {activeTab !== 'burmese' && (
                              <div className="space-y-1">
                                <span className="text-[9px] text-neutral-500 uppercase tracking-wider font-mono block">Original Chinese:</span>
                                <input
                                  type="text"
                                  value={sub.chinese}
                                  onChange={(e) => updateSubtitleField(sub.id, 'chinese', e.target.value)}
                                  className="w-full bg-neutral-950/80 border border-neutral-800 focus:border-rose-900 rounded px-2.5 py-1.5 text-neutral-200"
                                />
                              </div>
                            )}

                            {/* Burmese Text Field */}
                            {activeTab !== 'chinese' && (
                              <div className="space-y-1">
                                <span className="text-[9px] text-amber-500/80 uppercase tracking-wider font-mono block font-semibold flex items-center gap-1">
                                  <span>Burmese Translation:</span>
                                </span>
                                <textarea
                                  value={sub.burmese}
                                  rows={2}
                                  onChange={(e) => updateSubtitleField(sub.id, 'burmese', e.target.value)}
                                  className="w-full bg-neutral-950/80 border border-neutral-800 focus:border-rose-900 rounded px-2.5 py-1.5 text-amber-100 font-medium leading-relaxed resize-none"
                                />
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
            </div>

          </div>
        )}
      </main>

      {/* Cinematic Elegant Loading Block Cover */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-950/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6"
          >
            <div className="max-w-md w-full text-center space-y-6">
              {/* Spinner Visual effect */}
              <div className="relative w-24 h-24 mx-auto">
                <div className="absolute inset-0 border-4 border-rose-900/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-rose-600 border-r-rose-800 rounded-full animate-spin"></div>
                <div className="absolute inset-2 border border-dashed border-amber-500/20 rounded-full animate-pulse flex items-center justify-center">
                  <Languages className="w-6 h-6 text-amber-400" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-serif font-semibold text-white tracking-wide">
                  Gemini Chinese Drama AI active
                </h3>
                {/* Rolling Encouraging Messages */}
                <p className="text-xs text-rose-400/90 font-mono min-h-4">
                  {loadingStep}
                </p>
                <p className="text-[10px] text-neutral-500 leading-relaxed max-w-xs mx-auto">
                  Using high-precision neural models to isolate Mandarin speech segments, match dialogue timing, and adapt translations for professional drama release.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
