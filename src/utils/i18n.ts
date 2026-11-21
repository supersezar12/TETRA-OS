import type {AppView} from './platformBlueprints';

export type AppLanguage = 'en' | 'ar';

export interface UiDictionary {
  brandSubtitle: string;
  navLabels: Record<AppView, string>;
  signIn: string;
  signOut: string;
  claimAdmin: string;
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  enginesHeading: string;
  enginesSubheading: string;
  lifecycleHeading: string;
  lifecycleBody: string;
  authRequiredTitle: string;
  authRequiredDesc: string;
}

export const UI_TRANSLATIONS: Record<AppLanguage, UiDictionary> = {
  en: {
    brandSubtitle: 'Commercial Decisions Intelligence',
    navLabels: {
      overview: 'Overview',
      data: 'Data Center',
      predict: 'Predict',
      optimize: 'Optimize',
      decisions: 'Decisions',
      detect: 'Detect',
      ai_reports: 'AI & Reports',
      workflow: 'App Workflow',
      wireframes: 'Wireframes',
      users: 'Users & RBAC',
    },
    signIn: 'Sign In',
    signOut: 'Sign Out',
    claimAdmin: 'Claim Admin Access',
    heroEyebrow: 'Predict. Optimize. Detect.',
    heroTitle: 'Enterprise Commercial Decisions Intelligence Platform',
    heroBody:
      'TETRA OS connects validated enterprise commercial datasets with quantitative forecasting, operations research optimization, and deviation detection so leadership teams can review, approve, and measure commercial decisions with full auditability.',
    enginesHeading: 'Core Analytical Engines',
    enginesSubheading: 'Hover or tap Details on an engine card for methodology details.',
    lifecycleHeading: 'Governed Decision Lifecycle',
    lifecycleBody:
      'Data Ingestion & Validation -> Prediction -> Mathematical Optimization -> Recommendation -> Management Approval -> Execution Reference -> Outcome Measurement & Detection.',
    authRequiredTitle: 'Workspace Authentication Required',
    authRequiredDesc:
      'Sign in with your tenant account (or complete first-run Platform Administrator setup) to access persistent datasets, HiGHS optimization solvers, governed decisions, and RBAC audit logs.',
  },
  ar: {
    brandSubtitle: 'ذكاء القرارات التجارية',
    navLabels: {
      overview: 'نظرة عامة',
      data: 'مركز البيانات',
      predict: 'التنبؤ',
      optimize: 'التحسين الرياضي',
      decisions: 'القرارات',
      detect: 'الكشف والإنذار',
      ai_reports: 'الذكاء والتقارير',
      workflow: 'سير العمل',
      wireframes: 'الهياكل',
      users: 'المستخدمون والصلاحيات',
    },
    signIn: 'تسجيل الدخول',
    signOut: 'تسجيل الخروج',
    claimAdmin: 'تفعيل حساب المسؤول',
    heroEyebrow: 'تنبؤ. تحسين. كشف.',
    heroTitle: 'منصة ذكاء القرارات التجارية للمؤسسات',
    heroBody:
      'تربط منصة TETRA OS بيانات المبيعات والربحية المعتمدة بمحركات التنبؤ الإحصائي والتحسين الرياضي وكشف الانحرافات لتمكين الإدارة من مراجعة واعتماد وقياس القرارات التجارية بحوكمة كاملة.',
    enginesHeading: 'المحركات التحليلية الأساسية',
    enginesSubheading: 'مرر المؤشر أو اضغط على التفاصيل لمعرفة منهجية كل محرك.',
    lifecycleHeading: 'دورة حياة القرار المحوكمة',
    lifecycleBody:
      'استيعاب البيانات والتحقق -> التنبؤ -> التحسين الرياضي -> التوصية -> اعتماد الإدارة -> مرجع التنفيذ -> قياس النتائج الفعلية والكشف.',
    authRequiredTitle: 'مطلوب تسجيل الدخول لمساحة العمل',
    authRequiredDesc:
      'قم بتسجيل الدخول بحساب مؤسستك أو أكمل إعداد مسؤول المنصة للوصول إلى لقطات البيانات المحفوظة ومحرك التحسين الرياضي وحوكمة القرارات.',
  },
};
