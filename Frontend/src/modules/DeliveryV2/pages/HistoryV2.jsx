import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, ChevronDown, Loader2, Gift, X,
  Clock, Search, TrendingUp, Wallet, ChevronLeft, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../hooks/useDeliveryBackNavigation';
import BRAND_THEME from '@/config/brandTheme';

// ─── helpers ────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

const toDateStr = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const formatDay = (date) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const label = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (date.toDateString() === today.toDateString()) return `Today, ${label}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${label}`;
  return label;
};

const getWeekRange = (date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: mon, end: sun };
};

const formatWeekLabel = (date) => {
  const { start, end } = getWeekRange(date);
  const s = start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const e = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${s} – ${e}`;
};

const formatMonthLabel = (date) =>
  date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

// ─── component ──────────────────────────────────────────────────────────────

export const HistoryV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [activeTab, setActiveTab] = useState('daily');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTripType, setSelectedTripType] = useState('ALL TRIPS');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTripTypePicker, setShowTripTypePicker] = useState(false);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusTransactions, setBonusTransactions] = useState([]);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusLoaded, setBonusLoaded] = useState(false);

  const tripTypes = ['ALL TRIPS', 'Completed', 'Pending'];

  // ── fetch trips ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchTrips = async () => {
      setLoading(true);
      try {
        const params = {
          period: activeTab,
          date: toDateStr(selectedDate),
          status: selectedTripType !== 'ALL TRIPS' ? selectedTripType : undefined,
          limit: 1000,
        };
        const response = await deliveryAPI.getTripHistory(params);
        if (response.data?.success) {
          setTrips(response.data.data.trips || []);
        }
      } catch {
        toast.error('Failed to load history');
      } finally {
        setLoading(false);
      }
    };
    fetchTrips();
  }, [selectedDate, activeTab, selectedTripType]);

  // ── fetch bonus on modal open ──────────────────────────────────────────────
  useEffect(() => {
    if (!showBonusModal || bonusLoaded) return;
    const fetchBonus = async () => {
      setBonusLoading(true);
      try {
        const res = await deliveryAPI.getWalletTransactions({ type: 'bonus', limit: 50 });
        if (res.data?.success) {
          setBonusTransactions(res.data.data.transactions || []);
          setBonusLoaded(true);
        }
      } catch {
        toast.error('Failed to load bonuses');
      } finally {
        setBonusLoading(false);
      }
    };
    fetchBonus();
  }, [showBonusModal, bonusLoaded]);

  // ── date navigation ────────────────────────────────────────────────────────
  const shiftDate = (dir) => {
    const d = new Date(selectedDate);
    if (activeTab === 'daily') d.setDate(d.getDate() + dir);
    else if (activeTab === 'weekly') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    if (d <= new Date()) setSelectedDate(d);
  };

  const isAtToday = useMemo(() => {
    const today = new Date();
    if (activeTab === 'daily') return selectedDate.toDateString() === today.toDateString();
    if (activeTab === 'weekly') {
      const { end } = getWeekRange(selectedDate);
      const { end: todayEnd } = getWeekRange(today);
      return end.toDateString() === todayEnd.toDateString();
    }
    return selectedDate.getMonth() === today.getMonth() && selectedDate.getFullYear() === today.getFullYear();
  }, [selectedDate, activeTab]);

  // ── date picker list ───────────────────────────────────────────────────────
  const datePickerItems = useMemo(() => {
    if (activeTab === 'daily') {
      return [...Array(30)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d;
      });
    }
    if (activeTab === 'weekly') {
      return [...Array(12)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i * 7);
        return d;
      });
    }
    // monthly
    return [...Array(12)].map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      d.setDate(1);
      return d;
    });
  }, [activeTab]);

  const isSamePeriod = (a, b) => {
    if (activeTab === 'daily') return a.toDateString() === b.toDateString();
    if (activeTab === 'weekly') {
      const ra = getWeekRange(a), rb = getWeekRange(b);
      return ra.start.toDateString() === rb.start.toDateString();
    }
    return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  };

  const dateLabel = (d) => {
    if (activeTab === 'daily') return formatDay(d);
    if (activeTab === 'weekly') return formatWeekLabel(d);
    return formatMonthLabel(d);
  };

  const currentLabel = dateLabel(selectedDate);

  // ── metrics ────────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    return trips.reduce(
      (acc, trip) => {
        const isCompensatedNoResponse =
          trip.status === 'Cancelled' &&
          (trip.isCompensatedCancellation === true ||
            String(trip.rawOrderStatus || '').toLowerCase() === 'cancelled_by_user_unavailable');

        if (trip.status === 'Completed' || isCompensatedNoResponse) {
          acc.earnings += Number(trip.deliveryEarning || trip.earningAmount || trip.amount || 0);
          const isCOD = ['cash', 'cod'].includes((trip.paymentMethod || '').toLowerCase());
          if (isCOD) acc.cod += Number(trip.codCollectedAmount || 0);
          if (trip.status === 'Completed') acc.completed += 1;
        }
        if (trip.status === 'Cancelled') acc.cancelled += 1;
        return acc;
      },
      { earnings: 0, cod: 0, completed: 0, cancelled: 0 }
    );
  }, [trips]);

  // ── helpers ────────────────────────────────────────────────────────────────
  const extractItems = (trip) => {
    const items = trip.items || trip.orderItems || [];
    if (!items.length) return 'Standard Delivery';
    const first = items[0];
    const name = first.name || first.itemName || 'Item';
    const qty = first.quantity || first.qty || 1;
    return `${qty}x ${name}${items.length > 1 ? ` +${items.length - 1} more` : ''}`;
  };

  const getStatusStyle = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'completed') return { text: 'text-green-600', bg: 'bg-green-50', label: 'Completed' };
    if (s === 'cancelled') return { text: 'text-red-500', bg: 'bg-red-50', label: 'Cancelled' };
    return { text: 'text-orange-500', bg: 'bg-orange-50', label: status || 'Pending' };
  };

  const formatTripTime = (trip) => {
    if (!trip.date && !trip.deliveredAt && !trip.createdAt) return '--';
    const d = new Date(trip.date || trip.deliveredAt || trip.createdAt);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    if (isToday || activeTab === 'daily') return timeStr;
    return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${timeStr}`;
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-32" style={{ fontFamily: "'Poppins', sans-serif" }}>

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-[100]">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 active:scale-90 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-bold text-gray-900">Trip History</h1>
            <p className="text-[10px] text-gray-500 font-medium">Your delivery records</p>
          </div>
        </div>
        <button
          onClick={() => setShowBonusModal(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white active:scale-90 transition-all relative"
          style={{ backgroundColor: BRAND_THEME.colors.brand.primary }}
        >
          <Gift className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white px-4 flex items-center gap-6 sticky top-[57px] z-[90] border-b border-gray-100">
        {['daily', 'weekly', 'monthly'].map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSelectedDate(new Date()); }}
            className={`py-3 text-sm font-semibold capitalize relative transition-colors ${activeTab === tab ? 'text-gray-900' : 'text-gray-400'
              }`}
          >
            {tab}
            {activeTab === tab && (
              <motion.div
                layoutId="tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ backgroundColor: BRAND_THEME.colors.brand.primary }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Filter Controls */}
      <div className="bg-white px-4 py-3 flex gap-3 sticky top-[108px] z-[80] border-b border-gray-50">
        {/* Date navigator */}
        <div className="flex-1 flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-xl px-2 py-2">
          <button
            onClick={() => shiftDate(-1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={() => { setShowDatePicker(!showDatePicker); setShowTripTypePicker(false); }}
            className="flex-1 flex items-center justify-center gap-1"
          >
            <span className="text-xs font-semibold text-gray-800 truncate">{currentLabel}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={() => shiftDate(1)}
            disabled={isAtToday}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${isAtToday ? 'opacity-30 cursor-not-allowed' : 'hover:bg-gray-200'}`}
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Trip type picker */}
        <button
          onClick={() => { setShowTripTypePicker(!showTripTypePicker); setShowDatePicker(false); }}
          className="w-[130px] px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-between"
        >
          <span className="text-xs font-semibold text-gray-800 truncate">{selectedTripType}</span>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showTripTypePicker ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Dropdowns */}
      <AnimatePresence>
        {showDatePicker && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="fixed left-4 right-4 top-[180px] z-[200] bg-white rounded-2xl shadow-xl border border-gray-100 max-h-[260px] overflow-y-auto p-2"
          >
            {datePickerItems.map((date, idx) => (
              <button
                key={idx}
                onClick={() => { setSelectedDate(date); setShowDatePicker(false); }}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${isSamePeriod(date, selectedDate)
                    ? 'font-bold text-white'
                    : 'text-gray-800 hover:bg-gray-50'
                  }`}
                style={isSamePeriod(date, selectedDate) ? { backgroundColor: BRAND_THEME.colors.brand.primary } : {}}
              >
                {dateLabel(date)}
              </button>
            ))}
          </motion.div>
        )}
        {showTripTypePicker && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="fixed right-4 top-[180px] w-44 z-[200] bg-white rounded-2xl shadow-xl border border-gray-100 p-2"
          >
            {tripTypes.map((type, idx) => (
              <button
                key={idx}
                onClick={() => { setSelectedTripType(type); setShowTripTypePicker(false); }}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-colors ${type === selectedTripType ? 'font-bold text-white' : 'text-gray-800 hover:bg-gray-50'
                  }`}
                style={type === selectedTripType ? { backgroundColor: BRAND_THEME.colors.brand.primary } : {}}
              >
                {type}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="px-4 py-4 space-y-4">

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                <Wallet className="w-3.5 h-3.5 text-orange-500" />
              </div>
              <p className="text-xs font-semibold text-gray-700">COD Collected</p>
            </div>
            <p className="text-xl font-bold text-gray-900">₹{metrics.cod.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-green-600" />
              </div>
              <p className="text-xs font-semibold text-gray-700">Earnings</p>
            </div>
            <p className="text-xl font-bold text-gray-900">₹{metrics.earnings.toFixed(2)}</p>
          </div>
        </div>

        {/* Trip count summary */}
        {!loading && trips.length > 0 && (
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500">
            <span>{trips.length} trips</span>
            {metrics.completed > 0 && <span className="text-green-600">• {metrics.completed} completed</span>}
            {metrics.cancelled > 0 && <span className="text-red-500">• {metrics.cancelled} cancelled</span>}
          </div>
        )}

        {/* Trip List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
            <p className="text-gray-500 text-xs font-medium">Fetching trips...</p>
          </div>
        ) : trips.length > 0 ? (
          <div className="space-y-3">
            {trips.map((trip, idx) => {
              const statusStyle = getStatusStyle(trip.status);
              const payout = Number(trip.deliveryEarning || trip.earningAmount || trip.amount || 0);
              const isCOD = ['cash', 'cod'].includes((trip.paymentMethod || '').toLowerCase());
              const codAmt = isCOD ? Number(trip.codCollectedAmount || 0) : 0;

              return (
                <div key={trip.orderId || trip._id || idx} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  {/* Top Row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 pr-2">
                      <h4 className="text-sm font-bold text-gray-900 truncate">#{trip.orderId || trip._id || 'N/A'}</h4>
                      <p className="text-xs font-medium text-gray-600 mt-0.5 truncate">{trip.restaurant || trip.restaurantName || '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{extractItems(trip)}</p>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${statusStyle.bg} ${statusStyle.text}`}>
                      {statusStyle.label}
                    </span>
                  </div>

                  {/* Payment Badge */}
                  <div className="mb-3">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${isCOD ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                      {isCOD ? 'COD' : 'Online'}
                    </span>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-3 pt-3 border-t border-gray-50">
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 mb-0.5">Time</p>
                      <p className="text-xs font-bold text-gray-900">{formatTripTime(trip)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-medium text-gray-400 mb-0.5">COD</p>
                      <p className="text-sm font-bold text-gray-900">₹{codAmt.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-medium text-gray-400 mb-0.5">Earning</p>
                      <p className="text-sm font-bold text-green-600">₹{payout.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Clock className="w-7 h-7 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">No Trips Found</p>
              <p className="text-xs text-gray-400 mt-0.5">No trips recorded for this period</p>
            </div>
          </div>
        )}
      </div>

      {/* Bonus Modal */}
      <AnimatePresence>
        {showBonusModal && (
          <div className="fixed inset-0 z-[1000] flex items-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBonusModal(false)}
              className="absolute inset-0 bg-black/50"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full bg-white rounded-t-3xl p-6 max-h-[80vh] flex flex-col"
            >
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6 shrink-0" />
              <div className="flex items-center justify-between mb-5 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                    <Gift className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">Incentive Records</h3>
                    <p className="text-xs text-gray-500">Extra bonuses credited by team</p>
                  </div>
                </div>
                <button onClick={() => setShowBonusModal(false)} className="p-2 text-gray-500 hover:text-gray-800">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
                {bonusLoading ? (
                  <div className="py-16 flex justify-center">
                    <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
                  </div>
                ) : bonusTransactions.length > 0 ? (
                  bonusTransactions.map((tx, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex justify-between items-center">
                      <div>
                        <p className="text-base font-bold text-gray-900">₹{Number(tx.amount || 0).toFixed(2)}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{tx.description || 'Bonus Payout'}</p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(tx.createdAt || tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">
                        Credited
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-16 text-center flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                      <Search className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-bold text-gray-700">No bonuses yet</p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowBonusModal(false)}
                className="w-full py-4 bg-gray-900 text-white rounded-2xl font-bold text-sm mt-5 shrink-0 active:scale-95 transition-all"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HistoryV2;
