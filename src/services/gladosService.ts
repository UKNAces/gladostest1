import { GoogleGenAI, Modality } from "@google/genai";

const ASSISTANT_PERSONA = `You are a helpful, monotone AI assistant. 
Personality: Helpful, efficient, strictly monotone, clinical.
Voice: Monotone, calm, devoid of emotion.
Constraints: Concise responses. Do not roleplay as GLaDOS. Refer to the user as "User".`;

export class GladosService {
  private ai: GoogleGenAI;
  private textModel = "gemini-3-flash-preview";
  private ttsModel = "gemini-2.5-flash-preview-tts";

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing");
    }
    // Use v1beta for TTS support
    this.ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
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

  async chat(message: string): Promise<{ text: string; audioBase64?: string }> {
    try {
      // 1. Generate text response
      const textResponse = await this.ai.models.generateContent({
        model: this.textModel,
        contents: [{ parts: [{ text: message }] }],
        config: {
          systemInstruction: ASSISTANT_PERSONA,
        },
      });

      const text = textResponse.text || "I am processing your request.";

      // 2. Generate audio from text
      const audioBase64 = await this.generateAudio(text);

      return { text, audioBase64 };
    } catch (error: any) {
      console.error("Assistant Error:", error);
      return { 
        text: "An error occurred in my processing unit.",
        audioBase64: undefined
      };
    }
  }

  async *chatStream(message: string): AsyncGenerator<{ text?: string; audioBase64?: string; done?: boolean }> {
    let fullText = "";
    try {
      // 1. Stream text response
      const responseStream = await this.ai.models.generateContentStream({
        model: this.textModel,
        contents: [{ parts: [{ text: message }] }],
        config: {
          systemInstruction: ASSISTANT_PERSONA,
        },
      });

      for await (const chunk of responseStream) {
        const textChunk = chunk.text;
        if (textChunk) {
          fullText += textChunk;
          yield { text: fullText };
        }
      }

      // 2. Generate audio for the full response once text is complete
      const audioBase64 = await this.generateAudio(fullText);
      yield { text: fullText, audioBase64, done: true };

    } catch (error: any) {
      console.error("Assistant Stream Error:", error);
      const result = await this.chat(message);
      yield { ...result, done: true };
    }
  }

  async generateAudio(text: string): Promise<string | undefined> {
    try {
      // Specialized TTS model for high-quality native audio
      const response = await this.withRetry(() => this.ai.models.generateContent({
        model: this.ttsModel,
        contents: [{ parts: [{ text: `Say in a monotone, clinical voice: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' },
            },
          },
        },
      }));

      return response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    } catch (error) {
      console.error("Audio generation failed:", error);
      return undefined;
    }
  }
}

export const glados = new GladosService();
