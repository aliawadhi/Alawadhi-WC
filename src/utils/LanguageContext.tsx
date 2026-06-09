import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Language = 'en' | 'ar';

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isAr: boolean;
  tTeam: (teamName: string) => string;
}

const TRANSLATIONS: Record<Language, Record<string, string>> = {
  en: {
    // Auth
    profileSetup: "Profile Setup",
    familyDashboard: "Family Dashboard",
    controlPanel: "Stadium Control Panel",
    familyPool: "Alawadhi's WC POOL",
    createIdentity: "Create your tournament identity",
    lockGuesses: "Lock in your guesses",
    registerTitle: "New Player Registration",
    loginTitle: "Secure Stadium Sign-In",
    registerBadge: "📝 Register",
    loginBadge: "🔐 Login",
    username: "Username",
    password: "Password",
    processing: "Processing...",
    createProfile: "CREATE PROFILE",
    enterStadium: "ENTER STADIUM",
    existingPlayer: "👉 Existing player? Sign In",
    newPlayer: "👉 Register new player profile",
    usernamePlaceholder: "e.g., aliawadhi",
    fillAllFields: "Please fill in all fields.",
    takenUsername: "That username is taken! Try another one.",
    incorrectCreds: "Incorrect username or password.",
    redirecting: "Account created successfully! Redirecting...",
    lightMode: "☀️ Light Mode",
    darkMode: "🌙 Dark Mode",
    
    // Header & Tabs
    appTitle: "Alawadhi's WC prediction pool",
    worldCupTitle: "FIFA World Cup",
    year2026: "2026",
    countries: "USA · CANADA · MEXICO",
    predictionsTab: "My Predictions",
    fixturesTab: "Fixtures",
    standingsTab: "Standings",
    rankingsTab: "Team Rankings",
    signOut: "Sign Out",
    themeLightBtn: "☀️ Light",
    themeDarkBtn: "🌙 Dark",
    loadingDashboard: "Loading Dashboard...",
    
    // Predictions Tab
    myPredictionsTitle: "My Predictions",
    viewRules: "📖 View Scoring Guide",
    hideRules: "Hide Scoring Guide 📖",
    rulesHeader: "🎮 Official Rules & Point Multipliers",
    rulesStandardTitle: "🎯 Standard Points",
    rulesStandard1: "5 Points: Exact score prediction is 100% correct.",
    rulesStandard2: "2 Points: Correct match outcome (draw, or correct winner) but incorrect score.",
    rulesStandard3: "0 Points: Incorrect match outcome.",
    rulesStandard4: "Note: If you forgot to predict a game, it will be assumed that this game is a 0-0 prediction",
    rulesSlayerTitle: "⚡ Giant Slayer Double Multiplier",
    rulesSlayerDesc: "On special ⚡ Giant Slayer fixtures, you get DOUBLE POINTS (5 ➔ 10 pts, or 2 ➔ 4 pts) if:",
    rulesSlayer1: "1. You predicted the weaker team (Underdog) to win or draw.",
    rulesSlayer2: "2. The Underdog actually gets a result (Wins or Draws).",
    rulesSlayerWarn: "⚠️ Predicting the favorite to win earns standard points only (no double).",
    rulesUnderdogHeader: "🏆 Underdog Specialist Tiebreakers",
    rulesUnderdogDesc: "When overall standings are tied, players who predicted underdog results stand superior as a show of sheer speculative bravery.",
    predictionsSaved: "Saved Predictions",
    notPredicted: "Not predicted yet",
    predictOutcome: "Predict the exact outcome",
    enterScore: "Enter score",
    matchLocked: "Match is locked",
    predictionSavedSuccess: "Prediction saved!",
    savePredictionBtn: "Save Prediction 💾",
    editPredictionBtn: "Edit Prediction ✎",
    saving: "Saving...",
    lockTimeWarn: "Closes 1h before kickoff",
    doubledBadge: "⚡ Giant Slayer Active Double Points",
    
    // Fixtures
    fixturesTitle: "Official Tournament Fixtures",
    adminTrigger: "🛠️ Admin Tools: Seed/Reset Fixtures",
    seedingSuccess: "Successfully generated FIFA World Cup 2026 fixtures!",
    matchDay: "Matchday",
    groups: "Groups",
    groupGrid: "Groups & Stages",
    allFixtures: "All Fixtures",
    realScore: "Real Score",
    notPlayed: "Not started or scheduled",
    searchTeam: "Search teams...",
    allGroups: "All Groups",
    stageGroup: "Group",
    stadium: "Stadium",
    kickoffTime: "Kickoff Time",
    giantSlayerFixture: "⚡ Giant Slayer Match",
    
    // Standings
    activeLeague: "Active League:",
    inviteCodeCopy: "🔑 Copy Code",
    inviteCodeCopied: "🔑 Copied Link!",
    leaveLeague: "🚪 Leave League",
    confirmLeaveLeague: "Are you sure you want to leave this league? Your standings records will no longer count here.",
    leaveBtn: "Leave",
    cancelBtn: "Cancel",
    dropLeague: "🗑️ Drop League",
    confirmDropLeague: "⚠️ WARNING: You are the creator of this league! Dropping it will permanently delete the league and wipe out all standings and scores for everyone enrolled. Are you absolutely sure?",
    dropBtn: "Delete",
    createOrJoin: "👥 Leagues",
    leagueDesc: "Create your own private bracket room or join one shared by someone using their unique code.",
    createNewLeague: "Create a brand new league",
    joinWithCode: "Join with invite code",
    placeholderLeagueName: "e.g., The Cousins Derby Cup",
    placeholderJoinCode: "Paste league code / UUID",
    establishBtn: "ESTABLISH LEAGUE 🏆",
    joinBtn: "JOIN ROOM ⚽",
    discardReturn: "Discard and Return to Standings",
    enterArena: "Enter the Arena",
    noLeagueEnrolled: "You aren't enrolled in a predictive league yet. Create one or submit an invite code above to begin.",
    leaderboardTitle: "League Standings",
    rank: "Rank",
    player: "Player",
    totalPoints: "Total Points",
    exactScoresCount: "Exact Scores (5pt)",
    outcomeCount: "Correct Outcome (2pt)",
    giantSlayersCount: "Giant Slayers",
    emptyScores: "0 pts earned yet",
    seeGroupPredictions: "Show Group Predictions 👥",
    hideGroupPredictions: "Hide Group Predictions 👥",
    activeLeaguePredictions: "Group Members' Predictions",
    leagueSelectPlaceholder: "Select League",
    noLeaguePredictions: "Choose or join a league to view other members' predictions!",
    noPredictionsYet: "No predictions submitted for this match yet.",
    predictedLabel: "Predicted:",
    pointsLabel: "Points:",
    
    // Rankings
    fifaRankingsTitle: "FIFA National Team Rankings",
    rankCol: "FIFA RANK",
    pointsCol: "FIFA POINTS",
    teamCol: "TEAM",
    searchRankings: "Search national team...",
    underdogsHighlighted: "⚡ Underdogs get special double points multipliers when they defeat higher ranked giants.",
    officialPredictionApp: "Official Predictions App",
  },
  ar: {
    // Auth
    profileSetup: "إعداد الحساب",
    familyDashboard: "مسابقة توقعات العائلة",
    controlPanel: "لوحة تحكم الملعب",
    familyPool: "دوري العوضي",
    createIdentity: "أنشئ هويتك للبطولة",
    lockGuesses: "سجل توقعاتك للمباريات",
    registerTitle: "تسجيل حساب لاعب جديد",
    loginTitle: "بوابة الدخول الآمن للملعب",
    registerBadge: "📝 تسجيل",
    loginBadge: "🔐 تسجيل دخول",
    username: "اسم اللاعب",
    password: "كلمة المرور",
    processing: "جاري المعالجة...",
    createProfile: "إنشاء الملف الشخصي",
    enterStadium: "دخول الملعب",
    existingPlayer: "👉 لاعب مسجل بالفعل؟ سجل دخولك",
    newPlayer: "👉 هل أنت لاعب جديد؟ سجل معنا الآن",
    usernamePlaceholder: "اسم المستخدم",
    fillAllFields: "يرجى ملء جميع الحقول المطلوبة.",
    takenUsername: "هذا الاسم مستخدم بالفعل! جرب اسماً آخر.",
    incorrectCreds: "اسم اللاعب أو كلمة المرور غير صحيحة.",
    redirecting: "تم إنشاء الحساب بنجاح! جاري التوجيه...",
    lightMode: "☀️ الوضع المضيء",
    darkMode: "🌙 الوضع المظلم",
    
    // Header & Tabs
    appTitle: "مسابقة العوضي لكأس العالم",
    worldCupTitle: "كأس العالم فيفا",
    year2026: "٢٠٢٦",
    countries: "الولايات المتحدة · كندا · المكسيك",
    predictionsTab: "توقعاتي",
    fixturesTab: "المباريات",
    standingsTab: "الترتيب",
    rankingsTab: "تصنيف المنتخبات",
    signOut: "تسجيل الخروج",
    themeLightBtn: "☀️ مضيء",
    themeDarkBtn: "🌙 مظلم",
    loadingDashboard: "جاري تحميل لوحة التحكم الفنية...",
    
    // Predictions Tab
    myPredictionsTitle: "توقعاتي",
    viewRules: "📖 عرض دليل حساب النقاط",
    hideRules: "إخفاء دليل حساب النقاط 📖",
    rulesHeader: "🎮 القوانين الرسمية ومضاعفات النقاط",
    rulesStandardTitle: "🎯 نقاط التوقع الأساسية",
    rulesStandard1: "5 نقاط: توقع صحيح بنسبة 100٪ للنتيجة الدقيقة للمباراة.",
    rulesStandard2: "نقطتان: توقع الفائز أو التعادل صحيح، لكن النتيجة الرقمية التفصيلية خاطئة.",
    rulesStandard3: "0 نقاط: نتيجة التوقع خاطئة للمباراة تماماً.",
    rulesStandard4: "ملاحظة: إذا نسيت التنبؤ بمباراة، فسيتم افتراض أن هذه المباراة هي تنبؤ 0-0",
    rulesSlayerTitle: "⚡ مضاعف قاهر العمالقة",
    rulesSlayerDesc: "في مواجهات قاهر العمالقة ⚡ المميزة، ستحصل مهاراتك على ضِعف النقاط (5 تصبح 10، أو 2 تصبح 4 نقاط) إذا تحقق الشرطان:",
    rulesSlayer1: "1. قمت بترشيح وتوقع الفريق الأضعف تقييماً (Underdog) للفوز أو التعادل.",
    rulesSlayer2: "2. نجح الفريق الأضعف في تفادي الخسارة (فاز أو تعادل في الواقع).",
    rulesSlayerWarn: "⚠️ ترشيح الفريق الاقوى بالفوز لا يمنحك أي نقاط مضاعفة (تحصل على نقاط عادية فقط).",
    rulesUnderdogHeader: "🏆 نظام كسر التعادلات للأبطال",
    rulesUnderdogDesc: "عند تساوي مجموع النقاط الإجمالي، يتم ترقية اللاعبين الذين اختاروا وتوقعوا صحة نتائج الفرق الأضعف (قاهري العمالقة) كدليل على الشجاعة في قراءة الخرائط الرياضية.",
    predictionsSaved: "تم الحفظ",
    notPredicted: "لم تتوقع هذه المباراة بعد",
    predictOutcome: "سجل توقعك للنتيجة الدقيقة",
    enterScore: "النتيجة",
    matchLocked: "المباراة مغلقة ومؤمنة",
    predictionSavedSuccess: "تم حفظ توقعك للمباراة!",
    savePredictionBtn: "حفظ التوقع 💾",
    editPredictionBtn: "تعديل التوقع ✎",
    saving: "جاري حفظ التوقع...",
    lockTimeWarn: "تغلق التوقعات تماماً قبل ساعة من صافرة المباراة",
    doubledBadge: "⚡ مباراة قاهر العمالقة: نقاط مضاعفة نشطة",
    
    // Fixtures
    fixturesTitle: "جدول مباريات البطولة الرسمي",
    adminTrigger: "🛠️ أدوات إدارة النظام: توليد / تصفير المباريات",
    seedingSuccess: "تم إدراج مباريات كأس العالم فيفا 2026 الرسمية بنجاح!",
    matchDay: "يوم المباراة",
    groups: "المجموعات",
    groupGrid: "المجموعات والمراحل",
    allFixtures: "جميع المباريات",
    realScore: "النتيجة النهائية",
    notPlayed: "لم تبدأ بعد أو مجدولة",
    searchTeam: "البحث عن منتخب...",
    allGroups: "كل المجموعات",
    stageGroup: "المجموعة",
    stadium: "الملعب والموقع",
    kickoffTime: "وقت انطلاق المباراة",
    giantSlayerFixture: "⚡ مباراة قاهر العمالقة",
    
    // Standings
    activeLeague: "الدوري النشط حالياً:",
    inviteCodeCopy: "🔑 نسخ الكود",
    inviteCodeCopied: "🔑 تم النسخ!",
    leaveLeague: "🚪 مغادرة الدوري",
    confirmLeaveLeague: "هل أنت متأكد من رغبتك في مغادرة هذا الدوري؟ لن تعود مشاركتك أو توقعاتك مرئية هنا.",
    leaveBtn: "مغادرة",
    cancelBtn: "إلغاء",
    dropLeague: "🗑️ حذف الدوري",
    confirmDropLeague: "⚠️ تحذير: أنت مؤسس هذا الدوري! حذفه سيقوم بمسح الدوري نهائياً وإلغاء ترتيب ودرجات جميع المشاركين فيه فوراً. هل أنت متأكد تماماً؟",
    dropBtn: "حذف نهائي",
    createOrJoin: "👥 دوريات الخاصة",
    leagueDesc: "يمكنك إنشاء دوري مغلق ومحمي لجمع درجات, أو انضم لدوري موجود سلفاً تمت مشاركته معك برمزه السري.",
    createNewLeague: "تأسيس دوري جديد",
    joinWithCode: "الانضمام لدوري متاح",
    placeholderLeagueName: "مثال: توقعات الأشقاء والأقارب",
    placeholderJoinCode: "ضع كود الدعوة السري هنا",
    establishBtn: "تأسيس الغرفة 🏆",
    joinBtn: "انضمام للغرفة ⚽",
    discardReturn: "إلغاء وتراجع للمنافسات",
    enterArena: "أدخل ساحة التوقعات",
    noLeagueEnrolled: "أنت لست مسجلاً في أي دوري إلى الآن. أنشئ دوريًا خاصاً أو أدخل رمز دعوة أعلاه لبدء التباري المثير.",
    leaderboardTitle: "ترتيب متسابقي الدوري",
    rank: "المركز",
    player: "اللاعب",
    totalPoints: "مجموع النقاط",
    exactScoresCount: "أهداف دقيقة (5ن)",
    outcomeCount: "توقع صحيح (2ن)",
    giantSlayersCount: "قواهر العمالقة",
    emptyScores: "0 نقاط حالياً",
    seeGroupPredictions: "عرض توقعات المجموعة 👥",
    hideGroupPredictions: "إخفاء توقعات المجموعة 👥",
    activeLeaguePredictions: "توقعات أعضاء المجموعة",
    leagueSelectPlaceholder: "اختر الدوري",
    noLeaguePredictions: "اختر أو انضم إلى دوري لاستعراض توقعات الأعضاء الآخرين!",
    noPredictionsYet: "لم يقم أي عضو بتقديم توقع لهذه المباراة بعد.",
    predictedLabel: "التوقع:",
    pointsLabel: "النقاط:",
    
    // Rankings
    fifaRankingsTitle: "التصنيف الرسمي للاتحاد الدولي لكرة القدم (فيفا)",
    rankCol: "ترتيب فيفا",
    pointsCol: "نقاط تصنيف فيفا",
    teamCol: "المنتخب",
    searchRankings: "البحث السريع عن منتخب وطني...",
    underdogsHighlighted: "⚡ تُمنح ترشيحات قاهر العمالقة فوزاً بمضاعف النقاط المثير لتشجيع مفاجآت اللعبة الرياضية.",
    officialPredictionApp: "التطبيق الرسمي لتوقعات كأس العالم",
  }
};

const TEAM_TRANSLATIONS: Record<string, string> = {
  "France": "فرنسا",
  "Spain": "إسبانيا",
  "Argentina": "الأرجنتين",
  "England": "إنجلترا",
  "Portugal": "البرتغال",
  "Brazil": "البرازيل",
  "Netherlands": "هولندا",
  "Morocco": "المغرب",
  "Belgium": "بلجيكا",
  "Germany": "ألمانيا",
  "Croatia": "كرواتيا",
  "Italy": "إيطاليا",
  "Colombia": "كولومبيا",
  "Senegal": "السنغال",
  "Mexico": "المكسيك",
  "USA": "الولايات المتحدة",
  "Uruguay": "أوروغواي",
  "Japan": "اليابان",
  "Switzerland": "سويسرا",
  "Denmark": "الدنمارك",
  "IR Iran": "إيران",
  "Türkiye": "تركيا",
  "Ecuador": "الإكوادور",
  "Austria": "النمسا",
  "Korea Republic": "كوريا الجنوبية",
  "Nigeria": "نيجيريا",
  "Australia": "أستراليا",
  "Algeria": "الجزائر",
  "Egypt": "مصر",
  "Canada": "كندا",
  "Norway": "النرويج",
  "Ukraine": "أوكرانيا",
  "Panama": "بنما",
  "Côte d'Ivoire": "ساحل العاج",
  "Poland": "بولندا",
  "Sweden": "السويد",
  "Paraguay": "باراغواي",
  "Scotland": "إسكتلندا",
  "Tunisia": "تونس",
  "Cameroon": "الكاميرون",
  "Congo DR": "الكونغو الديمقراطية",
  "Uzbekistan": "أوزبكستان",
  "Costa Rica": "كوستاريكا",
  "Mali": "مالي",
  "Chile": "تشيلي",
  "Qatar": "قطر",
  "Iraq": "العراق",
  "South Africa": "جنوب أفريقيا",
  "Saudi Arabia": "السعودية",
  "Jordan": "الأردن",
  "Bosnia and Herzegovina": "البوسنة والهرسك",
  "Honduras": "هندوراس",
  "Cabo Verde": "الرأس الأخضر",
  "Jamaica": "جامايكا",
  "Ghana": "غانا",
  "Curaçao": "كوراساو",
  "Haiti": "هايتي",
  "New Zealand": "نيوزيلندا",
  "Czechia": "التشيك"
};

const ENGLISH_SHORTENINGS: Record<string, string> = {
  "Bosnia and Herzegovina": "Bosnia",
  "Korea Republic": "Korea"
};

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('wc_lang');
      if (stored === 'ar' || stored === 'en') return stored;
    }
    return 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wc_lang', lang);
      // Auto-update push subscription language if user has active sessions
      import('./supabase').then(({ supabase }) => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            import('./notificationService').then(({ areNotificationsEnabled, subscribeToBackgroundPush }) => {
              if (areNotificationsEnabled()) {
                subscribeToBackgroundPush(session.user.id).catch(e => {
                  console.log("Background language refresh error:", e);
                });
              }
            });
          }
        });
      });
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const dir = language === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.dir = dir;
      document.documentElement.lang = language;
      if (language === 'ar') {
        document.documentElement.classList.add('rtl-active');
      } else {
        document.documentElement.classList.remove('rtl-active');
      }
    }
  }, [language]);

  const t = (key: string): string => {
    const dict = TRANSLATIONS[language];
    return dict[key] || dict[key] || key;
  };

  const isAr = language === 'ar';

  const tTeam = (teamName: string): string => {
    if (isAr) {
      return TEAM_TRANSLATIONS[teamName] || TEAM_TRANSLATIONS[teamName.trim()] || teamName;
    }
    return ENGLISH_SHORTENINGS[teamName] || ENGLISH_SHORTENINGS[teamName.trim()] || teamName;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isAr, tTeam }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
