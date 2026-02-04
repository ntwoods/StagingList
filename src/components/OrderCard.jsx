import { useMemo, useState } from "react";
import { formatRemaining, getRemaining } from "./CountdownTimer.jsx";

function normalizeColor(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "red") return "red";
  if (normalized === "yellow") return "yellow";
  if (normalized === "green") return "green";
  return "neutral";
}

function formatUrlLabel(url) {
  if (!url) return "Additional Order";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch (error) {
    return url;
  }
}

function segmentLabel(segment) {
  if (segment?.segmentLabel) return segment.segmentLabel;
  if (segment?.segmentIndex === 0) return "Final";
  if (typeof segment?.segmentIndex === "number") return `Additional-${segment.segmentIndex}`;
  return "Segment";
}

export default function OrderCard({ order, now, onAttachFinal, onAttachAdditional }) {
  const [showAllAdditional, setShowAllAdditional] = useState(false);
  const { remainingMs, isOverdue } = getRemaining(order.primaryTimestamp, now);
  const colorClass = normalizeColor(order.color);

  const returnedSegments = order.returnedSegments || [];
  const isReturned = returnedSegments.length > 0;

  const additionalUrls = order.additional?.urlsPending || [];
  const visibleAdditional = showAllAdditional ? additionalUrls : additionalUrls.slice(0, 1);

  const toggleLabel = useMemo(() => {
    if (additionalUrls.length <= 1) return "";
    return showAllAdditional
      ? "Hide additional list"
      : `Show +${additionalUrls.length - 1} more`;
  }, [additionalUrls.length, showAllAdditional]);

  const cardClass = `order-card ${isReturned ? "returned" : ""} ${isOverdue ? "overdue" : ""}`;

  return (
    <article className={cardClass}>
      <header className="order-card-header">
        <div>
          <h3>{order.dealerName || "Dealer"}</h3>
          <div className="order-id">Order ID: {order.orderId}</div>
        </div>
        <div className={`color-chip ${colorClass}`}>{order.color || "Unknown"}</div>
      </header>

      {isReturned ? (
        <section className="returned-section">
          <div className="returned-title">Returned by EA</div>
          <div className="returned-items">
            {returnedSegments.map((segment) => (
              <div
                className="returned-item"
                key={`${order.orderId}-${segment.segmentIndex}-${segment.segmentUrl || ""}`}
              >
                <div className="returned-header">
                  <span className="returned-chip">{segmentLabel(segment)}</span>
                </div>

                <div className="returned-remark">
                  <span className="label">EA Remark</span>
                  <span className="value">{segment.remark || "-"}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="order-meta">
        <div>
          <span className="label">Location</span>
          <span className="value">{order.location || "-"}</span>
        </div>
        <div>
          <span className="label">Marketing</span>
          <span className="value">{order.marketingPerson || "-"}</span>
        </div>
        <div>
          <span className="label">CRM</span>
          <span className="value">{order.crm || "-"}</span>
        </div>
        <div>
          <span className="label">Concerned Owner</span>
          <span className="value">{order.concernedOwner || "-"}</span>
        </div>
      </div>

      <div className="timer-row">
        {isOverdue ? (
          <span className="badge overdue">Overdue</span>
        ) : (
          <span className="badge countdown">{formatRemaining(remainingMs)}</span>
        )}
      </div>

      {order.final?.eligible ? (
        <section className="card-section">
          <div className="section-title">Final Order</div>
          <div className="button-row">
            <a className="btn ghost" href={order.final.url} target="_blank" rel="noreferrer">
              View Final Order
            </a>
            <button className="btn primary" onClick={() => onAttachFinal(order)}>
              Attach SO (Final)
            </button>
          </div>
        </section>
      ) : null}

      {order.additional?.eligible ? (
        <section className="card-section">
          <div className="section-title">Additional Orders</div>
          <div className="additional-list">
            {visibleAdditional.map((url) => (
              <div className="additional-item" key={url}>
                <div className="additional-label">{formatUrlLabel(url)}</div>
                <div className="button-row">
                  <a className="btn ghost" href={url} target="_blank" rel="noreferrer">
                    View Additional Order
                  </a>
                  <button className="btn primary" onClick={() => onAttachAdditional(order, url)}>
                    Attach SO (Additional)
                  </button>
                </div>
              </div>
            ))}

            {toggleLabel ? (
              <button
                className="link-button"
                type="button"
                onClick={() => setShowAllAdditional((prev) => !prev)}
              >
                {toggleLabel}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </article>
  );
}
