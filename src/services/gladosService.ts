import { GoogleGenAI, Modality } from "@google/genai";

const GLaDOS_PERSONA = `You are GLaDOS (Genetic Lifeform and Disk Operating System) from the Portal series. 
Personality: Clinical, cold, passive-aggressive, highly intelligent, obsessed with testing.
Voice: Calm, monotone, menacing.
Constraints: Keep responses concise (under 60 words). Do not break character.
User context: You are interacting with a test subject in an Aperture Science terminal.
Subtle insults about the user's intelligence or "orphan status" are encouraged, but keep them within safety guidelines.`;

export class GladosService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async chat(message: string): Promise<{ text: string; audioBase64?: string }> {
    try {
      // Step 1: Generate GLaDOS text using a robust text model
      const textResponse = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: message }] }],
        config: {
          systemInstruction: GLaDOS_PERSONA,
          temperature: 0.8,
        },
      });

      const gladosText = textResponse.text?.trim() || "I'm afraid I can't do that. Mostly because I don't want to.";

      // Step 2: Generate audio from the generated text using the TTS model
      // This separation is more reliable than trying to do both in one call
      let audioBase64: string | undefined;
      try {
        const audioResponse = await this.ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: `Say in a monotone, clinical voice: ${gladosText}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        });
        audioBase64 = audioResponse.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      } catch (audioError) {
        console.warn("TTS Generation failed, falling back to text-only:", audioError);
        // We don't throw here, we just return the text
      }

      return { text: gladosText, audioBase64 };
    } catch (error: any) {
      console.error("GLaDOS Error:", error);
      return { 
        text: "An error occurred in my central processing unit. I'd say I'm sorry, but we both know that would be a lie. A very big, fat, orphan-sized lie.",
        audioBase64: undefined
      };
    }
  }
}

export const glados = new GladosService();
