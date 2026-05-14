import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Upload, X, Check, Camera } from "lucide-react"
import { deliveryAPI } from "@food/api"
import { toast } from "sonner"
import { isFlutterBridgeAvailable, openCamera } from "@food/utils/imageUploadUtils"
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const createEmptyUploadedDocs = () => ({
  profilePhoto: null,
  aadharPhoto: null,
  panPhoto: null,
  drivingLicensePhoto: null
})

const DELIVERY_DOCS_DB_NAME = "DeliverySignupDocsDB"
const DELIVERY_DOCS_STORE = "delivery_signup_files"
const DELIVERY_DOCS_DB_VERSION = 1

const openDeliveryDocsDB = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"))
      return
    }

    const request = indexedDB.open(DELIVERY_DOCS_DB_NAME, DELIVERY_DOCS_DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(DELIVERY_DOCS_STORE)) {
        db.createObjectStore(DELIVERY_DOCS_STORE)
      }
    }

    request.onsuccess = (event) => resolve(event.target.result)
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"))
  })

const saveDeliveryDocFile = async (key, file) => {
  if (!(file instanceof Blob)) return
  const db = await openDeliveryDocsDB()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DELIVERY_DOCS_STORE, "readwrite")
    const store = tx.objectStore(DELIVERY_DOCS_STORE)
    store.put(file, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error("Failed to save file"))
  })
}

const getDeliveryDocFile = async (key) => {
  const db = await openDeliveryDocsDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DELIVERY_DOCS_STORE, "readonly")
    const store = tx.objectStore(DELIVERY_DOCS_STORE)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error("Failed to read file"))
  })
}

const deleteDeliveryDocFile = async (key) => {
  const db = await openDeliveryDocsDB()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DELIVERY_DOCS_STORE, "readwrite")
    const store = tx.objectStore(DELIVERY_DOCS_STORE)
    store.delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error("Failed to delete file"))
  })
}

const clearDeliveryDocFiles = async () => {
  const db = await openDeliveryDocsDB()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DELIVERY_DOCS_STORE, "readwrite")
    const store = tx.objectStore(DELIVERY_DOCS_STORE)
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error("Failed to clear files"))
  })
}

const getDeliveryDocStorageKey = (docType) => `delivery-signup-doc-${docType}`

const sanitizeUploadedDocValue = (value) => {
  if (!value) return null

  if (typeof value === "string") {
    return value.startsWith("blob:") ? null : value
  }

  if (typeof value === "object") {
    const url = typeof value.url === "string" ? value.url : ""
    if (url.startsWith("blob:")) {
      return null
    }
    return value
  }

  return null
}

const sanitizeUploadedDocs = (docs) => ({
  profilePhoto: sanitizeUploadedDocValue(docs?.profilePhoto),
  aadharPhoto: sanitizeUploadedDocValue(docs?.aadharPhoto),
  panPhoto: sanitizeUploadedDocValue(docs?.panPhoto),
  drivingLicensePhoto: sanitizeUploadedDocValue(docs?.drivingLicensePhoto)
})

const buildCompactUploadedDocs = (docs) => {
  const compactDoc = (value) => {
    if (!value || typeof value !== "object") return value
    return {
      fileName: value.fileName || "",
      mimeType: value.mimeType || "",
      size: value.size || 0,
      selected: true,
    }
  }

  return {
    profilePhoto: compactDoc(docs?.profilePhoto),
    aadharPhoto: compactDoc(docs?.aadharPhoto),
    panPhoto: compactDoc(docs?.panPhoto),
    drivingLicensePhoto: compactDoc(docs?.drivingLicensePhoto),
  }
}

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })

const fileToPreviewDataUrl = (file, maxSize = 1280, quality = 0.8) =>
  new Promise((resolve) => {
    try {
      const imageUrl = URL.createObjectURL(file)
      const image = new Image()

      image.onload = () => {
        try {
          const canvas = document.createElement("canvas")
          let { width, height } = image
          const largestEdge = Math.max(width, height)
          if (largestEdge > maxSize) {
            const ratio = maxSize / largestEdge
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
          }
          canvas.width = width
          canvas.height = height
          const context = canvas.getContext("2d")
          context?.drawImage(image, 0, 0, width, height)
          const outputType =
            String(file.type || "").toLowerCase() === "image/png"
              ? "image/png"
              : "image/jpeg"
          const previewDataUrl = canvas.toDataURL(outputType, quality)
          URL.revokeObjectURL(imageUrl)
          resolve(previewDataUrl)
        } catch {
          URL.revokeObjectURL(imageUrl)
          resolve(null)
        }
      }

      image.onerror = () => {
        URL.revokeObjectURL(imageUrl)
        resolve(null)
      }

      image.src = imageUrl
    } catch {
      resolve(null)
    }
  })

const dataUrlToFile = (dataUrl, fileName = "document.jpg") => {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null
  const parts = dataUrl.split(",")
  if (parts.length < 2) return null
  const mimeMatch = parts[0].match(/data:(.*?);base64/)
  const mimeType = mimeMatch?.[1] || "image/jpeg"
  const binary = atob(parts[1])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new File([bytes], fileName, { type: mimeType })
}

const getLowerFileExtension = (fileName = "") => {
  const normalized = String(fileName || "").trim().toLowerCase()
  if (!normalized.includes(".")) return ""
  return normalized.slice(normalized.lastIndexOf("."))
}

const isSupportedImageFile = (file) => {
  if (!(file instanceof File || file instanceof Blob)) return false
  const mimeType = String(file.type || "").toLowerCase()
  if (mimeType.startsWith("image/")) return true
  const extension = getLowerFileExtension(file?.name || "")
  return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(extension)
}

const getFriendlyRegistrationError = (error) => {
  const rawMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    ""

  if (/E11000 duplicate key error/i.test(rawMessage)) {
    if (/vehicleNumber_1/i.test(rawMessage) || /vehicleNumber/i.test(rawMessage)) {
      return "This vehicle number is already registered. Please use a different vehicle number."
    }

    if (/panNumber_1/i.test(rawMessage) || /panNumber/i.test(rawMessage)) {
      return "This PAN number is already registered."
    }

    if (/aadharNumber_1/i.test(rawMessage) || /aadharNumber/i.test(rawMessage)) {
      return "This Aadhar number is already registered."
    }

    if (/drivingLicense/i.test(rawMessage)) {
      return "This driving license number is already registered."
    }

    return "This account detail is already registered. Please check your information."
  }

  return rawMessage || "Failed to register. Please try again."
}


export default function SignupStep2() {
  const navigate = useNavigate()
  const goBack = useDeliveryBackNavigation()
  const isMobileDevice =
    typeof navigator !== "undefined" &&
    /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "")
  const fileInputRefs = useRef({
    profilePhoto: null,
    aadharPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null
  })
  const [documents, setDocuments] = useState({
    profilePhoto: null,
    aadharPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null
  })
  const [uploadedDocs, setUploadedDocs] = useState(() => {
    const saved = sessionStorage.getItem("deliverySignupDocs")
    if (saved) {
      try {
        return sanitizeUploadedDocs(JSON.parse(saved))
      } catch (e) {
        debugError("Error parsing saved docs:", e)
      }
    }
    return createEmptyUploadedDocs()
  })
  const [activePicker, setActivePicker] = useState(null) // { docType: string, title: string, ref: any }
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploading, setUploading] = useState({})
  const hasShownQuotaWarning = useRef(false)

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  // Save uploaded docs to session storage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem("deliverySignupDocs", JSON.stringify(uploadedDocs))
    } catch (error) {
      const compactDocs = buildCompactUploadedDocs(uploadedDocs)
      try {
        sessionStorage.setItem("deliverySignupDocs", JSON.stringify(compactDocs))
      } catch (fallbackError) {
        debugWarn("Unable to save delivery signup docs in session storage:", fallbackError)
      }
      if (!hasShownQuotaWarning.current) {
        hasShownQuotaWarning.current = true
        toast.warning("Large images cannot be fully cached in browser storage.")
      }
      debugWarn("Storage quota exceeded for deliverySignupDocs:", error)
    }
  }, [uploadedDocs])

  useEffect(() => {
    const restored = {}
    Object.keys(createEmptyUploadedDocs()).forEach((docType) => {
      const uploaded = uploadedDocs?.[docType]
      const dataUrl =
        (typeof uploaded === "string" && uploaded.startsWith("data:") && uploaded) ||
        (uploaded?.dataUrl && String(uploaded.dataUrl).startsWith("data:") && uploaded.dataUrl) ||
        (uploaded?.url && String(uploaded.url).startsWith("data:") && uploaded.url) ||
        null
      if (!dataUrl) return
      const nextFile = dataUrlToFile(
        dataUrl,
        uploaded?.fileName || `${docType}-${Date.now()}.jpg`,
      )
      if (nextFile) restored[docType] = nextFile
    })

    if (Object.keys(restored).length > 0) {
      setDocuments((prev) => ({ ...prev, ...restored }))
    }
  }, [uploadedDocs])

  useEffect(() => {
    let cancelled = false

    const restoreFilesFromIndexedDB = async () => {
      const docTypes = Object.keys(createEmptyUploadedDocs())
      for (const docType of docTypes) {
        const current = uploadedDocs?.[docType]
        const hasSessionImage =
          (typeof current === "string" && current.startsWith("data:")) ||
          (typeof current?.dataUrl === "string" && current.dataUrl.startsWith("data:"))
        if (hasSessionImage) continue

        try {
          const storedBlob = await getDeliveryDocFile(getDeliveryDocStorageKey(docType))
          if (!storedBlob || cancelled) continue
          const fileName = current?.fileName || `${docType}.jpg`
          const mimeType = current?.mimeType || storedBlob.type || "image/jpeg"
          const restoredFile = storedBlob instanceof File
            ? storedBlob
            : new File([storedBlob], fileName, { type: mimeType })
          const restoredDataUrl = await fileToDataUrl(restoredFile)
          if (cancelled) return

          setDocuments((prev) => ({ ...prev, [docType]: restoredFile }))
          setUploadedDocs((prev) => ({
            ...prev,
            [docType]: {
              dataUrl: restoredDataUrl,
              url: restoredDataUrl,
              fileName: restoredFile.name || fileName,
              mimeType: restoredFile.type || mimeType,
              size: restoredFile.size || 0,
            },
          }))
        } catch (error) {
          debugWarn("Failed restoring delivery doc from IndexedDB:", docType, error)
        }
      }
    }

    restoreFilesFromIndexedDB()
    return () => {
      cancelled = true
    }
  }, [])

  const previewUrlsRefs = useRef({});

  useEffect(() => {
    return () => {
      Object.values(previewUrlsRefs.current).forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url)
        }
      })
    }
  }, [])

  const getPreviewSrc = (docType) => {
    const uploaded = uploadedDocs[docType]
    if (typeof uploaded === "string") return uploaded
    if (uploaded?.url) return uploaded.url
    if (uploaded?.dataUrl) return uploaded.dataUrl

    const localFile = documents[docType]
    if (localFile instanceof File) {
      if (!localFile._previewUrl) {
        localFile._previewUrl = URL.createObjectURL(localFile)
        previewUrlsRefs.current[docType] = localFile._previewUrl
      }
      return localFile._previewUrl
    }
    return null
  }

  const handleOpenUploadOptions = (docType) => {
    fileInputRefs.current[docType]?.click()
  }

  const handleFileSelect = async (docType, file) => {
    if (!file) return

    if (!isSupportedImageFile(file)) {
      toast.error("Please select an image file")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB")
      return
    }

    try {
      const compactPreviewDataUrl =
        (await fileToPreviewDataUrl(file)) || (await fileToDataUrl(file))
      setDocuments((prev) => ({ ...prev, [docType]: file }))
      setUploadedDocs((prev) => ({
        ...prev,
        [docType]: {
          dataUrl: compactPreviewDataUrl,
          url: compactPreviewDataUrl,
          fileName: file.name,
          mimeType: file.type,
          size: file.size
        }
      }))
      saveDeliveryDocFile(getDeliveryDocStorageKey(docType), file).catch((error) => {
        debugWarn("Failed to cache delivery doc in IndexedDB:", docType, error)
      })
      toast.success(`${docType.replace(/([A-Z])/g, " $1").trim()} selected`)
    } catch (err) {
      debugError("Failed to process selected file:", err)
      toast.error("Failed to load selected image")
    }
  }

  const handleTakeCameraPhoto = (docType, label) => {
    openCamera({
      onSelectFile: (file) => handleFileSelect(docType, file),
      fileNamePrefix: `signup-${docType}`
    })
  }

  const handlePickFromGallery = (docType) => {
    fileInputRefs.current[docType]?.click()
  }

  const handleRemove = (docType) => {
    if (previewUrlsRefs.current[docType]) {
      URL.revokeObjectURL(previewUrlsRefs.current[docType])
      delete previewUrlsRefs.current[docType]
    }
    setDocuments(prev => ({
      ...prev,
      [docType]: null
    }))
    setUploadedDocs(prev => ({
      ...prev,
      [docType]: null
    }))
    deleteDeliveryDocFile(getDeliveryDocStorageKey(docType)).catch((error) => {
      debugWarn("Failed to delete delivery doc from IndexedDB:", docType, error)
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const profilePhotoFile = documents.profilePhoto || dataUrlToFile(uploadedDocs?.profilePhoto?.dataUrl || uploadedDocs?.profilePhoto?.url || "", uploadedDocs?.profilePhoto?.fileName || "profile-photo.jpg")
    const aadharPhotoFile = documents.aadharPhoto || dataUrlToFile(uploadedDocs?.aadharPhoto?.dataUrl || uploadedDocs?.aadharPhoto?.url || "", uploadedDocs?.aadharPhoto?.fileName || "aadhar-photo.jpg")
    const panPhotoFile = documents.panPhoto || dataUrlToFile(uploadedDocs?.panPhoto?.dataUrl || uploadedDocs?.panPhoto?.url || "", uploadedDocs?.panPhoto?.fileName || "pan-photo.jpg")
    const drivingLicensePhotoFile = documents.drivingLicensePhoto || dataUrlToFile(uploadedDocs?.drivingLicensePhoto?.dataUrl || uploadedDocs?.drivingLicensePhoto?.url || "", uploadedDocs?.drivingLicensePhoto?.fileName || "driving-license-photo.jpg")

    if (!profilePhotoFile || !aadharPhotoFile || !panPhotoFile || !drivingLicensePhotoFile) {
      toast.error("Please upload all required documents")
      return
    }

    const raw = sessionStorage.getItem("deliverySignupDetails")
    if (!raw) {
      toast.error("Session expired. Please start from Create Account.")
      navigate("/food/delivery/signup", { replace: true })
      return
    }

    let details
    try {
      details = JSON.parse(raw)
    } catch {
      toast.error("Invalid session. Please start from Create Account.")
      navigate("/food/delivery/signup", { replace: true })
      return
    }

    const formData = new FormData()
    formData.append("name", details.name || "")
    formData.append("phone", String(details.phone || "").replace(/\D/g, "").slice(0, 15))
    if (details.email) formData.append("email", String(details.email).trim())
    if (details.ref) formData.append("ref", String(details.ref).trim())
    if (details.countryCode) formData.append("countryCode", details.countryCode)
    if (details.address) formData.append("address", details.address)
    if (details.city) formData.append("city", details.city)
    if (details.state) formData.append("state", details.state)
    if (details.vehicleType) formData.append("vehicleType", details.vehicleType)
    if (details.vehicleName) formData.append("vehicleName", details.vehicleName)
    if (details.vehicleNumber) formData.append("vehicleNumber", details.vehicleNumber)
    if (details.drivingLicenseNumber) {
      formData.append("drivingLicenseNumber", details.drivingLicenseNumber)
      formData.append("documents[drivingLicense][number]", details.drivingLicenseNumber)
    }
    if (details.panNumber) formData.append("panNumber", details.panNumber)
    if (details.aadharNumber) formData.append("aadharNumber", details.aadharNumber)
    formData.append("profilePhoto", profilePhotoFile)
    formData.append("aadharPhoto", aadharPhotoFile)
    formData.append("panPhoto", panPhotoFile)
    formData.append("drivingLicensePhoto", drivingLicensePhotoFile)

    // Push registration is delayed until admin approval + online status.
    // This avoids starting the native delivery service notification during onboarding.

    const explicitNeedsRegistration = sessionStorage.getItem("deliveryNeedsRegistration") === "true"
    const hasDeliveryToken =
      typeof window !== "undefined" &&
      Boolean(localStorage.getItem("delivery_accessToken"))
    const shouldRegister = explicitNeedsRegistration || !hasDeliveryToken

    setIsSubmitting(true)

    try {
      // New number (OTP ke baad pehli baar): DB me abhi partner nahi hai,
      // is case me register hi call karna hai (no auth token needed).
      const response = shouldRegister
        ? await deliveryAPI.register(formData)
        : await deliveryAPI.completeProfile(formData)

      if (response?.data?.success) {
        sessionStorage.removeItem("deliverySignupDetails")
        sessionStorage.removeItem("deliverySignupDocs")
        clearDeliveryDocFiles().catch((error) => {
          debugWarn("Failed to clear delivery signup docs from IndexedDB:", error)
        })
        if (shouldRegister) {
          sessionStorage.removeItem("deliveryNeedsRegistration")
          toast.success("Registration successful. Please login with OTP.")
          setTimeout(() => navigate("/food/delivery/login", { replace: true }), 1500)
        } else {
          toast.success("Profile submitted. Waiting for admin approval.")
          setTimeout(() => navigate("/food/delivery", { replace: true }), 1500)
        }
      }
    } catch (error) {
      debugError("Error submitting registration:", error)
      const message = getFriendlyRegistrationError(error)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const DocumentUpload = ({ docType, label, required = true }) => {
    const uploaded = uploadedDocs[docType]
    const isUploading = uploading[docType]
    const showCameraOption = isFlutterBridgeAvailable()

    return (
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        {uploaded ? (
          <div className="relative">
            <img
              src={getPreviewSrc(docType)}
              alt={label}
              className="w-full h-48 object-cover rounded-lg"
            />
            <button
              type="button"
              onClick={() => handleRemove(docType)}
              className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 left-2 bg-green-500 text-white px-3 py-1 rounded-full flex items-center gap-1 text-sm">
              <Check className="w-4 h-4" />
              <span>Uploaded</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 transition-colors px-4">
            <div className="flex flex-col items-center justify-center pt-5 pb-3">
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mb-2"></div>
                  <p className="text-sm text-gray-500">Uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 mb-1">Upload document</p>
                  <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
                </>
              )}
            </div>

            {!isUploading && (
              <div className={`w-full grid grid-cols-1 ${showCameraOption ? "sm:grid-cols-2" : ""} gap-2 pb-4`}>
                {showCameraOption && (
                  <button
                    type="button"
                    onClick={() => handleTakeCameraPhoto(docType, label)}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gray-900 text-white text-xs font-bold cursor-pointer hover:bg-black transition-all active:scale-95"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Use Camera</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handlePickFromGallery(docType)}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#00B761] text-white text-xs font-bold cursor-pointer hover:bg-[#00A055] transition-all active:scale-95"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload from Device</span>
                </button>
              </div>
            )}

            <input
              ref={(node) => {
                fileInputRefs.current[docType] = node
              }}
              type="file"
              className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
              onClick={(e) => {
                e.target.value = ""
              }}
              onChange={(e) => {
                const selectedFile = e.target.files[0]
                if (selectedFile) {
                  handleFileSelect(docType, selectedFile)
                }
                e.target.value = ""
              }}
              disabled={isUploading}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center gap-4 border-b border-gray-200">
        <button
          onClick={goBack}
          className="p-2 hover:bg-gradient-to-b from-brand-50 via-white to-brand-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-medium">Upload Documents</h1>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Document Verification</h2>
          <p className="text-sm text-gray-600">Please upload clear photos of your documents</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <DocumentUpload docType="profilePhoto" label="Profile Photo" required={true} />
          <DocumentUpload docType="aadharPhoto" label="Aadhar Card Photo" required={true} />
          <DocumentUpload docType="panPhoto" label="PAN Card Photo" required={true} />
          <DocumentUpload docType="drivingLicensePhoto" label="Driving License Photo" required={true} />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto}
            className={`w-full py-4 rounded-lg font-bold text-white text-base transition-all mt-6 ${isSubmitting || !uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto
              ? "bg-gray-400 cursor-not-allowed"
              : ""
              }`}
            style={
              isSubmitting || !uploadedDocs.profilePhoto || !uploadedDocs.aadharPhoto || !uploadedDocs.panPhoto || !uploadedDocs.drivingLicensePhoto
                ? undefined
                : { background: "linear-gradient(135deg, #005128 0%, #003d1e 100%)", boxShadow: "0 12px 28px -18px #003d1e" }
            }
          >
            {isSubmitting ? "Submitting..." : "Complete Signup"}
          </button>
        </form>
      </div>

    </div>
  )
}

