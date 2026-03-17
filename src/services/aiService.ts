import { GoogleGenAI, Type } from "@google/genai";
import { ProjectItem, ItemType } from "../types";
import { STEEL_PROFILES } from "../constants";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

// Set worker for pdfjs using the local worker file bundled by Vite
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Converts a PDF to images (all pages) for Gemini Vision
 */
async function pdfToImages(base64: string): Promise<string[]> {
  try {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }

    const loadingTask = pdfjs.getDocument({ 
      data: array,
      useSystemFonts: true,
      disableFontFace: false,
    });
    
    const pdf = await loadingTask.promise;
    const images: string[] = [];
    
    // Process all pages (limit to 10 for safety)
    const numPages = Math.min(pdf.numPages, 10);
    
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      
      if (!context) continue;

      canvas.height = viewport.height;
      canvas.width = viewport.width;
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ 
        canvasContext: context, 
        viewport,
        canvas: canvas as any
      }).promise;
      
      images.push(canvas.toDataURL("image/jpeg", 0.8));
    }
    
    return images;
  } catch (error: any) {
    console.error("PDF to Image conversion failed:", error);
    throw new Error("Échec du traitement du fichier PDF. Le fichier est peut-être corrompu.");
  }
}

export async function parseSteelList(fileData: string, mimeType: string): Promise<ProjectItem[]> {
  console.log(`Starting parseSteelList with Gemini`);
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API Key missing.");

  const ai = new GoogleGenAI({ apiKey });
  let images: string[] = [];

  if (mimeType === "application/pdf") {
    const base64 = fileData.split(",")[1];
    images = await pdfToImages(base64);
  } else {
    images = [fileData];
  }

  const prompt = `
    You are an expert in structural steel engineering. Extract all steel elements from this document.
    
    IGNORE:
    - Elements marked as "ROND" or "PD" or "ROND A BETON".
    - Bolts, nuts, or non-steel items.

    Profiles to look for: ${STEEL_PROFILES.map(p => p.name).join(", ")}.
    
    EXTRACTION RULES:
    1. For PROFILES (IPE, HEA, HEB, UPN, L, etc.):
       - Extract Length in meters (m).
       - Extract Quantity.
    
    2. For PLATES (Plats, Tôles, Platines):
       - Look for designations like "PL 10x200" or "PL10x200".
       - The FIRST number (e.g., 10) is Thickness (mm).
       - The SECOND number (e.g., 200) is Width (mm). Convert to meters (e.g., 0.2).
       - The Length is usually in a separate column. Convert to meters (m).
       - Extract Quantity.

    Return a JSON object with an "items" array.
  `;

  const allParsedItems: ProjectItem[] = [];

  for (const image of images) {
    const base64Data = image.split(",")[1];
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data,
                },
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    itemType: { type: Type.STRING, enum: ["PROFILE", "PLATE"] },
                    mark: { type: Type.STRING },
                    label: { type: Type.STRING },
                    profileName: { type: Type.STRING },
                    length: { type: Type.NUMBER },
                    width: { type: Type.NUMBER },
                    thickness: { type: Type.NUMBER },
                    quantity: { type: Type.NUMBER },
                  },
                  required: ["itemType", "quantity"],
                },
              },
            },
          },
        },
      });

      const content = response.text || "{}";
      const json = JSON.parse(content);
      const items = json.items || [];
      
      items.forEach((item: any) => {
        const isPlate = item.itemType === "PLATE" || (!item.profileName && (item.width || item.thickness));
        let quantity = Math.abs(Number(item.quantity)) || 1;
        let length = Math.abs(Number(item.length)) || 0;
        let profileName = String(item.profileName || "").trim();

        if (isPlate) {
          allParsedItems.push({
            id: Math.random().toString(36).substr(2, 9),
            type: ItemType.PLATE,
            length: length,
            width: Number(item.width) || 0,
            thickness: Number(item.thickness) || 0,
            quantity: quantity,
            label: item.label || "Platine",
            mark: item.mark || "",
            isAiParsed: true,
          });
        } else {
          const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, "");
          const profile = STEEL_PROFILES.find(p => normalize(p.name) === normalize(profileName));

          if (profile) {
            allParsedItems.push({
              id: Math.random().toString(36).substr(2, 9),
              type: ItemType.PROFILE,
              profileId: profile.id,
              length: length,
              quantity: quantity,
              label: item.label || "Profilé",
              mark: item.mark || "",
              isAiParsed: true,
            });
          } else {
            allParsedItems.push({
              id: Math.random().toString(36).substr(2, 9),
              type: ItemType.PROFILE,
              customProfileName: profileName || "Profilé Inconnu",
              customLinearMass: 0,
              length: length,
              quantity: quantity,
              label: item.label || "Profilé",
              mark: item.mark || "",
              isAiParsed: true,
            });
          }
        }
      });
    } catch (e) {
      console.error("Error parsing page:", e);
    }
  }

  return allParsedItems;
}
