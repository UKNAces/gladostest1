import { GoogleGenAI, Modality } from "@google/genai";

const GLaDOS_PERSONA = `You are GLaDOS from Portal. 
Personality: Clinical, cold, passive-aggressive, intelligent.
Voice: Calm, monotone, menacing, autotuned.
Constraints: Concise responses (under 50 words). Do not break character.
Subtle insults encouraged. Speak quickly. Refer to user as "User".`;

export class GladosService {
  private ai: GoogleGenAI;
  private textModels = ["gemini-3-flash-preview", "gemini-2.5-flash"];
  private currentTextModelIndex = 0;
  private lastModelCheck = 0;
  private CHECK_INTERVAL = 60000; // Check best model every 1 minute

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  private async withRetry<T>(fn: () => Promise<T>, retries = 1, delay = 500): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const isQuotaError = error.status === "RESOURCE_EXHAUSTED" || error.code === 429 || error.message?.includes("quota");
      if (retries > 0 && isQuotaError) {
        console.warn(`Quota exceeded. Retrying in ${delay}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(fn, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  private async generateTextWithFallback(message: string): Promise<string> {
    // Periodically try to switch back to the best model
    if (this.currentTextModelIndex > 0 && Date.now() - this.lastModelCheck > this.CHECK_INTERVAL) {
      this.currentTextModelIndex = 0;
    }

    for (let i = this.currentTextModelIndex; i < this.textModels.length; i++) {
      const model = this.textModels[i];
      try {
        // Use generateContent with a tight config for speed
        const response = await this.ai.models.generateContent({
          model: model,
          contents: [{ parts: [{ text: message }] }],
          config: {
            systemInstruction: GLaDOS_PERSONA,
            temperature: 0.7,
            topP: 0.8,
            topK: 40,
          },
        });

        const text = response.text?.trim();
        if (text) {
          this.currentTextModelIndex = i;
          this.lastModelCheck = Date.now();
          return text;
        }
      } catch (error: any) {
        const isQuotaError = error.status === "RESOURCE_EXHAUSTED" || error.code === 429 || error.message?.includes("quota");
        if (isQuotaError && i < this.textModels.length - 1) {
          this.currentTextModelIndex = i + 1;
          continue;
        }
        // If not a quota error, we still try the next model just in case it's a model-specific issue
        if (i < this.textModels.length - 1) {
          this.currentTextModelIndex = i + 1;
          continue;
        }
        throw error;
      }
    }
    return "I'm afraid I can't do that. Mostly because I don't want to.";
  }

  async *chatStream(message: string): AsyncGenerator<{ text?: string; audioBase64?: string; done?: boolean }> {
    let fullText = "";
    try {
      // Step 1: Stream GLaDOS text
      const model = this.textModels[this.currentTextModelIndex];
      const responseStream = await this.ai.models.generateContentStream({
        model: model,
        contents: [{ parts: [{ text: message }] }],
        config: {
          systemInstruction: GLaDOS_PERSONA,
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
        },
      });

      for await (const chunk of responseStream) {
        const textChunk = chunk.text;
        if (textChunk) {
          fullText += textChunk;
          yield { text: fullText };
        }
      }

      // Step 2: Generate audio once text is complete
      let audioBase64: string | undefined;
      try {
        audioBase64 = await this.generateAudio(fullText);
      } catch (audioError) {
        console.warn("TTS Generation failed:", audioError);
      }

      yield { text: fullText, audioBase64, done: true };
    } catch (error: any) {
      console.error("GLaDOS Stream Error:", error);
      // Fallback to non-streaming if quota hit or other error
      const result = await this.chat(message);
      yield { ...result, done: true };
    }
  }

  async chat(message: string): Promise<{ text: string; audioBase64?: string }> {
    try {
      // Step 1: Generate GLaDOS text with model degradation
      const gladosText = await this.generateTextWithFallback(message);

      // Step 2: Generate audio from the generated text using the TTS model
      let audioBase64: string | undefined;
      try {
        audioBase64 = await this.generateAudio(gladosText);
      } catch (audioError) {
        console.warn("TTS Generation failed after retries, falling back to text-only:", audioError);
      }

      return { text: gladosText, audioBase64 };
    } catch (error: any) {
      console.error("GLaDOS Error:", error);
      let errorText = "An error occurred in my central processing unit. I'd say I'm sorry, but we both know that would be a lie. A very big, fat, orphan-sized lie.";
      
      const isQuotaError = error.status === "RESOURCE_EXHAUSTED" || error.code === 429 || error.message?.includes("quota");
      if (isQuotaError) {
        errorText = "Facility-wide resource allocation has been prioritized for more important matters than your incessant chatter. All available processing units are currently occupied.";
      }

      return { 
        text: errorText,
        audioBase64: undefined
      };
    }
  }

  async generateAudio(text: string): Promise<string | undefined> {
    try {
      const audioResponse = await this.withRetry(() => this.ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say in a monotone, clinical voice with a distinct autotuned melodic quality. Speak very quickly and efficiently: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      }));
      return audioResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    } catch (error) {
      console.error("TTS Generation failed:", error);
      return undefined;
    }
  }
}

export const glados = new GladosService();
