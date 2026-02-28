import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Terminal, Cpu, Activity, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import Markdown from 'react-markdown';
import { glados } from './services/gladosService';
import { cn } from './lib/utils';

interface Message {
  id: string;
  role: 'user' | 'glados';
  content: string;
  timestamp: number;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'initial',
      role: 'glados',
      content: "Hello. I am GLaDOS. I see you've found your way into the testing chamber. I'd congratulate you, but we both know you just stumbled in here looking for the bathroom. Shall we begin the testing?",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'SPEAKING'>('IDLE');
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const playAudio = async (base64: string) => {
    if (isMuted) return;
    
    try {
      // Initialize AudioContext on first interaction
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const context = audioContextRef.current;
      if (context.state === 'suspended') {
        await context.resume();
      }

      // Stop previous playback
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop();
      }

      // Decode base64 to ArrayBuffer
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Gemini TTS returns 16-bit PCM at 24kHz
      // Ensure the buffer length is even for Int16Array
      const buffer = bytes.buffer.slice(0, bytes.length - (bytes.length % 2));
      const pcmData = new Int16Array(buffer);
      const float32Data = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768.0;
      }

      const audioBuffer = context.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);
      
      sourceNodeRef.current = source;
      setStatus('SPEAKING');
      
      source.onended = () => {
        if (sourceNodeRef.current === source) {
          setStatus('IDLE');
        }
      };
      
      source.start();
    } catch (err) {
      console.error("Audio playback failed:", err);
      setStatus('IDLE');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setStatus('PROCESSING');

    const result = await glados.chat(input);
    
    const gladosMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'glados',
      content: result.text,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, gladosMessage]);
    setIsLoading(false);

    if (result.audioBase64) {
      playAudio(result.audioBase64);
    } else {
      setStatus('IDLE');
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col aperture-grid overflow-hidden">
      {/* CRT Scanline Overlay */}
      <div className="absolute inset-0 glados-scanline z-50 pointer-events-none opacity-20" />

      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-aperture-orange flex items-center justify-center shadow-[0_0_15px_rgba(242,125,38,0.5)]">
            <Cpu className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest uppercase text-aperture-orange">GLaDOS v3.11</h1>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-500/80 uppercase tracking-tighter">System Online - Testing in Progress</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-6 text-[10px] text-white/40 uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <Activity className="w-3 h-3" />
              <span>Neurotoxin: 0%</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3 h-3" />
              <span>Morality Core: Offline</span>
            </div>
          </div>
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-white/60 hover:text-white"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Terminal Area */}
      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full p-4 md:p-8 overflow-hidden">
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-6 pr-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "flex flex-col gap-2",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}
              >
                <div className={cn(
                  "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
                  msg.role === 'user' 
                    ? "bg-aperture-blue/10 border border-aperture-blue/30 text-aperture-blue" 
                    : "bg-white/5 border border-white/10 text-white/90"
                )}>
                  <div className="flex items-center gap-2 mb-2 opacity-50 text-[10px] uppercase tracking-widest font-bold">
                    {msg.role === 'user' ? 'Subject #4223' : 'GLaDOS'}
                  </div>
                  <div className="markdown-body prose prose-invert prose-sm max-w-none">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isLoading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 text-aperture-orange/50 text-xs animate-pulse"
            >
              <Terminal className="w-4 h-4" />
              <span>Calculating insults...</span>
            </motion.div>
          )}
        </div>

        {/* Status Bar */}
        <div className="mt-4 flex items-center justify-between px-2 py-1 border-t border-white/5 text-[9px] text-white/30 uppercase tracking-[0.2em]">
          <div className="flex gap-4">
            <span>Status: {status}</span>
            <span>Buffer: 1024KB</span>
          </div>
          <div className="flex gap-4">
            <span>Aperture Science Laboratories</span>
            <span>© 1998-2026</span>
          </div>
        </div>

        {/* Input Area */}
        <form 
          onSubmit={handleSubmit}
          className="mt-4 relative group"
        >
          <div className="absolute inset-0 bg-aperture-orange/5 blur-xl group-focus-within:bg-aperture-orange/10 transition-all duration-500 rounded-full" />
          <div className="relative flex items-center gap-2 bg-black/40 border border-white/10 focus-within:border-aperture-orange/50 rounded-2xl p-2 transition-all duration-300">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter your query, test subject..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-4 placeholder:text-white/20"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-3 rounded-xl bg-aperture-orange text-black hover:bg-aperture-orange/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_10px_rgba(242,125,38,0.3)]"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </main>

      {/* Decorative Elements */}
      <div className="fixed bottom-10 right-10 opacity-5 pointer-events-none select-none">
        <img 
          src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Aperture_Laboratories_logo.svg/1200px-Aperture_Laboratories_logo.svg.png" 
          alt="Aperture Logo" 
          className="w-64 invert"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}
