import React, { createContext, useContext, useState, ReactNode } from 'react';

type PaymentStatus = 'pending' | 'paid' | 'cancelled' | null;

interface PaymentContextType {
  paymentStatus: PaymentStatus;
  setPaymentStatus: (status: PaymentStatus) => void;
}

const PaymentContext = createContext<PaymentContextType | undefined>(undefined);

interface PaymentProviderProps {
  children: ReactNode;
}

export const PaymentProvider: React.FC<PaymentProviderProps> = ({ children }) => {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(null);

  return (
    <PaymentContext.Provider value={{ paymentStatus, setPaymentStatus }}>
      {children}
    </PaymentContext.Provider>
  );
};

export const usePayment = (): PaymentContextType => {
  const context = useContext(PaymentContext);
  if (context === undefined) {
    throw new Error('usePayment must be used within a PaymentProvider');
  }
  return context;
};