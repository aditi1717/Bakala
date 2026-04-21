import React, { useState, useMemo, useEffect } from "react";
import { 
  ArrowLeft,
  Loader2,
  Package,
  IndianRupee,
  Receipt,
  TrendingUp,
  Clock
} from "lucide-react";
import { formatCurrency } from "@food/utils/currency";
import WeekSelector from "@delivery/components/WeekSelector";
import { deliveryAPI } from "@food/api";
import { motion, AnimatePresence } from "framer-motion";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";
import BRAND_THEME from "@/config/brandTheme";

export const PocketDetailsV2 = () => {
  const goBack = useDeliveryBackNavigation();

  // Current week range (Sunday–Saturday)
  const getInitialWeekRange = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  const [weekRange, setWeekRange] = useState(getInitialWeekRange);
  const [orders, setOrders] = useState([]);
  const [paymentTransactions, setPaymentTransactions] = useState([]);
  const [bonusTransactions, setBonusTransactions] = useState([]);
  const [summaryData, setSummaryData] = useState({ totalEarning: 0, totalBonus: 0, grandTotal: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getPocketDetails({
          date: weekRange.start.toISOString(),
          limit: 2000
        });

        const payload = response?.data?.data || {};
        const trips = payload?.trips || payload?.orders || [];
        const payments = payload?.transactions?.payment || [];
        const bonuses = payload?.transactions?.bonus || [];
        const summary = payload?.summary || {};

        setOrders(Array.isArray(trips) ? trips : []);
        setPaymentTransactions(Array.isArray(payments) ? payments : []);
        setBonusTransactions(Array.isArray(bonuses) ? bonuses : []);
        setSummaryData({
          totalEarning: Number(summary.totalEarning) || 0,
          totalBonus: Number(summary.totalBonus) || 0,
          grandTotal: Number(summary.grandTotal) || 0,
        });
      } catch (error) {
        setOrders([]);
        setPaymentTransactions([]);
        setBonusTransactions([]);
        setSummaryData({ totalEarning: 0, totalBonus: 0, grandTotal: 0 });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [weekRange]);

  const summary = useMemo(() => {
    let totalEarning = 0;
    let totalBonus = 0;
    paymentTransactions.forEach((p) => { totalEarning += p.amount || 0; });
    bonusTransactions.forEach((b) => { totalBonus += b.amount || 0; });
    return {
      totalEarning: summaryData.totalEarning || totalEarning,
      totalBonus: summaryData.totalBonus || totalBonus,
      grandTotal: summaryData.grandTotal || (summaryData.totalEarning || totalEarning) + (summaryData.totalBonus || totalBonus),
    };
  }, [paymentTransactions, bonusTransactions, summaryData]);

  const getOrderEarning = (orderId) => {
    const p = paymentTransactions.find(p => (p.orderId || p.metadata?.orderId) === orderId);
    if (p) return p.amount || 0;
    const order = orders.find(o => (o.orderId || o._id || o.id) === orderId);
    return order?.deliveryEarning || order?.earningAmount || order?.amount || 0;
  };

  const getOrderBonus = (orderId) => {
    const b = bonusTransactions.find(b => (b.orderId || b.metadata?.orderId) === orderId);
    return b ? b.amount : 0;
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12 font-poppins">
      {/* ─── HEADER (Standard Compact) ─── */}
      <div className="bg-white border-b border-gray-100 flex items-center px-4 py-3 sticky top-0 z-30 shadow-sm gap-3">
        <button
          onClick={goBack}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900">Pocket Statement</h1>
      </div>

      <div className="px-3 py-4 space-y-4">
        {/* ─── WEEK SELECTOR ─── */}
        <WeekSelector 
          onChange={setWeekRange}
          weekStartsOn={0}
        />

        {/* ─── SUMMARY CARD (Compact) ─── */}
        <div className="rounded-xl p-4 shadow-sm relative overflow-hidden" style={{ background: BRAND_THEME.gradients.primary }}>
           <div className="relative z-10">
              <div className="flex justify-between items-center mb-4">
                 <div>
                    <h2 className="text-2xl font-bold text-white leading-none">₹{summary.grandTotal.toFixed(0)}</h2>
                    <p className="text-[10px] text-blue-100 mt-1 uppercase tracking-widest font-semibold">Total Payout</p>
                 </div>
                 <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center border border-white/10 backdrop-blur-sm">
                    <TrendingUp className="w-5 h-5 text-white" />
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                 <div className="bg-white/10 p-2.5 rounded-lg border border-white/5 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-1 opacity-20"><Package className="w-8 h-8" /></div>
                    <p className="text-[9px] font-semibold text-blue-100 uppercase tracking-widest mb-0.5">Trips</p>
                    <p className="text-sm font-bold text-white relative z-10">₹{summary.totalEarning.toFixed(0)}</p>
                 </div>
                 <div className="bg-white/10 p-2.5 rounded-lg border border-white/5 backdrop-blur-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-1 opacity-20"><Receipt className="w-8 h-8" /></div>
                    <p className="text-[9px] font-semibold text-blue-100 uppercase tracking-widest mb-0.5">Bonus</p>
                    <p className="text-sm font-bold text-white relative z-10">₹{summary.totalBonus.toFixed(0)}</p>
                 </div>
              </div>
           </div>
        </div>

        {/* ─── ORDERS LIST ─── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 border-b border-gray-200 pb-2">
             <h3 className="text-sm font-bold text-gray-900">Trips History</h3>
             <span className="text-[10px] font-bold text-gray-500">{orders.length} Trips</span>
          </div>

          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <p className="text-xs font-semibold text-gray-500">Syncing history...</p>
            </div>
          ) : orders.length > 0 ? (
            <div className="grid gap-2.5 pb-10">
              {orders.map((order, idx) => {
                const oid = order.orderId || order._id || order.id;
                const earning = getOrderEarning(oid);
                const bonus = getOrderBonus(oid);
                return (
                  <div 
                    key={oid}
                    className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-100 flex items-start justify-between active:bg-gray-50 transition-all"
                  >
                    <div className="flex items-start gap-3">
                       <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center border border-blue-100 shrink-0">
                          <Package className="w-5 h-5 text-blue-500" />
                       </div>
                       <div className="pt-0.5">
                          <div className="flex items-center gap-1.5 mb-1">
                             <h4 className="text-sm font-bold text-gray-900 leading-none">#{oid.toString().slice(-6)}</h4>
                             <span className="text-[10px] font-medium text-gray-400">• {new Date(order.deliveredAt || order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                          </div>
                          <p className="text-[10px] text-gray-500 font-medium truncate max-w-[140px]">
                            {order.restaurantName || order.restaurantId?.name || "Premium Restaurant"}
                          </p>
                       </div>
                    </div>
                    <div className="text-right flex flex-col justify-between pt-0.5 min-h-[40px]">
                       <p className="text-sm font-black text-gray-900 leading-none mb-1">₹{(earning + bonus).toFixed(2)}</p>
                       <div className="mt-auto flex items-center justify-end gap-1.5">
                          {bonus > 0 && <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1 rounded">+{formatCurrency(bonus)} B</span>}
                          <div className={`px-1.5 py-[2px] rounded text-[9px] font-bold uppercase ${order.paymentMethod?.toLowerCase() === 'cod' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-green-50 text-green-700 border border-green-100'}`}>
                             {order.paymentMethod || 'Paid'}
                          </div>
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center bg-white rounded-xl shadow-sm border border-gray-100 mt-2">
               <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-gray-200">
                  <Clock className="w-5 h-5 text-gray-400" />
               </div>
               <h3 className="text-sm font-bold text-gray-900 mb-1">No Trips</h3>
               <p className="text-xs font-medium text-gray-500">Pick a different week range.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PocketDetailsV2;
