import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, IndianRupee, ChevronRight,
  ShieldCheck, HelpCircle,
  Receipt, FileText, LayoutGrid, X,
  Loader2, CreditCard, PiggyBank, Target
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { initRazorpayPayment } from "@food/utils/razorpay";
import { getCompanyNameAsync } from "@food/utils/businessSettings";
import BRAND_THEME from "@/config/brandTheme";

export const PocketV2 = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [walletState, setWalletState] = useState({
    totalBalance: 0,
    cashInHand: 0,
    availableCashLimit: 0,
    totalCashLimit: 0,
    weeklyEarnings: 0,
    weeklyOrders: 0,
    payoutAmount: 0,
    payoutPeriod: 'Current Week',
    bankDetailsFilled: false
  });

  const [activeOffer, setActiveOffer] = useState({
    targetAmount: 0,
    targetOrders: 0,
    currentOrders: 0,
    currentEarnings: 0,
    validTill: '',
    isLive: false
  });

  const [showDepositPopup, setShowDepositPopup] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [profileRes, earningsRes, walletRes] = await Promise.all([
          deliveryAPI.getProfile(),
          deliveryAPI.getEarnings({ period: 'week' }),
          deliveryAPI.getWallet()
        ]);

        const profile = profileRes?.data?.data?.profile || {};
        const summary = earningsRes?.data?.data?.summary || {};
        const wallet = walletRes?.data?.data?.wallet || {};
        const activeAddonsRes = await deliveryAPI.getActiveEarningAddons().catch(() => null);
        const activeOfferPayload =
          activeAddonsRes?.data?.data?.activeOffer ||
          activeAddonsRes?.data?.activeOffer ||
          null;

        const bankDetails = profile?.documents?.bankDetails;
        const isFilled = !!(bankDetails?.accountNumber);

        setWalletState({
          totalBalance: Number(wallet.pocketBalance) || 0,
          cashInHand: Number(wallet.cashInHand) || 0,
          availableCashLimit: Number(wallet.availableCashLimit) || 0,
          totalCashLimit: Number(wallet.totalCashLimit) || 0,
          weeklyEarnings: Number(summary.totalEarnings) || 0,
          weeklyOrders: Number(summary.totalOrders) || 0,
          payoutAmount: Number(wallet.lastPayout?.amount || wallet.totalWithdrawn || 0),
          payoutPeriod: wallet.lastPayout ? new Date(wallet.lastPayout.date).toLocaleDateString() : 'No recent payout',
          bankDetailsFilled: isFilled
        });

        setActiveOffer({
          targetAmount: Number(activeOfferPayload?.targetAmount) || 0,
          targetOrders: Number(activeOfferPayload?.targetOrders) || 0,
          currentOrders: Number(activeOfferPayload?.currentOrders) || 0,
          currentEarnings: Number(activeOfferPayload?.currentEarnings) || 0,
          validTill: activeOfferPayload?.validTill || '',
          isLive: Boolean(activeOfferPayload)
        });

      } catch (err) {
        toast.error('Failed to load wallet data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!depositAmount || isNaN(amt) || amt < 1) {
      toast.error("Enter a valid amount (minimum ₹1)");
      return;
    }

    if (amt > walletState.cashInHand) {
      toast.error(`Deposit amount cannot exceed cash in hand (₹${walletState.cashInHand})`);
      return;
    }

    try {
      setDepositing(true);
      const orderRes = await deliveryAPI.createDepositOrder(amt);
      const data = orderRes?.data?.data;
      const rp = data?.razorpay;

      if (!rp?.orderId) {
        toast.error("Payment initialization failed");
        setDepositing(false);
        return;
      }

      const profileRes = await deliveryAPI.getProfile();
      const profile = profileRes?.data?.data?.profile || {};
      const companyName = await getCompanyNameAsync();

      await initRazorpayPayment({
        key: rp.key,
        amount: rp.amount,
        currency: rp.currency || "INR",
        order_id: rp.orderId,
        name: companyName,
        description: `Cash limit deposit - ₹${amt}`,
        prefill: {
          name: profile.name,
          email: profile.email,
          contact: profile.phone
        },
        handler: async (res) => {
          try {
            const verifyRes = await deliveryAPI.verifyDepositPayment({
              razorpay_order_id: res.razorpay_order_id,
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_signature: res.razorpay_signature,
              amount: amt
            });
            if (verifyRes?.data?.success) {
              toast.success("Deposit successful");
              setShowDepositPopup(false);
              setDepositAmount("");
              window.location.reload();
            }
          } catch (err) {
            toast.error("Verification failed");
          } finally {
            setDepositing(false);
          }
        },
        onError: () => setDepositing(false),
        onClose: () => setDepositing(false)
      });
    } catch (err) {
      setDepositing(false);
      toast.error("Deposit failed to start");
    }
  };

  const ordersProgress = activeOffer.targetOrders > 0 ? Math.min(activeOffer.currentOrders / activeOffer.targetOrders, 1) * 100 : 0;
  const earningsProgress = activeOffer.targetAmount > 0 ? Math.min(activeOffer.currentEarnings / activeOffer.targetAmount, 1) * 100 : 0;
  const hasActiveOffer = activeOffer.isLive && (activeOffer.targetAmount > 0 || activeOffer.targetOrders > 0);

  const formatOfferValidTill = (validTill) => {
    if (!validTill) return '';
    const parsed = new Date(validTill);
    if (Number.isNaN(parsed.getTime())) return String(validTill);
    return parsed.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  };

  const getCurrentWeekRange = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const formatDate = (d) => `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-poppins gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" style={{ color: BRAND_THEME.colors.brand.primary }} />
      <p className="text-xs font-medium text-gray-500">Loading Pocket...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-24">
      
      {/* 1. Header */}
      <div className="bg-white px-4 py-3 border-b border-gray-100 sticky top-0 z-30 shadow-sm flex items-center justify-between">
         <h1 className="text-base font-bold text-gray-900">Partner Pocket</h1>
      </div>

      {/* 2. BANK DETAILS WARNING (COMPACT) */}
      {!walletState.bankDetailsFilled && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-red-800">Add Bank Details</p>
              <p className="text-[10px] text-red-600 font-medium">Required for payouts</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/food/delivery/profile/details')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-red-600 border border-red-200 shadow-sm active:bg-gray-50"
          >
            Submit
          </button>
        </div>
      )}

      <div className="p-4 space-y-4">

        {/* 3. WEEKLY EARNINGS FLAT CARD */}
        <div 
          onClick={() => navigate('/food/delivery/earnings')}
          className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
        >
          <div>
             <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase mb-0.5">This Week • {getCurrentWeekRange()}</p>
             <h2 className="text-2xl font-bold text-gray-900 leading-none">
               ₹{walletState.weeklyEarnings.toFixed(0)}
             </h2>
          </div>
          <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center shrink-0 border border-green-100">
             <IndianRupee className="w-5 h-5 text-green-600" />
          </div>
        </div>

        {/* 4. EARNINGS GUARANTEE (LINEAR COMPACT) */}
        {hasActiveOffer && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 relative overflow-hidden">
             {activeOffer.isLive && (
                <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: BRAND_THEME.colors.brand.primary }} />
             )}
             
             <div className="flex items-center justify-between mb-3">
               <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                     <Target className="w-4 h-4 text-gray-500" />
                     Earnings Guarantee
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5 font-medium">Valid until {formatOfferValidTill(activeOffer.validTill)}</p>
               </div>
               <div className="text-right">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Target</p>
                  <p className="text-sm font-black text-gray-800">₹{activeOffer.targetAmount}</p>
               </div>
             </div>

             <div className="space-y-4 pt-1">
               {/* Orders linear bar */}
               <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                     <span className="font-semibold text-gray-700">Orders: {activeOffer.currentOrders} / {activeOffer.targetOrders}</span>
                     <span className="font-bold text-gray-500">{Math.round(ordersProgress)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                     <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${ordersProgress}%`, backgroundColor: BRAND_THEME.colors.brand.primary }} />
                  </div>
               </div>

               {/* Earnings linear bar */}
               <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                     <span className="font-semibold text-gray-700">Earned: ₹{activeOffer.currentEarnings} / ₹{activeOffer.targetAmount}</span>
                     <span className="font-bold text-gray-500">{Math.round(earningsProgress)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                     <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${earningsProgress}%`, backgroundColor: BRAND_THEME.colors.brand.primaryDark || '#10b981' }} />
                  </div>
               </div>
             </div>
          </div>
        )}

        {/* 5. BALANCES & DEPOSITS */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          
          <button
            onClick={() => navigate('/food/delivery/pocket/balance')}
            className="w-full p-4 border-b border-gray-50 flex items-center justify-between active:bg-gray-50 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center shrink-0 border border-purple-100">
                <Wallet className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-left">
                <span className="text-sm font-bold text-gray-900 block leading-tight">Pocket Balance</span>
                <span className="text-[10px] text-gray-500 font-medium">To withdraw</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-black text-gray-900 block">₹{walletState.totalBalance.toFixed(2)}</span>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
          </button>

          <button
            onClick={() => navigate('/food/delivery/pocket/cash-limit')}
            className="w-full p-4 border-b border-gray-50 flex items-center justify-between active:bg-gray-50 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0 border border-blue-100">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-left">
                <span className="text-sm font-bold text-gray-900 block leading-tight">Cash Limit</span>
                <span className="text-[10px] text-gray-500 font-medium">Available to collect</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-black text-gray-900 block">₹{walletState.availableCashLimit.toFixed(2)}</span>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
          </button>

          <div className="p-3">
            <button
              onClick={() => setShowDepositPopup(true)}
              className="w-full py-2.5 bg-gray-900 text-white rounded-lg font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-2 shadow-[0_2px_10px_rgba(0,0,0,0.15)]"
            >
              <PiggyBank className="w-4 h-4" /> Deposit Collection
            </button>
          </div>
        </div>

        {/* 6. QUICK LINKS GRID */}
        <div className="grid grid-cols-2 gap-3">
          <div onClick={() => navigate('/food/delivery/pocket/payout')} className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50 cursor-pointer flex flex-col justify-between">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 mb-2 border border-orange-100">
               <Receipt className="w-4 h-4" />
            </div>
            <p className="text-[10px] font-bold tracking-wider text-gray-400 uppercase">Last Payout</p>
            <p className="font-bold text-gray-900 text-sm">₹{walletState.payoutAmount}</p>
          </div>

          <div onClick={() => navigate('/food/delivery/pocket/limit-settlement')} className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50 cursor-pointer flex flex-col justify-between">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 mb-2 border border-emerald-100">
               <CreditCard className="w-4 h-4" />
            </div>
            <p className="text-xs font-bold text-gray-800 leading-tight">Settle Limits</p>
            <p className="text-[10px] text-gray-500 font-medium mt-0.5">Pay offline cash</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div onClick={() => navigate('/food/delivery/pocket/deductions')} className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50 cursor-pointer flex flex-col justify-between">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600 mb-2 border border-red-100">
               <FileText className="w-4 h-4" />
            </div>
            <p className="text-xs font-bold text-gray-800 leading-tight">Deductions</p>
            <p className="text-[10px] text-gray-500 font-medium mt-0.5">Penalties info</p>
          </div>

          <div onClick={() => navigate('/food/delivery/pocket/details')} className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50 cursor-pointer flex flex-col justify-between">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 mb-2 border border-blue-100">
               <LayoutGrid className="w-4 h-4" />
            </div>
            <p className="text-xs font-bold text-gray-800 leading-tight">Statement</p>
            <p className="text-[10px] text-gray-500 font-medium mt-0.5">All transactions</p>
          </div>
        </div>
      </div>

      {/* DEPOSIT MODAL (COMPACT) */}
      <AnimatePresence>
        {showDepositPopup && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDepositPopup(false)} className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl">
              
              <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 text-blue-600">
                      <IndianRupee className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-gray-900">Deposit Cash</h3>
                      <p className="text-[10px] text-gray-500 font-medium">Settle outstanding hands</p>
                    </div>
                 </div>
                 <button onClick={() => setShowDepositPopup(false)} className="p-1.5 rounded-lg bg-gray-50 text-gray-500 hover:bg-gray-100">
                    <X className="w-4 h-4" />
                 </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-100">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold text-gray-600">Cash in Hand</span>
                  <span className="text-sm font-bold text-gray-900">₹{walletState.cashInHand}</span>
                </div>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="Deposit amount"
                    className="w-full bg-white border border-gray-200 rounded-lg py-2.5 pl-9 pr-3 text-sm font-bold outline-none focus:border-gray-400 transition-colors"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-2 text-center font-medium">Min deposit ₹1 • Live update</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDepositPopup(false)}
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 font-bold text-gray-600 text-sm active:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeposit}
                  disabled={depositing}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-bold text-sm active:scale-95 disabled:bg-gray-300 disabled:shadow-none flex items-center justify-center gap-2 transition-all shadow-[0_2px_10px_rgba(37,99,235,0.3)]"
                >
                  {depositing && <Loader2 className="w-4 h-4 animate-spin" />}
                  {depositing ? 'Paying...' : 'Verify Pay'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PocketV2;
