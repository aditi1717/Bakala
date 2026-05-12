import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Loader2, Camera, Image as ImageIcon } from "lucide-react"
import { toast } from "sonner"
import { deliveryAPI } from "@food/api"
import { clearModuleAuth } from "@food/utils/auth"
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation"
import { openCamera } from "@food/utils/imageUploadUtils"

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  vehicleType: "",
  vehicleName: "",
  vehicleNumber: "",
  drivingLicenseNumber: "",
  aadharNumber: "",
  panNumber: "",
  accountHolderName: "",
  accountNumber: "",
  ifscCode: "",
  bankName: "",
  upiId: "",
}

export const ProfileDetailsV2 = () => {
  const navigate = useNavigate()
  const goBack = useDeliveryBackNavigation()
  const profilePhotoInputRef = useRef(null)
  const aadharInputRef = useRef(null)
  const panInputRef = useRef(null)
  const drivingInputRef = useRef(null)
  const upiQrInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState("")
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [editingBasic, setEditingBasic] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(false)
  const [editingDocuments, setEditingDocuments] = useState(false)
  const [editingBank, setEditingBank] = useState(false)

  const profileImageUrl = profile?.profileImage?.url || profile?.profilePhoto || null
  const aadharNumber = profile?.documents?.aadhar?.number || profile?.aadharNumber || "Not added"
  const panNumber = profile?.documents?.pan?.number || profile?.panNumber || "Not added"
  const drivingNumber = profile?.documents?.drivingLicense?.number || profile?.drivingLicenseNumber || "Not added"
  const aadharPhotoUrl = profile?.documents?.aadhar?.document || null
  const panPhotoUrl = profile?.documents?.pan?.document || null
  const drivingPhotoUrl = profile?.documents?.drivingLicense?.document || null
  const upiQrUrl = profile?.documents?.bankDetails?.upiQrCode || null

  const applyProfile = (p) => {
    setProfile(p)
    setForm({
      name: p?.name || "",
      phone: p?.phone || "",
      email: p?.email || "",
      address: p?.location?.addressLine1 || p?.address || "",
      city: p?.location?.city || p?.city || "",
      state: p?.location?.state || p?.state || "",
      vehicleType: p?.vehicle?.type || p?.vehicleType || "",
      vehicleName: p?.vehicle?.brand || p?.vehicleName || "",
      vehicleNumber: p?.vehicle?.number || p?.vehicleNumber || "",
      drivingLicenseNumber: p?.documents?.drivingLicense?.number || p?.drivingLicenseNumber || "",
      aadharNumber: p?.documents?.aadhar?.number || p?.aadharNumber || "",
      panNumber: p?.documents?.pan?.number || p?.panNumber || "",
      accountHolderName: p?.documents?.bankDetails?.accountHolderName || "",
      accountNumber: p?.documents?.bankDetails?.accountNumber || "",
      ifscCode: p?.documents?.bankDetails?.ifscCode || "",
      bankName: p?.documents?.bankDetails?.bankName || "",
      upiId: p?.documents?.bankDetails?.upiId || "",
    })
  }

  const refresh = async () => {
    const profileRes = await deliveryAPI.getProfile()
    const p = profileRes?.data?.data?.profile
    if (!p) throw new Error("Failed to load profile")
    applyProfile(p)
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        await refresh()
      } catch (e) {
        if (e?.response?.status === 401) {
          toast.error("Session expired. Please login again.")
          navigate("/food/delivery/login", { replace: true })
          return
        }
        toast.error("Failed to load profile")
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [navigate])

  const onInput = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const resetFromProfile = () => {
    if (profile) applyProfile(profile)
  }

  const handleReapprovalRedirect = (response, message = "Profile updated and sent for approval. Please login again after approval.") => {
    const requiresReapproval =
      response?.data?.data?.partner?.requiresReapproval ||
      response?.data?.data?.requiresReapproval ||
      false
    if (!requiresReapproval) return false
    clearModuleAuth("delivery")
    localStorage.removeItem("app:isOnline")
    toast.success(message)
    navigate("/food/delivery/login", { replace: true })
    return true
  }

  const uploadSingleFile = async (field, file) => {
    if (!file) return
    try {
      setUploading(field)
      const fd = new FormData()
      fd.append(field, file)
      const response = await deliveryAPI.updateProfileMultipart(fd)
      if (handleReapprovalRedirect(response)) return
      await refresh()
      toast.success("Updated")
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading("")
    }
  }

  const saveBasicDetails = async () => {
    try {
      setSaving(true)
      const fd = new FormData()
      fd.append("name", String(form.name || "").trim())
      fd.append("email", String(form.email || "").trim())
      fd.append("address", String(form.address || "").trim())
      fd.append("city", String(form.city || "").trim())
      fd.append("state", String(form.state || "").trim())
      const response = await deliveryAPI.updateProfileMultipart(fd)
      if (handleReapprovalRedirect(response)) return
      await refresh()
      toast.success("Basic details updated")
    } catch {
      toast.error("Failed to update basic details")
    } finally {
      setSaving(false)
    }
  }

  const saveVehicleDetails = async () => {
    try {
      setSaving(true)
      const response = await deliveryAPI.updateProfileDetails({
        vehicle: {
          type: String(form.vehicleType || "").trim(),
          brand: String(form.vehicleName || "").trim(),
          number: String(form.vehicleNumber || "").trim().toUpperCase(),
        },
      })
      if (handleReapprovalRedirect(response)) return
      await refresh()
      toast.success("Vehicle details updated")
    } catch {
      toast.error("Failed to update vehicle details")
    } finally {
      setSaving(false)
    }
  }

  const saveBankDetails = async () => {
    try {
      setSaving(true)
      const bankFd = new FormData()
      bankFd.append("documents[bankDetails][accountHolderName]", String(form.accountHolderName || "").trim())
      bankFd.append("documents[bankDetails][accountNumber]", String(form.accountNumber || "").trim())
      bankFd.append("documents[bankDetails][ifscCode]", String(form.ifscCode || "").trim().toUpperCase())
      bankFd.append("documents[bankDetails][bankName]", String(form.bankName || "").trim())
      bankFd.append("documents[bankDetails][upiId]", String(form.upiId || "").trim())
      bankFd.append("documents[pan][number]", String(form.panNumber || "").trim().toUpperCase())
      const response = await deliveryAPI.updateBankDetailsMultipart(bankFd)
      if (handleReapprovalRedirect(response)) return
      await refresh()
      toast.success("Bank details updated")
    } catch {
      toast.error("Failed to update bank details")
    } finally {
      setSaving(false)
    }
  }

  const saveDocumentDetails = async () => {
    try {
      setSaving(true)
      const fd = new FormData()
      fd.append("aadharNumber", String(form.aadharNumber || "").trim())
      fd.append("panNumber", String(form.panNumber || "").trim().toUpperCase())
      fd.append("drivingLicenseNumber", String(form.drivingLicenseNumber || "").trim().toUpperCase())
      const response = await deliveryAPI.updateProfileMultipart(fd)
      if (handleReapprovalRedirect(response)) return
      await refresh()
      toast.success("Document details updated")
    } catch {
      toast.error("Failed to update document details")
    } finally {
      setSaving(false)
    }
  }

  const onPick = (ref) => ref.current?.click()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading profile...</span>
        </div>
      </div>
    )
  }

  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-[#005128]"

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <button onClick={goBack} className="p-2 rounded-lg hover:bg-slate-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold">Profile Details</h1>
      </div>

      <div className="max-w-xl mx-auto px-3 pt-3 space-y-3">
        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-semibold">Profile Photo</h2>
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center">
              {profileImageUrl ? <img src={profileImageUrl} alt="Profile" className="w-full h-full object-cover" /> : <span className="text-xs text-slate-400">No Photo</span>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => openCamera({ onSelectFile: (f) => uploadSingleFile("profilePhoto", f), fileNamePrefix: "profile-photo" })} className="px-3 py-2 rounded-lg border text-xs font-semibold">Camera</button>
              <button onClick={() => onPick(profilePhotoInputRef)} className="px-3 py-2 rounded-lg border text-xs font-semibold">Gallery</button>
            </div>
          </div>
          <input ref={profilePhotoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadSingleFile("profilePhoto", e.target.files?.[0])} />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Basic Details</h2>
            <button
              onClick={async () => {
                if (!editingBasic) return setEditingBasic(true)
                await saveBasicDetails()
                setEditingBasic(false)
              }}
              disabled={saving || !!uploading}
              className="text-xs font-semibold text-[#005128] disabled:opacity-50"
            >
              {editingBasic ? "Save" : "Edit"}
            </button>
          </div>
          <input disabled={!editingBasic} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Full Name" value={form.name} onChange={(e) => onInput("name", e.target.value)} />
          <input disabled={!editingBasic} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Phone" value={form.phone} onChange={(e) => onInput("phone", e.target.value)} />
          <input disabled={!editingBasic} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Email" value={form.email} onChange={(e) => onInput("email", e.target.value)} />
          <input disabled={!editingBasic} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Address" value={form.address} onChange={(e) => onInput("address", e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input disabled={!editingBasic} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="City" value={form.city} onChange={(e) => onInput("city", e.target.value)} />
            <input disabled={!editingBasic} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="State" value={form.state} onChange={(e) => onInput("state", e.target.value)} />
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Vehicle Details</h2>
            <button
              onClick={async () => {
                if (!editingVehicle) return setEditingVehicle(true)
                await saveVehicleDetails()
                setEditingVehicle(false)
              }}
              disabled={saving || !!uploading}
              className="text-xs font-semibold text-[#005128] disabled:opacity-50"
            >
              {editingVehicle ? "Save" : "Edit"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input disabled={!editingVehicle} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Vehicle Type" value={form.vehicleType} onChange={(e) => onInput("vehicleType", e.target.value)} />
            <input disabled={!editingVehicle} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Vehicle Brand/Name" value={form.vehicleName} onChange={(e) => onInput("vehicleName", e.target.value)} />
          </div>
          <input disabled={!editingVehicle} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Vehicle Number" value={form.vehicleNumber} onChange={(e) => onInput("vehicleNumber", e.target.value.toUpperCase())} />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Documents</h2>
            <button
              onClick={async () => {
                if (!editingDocuments) return setEditingDocuments(true)
                await saveDocumentDetails()
                setEditingDocuments(false)
              }}
              disabled={saving || !!uploading}
              className="text-xs font-semibold text-[#005128] disabled:opacity-50"
            >
              {editingDocuments ? "Save" : "Edit"}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Aadhar</p>
            <input
              disabled={!editingDocuments}
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`}
              placeholder="Aadhar Number"
              value={form.aadharNumber}
              onChange={(e) => onInput("aadharNumber", e.target.value)}
            />
            <button
              disabled={!editingDocuments}
              onClick={() => onPick(aadharInputRef)}
              className="w-full rounded-xl border py-2 text-xs font-semibold disabled:opacity-50"
            >
              Upload Aadhar Photo
            </button>
            {aadharPhotoUrl ? (
              <img src={aadharPhotoUrl} alt="Aadhar" className="w-full h-24 object-cover rounded-lg border border-slate-200" />
            ) : (
              <div className="w-full h-24 rounded-lg bg-slate-100 text-[10px] text-slate-400 flex items-center justify-center">No Aadhar photo</div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">PAN</p>
            <input
              disabled={!editingDocuments}
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`}
              placeholder="PAN Number"
              value={form.panNumber}
              onChange={(e) => onInput("panNumber", e.target.value.toUpperCase())}
            />
            <button
              disabled={!editingDocuments}
              onClick={() => onPick(panInputRef)}
              className="w-full rounded-xl border py-2 text-xs font-semibold disabled:opacity-50"
            >
              Upload PAN Photo
            </button>
            {panPhotoUrl ? (
              <img src={panPhotoUrl} alt="PAN" className="w-full h-24 object-cover rounded-lg border border-slate-200" />
            ) : (
              <div className="w-full h-24 rounded-lg bg-slate-100 text-[10px] text-slate-400 flex items-center justify-center">No PAN photo</div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-700">Driving License</p>
            <input
              disabled={!editingDocuments}
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`}
              placeholder="Driving License Number"
              value={form.drivingLicenseNumber}
              onChange={(e) => onInput("drivingLicenseNumber", e.target.value.toUpperCase())}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={!editingDocuments}
                onClick={() => onPick(drivingInputRef)}
                className="rounded-xl border py-2 text-xs font-semibold disabled:opacity-50"
              >
                Upload DL Photo
              </button>
              <button
                disabled={!editingDocuments}
                onClick={() => openCamera({ onSelectFile: (f) => uploadSingleFile("drivingLicensePhoto", f), fileNamePrefix: "driving-license" })}
                className="rounded-xl border py-2 text-xs font-semibold disabled:opacity-50"
              >
                DL Camera
              </button>
            </div>
            {drivingPhotoUrl ? (
              <img src={drivingPhotoUrl} alt="Driving License" className="w-full h-24 object-cover rounded-lg border border-slate-200" />
            ) : (
              <div className="w-full h-24 rounded-lg bg-slate-100 text-[10px] text-slate-400 flex items-center justify-center">No License photo</div>
            )}
          </div>
          <input ref={aadharInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadSingleFile("aadharPhoto", e.target.files?.[0])} />
          <input ref={panInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadSingleFile("panPhoto", e.target.files?.[0])} />
          <input ref={drivingInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadSingleFile("drivingLicensePhoto", e.target.files?.[0])} />
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Bank & Payments</h2>
            <button
              onClick={async () => {
                if (!editingBank) return setEditingBank(true)
                await saveBankDetails()
                setEditingBank(false)
              }}
              disabled={saving || !!uploading}
              className="text-xs font-semibold text-[#005128] disabled:opacity-50"
            >
              {editingBank ? "Save" : "Edit"}
            </button>
          </div>
          <input disabled={!editingBank} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Account Holder Name" value={form.accountHolderName} onChange={(e) => onInput("accountHolderName", e.target.value)} />
          <input disabled={!editingBank} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Account Number" value={form.accountNumber} onChange={(e) => onInput("accountNumber", e.target.value.replace(/\D/g, ""))} />
          <div className="grid grid-cols-2 gap-2">
            <input disabled={!editingBank} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="IFSC Code" value={form.ifscCode} onChange={(e) => onInput("ifscCode", e.target.value.toUpperCase())} />
            <input disabled={!editingBank} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="Bank Name" value={form.bankName} onChange={(e) => onInput("bankName", e.target.value)} />
          </div>
          <input disabled={!editingBank} className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-500`} placeholder="UPI ID" value={form.upiId} onChange={(e) => onInput("upiId", e.target.value)} />

          <div className="flex gap-2">
            <button disabled={!editingBank} onClick={() => openCamera({ onSelectFile: (f) => uploadSingleFile("upiQrCode", f), fileNamePrefix: "upi-qr" })} className="flex-1 rounded-xl border py-2 text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"><Camera className="w-3.5 h-3.5" /> QR Camera</button>
            <button disabled={!editingBank} onClick={() => onPick(upiQrInputRef)} className="flex-1 rounded-xl border py-2 text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"><ImageIcon className="w-3.5 h-3.5" /> QR Gallery</button>
          </div>
          <div className="rounded-xl border border-slate-200 p-2">
            <p className="text-[10px] font-semibold text-slate-500 mb-1">Existing UPI QR</p>
            {upiQrUrl ? (
              <img src={upiQrUrl} alt="UPI QR" className="w-28 h-28 object-cover rounded-lg" />
            ) : (
              <div className="w-28 h-28 rounded-lg bg-slate-100 text-[10px] text-slate-400 flex items-center justify-center">No QR</div>
            )}
          </div>
          <input ref={upiQrInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadSingleFile("upiQrCode", e.target.files?.[0])} />
        </section>
      </div>
    </div>
  )
}

export default ProfileDetailsV2
