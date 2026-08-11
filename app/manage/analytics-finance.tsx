"use client";

import { useState } from "react";

import type {
  ManagementInsights,
  PromotionCreateInput,
  RegularBookingReport,
  RemittanceSummary,
} from "./management-adapter";
import styles from "./analytics-finance.module.css";

export type AnalyticsPeriod = "today" | "7d" | "30d" | "90d";

type LoadingState = {
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export type AnalyticsViewProps = LoadingState & {
  report: RegularBookingReport | null;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  courts?: Array<{ id: string; name: string }>;
  courtId?: string | null;
  onCourtChange?: (courtId: string | null) => void;
  promotions?: ManagementInsights["promotions"] | null;
  onCreatePromotion?: (input: PromotionCreateInput) => Promise<void>;
};

export type FinanceViewProps = LoadingState & {
  finance: ManagementInsights["finance"];
  onPrepare?: () => void;
  preparing?: boolean;
};

const PERIODS: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function number(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits }).format(value);
}

function localDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function localInstant(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <section className={styles.statePanel} aria-busy="true" aria-live="polite">
      <span className={styles.loader} aria-hidden="true" />
      <div>
        <strong>Loading {label}</strong>
        <p>Reading the authenticated tenant ledger.</p>
      </div>
    </section>
  );
}

function EmptyPanel({
  title,
  message,
  error,
  onRetry,
}: {
  title: string;
  message: string;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <section className={styles.statePanel} role={error ? "alert" : undefined}>
      <span className={styles.stateMark} aria-hidden="true">{error ? "!" : "00"}</span>
      <div>
        <strong>{error ? "This live result is unavailable" : title}</strong>
        <p>{error || message}</p>
        {error && onRetry && (
          <button type="button" className={styles.secondaryButton} onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </section>
  );
}

function DailyGrossChart({ report }: { report: RegularBookingReport }) {
  const data = report.breakdowns.daily;
  const maximum = Math.max(...data.map((item) => item.grossPaid), 0);
  const width = 720;
  const chartTop = 18;
  const chartBottom = 188;
  const plotHeight = chartBottom - chartTop;
  const cellWidth = width / Math.max(data.length, 1);
  const barWidth = Math.max(Math.min(cellWidth * 0.62, 24), data.length > 60 ? 2 : 4);
  const labelIndexes = new Set([
    0,
    Math.floor((data.length - 1) / 2),
    Math.max(data.length - 1, 0),
  ]);
  const description = maximum > 0
    ? `${number(report.summary.grossPaid)} ${report.currency} paid customer gross across ${report.range.dayCount} days.`
    : `No paid customer gross recorded across ${report.range.dayCount} days.`;

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chart}
        viewBox="0 0 720 230"
        role="img"
        aria-labelledby="daily-gross-chart-title daily-gross-chart-description"
        preserveAspectRatio="none"
      >
        <title id="daily-gross-chart-title">Paid customer gross by booking date</title>
        <desc id="daily-gross-chart-description">{description}</desc>
        {[0, 0.5, 1].map((ratio) => {
          const y = chartTop + plotHeight * ratio;
          return <line key={ratio} x1="0" x2={width} y1={y} y2={y} className={styles.gridLine} />;
        })}
        {data.map((item, index) => {
          const height = maximum > 0 ? (item.grossPaid / maximum) * plotHeight : 0;
          const x = index * cellWidth + (cellWidth - barWidth) / 2;
          const y = chartBottom - height;
          return (
            <g key={item.date}>
              <rect
                x={x}
                y={height > 0 ? y : chartBottom - 2}
                width={barWidth}
                height={Math.max(height, 2)}
                rx={Math.min(barWidth / 2, 4)}
                className={height > 0 ? styles.chartBar : styles.chartZero}
              >
                <title>{`${localDate(item.date)}: ${money(item.grossPaid, report.currency)}`}</title>
              </rect>
              {labelIndexes.has(index) && (
                <text
                  x={index * cellWidth + cellWidth / 2}
                  y="218"
                  textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
                  className={styles.axisLabel}
                >
                  {new Intl.DateTimeFormat("en-PH", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  }).format(new Date(`${item.date}T00:00:00Z`))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function AnalyticsView({
  report,
  period,
  onPeriodChange,
  courts = [],
  courtId = null,
  onCourtChange,
  promotions = null,
  onCreatePromotion,
  loading = false,
  error = null,
  onRetry,
}: AnalyticsViewProps) {
  const [offerDraft, setOfferDraft] = useState<PromotionCreateInput | null>(null);
  const [offerPending, setOfferPending] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);
  if (loading && !report) return <LoadingPanel label="analytics" />;
  if (error || !report) {
    return (
      <EmptyPanel
        title="Live analytics are not loaded"
        message="No sample totals are shown. Connect an authorized manager session to read the complete regular-booking report."
        error={error}
        onRetry={onRetry}
      />
    );
  }

  const { summary } = report;
  const topCourtSales = Math.max(
    ...report.breakdowns.courts.map((court) => court.venueSalesPaid),
    0,
  );
  const recommendationWindows = [
    { startsAt: "12:00", endsAt: "15:00", label: "Lunch rally offer" },
    { startsAt: "06:00", endsAt: "09:00", label: "Early-bird package" },
    { startsAt: "09:00", endsAt: "12:00", label: "Morning court saver" },
  ];
  const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdayPerformance = Array.from({ length: 7 }, (_, weekday) => {
    const days = report.breakdowns.daily.filter((entry) => {
      const date = new Date(`${entry.date}T00:00:00Z`);
      return (date.getUTCDay() + 6) % 7 === weekday;
    });
    return {
      weekday,
      bookedHours: days.reduce((sum, day) => sum + day.bookedHours, 0),
      observations: days.length,
    };
  }).filter((item) => item.observations > 0)
    .sort((left, right) => left.bookedHours / left.observations - right.bookedHours / right.observations)
    .slice(0, 3);
  const validFrom = new Date().toISOString().slice(0, 10);
  const validUntilDate = new Date();
  validUntilDate.setUTCDate(validUntilDate.getUTCDate() + 28);
  const validUntil = validUntilDate.toISOString().slice(0, 10);
  const recommendedActions = weekdayPerformance.map((item, index) => {
    const window = recommendationWindows[index];
    const availableHours = item.observations * Math.max(courts.length, 1) * 3;
    return {
      weekday: item.weekday,
      utilization: availableHours > 0
        ? Math.min(100, Math.round(item.bookedHours / availableHours * 100))
        : 0,
      ...window,
    };
  });

  const openOffer = (action: typeof recommendedActions[number]) => {
    setOfferError(null);
    setOfferDraft({
      name: action.label,
      discountType: "percentage",
      discountValue: 15,
      weekdays: [action.weekday],
      startsAt: action.startsAt,
      endsAt: action.endsAt,
      validFrom,
      validUntil,
      courtIds: courtId ? [courtId] : courts.map((court) => court.id),
      maxRedemptions: 40,
    });
  };

  const publishOffer = async () => {
    if (!offerDraft || !onCreatePromotion) return;
    setOfferPending(true);
    setOfferError(null);
    try {
      await onCreatePromotion(offerDraft);
      setOfferDraft(null);
    } catch (offerFailure) {
      setOfferError(offerFailure instanceof Error
        ? offerFailure.message
        : "The offer could not be published.");
    } finally {
      setOfferPending(false);
    }
  };
  const periodLabel = `${localDate(report.range.dateFrom)} – ${localDate(report.range.dateTo)}`;

  return (
    <section className={styles.workspace} aria-labelledby="analytics-title" aria-busy={loading}>
      <header className={styles.sectionHeader}>
        <div>
          <h2 id="analytics-title">{periodLabel}</h2>
          <p>Updated {localInstant(report.asOf, report.timezone)}</p>
        </div>
        {loading && <span className={styles.refreshing} aria-live="polite">Refreshing…</span>}
      </header>

      <div className={styles.controlRow}>
        <div className={styles.segmentedControl} role="group" aria-label="Analytics date range">
          {PERIODS.map((option) => (
            <button
              type="button"
              key={option.value}
              className={period === option.value ? styles.segmentActive : undefined}
              aria-pressed={period === option.value}
              onClick={() => onPeriodChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {onCourtChange && (
          <label className={styles.courtFilter}>
            <span>Court</span>
            <select value={courtId || ""} onChange={(event) => onCourtChange(event.target.value || null)}>
              <option value="">All courts</option>
              {courts.map((court) => <option value={court.id} key={court.id}>{court.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {!report.complete && (
        <div className={styles.warning} role="status">
          This report contains {report.completeness.anomalyCount} row {report.completeness.anomalyCount === 1 ? "anomaly" : "anomalies"}. Review the source data before using totals.
        </div>
      )}

      <div className={styles.kpiGrid} aria-label="Booking financial summary">
        <article className={styles.kpiPrimary}>
          <span>Paid customer gross</span>
          <strong>{money(summary.grossPaid, report.currency)}</strong>
          <small>Total paid amount snapshots</small>
        </article>
        <article className={styles.kpiCard}>
          <span>Venue court sales</span>
          <strong>{money(summary.venueSalesPaid, report.currency)}</strong>
          <small>Paid booking subtotals</small>
        </article>
        <article className={styles.kpiCard}>
          <span>Platform booking fees</span>
          <strong>{money(summary.platformBookingFeesPaid, report.currency)}</strong>
          <small>Paid service-fee snapshots</small>
        </article>
        <article className={styles.kpiCard}>
          <span>Paid bookings</span>
          <strong>{number(summary.paidBookingCount, 0)}</strong>
          <small>{number(summary.bookedHours)} booked hours</small>
        </article>
      </div>

      <div className={styles.analyticsGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Paid gross</span>
              <h3>Daily booking value</h3>
            </div>
            <span className={styles.summaryPill}>{money(summary.grossPaid, report.currency)}</span>
          </div>
          <DailyGrossChart report={report} />
          <div className={styles.chartFooter}>
            <span><i className={styles.legendPaid} aria-hidden="true" /> Paid customer gross</span>
            <span>{summary.recordedRefundedBookingCount} currently refunded · {money(summary.recordedRefunds, report.currency)}</span>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Workflow</span>
              <h3>Booking state</h3>
            </div>
            <span className={styles.summaryPill}>{summary.totalBookingCount} total</span>
          </div>
          <dl className={styles.statusList}>
            <div><dt><i className={styles.statusAttention} aria-hidden="true" />Needs payment</dt><dd>{summary.lifecycleCounts.pendingPayment}</dd></div>
            <div><dt><i className={styles.statusReview} aria-hidden="true" />Payment review</dt><dd>{summary.lifecycleCounts.paymentReview}</dd></div>
            <div><dt><i className={styles.statusConfirmed} aria-hidden="true" />Confirmed</dt><dd>{summary.lifecycleCounts.confirmed}</dd></div>
            <div><dt><i className={styles.statusComplete} aria-hidden="true" />Completed</dt><dd>{summary.lifecycleCounts.completed}</dd></div>
            <div><dt><i className={styles.statusClosed} aria-hidden="true" />Cancelled or expired</dt><dd>{summary.lifecycleCounts.cancelled + summary.lifecycleCounts.expired}</dd></div>
          </dl>
        </article>
      </div>

      <article className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Court performance</span>
            <h3>Paid sales by court</h3>
          </div>
          <span className={styles.summaryPill}>{report.breakdowns.courts.length} courts</span>
        </div>
        {report.breakdowns.courts.length ? (
          <ol className={styles.courtList}>
            {report.breakdowns.courts.map((court) => (
              <li key={court.courtId}>
                <div className={styles.courtLine}>
                  <div><strong>{court.courtName}</strong><span>{court.paidBookingCount} paid · {number(court.bookedHours)} booked hrs</span></div>
                  <strong>{money(court.venueSalesPaid, report.currency)}</strong>
                </div>
                <div className={styles.performanceTrack} aria-hidden="true">
                  <span style={{ width: `${topCourtSales > 0 ? (court.venueSalesPaid / topCourtSales) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.emptyCopy}>No courts are included in this report.</p>
        )}
      </article>

      <article className={`${styles.panel} ${styles.recommendationPanel}`}>
        <div className={styles.panelHeading}>
          <div>
            <span className={styles.eyebrow}>Recommended actions</span>
            <h3>Underused slots</h3>
          </div>
          <span className={styles.summaryPill}>{recommendedActions.length} opportunities</span>
        </div>
        <div className={styles.recommendationList}>
          {recommendedActions.map((action) => (
            <article key={`${action.weekday}-${action.startsAt}`}>
              <span>{weekdayNames[action.weekday]} / {action.startsAt}-{action.endsAt}</span>
              <div><strong>{action.label}</strong><small>{action.utilization}% utilized in this reporting window</small></div>
              <button
                type="button"
                onClick={() => openOffer(action)}
                disabled={!promotions?.canCreate || !onCreatePromotion}
              >Create offer</button>
            </article>
          ))}
        </div>
        {promotions && !promotions.available ? (
          <p className={styles.recommendationNote}>Offer publishing will unlock after the Dinktopia promotion migration is installed.</p>
        ) : !promotions?.canCreate ? (
          <p className={styles.recommendationNote}>Publishing offers is reserved for the System Owner or this tenant&apos;s court owner.</p>
        ) : null}
        {promotions?.items.some((offer) => offer.status === "active") ? (
          <div className={styles.activeOffers}>
            <span>Published offers</span>
            {promotions.items.filter((offer) => offer.status === "active").map((offer) => (
              <strong key={offer.id}>{offer.name} - {offer.discountValue}{offer.discountType === "percentage" ? "%" : " PHP"} off - {offer.redemptionCount} used</strong>
            ))}
          </div>
        ) : null}
        <p className={styles.recommendationNote}>Recommendations use this tenant&apos;s selected reporting range. The owner controls the final discount, dates, and redemption limit.</p>
      </article>

      {offerDraft && (
        <div className={styles.offerBackdrop} role="presentation">
          <section className={styles.offerDialog} role="dialog" aria-modal="true" aria-labelledby="offer-title">
            <header>
              <div><span className={styles.eyebrow}>Owner approval</span><h3 id="offer-title">Publish a targeted offer</h3></div>
              <button type="button" aria-label="Close offer dialog" onClick={() => setOfferDraft(null)}>x</button>
            </header>
            <p>Only matching future slots for this tenant receive the discount. Existing bookings are never repriced.</p>
            <div className={styles.offerGrid}>
              <label><span>Offer name</span><input value={offerDraft.name} maxLength={120} onChange={(event) => setOfferDraft({ ...offerDraft, name: event.target.value })} /></label>
              <label><span>Discount</span><div className={styles.discountInput}><input type="number" min="1" max="50" value={offerDraft.discountValue} onChange={(event) => setOfferDraft({ ...offerDraft, discountValue: Number(event.target.value) })} /><b>%</b></div></label>
              <label><span>Starts</span><input type="date" value={offerDraft.validFrom} onChange={(event) => setOfferDraft({ ...offerDraft, validFrom: event.target.value })} /></label>
              <label><span>Ends</span><input type="date" value={offerDraft.validUntil} onChange={(event) => setOfferDraft({ ...offerDraft, validUntil: event.target.value })} /></label>
              <label><span>Maximum redemptions</span><input type="number" min="1" max="10000" value={offerDraft.maxRedemptions ?? ""} onChange={(event) => setOfferDraft({ ...offerDraft, maxRedemptions: Number(event.target.value) || null })} /></label>
              <div className={styles.offerScope}><span>Applies to</span><strong>{weekdayNames[offerDraft.weekdays[0]]} - {offerDraft.startsAt}-{offerDraft.endsAt} - {offerDraft.courtIds.length} {offerDraft.courtIds.length === 1 ? "court" : "courts"}</strong></div>
            </div>
            {offerError && <p className={styles.offerError} role="alert">{offerError}</p>}
            <footer>
              <button type="button" onClick={() => setOfferDraft(null)} disabled={offerPending}>Cancel</button>
              <button type="button" className={styles.publishOffer} onClick={() => void publishOffer()} disabled={offerPending || !offerDraft.name.trim() || offerDraft.discountValue <= 0 || offerDraft.discountValue > 50}>{offerPending ? "Publishing..." : "Publish offer"}</button>
            </footer>
          </section>
        </div>
      )}

      <details className={styles.boundaryNote}>
        <summary>About these totals</summary>
        <p>Values use each regular booking’s current payment status and stored amount snapshots. Recorded refunds reflect bookings currently marked refunded. This is not a payment-event or full refund ledger, so net revenue and occupancy are intentionally not estimated. Remittance due comes from the separate platform-fee ledger.</p>
      </details>
    </section>
  );
}

function remittanceStatusLabel(status: RemittanceSummary["status"]): string {
  return {
    draft: "Draft",
    due: "Due",
    submitted: "Submitted",
    under_review: "Under review",
    settled: "Settled",
    rejected: "Needs attention",
    void: "Void",
  }[status];
}

function maskReference(reference: string | null): string {
  if (!reference) return "Not configured";
  const visible = reference.slice(-4);
  return reference.length > 4 ? `•••• ${visible}` : visible;
}

function RemittanceCard({ item }: { item: RemittanceSummary }) {
  return (
    <article className={styles.remittanceCard}>
      <div className={styles.remittanceTitle}>
        <div>
          <span>{item.reference}</span>
          <strong>{money(item.remainingBalance, item.currency)} remaining</strong>
        </div>
        <span className={`${styles.statusBadge} ${styles[`remittance_${item.status}`]}`}>
          {remittanceStatusLabel(item.status)}
        </span>
      </div>
      <dl className={styles.remittanceFacts}>
        <div><dt>Amount due</dt><dd>{money(item.amountDue, item.currency)}</dd></div>
        <div><dt>Settled</dt><dd>{money(item.amountSettled, item.currency)}</dd></div>
        <div><dt>Bookings</dt><dd>{number(item.bookingsCount, 0)}</dd></div>
        <div><dt>Due date</dt><dd>{item.cycleDueOn ? localDate(item.cycleDueOn) : "Not set"}</dd></div>
      </dl>
    </article>
  );
}

export function FinanceView({
  finance,
  loading = false,
  error = null,
  onRetry,
  onPrepare,
  preparing = false,
}: FinanceViewProps) {
  if (loading && !finance) return <LoadingPanel label="finance" />;
  if (error || !finance) {
    return (
      <EmptyPanel
        title="Live finance is not loaded"
        message="No sample balances are shown. Finance is available to the System Owner and active venue owners or admins."
        error={error}
        onRetry={onRetry}
      />
    );
  }

  const { dashboard, history } = finance;
  const openRemaining = dashboard.openRemittances.reduce(
    (sum, item) => sum + item.remainingBalance,
    0,
  );
  const currency = dashboard.openRemittances[0]?.currency || history[0]?.currency || "PHP";
  const destination = dashboard.paymentDestination;

  return (
    <section className={styles.workspace} aria-labelledby="finance-title" aria-busy={loading}>
      <header className={styles.sectionHeader}>
        <div>
          <h2 id="finance-title">As of {localInstant(dashboard.serverNow, dashboard.timezone)}</h2>
          <p>{dashboard.timezone}</p>
        </div>
        <span className={dashboard.role === "system_owner" ? styles.monitorBadge : styles.ownerBadge}>
          {dashboard.role === "system_owner" ? "Monitor access" : "Venue remittance"}
        </span>
      </header>

      <div className={styles.kpiGrid} aria-label="Remittance summary">
        <article className={styles.kpiPrimary}>
          <span>Accrued platform fees</span>
          <strong>{money(dashboard.accumulated.amountDue, currency)}</strong>
          <small>{dashboard.accumulated.bookingsCount} eligible paid bookings not yet frozen</small>
        </article>
        <article className={styles.kpiCard}>
          <span>Open remaining</span>
          <strong>{money(openRemaining, currency)}</strong>
          <small>{dashboard.openRemittances.length} open remittance {dashboard.openRemittances.length === 1 ? "record" : "records"}</small>
        </article>
        <article className={styles.kpiCard}>
          <span>Settled total</span>
          <strong>{money(dashboard.settledTotal, currency)}</strong>
          <small>Accepted platform-fee remittances</small>
        </article>
        <article className={styles.kpiCard}>
          <span>Next due date</span>
          <strong className={styles.dateValue}>{localDate(dashboard.nextDueOn)}</strong>
          <small>Asia/Manila cycle date</small>
        </article>
      </div>

      <div className={styles.financeGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Action status</span>
              <h3>{dashboard.canPrepare.allowed ? "Ready to prepare" : "Current cycle"}</h3>
            </div>
          </div>
          <p className={styles.actionReason}>{dashboard.canPrepare.reason}</p>
          {dashboard.role === "court_owner" && onPrepare ? (
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!dashboard.canPrepare.allowed || preparing}
              onClick={onPrepare}
            >
              {preparing ? "Preparing…" : "Prepare remittance"}
            </button>
          ) : dashboard.role === "court_owner" ? (
            <div className={styles.monitorNote}>
              This page monitors the authoritative ledger. Remittance preparation remains in the protected submission workflow.
            </div>
          ) : (
            <div className={styles.monitorNote}>
              System Owner access is read-only here. The venue owner prepares and submits remittance from their authenticated account.
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Payment destination</span>
              <h3>{destination?.configured ? destination.method.replaceAll("_", " ") : "Setup incomplete"}</h3>
            </div>
          </div>
          {destination ? (
            <dl className={styles.destinationFacts}>
              <div><dt>Account</dt><dd>{destination.accountName || "Not configured"}</dd></div>
              <div><dt>Reference</dt><dd>{maskReference(destination.accountReference)}</dd></div>
            </dl>
          ) : (
            <p className={styles.emptyCopy}>No platform remittance destination is configured.</p>
          )}
        </article>
      </div>

      <div className={styles.ledgerGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Open ledger</span>
              <h3>Remittances in progress</h3>
            </div>
            <span className={styles.summaryPill}>{dashboard.openRemittances.length} open</span>
          </div>
          {dashboard.openRemittances.length ? (
            <div className={styles.remittanceGrid}>
              {dashboard.openRemittances.map((item) => <RemittanceCard item={item} key={item.id} />)}
            </div>
          ) : (
            <p className={styles.emptyCopy}>There are no prepared, submitted, or unresolved remittances.</p>
          )}
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span className={styles.eyebrow}>Closed ledger</span>
              <h3>Settlement history</h3>
            </div>
            <span className={styles.summaryPill}>{history.length} records</span>
          </div>
          {history.length ? (
            <ol className={styles.historyList}>
              {history.map((item) => (
                <li key={item.id}>
                  <div><strong>{item.reference}</strong><span>{item.settledAt ? `Settled ${new Date(item.settledAt).toLocaleDateString("en-PH")}` : item.cancelledAt ? `Closed ${new Date(item.cancelledAt).toLocaleDateString("en-PH")}` : "Closed record"}</span></div>
                  <div><strong>{money(item.amountSettled, item.currency)}</strong><span className={`${styles.statusBadge} ${styles[`remittance_${item.status}`]}`}>{remittanceStatusLabel(item.status)}</span></div>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.emptyCopy}>No settled or void remittance history is recorded yet.</p>
          )}
        </article>
      </div>

      <details className={styles.boundaryNote}>
        <summary>About the ledger</summary>
        <p>Accrued fees are eligible paid booking fees not yet attached to a remittance. Open and settled values come from remittance records and accepted payments—not from the analytics chart or a browser-side fee estimate.</p>
      </details>
    </section>
  );
}
