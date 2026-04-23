import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Loader2, Clock, TrendingUp, Wallet, Download } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import useDeliveryBackNavigation from '../hooks/useDeliveryBackNavigation';

const pad = (n) => String(n).padStart(2, '0');

const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const getTripDate = (trip) => {
  const raw = trip?.date || trip?.deliveredAt || trip?.createdAt || trip?.updatedAt;
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

const getTripIdentity = (trip) =>
  String(
    trip?.orderMongoId ||
      trip?._id ||
      trip?.orderId ||
      trip?.id ||
      '',
  ).trim();

const getStatusStyle = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'completed' || s === 'delivered') return { text: 'text-green-600', bg: 'bg-green-50', label: 'Completed' };
  if (s === 'cancelled' || s === 'rejected') return { text: 'text-red-500', bg: 'bg-red-50', label: 'Cancelled' };
  return { text: 'text-orange-500', bg: 'bg-orange-50', label: status || 'Pending' };
};

const formatTripTime = (trip) => {
  const d = getTripDate(trip);
  if (!d) return '--';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const isCashLike = (trip) => ['cash', 'cod'].includes(String(trip?.paymentMethod || '').toLowerCase());
const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const HistoryV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const navigate = useNavigate();

  const today = new Date();

  const [singleDate, setSingleDate] = useState(toDateStr(today));
  const [selectedTripType, setSelectedTripType] = useState('ALL TRIPS');

  const [allTrips, setAllTrips] = useState([]);
  const [loading, setLoading] = useState(false);

  const tripTypes = ['ALL TRIPS', 'Completed', 'Cancelled', 'Pending'];

  useEffect(() => {
    const fetchTrips = async () => {
      setLoading(true);
      try {
        // Use month bucket + status-wise fetch so delivered trips appear by deliveredAt date
        // (matches Pocket details behavior better than ALL_TRIPS daily fetch by createdAt).
        const responses = await Promise.allSettled([
          deliveryAPI.getTripHistory({ status: 'Completed', period: 'monthly', date: singleDate, limit: 1000 }),
          deliveryAPI.getTripHistory({ status: 'Cancelled', period: 'monthly', date: singleDate, limit: 1000 }),
          deliveryAPI.getTripHistory({ status: 'Pending', period: 'monthly', date: singleDate, limit: 1000 }),
        ]);

        const merged = [];
        for (const result of responses) {
          if (result.status !== 'fulfilled') continue;
          const trips = result?.value?.data?.data?.trips || [];
          if (Array.isArray(trips)) merged.push(...trips);
        }

        const unique = new Map();
        for (const trip of merged) {
          const id = getTripIdentity(trip) || String(trip?._id || trip?.id || '');
          if (!id) continue;
          if (!unique.has(id)) unique.set(id, trip);
        }
        setAllTrips(Array.from(unique.values()));
      } catch {
        toast.error('Failed to load history');
        setAllTrips([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTrips();
  }, [singleDate]);

  const filteredTrips = useMemo(() => {
    const startOfDay = (dateStr) => {
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const endOfDay = (dateStr) => {
      const d = new Date(dateStr);
      d.setHours(23, 59, 59, 999);
      return d;
    };

    const singleStart = startOfDay(singleDate);
    const singleEnd = endOfDay(singleDate);

    return allTrips
      .filter((trip) => {
        const tripDate = getTripDate(trip);
        if (!tripDate) return false;

        if (selectedTripType !== 'ALL TRIPS') {
          const normalized = String(trip?.status || '').toLowerCase();
          if (selectedTripType === 'Completed' && !['completed', 'delivered'].includes(normalized)) return false;
          if (selectedTripType === 'Cancelled' && !['cancelled', 'rejected'].includes(normalized)) return false;
          if (selectedTripType === 'Pending' && ['completed', 'delivered', 'cancelled', 'rejected'].includes(normalized)) return false;
        }

        return tripDate >= singleStart && tripDate <= singleEnd;
      })
      .sort((a, b) => {
        const left = getTripDate(a)?.getTime() || 0;
        const right = getTripDate(b)?.getTime() || 0;
        return right - left;
      });
  }, [allTrips, singleDate, selectedTripType]);

  const metrics = useMemo(() => {
    return filteredTrips.reduce(
      (acc, trip) => {
        const status = String(trip?.status || '').toLowerCase();
        const earning = Number(trip?.deliveryEarning || trip?.earningAmount || trip?.amount || 0);
        const codAmt = isCashLike(trip) ? Number(trip?.codCollectedAmount || 0) : 0;

        if (['completed', 'delivered'].includes(status)) {
          acc.earnings += earning;
          acc.completed += 1;
        }
        if (['cancelled', 'rejected'].includes(status)) acc.cancelled += 1;

        acc.cod += codAmt;
        return acc;
      },
      { earnings: 0, cod: 0, completed: 0, cancelled: 0 },
    );
  }, [filteredTrips]);

  const openOrder = (trip) => {
    const orderId = getTripIdentity(trip);
    if (!orderId) {
      toast.error('Order ID not available');
      return;
    }
    navigate(`/food/delivery/orders/${orderId}`);
  };

  const handleDownloadExcel = () => {
    if (!filteredTrips.length) {
      toast.error('No rows to export');
      return;
    }

    const headers = [
      'Order ID',
      'Date Time',
      'Restaurant',
      'Status',
      'Payment',
      'COD',
      'Earning',
    ];

    const rows = filteredTrips.map((trip) => {
      const id = getTripIdentity(trip);
      const status = getStatusStyle(trip?.status).label;
      const cod = isCashLike(trip) ? Number(trip?.codCollectedAmount || 0).toFixed(2) : '0.00';
      const earning = Number(trip?.deliveryEarning || trip?.earningAmount || trip?.amount || 0).toFixed(2);
      const payment = isCashLike(trip) ? 'COD' : 'Online';
      return [
        id,
        formatTripTime(trip),
        trip?.restaurant || trip?.restaurantName || '-',
        status,
        payment,
        cod,
        earning,
      ];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = toDateStr(new Date());
    link.href = url;
    link.download = `delivery-history-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('Excel sheet downloaded');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32" style={{ fontFamily: "'Poppins', sans-serif" }}>
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
            <p className="text-[10px] text-gray-500 font-medium">Filter by date and open order details</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownloadExcel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] font-semibold text-gray-700"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
      </div>

      <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-3 sticky top-[66px] z-[90]">
        <div>
          <label className="text-[11px] font-semibold text-gray-600">One Day</label>
          <input
            type="date"
            value={singleDate}
            max={toDateStr(new Date())}
            onChange={(e) => setSingleDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-gray-600">Trip Status</label>
          <select
            value={selectedTripType}
            onChange={(e) => setSelectedTripType(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
          >
            {tripTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                <Wallet className="w-3.5 h-3.5 text-orange-500" />
              </div>
              <p className="text-xs font-semibold text-gray-700">COD Collected</p>
            </div>
            <p className="text-xl font-bold text-gray-900">Rs {metrics.cod.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-green-600" />
              </div>
              <p className="text-xs font-semibold text-gray-700">Earnings</p>
            </div>
            <p className="text-xl font-bold text-gray-900">Rs {metrics.earnings.toFixed(2)}</p>
          </div>
        </div>

        {!loading && filteredTrips.length > 0 && (
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500">
            <span>{filteredTrips.length} trips</span>
            {metrics.completed > 0 && <span className="text-green-600">- {metrics.completed} completed</span>}
            {metrics.cancelled > 0 && <span className="text-red-500">- {metrics.cancelled} cancelled</span>}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
            <p className="text-gray-500 text-xs font-medium">Fetching trips...</p>
          </div>
        ) : filteredTrips.length > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[780px] w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Order ID</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Date/Time</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Restaurant</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Payment</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600">COD</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600">Earning</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.map((trip, idx) => {
                    const id = getTripIdentity(trip) || `row-${idx}`;
                    const statusStyle = getStatusStyle(trip?.status);
                    const cod = isCashLike(trip) ? Number(trip?.codCollectedAmount || 0) : 0;
                    const earning = Number(trip?.deliveryEarning || trip?.earningAmount || trip?.amount || 0);
                    return (
                      <tr
                        key={id}
                        onClick={() => openOrder(trip)}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 py-3 font-semibold text-gray-900">#{id.slice(-10)}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatTripTime(trip)}</td>
                        <td className="px-4 py-3 text-gray-700">{trip?.restaurant || trip?.restaurantName || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusStyle.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{isCashLike(trip) ? 'COD' : 'Online'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">Rs {cod.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">Rs {earning.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-100">Tap any row to open that order detail.</p>
          </div>
        ) : (
          <div className="py-16 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Clock className="w-7 h-7 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">No Trips Found</p>
              <p className="text-xs text-gray-400 mt-0.5">No trips for current filters. Try changing date range or trip status.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryV2;
