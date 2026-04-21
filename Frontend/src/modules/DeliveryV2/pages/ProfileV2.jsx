import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import {
  User,
  Bike,
  Ticket,
  ChevronRight,
  LogOut,
  X,
  Loader2,
  Share2,
  Gift,
  ShieldAlert,
  FileText
} from "lucide-react"
import { deliveryAPI } from "@food/api"
import { toast } from "sonner"
import { clearModuleAuth } from "@food/utils/auth"
import BRAND_THEME from "@/config/brandTheme"

export const ProfileV2 = () => {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [referralReward, setReferralReward] = useState(0)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [logoutSubmitting, setLogoutSubmitting] = useState(false)

  // Fetch profile data
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await deliveryAPI.getProfile()
        if (response?.data?.success && response?.data?.data?.profile) {
          setProfile(response.data.data.profile)
        }
      } catch (error) {
        toast.error("Failed to load profile data")
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])

  useEffect(() => {
    deliveryAPI.getReferralStats().then((res) => {
      const reward = res?.data?.data?.stats?.rewardAmount
      setReferralReward(Number(reward) || 0)
    }).catch(() => {})
  }, [])

  const refId = profile?._id || profile?.id || profile?.referralCode || ""
  const referralLink = refId ? `${window.location.origin}/food/delivery/signup?ref=${encodeURIComponent(String(refId))}` : ""

  const handleShareReferral = async () => {
    if (!referralLink) return
    const rewardText = referralReward > 0 ? `₹${referralReward}` : "rewards"
    const shareText = `Join as a delivery partner and earn ${rewardText}.`
    try {
      if (navigator.share) {
        await navigator.share({ title: "Delivery referral", text: shareText, url: referralLink })
      } else {
        const fallbackUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${referralLink}`)}`
        window.open(fallbackUrl, "_blank", "noopener,noreferrer")
      }
    } catch (e) {}
  }

  const handleLogout = async () => {
    if (logoutSubmitting) return
    setShowLogoutConfirm(false)
    try {
      setLogoutSubmitting(true)
      await deliveryAPI.logout()
    } catch (error) {}
    clearModuleAuth("delivery")
    localStorage.removeItem("app:isOnline")
    toast.success("Logged out successfully")
    navigate("/food/delivery/login", { replace: true })
    setLogoutSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-poppins gap-3">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" style={{ color: BRAND_THEME.colors.brand.primary }} />
        <span className="text-xs font-medium text-gray-500">Loading Profile...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-poppins pb-28">
      
      {/* Basic Compact Header */}
      <div className="bg-white border-b border-gray-100 flex items-center px-4 py-3 sticky top-0 z-50">
        <h1 className="text-base font-bold text-gray-900">My Profile</h1>
      </div>

      <div className="px-4 pt-3 space-y-3">
        
        {/* Simple Profile Identity Card */}
        <div 
          onClick={() => navigate("/food/delivery/profile/details")}
          className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
             <div className="bg-gray-100 w-12 h-12 rounded-full overflow-hidden shrink-0 border border-gray-200 flex items-center justify-center">
               {profile?.profileImage?.url ? (
                 <img src={profile.profileImage.url} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                 <User className="w-6 h-6 text-gray-400" />
               )}
             </div>
             <div>
               <h2 className="text-sm font-bold text-gray-900 leading-tight mb-0.5">{profile?.name || "Delivery Partner"}</h2>
               <p className="text-xs text-gray-500 font-medium">ID: {profile?.deliveryId || "N/A"}</p>
             </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </div>

        {/* Action Grid (Compact) */}
        <div className="grid grid-cols-2 gap-3">
           <button
             onClick={() => navigate("/food/delivery/history")}
             className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex items-center gap-3 active:bg-gray-50 transition-colors"
           >
             <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
               <Bike className="w-4 h-4" />
             </div>
             <div className="text-left">
               <span className="text-xs font-semibold text-gray-800 block">Trips</span>
               <span className="text-[10px] text-gray-400 font-medium">History</span>
             </div>
           </button>
           
           <button
             onClick={() => navigate("/food/delivery/profile/documents")}
             className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex items-center gap-3 active:bg-gray-50 transition-colors"
           >
             <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
               <FileText className="w-4 h-4" />
             </div>
             <div className="text-left">
               <span className="text-xs font-semibold text-gray-800 block">Docs</span>
               <span className="text-[10px] text-gray-400 font-medium">Manage</span>
             </div>
           </button>
        </div>

        {/* Share & Earn Banner (Compact) */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 shadow-sm flex items-center justify-between gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <Gift className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-bold text-emerald-900 mb-0.5 truncate">
               Refer & Earn{referralReward > 0 ? ` ₹${referralReward}` : ""}
            </h3>
            <p className="text-[10px] text-emerald-700 font-medium truncate">Share code, get rewards</p>
          </div>
          <button
            onClick={handleShareReferral}
            className="shrink-0 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold active:bg-emerald-700 transition-colors"
          >
            Share
          </button>
        </div>

        {/* Settings List (Compact) */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div 
              onClick={() => navigate("/food/delivery/help/tickets")}
              className="px-4 py-3.5 border-b border-gray-50 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                 <Ticket className="w-4 h-4 text-gray-500" />
                 <span className="text-sm font-medium text-gray-800">Help & Support</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>
            
            <div 
              onClick={() => navigate("/food/delivery/profile/terms")}
              className="px-4 py-3.5 border-b border-gray-50 flex items-center justify-between cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                 <ShieldAlert className="w-4 h-4 text-gray-500" />
                 <span className="text-sm font-medium text-gray-800">Terms & Conditions</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </div>

            <div 
              onClick={() => setShowLogoutConfirm(true)}
              className="px-4 py-4 flex items-center justify-between cursor-pointer active:bg-red-50 hover:bg-red-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                 <LogOut className="w-4 h-4 text-red-500" />
                 <span className="text-sm font-bold text-red-500">Log out</span>
              </div>
            </div>
        </div>
      </div>

      {/* Basic Logout Confirm Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
              onClick={() => setShowLogoutConfirm(false)}
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-sm bg-white rounded-2xl p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-gray-900 mb-1.5">Confirm Logout</h3>
              <p className="text-sm text-gray-500 mb-6 font-medium">
                Are you sure you want to log out from this account?
              </p>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm active:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  disabled={logoutSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2 active:bg-red-700"
                >
                  {logoutSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                  {logoutSubmitting ? "Logging out..." : "Log out"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ProfileV2;
