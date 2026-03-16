import { GoogleGenAI, Type } from "@google/genai";
import { ProjectItem, ItemType } from "../types";
import { STEEL_PROFILES } from "../constants";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

// Set worker for pdfjs using the local worker file bundled by Vite
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Converts a PDF to an image (first page) for Gemini Vision
 */
async function pdfToImage(base64: string): Promise<string> {
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
    const page = await pdf.getPage(1);
    
    // Use a higher scale for better OCR results
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    
    if (!context) throw new Error("Could not get canvas context");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ 
      canvasContext: context, 
      viewport,
      canvas: canvas as any
    }).promise;
    
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch (error: any) {
    console.error("PDF to Image conversion failed:", error);
    if (error.message?.includes("worker")) {
      throw new Error("Erreur de configuration du moteur PDF. Veuillez réessayer ou utiliser une image.");
    }
    throw new Error("Échec du traitement du fichier PDF. Le fichier est peut-être corrompu ou trop complexe.");
  }
}

export async function parseSteelList(fileData: string, mimeType: string): Promise<ProjectItem[]> {
  console.log(`Starting parseSteelList with Gemini`);
  
  // Using the provided Gemini API key
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("Gemini API Key missing. Please set it in the environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey });

  let imageData = fileData;
  let base64Data = "";
  let actualMimeType = mimeType;

  if (mimeType === "application/pdf") {
    const base64 = fileData.split(",")[1];
    imageData = await pdfToImage(base64);
    base64Data = imageData.split(",")[1];
    actualMimeType = "image/jpeg";
  } else {
    base64Data = fileData.split(",")[1];
  }

  const prompt = `
    You are an expert in structural steel engineering. Extract all steel elements from this document (technical drawing or bill of materials).
    
    The document is likely in French. Look for terms like:
    - "Repère" or "Pos" -> mark
    - "Désignation" or "Profil" -> profileName / label
    - "Nb" or "Qté" -> quantity
    - "Long" or "Longueur" -> length
    - "Larg" or "Largeur" -> width
    - "Ep" or "Epaisseur" -> thickness

    Profiles to look for: ${STEEL_PROFILES.map(p => p.name).join(", ")}.
    
    EXTRACTION RULES:
    1. For PROFILES (IPE, HEA, HEB, UPN, L, etc.):
       - Extract Length in meters (m).
       - Extract Quantity.
       - If you see "2UPN140" or "2 UPN 140", set profileName to "UPN 140" and DOUBLE the quantity.
       - If Length is > 12m, it's likely a total length; divide it by a reasonable bar length (e.g., 6m or 12m) or keep as is if it's a single piece.
    
    2. For PLATES (Plats, Tôles, Platines):
       - Look for designations like "PL 10x200" or "PL10x200".
       - The FIRST number (e.g., 10) is ALWAYS the Thickness (mm).
       - The SECOND number (e.g., 200) is ALWAYS the Width (mm). You MUST convert this to meters (e.g., 0.2) for the "width" field.
       - The Length is usually in a separate column. Convert it to meters (m).
       - If you see "PL 10x200x300", then Thickness=10mm, Width=200mm (0.2m), Length=300mm (0.3m).
       - Extract Quantity.

    3. GENERAL:
       - Always return numbers, not strings with units.
       - If a value is missing, use 0.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: actualMimeType,
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
    let parsed: any[] = [];
    
    try {
      const json = JSON.parse(content);
      parsed = json.items || [];
    } catch (e) {
      console.error("Failed to parse Gemini response:", e);
      return [];
    }

    return parsed.map((item: any) => {
      const isPlate = item.itemType === "PLATE" || (!item.profileName && (item.width || item.thickness));
      let quantity = Math.abs(Number(item.quantity)) || 1;
      let length = Math.abs(Number(item.length)) || 0;
      let profileName = String(item.profileName || "").trim();

      // Post-processing for doubled profiles (e.g., "2UPN140")
      if (!isPlate && profileName.match(/^2[a-zA-Z]/i)) {
        profileName = profileName.substring(1).trim();
        quantity *= 2;
      }

      // Post-processing for long bars (> 12m)
      if (!isPlate && length > 12) {
        length /= 2;
        quantity *= 2;
      }
      
      if (isPlate) {
        return {
          id: Math.random().toString(36).substr(2, 9),
          type: ItemType.PLATE,
          length: length,
          width: Number(item.width) || 0,
          thickness: Number(item.thickness) || 0,
          quantity: quantity,
          label: item.label || "Platine",
          mark: item.mark || "",
          isAiParsed: true,
        };
      }

      // Find matching profile ID
      const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, "");
      const profile = STEEL_PROFILES.find(
        p => normalize(p.name) === normalize(profileName)
      );

      if (profile) {
        return {
          id: Math.random().toString(36).substr(2, 9),
          type: ItemType.PROFILE,
          profileId: profile.id,
          length: length,
          quantity: quantity,
          label: item.label || "Profilé",
          mark: item.mark || "",
          isAiParsed: true,
        };
      }

      return {
        id: Math.random().toString(36).substr(2, 9),
        type: ItemType.PROFILE,
        customProfileName: profileName || "Profilé Inconnu",
        customLinearMass: 0,
        length: length,
        quantity: quantity,
        label: item.label || "Profilé",
        mark: item.mark || "",
        isAiParsed: true,
      };
    });
  } catch (error: any) {
    console.error("Gemini API error:", error);
    throw new Error("Failed to analyze document with Gemini. Please try again.");
  }
}
