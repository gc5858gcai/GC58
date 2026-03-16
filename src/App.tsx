import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  Plus, 
  Trash2, 
  FileText, 
  BarChart3, 
  Settings, 
  Download, 
  Info,
  Euro,
  Scale,
  Layers,
  Upload,
  Loader2,
  FileUp,
  Menu,
  X,
  LogOut,
  RefreshCcw,
  Check,
  ZoomIn,
  Maximize2,
  HardHat,
  Building2,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

import { supabase } from './supabase';
import { User } from '@supabase/supabase-js';
import { ErrorBoundary } from './AppErrorBoundary';

import { ProjectItem, DevisConfig, ItemType, OptimizationStrategy, StockItem, SteelGrade, CompanyInfo, Project } from './types';
import { STEEL_PROFILES, STANDARD_BAR_LENGTHS, STANDARD_PLATE_SIZES } from './constants';
import { calculateSteelRequirements } from './utils/calculations';
import { parseSteelList } from './services/aiService';
import { Language, translations } from './i18n';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [showWelcome, setShowWelcome] = useState(false);

  const [items, setItems] = useState<ProjectItem[]>([]);
  const [standardBarLength, setStandardBarLength] = useState(12);
  const [standardPlateSize, setStandardPlateSize] = useState(STANDARD_PLATE_SIZES[0]);
  const [activeTab, setActiveTab] = useState<'input' | 'results' | 'boq' | 'devis' | 'cutting' | 'company'>('input');
  const [optimizationStrategy, setOptimizationStrategy] = useState<OptimizationStrategy>(OptimizationStrategy.FIRST_FIT);
  const [isUploading, setIsUploading] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('fr');
  const isRtl = language === 'ar';
  const [projectName, setProjectName] = useState<string>(isRtl ? "مشروع جديد" : "Nouveau Projet");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [steelGrade, setSteelGrade] = useState<SteelGrade>(SteelGrade.E24);

  const [includeWelding, setIncludeWelding] = useState(false);
  const [includeExtraPlates, setIncludeExtraPlates] = useState(false);
  const [includeBolts, setIncludeBolts] = useState(false);

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({ name: '', description: '', logo: '', address: '', phone: '', email: '' });

  const [devisConfig, setDevisConfig] = useState<DevisConfig>({
    unitPricePerKg: 180,
    currency: 'DZD',
    taxRate: 19
  });

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallButton(false);
    }
    setDeferredPrompt(null);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSignUpSuccess(false);
    setIsAuthLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user && data.session === null) {
          // Email confirmation is likely enabled
          setSignUpSuccess(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error: any) {
      console.error("Auth Error:", error);
      let message = error.message;
      if (message === "Invalid login credentials") {
        message = isRtl 
          ? "بيانات الدخول غير صحيحة. تأكد من البريد الإلكتروني وكلمة المرور. إذا كنت مستخدماً جديداً، يرجى إنشاء حساب أولاً." 
          : "Identifiants invalides. Vérifiez votre email/mot de passe. Si vous êtes nouveau, veuillez d'abord créer un compte.";
      } else if (message.includes("confirmation email")) {
        message = isRtl 
          ? "تم إنشاء الحساب ولكن فشل إرسال بريد التأكيد. يرجى مراجعة البريد العشوائي (Spam) أو المحاولة مرة أخرى لاحقاً. فريق GC58 يعمل على حل المشكلة." 
          : "Compte créé mais l'envoi de l'email de confirmation a échoué. Vérifiez vos spams ou réessayez plus tard. L'équipe GC58 travaille sur le problème.";
      }
      setAuthError(message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  // Auth Listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Supabase Sync - Load
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const loadData = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            // Profile doesn't exist yet, will be created on first save
            return;
          }
          throw error;
        }

        if (data) {
          if (data.items) setItems(data.items);
          if (data.project_name) setProjectName(data.project_name);
          if (data.company_info) setCompanyInfo(data.company_info);
          if (data.devis_config) setDevisConfig(data.devis_config);
          
          if (data.settings) {
            const s = data.settings;
            if (s.standardBarLength) setStandardBarLength(s.standardBarLength);
            if (s.standardPlateSize) setStandardPlateSize(s.standardPlateSize);
            if (s.optimizationStrategy) setOptimizationStrategy(s.optimizationStrategy);
            if (s.language) setLanguage(s.language);
            if (s.steelGrade) setSteelGrade(s.steelGrade);
            if (s.includeWelding !== undefined) setIncludeWelding(s.includeWelding);
            if (s.includeExtraPlates !== undefined) setIncludeExtraPlates(s.includeExtraPlates);
            if (s.includeBolts !== undefined) setIncludeBolts(s.includeBolts);
          }
        }
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };

    loadData();
  }, [user, isAuthReady]);

  // Supabase Sync - Save (Debounced)
  useEffect(() => {
    if (!user || !isAuthReady) return;

    const timer = setTimeout(async () => {
      setIsSyncing(true);
      try {
        const { error } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            project_name: projectName,
            items,
            company_info: companyInfo,
            devis_config: devisConfig,
            settings: {
              standardBarLength,
              standardPlateSize,
              optimizationStrategy,
              language,
              steelGrade,
              includeWelding,
              includeExtraPlates,
              includeBolts
            },
            updated_at: new Date().toISOString()
          });

        if (error) throw error;
        setLastSaved(new Date());
      } catch (error) {
        console.error("Error saving data:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [items, projectName, companyInfo, devisConfig, standardBarLength, standardPlateSize, optimizationStrategy, language, steelGrade, includeWelding, includeExtraPlates, includeBolts, user, isAuthReady]);

  const triggerWelcome = () => {
    setShowWelcome(true);
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.volume = 0.4;
    audio.play().catch(e => console.log("Audio play failed:", e));
  };

  // Welcome Message Logic
  useEffect(() => {
    if (user && isAuthReady) {
      // Use a versioned key to force it to show at least once after this update
      const welcomeKey = `welcome_gc58_v3_${user.id}`;
      const hasSeenWelcome = localStorage.getItem(welcomeKey);
      
      if (!hasSeenWelcome) {
        // Small delay to ensure UI is ready
        const timeout = setTimeout(() => {
          triggerWelcome();
          localStorage.setItem(welcomeKey, 'true');
        }, 1500);
        return () => clearTimeout(timeout);
      }
    }
  }, [user, isAuthReady]);

  const handleClearProject = () => {
    setItems([]);
    setProjectName(language === 'ar' ? "مشروع جديد" : "Nouveau Projet");
    setShowClearConfirm(false);
  };
  const [selectedSheet, setSelectedSheet] = useState<any>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const t = translations[language];
  
  const results = useMemo(() => {
    return calculateSteelRequirements(items, standardBarLength, standardPlateSize, optimizationStrategy, steelGrade);
  }, [items, standardBarLength, standardPlateSize, optimizationStrategy, steelGrade]);

  const totalWeightWithExtras = useMemo(() => {
    const welding = includeWelding ? results.grossWeight * 0.05 : 0;
    const extraPlates = includeExtraPlates ? results.grossWeight * 0.05 : 0;
    const bolts = includeBolts ? results.grossWeight * 0.02 : 0;
    return results.grossWeight + welding + extraPlates + bolts;
  }, [results.grossWeight, includeWelding, includeExtraPlates, includeBolts]);

  const strategyComparison = useMemo(() => {
    if (items.length === 0) return null;
    const strategies = [
      OptimizationStrategy.FIRST_FIT,
      OptimizationStrategy.BEST_FIT,
    ];
    const resultsMap = strategies.map(s => ({
      strategy: s,
      res: calculateSteelRequirements(items, standardBarLength, standardPlateSize, s, steelGrade)
    }));
    
    const best = resultsMap.reduce((prev, curr) => 
      curr.res.scrapPercentage < prev.res.scrapPercentage ? curr : prev
    );
    
    const worst = resultsMap.reduce((prev, curr) => 
      curr.res.scrapPercentage > prev.res.scrapPercentage ? curr : prev
    );

    return {
      resultsMap,
      best,
      worst,
      saving: worst.res.scrapWeight - best.res.scrapWeight,
      savingPercent: worst.res.scrapPercentage - best.res.scrapPercentage
    };
  }, [items, standardBarLength, standardPlateSize, steelGrade]);

  const addItem = (type: ItemType = ItemType.PROFILE) => {
    const newItem: ProjectItem = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      profileId: type === ItemType.PROFILE ? STEEL_PROFILES[0].id : undefined,
      customProfileName: '',
      customLinearMass: 0,
      length: 1.0,
      width: type === ItemType.PLATE ? 1.0 : undefined,
      thickness: type === ItemType.PLATE ? 10 : undefined,
      quantity: 1,
      label: type === ItemType.PROFILE ? `Profilé ${items.length + 1}` : `Platine ${items.length + 1}`,
      mark: ''
    };
    setItems([...items, newItem]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<ProjectItem>) => {
    setItems(items.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const resizeImage = (base64Str: string, maxWidth = 1600, maxHeight = 1600): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
    });
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setIsUploading(true);
    setUploadError(null);
    try {
      const file = acceptedFiles[0];
      const reader = new FileReader();
      
      let fileData = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      // Resize if it's an image to speed up AI processing
      if (file.type.startsWith('image/')) {
        fileData = await resizeImage(fileData);
      }

      const parsedItems = await parseSteelList(fileData, file.type.startsWith('image/') ? 'image/jpeg' : file.type);
      setItems(prev => [...prev, ...parsedItems]);
      setImportSuccess(true);
      setTimeout(() => setImportSuccess(false), 3000);
    } catch (error: any) {
      console.error("Error parsing file:", error);
      setUploadError(error.message || "Erreur lors de la lecture du fichier par l'IA.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleExportCuttingPlansPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const timestamp = new Date().toLocaleDateString();
      
      // Helper to add charts
      const addChartToPDF = async (containerId: string, yPos: number, height = 80) => {
        const element = document.getElementById(containerId);
        if (element) {
          const canvas = await html2canvas(element, { scale: 2 });
          const imgData = canvas.toDataURL('image/png');
          const imgProps = doc.getImageProperties(imgData);
          const pdfWidth = doc.internal.pageSize.getWidth() - 28;
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
          doc.addImage(imgData, 'PNG', 14, yPos, pdfWidth, Math.min(pdfHeight, height));
          return yPos + Math.min(pdfHeight, height) + 10;
        }
        return yPos;
      };

      // Cover Page for Cutting Plans
      doc.setFillColor(31, 41, 55); // Slate 900
      doc.rect(0, 0, 210, 297, 'F');
      
      // Logo Section
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(60);
      doc.text("GC58", 105, 80, { align: 'center' });
      doc.setFontSize(16);
      doc.setTextColor(245, 158, 11); // Amber 500
      doc.text("CIVIL ENGINEERING", 105, 92, { align: 'center' });
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.text(isRtl ? "مخططات التقطيع التفصيلية" : "Plans de Débitage Détaillés", 105, 120, { align: 'center' });
      
      doc.setFontSize(16);
      doc.text(projectName, 105, 130, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text(`Date: ${timestamp}`, 105, 150, { align: 'center' });
      
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(1);
      doc.line(40, 160, 170, 160);

      // Page 2: Analysis Charts
      doc.addPage();
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      doc.text(isRtl ? "التحليل البياني للتقطيع" : "Analyses Graphiques du Débitage", 14, 25);
      
      let chartY = 35;
      chartY = await addChartToPDF('weight-chart-container', chartY, 70);
      chartY = await addChartToPDF('efficiency-chart-container', chartY, 70);
      if (chartY > 220) { doc.addPage(); chartY = 25; }
      chartY = await addChartToPDF('distribution-chart-container', chartY, 70);

      // Page 3: Summary of Cutting
      doc.addPage();
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      doc.text(isRtl ? "ملخص عملية التقطيع" : "Résumé du Débitage", 14, 25);
      
      autoTable(doc, {
        startY: 35,
        head: [[isRtl ? 'النوع' : 'Type', isRtl ? 'العدد الإجمالي' : 'Quantité Totale', isRtl ? 'الوزن الإجمالي' : 'Poids Total']],
        body: [
          [isRtl ? 'قضبان الحديد' : 'Profilés (Barres)', results.barPlans.reduce((acc, p) => acc + p.bars.length, 0).toString(), `${results.barPlans.reduce((acc, p) => acc + p.grossWeight, 0).toFixed(2)} kg`],
          [isRtl ? 'الصفائح' : 'Tôles (Platines)', results.platePlans.reduce((acc, p) => acc + p.sheets.length, 0).toString(), `${results.platePlans.reduce((acc, p) => acc + p.grossWeight, 0).toFixed(2)} kg`],
        ],
        headStyles: { fillColor: [31, 41, 55] },
      });

      let currentY = (doc as any).lastAutoTable.finalY + 20;

      // Bar Plans
      if (results.barPlans.length > 0) {
        doc.addPage();
        currentY = 25;
        doc.setTextColor(79, 70, 229);
        doc.setFontSize(20);
        doc.text(isRtl ? "تفاصيل تقطيع القضبان" : "Détails Débitage Profilés", 14, currentY);
        currentY += 15;

        results.barPlans.forEach((plan) => {
          if (currentY > 250) { doc.addPage(); currentY = 25; }
          
          doc.setFillColor(248, 250, 252);
          doc.rect(14, currentY, 182, 10, 'F');
          doc.setTextColor(15, 23, 42);
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.text(plan.profileName, 18, currentY + 7);
          currentY += 15;

          plan.bars.forEach((bar, idx) => {
            if (currentY > 260) { doc.addPage(); currentY = 25; }
            
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);
            doc.text(`${isRtl ? 'قضيب' : 'Barre'} #${idx + 1} (${standardBarLength}m) - ${isRtl ? 'الاستخدام' : 'Utilisation'}: ${((bar.usedLength / bar.totalLength) * 100).toFixed(1)}%`, 14, currentY);
            currentY += 4;

            // Draw Bar
            const barWidth = 180;
            const barHeight = 10;
            doc.setDrawColor(226, 232, 240);
            doc.setFillColor(241, 245, 249);
            doc.rect(14, currentY, barWidth, barHeight, 'FD');

            let currentX = 14;
            bar.cuts.forEach((cut) => {
              const cutWidth = (cut.length / bar.totalLength) * barWidth;
              doc.setFillColor(79, 70, 229); // Indigo 600
              doc.rect(currentX, currentY, cutWidth, barHeight, 'F');
              doc.setDrawColor(255, 255, 255);
              doc.setLineWidth(0.5);
              doc.line(currentX + cutWidth, currentY, currentX + cutWidth, currentY + barHeight);
              
              if (cutWidth > 15) {
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(6);
                doc.text(`${cut.mark} (${cut.length}m)`, currentX + cutWidth/2, currentY + 6.5, { align: 'center' });
              }
              currentX += cutWidth;
            });

            // Scrap (RED)
            const scrapWidth = (bar.scrap / bar.totalLength) * barWidth;
            if (scrapWidth > 0) {
              doc.setFillColor(239, 68, 68); // Red 500
              doc.rect(currentX, currentY, scrapWidth, barHeight, 'F');
              if (scrapWidth > 10) {
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(6);
                doc.text(`${bar.scrap.toFixed(2)}m`, currentX + scrapWidth/2, currentY + 6.5, { align: 'center' });
              }
            }

            currentY += barHeight + 12;
          });
          currentY += 10;
        });
      }

      // Plate Plans
      if (results.platePlans.length > 0) {
        doc.addPage();
        currentY = 25;
        doc.setTextColor(16, 185, 129);
        doc.setFontSize(20);
        doc.text(isRtl ? "تفاصيل تقطيع الصفائح" : "Détails Débitage Platines", 14, currentY);
        currentY += 15;

        results.platePlans.forEach((plan) => {
          if (currentY > 250) { doc.addPage(); currentY = 25; }
          
          doc.setFillColor(240, 253, 244);
          doc.rect(14, currentY, 182, 10, 'F');
          doc.setTextColor(6, 78, 59);
          doc.setFontSize(12);
          doc.setFont("helvetica", "bold");
          doc.text(`${isRtl ? 'بلاتين' : 'Platine'} Ep. ${plan.thickness}mm`, 18, currentY + 7);
          currentY += 15;

          plan.sheets.forEach((sheet, idx) => {
            if (currentY > 200) { doc.addPage(); currentY = 25; }

            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);
            doc.text(`${isRtl ? 'صفيحة' : 'Tôle'} #${idx + 1} (${sheet.width}x${sheet.length}m) - ${isRtl ? 'الاستخدام' : 'Utilisation'}: ${((sheet.usedArea / (sheet.width * sheet.length)) * 100).toFixed(1)}%`, 14, currentY);
            currentY += 5;

            // Draw Plate Layout
            const maxDrawWidth = 120;
            const scale = maxDrawWidth / sheet.width;
            const drawHeight = sheet.length * scale;
            
            // Background (Scrap in RED)
            doc.setDrawColor(203, 213, 225);
            doc.setFillColor(254, 226, 226); // Light red background for sheet
            doc.rect(14, currentY, maxDrawWidth, drawHeight, 'FD');

            sheet.cuts.forEach((cut) => {
              doc.setFillColor(16, 185, 129); // Emerald 500
              doc.rect(
                14 + (cut.x * scale),
                currentY + (cut.y * scale),
                cut.w * scale,
                cut.l * scale,
                'F'
              );
              doc.setDrawColor(255, 255, 255);
              doc.setLineWidth(0.3);
              doc.rect(
                14 + (cut.x * scale),
                currentY + (cut.y * scale),
                cut.w * scale,
                cut.l * scale,
                'D'
              );
              
              if (cut.w * scale > 12 && cut.l * scale > 8) {
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(5);
                doc.text(`${cut.mark}`, 14 + (cut.x * scale) + (cut.w * scale)/2, currentY + (cut.y * scale) + (cut.l * scale)/2 - 1, { align: 'center' });
                doc.text(`${cut.w}x${cut.l}`, 14 + (cut.x * scale) + (cut.w * scale)/2, currentY + (cut.y * scale) + (cut.l * scale)/2 + 2, { align: 'center' });
              }
            });

            currentY += drawHeight + 20;
          });
        });
      }

      // Footer & Header Logo on all pages
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        
        // Header Logo
        if (companyInfo.logo) {
          try {
            doc.addImage(companyInfo.logo, 'PNG', 175, 5, 20, 12);
          } catch (e) {
            console.error("Error adding logo to PDF", e);
          }
        }
        
        doc.setFontSize(10);
        doc.setTextColor(31, 41, 55);
        doc.setFont("helvetica", "bold");
        doc.text(companyInfo.name || "GC58", 170, 15, { align: 'right' });
        doc.setFontSize(6);
        doc.text(companyInfo.description || "CIVIL ENGINEERING", 170, 18, { align: 'right' });
        doc.setDrawColor(226, 232, 240);
        doc.line(14, 20, 196, 20);

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`${companyInfo.name || "GC58"} - ${isRtl ? "مخططات التقطيع" : "Plans de Débitage"} | Page ${i} / ${pageCount}`, 105, 285, { align: 'center' });
      }

      doc.save(`Plans_Debitage_${projectName.replace(/\s+/g, '_')}_${timestamp.replace(/\//g, '-')}.pdf`);
    } catch (error) {
      console.error("Cutting Plans PDF Export Error:", error);
      alert("Erreur lors de la génération des plans de débitage.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const timestamp = new Date().toLocaleDateString();
      
      // Helper to add charts
      const addChartToPDF = async (containerId: string, yPos: number, height = 80) => {
        const element = document.getElementById(containerId);
        if (element) {
          const canvas = await html2canvas(element, { scale: 2 });
          const imgData = canvas.toDataURL('image/png');
          const imgProps = doc.getImageProperties(imgData);
          const pdfWidth = doc.internal.pageSize.getWidth() - 28;
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
          doc.addImage(imgData, 'PNG', 14, yPos, pdfWidth, Math.min(pdfHeight, height));
          return yPos + Math.min(pdfHeight, height) + 10;
        }
        return yPos;
      };

      // Page 1: Professional Cover Page
      doc.setFillColor(31, 41, 55); // Slate 900
      doc.rect(0, 0, 210, 297, 'F');
      
      // Logo Section
      if (companyInfo.logo) {
        try {
          doc.addImage(companyInfo.logo, 'PNG', 85, 40, 40, 25);
        } catch (e) {
          console.error("Error adding logo to cover", e);
        }
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(40);
      doc.text(companyInfo.name || "GC58", 105, 80, { align: 'center' });
      doc.setFontSize(14);
      doc.setTextColor(245, 158, 11); // Amber 500
      doc.text(companyInfo.description || "CIVIL ENGINEERING", 105, 92, { align: 'center' });
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(24);
      doc.text(isRtl ? "تقرير تحسين تقطيع الحديد" : "Rapport d'Optimisation de Débitage", 105, 120, { align: 'center' });
      
      doc.setFontSize(18);
      doc.setTextColor(148, 163, 184);
      doc.text(projectName, 105, 130, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text(`Généré le: ${timestamp}`, 105, 150, { align: 'center' });
      
      doc.setDrawColor(99, 102, 241);
      doc.setLineWidth(2);
      doc.line(60, 160, 150, 160);

      // Page 2: Summary & Key Metrics
      doc.addPage();
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(20);
      doc.text(isRtl ? "ملخص المشروع" : "Résumé du Projet", 14, 25);
      
      autoTable(doc, {
        startY: 35,
        head: [[isRtl ? 'المؤشر' : 'Indicateur', isRtl ? 'القيمة' : 'Valeur']],
        body: [
          [isRtl ? 'اسم المشروع' : 'Nom du Projet', projectName],
          [isRtl ? 'الوزن الصافي' : 'Poids Net', `${results.netWeight.toFixed(2)} kg`],
          [isRtl ? 'الوزن الإجمالي' : 'Poids Brut', `${results.grossWeight.toFixed(2)} kg`],
          [isRtl ? 'وزن الخردة' : 'Poids des Chutes', `${results.scrapWeight.toFixed(2)} kg`],
          [isRtl ? 'نسبة الخردة' : 'Taux de Chute', `${results.scrapPercentage.toFixed(2)}%`],
          [isRtl ? 'عدد القضبان' : 'Nombre de Barres', results.totalStandardBars.toString()],
          [isRtl ? 'درجة الحديد' : 'Nuance d\'Acier', steelGrade],
        ],
        theme: 'grid',
        headStyles: { fillColor: [31, 41, 55] },
        styles: { fontSize: 10, cellPadding: 5 }
      });

      // Charts Section
      let currentY = (doc as any).lastAutoTable.finalY + 20;
      doc.setFontSize(16);
      doc.text(isRtl ? "التحليل البياني" : "Analyses Graphiques", 14, currentY);
      currentY += 10;
      
      currentY = await addChartToPDF('weight-chart-container', currentY, 70);
      if (currentY > 220) { doc.addPage(); currentY = 25; }
      currentY = await addChartToPDF('distribution-chart-container', currentY, 70);
      
      doc.addPage();
      currentY = 25;
      currentY = await addChartToPDF('efficiency-chart-container', currentY, 70);
      currentY = await addChartToPDF('stacked-chart-container', currentY, 70);

      // Page 3: Detailed BOQ
      doc.addPage();
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      doc.text(isRtl ? "جدول الكميات التفصيلي" : "Bordereau Quantitatif Détaillé", 14, 25);
      
      const boqBody = [
        ...results.barPlans.map(plan => [
          plan.profileName,
          'U',
          plan.bars.length.toString(),
          (plan.bars.length > 0 ? (plan.grossWeight / plan.bars.length).toFixed(2) : "0.00"),
          plan.grossWeight.toFixed(2)
        ]),
        ...results.platePlans.map(plan => {
          const weightPerM2 = ((plan.thickness || 0) / 1000) * 7850;
          // Use the size of the first sheet as the representative size for the type
          const sheetSize = plan.sheets.length > 0 
            ? `${plan.sheets[0].width}x${plan.sheets[0].length}m` 
            : `${standardPlateSize.width}x${standardPlateSize.length}m`;

          return [
            `${isRtl ? 'بلاتين' : 'Platine'} Ep. ${plan.thickness}mm (${sheetSize})`,
            isRtl ? 'قطعة' : 'U',
            plan.sheets.length.toString(),
            (plan.sheets.length > 0 ? (plan.grossWeight / plan.sheets.length).toFixed(2) : "0.00"),
            plan.grossWeight.toFixed(2)
          ];
        }),
        ...(includeWelding ? [[t.welding, '%', '5%', '-', (results.grossWeight * 0.05).toFixed(2)]] : []),
        ...(includeExtraPlates ? [[t.extraPlates, '%', '5%', '-', (results.grossWeight * 0.05).toFixed(2)]] : []),
        ...(includeBolts ? [[t.bolts, '%', '2%', '-', (results.grossWeight * 0.02).toFixed(2)]] : []),
        [{ content: isRtl ? 'المجموع الإجمالي' : 'TOTAL GÉNÉRAL', colSpan: 4, styles: { halign: 'right' as const, fontStyle: 'bold' as const } }, { content: `${totalWeightWithExtras.toFixed(2)} kg`, styles: { fontStyle: 'bold' as const } }]
      ];

      autoTable(doc, {
        startY: 35,
        head: [[isRtl ? 'البيان' : 'Désignation', isRtl ? 'الوحدة' : 'Unité', isRtl ? 'الكمية' : 'Quantité', isRtl ? 'الوزن الوحدوي' : 'Poids Unitaire', isRtl ? 'الإجمالي (كغ)' : 'Total (kg)']],
        body: boqBody,
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 9 }
      });

      // Page 4: Financial Quote (Devis)
      doc.addPage();
      doc.setFontSize(18);
      doc.text(isRtl ? "العرض المالي (Devis)" : "Offre Financière (Devis)", 14, 25);
      
      const totalHT = totalWeightWithExtras * devisConfig.unitPricePerKg;
      const tva = totalHT * (devisConfig.taxRate / 100);
      const totalTTC = totalHT + tva;

      autoTable(doc, {
        startY: 35,
        head: [[isRtl ? 'البند' : 'Poste', isRtl ? 'طريقة الحساب' : 'Détail Calcul', isRtl ? 'المبلغ' : 'Montant']],
        body: [
          [isRtl ? 'توريد وتشكيل الحديد' : 'Fourniture et Façonnage Acier', `${totalWeightWithExtras.toFixed(2)} kg x ${devisConfig.unitPricePerKg} ${devisConfig.currency}/kg`, `${totalHT.toFixed(2)} ${devisConfig.currency}`],
          [{ content: isRtl ? 'المجموع الصافي (HT)' : 'Total Hors Taxe (HT)', colSpan: 2, styles: { halign: 'right' } }, `${totalHT.toFixed(2)} ${devisConfig.currency}`],
          [{ content: `${isRtl ? 'الضريبة' : 'TVA'} (${devisConfig.taxRate}%)`, colSpan: 2, styles: { halign: 'right' } }, `${tva.toFixed(2)} ${devisConfig.currency}`],
          [{ content: isRtl ? 'المجموع النهائي (TTC)' : 'TOTAL TTC', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fontSize: 12 } }, { content: `${totalTTC.toFixed(2)} ${devisConfig.currency}`, styles: { fontStyle: 'bold', fontSize: 12 } }],
        ],
        headStyles: { fillColor: [31, 41, 55] },
        styles: { fontSize: 10, cellPadding: 6 }
      });

      // Footer & Header Logo on all pages
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        if (i === 1) continue; // Skip cover page
        doc.setPage(i);
        
        // Header Logo
        if (companyInfo.logo) {
          try {
            doc.addImage(companyInfo.logo, 'PNG', 175, 5, 20, 12);
          } catch (e) {
            console.error("Error adding logo to page", e);
          }
        }

        doc.setFontSize(10);
        doc.setTextColor(31, 41, 55);
        doc.setFont("helvetica", "bold");
        doc.text(companyInfo.name || "GC58", 170, 15, { align: 'right' });
        doc.setFontSize(6);
        doc.text(companyInfo.description || "CIVIL ENGINEERING", 170, 18, { align: 'right' });
        doc.setDrawColor(226, 232, 240);
        doc.line(14, 20, 196, 20);

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`${companyInfo.name || "GC58"} - ${projectName} | Page ${i} / ${pageCount}`, 105, 285, { align: 'center' });
      }

      doc.save(`Rapport_${projectName.replace(/\s+/g, '_')}_${timestamp.replace(/\//g, '-')}.pdf`);
    } catch (error) {
      console.error("PDF Export Error:", error);
      alert("Erreur lors de la génération du PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/pdf': ['.pdf']
    },
    multiple: false
  });

  const chartData = [
    { name: isRtl ? 'الوزن الصافي' : 'Poids Net', value: results.netWeight, color: '#10b981' },
    { name: isRtl ? 'الخردة' : 'Chutes', value: results.scrapWeight, color: '#ef4444' }
  ];

  const profileDistributionData = useMemo(() => {
    const dist: Record<string, number> = {};
    items.forEach(item => {
      const profile = STEEL_PROFILES.find(p => p.id === item.profileId);
      const name = profile?.name || item.customProfileName || 'Unknown';
      const linearMass = (steelGrade === SteelGrade.E28 && profile?.linearMassE28) 
        ? profile.linearMassE28 
        : (profile?.linearMass || item.customLinearMass || 0);
      const weight = item.length * item.quantity * linearMass;
      dist[name] = (dist[name] || 0) + weight;
    });
    return Object.entries(dist).map(([name, value]) => ({ name, value }));
  }, [items, steelGrade]);

  const profileEfficiencyData = useMemo(() => {
    const data: Record<string, { net: number, scrap: number }> = {};
    
    results.barPlans.forEach(plan => {
      data[plan.profileName] = { 
        net: (data[plan.profileName]?.net || 0) + plan.netWeight,
        scrap: (data[plan.profileName]?.scrap || 0) + (plan.grossWeight - plan.netWeight)
      };
    });
    
    results.platePlans.forEach(plan => {
      const name = `Plate ${plan.thickness}mm`;
      data[name] = {
        net: (data[name]?.net || 0) + plan.netWeight,
        scrap: (data[name]?.scrap || 0) + (plan.grossWeight - plan.netWeight)
      };
    });

    return Object.entries(data).map(([name, values]) => ({
      name,
      net: Number(values.net.toFixed(2)),
      scrap: Number(values.scrap.toFixed(2)),
      efficiency: (values.net / (values.net + values.scrap)) * 100
    }));
  }, [results]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4 font-sans" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 p-10 text-center">
          <div className="w-20 h-20 bg-slate-900 rounded-3xl flex flex-col items-center justify-center text-white shadow-xl mx-auto mb-8 border border-slate-700">
            <HardHat size={32} className="text-amber-500 mb-1" />
            <span className="text-xs font-black leading-none tracking-tighter">GC58</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">{t.title}</h1>
          <p className="text-slate-500 mb-8 font-medium">{t.authRequired}</p>
          
          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <div className="space-y-1 text-left">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Email</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="votre@email.com"
              />
            </div>
            <div className="space-y-1 text-left">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Mot de passe</label>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="••••••••"
              />
            </div>
            
            {authError && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-500 text-[10px] font-bold text-left">
                <p className="mb-1 flex items-center gap-2">
                  <X size={12} className="shrink-0" />
                  {authError}
                </p>
                <div className="text-slate-400 font-normal space-y-1 mt-2 border-t border-red-100 pt-2">
                  <p>• {isRtl ? "تأكد من أنك قمت بإنشاء حساب (Sign Up) قبل محاولة الدخول." : "Assurez-vous d'avoir créé un compte (Sign Up) avant de vous connecter."}</p>
                  <p>• {isRtl ? "تأكد من تفعيل Email/Password في إعدادات Supabase Auth." : "Vérifiez que Email/Password est activé dans Supabase Auth."}</p>
                </div>
              </div>
            )}

            {signUpSuccess && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 text-xs font-bold text-left">
                <p className="flex items-center gap-2">
                  <Check size={16} />
                  {isRtl ? "تم إنشاء الحساب بنجاح!" : "Compte créé avec succès !"}
                </p>
                <p className="mt-1 font-normal text-slate-500">
                  {isRtl ? "يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب." : "Veuillez vérifier votre email pour activer votre compte."}
                </p>
              </div>
            )}

            <button 
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
            >
              {isAuthLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (isSignUp ? "Créer un compte" : t.loggingIn)}
            </button>
          </form>

          <button 
            onClick={() => { setIsSignUp(!isSignUp); setAuthError(null); }}
            className="mt-6 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            {isSignUp ? "Déjà un compte ? Se connecter" : "Pas de compte ? Créer un compte"}
          </button>
          
          <div className="mt-10 flex items-center justify-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Secure Cloud Sync Enabled</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex overflow-hidden relative", isRtl && "font-arabic")} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-auto",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-slate-900 rounded-xl flex flex-col items-center justify-center text-white shadow-lg shadow-slate-200 border border-slate-700">
              <HardHat size={20} className="text-amber-500 mb-0.5" />
              <span className="text-[10px] font-black leading-none">GC58</span>
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-none">GC58</h1>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter mt-1">Civil Engineering</p>
              <p className="text-[8px] text-indigo-600 font-medium uppercase tracking-widest mt-0.5">Steel Optimization</p>
            </div>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => { setActiveTab('input'); setIsSidebarOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer",
              activeTab === 'input' ? "bg-indigo-50 text-indigo-600 font-medium" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Plus size={20} />
            <span>{t.tabInput}</span>
          </button>
          <button 
            onClick={() => { setActiveTab('results'); setIsSidebarOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer",
              activeTab === 'results' ? "bg-indigo-50 text-indigo-600 font-medium" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <BarChart3 size={20} />
            <span>{t.tabResults}</span>
          </button>
          <button 
            onClick={() => { setActiveTab('boq'); setIsSidebarOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer",
              activeTab === 'boq' ? "bg-indigo-50 text-indigo-600 font-medium" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <FileText size={20} />
            <span>{t.tabBOQ}</span>
          </button>
          <button 
            onClick={() => { setActiveTab('devis'); setIsSidebarOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer",
              activeTab === 'devis' ? "bg-indigo-50 text-indigo-600 font-medium" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Euro size={20} />
            <span>{t.tabDevis}</span>
          </button>
          <button 
            onClick={() => { setActiveTab('cutting'); setIsSidebarOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer",
              activeTab === 'cutting' ? "bg-indigo-50 text-indigo-600 font-medium" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Layers size={20} />
            <span>{t.tabCutting}</span>
          </button>
          <button 
            onClick={() => { setActiveTab('company'); setIsSidebarOpen(false); }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer",
              activeTab === 'company' ? "bg-indigo-50 text-indigo-600 font-medium" : "text-slate-500 hover:bg-slate-50"
            )}
          >
            <Building2 size={20} />
            <span>{t.tabCompany}</span>
          </button>
          <button 
            onClick={() => { triggerWelcome(); setIsSidebarOpen(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-slate-50 transition-all duration-200 cursor-pointer"
          >
            <Info size={20} className="text-amber-500" />
            <span>{isRtl ? "حول البرنامج" : "À propos"}</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2 text-slate-400">
              <Settings size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Configuration</span>
            </div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Longueur Barre (m)</label>
            <select 
              value={standardBarLength}
              onChange={(e) => setStandardBarLength(Number(e.target.value))}
              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {STANDARD_BAR_LENGTHS.map(l => (
                <option key={l} value={l}>{l}m</option>
              ))}
            </select>
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 space-y-2">
          {showInstallButton && (
            <button 
              onClick={handleInstallClick}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-bold hover:bg-emerald-100 transition-all border border-emerald-100 mb-2"
            >
              <Download size={18} />
              {isRtl ? "تثبيت البرنامج" : "Installer l'App"}
            </button>
          )}
          <button 
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 text-slate-500 rounded-2xl font-bold hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <X size={18} />
            {t.logout}
          </button>
          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <FileText size={18} />
            )}
            {isExporting ? (isRtl ? "جاري التحميل..." : "Chargement...") : (isRtl ? "تحميل التقرير" : "Télécharger Rapport")}
          </button>
          <button 
            onClick={handleExportCuttingPlansPDF}
            disabled={isExporting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-100 disabled:opacity-50"
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Layers size={18} />
            )}
            {isExporting ? (isRtl ? "جاري التحميل..." : "Chargement...") : (isRtl ? "مخططات التقطيع" : "Plans de Débitage")}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Welcome Notification (Small, slides from left) */}
        <AnimatePresence>
          {showWelcome && (
            <motion.div 
              initial={{ x: -400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -400, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 150 }}
              className="fixed bottom-6 left-6 z-[100] max-w-sm w-full"
            >
              <div className="bg-white rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-100 relative overflow-hidden flex gap-4 items-center">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600" />
                
                <div className="flex-shrink-0 w-12 h-12 bg-slate-900 rounded-2xl flex flex-col items-center justify-center text-white shadow-lg border border-slate-700">
                  <HardHat size={20} className="text-amber-400" />
                  <span className="text-[6px] font-black leading-none tracking-tighter text-amber-400/50">GC58</span>
                </div>

                <div className="flex-1 text-left">
                  <h3 className="text-sm font-black text-slate-900 mb-1">
                    {t.welcomeTitle}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {t.welcomeMessage}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                      {t.developedBy}
                    </span>
                    <button 
                      onClick={() => setShowWelcome(false)}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      {isRtl ? "إغلاق" : "Fermer"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-8">
          <header className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-4 mb-6 sm:mb-8">
          <div className="flex items-center justify-between lg:block">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-4">
              <button 
                onClick={logout}
                className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all shadow-sm"
              >
                <LogOut size={16} />
                {t.logout}
              </button>
              <div>
                <input 
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="text-2xl lg:text-3xl font-bold text-slate-900 bg-transparent border-none focus:ring-0 p-0 w-full"
                  placeholder={isRtl ? "اسم المشروع" : "Nom du Projet"}
                />
                <p className="text-slate-500 mt-1 text-sm lg:text-base">
                  {activeTab === 'input' && t.tabInputDesc}
                  {activeTab === 'results' && t.tabResultsDesc}
                  {activeTab === 'boq' && t.tabBOQDesc}
                  {activeTab === 'devis' && t.tabDevisDesc}
                  {activeTab === 'cutting' && t.tabCuttingDesc}
                </p>
              </div>
            </div>
            <div className="lg:hidden w-10"></div> {/* Spacer for symmetry if needed */}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex bg-slate-100 p-1 rounded-xl mr-2">
              {(['fr', 'ar', 'en'] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={cn(
                    "px-3 py-1 text-[10px] font-bold rounded-lg transition-all uppercase",
                    language === lang 
                      ? "bg-white text-indigo-600 shadow-sm" 
                      : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {lang}
                </button>
              ))}
            </div>
            {activeTab === 'input' && (
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.steelGrade}</span>
                <select 
                  value={steelGrade}
                  onChange={(e) => setSteelGrade(e.target.value as SteelGrade)}
                  className="bg-transparent text-sm font-bold text-indigo-600 outline-none cursor-pointer"
                >
                  <option value={SteelGrade.E24}>E24</option>
                  <option value={SteelGrade.E28}>E28</option>
                </select>
              </div>
            )}
            {activeTab === 'input' && (
              <div className="flex flex-col items-end gap-2">
                <div {...getRootProps()} className="cursor-pointer">
                  <input {...getInputProps()} />
                  <button 
                    disabled={isUploading}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                      importSuccess ? "bg-emerald-500 text-white shadow-emerald-200" : "bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-700",
                      isDragActive && "ring-2 ring-indigo-400 ring-offset-2"
                    )}
                  >
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : (importSuccess ? <Info size={16} /> : <Upload size={16} />)}
                    {isUploading ? t.analyzingInProgress : (importSuccess ? t.importSuccess : t.importIAButton)}
                  </button>
                </div>
                {uploadError && (
                  <div className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded-lg border border-red-100">
                    {uploadError}
                  </div>
                )}
              </div>
            )}
            
            <div className="relative">
              <button 
                onClick={() => setShowClearConfirm(!showClearConfirm)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-all cursor-pointer",
                  showClearConfirm 
                    ? "bg-red-600 border-red-600 text-white shadow-lg shadow-red-200" 
                    : "bg-white border-red-100 text-red-500 hover:bg-red-50"
                )}
              >
                <RefreshCcw size={16} className={cn(showClearConfirm && "animate-spin")} />
                {showClearConfirm ? (isRtl ? "تأكيد المسح؟" : "Confirmer ?") : t.clearProject}
              </button>
              
              {showClearConfirm && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-full mt-2 right-0 z-50 bg-white border border-slate-200 p-2 rounded-xl shadow-xl flex gap-2"
                >
                  <button 
                    onClick={handleClearProject}
                    className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    {isRtl ? "نعم، امسح" : "Oui, effacer"}
                  </button>
                  <button 
                    onClick={() => setShowClearConfirm(false)}
                    className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    {isRtl ? "إلغاء" : "Annuler"}
                  </button>
                </motion.div>
              )}
            </div>
            <button 
              onClick={handleExportPDF}
              disabled={isExporting}
              className={cn(
                "flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all cursor-pointer",
                isExporting && "opacity-50 cursor-not-allowed"
              )}
            >
              {isExporting ? (
                <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
              ) : (
                <Download size={16} />
              )}
              {isExporting ? (isRtl ? "جاري التصدير..." : "Exportation...") : t.exportPDF}
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'input' && (
            <motion.div 
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className={cn("px-3 sm:px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.tableMark}</th>
                      <th className={cn("px-3 sm:px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.tableLabel}</th>
                      <th className={cn("px-3 sm:px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.tableType}</th>
                      <th className={cn("px-3 sm:px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.tableDim}</th>
                      <th className={cn("px-3 sm:px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.tableQty}</th>
                      <th className={cn("px-3 sm:px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.tableNetWeight}</th>
                      <th className="px-3 sm:px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const profile = item.type === ItemType.PROFILE ? STEEL_PROFILES.find(p => p.id === item.profileId) : null;
                      let weight = 0;
                      if (item.type === ItemType.PROFILE) {
                        const linearMass = (steelGrade === SteelGrade.E28 && profile?.linearMassE28) 
                          ? profile.linearMassE28 
                          : (profile?.linearMass || item.customLinearMass || 0);
                        weight = linearMass * item.length * item.quantity;
                      } else if (item.type === ItemType.PLATE) {
                        weight = (item.length * (item.width || 0) * ((item.thickness || 0) / 1000) * 7850) * item.quantity;
                      }

                      return (
                        <tr key={item.id} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 sm:px-6 py-4">
                            <input 
                              type="text" 
                              placeholder="P1"
                              value={item.mark || ''}
                              onChange={(e) => updateItem(item.id, { mark: e.target.value })}
                              className="bg-transparent border-none focus:ring-0 w-full font-mono text-xs text-slate-500 outline-none"
                            />
                          </td>
                          <td className="px-3 sm:px-6 py-4">
                            <div className="flex items-center gap-2">
                              <input 
                                type="text" 
                                value={item.label}
                                onChange={(e) => updateItem(item.id, { label: e.target.value })}
                                className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5 w-full font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                placeholder={t.tableLabel}
                              />
                              {item.isAiParsed && (
                                <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-500 text-[8px] font-bold rounded-md uppercase tracking-wider">AI</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4">
                            <div className="flex flex-col gap-1">
                              <select 
                                value={item.type}
                                onChange={(e) => updateItem(item.id, { type: e.target.value as ItemType, profileId: e.target.value === ItemType.PROFILE ? STEEL_PROFILES[0].id : undefined })}
                                className="bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-400 uppercase outline-none"
                              >
                                <option value={ItemType.PROFILE}>{t.profile}</option>
                                <option value={ItemType.PLATE}>{t.plate}</option>
                              </select>
                              {item.type === ItemType.PROFILE ? (
                                <div className="flex flex-col gap-1">
                                  <select 
                                    value={item.profileId || 'custom'}
                                    onChange={(e) => {
                                      if (e.target.value === 'custom') {
                                        updateItem(item.id, { profileId: undefined, customProfileName: t.customProfile, customLinearMass: 1.0 });
                                      } else {
                                        updateItem(item.id, { profileId: e.target.value, customProfileName: undefined, customLinearMass: undefined });
                                      }
                                    }}
                                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                  >
                                    {STEEL_PROFILES.map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                    <option value="custom">-- {t.custom} --</option>
                                  </select>
                                  {!item.profileId && (
                                    <div className="flex flex-col gap-1 mt-1">
                                      <input 
                                        type="text"
                                        placeholder={t.enterProfileName}
                                        value={item.customProfileName}
                                        onChange={(e) => updateItem(item.id, { customProfileName: e.target.value })}
                                        className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                                      />
                                      <div className="flex items-center gap-1">
                                        <span className="text-[8px] text-slate-400 uppercase font-bold whitespace-nowrap">{t.linearMassLabel}</span>
                                        <input 
                                          type="number"
                                          step="0.01"
                                          value={item.customLinearMass}
                                          onChange={(e) => updateItem(item.id, { customLinearMass: Number(e.target.value) })}
                                          className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs w-16 outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-xs font-bold text-indigo-600 px-2">{t.steelPlate}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col">
                                <span className="text-[8px] text-slate-400 uppercase font-bold">Long.</span>
                                <input 
                                  type="number" 
                                  step="0.01"
                                  value={item.length}
                                  onChange={(e) => updateItem(item.id, { length: Number(e.target.value) })}
                                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm w-20 outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                              {item.type === ItemType.PLATE && (
                                <>
                                  <div className="flex flex-col">
                                    <span className="text-[8px] text-slate-400 uppercase font-bold">Larg.</span>
                                    <input 
                                      type="number" 
                                      step="0.01"
                                      value={item.width}
                                      onChange={(e) => updateItem(item.id, { width: Number(e.target.value) })}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm w-20 outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[8px] text-slate-400 uppercase font-bold">Ep. (mm)</span>
                                    <input 
                                      type="number" 
                                      value={item.thickness}
                                      onChange={(e) => updateItem(item.id, { thickness: Number(e.target.value) })}
                                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm w-16 outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-3 sm:px-6 py-4">
                            <input 
                              type="number" 
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })}
                              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm w-16 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-3 sm:px-6 py-4 font-mono text-sm text-slate-500">
                            {weight.toFixed(2)}
                          </td>
                          <td className="px-3 sm:px-6 py-4 text-right">
                            <button 
                              onClick={() => removeItem(item.id)}
                              className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer group/del"
                              title="Supprimer"
                            >
                              <Trash2 size={18} className="group-hover/del:scale-110 transition-transform" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center gap-6 text-slate-400">
                            <div className="flex gap-4">
                              <div {...getRootProps()} className="group cursor-pointer">
                                <input {...getInputProps()} />
                                <div className={cn(
                                  "w-64 h-40 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-3 transition-all group-hover:border-indigo-300 group-hover:bg-indigo-50/50",
                                  isDragActive && "border-indigo-400 bg-indigo-50"
                                )}>
                                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-500 group-hover:bg-white transition-colors">
                                    <FileUp size={24} />
                                  </div>
                                  <div className="text-center">
                                    <p className="text-sm font-bold text-slate-600">Importer par IA</p>
                                    <p className="text-[10px] text-slate-400 mt-1">PDF ou Image (Liste débitage)</p>
                                  </div>
                                </div>
                              </div>
                              <div 
                                onClick={() => addItem(ItemType.PROFILE)}
                                className="w-64 h-40 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-3 transition-all hover:border-indigo-300 hover:bg-indigo-50/50 cursor-pointer group"
                              >
                                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-500 group-hover:bg-white transition-colors">
                                  <Plus size={24} />
                                </div>
                                <div className="text-center">
                                  <p className="text-sm font-bold text-slate-600">Saisie Profilé</p>
                                  <p className="text-[10px] text-slate-400 mt-1">Ajouter une barre</p>
                                </div>
                              </div>
                              <div 
                                onClick={() => addItem(ItemType.PLATE)}
                                className="w-64 h-40 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-3 transition-all hover:border-indigo-300 hover:bg-indigo-50/50 cursor-pointer group"
                              >
                                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-500 group-hover:bg-white transition-colors">
                                  <Layers size={24} />
                                </div>
                                <div className="text-center">
                                  <p className="text-sm font-bold text-slate-600">Saisie Platine</p>
                                  <p className="text-[10px] text-slate-400 mt-1">Ajouter une tôle</p>
                                </div>
                              </div>
                            </div>
                            {isUploading && (
                              <div className="flex items-center gap-2 text-indigo-600 font-medium animate-pulse">
                                <Loader2 size={16} className="animate-spin" />
                                <span>L'IA analyse votre document...</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {items.length > 0 && (
                <div className="flex gap-4">
                  <button 
                    onClick={() => addItem(ItemType.PROFILE)}
                    className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm cursor-pointer"
                  >
                    <Plus size={18} />
                    Ajouter Profilé
                  </button>
                  <button 
                    onClick={() => addItem(ItemType.PLATE)}
                    className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-all shadow-sm cursor-pointer"
                  >
                    <Layers size={18} />
                    Ajouter Platine
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'company' && (
            <motion.div 
              key="company"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                    <Building2 className="text-indigo-600" />
                    {t.tabCompany}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">{t.tabCompanyDesc}</p>
                </div>
                
                <div className="p-8 space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">{t.companyName}</label>
                        <input 
                          type="text"
                          value={companyInfo.name}
                          onChange={(e) => setCompanyInfo({ ...companyInfo, name: e.target.value })}
                          placeholder="Ex: Steel Pro Solutions"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">{t.companyDesc}</label>
                        <input 
                          type="text"
                          value={companyInfo.description}
                          onChange={(e) => setCompanyInfo({ ...companyInfo, description: e.target.value })}
                          placeholder="Ex: Experts en charpente métallique"
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">{t.companyAddress}</label>
                        <textarea 
                          value={companyInfo.address}
                          onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                          rows={3}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">{t.companyLogo}</label>
                        <div className="flex flex-col items-center gap-4">
                          <div className="w-full aspect-video bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center overflow-hidden relative group">
                            {companyInfo.logo ? (
                              <>
                                <img src={companyInfo.logo} alt="Logo" className="w-full h-full object-contain p-4" />
                                <button 
                                  onClick={() => setCompanyInfo({ ...companyInfo, logo: '' })}
                                  className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : (
                              <label className="flex flex-col items-center gap-2 cursor-pointer text-slate-400 hover:text-indigo-500 transition-colors">
                                <ImageIcon size={40} />
                                <span className="text-xs font-bold uppercase tracking-wider">{t.logoUpload}</span>
                                <input 
                                  type="file" 
                                  accept="image/*" 
                                  className="hidden" 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onloadend = () => {
                                        setCompanyInfo({ ...companyInfo, logo: reader.result as string });
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">{t.companyPhone}</label>
                          <input 
                            type="text"
                            value={companyInfo.phone}
                            onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">{t.companyEmail}</label>
                          <input 
                            type="email"
                            value={companyInfo.email}
                            onChange={(e) => setCompanyInfo({ ...companyInfo, email: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          {activeTab === 'results' && (
            <motion.div 
              key="results"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                        <Scale size={20} />
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.netWeight}</span>
                    </div>
                    <div className="text-3xl font-bold text-slate-900">{results.netWeight.toFixed(2)} <span className="text-sm font-normal text-slate-400">kg</span></div>
                    <p className="text-xs text-slate-400 mt-2">{t.theoreticalWeight}</p>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Layers size={20} />
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.grossWeight}</span>
                    </div>
                    <div className="text-3xl font-bold text-slate-900">{results.grossWeight.toFixed(2)} <span className="text-sm font-normal text-slate-400">kg</span></div>
                    <p className="text-xs text-slate-400 mt-2">{t.totalWithBars}</p>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                        <Trash2 size={20} />
                      </div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.scrap}</span>
                    </div>
                    <div className="text-3xl font-bold text-red-600">{results.scrapWeight.toFixed(2)} <span className="text-sm font-normal text-slate-400">kg</span></div>
                    <p className="text-xs text-slate-400 mt-2">{results.scrapPercentage.toFixed(1)}% {t.scrapLoss}</p>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <BarChart3 size={20} className="text-indigo-600" />
                    {t.detailByType}
                  </h3>
                  <div className="space-y-6">
                    {/* Profiles Summary */}
                    {results.barPlans.map(plan => {
                      const profileNet = plan.netWeight;
                      
                      return (
                        <div key={`summary-bar-${plan.profileId}`} className="group">
                          <div className="flex justify-between items-end mb-2">
                            <div>
                              <span className="text-sm font-bold text-slate-900">{plan.profileName}</span>
                              <span className="text-xs text-slate-400 ml-2">{items.filter(i => (i.profileId || i.customProfileName) === plan.profileId).length} types</span>
                            </div>
                            <span className="text-sm font-mono text-slate-500">{profileNet.toFixed(2)} kg</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${results.netWeight > 0 ? (profileNet / results.netWeight) * 100 : 0}%` }}
                              className="h-full bg-indigo-500 rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                    {/* Plates Summary */}
                    {results.platePlans.map(plan => {
                      const plateNet = plan.netWeight;
                      
                      return (
                        <div key={`summary-plate-${plan.thickness}`} className="group">
                          <div className="flex justify-between items-end mb-2">
                            <div>
                              <span className="text-sm font-bold text-slate-900">Platines Ep. {plan.thickness}mm</span>
                              <span className="text-xs text-slate-400 ml-2">{items.filter(i => i.type === ItemType.PLATE && i.thickness === plan.thickness).length} types</span>
                            </div>
                            <span className="text-sm font-mono text-slate-500">{plateNet.toFixed(2)} kg</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${results.netWeight > 0 ? (plateNet / results.netWeight) * 100 : 0}%` }}
                              className="h-full bg-emerald-500 rounded-full"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Gross Bars Table */}
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <BarChart3 size={20} className="text-indigo-600" />
                    {t.grossBarsTable}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className={cn("py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.tableType}</th>
                          <th className={cn("py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.length} (m)</th>
                          <th className={cn("py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-left" : "text-right")}>{t.tableQty}</th>
                          <th className={cn("py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-left" : "text-right")}>{t.weight} (kg)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {results.barPlans.map(plan => (
                          <tr key={`gross-${plan.profileId}`} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 text-sm font-bold text-slate-900">{plan.profileName}</td>
                            <td className="py-3 text-sm text-slate-500">{standardBarLength}</td>
                            <td className={cn("py-3 text-sm text-slate-900 font-mono", isRtl ? "text-left" : "text-right")}>{plan.bars.length}</td>
                            <td className={cn("py-3 text-sm text-slate-900 font-mono", isRtl ? "text-left" : "text-right")}>{plan.grossWeight.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Net Pieces Table */}
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <Layers size={20} className="text-indigo-600" />
                    {t.netBarsTable}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className={cn("py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.tableMark}</th>
                          <th className={cn("py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.tableType}</th>
                          <th className={cn("py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.length} (m)</th>
                          <th className={cn("py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-left" : "text-right")}>{t.tableQty}</th>
                          <th className={cn("py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-left" : "text-right")}>{t.weight} (kg)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {items.filter(i => i.type === ItemType.PROFILE).map(item => {
                          const profile = STEEL_PROFILES.find(p => p.id === item.profileId);
                          const linearMass = (steelGrade === SteelGrade.E28 && profile?.linearMassE28) 
                            ? profile.linearMassE28 
                            : (profile?.linearMass || item.customLinearMass || 0);
                          const weight = item.length * item.quantity * linearMass;
                          return (
                            <tr key={`net-${item.id}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 text-sm text-slate-500">{item.mark || '-'}</td>
                              <td className="py-3 text-sm font-bold text-slate-900">{profile?.name || item.customProfileName}</td>
                              <td className="py-3 text-sm text-slate-500">{item.length.toFixed(2)}</td>
                              <td className={cn("py-3 text-sm text-slate-900 font-mono", isRtl ? "text-left" : "text-right")}>{item.quantity}</td>
                              <td className={cn("py-3 text-sm text-slate-900 font-mono", isRtl ? "text-left" : "text-right")}>{weight.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {strategyComparison && strategyComparison.saving > 0 && (
                  <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-emerald-500 text-white rounded-lg">
                        <Calculator size={18} />
                      </div>
                      <h3 className="font-bold text-emerald-900">{t.bestStrategy}</h3>
                    </div>
                    <p className="text-sm text-emerald-700">
                      {t.scrapSaved}: <span className="font-bold">{strategyComparison.saving.toFixed(2)} kg</span> ({strategyComparison.savingPercent.toFixed(1)}%) {t.comparedTo} {strategyComparison.worst.strategy === OptimizationStrategy.FIRST_FIT ? t.firstFit : strategyComparison.worst.strategy === OptimizationStrategy.BEST_FIT ? t.bestFit : t.nextFit}.
                    </p>
                    {optimizationStrategy !== strategyComparison.best.strategy && (
                      <button 
                        onClick={() => setOptimizationStrategy(strategyComparison.best.strategy)}
                        className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2"
                      >
                        <Check size={14} />
                        {t.applyBestStrategy}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div id="weight-chart-container" className="bg-white p-4 sm:p-8 rounded-3xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{isRtl ? "توزيع الوزن" : "Répartition du Poids"}</h3>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart id="weight-chart">
                        <Pie
                          data={chartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div id="distribution-chart-container" className="bg-white p-4 sm:p-8 rounded-3xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{isRtl ? "توزيع المقاطع" : "Répartition par Profil"}</h3>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={profileDistributionData} id="distribution-chart">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 10 }}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 10 }}
                        />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        />
                        <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div id="efficiency-chart-container" className="bg-white p-4 sm:p-8 rounded-3xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{isRtl ? "كفاءة التقطيع لكل مقطع" : "Efficacité par Profil"}</h3>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={profileEfficiencyData} layout="vertical" id="efficiency-chart">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 10 }}
                          width={80}
                        />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                          formatter={(value: any) => [`${Number(value).toFixed(1)}%`, 'Efficacité']}
                        />
                        <Bar dataKey="efficiency" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div id="stacked-chart-container" className="bg-white p-4 sm:p-8 rounded-3xl border border-slate-200 shadow-sm h-[400px] flex flex-col">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{isRtl ? "الوزن الصافي مقابل الخردة" : "Net vs Chutes par Profil"}</h3>
                  <div className="flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={profileEfficiencyData} id="stacked-chart">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 10 }}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 10 }}
                        />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        />
                        <Legend verticalAlign="top" align="right" iconType="circle" />
                        <Bar dataKey="net" name={isRtl ? "صافي" : "Net"} stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="scrap" name={isRtl ? "خردة" : "Chutes"} stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-indigo-600 p-8 rounded-3xl text-white shadow-xl shadow-indigo-200 relative overflow-hidden">
                  <div className="relative z-10">
                    <h3 className="text-lg font-bold mb-2">{t.supplyNeed}</h3>
                    <p className="text-indigo-100 text-sm mb-6">{t.basedOnBars} {standardBarLength}m.</p>
                    <div className="flex gap-8">
                      <div>
                        <div className="text-4xl font-bold mb-1">{results.totalStandardBars}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-200">{t.buyNeeded}</div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute -right-4 -bottom-4 opacity-10">
                    <Calculator size={160} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'boq' && (
            <motion.div 
              key="boq"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 lg:p-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{t.extras}</h3>
                    <p className="text-sm text-slate-400">Calculés sur le poids brut total</p>
                  </div>
                  <div className="flex flex-wrap gap-4 items-center">
                    <button 
                      onClick={handleExportPDF}
                      disabled={isExporting}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                    >
                      <FileText size={18} />
                      {isRtl ? "تحميل التقرير الكامل" : "Télécharger le Rapport Complet"}
                    </button>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-all",
                        includeWelding ? "bg-indigo-600 border-indigo-600" : "border-slate-300 group-hover:border-indigo-400"
                      )}>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={includeWelding} 
                          onChange={(e) => setIncludeWelding(e.target.checked)} 
                        />
                        {includeWelding && <Check size={14} className="text-white" />}
                      </div>
                      <span className="text-sm font-medium text-slate-700">{t.welding}</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-all",
                        includeExtraPlates ? "bg-indigo-600 border-indigo-600" : "border-slate-300 group-hover:border-indigo-400"
                      )}>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={includeExtraPlates} 
                          onChange={(e) => setIncludeExtraPlates(e.target.checked)} 
                        />
                        {includeExtraPlates && <Check size={14} className="text-white" />}
                      </div>
                      <span className="text-sm font-medium text-slate-700">{t.extraPlates}</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-all",
                        includeBolts ? "bg-indigo-600 border-indigo-600" : "border-slate-300 group-hover:border-indigo-400"
                      )}>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={includeBolts} 
                          onChange={(e) => setIncludeBolts(e.target.checked)} 
                        />
                        {includeBolts && <Check size={14} className="text-white" />}
                      </div>
                      <span className="text-sm font-medium text-slate-700">{t.bolts}</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 sm:p-6 lg:p-8 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{t.boqTitle}</h3>
                    <p className="text-sm text-slate-400">{t.boqDesc}</p>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <Info size={14} />
                    Eurocode 3 Compliant
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                    <tr className="bg-slate-50/50">
                      <th className={cn("px-4 sm:px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.tableDesignation}</th>
                      <th className={cn("px-4 sm:px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-right" : "text-left")}>{t.tableUnit}</th>
                      <th className={cn("px-4 sm:px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-left" : "text-right")}>{t.tableQty}</th>
                      <th className={cn("px-4 sm:px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-left" : "text-right")}>{t.tableUnitPrice}</th>
                      <th className={cn("px-4 sm:px-8 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider", isRtl ? "text-left" : "text-right")}>{t.tableTotalWeight}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Profiles in BOQ */}
                    {results.barPlans.map(plan => (
                      <tr key={plan.profileId} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-4 sm:px-8 py-5">
                          <div className="font-bold text-slate-900">{plan.profileName}</div>
                          <div className="text-xs text-slate-400">{t.standardBars}</div>
                        </td>
                        <td className="px-4 sm:px-8 py-5 text-sm text-slate-500">{t.unit}</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-mono text-slate-900", isRtl ? "text-left" : "text-right")}>{plan.bars.length}</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-mono text-slate-500", isRtl ? "text-left" : "text-right")}>{plan.bars.length > 0 ? (plan.grossWeight / plan.bars.length).toFixed(2) : "0.00"}</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-bold text-slate-900", isRtl ? "text-left" : "text-right")}>{plan.grossWeight.toFixed(2)}</td>
                      </tr>
                    ))}
                    {/* Plates in BOQ */}
                    {results.platePlans.map(plan => {
                      const sheetSize = plan.sheets.length > 0 
                        ? `${plan.sheets[0].width}x${plan.sheets[0].length}m` 
                        : `${standardPlateSize.width}x${standardPlateSize.length}m`;

                      return (
                        <tr key={`boq-plate-${plan.thickness}`} className="hover:bg-slate-50/30 transition-colors">
                          <td className="px-4 sm:px-8 py-5">
                            <div className="font-bold text-slate-900">{t.plate} Ep. {plan.thickness}mm</div>
                            <div className="text-xs text-slate-400">{sheetSize}</div>
                          </td>
                          <td className="px-4 sm:px-8 py-5 text-sm text-slate-500">{t.unit}</td>
                          <td className={cn("px-4 sm:px-8 py-5 text-sm font-mono text-slate-900", isRtl ? "text-left" : "text-right")}>{plan.sheets.length}</td>
                          <td className={cn("px-4 sm:px-8 py-5 text-sm font-mono text-slate-500", isRtl ? "text-left" : "text-right")}>{plan.sheets.length > 0 ? (plan.grossWeight / plan.sheets.length).toFixed(2) : "0.00"}</td>
                          <td className={cn("px-4 sm:px-8 py-5 text-sm font-bold text-slate-900", isRtl ? "text-left" : "text-right")}>{plan.grossWeight.toFixed(2)}</td>
                        </tr>
                      );
                    })}

                    {/* Extras */}
                    {includeWelding && (
                      <tr className="bg-indigo-50/30">
                        <td className="px-4 sm:px-8 py-5 font-bold text-slate-900">{t.welding}</td>
                        <td className="px-4 sm:px-8 py-5 text-sm text-slate-500">%</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-mono text-slate-900", isRtl ? "text-left" : "text-right")}>5%</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-mono text-slate-500", isRtl ? "text-left" : "text-right")}>-</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-bold text-slate-900", isRtl ? "text-left" : "text-right")}>{(results.grossWeight * 0.05).toFixed(2)}</td>
                      </tr>
                    )}
                    {includeExtraPlates && (
                      <tr className="bg-indigo-50/30">
                        <td className="px-4 sm:px-8 py-5 font-bold text-slate-900">{t.extraPlates}</td>
                        <td className="px-4 sm:px-8 py-5 text-sm text-slate-500">%</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-mono text-slate-900", isRtl ? "text-left" : "text-right")}>5%</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-mono text-slate-500", isRtl ? "text-left" : "text-right")}>-</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-bold text-slate-900", isRtl ? "text-left" : "text-right")}>{(results.grossWeight * 0.05).toFixed(2)}</td>
                      </tr>
                    )}
                    {includeBolts && (
                      <tr className="bg-indigo-50/30">
                        <td className="px-4 sm:px-8 py-5 font-bold text-slate-900">{t.bolts}</td>
                        <td className="px-4 sm:px-8 py-5 text-sm text-slate-500">%</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-mono text-slate-900", isRtl ? "text-left" : "text-right")}>2%</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-mono text-slate-500", isRtl ? "text-left" : "text-right")}>-</td>
                        <td className={cn("px-4 sm:px-8 py-5 text-sm font-bold text-slate-900", isRtl ? "text-left" : "text-right")}>{(results.grossWeight * 0.02).toFixed(2)}</td>
                      </tr>
                    )}

                    <tr className="bg-slate-50/80 font-bold">
                      <td colSpan={4} className={cn("px-4 sm:px-8 py-6 text-slate-900 uppercase tracking-wider text-xs", isRtl ? "text-left" : "text-right")}>
                        {(includeWelding || includeExtraPlates || includeBolts) ? t.totalWithExtras : t.totalGrossWeightBOQ}
                      </td>
                      <td className={cn("px-4 sm:px-8 py-6 text-indigo-600 text-lg", isRtl ? "text-left" : "text-right")}>
                        {(results.grossWeight + 
                          (includeWelding ? results.grossWeight * 0.05 : 0) + 
                          (includeExtraPlates ? results.grossWeight * 0.05 : 0) + 
                          (includeBolts ? results.grossWeight * 0.02 : 0)
                        ).toFixed(2)} kg
                      </td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'devis' && (
            <motion.div 
              key="devis"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 lg:p-8 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-900">{t.devisTitle}</h3>
                    <button 
                      onClick={handleExportPDF}
                      disabled={isExporting}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-100 disabled:opacity-50"
                    >
                      <Download size={14} />
                      {isRtl ? "تصدير الفاتورة" : "Exporter Facture"}
                    </button>
                  </div>
                  <div className="p-6 lg:p-8 space-y-6">
                    <div className="overflow-x-auto">
                      <div className="min-w-full sm:min-w-[500px] space-y-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 border-b border-slate-50 gap-2">
                          <div className="text-slate-600">{t.devisSupply}</div>
                          <div className={cn("flex flex-col", isRtl ? "sm:items-start" : "sm:items-end")}>
                            <div className="font-mono font-bold text-slate-900">
                              {totalWeightWithExtras.toFixed(2)} kg × {devisConfig.unitPricePerKg.toFixed(2)} {devisConfig.currency}/kg
                            </div>
                            <div className="text-lg font-bold text-slate-900">
                              {(totalWeightWithExtras * devisConfig.unitPricePerKg).toFixed(2)} {devisConfig.currency}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-between items-center py-4 border-b border-slate-50">
                          <div className="text-slate-600">{t.totalHT}</div>
                          <div className="text-xl font-bold text-slate-900">
                            {(totalWeightWithExtras * devisConfig.unitPricePerKg).toFixed(2)} {devisConfig.currency}
                          </div>
                        </div>
                        <div className="flex justify-between items-center py-4 border-b border-slate-50">
                          <div className="text-slate-600">{t.taxRate} ({devisConfig.taxRate}%)</div>
                          <div className="text-xl font-bold text-slate-900">
                            {(totalWeightWithExtras * devisConfig.unitPricePerKg * (devisConfig.taxRate / 100)).toFixed(2)} {devisConfig.currency}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-6 gap-2">
                          <div className="text-lg font-bold text-indigo-600 uppercase tracking-wider">{t.totalTTC}</div>
                          <div className="text-3xl lg:text-4xl font-black text-indigo-600">
                            {(totalWeightWithExtras * devisConfig.unitPricePerKg * (1 + devisConfig.taxRate / 100)).toFixed(2)} {devisConfig.currency}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                    <Settings size={20} className="text-slate-400" />
                    {t.priceSettings}
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t.unitPrice}</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          step="0.01"
                          value={devisConfig.unitPricePerKg}
                          onChange={(e) => setDevisConfig({ ...devisConfig, unitPricePerKg: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{devisConfig.currency}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t.vatRate}</label>
                      <input 
                        type="number" 
                        value={devisConfig.taxRate}
                        onChange={(e) => setDevisConfig({ ...devisConfig, taxRate: Number(e.target.value) })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{t.currencyLabel}</label>
                      <select 
                        value={devisConfig.currency}
                        onChange={(e) => setDevisConfig({ ...devisConfig, currency: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="DZD">Dinar Algérien (DZD)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 p-8 rounded-3xl text-white">
                  <div className="flex items-center gap-3 mb-4 text-slate-400">
                    <Info size={18} />
                    <span className="text-xs font-bold uppercase tracking-wider">{t.technicalNote}</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {t.devisNote}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'cutting' && (
            <motion.div 
              key="cutting"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Header with Optimization Button */}
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-indigo-600 p-6 lg:p-8 rounded-3xl text-white shadow-lg shadow-indigo-200">
                <div className="flex-1 w-full">
                  <h3 className="text-xl font-bold">{t.smartOptimization}</h3>
                  <p className="text-indigo-100 text-sm mt-1">{t.nestingAlgo}</p>
                  
                  <div className="mt-6 flex flex-wrap gap-4">
                    <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                      <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">{t.standardBarLength}</span>
                      <select 
                        value={standardBarLength}
                        onChange={(e) => setStandardBarLength(Number(e.target.value))}
                        className="bg-indigo-700/50 p-2 rounded-xl border border-indigo-400/30 text-xs font-bold text-white outline-none"
                      >
                        {STANDARD_BAR_LENGTHS.map(l => (
                          <option key={l} value={l} className="text-slate-900">{l}m</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                      <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">{t.standardPlateSize}</span>
                      <select 
                        value={standardPlateSize.id}
                        onChange={(e) => {
                          const size = STANDARD_PLATE_SIZES.find(s => s.id === e.target.value);
                          if (size) setStandardPlateSize(size);
                        }}
                        className="bg-indigo-700/50 p-2 rounded-xl border border-indigo-400/30 text-xs font-bold text-white outline-none"
                      >
                        {STANDARD_PLATE_SIZES.map(s => (
                          <option key={s.id} value={s.id} className="text-slate-900">{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5 w-full sm:w-auto">
                      <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">{t.optimizationStrategy}</span>
                      <div className="flex flex-wrap bg-indigo-700/50 p-1 rounded-xl border border-indigo-400/30">
                        <button 
                          onClick={() => setOptimizationStrategy(OptimizationStrategy.FIRST_FIT)}
                          className={cn(
                            "flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                            optimizationStrategy === OptimizationStrategy.FIRST_FIT ? "bg-white text-indigo-600 shadow-sm" : "text-indigo-100 hover:bg-indigo-600/50"
                          )}
                        >
                          {t.firstFit}
                        </button>
                        <button 
                          onClick={() => setOptimizationStrategy(OptimizationStrategy.BEST_FIT)}
                          className={cn(
                            "flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                            optimizationStrategy === OptimizationStrategy.BEST_FIT ? "bg-white text-indigo-600 shadow-sm" : "text-indigo-100 hover:bg-indigo-600/50"
                          )}
                        >
                          {t.bestFit}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    setIsUploading(true);
                    setTimeout(() => setIsUploading(false), 800);
                  }}
                  className="w-full lg:w-auto px-8 py-4 bg-white text-indigo-600 rounded-2xl font-bold text-sm hover:bg-indigo-50 transition-all shadow-md flex items-center justify-center gap-3 cursor-pointer group"
                >
                  <Settings size={20} className="group-hover:rotate-180 transition-transform duration-500" />
                  {t.launchOptimization}
                </button>
              </div>

              {/* Summary by Type */}
              <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-900">{t.summaryByType}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">{t.tableType}</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">{t.totalWeight} (kg)</th>
                        <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider text-right">{t.totalBars} / {t.plates}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results.barPlans.map(plan => (
                        <tr key={plan.profileId} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-700">{plan.profileName}</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-900">{plan.grossWeight.toFixed(2)}</td>
                          <td className="px-6 py-4 text-right text-slate-500">{plan.bars.length}</td>
                        </tr>
                      ))}
                      {results.platePlans.map(plan => (
                        <tr key={plan.thickness} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-700">{t.plate} Ep. {plan.thickness}mm</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-900">{plan.grossWeight.toFixed(2)}</td>
                          <td className="px-6 py-4 text-right text-slate-500">{plan.sheets.length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Bar Cutting Plans */}
              <section>
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <BarChart3 size={24} className="text-indigo-600" />
                  {t.profileCutting}
                </h3>
                <div className="space-y-8">
                  {results.barPlans.map((plan) => (
                    <div key={plan.profileId} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h4 className="font-bold text-slate-900">{plan.profileName}</h4>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{plan.bars.length} Barres de {standardBarLength}m</span>
                      </div>
                      <div className="p-6 space-y-6">
                        {plan.bars.map((bar, idx) => (
                          <div key={bar.id} className="space-y-2">
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <span>Barre #{idx + 1}</span>
                              <span>Utilisé: {bar.usedLength.toFixed(2)}m | Chute: {bar.scrap.toFixed(2)}m</span>
                            </div>
                            <div className="h-8 bg-slate-100 rounded-lg flex overflow-hidden border border-slate-200">
                              {bar.cuts.map((cut, cIdx) => (
                                <div 
                                  key={`${bar.id}-cut-${cIdx}`}
                                  style={{ width: `${(cut.length / bar.totalLength) * 100}%` }}
                                  className="h-full border-r border-white/20 bg-indigo-500 flex items-center justify-center text-[9px] font-bold text-white overflow-hidden whitespace-nowrap px-1"
                                  title={`${cut.mark} - ${cut.label}: ${cut.length}m`}
                                >
                                  <span className="truncate">{cut.mark} {cut.label && `- ${cut.label}`} ({cut.length}m)</span>
                                </div>
                              ))}
                              <div 
                                style={{ width: `${(bar.scrap / bar.totalLength) * 100}%` }}
                                className="h-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white overflow-hidden px-1"
                                title={`Chute: ${bar.scrap.toFixed(2)}m`}
                              >
                                <span className="truncate">{bar.scrap > 0.05 ? `CHUTE: ${bar.scrap.toFixed(2)}m` : bar.scrap > 0.01 ? `${bar.scrap.toFixed(2)}m` : ''}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Plate Cutting Plans */}
              <section>
                <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Layers size={24} className="text-emerald-600" />
                  {t.plateCutting}
                </h3>
                <div className="space-y-8">
                  {results.platePlans.map((plan) => (
                    <div key={plan.thickness} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                        <h4 className="font-bold text-slate-900">{t.plate} Ep. {plan.thickness}mm</h4>
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{plan.sheets.length} {t.plates} {standardPlateSize.name}</span>
                      </div>
                      <div className="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {plan.sheets.map((sheet, idx) => (
                          <div key={sheet.id} className="space-y-4">
                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <div className="flex items-center gap-2">
                                <span>Tôle #{idx + 1}</span>
                                <button 
                                  onClick={() => setSelectedSheet({ ...sheet, thickness: plan.thickness })}
                                  className="p-1 hover:bg-slate-100 rounded-md text-indigo-600 transition-colors"
                                  title="Zoom"
                                >
                                  <ZoomIn size={14} />
                                </button>
                              </div>
                              <div className="flex flex-col items-end">
                                <span>Utilisé: {((sheet.usedArea / (sheet.width * sheet.length)) * 100).toFixed(1)}%</span>
                                <span>Chute: {(sheet.width * sheet.length - sheet.usedArea).toFixed(2)}m²</span>
                                {sheet.cuts.length > 0 && (
                                  <span className="text-indigo-500">
                                    Reste: {sheet.width.toFixed(2)}x{(sheet.length - Math.max(...sheet.cuts.map(c => c.y + c.l))).toFixed(2)}m
                                  </span>
                                )}
                              </div>
                            </div>
                            <div 
                              className="relative bg-red-500 border-2 border-slate-200 rounded-xl overflow-hidden shadow-inner mx-auto max-w-full"
                              style={{ 
                                width: '200px', 
                                height: `${(standardPlateSize.length / standardPlateSize.width) * 200}px`,
                                aspectRatio: `${standardPlateSize.width}/${standardPlateSize.length}`,
                                backgroundSize: '20px 20px',
                                backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.2) 1px, transparent 1px)'
                              }}
                            >
                              {sheet.cuts.map((cut, cIdx) => (
                                <div 
                                  key={`${sheet.id}-cut-${cIdx}`}
                                  className="absolute bg-emerald-500 border border-white/30 flex flex-col items-center justify-center text-[8px] font-bold text-white overflow-hidden p-1 shadow-sm"
                                  style={{
                                    left: `${(cut.x / sheet.width) * 100}%`,
                                    top: `${(cut.y / sheet.length) * 100}%`,
                                    width: `${(cut.w / sheet.width) * 100}%`,
                                    height: `${(cut.l / sheet.length) * 100}%`,
                                  }}
                                  title={`${cut.mark} - ${cut.label}: ${cut.w}x${cut.l}m`}
                                >
                                  <span className="truncate">{cut.mark}</span>
                                  <span className="truncate opacity-80">{cut.label}</span>
                                  <span className="opacity-70">{cut.w}x{cut.l}</span>
                                </div>
                              ))}
                              {sheet.cuts.length > 0 && (sheet.length - Math.max(...sheet.cuts.map(c => c.y + c.l))) > 0.1 && (
                                <div 
                                  className="absolute w-full flex items-center justify-center text-[10px] font-black text-white/40 uppercase tracking-widest pointer-events-none"
                                  style={{
                                    top: `${(Math.max(...sheet.cuts.map(c => c.y + c.l)) / sheet.length) * 100}%`,
                                    height: `${((sheet.length - Math.max(...sheet.cuts.map(c => c.y + c.l))) / sheet.length) * 100}%`
                                  }}
                                >
                                  Chute: {sheet.width.toFixed(2)}x{(sheet.length - Math.max(...sheet.cuts.map(c => c.y + c.l))).toFixed(2)}m
                                </div>
                              )}
                            </div>
                            <div className="flex justify-center gap-4 text-[10px] text-slate-400 font-medium">
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-emerald-500 rounded-sm"></div>
                                <span>Platines</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 bg-red-500 rounded-sm"></div>
                                <span>Chute</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {selectedSheet && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSheet(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-[98vw] h-[96vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {t.plate} Ep. {selectedSheet.thickness}mm - {selectedSheet.id}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {selectedSheet.width}x{selectedSheet.length}m | {((selectedSheet.usedArea / (selectedSheet.width * selectedSheet.length)) * 100).toFixed(1)}% {t.used}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Zoom</span>
                    <button 
                      onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.2))}
                      className="p-1 hover:bg-slate-100 rounded text-slate-600 transition-colors"
                    >
                      -
                    </button>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="4" 
                      step="0.1" 
                      value={zoomLevel} 
                      onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                      className="w-24 accent-indigo-600"
                    />
                    <button 
                      onClick={() => setZoomLevel(prev => Math.min(4, prev + 0.2))}
                      className="p-1 hover:bg-slate-100 rounded text-slate-600"
                    >
                      +
                    </button>
                    <span className="text-[10px] font-bold text-slate-500 w-8 text-center">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <button 
                      onClick={() => setZoomLevel(1)}
                      className="ml-2 p-1 hover:bg-slate-100 rounded text-indigo-600 text-[10px] font-bold"
                    >
                      Reset
                    </button>
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedSheet(null);
                      setZoomLevel(1);
                    }}
                    className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto p-4 sm:p-20 flex items-start justify-center bg-slate-100/50">
                <div 
                  className="relative bg-red-500 border-4 border-white rounded-xl shadow-2xl transition-all duration-200 origin-top"
                  style={{ 
                    width: selectedSheet.width >= selectedSheet.length ? `${zoomLevel * 100}%` : 'auto',
                    height: selectedSheet.length > selectedSheet.width ? `${zoomLevel * 100}%` : 'auto',
                    minWidth: selectedSheet.width >= selectedSheet.length ? `${zoomLevel * 800}px` : 'auto',
                    minHeight: selectedSheet.length > selectedSheet.width ? `${zoomLevel * 800}px` : 'auto',
                    aspectRatio: `${selectedSheet.width}/${selectedSheet.length}`,
                    backgroundSize: `${40 * zoomLevel}px ${40 * zoomLevel}px`,
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.2) 2px, transparent 2px)'
                  }}
                >
                  {selectedSheet.cuts.map((cut: any, cIdx: number) => (
                    <div 
                      key={`${selectedSheet.id}-cut-detail-${cIdx}`}
                      className="absolute bg-emerald-500 border-2 border-white/40 flex flex-col items-center justify-center text-xs font-bold text-white overflow-hidden p-2 shadow-sm group"
                      style={{
                        left: `${(cut.x / selectedSheet.width) * 100}%`,
                        top: `${(cut.y / selectedSheet.length) * 100}%`,
                        width: `${(cut.w / selectedSheet.width) * 100}%`,
                        height: `${(cut.l / selectedSheet.length) * 100}%`,
                      }}
                    >
                      <span className="truncate w-full text-center">{cut.mark}</span>
                      <span className="truncate w-full text-center opacity-80 text-[10px]">{cut.label}</span>
                      <span className="opacity-70 text-[10px] mt-1 bg-black/20 px-1 rounded">{cut.w}x{cut.l}</span>
                      
                      {/* Tooltip on hover */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center text-[10px]">
                        {cut.mark}<br/>{cut.label}<br/>{cut.w}x{cut.l}m
                      </div>
                    </div>
                  ))}
                  
                  {selectedSheet.cuts.length > 0 && (selectedSheet.length - Math.max(...selectedSheet.cuts.map((c: any) => c.y + c.l))) > 0.01 && (
                    <div 
                      className="absolute w-full flex items-center justify-center text-base font-black text-white/30 uppercase tracking-[0.2em] pointer-events-none border-t-2 border-dashed border-white/20"
                      style={{
                        top: `${(Math.max(...selectedSheet.cuts.map((c: any) => c.y + c.l)) / selectedSheet.length) * 100}%`,
                        height: `${((selectedSheet.length - Math.max(...selectedSheet.cuts.map((c: any) => c.y + c.l))) / selectedSheet.length) * 100}%`
                      }}
                    >
                      {t.chute}: {selectedSheet.width.toFixed(2)}x{(selectedSheet.length - Math.max(...selectedSheet.cuts.map((c: any) => c.y + c.l))).toFixed(2)}m
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-center gap-8">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-emerald-500 rounded-md"></div>
                  <span className="text-sm font-bold text-slate-700">{t.plates}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 rounded-md"></div>
                  <span className="text-sm font-bold text-slate-700">{t.scrap}</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
