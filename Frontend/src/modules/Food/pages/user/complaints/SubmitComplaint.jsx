import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Input } from "@food/components/ui/input"
import { Textarea } from "@food/components/ui/textarea"
import { Button } from "@food/components/ui/button"
import BRAND_THEME from "@/config/brandTheme"

export default function SubmitComplaint() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ subject: "", description: "", orderId: "" })
  const [error, setError] = useState("")
  const isValid = form.subject.trim().length >= 3 && form.description.trim().length >= 10

  const handleChange = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    if (!isValid) {
      setError("Please add a subject (min 3 chars) and description (min 10 chars)")
      return
    }
    setError("")
    // TODO: hook to complaints API
    navigate(-1)
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-gray-100 p-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-gray-900">Submit a Complaint</h1>
          <p className="text-sm text-gray-600">Tell us what went wrong. We’ll review and get back to you.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Subject</label>
            <Input
              value={form.subject}
              onChange={(e) => handleChange("subject", e.target.value)}
              placeholder="Short title"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Order ID (optional)</label>
            <Input
              value={form.orderId}
              onChange={(e) => handleChange("orderId", e.target.value)}
              placeholder="Enter order ID if related"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Description</label>
            <Textarea
              rows={5}
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Describe the issue in detail"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <Button
          disabled={!isValid}
          onClick={handleSubmit}
          className="w-full h-12 text-white font-semibold"
          style={{ background: BRAND_THEME.gradients.primary, boxShadow: `0 12px 28px -18px ${BRAND_THEME.colors.brand.primaryDark}` }}
        >
          Submit
        </Button>
      </div>
    </div>
  )
}
