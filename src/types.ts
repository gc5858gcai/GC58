export enum SteelGrade {
  E24 = "E24",
  E28 = "E28"
}

export enum ProfileType {
  IPE = "IPE",
  HEA = "HEA",
  HEB = "HEB",
  UPN = "UPN",
  L = "L",
  UPE = "UPE",
  T = "T",
  TUBE = "TUBE",
  ROUND = "ROUND",
  CUSTOM = "CUSTOM"
}

export interface SteelProfile {
  id: string;
  type: ProfileType;
  name: string;
  linearMass: number; // Default/E24
  linearMassE28?: number; 
}

export enum ItemType {
  PROFILE = "PROFILE",
  PLATE = "PLATE"
}

export interface ProjectItem {
  id: string;
  type: ItemType;
  profileId?: string; // Only for PROFILE
  customProfileName?: string; // For manual entry
  customLinearMass?: number; // For manual entry
  length: number; // meters (or length of plate in meters)
  width?: number; // meters (only for PLATE)
  thickness?: number; // mm (only for PLATE)
  quantity: number;
  label: string;
  mark?: string; // Repère
  isAiParsed?: boolean;
}

export interface StockItem {
  id: string;
  type: ItemType;
  profileId?: string;
  customProfileName?: string;
  length: number; // Length of the bar in stock
  width?: number; // For plates
  thickness?: number; // For plates
  quantity: number;
}

export enum OptimizationStrategy {
  FIRST_FIT = 'FIRST_FIT',
  BEST_FIT = 'BEST_FIT',
  NEXT_FIT = 'NEXT_FIT'
}

export interface BarCuttingPlan {
  profileId: string;
  profileName: string;
  netWeight: number;
  grossWeight: number;
  bars: {
    id: string;
    totalLength: number;
    usedLength: number;
    cuts: { itemId: string; mark: string; label: string; length: number }[];
    scrap: number;
  }[];
}

export interface PlateCuttingPlan {
  thickness: number;
  netWeight: number;
  grossWeight: number;
  sheets: {
    id: string;
    width: number;
    length: number;
    usedArea: number;
    cuts: { itemId: string; mark: string; label: string; x: number; y: number; w: number; l: number }[];
    scrapArea: number;
  }[];
}

export interface CalculationResult {
  netWeight: number;
  grossWeight: number;
  scrapWeight: number;
  scrapPercentage: number;
  totalStandardBars: number;
  items: ProjectItem[];
  barLength: number;
  barPlans: BarCuttingPlan[];
  platePlans: PlateCuttingPlan[];
}

export interface DevisConfig {
  unitPricePerKg: number;
  currency: string;
  taxRate: number;
}

export interface CompanyInfo {
  name: string;
  logo?: string; // Base64 string
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export interface Project {
  id: string;
  name: string;
  items: ProjectItem[];
  companyInfo: CompanyInfo;
  devisConfig: DevisConfig;
  settings: {
    standardBarLength: number;
    standardPlateSize: { id: string; name: string; width: number; length: number };
    optimizationStrategy: OptimizationStrategy;
    language: Language;
    steelGrade: SteelGrade;
    includeWelding: boolean;
    includeExtraPlates: boolean;
    includeBolts: boolean;
  };
  updatedAt: any;
}

export type Language = 'fr' | 'ar' | 'en';
