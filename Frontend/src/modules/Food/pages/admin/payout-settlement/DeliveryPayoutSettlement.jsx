import { useMemo, useState } from "react"
import { CalendarRange, CheckCircle2, CircleDollarSign, Receipt, Search } from "lucide-react"
import { toast } from "sonner"

const todayISO = new Date().toISOString().split("T")[0]

const seedRows = [
  {
    beneficiaryId: "DLV-1001",
    beneficiaryName: "Rahul Verma",
    ordersCount: 34,
    totalEarning: 13240,
    alreadyPaid: 8000,
    payableNow: 5240,
    lastSettledToDate: "2026-04-14",
  },
  {
    beneficiaryId: "DLV-1002",
    beneficiaryName: "Aman Kumar",
    ordersCount: 29,
    totalEarning: 9840,
    alreadyPaid: 9840,
    payableNow: 0,
    lastSettledToDate: "2026-04-21",
  },
  {
    beneficiaryId: "DLV-1003",
    beneficiaryName: "Sakshi Singh",
    ordersCount: 26,
    totalEarning: 11190,
    alreadyPaid: 5400,
    payableNow: 5790,
    lastSettledToDate: "2026-04-10",
  },
]

const toCurrency = (amount = 0) =>
  `Rs ${Number(amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const toDisplayDate = (value = "") => {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-CA")
}

export default function DeliveryPayoutSettlement() {
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [rows, setRows] = useState(seedRows)

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => {
      return (
        String(row.beneficiaryName || "").toLowerCase().includes(query) ||
        String(row.beneficiaryId || "").toLowerCase().includes(query)
      )
    })
  }, [rows, searchQuery])

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.totalEarning += Number(row.totalEarning || 0)
        acc.totalPaid += Number(row.alreadyPaid || 0)
        acc.totalPending += Number(row.payableNow || 0)
        return acc
      },
      { totalEarning: 0, totalPaid: 0, totalPending: 0 },
    )
  }, [filteredRows])

  const handleValidateDateRange = () => {
    if (fromDate && toDate && fromDate > toDate) {
      toast.error("Start date cannot be after end date")
      return false
    }
    if (fromDate && fromDate > todayISO) {
      toast.error("Start date cannot be in the future")
      return false
    }
    if (toDate && toDate > todayISO) {
      toast.error("End date cannot be in the future")
      return false
    }
    return true
  }

  const handleMarkAllPaid = () => {
    if (!handleValidateDateRange()) return
    if (!fromDate || !toDate) {
      toast.error("Select both start and end date before marking paid")
      return
    }

    const unpaidRows = filteredRows.filter((row) => Number(row.payableNow || 0) > 0)
    if (unpaidRows.length === 0) {
      toast.info("No unpaid amount in current list")
      return
    }

    const totalUnpaid = unpaidRows.reduce((sum, row) => sum + Number(row.payableNow || 0), 0)
    const confirmText = `Mark all as paid for ${unpaidRows.length} delivery partners (${toCurrency(totalUnpaid)}) for ${fromDate} to ${toDate}?`
    if (!window.confirm(confirmText)) return

    const unpaidIds = new Set(unpaidRows.map((row) => row.beneficiaryId))
    setRows((prev) =>
      prev.map((row) => {
        if (!unpaidIds.has(row.beneficiaryId)) return row
        const unpaid = Number(row.payableNow || 0)
        const currentPaid = Number(row.alreadyPaid || 0)
        return {
          ...row,
          alreadyPaid: currentPaid + unpaid,
          payableNow: 0,
          lastSettledToDate: toDate,
        }
      }),
    )
    toast.success("All visible delivery partners marked paid in frontend preview")
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Payout Settlement - Delivery</h1>
              <p className="text-sm text-slate-600 mt-1">Date range select karke delivery partner wise pending payout settle karein.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Settlement Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Start Date</label>
              <input
                type="date"
                max={todayISO}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
              <input
                type="date"
                max={todayISO}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Search Delivery Partner</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Name ya ID search karein"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-slate-600">
              <CircleDollarSign className="w-4 h-4" />
              <p className="text-sm font-medium">Total Earning</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{toCurrency(summary.totalEarning)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              <p className="text-sm font-medium">Total Paid</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{toCurrency(summary.totalPaid)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-amber-700">
              <CalendarRange className="w-4 h-4" />
              <p className="text-sm font-medium">Pending (Unpaid)</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-amber-700">{toCurrency(summary.totalPending)}</p>
          </div>
        </div>
        <div className="flex justify-end mb-4">
          <button
            type="button"
            onClick={handleMarkAllPaid}
            disabled={Number(summary.totalPending || 0) <= 0}
            className="px-4 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Mark All Paid
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Delivery Partner</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Orders</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Total Earning</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Paid</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Unpaid</th>
                  <th className="px-5 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Last Settled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center text-sm text-slate-500">
                      No delivery partner found for current filters.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.beneficiaryId} className="hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">{row.beneficiaryName}</p>
                        <p className="text-xs text-slate-500">{row.beneficiaryId}</p>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{row.ordersCount}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-900">{toCurrency(row.totalEarning)}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-emerald-700">{toCurrency(row.alreadyPaid)}</td>
                      <td className="px-5 py-4 text-sm font-semibold text-amber-700">{toCurrency(row.payableNow)}</td>
                      <td className="px-5 py-4 text-sm text-slate-700">{toDisplayDate(row.lastSettledToDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
