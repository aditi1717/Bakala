import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ShieldCheck, FileText, LifeBuoy, Loader2 } from "lucide-react";
import api from "@food/api";
import { API_ENDPOINTS } from "@food/api/config";

function PublicPageShell({ icon, title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700">{icon}</div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-600">{subtitle}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
          {children}
        </div>

        <div className="mt-6 text-xs text-slate-500">
          <Link to="/food" className="text-emerald-700 hover:underline">
            Back to app
          </Link>
        </div>
      </div>
    </div>
  );
}

function PublicHtmlLegalPage({ title, subtitle, endpoint, icon }) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        setLoading(true);
        const res = await api.get(endpoint);
        const data = res?.data?.data || {};
        if (!mounted) return;
        setContent(String(data.content || ""));
        setUpdatedAt(String(data.updatedAt || ""));
      } catch (err) {
        if (!mounted) return;
        setContent("");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [endpoint]);

  return (
    <PublicPageShell icon={icon} title={title} subtitle={subtitle}>
      {loading ? (
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </div>
      ) : content ? (
        <>
          <div
            className="prose prose-slate max-w-none"
            dangerouslySetInnerHTML={{ __html: content }}
          />
          <p className="mt-6 text-xs text-slate-500">
            Last updated:{" "}
            {updatedAt
              ? new Date(updatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : new Date().toLocaleDateString("en-US")}
          </p>
        </>
      ) : (
        <p className="text-slate-500">No content available right now.</p>
      )}
    </PublicPageShell>
  );
}

export function PublicPrivacyPage() {
  return (
    <PublicHtmlLegalPage
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your information."
      endpoint={API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC}
      icon={<ShieldCheck className="h-5 w-5" />}
    />
  );
}

export function PublicTermsPage() {
  return (
    <PublicHtmlLegalPage
      title="Terms and Conditions"
      subtitle="Rules and terms for using this app and services."
      endpoint={API_ENDPOINTS.ADMIN.TERMS_PUBLIC}
      icon={<FileText className="h-5 w-5" />}
    />
  );
}

export function PublicSupportPage() {
  const adminName = "Mohsin Mazhar Khan";
  const adminEmail = "bakalaaupdate@gmail.com";

  return (
    <PublicPageShell
      icon={<LifeBuoy className="h-5 w-5" />}
      title="Support"
      subtitle="Get help from our support team."
    >
      <div className="space-y-5 text-slate-700">
        <p>
          Welcome to the Support Center for our Food Delivery App. We are dedicated to providing a smooth, fast, and reliable food ordering experience for all our users. Whether you are facing an issue with placing an order, tracking delivery, payments, or app performance, our support team is here to help.
        </p>
        <p>
          We continuously work to improve the app experience and ensure that you can easily discover restaurants, order food, and enjoy timely delivery services.
        </p>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">How We Can Help</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Food order issues</li>
            <li>Delayed or missing deliveries</li>
            <li>Payment or refund concerns</li>
            <li>Restaurant listing problems</li>
            <li>Account login or verification issues</li>
            <li>App crashes or technical problems</li>
            <li>Incorrect order details</li>
            <li>Promo code or discount issues</li>
            <li>Suggestions and feature requests</li>
            <li>General questions about the app</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Order &amp; Delivery Support</h2>
          <p>
            If your order is delayed, incorrect, or missing items, please contact support with your order details. We will review the issue and work to provide a suitable resolution as quickly as possible.
          </p>
          <p className="mt-2 mb-2">For faster assistance, include:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Order number</li>
            <li>Restaurant name</li>
            <li>Screenshot of the issue (if applicable)</li>
            <li>Payment confirmation (if available)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Payment &amp; Refund Assistance</h2>
          <p>
            If you experience failed payments, duplicate charges, or refund delays, please contact us with complete transaction details. Refund processing times may vary depending on your payment provider or bank.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Technical Support</h2>
          <p className="mb-2">
            If the app is not working properly, try the following steps:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Update the app to the latest version</li>
            <li>Restart your device</li>
            <li>Check your internet connection</li>
            <li>Clear app cache (if applicable)</li>
          </ul>
          <p className="mt-2">
            If the issue continues, contact us with device and app information.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">User Safety &amp; Food Quality</h2>
          <p>
            We encourage restaurant partners to maintain high standards of hygiene and food quality. If you experience any food safety concerns, please report them immediately so appropriate action can be taken.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900 mb-2">Feedback &amp; Suggestions</h2>
          <p>
            Your feedback helps us improve our services and create a better food ordering experience for everyone. We welcome suggestions for new features, restaurants, and improvements.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h2 className="text-base font-semibold text-slate-900 mb-2">Contact Support</h2>
          <p className="text-sm">
            For all support inquiries, please contact:
          </p>
          <p className="mt-2 text-sm font-medium text-slate-900">{adminName}</p>
          <p className="mt-1 text-sm flex items-center gap-2">
            <Mail className="h-4 w-4 text-emerald-700" />
            <a href={`mailto:${adminEmail}`} className="text-emerald-700 hover:underline">
              {adminEmail}
            </a>
          </p>
        </section>

        <p>We appreciate your trust in our food app and thank you for choosing our service.</p>
      </div>
    </PublicPageShell>
  );
}
