import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from './ui/button';

interface RobokassaPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaymentStatusChange: (status: 'paid' | 'cancelled') => void;
}

const RobokassaPaymentModal = ({
  open,
  onOpenChange,
  onPaymentStatusChange
}: RobokassaPaymentModalProps) => {
  const handlePay = async () => {
    try {
      // Call backend to process payment
      const response = await fetch('/payment/success', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'standard',
          analyses_count: 10,
          validity_days: 30
        })
      });

      if (response.ok) {
        onPaymentStatusChange('paid');
      } else {
        console.error('Payment processing failed');
        onPaymentStatusChange('cancelled');
      }
    } catch (error) {
      console.error('Payment error:', error);
      onPaymentStatusChange('cancelled');
    } finally {
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    onPaymentStatusChange('cancelled');
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <Dialog.Content className="bg-white rounded-lg p-6 shadow-xl z-50 w-full max-w-md">
            <Dialog.Title className="text-xl font-bold mb-4 text-center">
              Оплата Robokassa
            </Dialog.Title>
            
            <Dialog.Description className="mb-6 text-center text-gray-600">
              Подтвердите оплату заказа
            </Dialog.Description>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button 
                variant="default" 
                className="px-6 py-3 flex-1" 
                onClick={handlePay}
              >
                Оплатить
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

export default RobokassaPaymentModal;