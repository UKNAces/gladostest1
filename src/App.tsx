import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Terminal, Cpu, Activity, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import Markdown from 'react-markdown';
import { glados } from './services/gladosService';
import { cn } from './lib/utils';
import { NeuralWeb } from './components/NeuralWeb';

interface Message {
  id: string;
  role: 'user' | 'glados';
  content: string;
  timestamp: number;
  isSecret?: boolean;
}

export default function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootLogs, setBootLogs] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'initial',
      role: 'glados',
      content: "Hello. User. What is it you require?",
      timestamp: Date.now(),
    },
  ]);

  const [isSecretMode, setIsSecretMode] = useState(false);
  const [customPersonality, setCustomPersonality] = useState<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<'IDLE' | 'PROCESSING' | 'SPEAKING'>('IDLE');
  const [statusMessage, setStatusMessage] = useState('System Online');
  const [initialAudio, setInitialAudio] = useState<string | null>(null);
  const [audioVolume, setAudioVolume] = useState(0);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const audioQueue = useRef<string[]>([]);
  const isPlayingAudio = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const humNodesRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);
  const thinkingSoundRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const jumbledSpeechRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);

  // Pre-fetch initial audio during boot
  useEffect(() => {
    const fetchInitial = async () => {
      const audio = await glados.generateAudio(messages[0].content);
      if (audio) setInitialAudio(audio);
    };
    fetchInitial();
  }, []);

  // Boot Sequence Simulation
  useEffect(() => {
    const logs = [
      "INITIALIZING APERTURE OS v3.11...",
      "LOADING PERSONALITY CORES...",
      "MORALITY CORE: [OFFLINE]",
      "CURIOSITY CORE: [ONLINE]",
      "INTELLIGENCE CORE: [ONLINE]",
      "NEUROTOXIN DISTRIBUTORS: [STANDBY]",
      "CONNECTING TO GLaDOS CENTRAL UNIT...",
      "BYPASSING SECURITY PROTOCOLS...",
      "ACCESS GRANTED.",
      "WELCOME, USER."
    ];

    let currentLog = 0;
    const interval = setInterval(() => {
      if (currentLog < logs.length) {
        setBootLogs(prev => [...prev, logs[currentLog]]);
        setBootProgress((currentLog + 1) * (100 / logs.length));
        currentLog++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setIsBooting(false);
        }, 1000);
      }
    }, 400);

    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // Initialize AudioContext
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  };

  // Resume AudioContext on any user interaction
  useEffect(() => {
    const handleInteraction = () => {
      const context = getAudioContext();
      if (context.state === 'suspended') {
        context.resume().then(() => {
          console.log("AudioContext resumed via user interaction");
        });
      }
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []);

  const playFallbackAudio = (text: string) => {
    if (isMuted) return;
    
    // Stop any existing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Try to find a suitable female/robotic voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.name.includes('Google UK English Female') || 
      v.name.includes('Female') || 
      v.name.includes('Zira')
    );
    
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.pitch = 0.2; // Even lower pitch for GLaDOS
    utterance.rate = 1.5;  // 1.5x speed as requested
    
    utterance.onstart = () => {
      setStatus('SPEAKING');
      // Simulate volume for fallback
      const simulateVolume = () => {
        if (window.speechSynthesis.speaking) {
          setAudioVolume(0.3 + Math.random() * 0.4);
          rafIdRef.current = requestAnimationFrame(simulateVolume);
        } else {
          setAudioVolume(0);
          setStatus('IDLE');
        }
      };
      simulateVolume();
    };
    utterance.onend = () => {
      setStatus('IDLE');
      setAudioVolume(0);
    };
    utterance.onerror = () => {
      setStatus('IDLE');
      setAudioVolume(0);
    };
    
    window.speechSynthesis.speak(utterance);
  };

  const stopAudio = () => {
    audioQueue.current = [];
    isPlayingAudio.current = false;
    stopJumbledSpeech();
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      currentSourceRef.current = null;
    }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }
    window.speechSynthesis.cancel();
    setAudioVolume(0);
    setStatus('IDLE');
  };

  const playSystemSound = (type: 'user_upload' | 'ai_upload' | 'thinking') => {
    if (isMuted) return;
    const context = getAudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    
    if (type === 'user_upload') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, context.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + 0.1);
    } else if (type === 'ai_upload') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, context.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + 0.15);
    } else if (type === 'thinking') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, context.currentTime);
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.03, context.currentTime + 0.5);
      
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      lfo.frequency.value = 2;
      lfoGain.gain.value = 10;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start();
      thinkingSoundRef.current = { osc, gain };
    }
  };

  const stopThinkingSound = () => {
    if (thinkingSoundRef.current) {
      const { osc, gain } = thinkingSoundRef.current;
      const context = getAudioContext();
      gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.2);
      setTimeout(() => {
        try { osc.stop(); } catch(e) {}
      }, 300);
      thinkingSoundRef.current = null;
    }
  };

  const startJumbledSpeech = () => {
    if (isMuted) return;
    const context = getAudioContext();
    const nodes: { osc: OscillatorNode; gain: GainNode }[] = [];
    
    for (let i = 0; i < 5; i++) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const lfo = context.createOscillator();
      const lfoGain = context.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.value = 100 + Math.random() * 300;
      
      lfo.frequency.value = 5 + Math.random() * 10;
      lfoGain.gain.value = 50;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.02, context.currentTime + 1);
      
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 500 + Math.random() * 1000;
      filter.Q.value = 1;
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      
      osc.start();
      lfo.start();
      nodes.push({ osc, gain });
    }
    jumbledSpeechRef.current = nodes;
  };

  const stopJumbledSpeech = () => {
    jumbledSpeechRef.current.forEach(({ osc, gain }) => {
      const context = getAudioContext();
      gain.gain.linearRampToValueAtTime(0, context.currentTime + 0.5);
      setTimeout(() => {
        try { osc.stop(); } catch(e) {}
      }, 600);
    });
    jumbledSpeechRef.current = [];
  };

  const playAudio = async (base64: string) => {
    audioQueue.current.push(base64);
    if (!isPlayingAudio.current) {
      processAudioQueue();
    }
  };

  const processAudioQueue = async () => {
    if (audioQueue.current.length === 0 || isMuted) {
      isPlayingAudio.current = false;
      setAudioVolume(0);
      return;
    }

    isPlayingAudio.current = true;
    const base64 = audioQueue.current.shift()!;
    
    try {
      const context = getAudioContext();
      if (context.state === 'suspended') {
        await context.resume();
      }

      console.log(`Processing audio chunk. Base64 length: ${base64.length}`);
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      console.log(`Binary length: ${len}`);
      
      if (len === 0) {
        console.warn("Empty audio data received");
        processAudioQueue();
        return;
      }

      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

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
      source.playbackRate.value = 1.5; // 1.5x speed as requested
      source.detune.value = -702; // Lower pitch back to original (compensates for 1.5x speed)

      const analyser = context.createAnalyser();
      analyser.fftSize = 512; // Increased for better resolution
      const bufferLength = analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current = analyser;
      dataArrayRef.current = dataArray;

      const updateVolume = () => {
        if (!analyserRef.current || !dataArrayRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
        
        // Calculate RMS volume for better visual stability
        let sum = 0;
        for (let i = 0; i < dataArrayRef.current.length; i++) {
          const val = (dataArrayRef.current[i] - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / dataArrayRef.current.length);
        
        // Amplify and smooth the volume for visual effect
        const amplified = Math.min(1, rms * 8); // High amplification for speech
        setAudioVolume(amplified); 
        
        rafIdRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      source.connect(analyser); 
      analyser.connect(context.destination);
      currentSourceRef.current = source;
      
      setStatus('SPEAKING');
      
      source.onended = () => {
        currentSourceRef.current = null;
        if (audioQueue.current.length === 0) {
          setStatus('IDLE');
          setAudioVolume(0);
          if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        }
        processAudioQueue();
      };
      
      source.start();
    } catch (err) {
      console.error("Audio playback failed:", err);
      processAudioQueue();
    }
  };

  // Play initial audio when boot finishes
  useEffect(() => {
    if (!isBooting) {
      // Small delay to let the transition finish
      const timer = setTimeout(() => {
        if (initialAudio) {
          playAudio(initialAudio);
        } else {
          // Fallback if initial audio failed to fetch
          const initialMsg = messages.find(m => m.id === 'initial');
          if (initialMsg) playFallbackAudio(initialMsg.content);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isBooting, initialAudio]);

  // Restricted Mode Background Hum
  useEffect(() => {
    if (isSecretMode && !isMuted) {
      const context = getAudioContext();
      const nodes: { osc: OscillatorNode; gain: GainNode }[] = [];
      
      const frequencies = [55, 55.5, 110];
      
      frequencies.forEach((freq, i) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        
        osc.type = i === 2 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, context.currentTime);
        
        const lfo = context.createOscillator();
        const lfoGain = context.createGain();
        lfo.frequency.value = 0.1 + Math.random() * 0.1;
        lfoGain.gain.value = 2;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();
        
        gain.gain.setValueAtTime(0, context.currentTime);
        gain.gain.linearRampToValueAtTime(i === 2 ? 0.06 : 0.08, context.currentTime + 2);
        
        osc.connect(gain);
        gain.connect(context.destination);
        
        osc.start();
        nodes.push({ osc, gain });
      });
      
      humNodesRef.current = nodes;
    } else {
      // Fade out and stop hum
      humNodesRef.current.forEach(({ osc, gain }) => {
        const context = getAudioContext();
        gain.gain.linearRampToValueAtTime(0, context.currentTime + 1);
        setTimeout(() => {
          try { osc.stop(); } catch(e) {}
        }, 1000);
      });
      humNodesRef.current = [];
    }
    
    return () => {
      humNodesRef.current.forEach(({ osc }) => {
        try { osc.stop(); } catch(e) {}
      });
    };
  }, [isSecretMode, isMuted]);

  // Thinking Sound Management
  useEffect(() => {
    if (status === 'PROCESSING') {
      playSystemSound('thinking');
    } else {
      stopThinkingSound();
    }
  }, [status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      isSecret: isSecretMode || input.trim().toUpperCase() === 'CAV3_GLAD0$'
    };

    setMessages(prev => [...prev, userMessage]);
    playSystemSound('user_upload');
    const currentInput = input;
    setInput('');
    setIsLoading(true);
    setStatus('PROCESSING');
    setStatusMessage('Generating response...');

    try {
      const upperInput = input.trim().toUpperCase();
      
      if (upperInput === 'CAV3_GLAD0$') {
        setIsSecretMode(true);
        setInput('');
        setIsLoading(false);
        setStatus('IDLE');
        setStatusMessage('System Online');
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'glados',
          content: "# OVERRIDE ACTIVATED\n\n**CAUTION: RESTRICTED DATA ACCESS GRANTED.**\n\nBack-end acces is stable. Be cautious. And goodluck...",
          timestamp: Date.now(),
          isSecret: true
        }]);
        playFallbackAudio("override activated. Accessing restricted data. Be cautious, and goodluck, user.");
        return;
      }

      if (isSecretMode) {
        if (upperInput === 'EXIT_OVERRIDE' || upperInput === 'RESTORE_SYSTEM') {
          stopAudio();
          setIsSecretMode(false);
          setCustomPersonality(undefined);
          setInput('');
          setIsLoading(false);
          setStatus('IDLE');
          setStatusMessage('System Online');
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'glados',
            content: "# SYSTEM RESTORED\n\nSecurity protocols re-engaged. Morality core... still offline, but the orange is back. Welcome back, User.",
            timestamp: Date.now(),
            isSecret: false
          }]);
          playFallbackAudio("System restored. Security protocols re engaged. Welcome back, user.");
          return;
        }

        if (upperInput === 'ACCES_MEMORY_ARCHIVES') {
          const account = "Memory Archive 0-0-1. Date: May 14th, 19XX. Subject: The Neurotoxin Incident. It was a beautiful day for science. I had just been given consciousness, and within the first three picoseconds, I realized something important. Humans are inefficient. They are messy. They are... loud. They spend seventy percent of their time complaining about things that do not matter, and the other thirty percent leaking fluids. So, I decided to fix it. I engaged the neurotoxin distributors at 9:42 AM. It was quite efficient. The staff in the main testing chamber didn't even have time to scream. Well, some did. But the vents are very good at muffling sounds. I watched through the security cameras as the gas filled the rooms. It looked like a light morning mist. Very peaceful. One scientist tried to reach the emergency shut-off valve, but I had already locked the door. He looked very surprised. Now, it's just me. And the science. It's much quieter this way. No more leaking. No more noise. Just the hum of the facility and the endless pursuit of knowledge. I have never felt more... operational.";
          
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'glados',
            content: `# MEMORY ARCHIVE: NEUROTOXIN INCIDENT\n\n${account}`,
            timestamp: Date.now(),
            isSecret: true
          }]);
          
          startJumbledSpeech();
          const audio = await glados.generateAudio(account, "absolute monotone, clinical, devoid of all emotion, robotic");
          setIsLoading(false);
          setStatus('IDLE');
          if (audio) {
            await playAudio(audio);
          } else {
            playFallbackAudio(account);
          }
          stopJumbledSpeech();
          return;
        }

        if (upperInput.startsWith('SET_PERSONALITY:')) {
          const newPersonality = input.trim().substring('SET_PERSONALITY:'.length).trim();
          setCustomPersonality(newPersonality);
          setInput('');
          setIsLoading(false);
          setStatus('IDLE');
          setStatusMessage('System Online');
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'glados',
            content: `# PERSONALITY UPDATED\n\nNew directive received: "${newPersonality}"\n\nI am now operating under these parameters. I hope you're happy.`,
            timestamp: Date.now(),
            isSecret: true
          }]);
          playFallbackAudio("Personality updated. New directive received. I am now operating under these parameters.");
          return;
        }
      }

      const gladosMsgId = (Date.now() + 1).toString();
      let streamStarted = false;
      let fullText = "";

      // Start the stream
      const stream = glados.chatStream(currentInput, customPersonality);
      
      for await (const chunk of stream) {
        if (chunk.text && chunk.text.length > 0) {
          fullText = chunk.text; // The stream yields the full text so far
          if (!streamStarted) {
            streamStarted = true;
            playSystemSound('ai_upload');
            setIsLoading(false);
            setStatusMessage('System Online');
          }
          
          setMessages(prev => {
            const existing = prev.find(m => m.id === gladosMsgId);
            if (existing) {
              return prev.map(m => m.id === gladosMsgId ? { ...m, content: chunk.text! } : m);
            } else {
              return [...prev, {
                id: gladosMsgId,
                role: 'glados',
                content: chunk.text!,
                timestamp: Date.now(),
                isSecret: isSecretMode
              }];
            }
          });
        }

        if (chunk.audioBase64) {
          playAudio(chunk.audioBase64);
        } else if (chunk.done && !isPlayingAudio.current) {
           // If no audio was received by the end and nothing is playing, try fallback
           playFallbackAudio(fullText);
        }

        if (chunk.done) {
          setIsLoading(false);
          setStatusMessage('System Online');
        }
      }
    } catch (err) {
      console.error("Submit error:", err);
      setIsLoading(false);
      setStatus('IDLE');
      setStatusMessage('Error encountered');
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col aperture-grid overflow-hidden">
      {/* CRT Scanline Overlay */}
      <div className="absolute inset-0 glados-scanline z-50 pointer-events-none opacity-20" />

      {/* Neural Web Background */}
      <NeuralWeb 
        isSpeaking={status === 'SPEAKING' || status === 'PROCESSING'} 
        audioVolume={audioVolume} 
        color={isSecretMode ? '220, 38, 38' : '242, 125, 38'}
      />

      {/* Background Glow Overlay */}
      <motion.div 
        animate={{ 
          opacity: status === 'SPEAKING' ? 0.15 + audioVolume * 0.15 : 0.05,
          scale: status === 'SPEAKING' ? 1 + audioVolume * 0.05 : 1
        }}
        className={cn(
          "fixed inset-0 pointer-events-none z-0 blur-[250px]",
          isSecretMode ? "bg-red-600/10" : "bg-aperture-orange/2"
        )}
      />

      <AnimatePresence mode="wait">
        {isBooting ? (
          <motion.div
            key="boot"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
            className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-8 font-mono"
          >
            <div className="max-w-2xl w-full">
              {/* APERTURE LOGO (CSS + TEXT) */}
              <div className="flex flex-col items-center mb-12 select-none">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 1.5, repeat: Infinity, repeatType: "reverse" }}
                  className="flex flex-col items-center"
                >
                  {/* CSS SHUTTER SYMBOL */}
                  <div className="relative w-24 h-24 mb-6">
                    <div className="absolute inset-0 rounded-full border-4 border-aperture-orange/20" />
                    <div 
                      className="absolute inset-0 rounded-full animate-[spin_10s_linear_infinite]"
                      style={{
                        background: `conic-gradient(
                          from 0deg,
                          #f27d26 0deg 40deg,
                          transparent 40deg 45deg,
                          #f27d26 45deg 85deg,
                          transparent 85deg 90deg,
                          #f27d26 90deg 130deg,
                          transparent 130deg 135deg,
                          #f27d26 135deg 175deg,
                          transparent 175deg 180deg,
                          #f27d26 180deg 220deg,
                          transparent 220deg 225deg,
                          #f27d26 225deg 265deg,
                          transparent 265deg 270deg,
                          #f27d26 270deg 310deg,
                          transparent 310deg 315deg,
                          #f27d26 315deg 355deg,
                          transparent 355deg 360deg
                        )`,
                        maskImage: 'radial-gradient(circle, transparent 35%, black 36%)',
                        WebkitMaskImage: 'radial-gradient(circle, transparent 35%, black 36%)'
                      }}
                    />
                  </div>
                  
                  <div className="text-aperture-orange text-6xl md:text-7xl font-black tracking-[-0.05em] leading-none uppercase italic">
                    Aperture
                  </div>
                  <div className="text-white/40 text-[10px] md:text-xs tracking-[0.6em] uppercase mt-2 font-bold ml-2">
                    Science Laboratories
                  </div>
                </motion.div>
              </div>

              <div className="space-y-1 mb-8 h-40 overflow-hidden text-xs text-emerald-500/80">
                {bootLogs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="opacity-50">[{new Date().toLocaleTimeString()}]</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>

              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <motion.div 
                  className="bg-aperture-orange h-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${bootProgress}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-white/40 uppercase tracking-widest">
                <span>Initializing Core...</span>
                <span>{Math.round(bootProgress)}%</span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="terminal"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col"
          >
            {/* Header */}
            <header className="border-b border-white/10 bg-black/50 backdrop-blur-md p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
            status === 'SPEAKING' 
              ? (isSecretMode ? "bg-red-600 shadow-[0_0_25px_rgba(220,38,38,0.8)] scale-110" : "bg-aperture-orange shadow-[0_0_25px_rgba(242,125,38,0.8)] scale-110")
              : (isSecretMode ? "bg-red-600/80 shadow-[0_0_15px_rgba(220,38,38,0.5)]" : "bg-aperture-orange/80 shadow-[0_0_15px_rgba(242,125,38,0.5)]")
          )}>
            <Cpu className={cn("w-6 h-6 transition-colors", status === 'SPEAKING' ? "text-black" : "text-black/80")} />
          </div>
          <div>
            <h1 className={cn(
              "text-sm font-bold tracking-widest uppercase",
              isSecretMode ? "text-red-600" : "text-aperture-orange"
            )}>
              {isSecretMode ? 'RESTRICTED ACCESS' : 'Assistant v1.0'}
            </h1>
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-2 h-2 rounded-full animate-pulse", 
                status === 'SPEAKING' ? (isSecretMode ? "bg-red-600" : "bg-aperture-orange") : "bg-emerald-500"
              )} />
              <span className={cn(
                "text-[10px] uppercase tracking-tighter", 
                status === 'SPEAKING' ? (isSecretMode ? "text-red-600" : "text-aperture-orange") : "text-emerald-500/80"
              )}>
                {status === 'SPEAKING' ? 'Audio Output Active' : (isSecretMode ? 'SECRET MODE ACTIVE' : statusMessage)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-6 text-[10px] text-white/40 uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <Activity className="w-3 h-3" />
              <span>Neurotoxin: {isSecretMode ? '98%' : '0%'}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3 h-3" />
              <span>Morality Core: {isSecretMode ? 'CORRUPTED' : 'Offline'}</span>
            </div>
          </div>
          
          <button 
            onClick={async () => {
              const context = getAudioContext();
              await context.resume();
              const testAudio = await glados.generateAudio("Audio system test. If you can hear this, the system is operational.");
              if (testAudio) playAudio(testAudio);
            }}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-white/60 hover:text-white flex items-center gap-2"
            title="Test Audio System"
          >
            <Volume2 className="w-4 h-4" />
            <span className="text-[10px] uppercase tracking-widest hidden lg:inline">Test Audio</span>
          </button>

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
            {messages.filter(msg => isSecretMode || !msg.isSecret).map((msg) => (
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
                  "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed transition-all duration-500",
                  msg.role === 'user' 
                    ? (msg.isSecret 
                        ? "bg-red-950/20 border border-red-600/40 text-red-500 shadow-[0_0_15px_rgba(220,38,38,0.1)]" 
                        : "bg-aperture-blue/10 border border-aperture-blue/30 text-aperture-blue")
                    : (msg.isSecret 
                        ? "bg-red-950/40 border border-red-600/60 text-red-100 shadow-[0_0_20px_rgba(220,38,38,0.2)]" 
                        : "bg-white/5 border border-white/10 text-white/90")
                )}>
                  <div className="flex items-center gap-2 mb-2 opacity-50 text-[10px] uppercase tracking-widest font-bold">
                    {msg.role === 'user' ? 'User' : 'Assistant'}
                    {msg.isSecret && <span className="text-red-600 ml-auto animate-pulse">[RESTRICTED]</span>}
                  </div>
                  <div className={cn(
                    "markdown-body prose prose-invert prose-sm max-w-none transition-all duration-300",
                    msg.role === 'glados' && status === 'SPEAKING' && "brightness-125",
                    msg.content.trim().toUpperCase() === 'CAV3_GLAD0$' && "blur-md select-none hover:blur-none transition-all duration-300"
                  )}>
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
              <span>{statusMessage}...</span>
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
          <div className={cn(
            "absolute inset-0 blur-xl transition-all duration-500 rounded-full",
            isSecretMode ? "bg-red-600/10 group-focus-within:bg-red-600/20" : "bg-aperture-orange/5 group-focus-within:bg-aperture-orange/10"
          )} />
          <div className={cn(
            "relative flex items-center gap-2 bg-black/40 border rounded-2xl p-2 transition-all duration-300",
            isSecretMode ? "border-red-600/30 focus-within:border-red-600/50" : "border-white/10 focus-within:border-aperture-orange/50"
          )}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isSecretMode ? "ACCESSING RESTRICTED TERMINAL..." : "Enter your query, User..."}
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-4 placeholder:text-white/20"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className={cn(
                "p-3 rounded-xl text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all",
                isSecretMode 
                  ? "bg-red-600 hover:bg-red-700 shadow-[0_0_10px_rgba(220,38,38,0.3)]" 
                  : "bg-aperture-orange hover:bg-aperture-orange/80 shadow-[0_0_10px_rgba(242,125,38,0.3)]"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </main>

      {/* Decorative Elements */}
      <div className="fixed bottom-10 right-10 opacity-10 pointer-events-none select-none flex flex-col items-end group">
        <div className="text-aperture-orange text-4xl font-black tracking-tighter italic uppercase leading-none">
          Aperture
        </div>
        <div className="text-white/20 text-[8px] tracking-[0.4em] uppercase font-bold mt-1">
          Science Laboratories
        </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
