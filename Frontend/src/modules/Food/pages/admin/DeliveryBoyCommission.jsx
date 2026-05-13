import { useEffect, useMemo, useState } from "react"
import { Check, Columns, Edit, IndianRupee, Loader2, Settings, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { adminAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import { toast } from "sonner"
import BRAND_THEME from "@/config/brandTheme"

const debugError = (...args) => {}

const emptyForm = {
  name: "Base payout",
  basePayout: "",
}

export default function DeliveryBoyCommission() {
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isAddEditOpen, setIsAddEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [selectedCommission, setSelectedCommission] = useState(null)
  const [formData, setFormData] = useState(emptyForm)
  const [formErrors, setFormErrors] = useState({})
  const [visibleColumns, setVisibleColumns] = useState({
    si: true,
    name: true,
    basePayout: true,
    actions: true,
  })

  const currentCommission = commissions[0] || null
  const tableRows = useMemo(() => (currentCommission ? [currentCommission] : []), [currentCommission])

  useEffect(() => {
    fetchCommissionRules()
  }, [])

  const fetchCommissionRules = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getCommissionRules()
      const list =
        response?.data?.data?.commissions ||
        response?.data?.commissions ||
        []

      setCommissions(
        Array.isArray(list)
          ? list.slice(0, 1).map((commission, index) => ({
              ...commission,
              name: commission.name || "Base payout",
              sl: index + 1,
            }))
          : [],
      )
    } catch (error) {
      debugError("Error fetching commission rules:", error)
      if (error.code === "ERR_NETWORK" || error.message === "Network Error") {
        toast.error(`Cannot connect to backend server. Please ensure the backend is running on ${API_BASE_URL.replace("/api", "")}`)
      } else {
        toast.error(error.response?.data?.message || error.message || "Failed to fetch commission rules")
      }
      setCommissions([])
    } finally {
      setLoading(false)
    }
  }

  const openForm = (commission = currentCommission) => {
    setSelectedCommission(commission || null)
    setFormData({
      name: commission?.name || "Base payout",
      basePayout: commission?.basePayout != null ? String(commission.basePayout) : "",
    })
    setFormErrors({})
    setIsAddEditOpen(true)
  }

  const validateForm = () => {
    const errors = {}
    const basePayout = Number(formData.basePayout)
    if (formData.basePayout === "" || !Number.isFinite(basePayout) || basePayout < 0) {
      errors.basePayout = "Base payout must be 0 or greater"
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const normalizeCommissionResponse = (response) =>
    response?.data?.data?.commission || response?.data?.commission || null

  const handleSave = async () => {
    if (!validateForm()) return

    const payload = {
      name: formData.name.trim() || "Base payout",
      basePayout: Number(formData.basePayout),
      minDistance: 0,
      maxDistance: null,
      commissionPerKm: 0,
      status: selectedCommission ? selectedCommission.status : true,
    }

    try {
      setSaving(true)
      const response = selectedCommission?._id
        ? await adminAPI.updateCommissionRule(selectedCommission._id, payload)
        : await adminAPI.createCommissionRule(payload)

      const commission = normalizeCommissionResponse(response)
      if (commission) {
        setCommissions([{ ...commission, name: commission.name || "Base payout", sl: 1 }])
      } else {
        await fetchCommissionRules()
      }
      toast.success("Base payout saved successfully")
      setIsAddEditOpen(false)
      setSelectedCommission(null)
      setFormData(emptyForm)
    } catch (error) {
      debugError("Error saving commission rule:", error)
      const message = error.response?.data?.message || error.message || "Failed to save base payout"
      toast.error(message)
      if (message.toLowerCase().includes("base payout")) {
        setFormErrors({ basePayout: message })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (commission) => {
    setSelectedCommission(commission)
    setIsDeleteOpen(true)
  }

  const confirmDelete = async () => {
    if (!selectedCommission?._id) return

    try {
      setDeleting(true)
      await adminAPI.deleteCommissionRule(selectedCommission._id)
      setCommissions([])
      setIsDeleteOpen(false)
      setSelectedCommission(null)
      toast.success("Base payout deleted")
    } catch (error) {
      debugError("Error deleting commission rule:", error)
      toast.error(error.response?.data?.message || "Failed to delete base payout")
    } finally {
      setDeleting(false)
    }
  }

  const resetColumns = () => {
    setVisibleColumns({
      si: true,
      name: true,
      basePayout: true,
      actions: true,
    })
  }

  const columnsConfig = {
    si: "Serial Number",
    name: "Name",
    basePayout: "Base Payout",
    actions: "Actions",
  }

  const visibleColumnCount = Object.values(visibleColumns).filter(Boolean).length

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <IndianRupee className="w-5 h-5 text-slate-600" />
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">Delivery Boy Commission</h1>
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
                  {currentCommission ? "Set" : "Not set"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => openForm()}
                className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-all shadow-sm"
                style={{ background: BRAND_THEME.colors.brand.primary }}
              >
                {currentCommission ? "Update Base Payout" : "Set Base Payout"}
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-all"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mb-4 p-4 bg-brand-50 border border-brand-200 rounded-lg">
            <div className="flex items-start gap-3">
              <IndianRupee className="w-5 h-5 text-brand-600 mt-0.5" />
              <div className="text-sm text-slate-700">
                <p className="font-semibold text-brand-900 mb-1">Single Base Payout</p>
                <p className="text-slate-600">
                  Delivery partner earning is calculated only from <strong>Base Payout</strong>. Distance and map API values are not used for this commission.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {visibleColumns.si && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">SI</th>}
                  {visibleColumns.name && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Name</th>}
                  {visibleColumns.basePayout && <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Base Payout</th>}
                  {visibleColumns.actions && <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Action</th>}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={visibleColumnCount} className="px-6 py-8 text-center">
                      <div className="flex items-center justify-center gap-2 text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Loading base payout...</span>
                      </div>
                    </td>
                  </tr>
                ) : tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumnCount} className="px-6 py-8 text-center text-slate-500">
                      No base payout set
                    </td>
                  </tr>
                ) : (
                  tableRows.map((commission) => (
                    <tr key={commission._id || commission.sl} className="hover:bg-slate-50 transition-colors">
                      {visibleColumns.si && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-slate-700">{commission.sl}</span>
                        </td>
                      )}
                      {visibleColumns.name && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-slate-900">{commission.name || "Base payout"}</span>
                        </td>
                      )}
                      {visibleColumns.basePayout && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-semibold text-brand-700">{"\u20B9"}{Number(commission.basePayout || 0).toFixed(2)}</span>
                        </td>
                      )}
                      {visibleColumns.actions && (
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openForm(commission)}
                              className="p-1.5 rounded text-brand-600 hover:bg-brand-50 transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(commission)}
                              className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={isAddEditOpen} onOpenChange={setIsAddEditOpen}>
        <DialogContent className="max-w-md bg-white p-0 opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:scale-100 data-[state=closed]:scale-100">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>{selectedCommission ? "Update Base Payout" : "Set Base Payout"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm ${
                  formErrors.name ? "border-red-500" : "border-slate-300"
                }`}
                placeholder="Base payout"
              />
              {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Base Payout ({"\u20B9"}) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.basePayout}
                onChange={(e) => setFormData({ ...formData, basePayout: e.target.value })}
                className={`w-full px-4 py-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm ${
                  formErrors.basePayout ? "border-red-500" : "border-slate-300"
                }`}
                placeholder="e.g., 25"
              />
              {formErrors.basePayout && <p className="text-xs text-red-500 mt-1">{formErrors.basePayout}</p>}
              <p className="text-xs text-slate-500 mt-1">This fixed amount is used for every food order delivery earning.</p>
            </div>
          </div>
          <DialogFooter className="px-6 pb-6">
            <button
              onClick={() => setIsAddEditOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="max-w-md bg-white p-0 opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:scale-100 data-[state=closed]:scale-100">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>Delete Base Payout</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6">
            <p className="text-sm text-slate-700">Are you sure you want to delete this base payout?</p>
          </div>
          <DialogFooter className="px-6 pb-6">
            <button
              onClick={() => setIsDeleteOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md bg-white p-0 opacity-0 data-[state=open]:opacity-100 data-[state=closed]:opacity-0 transition-opacity duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:scale-100 data-[state=closed]:scale-100">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Table Settings
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Columns className="w-4 h-4" />
                Visible Columns
              </h3>
              <div className="space-y-2">
                {Object.entries(columnsConfig).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleColumns[key]}
                      onChange={() => setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))}
                      className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-700">{label}</span>
                    {visibleColumns[key] && <Check className="w-4 h-4 text-emerald-600 ml-auto" />}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={resetColumns}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all"
              >
                Reset
              </button>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all shadow-md"
              >
                Apply
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
