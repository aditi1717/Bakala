import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft,
  Loader2,
  Clock,
  ArrowRight
} from 'lucide-react';
import WeekSelector from '@delivery/components/WeekSelector';
import { deliveryAPI } from '@food/api';
import { formatCurrency } from '@food/utils/currency';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';
import BRAND_THEME from '@/config/brandTheme';

export const DeductionStatementV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [deductions, setDeductions] = useState([]);
  const [weekRange, setWeekRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - new Date().getDay())),
    end: new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 6))
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getWalletTransactions({ 
          type: 'deduction', 
          limit: 100 
        });
        
        if (response?.data?.success) {
           const all = response.data.data.transactions || [];
           const filtered = all.filter((t) => {
              const type = String(t.type || '').trim().toLowerCase();
              const isManualDeduction = type === 'withdrawal' || type === 'deposit';
              if (!isManualDeduction) return false;

              const baseDate = t.date || t.createdAt;
              const d = new Date(baseDate);
              return d >= weekRange.start && d <= weekRange.end;
           });
           setDeductions(filtered);
        }
      } catch (err) {
        toast.error('Failed to load deductions');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [weekRange]);

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-24">
       {/* Header (Standard Compact Style) */}
       <div className="bg-white border-b border-gray-100 flex items-center px-4 py-3 sticky top-0 z-30 shadow-sm gap-3">
          <button 
            onClick={goBack}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-gray-900">Deductions</h1>
       </div>

       {/* Main Content */}
       <div className="px-3 py-4">
          <WeekSelector onChange={setWeekRange} />

          {/* Transactions List */}
          {loading ? (
             <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <p className="text-gray-500 text-xs font-semibold">Loading records...</p>
             </div>
          ) : deductions.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 bg-white shadow-sm border border-gray-200 rounded-2xl flex items-center justify-center mb-4">
                   <Clock className="w-5 h-5 text-gray-400" />
                </div>
                <p className="text-gray-900 text-sm font-bold">No Deductions</p>
                <p className="text-gray-500 text-[11px] font-medium mt-1">No penalties or charges this week.</p>
             </div>
          ) : (
             <div className="space-y-2.5 mt-4 pb-10">
                {deductions.map((item, index) => (
                   <div
                     key={item._id || index}
                     className="bg-white rounded-xl p-3.5 shadow-sm border border-gray-100 active:bg-gray-50 transition-colors"
                   >
                      <div className="flex items-start justify-between">
                         <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                               <ArrowRight className="w-4 h-4 text-red-500 rotate-45" />
                            </div>
                            <div>
                               <p className="text-gray-900 text-sm font-bold leading-tight line-clamp-2">{item.description || 'System Deduction'}</p>
                               <p className="text-gray-400 text-[10px] font-semibold mt-1">
                                  {new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                               </p>
                            </div>
                         </div>
                         <div className="text-red-600 text-sm font-black shrink-0 pl-2">
                            -{formatCurrency(item.amount)}
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          )}
       </div>
    </div>
  );
};
