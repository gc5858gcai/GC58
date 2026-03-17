import { ProjectItem, SteelProfile, CalculationResult, ItemType, BarCuttingPlan, PlateCuttingPlan, OptimizationStrategy, SteelGrade } from "../types";
import { STEEL_PROFILES } from "../constants";

export function calculateSteelRequirements(
  items: ProjectItem[],
  standardBarLength: number,
  standardPlateSize: { width: number; length: number },
  strategy: OptimizationStrategy = OptimizationStrategy.FIRST_FIT,
  grade: SteelGrade = SteelGrade.E24
): CalculationResult {
  const profileGroups = new Map<string, ProjectItem[]>();
  const plateGroups = new Map<number, ProjectItem[]>();

  items.forEach((item) => {
    if (item.type === ItemType.PROFILE) {
      if (item.length <= 0 || item.quantity <= 0) return;
      const key = item.profileId || item.customProfileName || 'unknown';
      const list = profileGroups.get(key) || [];
      list.push(item);
      profileGroups.set(key, list);
    } else if (item.type === ItemType.PLATE && item.thickness) {
      if ((item.width || 0) <= 0 || item.length <= 0 || item.quantity <= 0) return;
      const list = plateGroups.get(item.thickness) || [];
      list.push(item);
      plateGroups.set(item.thickness, list);
    }
  });

  let totalNetWeight = 0;
  let totalGrossWeight = 0;
  let totalBars = 0;
  const barPlans: BarCuttingPlan[] = [];
  const platePlans: PlateCuttingPlan[] = [];

  // 1. Profiles Calculation
  profileGroups.forEach((profileItems, groupKey) => {
    let profile = STEEL_PROFILES.find((p) => p.id === groupKey);
    let linearMass = (grade === SteelGrade.E28 && profile?.linearMassE28) 
      ? profile.linearMassE28 
      : (profile?.linearMass || 0);
    let profileName = profile?.name || groupKey;

    // Handle custom profiles
    if (!profile) {
      const firstItem = profileItems[0];
      if (firstItem.customLinearMass) {
        linearMass = firstItem.customLinearMass;
        profileName = firstItem.customProfileName || groupKey;
      }
    }

    if (linearMass === 0) return;

    const individualCuts: { itemId: string; mark: string; label: string; length: number }[] = [];
    profileItems.forEach((item) => {
      for (let i = 0; i < item.quantity; i++) {
        individualCuts.push({ itemId: item.id, mark: item.mark || '?', label: item.label, length: item.length });
      }
    });

    // Sort based on strategy
    if (strategy === OptimizationStrategy.FIRST_FIT || strategy === OptimizationStrategy.BEST_FIT) {
      individualCuts.sort((a, b) => b.length - a.length);
    }

    const bars: BarCuttingPlan['bars'] = [];
    
    individualCuts.forEach((cut) => {
      let foundIndex = -1;
      
      // Try to fit in existing bars
      if (strategy === OptimizationStrategy.FIRST_FIT) {
        for (let i = 0; i < bars.length; i++) {
          if (bars[i].totalLength - bars[i].usedLength >= cut.length) {
            foundIndex = i;
            break;
          }
        }
      } else if (strategy === OptimizationStrategy.BEST_FIT) {
        let minRemaining = Infinity;
        for (let i = 0; i < bars.length; i++) {
          const remaining = bars[i].totalLength - bars[i].usedLength;
          if (remaining >= cut.length && remaining - cut.length < minRemaining) {
            minRemaining = remaining - cut.length;
            foundIndex = i;
          }
        }
      }

      if (foundIndex !== -1) {
        bars[foundIndex].cuts.push(cut);
        bars[foundIndex].usedLength += cut.length;
        bars[foundIndex].scrap = bars[foundIndex].totalLength - bars[foundIndex].usedLength;
      } else {
        // Use a new standard bar
        bars.push({
          id: `bar-${bars.length + 1}`,
          totalLength: standardBarLength,
          usedLength: cut.length,
          cuts: [cut],
          scrap: standardBarLength - cut.length,
        });
        totalBars++;
      }
    });

    const netLength = individualCuts.reduce((acc, c) => acc + c.length, 0);
    const grossLength = bars.reduce((acc, b) => acc + b.totalLength, 0);

    totalNetWeight += netLength * linearMass;
    totalGrossWeight += grossLength * linearMass;

    barPlans.push({
      profileId: groupKey,
      profileName,
      netWeight: netLength * linearMass,
      grossWeight: grossLength * linearMass,
      bars,
    });
  });

  // 2. Plates Calculation (Guillotine Packing)
  const STEEL_DENSITY = 7850;

  plateGroups.forEach((plates, thickness) => {
    const weightPerM2 = (thickness / 1000) * STEEL_DENSITY;
    const individualPlates: { itemId: string; mark: string; label: string; w: number; l: number }[] = [];
    
    plates.forEach((p) => {
      for (let i = 0; i < p.quantity; i++) {
        // Ensure width is the smaller dimension for consistency
        const w = Math.min(p.width || 0, p.length);
        const l = Math.max(p.width || 0, p.length);
        individualPlates.push({ itemId: p.id, mark: p.mark || '?', label: p.label, w, l });
      }
    });

    // 1. Group identical plates to stack them together
    const plateCounts = new Map<string, { plate: any, count: number }>();
    individualPlates.forEach(p => {
      const key = `${p.w}x${p.l}`;
      const existing = plateCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        plateCounts.set(key, { plate: p, count: 1 });
      }
    });

    // Sort groups based on strategy
    const groups = Array.from(plateCounts.values());
    switch (strategy) {
      case OptimizationStrategy.AREA_DESC:
        groups.sort((a, b) => (b.plate.w * b.plate.l) - (a.plate.w * a.plate.l));
        break;
      case OptimizationStrategy.WIDTH_DESC:
        groups.sort((a, b) => b.plate.w - a.plate.w);
        break;
      case OptimizationStrategy.LENGTH_DESC:
        groups.sort((a, b) => b.plate.l - a.plate.l);
        break;
      case OptimizationStrategy.SIDE_DESC:
        groups.sort((a, b) => (b.plate.w + b.plate.l) - (a.plate.w + a.plate.l));
        break;
      case OptimizationStrategy.PERIMETER_DESC:
        groups.sort((a, b) => 2 * (b.plate.w + b.plate.l) - 2 * (a.plate.w + a.plate.l));
        break;
      case OptimizationStrategy.MAX_SIDE_DESC:
        groups.sort((a, b) => Math.max(b.plate.w, b.plate.l) - Math.max(a.plate.w, a.plate.l));
        break;
      case OptimizationStrategy.MIN_SIDE_DESC:
        groups.sort((a, b) => Math.min(b.plate.w, b.plate.l) - Math.min(a.plate.w, a.plate.l));
        break;
      default:
        groups.sort((a, b) => (b.plate.w * b.plate.l) - (a.plate.w * a.plate.l));
    }

    const refinedSheets: PlateCuttingPlan['sheets'] = [];
    
    interface FreeRect {
      x: number;
      y: number;
      w: number;
      l: number;
    }

    groups.forEach(group => {
      let remainingCount = group.count;
      const plate = group.plate;

      // Safety check: if plate is larger than standard sheet, create custom oversized sheets
      const fitsNormal = plate.w <= standardPlateSize.width && plate.l <= standardPlateSize.length;
      const fitsRotated = plate.l <= standardPlateSize.width && plate.w <= standardPlateSize.length;
      
      if (!fitsNormal && !fitsRotated) {
        while (remainingCount > 0) {
          const pw = plate.w;
          const pl = plate.l;
          const newSheet: PlateCuttingPlan['sheets'][0] = {
            id: `sheet-custom-${refinedSheets.length + 1}`,
            width: pw,
            length: pl,
            usedArea: pw * pl,
            cuts: [{ ...plate, x: 0, y: 0, w: pw, l: pl }],
            scrapArea: 0,
          };
          (newSheet as any).freeRects = [];
          refinedSheets.push(newSheet);
          remainingCount--;
        }
        return;
      }

      while (remainingCount > 0) {
        let placed = false;
        let bestSheetIdx = -1;
        let bestRectIdx = -1;
        let bestOrientation: 'normal' | 'rotated' = 'normal';
        let bestRows = 1;
        let bestCols = 1;
        let maxFitInRect = 0;

        // Optimization: only check the last 3 sheets to avoid O(N^2)
        const startIdx = Math.max(0, refinedSheets.length - 3);
        for (let sIdx = startIdx; sIdx < refinedSheets.length; sIdx++) {
          const sheet = refinedSheets[sIdx];
          const freeRects: FreeRect[] = (sheet as any).freeRects || [];

          for (let rIdx = 0; rIdx < freeRects.length; rIdx++) {
            const rect = freeRects[rIdx];

            // Try normal
            const colsN = Math.floor(rect.w / plate.w);
            const rowsN = Math.floor(rect.l / plate.l);
            const fitN = Math.min(colsN * rowsN, remainingCount);

            if (fitN > maxFitInRect) {
              maxFitInRect = fitN;
              bestSheetIdx = sIdx;
              bestRectIdx = rIdx;
              bestOrientation = 'normal';
              bestCols = colsN;
              bestRows = Math.ceil(fitN / colsN);
              placed = true;
            }

            // Try rotated
            const colsR = Math.floor(rect.w / plate.l);
            const rowsR = Math.floor(rect.l / plate.w);
            const fitR = Math.min(colsR * rowsR, remainingCount);

            if (fitR > maxFitInRect) {
              maxFitInRect = fitR;
              bestSheetIdx = sIdx;
              bestRectIdx = rIdx;
              bestOrientation = 'rotated';
              bestCols = colsR;
              bestRows = Math.ceil(fitR / colsR);
              placed = true;
            }
          }
          if (placed && maxFitInRect >= remainingCount) break; // Found a perfect fit
        }

        if (placed && maxFitInRect > 0) {
          const sheet = refinedSheets[bestSheetIdx];
          const freeRects: FreeRect[] = (sheet as any).freeRects;
          const rect = freeRects.splice(bestRectIdx, 1)[0];
          
          const pw = bestOrientation === 'normal' ? plate.w : plate.l;
          const pl = bestOrientation === 'normal' ? plate.l : plate.w;

          let currentInBlock = 0;
          for (let r = 0; r < bestRows && remainingCount > 0; r++) {
            for (let c = 0; c < bestCols && remainingCount > 0; c++) {
              sheet.cuts.push({ 
                ...plate, 
                x: rect.x + (c * pw), 
                y: rect.y + (r * pl), 
                w: pw, 
                l: pl 
              });
              sheet.usedArea += plate.w * plate.l;
              sheet.scrapArea -= plate.w * plate.l;
              remainingCount--;
              currentInBlock++;
            }
          }

          const blockW = Math.min(bestCols, currentInBlock) * pw;
          const blockL = bestRows * pl;
          const dw = rect.w - blockW;
          const dl = rect.l - blockL;

          if (dw > 0) freeRects.push({ x: rect.x + blockW, y: rect.y, w: dw, l: rect.l });
          if (dl > 0) freeRects.push({ x: rect.x, y: rect.y + blockL, w: blockW, l: dl });
          
          freeRects.sort((a, b) => (b.w * b.l) - (a.w * a.l));
          if (freeRects.length > 50) freeRects.length = 50; // Limit free rects to prevent lag
        } else {
          const newSheet: PlateCuttingPlan['sheets'][0] = {
            id: `sheet-${refinedSheets.length + 1}`,
            width: standardPlateSize.width,
            length: standardPlateSize.length,
            usedArea: 0,
            cuts: [],
            scrapArea: standardPlateSize.width * standardPlateSize.length,
          };
          (newSheet as any).freeRects = [{ x: 0, y: 0, w: standardPlateSize.width, l: standardPlateSize.length }];
          refinedSheets.push(newSheet);
        }
      }
    });

    const netArea = individualPlates.reduce((acc, p) => acc + (p.w * p.l), 0);
    const grossArea = refinedSheets.reduce((acc, s) => acc + (s.width * s.length), 0);
    const netWeight = netArea * weightPerM2;
    const grossWeight = grossArea * weightPerM2;

    totalNetWeight += netWeight;
    totalGrossWeight += grossWeight;

    platePlans.push({
      thickness,
      netWeight,
      grossWeight,
      sheets: refinedSheets,
    });
  });

  const scrapWeight = totalGrossWeight - totalNetWeight;
  const scrapPercentage = totalGrossWeight > 0 ? (scrapWeight / totalGrossWeight) * 100 : 0;

  return {
    netWeight: totalNetWeight,
    grossWeight: totalGrossWeight,
    scrapWeight,
    scrapPercentage,
    totalStandardBars: totalBars,
    items,
    barLength: standardBarLength,
    barPlans,
    platePlans,
  };
}

export function getOptimizationOptions(
  items: ProjectItem[],
  standardBarLength: number,
  standardPlateSize: { width: number; length: number },
  grade: SteelGrade = SteelGrade.E24
): any[] {
  const strategies = [
    OptimizationStrategy.AREA_DESC,
    OptimizationStrategy.WIDTH_DESC,
    OptimizationStrategy.LENGTH_DESC,
    OptimizationStrategy.SIDE_DESC,
    OptimizationStrategy.PERIMETER_DESC,
    OptimizationStrategy.MAX_SIDE_DESC,
    OptimizationStrategy.MIN_SIDE_DESC,
    OptimizationStrategy.FIRST_FIT,
    OptimizationStrategy.BEST_FIT,
    OptimizationStrategy.NEXT_FIT
  ];

  return strategies.map(strategy => {
    try {
      const result = calculateSteelRequirements(items, standardBarLength, standardPlateSize, strategy, grade);
      return {
        strategy,
        scrapPercentage: result.scrapPercentage,
        scrapWeight: result.scrapWeight,
        result
      };
    } catch (error) {
      console.error(`Optimization failed for strategy ${strategy}:`, error);
      return null;
    }
  }).filter(Boolean);
}
