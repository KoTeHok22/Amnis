// Единый источник тарифов для лендинга, профиля и чата.
// id (`plan-N`) совпадают с теми, что принимает бэкенд при оплате (см. BACK/main.py),
// поэтому менять их нельзя без согласования с бэкендом.

export interface PricingPlan {
  id: string;
  name: string;
  analyses: number;
  price: number;
  pricePerAnalysis: number;
  popular?: boolean;
}

// Базовая цена за один анализ (тариф «Пробный») — используется для расчёта «экономии».
export const BASE_PRICE_PER_ANALYSIS = 199;

export const pricingPlans: PricingPlan[] = [
  { id: 'plan-1', name: 'Пробный', analyses: 1, price: 199, pricePerAnalysis: 199, popular: false },
  { id: 'plan-5', name: 'Начальный', analyses: 5, price: 799, pricePerAnalysis: 160, popular: true },
  { id: 'plan-10', name: 'Стандартный', analyses: 10, price: 1399, pricePerAnalysis: 140, popular: false },
  { id: 'plan-15', name: 'Премиум', analyses: 15, price: 1899, pricePerAnalysis: 127, popular: false },
];

// Возможности, входящие в каждый глубокий анализ.
export const deepAnalysisFeatures = [
  'Детальный разбор всех символов',
  'Психологический анализ',
  'Персональные рекомендации',
  'Связь с подсознанием',
];
