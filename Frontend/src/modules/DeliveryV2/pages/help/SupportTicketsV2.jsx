import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Clock, CheckCircle, 
  XCircle, Loader2, Eye, MessageSquare, ChevronRight 
} from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';
import BRAND_THEME from '@/config/brandTheme';
import { isModuleAuthenticated } from '@food/utils/auth';

/**
 * SupportTicketsV2 - Restored Old UI for Support Ticket Hub.
 */
export const SupportTicketsV2 = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const storedSource = typeof window !== "undefined" ? sessionStorage.getItem("deliveryHelpSource") : "";
  const storedPhone = typeof window !== "undefined" ? sessionStorage.getItem("deliveryHelpPhone") : "";
  const deliveryUserRaw = typeof window !== "undefined" ? localStorage.getItem("delivery_user") : "";
  const deliveryAuthRaw = typeof window !== "undefined" ? sessionStorage.getItem("deliveryAuthData") : "";
  const deliveryUserPhone = (() => {
    if (!deliveryUserRaw) return "";
    try {
      const parsed = JSON.parse(deliveryUserRaw);
      return String(parsed?.phone || "").trim();
    } catch {
      return "";
    }
  })();
  const deliveryAuthPhone = (() => {
    if (!deliveryAuthRaw) return "";
    try {
      const parsed = JSON.parse(deliveryAuthRaw);
      return String(parsed?.phone || "").trim();
    } catch {
      return "";
    }
  })();
  const isPendingVerificationFlow = query.get("source") === "pending_verification" || storedSource === "pending_verification";
  const isLoggedInDelivery = typeof window !== "undefined" ? isModuleAuthenticated("delivery") : false;
  const pendingPhone = String(query.get("phone") || storedPhone || deliveryUserPhone || deliveryAuthPhone || "").trim();
  const goBack = useDeliveryBackNavigation();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const canRaiseNewTicket = true;

  const mergeTickets = (lists = []) => {
    const merged = [];
    const seen = new Set();
    lists.forEach((list) => {
      (list || []).forEach((ticket) => {
        const key = String(ticket?._id || ticket?.ticketId || "");
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(ticket);
      });
    });
    merged.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
    return merged;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const latestTicketRaw = sessionStorage.getItem("deliveryLatestSupportTicket");
    if (!latestTicketRaw) return;
    try {
      const latestTicket = JSON.parse(latestTicketRaw);
      setTickets((prev) => mergeTickets([[latestTicket], prev]));
    } catch {
      // Ignore malformed session payload.
    }
  }, [location.key]);

  useEffect(() => {
    if (!isLoggedInDelivery && !pendingPhone) {
      setLoading(false);
      setTickets([]);
      return;
    }

    const fetchTickets = async () => {
      try {
        setLoading(true);
        const requests = [];
        if (isLoggedInDelivery) {
          requests.push(deliveryAPI.getSupportTickets());
        }
        if (pendingPhone) {
          requests.push(deliveryAPI.getSupportTicketsPending(pendingPhone));
        }
        const responses = await Promise.allSettled(requests);
        const hasAnySuccess = responses.some((entry) => entry.status === "fulfilled");
        const latestTicketRaw = typeof window !== "undefined"
          ? sessionStorage.getItem("deliveryLatestSupportTicket")
          : "";
        let latestTicket = null;
        if (latestTicketRaw) {
          try {
            latestTicket = JSON.parse(latestTicketRaw);
          } catch {
            latestTicket = null;
          }
        }
        const fetchedLists = responses
          .filter((entry) => entry.status === "fulfilled")
          .map((entry) => entry.value?.data?.data?.tickets || []);
        const merged = mergeTickets(latestTicket ? [[latestTicket], ...fetchedLists] : fetchedLists);
        const latestTicketExistsInFetch = latestTicket
          ? fetchedLists.some((list) =>
              (list || []).some((ticket) =>
                String(ticket?._id || ticket?.ticketId || "") === String(latestTicket?._id || latestTicket?.ticketId || "")
              )
            )
          : false;
        if (latestTicketExistsInFetch && typeof window !== "undefined") {
          sessionStorage.removeItem("deliveryLatestSupportTicket");
        }
        if (!hasAnySuccess) {
          toast.error("Failed to load tickets");
          return;
        }
        setTickets((prev) => (merged.length > 0 ? merged : prev));
      } catch (error) {
        toast.error("Failed to load tickets");
      } finally {
        setLoading(false);
      }
    };
    fetchTickets();
  }, [isLoggedInDelivery, pendingPhone, isPendingVerificationFlow]);

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "open": return "bg-orange-50 text-orange-600 border-orange-100";
      case "in_progress": return "bg-brand-50 text-brand-600 border-brand-100";
      case "resolved": return "bg-green-50 text-green-600 border-green-100";
      default: return "bg-gray-50 text-gray-600 border-gray-100";
    }
  };

  const getStatusLabel = (status) => {
    const s = String(status || "").toLowerCase();
    if (s === "in_progress") return "pending";
    return s.replace("_", " ");
  };

  return (
    <div className="min-h-screen bg-white font-poppins pb-20">
      {/* Header */}
      <div className="bg-white px-4 py-5 flex items-center gap-4 fixed top-0 w-full z-50 shadow-sm border-b border-gray-50">
        <button onClick={goBack} className="p-1 hover:bg-gray-50 rounded-full">
           <ArrowLeft className="w-6 h-6 text-gray-950" />
        </button>
        <h1 className="text-xl font-black text-gray-950">Support Tickets</h1>
      </div>

      <div className="pt-24 px-4 space-y-6">
        {/* Create Action */}
        {canRaiseNewTicket ? (
          <button 
            onClick={() =>
              navigate(
                isPendingVerificationFlow
                  ? `/food/delivery/help/tickets/create?source=pending_verification&category=verification_issue&phone=${encodeURIComponent(pendingPhone)}`
                  : "/food/delivery/help/tickets/create"
              )
            }
            className="w-full text-white p-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all"
            style={{ background: BRAND_THEME.colors.brand.primary, boxShadow: `0 14px 30px -18px ${BRAND_THEME.colors.brand.primaryDark}` }}
          >
            <Plus className="w-5 h-5" />
            Raise New Ticket
          </button>
        ) : null}

        {/* List */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
             <Loader2 className="w-8 h-8 animate-spin text-gray-200" />
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Syncing Tickets...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="py-24 text-center">
             <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <MessageSquare className="w-10 h-10 text-gray-200" />
             </div>
             <h3 className="text-sm font-black text-gray-950 uppercase tracking-widest">No Active Tickets</h3>
             <p className="text-[10px] text-gray-400 font-bold uppercase mt-2">Create a ticket if you need assistance</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tickets.map((ticket, idx) => (
              <div 
                key={ticket._id || idx}
                onClick={() =>
                  navigate(
                    isPendingVerificationFlow
                      ? `/food/delivery/help/tickets/${ticket._id}?source=pending_verification&phone=${encodeURIComponent(pendingPhone)}`
                      : `/food/delivery/help/tickets/${ticket._id}`
                  )
                }
                className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm active:scale-[0.98] transition-all relative overflow-hidden group"
              >
                <div className="flex justify-between items-start mb-3">
                   <div className="flex-1 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                         <h4 className="text-sm font-black text-gray-950 group-hover:text-[#005128] transition-colors uppercase tracking-tight line-clamp-1">{ticket.subject}</h4>
                         {ticket.ticketId && <span className="text-[9px] font-mono font-bold bg-gray-100 px-2 py-0.5 rounded">#{ticket.ticketId}</span>}
                      </div>
                      <p className="text-xs text-gray-500 font-medium line-clamp-1">{ticket.description}</p>
                   </div>
                   <ChevronRight className="w-5 h-5 text-gray-200" />
                </div>
                
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-50">
                   <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${getStatusColor(ticket.status)}`}>
                        {getStatusLabel(ticket.status)}
                      </span>
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{ticket.category}</span>
                   </div>
                   <span className="text-[9px] font-bold text-gray-300">{new Date(ticket.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
