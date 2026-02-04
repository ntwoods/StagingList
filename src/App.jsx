import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchEligible, uploadAdditional, uploadFinal } from "./api.js";
import OrderCard from "./components/OrderCard.jsx";
import UploadModal from "./components/UploadModal.jsx";
import { toMillis, useNow } from "./components/CountdownTimer.jsx";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function buildPayloadFiles(files) {
  const payloads = await Promise.all(
    files.map(async (file) => {
      const dataUrl = await readFileAsDataUrl(file);
      const base64 = String(dataUrl).split(",")[1] || "";
      return {
        name: file.name,
        mimeType: file.type || "application/pdf",
        base64
      };
    })
  );

  return payloads.filter((file) => file.base64);
}

export default function App() {
  const now = useNow();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [modalState, setModalState] = useState({
    open: false,
    mode: null,
    order: null,
    additionalUrl: null
  });

  const loadEligible = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchEligible();
      const sorted = [...data].sort(
        (a, b) => toMillis(a.primaryTimestamp) - toMillis(b.primaryTimestamp)
      );
      setOrders(sorted);
    } catch (err) {
      setError(err.message || "Unable to load orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEligible();
  }, [loadEligible]);

  const toastClass = useMemo(() => {
    if (!toast) return "";
    return toast.tone === "error" ? "toast error" : "toast";
  }, [toast]);

  const openFinalModal = (order) => {
    setModalState({ open: true, mode: "final", order, additionalUrl: null });
  };

  const openAdditionalModal = (order, additionalUrl) => {
    setModalState({ open: true, mode: "additional", order, additionalUrl });
  };

  const closeModal = () => {
    if (uploading) return;
    setModalState({ open: false, mode: null, order: null, additionalUrl: null });
  };

  const showToast = (message, tone = "success") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 3000);
  };

  const handleUpload = async (files) => {
    if (!modalState.order) return;

    setUploading(true);
    try {
      const payloadFiles = await buildPayloadFiles(files);
      if (!payloadFiles.length) {
        throw new Error("No valid PDF files found.");
      }

      if (modalState.mode === "final") {
        await uploadFinal(modalState.order.orderId, payloadFiles);
      } else {
        await uploadAdditional(
          modalState.order.orderId,
          modalState.additionalUrl,
          payloadFiles
        );
      }

      setModalState({ open: false, mode: null, order: null, additionalUrl: null });
      showToast("Uploaded & Updated");
      await loadEligible();
    } catch (err) {
      showToast(err.message || "Upload failed.", "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="app">
      <header className="page-header">
        <div>
          <h1>Manage Sales Orders' Staging Lists</h1>
          <p>Approve + Final file present + pending SO attachments</p>
        </div>
        <button className="btn ghost" onClick={loadEligible} disabled={loading}>
          Refresh
        </button>
      </header>

      {toast ? <div className={toastClass}>{toast.message}</div> : null}

      {error ? <div className="error-banner">{error}</div> : null}

      {loading ? (
        <div className="empty-state">Loading eligible orders...</div>
      ) : orders.length ? (
        <div className="grid">
          {orders.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              now={now}
              onAttachFinal={openFinalModal}
              onAttachAdditional={openAdditionalModal}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">No eligible orders right now.</div>
      )}

      <UploadModal
        open={modalState.open}
        title={
          modalState.mode === "final"
            ? "Attach SO for Final Order"
            : "Attach SO for Additional Order"
        }
        subtitle={
          modalState.mode === "additional" && modalState.additionalUrl
            ? `Additional URL: ${modalState.additionalUrl}`
            : ""
        }
        onClose={closeModal}
        onSubmit={handleUpload}
        loading={uploading}
      />
    </div>
  );
}
