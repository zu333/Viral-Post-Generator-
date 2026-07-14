import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parsing middleware
  app.use(express.json());

  // API route for generation (used when API_KEY is placeholder inside index.html)
  app.post("/api/generate", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required in the request body." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: "Gemini API key is not configured on the server. Please add your key in Settings > Secrets." 
        });
      }

      // Initialize the official Google Gen AI SDK
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      let text = "";

      // Helper function to call generateContent with a specific model
      const generateWithModel = async (modelName: string) => {
        console.log(`Attempting generation with model: ${modelName}...`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });
        return response.text;
      };

      // Helper function to wrap a promise with a timeout
      const withTimeout = (promise: Promise<any>, ms: number) => {
        return Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
        ]);
      };

      try {
        // Try gemini-3.5-flash first with a 9-second timeout
        text = await withTimeout(generateWithModel("gemini-3.5-flash"), 9000);
        console.log("Successfully generated post using gemini-3.5-flash.");
      } catch (err: any) {
        console.warn(`gemini-3.5-flash failed or timed out (${err.message}). Falling back to gemini-3.1-flash-lite...`);
        // Fallback to gemini-3.1-flash-lite
        text = await generateWithModel("gemini-3.1-flash-lite");
        console.log("Successfully generated post using fallback model gemini-3.1-flash-lite.");
      }

      if (!text) {
        throw new Error("The Gemini model returned an empty response. Please try again.");
      }

      res.json({ text });
    } catch (error: any) {
      console.error("Server API Generation Error:", error);
      res.status(500).json({ error: error.message || "An unexpected error occurred during post generation." });
    }
  });

  // Vite middleware for development or fallback static file serving in production
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running successfully on port ${PORT}`);
  });
}

startServer();
