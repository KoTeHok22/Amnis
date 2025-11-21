import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './ui/button';

interface PaymentWarningModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProfile: () => void;
}

const PaymentWarningModal = ({
  open,
  onOpenChange,
  onOpenProfile
}: PaymentWarningModalProps) => {
  const handleProceedToProfile = () => {
    onOpenProfile();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black bg-opacity-50 z-[999996] flex items-center justify-center">
          <Dialog.Content className="bg-white rounded-lg p-6 shadow-xl z-[999995] w-full">
            <Dialog.Title className="text-xl font-bold mb-4 text-center">
              Оплата анализа
            </Dialog.Title>
            
            <Dialog.Description className="mb-6 text-center text-gray-600">
              Для оплаты доступны различные тарифы. Выберите подходящий тариф в профиле.
            </Dialog.Description>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button 
                variant="default" 
                className="px-6 py-3 flex-1" 
                onClick={handleProceedToProfile}
              >
                Перейти к тарифам
              </Button>
              <Button 
                variant="outline" 
                className="px-6 py-3 flex-1" 
                onClick={handleCancel}
              >
                Отменить
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default PaymentWarningModal;