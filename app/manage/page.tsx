"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import styles from "./manage.module.css";
import {
  formatPeso,
  isAllowedCustomerQrUrl,
  managementAdapter,
  previewRoleSessions,
  type Booking,
  type BookingPaymentStatus,
  type BookingStatus,
  type BusinessPaymentConfiguration,
  type ManagementCapability,
  type ManagementContext,
  type ManagementSnapshot,
  type TenantRole,
} from "./management-adapter";
import {
  PlatformRequestError,
  platformMode,
  signInOwner,
  signOutOwner,
} from "../lib/platform/client";
import { activeTenant } from "../tenants/registry";

type View =
  | "overview"
  | "bookings"
  | "schedule"
  | "blocks"
  | "customers"
  | "reports"
  | "settings"
  | "access";

type PreviewState = "ready" | "loading" | "empty" | "error" | "restricted";

type ConfirmAction = {
  title: string;
  detail: string;
  confirmLabel: string;
  actionType: string;
  resourceId?: string;
  payload?: unknown;
  tone?: "default" | "danger";
  onSuccess?: () => void;
};

type ToastState = {
  message: string;
  tone: "success" | "error" | "warning";
};

const NAV_ITEMS: { id: View; label: string; short: string }[] = [
  { id: "overview", label: "Overview", short: "OV" },
  { id: "bookings", label: "Bookings", short: "BK" },
  { id: "schedule", label: "Schedule", short: "SC" },
  { id: "blocks", label: "Court blocks", short: "BL" },
  { id: "customers", label: "Customers", short: "CU" },
  { id: "reports", label: "Reports", short: "RP" },
  { id: "settings", label: "Venue settings", short: "ST" },
  { id: "access", label: "Team & access", short: "AC" },
];

const VIEW_CAPABILITY: Partial<Record<View, ManagementCapability>> = {
  customers: "customer:view",
  reports: "report:view",
  settings: "settings:update",
};

const VIEW_COPY: Record<View, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Saturday · 8 August",
    title: "Good afternoon, Alex.",
    description: "Your courts are moving well. Here’s what needs your attention next.",
  },
  bookings: {
    eyebrow: "Booking desk",
    title: "Bookings",
    description: "Find reservations, confirm payments and keep arrivals moving.",
  },
  schedule: {
    eyebrow: "Court operations",
    title: "Schedule",
    description: "See every court, hold and block in one conflict-aware timeline.",
  },
  blocks: {
    eyebrow: "Availability controls",
    title: "Court blocks",
    description: "Take courts offline for maintenance, events or private use.",
  },
  customers: {
    eyebrow: "Player directory",
    title: "Customers",
    description: "Recognize regulars and understand how your player community is growing.",
  },
  reports: {
    eyebrow: "Performance",
    title: "Reports",
    description: "Track revenue, occupancy and demand without losing the court-level detail.",
  },
  settings: {
    eyebrow: "Tenant configuration",
    title: "Venue settings",
    description: "Manage Dinktopia’s courts, rates, hours and booking rules.",
  },
  access: {
    eyebrow: "Tenant access",
    title: "Team & roles",
    description: "Review the people and session capabilities assigned to this tenant.",
  },
};

const LIVE_VIEW_COPY: Record<View, { eyebrow: string; title: string; description: string }> = {
  overview: {
    eyebrow: "Tenant operations",
    title: "Dinktopia workspace.",
    description: "Authenticated, server-scoped booking data and launch readiness.",
  },
  bookings: {
    eyebrow: "Tenant booking register",
    title: "Loaded bookings",
    description: "Review booking rows returned for the authenticated tenant session.",
  },
  schedule: {
    eyebrow: "Read-only operations",
    title: "Loaded schedule",
    description: "Review loaded bookings and court blocks without assuming future availability.",
  },
  blocks: {
    eyebrow: "Protected availability",
    title: "Court blocks",
    description: "Review loaded block records; create and remove controls remain server-authorized.",
  },
  customers: {
    eyebrow: "Protected player data",
    title: "Customers",
    description: "Customer details require a tenant-scoped capability from the shared platform.",
  },
  reports: {
    eyebrow: "Protected reporting",
    title: "Reports",
    description: "Reporting appears only when the authenticated session is authorized to view it.",
  },
  settings: {
    eyebrow: "Server-authorized setup",
    title: "Venue settings",
    description: "Configure live court inventory, shared hours and rates within the authenticated session's server permissions.",
  },
  access: {
    eyebrow: "Authenticated session",
    title: "Team & access",
    description: "Review only the membership and capability facts returned by the shared platform.",
  },
};

const ROLE_LABEL: Record<TenantRole, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  host: "Host",
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  awaiting_payment: "Awaiting payment",
  checked_in: "Checked in",
  completed: "Completed",
};

const PAYMENT_LABEL: Record<BookingPaymentStatus, string> = {
  unpaid: "Unpaid",
  pending: "Pending",
  partial: "Partially paid",
  paid: "Paid",
  refunded: "Refunded",
  rejected: "Rejected",
  unknown: "Not returned",
};

const paymentNeedsAttention = (status: BookingPaymentStatus) =>
  status === "unpaid" || status === "pending" || status === "partial" ||
  status === "rejected" || status === "unknown";

function manilaCalendarDate(): string {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: activeTenant.identity.timezone,
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function blockCalendarParts(dateValue: string | null, fallback: string) {
  const candidate = dateValue ? new Date(`${dateValue}T12:00:00Z`) : null;
  if (!candidate || !Number.isFinite(candidate.getTime())) {
    return { month: "DATE", day: "—", year: fallback };
  }
  return {
    month: new Intl.DateTimeFormat("en-PH", {
      month: "short",
      timeZone: activeTenant.identity.timezone,
    }).format(candidate).toUpperCase(),
    day: new Intl.DateTimeFormat("en-PH", {
      day: "2-digit",
      timeZone: activeTenant.identity.timezone,
    }).format(candidate),
    year: new Intl.DateTimeFormat("en-PH", {
      year: "numeric",
      timeZone: activeTenant.identity.timezone,
    }).format(candidate),
  };
}

const ROLE_TEAM: { name: string; initials: string; role: TenantRole; activity: string }[] = [
  { name: "Alex Rivera", initials: "AR", role: "owner", activity: "Active now" },
  { name: "Mara Villanueva", initials: "MV", role: "admin", activity: "Today, 1:42 PM" },
  { name: "Jules Ramos", initials: "JR", role: "staff", activity: "Yesterday" },
  { name: "Sam Flores", initials: "SF", role: "host", activity: "Aug 6" },
];

const CAPABILITY_LABEL: Record<ManagementCapability, string> = {
  "booking:create": "Create bookings",
  "booking:update": "Edit bookings",
  "booking:cancel": "Cancel bookings",
  "booking:check-in": "Check in players",
  "schedule:block": "Block court time",
  "customer:view": "View customers",
  "report:view": "View reports",
  "settings:update": "Change venue settings",
  "tenant:publish": "Request live activation",
};

const cx = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

function ActionButton({
  children,
  variant = "primary",
  disabled,
  onClick,
  type = "button",
  className,
  ariaLabel,
  disabledDescriptionId,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  ariaLabel?: string;
  disabledDescriptionId?: string;
}) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], className)}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-describedby={disabled ? disabledDescriptionId : undefined}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: BookingStatus }) {
  return (
    <span className={cx(styles.statusPill, styles[`status_${status}`])}>
      <span className={styles.statusDot} aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function Avatar({ initials, tone = 0 }: { initials: string; tone?: number }) {
  return (
    <span className={cx(styles.avatar, styles[`avatarTone${tone % 4}`])} aria-hidden="true">
      {initials}
    </span>
  );
}

function MetricCard({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <article className={cx(styles.metricCard, accent && styles.metricAccent)}>
      <div className={styles.metricTop}>
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-live="polite">
      <span className={styles.srOnly}>Loading Dinktopia management data</span>
      <div className={cx(styles.skeletonLine, styles.skeletonEyebrow)} />
      <div className={cx(styles.skeletonLine, styles.skeletonTitle)} />
      <div className={styles.skeletonMetrics}>
        {[0, 1, 2, 3].map((item) => (
          <div className={styles.skeletonCard} key={item} />
        ))}
      </div>
      <div className={styles.skeletonPanels}>
        <div className={styles.skeletonPanel} />
        <div className={styles.skeletonPanel} />
      </div>
    </div>
  );
}

function StatePanel({
  kind,
  onRestore,
  role,
  isPreview,
}: {
  kind: Exclude<PreviewState, "ready" | "loading">;
  onRestore: () => void;
  role: TenantRole;
  isPreview: boolean;
}) {
  const copy = {
    empty: {
      mark: "00",
      title: "Nothing here yet",
      body: "New tenant activity will appear here after Dinktopia starts accepting bookings.",
      action: "Show preview data",
    },
    error: {
      mark: "!",
      title: "We couldn’t refresh this view",
      body: "Your last saved data is safe. Check the connection and try once more.",
      action: "Try again",
    },
    restricted: {
      mark: "—",
      title: "This view needs another permission",
      body: `The current ${ROLE_LABEL[role].toLowerCase()} session does not include access to this area. Ask a tenant owner or admin if your role needs to change.`,
      action: "Return to preview",
    },
  }[kind];

  return (
    <section className={styles.statePanel} aria-labelledby={`state-${kind}-title`}>
      <span className={styles.stateMark} aria-hidden="true">
        {copy.mark}
      </span>
      <p className={styles.eyebrow}>
        Dinktopia · {isPreview ? ROLE_LABEL[role] : "Live workspace"}
      </p>
      <h2 id={`state-${kind}-title`}>{copy.title}</h2>
      <p>{copy.body}</p>
      <ActionButton onClick={onRestore}>{copy.action}</ActionButton>
    </section>
  );
}

function PermissionPanel({
  role,
  view,
  isPreview,
}: {
  role: TenantRole;
  view: View;
  isPreview: boolean;
}) {
  return (
    <section className={styles.permissionPanel} aria-labelledby="permission-title">
      <div className={styles.permissionBadge} aria-hidden="true">
        {isPreview ? ROLE_LABEL[role].slice(0, 2).toUpperCase() : "—"}
      </div>
      <div>
        <p className={styles.eyebrow}>{isPreview ? "Role-aware preview" : "Protected tenant area"}</p>
        <h2 id="permission-title">
          {isPreview
            ? `${ROLE_LABEL[role]} access stops here`
            : `${VIEW_COPY[view].title} is unavailable`}
        </h2>
        {isPreview ? (
          <>
            <p>
              This preview session was not given access to {VIEW_COPY[view].title.toLowerCase()}.
              Server-side tenant policy remains the source of truth.
            </p>
            <p className={styles.permissionHint}>
              Switch roles in Preview controls to inspect another server-shaped session.
            </p>
          </>
        ) : (
          <>
            <p>
              The authenticated tenant session did not return the capability required for this
              area. No preview data or assumed permissions are shown.
            </p>
            <p className={styles.permissionHint}>
              Sign in with a verified tenant account after access has been provisioned.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function OverviewView({
  snapshot,
  can,
  goTo,
  request,
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  goTo: (view: View) => void;
  request: (action: ConfirmAction) => void;
}) {
  const completed = snapshot.setup.filter((item) => item.complete).length;
  const progress = snapshot.setup.length
    ? Math.round((completed / snapshot.setup.length) * 100)
    : 0;
  const loadedBookings = snapshot.bookings.slice(0, 3);
  const isPreview = snapshot.tenant.mode === "preview";
  const readinessItems = isPreview ? snapshot.setup.slice(4) : snapshot.setup;
  const paidRevenue = snapshot.bookings
    .filter((booking) => booking.payment === "paid")
    .reduce((total, booking) => total + booking.amount, 0);
  const paymentAttention = snapshot.bookings.find((booking) =>
    paymentNeedsAttention(booking.payment)
  );
  const paidCount = snapshot.bookings.filter((booking) => booking.payment === "paid").length;

  return (
    <>
      <section
        className={styles.metricGrid}
        aria-label={isPreview ? "Preview key numbers" : "Loaded tenant result"}
      >
        <MetricCard label="Loaded revenue" value={formatPeso(paidRevenue)} note={isPreview ? "Preview operations dataset" : "Paid bookings in the current result"} accent />
        {isPreview ? (
          <MetricCard label="Courts" value={String(snapshot.courts.length)} note="Provisional court inventory" />
        ) : (
          <MetricCard label="Loaded blocks" value={String(snapshot.blocks.length)} note="Tenant-scoped rows in the current result" />
        )}
        <MetricCard label="Bookings" value={String(snapshot.bookings.length)} note={`${paidCount} paid · ${snapshot.bookings.length - paidCount} other payment states`} />
        <MetricCard label="Players" value={String(snapshot.customers.length)} note={isPreview ? "Preview customer profiles" : "Derived from the loaded bookings"} />
      </section>

      <section className={styles.overviewGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>{isPreview ? "Preview court flow" : "Tenant booking result"}</p>
              <h2>{isPreview ? "Next on court" : "Recently loaded bookings"}</h2>
            </div>
            <button className={styles.textButton} type="button" onClick={() => goTo("schedule")}>
              Full schedule <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className={styles.nextList}>
            {loadedBookings.map((booking, index) => (
              <article className={styles.nextBooking} key={booking.id}>
                <div className={styles.nextTime}>
                  <strong>{booking.time.split("–")[0]}</strong>
                  <span>{booking.date}</span>
                </div>
                <Avatar initials={booking.initials} tone={index} />
                <div className={styles.nextIdentity}>
                  <strong>{booking.customer}</strong>
                  <span>
                    {booking.court} · {booking.duration}
                  </span>
                </div>
                <StatusPill status={booking.status} />
                {isPreview && (
                  <button
                    type="button"
                    className={styles.rowAction}
                    disabled={!can("booking:check-in") || booking.status === "checked_in"}
                    aria-label={`Check in ${booking.customer}`}
                    onClick={() =>
                      request({
                        title: `Check in ${booking.customer}?`,
                        detail: `${booking.court}, ${booking.time}. This will mark the arrival for today’s operations team.`,
                        confirmLabel: "Confirm check-in",
                        actionType: "booking:check-in",
                        resourceId: booking.id,
                      })
                    }
                  >
                    {booking.status === "checked_in" ? "Arrived" : "Check in"}
                  </button>
                )}
              </article>
            ))}
            {loadedBookings.length === 0 && (
              <div className={styles.statePanel} role="status">
                <p className={styles.eyebrow}>{isPreview ? "No active bookings" : "No bookings returned"}</p>
                <h3>{isPreview ? "The next reservation will appear here." : "No booking rows were returned for this query."}</h3>
              </div>
            )}
          </div>
          <div className={styles.flowFooter}>
            <span className={styles.livePulse} aria-hidden="true" />
            <span>
              {isPreview
                ? `${snapshot.courts.length} ${snapshot.courts.length === 1 ? "court" : "courts"} loaded`
                : `${snapshot.bookings.length} booking ${snapshot.bookings.length === 1 ? "row" : "rows"} loaded`}
            </span>
            <span>·</span>
            <span>{isPreview ? "Provisional schedule" : "Server-scoped tenant results"}</span>
          </div>
        </article>

        <article className={cx(styles.panel, styles.readinessPanel)}>
          <div className={styles.readinessHead}>
            <div>
              <p className={styles.eyebrow}>Launch readiness</p>
              <h2>{isPreview ? "Preview" : "Tenant"} is {progress}% ready</h2>
            </div>
            <strong className={styles.progressNumber}>{progress}%</strong>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Tenant setup progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <ul className={styles.readinessList}>
            {readinessItems.map((item) => (
              <li key={item.id}>
                <span className={styles.todoMark} aria-hidden="true">
                  {item.complete ? "✓" : ""}
                </span>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
              </li>
            ))}
          </ul>
          <ActionButton
            variant="secondary"
            className={styles.fullButton}
            onClick={() => goTo("settings")}
          >
            Review setup
          </ActionButton>
        </article>
      </section>

      <section className={styles.focusStrip} aria-labelledby="focus-title">
        <div>
          <span className={styles.focusIndex}>01</span>
          <p className={styles.eyebrow}>{isPreview ? "Owner focus" : "Tenant attention"}</p>
          <h2 id="focus-title">{paymentAttention ? "A payment state needs review" : "Setup remains protected"}</h2>
          <p>{paymentAttention ? `${paymentAttention.customer}'s loaded booking is marked ${PAYMENT_LABEL[paymentAttention.payment].toLowerCase()}.` : "Complete the remaining readiness checks before public booking is activated."}</p>
        </div>
        <ActionButton
          variant="secondary"
          disabled={isPreview && !can("booking:update")}
          onClick={() => goTo("bookings")}
        >
          {paymentAttention ? "Review payment state" : "Review bookings"}
        </ActionButton>
      </section>
    </>
  );
}

function BookingsView({
  bookings,
  can,
  request,
  goTo,
  isPreview,
}: {
  bookings: Booking[];
  can: (capability: ManagementCapability) => boolean;
  request: (action: ConfirmAction) => void;
  goTo: (view: View) => void;
  isPreview: boolean;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | BookingStatus>("all");
  const filtered = bookings.filter((booking) => {
    const matchesQuery = `${booking.customer} ${booking.id} ${booking.court}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
    return matchesQuery && (status === "all" || booking.status === status);
  });

  return (
    <section className={styles.panel} aria-labelledby="booking-list-title">
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.eyebrow}>Reservation register</p>
          <h2 id="booking-list-title">{isPreview ? "All preview bookings" : "Loaded bookings"}</h2>
        </div>
        {isPreview && <ActionButton disabled={!can("booking:create")} onClick={() => goTo("schedule")}>
          <span aria-hidden="true">＋</span> New booking
        </ActionButton>}
      </div>
      <div className={styles.filterBar}>
        <label className={styles.searchField}>
          <span className={styles.srOnly}>Search bookings</span>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player, ID or court"
          />
        </label>
        <label className={styles.selectField}>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="awaiting_payment">Awaiting payment</option>
            <option value="checked_in">Checked in</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <span className={styles.resultCount} aria-live="polite">
          {filtered.length} {filtered.length === 1 ? "booking" : "bookings"}
        </span>
      </div>

      {filtered.length ? (
        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">When</th>
                <th scope="col">Court</th>
                <th scope="col">Payment</th>
                <th scope="col">Status</th>
                {isPreview && <th scope="col"><span className={styles.srOnly}>Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((booking, index) => (
                <tr key={booking.id}>
                  <td data-label="Player">
                    <div className={styles.personCell}>
                      <Avatar initials={booking.initials} tone={index} />
                      <div>
                        <strong>{booking.customer}</strong>
                        <span>{booking.id}</span>
                      </div>
                    </div>
                  </td>
                  <td data-label="When">
                    <strong>{booking.date}</strong>
                    <span className={styles.cellSub}>{booking.time} · {booking.duration}</span>
                  </td>
                  <td data-label="Court">{booking.court}</td>
                  <td data-label="Payment">
                    <strong>{formatPeso(booking.amount)}</strong>
                    <span className={cx(styles.paymentLabel, booking.payment === "paid" && styles.paid)}>
                      {PAYMENT_LABEL[booking.payment]}
                    </span>
                  </td>
                  <td data-label="Status"><StatusPill status={booking.status} /></td>
                  {isPreview && <td data-label="Actions">
                    <div className={styles.tableActions}>
                      {booking.status === "confirmed" && (
                        <button
                          type="button"
                          className={styles.miniButton}
                          disabled={!can("booking:check-in")}
                          onClick={() =>
                            request({
                              title: `Check in ${booking.customer}?`,
                              detail: `${booking.id} will be marked as arrived. The booking itself will not be changed.`,
                              confirmLabel: "Check in",
                              actionType: "booking:check-in",
                              resourceId: booking.id,
                            })
                          }
                        >
                          Check in
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.moreButton}
                        disabled={!can("booking:cancel") || booking.status === "completed"}
                        aria-label={`Cancel booking ${booking.id}`}
                        onClick={() =>
                          request({
                            title: `Cancel ${booking.id}?`,
                            detail: `${booking.customer} will lose ${booking.court} on ${booking.date}, ${booking.time}. Paid refunds remain owner-assisted.`,
                            confirmLabel: "Cancel booking",
                            actionType: "booking:cancel",
                            resourceId: booking.id,
                            tone: "danger",
                          })
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.inlineEmpty}>
          <span aria-hidden="true">00</span>
          <h3>No matching bookings</h3>
          <p>Clear the search or choose another status.</p>
          <button type="button" className={styles.textButton} onClick={() => { setQuery(""); setStatus("all"); }}>
            Reset filters
          </button>
        </div>
      )}
    </section>
  );
}

const dayOptions = [
  ["Sat", "08"],
  ["Sun", "09"],
  ["Mon", "10"],
  ["Tue", "11"],
  ["Wed", "12"],
  ["Thu", "13"],
  ["Fri", "14"],
];

function ScheduleView({
  snapshot,
  can,
  goTo,
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  goTo: (view: View) => void;
}) {
  const [day, setDay] = useState("08");
  const hours = ["8 AM", "10 AM", "12 PM", "2 PM", "4 PM", "6 PM", "8 PM"];
  const slotStyle = (start: string, end: string) => {
    const parse = (value: string) => Number(value.split(":")[0]);
    return {
      "--slot-start": parse(start) - 7,
      "--slot-span": Math.max(1, parse(end) - parse(start)),
    } as CSSProperties;
  };

  if (snapshot.tenant.mode === "live") {
    const loadedEntries = snapshot.bookings.length + snapshot.blocks.length;
    return (
      <section className={styles.panel} aria-labelledby="live-schedule-title">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>Server-authorized tenant result</p>
            <h2 id="live-schedule-title">Loaded schedule entries</h2>
          </div>
          <span className={styles.countBadge}>{loadedEntries}</span>
        </div>
        {loadedEntries ? (
          <div className={styles.nextList}>
            {snapshot.bookings.map((booking, index) => (
              <article className={styles.nextBooking} key={booking.id}>
                <div className={styles.nextTime}>
                  <strong>{booking.time}</strong>
                  <span>{booking.date}</span>
                </div>
                <Avatar initials={booking.initials} tone={index} />
                <div className={styles.nextIdentity}>
                  <strong>{booking.customer}</strong>
                  <span>{booking.court} · {booking.duration}</span>
                </div>
                <StatusPill status={booking.status} />
              </article>
            ))}
            {snapshot.blocks.map((block, index) => (
              <article className={styles.nextBooking} key={block.id}>
                <div className={styles.nextTime}>
                  <strong>{block.time}</strong>
                  <span>{block.date}</span>
                </div>
                <Avatar initials="BL" tone={snapshot.bookings.length + index} />
                <div className={styles.nextIdentity}>
                  <strong>{block.publicLabel}</strong>
                  <span>{block.court} · {block.internalReason ? `Private note: ${block.internalReason}` : "No private note returned"}</span>
                </div>
                <span className={styles.previewTag}>Block</span>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.inlineEmpty} role="status">
            <span aria-hidden="true">00</span>
            <h3>No schedule rows were returned</h3>
            <p>The workspace does not substitute preview reservations or court blocks.</p>
          </div>
        )}
        <div className={styles.flowFooter}>
          <span className={styles.livePulse} aria-hidden="true" />
          <span>Tenant-scoped reads</span>
          <span>·</span>
          <span>Use Court blocks or Venue settings for authorized writes</span>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className={styles.scheduleToolbar} aria-label="Schedule dates and actions">
        <div className={styles.dateRail}>
          {dayOptions.map(([weekday, date]) => (
            <button
              type="button"
              key={date}
              className={cx(styles.dateButton, day === date && styles.dateActive)}
              aria-pressed={day === date}
              onClick={() => setDay(date)}
            >
              <span>{weekday}</span>
              <strong>{date}</strong>
            </button>
          ))}
        </div>
        <div className={styles.toolbarActions}>
          <ActionButton variant="secondary" disabled={!can("schedule:block")} onClick={() => goTo("blocks")}>
            Block time
          </ActionButton>
          <ActionButton disabled={!can("booking:create")}>
            <span aria-hidden="true">＋</span> Add booking
          </ActionButton>
        </div>
      </section>

      {day === "08" ? (
        <section className={cx(styles.panel, styles.timelinePanel)} aria-labelledby="timeline-title">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>Asia/Manila · Today</p>
              <h2 id="timeline-title">Saturday, August 8</h2>
            </div>
            <div className={styles.legend} aria-label="Schedule legend">
              <span><i className={styles.legendBooking} /> Booking</span>
              <span><i className={styles.legendHold} /> Hold</span>
              <span><i className={styles.legendBlock} /> Block</span>
            </div>
          </div>
          <div className={styles.timelineScroll}>
            <div className={styles.timeline}>
              <div className={styles.timeHeader}>
                <span />
                {hours.map((hour) => <span key={hour}>{hour}</span>)}
              </div>
              {snapshot.courts.map((court) => (
                <div className={styles.courtLane} key={court.id}>
                  <div className={styles.courtLabel}>
                    <strong>{court.name}</strong>
                    <span>{court.surface}</span>
                  </div>
                  <div className={styles.slotGrid}>
                    {Array.from({ length: 14 }).map((_, index) => (
                      <span className={styles.hourCell} key={index} aria-hidden="true" />
                    ))}
                    {snapshot.schedule.filter((slot) => slot.courtId === court.id).map((slot) => (
                      <button
                        type="button"
                        key={slot.id}
                        style={slotStyle(slot.start, slot.end)}
                        className={cx(styles.scheduleSlot, styles[`slot_${slot.kind}`])}
                        aria-label={`${slot.label}, ${slot.start} to ${slot.end}, ${slot.detail}`}
                      >
                        <strong>{slot.label}</strong>
                        <span>{slot.start}–{slot.end}</span>
                        <small>{slot.detail}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.availabilityFoot}>
            <div><strong>11</strong><span>open court-hours</span></div>
            <div><strong>74%</strong><span>expected utilization</span></div>
            <p>Select any booking to inspect it. Production availability must be rechecked by the API before a write.</p>
          </div>
        </section>
      ) : (
        <section className={styles.dayEmpty}>
          <span className={styles.stateMark} aria-hidden="true">{day}</span>
          <p className={styles.eyebrow}>No preview entries</p>
          <h2>This day is clear</h2>
          <p>Use this open schedule to add a reservation or plan court maintenance.</p>
          <ActionButton disabled={!can("booking:create")}>Add first booking</ActionButton>
        </section>
      )}
    </>
  );
}

function BlocksView({
  snapshot,
  can,
  request,
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  request: (action: ConfirmAction) => void;
}) {
  const isLive = snapshot.tenant.mode === "live";
  const canManage = can("schedule:block");
  const minimumDate = isLive ? manilaCalendarDate() : "2026-08-08";
  const [scope, setScope] = useState<"" | "all" | "court">("");
  const [courtId, setCourtId] = useState("");
  const [date, setDate] = useState(isLive ? "" : "2026-08-10");
  const [from, setFrom] = useState(isLive ? "" : "12:00");
  const [to, setTo] = useState(isLive ? "" : "13:00");
  const [publicLabel, setPublicLabel] = useState(isLive ? "" : "Maintenance");
  const [reason, setReason] = useState(isLive ? "" : "Court maintenance");
  const selectedCourt = snapshot.courts.find((item) => item.id === courtId);
  const courtLabel = scope === "all" ? "all courts" : selectedCourt?.name ?? "one court";
  const formComplete = Boolean(
    scope && (scope === "all" || selectedCourt) && date && date >= minimumDate &&
    from && to && publicLabel && to > from,
  );
  const accessExpiry = snapshot.configuration.blockAccessExpiresAt
    ? new Date(snapshot.configuration.blockAccessExpiresAt)
    : null;
  const accessExpiryLabel = accessExpiry && Number.isFinite(accessExpiry.getTime())
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: activeTenant.identity.timezone,
      }).format(accessExpiry)
    : null;
  const accessMessage = snapshot.session.isSystemOwner
    ? "System Owner block access is permanent; this account has no tenant membership."
    : snapshot.configuration.blockAccessStatus === "unavailable"
      ? "Block-management access could not be verified for this load. Existing records remain readable."
      : accessExpiryLabel
        ? `${canManage ? "Temporary write access expires" : "The last returned grant expiry is"} ${accessExpiryLabel}.`
        : canManage
          ? "The server returned block-management access without an expiry."
          : "No current write grant was returned. Existing records remain readable.";

  const resetBlockForm = () => {
    setScope("");
    setCourtId("");
    setDate("");
    setFrom("");
    setTo("");
    setPublicLabel("");
    setReason("");
  };

  const blockList = (
    <>
      <div className={styles.panelHeading}>
        <div>
          <p className={styles.eyebrow}>Loaded tenant result</p>
          <h2 id="loaded-blocks-title">Loaded block records</h2>
        </div>
        <span className={styles.countBadge}>{snapshot.blocks.length}</span>
      </div>
      <p className={styles.blockAccessMeta} role="status">{accessMessage}</p>
      {snapshot.blocks.length ? (
        <div className={styles.blockList}>
          {snapshot.blocks.map((block) => {
            const calendar = blockCalendarParts(block.dateValue, block.date);
            return (
              <article
                className={styles.blockItem}
                key={block.id}
                aria-label={`${block.publicLabel} block for ${block.court} on ${block.date}`}
              >
                <time className={styles.blockDate} dateTime={block.dateValue ?? undefined}>
                  <span>{calendar.month}</span>
                  <strong>{calendar.day}</strong>
                  <small>{calendar.year}</small>
                </time>
                <div className={styles.blockInfo}>
                  <strong>{block.publicLabel}</strong>
                  <span>{block.court} · {block.time}</span>
                  <small className={styles.blockMeta}>
                    {block.internalReason
                      ? `Private note: ${block.internalReason}`
                      : "No private note returned"}
                  </small>
                  <small className={styles.blockMeta}>
                    {block.createdBy ?? "Creator not returned by the API"}
                  </small>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className={styles.removeButton}
                    aria-label={`Remove ${block.publicLabel} block record for ${block.court} on ${block.date}`}
                    onClick={() => request({
                      title: "Remove this block record?",
                      detail: `${block.publicLabel} for ${block.court} on ${block.date}, ${block.time}, will be deleted. Other bookings or blocks may still affect availability.`,
                      confirmLabel: "Remove block record",
                      actionType: "schedule:unblock",
                      resourceId: block.id,
                      tone: "danger",
                    })}
                  >
                    Remove record
                  </button>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.inlineEmpty} role="status">
          <span aria-hidden="true">00</span>
          <h3>No block records were returned</h3>
          <p>The live workspace does not substitute preview closures.</p>
        </div>
      )}
    </>
  );

  if (isLive && !canManage) {
    return (
      <section className={styles.panel} aria-labelledby="loaded-blocks-title">
        {blockList}
        <div className={styles.noticeBox}>
          <span aria-hidden="true">i</span>
          <p>
            <strong>Read-only for this load.</strong> Creating or removing a block requires a
            server-issued block-management capability; viewing the loaded tenant result does not.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.splitLayout}>
      <form
        className={cx(styles.panel, styles.blockForm)}
        onSubmit={(event) => {
          event.preventDefault();
          if (!formComplete) {
            event.currentTarget.reportValidity();
            return;
          }
          request({
            title: `Block ${courtLabel}?`,
            detail: `${date}, ${from}-${to}, labelled "${publicLabel}". The server will recheck conflicts before saving.`,
            confirmLabel: "Create block",
            actionType: "schedule:block",
            payload: {
              courtId: scope === "court" ? courtId : null,
              startDate: date,
              endDate: date,
              startsAt: from,
              endsAt: to,
              publicLabel,
              internalReason: reason || null,
            },
            onSuccess: resetBlockForm,
          });
        }}
      >
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>New availability block</p>
            <h2>Take time offline</h2>
          </div>
          <span className={styles.stepBadge}>Review first</span>
        </div>
        <div className={cx(styles.formGrid, styles.blockScopeGrid)}>
          <label className={styles.field}>
            <span>Block scope</span>
            <select
              value={scope}
              onChange={(event) => {
                const nextScope = event.target.value as typeof scope;
                setScope(nextScope);
                if (nextScope !== "court") setCourtId("");
              }}
              required
            >
              <option value="" disabled>Choose scope</option>
              <option value="all">All courts</option>
              <option value="court">One court</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Court name</span>
            <select
              value={courtId}
              onChange={(event) => setCourtId(event.target.value)}
              disabled={scope !== "court"}
              required={scope === "court"}
            >
              <option value="" disabled>{scope === "court" ? "Choose a court" : "Choose one-court scope first"}</option>
              {snapshot.courts.filter((item) => item.status !== "inactive").map((item) => (
                <option value={item.id} key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Date</span>
            <input type="date" value={date} min={minimumDate} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <label className={styles.field}>
            <span>From</span>
            <input type="time" step={3600} value={from} onChange={(event) => setFrom(event.target.value)} required />
          </label>
          <label className={styles.field}>
            <span>To</span>
            <input type="time" step={3600} value={to} onChange={(event) => setTo(event.target.value)} required />
          </label>
          <label className={cx(styles.field, styles.fieldWide)}>
            <span>Customer-facing label</span>
            <select value={publicLabel} onChange={(event) => setPublicLabel(event.target.value)} required>
              <option value="" disabled>Choose a label</option>
              <option>Reserved</option>
              <option>Private Event</option>
              <option>Maintenance</option>
              <option>Closed</option>
            </select>
          </label>
          <label className={cx(styles.field, styles.fieldWide)}>
            <span>Private operations note</span>
            <input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} />
            <small>This note stays in the protected tenant workspace.</small>
          </label>
        </div>
        <div className={styles.noticeBox}>
          <span aria-hidden="true">i</span>
          <p><strong>Conflict-safe.</strong> A final availability check runs before the block is created. Existing paid bookings are never silently displaced.</p>
        </div>
        {!formComplete && (
          <p className={styles.inlineError}>Choose a scope, future date, time range, and public label before review.</p>
        )}
        <ActionButton type="submit" disabled={!canManage}>
          Review court block
        </ActionButton>
      </form>

      <aside className={styles.panel} aria-labelledby="loaded-blocks-title">{blockList}</aside>
    </section>
  );
}

function CustomersView({ snapshot }: { snapshot: ManagementSnapshot }) {
  const [query, setQuery] = useState("");
  const customers = snapshot.customers.filter((customer) =>
    `${customer.name} ${customer.contact}`.toLowerCase().includes(query.toLowerCase()),
  );
  const averageVisits = snapshot.customers.length
    ? snapshot.customers.reduce((total, customer) => total + customer.visits, 0) /
      snapshot.customers.length
    : 0;
  const returningPlayers = snapshot.customers.filter((customer) => customer.visits > 1).length;
  const returnRate = snapshot.customers.length
    ? Math.round((returningPlayers / snapshot.customers.length) * 100)
    : 0;
  return (
    <>
      <section className={styles.customerMetrics} aria-label="Customer summary">
        <div><span>Loaded players</span><strong>{snapshot.customers.length}</strong><small>Tenant-scoped result</small></div>
        <div><span>Return rate</span><strong>{returnRate}%</strong><small>Within loaded bookings</small></div>
        <div><span>Average visits</span><strong>{averageVisits.toFixed(1)}</strong><small>Per loaded player</small></div>
      </section>
      <section className={styles.panel} aria-labelledby="customer-title">
        <div className={styles.panelHeading}>
          <div><p className={styles.eyebrow}>Tenant directory</p><h2 id="customer-title">Players</h2></div>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search customers</span>
            <span aria-hidden="true">⌕</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search players" />
          </label>
        </div>
        {customers.length ? (
          <div className={styles.customerList}>
            {customers.map((customer, index) => (
              <article className={styles.customerRow} key={customer.id}>
                <Avatar initials={customer.initials} tone={index} />
                <div className={styles.customerName}>
                  <strong>{customer.name}</strong>
                  <span>{customer.contact}</span>
                </div>
                <div><span className={styles.mobileLabel}>Visits</span><strong>{customer.visits}</strong><small>bookings</small></div>
                <div><span className={styles.mobileLabel}>Value</span><strong>{formatPeso(customer.lifetimeValue)}</strong><small>loaded paid value</small></div>
                <div><span className={styles.mobileLabel}>Last visit</span><strong>{customer.lastVisit}</strong><small>{customer.note ?? "No private note"}</small></div>
                <button type="button" className={styles.roundButton} aria-label={`Open ${customer.name}'s profile`}>→</button>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.inlineEmpty}><span aria-hidden="true">00</span><h3>No players found</h3><p>Try a name or mobile number.</p></div>
        )}
      </section>
    </>
  );
}

function ReportsView({ snapshot }: { snapshot: ManagementSnapshot }) {
  if (snapshot.tenant.mode === "live") {
    const paid = snapshot.bookings.filter((booking) => booking.payment === "paid");
    const gross = paid.reduce((total, booking) => total + booking.amount, 0);
    const otherPaymentStates = snapshot.bookings.filter((booking) => booking.payment !== "paid");
    return (
      <>
        <section className={styles.reportHero}>
          <div>
            <p className={styles.eyebrow}>Loaded tenant result · PHP</p>
            <span>Paid booking value</span>
            <strong>{formatPeso(gross)}</strong>
            <p><b>{paid.length} paid</b> of {snapshot.bookings.length} loaded bookings</p>
          </div>
        </section>
        <section className={styles.reportGrid}>
          <article className={styles.panel}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Current result</p><h2>Booking summary</h2></div></div>
            <div className={styles.customerMetrics}>
              <div><span>Paid</span><strong>{paid.length}</strong><small>{formatPeso(gross)}</small></div>
              <div><span>Other payment states</span><strong>{otherPaymentStates.length}</strong><small>Pending, partial, refunded, rejected, unpaid, or unknown</small></div>
              <div><span>Players</span><strong>{snapshot.customers.length}</strong><small>Derived from loaded bookings</small></div>
            </div>
          </article>
          <aside className={styles.panel}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Reporting boundary</p><h2>No invented trends</h2></div></div>
            <p>Period comparisons, occupancy and court rankings remain unavailable until the shared platform exposes an authoritative tenant reporting contract.</p>
          </aside>
        </section>
      </>
    );
  }
  const dailyRevenue = [
    ["Mon", 48, "₱3.1k"],
    ["Tue", 62, "₱4.0k"],
    ["Wed", 55, "₱3.6k"],
    ["Thu", 78, "₱5.1k"],
    ["Fri", 70, "₱4.6k"],
    ["Sat", 98, "₱6.4k"],
    ["Sun", 84, "₱5.5k"],
  ] as const;
  return (
    <>
      <section className={styles.reportHero}>
        <div>
          <p className={styles.eyebrow}>August 1–8 · PHP</p>
          <span>Gross booking revenue</span>
          <strong>₱34,280</strong>
          <p><b>↑ 12.4%</b> compared with the previous 8 days</p>
        </div>
        <label className={styles.selectField}>
          <span>Period</span>
          <select defaultValue="8days"><option value="8days">Last 8 days</option><option value="30days">Last 30 days</option></select>
        </label>
      </section>
      <section className={styles.reportGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><p className={styles.eyebrow}>Revenue rhythm</p><h2>Daily gross</h2></div>
            <span className={styles.reportTotal}>Avg. ₱4,285/day</span>
          </div>
          <div className={styles.barChart} role="img" aria-label="Daily revenue from Monday through Sunday, with Saturday highest at 6,400 pesos">
            {dailyRevenue.map(([day, height, value]) => (
              <div className={styles.barColumn} key={day}>
                <span className={styles.barValue}>{value}</span>
                <div className={styles.barTrack}><span style={{ height: `${height}%` }} /></div>
                <strong>{day}</strong>
              </div>
            ))}
          </div>
        </article>
        <aside className={styles.panel}>
          <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Demand</p><h2>Top time bands</h2></div></div>
          <ol className={styles.demandList}>
            <li><span>01</span><div><strong>6:00–9:00 PM</strong><small>88% occupied</small></div><b>Peak</b></li>
            <li><span>02</span><div><strong>8:00–11:00 AM</strong><small>71% occupied</small></div><b>Steady</b></li>
            <li><span>03</span><div><strong>2:00–5:00 PM</strong><small>56% occupied</small></div><b>Open</b></li>
          </ol>
        </aside>
      </section>
      <section className={styles.reportNotes}>
        <article><span className={styles.focusIndex}>01</span><div><strong>Court 01 leads revenue</strong><p>It generated 54% of gross bookings this period.</p></div></article>
        <article><span className={styles.focusIndex}>02</span><div><strong>Evenings are nearly full</strong><p>Consider protecting peak pricing from 6 PM onward.</p></div></article>
        <article><span className={styles.focusIndex}>03</span><div><strong>4 payments need review</strong><p>₱1,700 is currently awaiting proof or confirmation.</p></div></article>
      </section>
    </>
  );
}

type CourtDraft = {
  name: string;
  description: string;
  status: "active" | "inactive" | "maintenance";
};

type NewCourtDraft = {
  name: string;
  description: string;
  status: CourtDraft["status"];
  opensAt: string;
  peakStartsAt: string;
  closesAt: string;
  dayRate: string;
  peakRate: string;
};

const emptyNewCourt: NewCourtDraft = {
  name: "",
  description: "",
  status: "active",
  opensAt: "06:00",
  peakStartsAt: "16:00",
  closesAt: "22:00",
  dayRate: "300",
  peakRate: "400",
};

const wholeHourOptions = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, "0")}:00`;
  const displayHour = hour % 12 || 12;
  return { value, label: `${displayHour} ${hour < 12 ? "AM" : "PM"}` };
});

function newCourtDraftFor(snapshot: ManagementSnapshot): NewCourtDraft {
  const schedule = snapshot.configuration.sharedSchedule;
  if (!schedule || schedule.bands.length !== 2) return { ...emptyNewCourt };
  return {
    ...emptyNewCourt,
    opensAt: schedule.opensAt,
    peakStartsAt: schedule.bands[0]?.end ?? emptyNewCourt.peakStartsAt,
    closesAt: schedule.closesAt,
    dayRate: String(schedule.bands[0]?.hourlyRate ?? emptyNewCourt.dayRate),
    peakRate: String(schedule.bands[1]?.hourlyRate ?? emptyNewCourt.peakRate),
  };
}

function generatedCourtSlug(name: string, snapshot: ManagementSnapshot): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = normalized.slice(0, 80).replace(/-+$/g, "") || "court";
  const used = new Set(snapshot.courts.map((court) => court.slug));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (true) {
    const suffixText = `-${suffix}`;
    const stem = base
      .slice(0, 80 - suffixText.length)
      .replace(/-+$/g, "") || "court";
    const candidate = `${stem}${suffixText}`;
    if (!used.has(candidate)) return candidate;
    suffix += 1;
  }
}

function nextCourtSortOrder(snapshot: ManagementSnapshot): number {
  const used = new Set(snapshot.courts.map((court) => court.sortOrder));
  const highest = snapshot.courts.reduce(
    (current, court) => Math.max(current, court.sortOrder),
    -1,
  );
  if (highest < 10_000) return highest + 1;
  for (let sortOrder = 0; sortOrder <= 10_000; sortOrder += 1) {
    if (!used.has(sortOrder)) return sortOrder;
  }
  return 10_000;
}

function wholeHourLabel(value: string): string {
  return wholeHourOptions.find((option) => option.value === value)?.label ?? value;
}

function courtDraftsFor(snapshot: ManagementSnapshot): Record<string, CourtDraft> {
  return Object.fromEntries(snapshot.courts.map((court) => [court.id, {
    name: court.name,
    description: court.description,
    status: court.status,
  }]));
}

function courtDraftError(draft: CourtDraft): string | null {
  if (!draft.name.trim() || draft.name.trim().length > 120) {
    return "Display name must contain 1 to 120 characters.";
  }
  return null;
}

function newCourtDraftError(draft: NewCourtDraft): string | null {
  const baseError = courtDraftError({
    name: draft.name,
    description: draft.description,
    status: draft.status,
  });
  if (baseError) return baseError;
  const wholeHour = /^(?:[01]\d|2[0-3]):00$/;
  if (
    !wholeHour.test(draft.opensAt) || !wholeHour.test(draft.peakStartsAt) ||
    !wholeHour.test(draft.closesAt)
  ) return "Opening, rate boundary, and closing times must be whole hours.";
  const closingEnd = draft.closesAt === "00:00" ? "24:00" : draft.closesAt;
  if (!(draft.opensAt < draft.peakStartsAt && draft.peakStartsAt < closingEnd)) {
    return "Times must run in order: opening, rate boundary, then closing.";
  }
  const dayRate = Number(draft.dayRate);
  const peakRate = Number(draft.peakRate);
  if (
    !Number.isFinite(dayRate) || dayRate <= 0 ||
    !Number.isFinite(peakRate) || peakRate <= 0
  ) return "Both hourly rates must be greater than zero.";
  return null;
}

type PaymentMethodDraft = Omit<
  BusinessPaymentConfiguration["paymentMethods"][number],
  "sortOrder"
> & { sortOrder: string };

type BusinessDraft = {
  displayName: string;
  contactPhone: string;
  facebookUrl: string;
  tagline: string;
  eventBookingEnabled: boolean;
  replyToEmail: string;
  emailEnabled: boolean;
  paymentMethods: PaymentMethodDraft[];
};

function businessDraftFor(
  configuration: BusinessPaymentConfiguration | null,
): BusinessDraft | null {
  if (!configuration) return null;
  return {
    displayName: configuration.business.displayName,
    contactPhone: configuration.business.contactPhone ?? "",
    facebookUrl: configuration.business.facebookUrl ?? "",
    tagline: configuration.business.tagline ?? "",
    eventBookingEnabled: configuration.business.eventBookingEnabled,
    replyToEmail: configuration.venue.replyToEmail ?? "",
    emailEnabled: configuration.venue.emailEnabled,
    paymentMethods: configuration.paymentMethods.map((method) => ({
      ...method,
      sortOrder: String(method.sortOrder),
    })),
  };
}

function businessDraftError(draft: BusinessDraft): string | null {
  if (draft.displayName.trim().length < 2 || draft.displayName.trim().length > 120) {
    return "Business display name must contain 2 to 120 characters.";
  }
  if (
    draft.contactPhone.trim() &&
    (draft.contactPhone.trim().length < 7 || draft.contactPhone.trim().length > 40 ||
      !/^[0-9+(). -]+$/.test(draft.contactPhone.trim()))
  ) return "Contact phone must contain 7 to 40 phone characters.";
  if (
    draft.facebookUrl.trim() &&
    !/^https:\/\/(?:www\.|web\.|m\.)?facebook\.com\/\S+$/i.test(draft.facebookUrl.trim())
  ) return "Facebook URL must be a complete facebook.com HTTPS address.";
  if (draft.tagline.length > 180 || /[\u0000-\u001f\u007f]/.test(draft.tagline)) {
    return "Tagline must be 180 characters or fewer and contain no control characters.";
  }
  if (
    draft.emailEnabled && !draft.replyToEmail.trim()
  ) return "Reply-To email is required when booking emails are enabled.";
  if (
    draft.replyToEmail.trim() &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.replyToEmail.trim()) ||
      draft.replyToEmail.includes(".."))
  ) return "Reply-To must be a valid email address.";
  if (draft.paymentMethods.length > 10) return "At most 10 payment methods can be saved.";
  const seenCodes = new Set<string>();
  for (const [index, method] of draft.paymentMethods.entries()) {
    const code = method.methodCode.trim().toLowerCase();
    const sortOrder = Number(method.sortOrder);
    if (!/^[a-z][a-z0-9_-]{1,39}$/.test(code)) {
      return `Payment method ${index + 1} needs a unique 2–40 character code.`;
    }
    if (seenCodes.has(code)) return "Payment method codes must be unique.";
    seenCodes.add(code);
    if (method.displayName.trim().length < 2 || method.displayName.trim().length > 80) {
      return `Payment method ${index + 1} needs a 2–80 character display name.`;
    }
    if (method.accountName.trim().length < 2 || method.accountName.trim().length > 120) {
      return `Payment method ${index + 1} needs a 2–120 character account name.`;
    }
    if (method.accountNumber.trim().length < 3 || method.accountNumber.trim().length > 120) {
      return `Payment method ${index + 1} needs a 3–120 character account number.`;
    }
    if (method.instructions && method.instructions.length > 1_000) {
      return `Payment method ${index + 1} instructions must be 1,000 characters or fewer.`;
    }
    if (method.qrUrl) {
      if (!isAllowedCustomerQrUrl(method.qrUrl.trim())) {
        return `Payment method ${index + 1} QR URL must be an approved shared-platform public-storage asset.`;
      }
    }
    if (
      method.sortOrder.trim() === "" || !Number.isSafeInteger(sortOrder) ||
      sortOrder < 0 || sortOrder > 1_000
    ) return `Payment method ${index + 1} sort order must be 0 to 1,000.`;
  }
  return null;
}

function LiveSettingsView({
  snapshot,
  can,
  request,
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  request: (action: ConfirmAction) => void;
}) {
  const [section, setSection] = useState<"courts" | "schedule" | "business" | "rules">("courts");
  const [courtDrafts, setCourtDrafts] = useState(() => courtDraftsFor(snapshot));
  const [newCourt, setNewCourt] = useState<NewCourtDraft>(() => newCourtDraftFor(snapshot));
  const [newCourtAttempted, setNewCourtAttempted] = useState(false);
  const newCourtDialogRef = useRef<HTMLDialogElement>(null);
  const [scheduleDraft, setScheduleDraft] = useState(
    snapshot.configuration.sharedSchedule,
  );
  const [businessDraft, setBusinessDraft] = useState(() =>
    businessDraftFor(snapshot.configuration.businessPayments)
  );

  const setCourtField = <Key extends keyof CourtDraft>(
    courtId: string,
    key: Key,
    fieldValue: CourtDraft[Key],
  ) => setCourtDrafts((current) => ({
    ...current,
    [courtId]: { ...current[courtId], [key]: fieldValue },
  }));

  const setNewCourtField = <Key extends keyof NewCourtDraft>(
    key: Key,
    fieldValue: NewCourtDraft[Key],
  ) => setNewCourt((current) => ({ ...current, [key]: fieldValue }));

  const openNewCourtDialog = () => {
    setNewCourtAttempted(false);
    const dialog = newCourtDialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    window.requestAnimationFrame(() => {
      dialog.querySelector<HTMLInputElement>("[data-new-court-name]")?.focus();
    });
  };

  const closeNewCourtDialog = () => {
    newCourtDialogRef.current?.close();
  };

  const setBusinessField = <Key extends keyof Omit<BusinessDraft, "paymentMethods">>(
    key: Key,
    fieldValue: BusinessDraft[Key],
  ) => setBusinessDraft((current) => current ? { ...current, [key]: fieldValue } : current);

  const setPaymentField = <Key extends keyof PaymentMethodDraft>(
    index: number,
    key: Key,
    fieldValue: PaymentMethodDraft[Key],
  ) => setBusinessDraft((current) => current ? {
    ...current,
    paymentMethods: current.paymentMethods.map((method, methodIndex) =>
      methodIndex === index ? { ...method, [key]: fieldValue } : method
    ),
  } : current);

  const twoBandSchedule = scheduleDraft?.bands.length === 2;
  const scheduleDraftIsValid = Boolean(
    scheduleDraft && twoBandSchedule &&
    scheduleDraft.bands[0]?.start === scheduleDraft.opensAt &&
    scheduleDraft.bands[0]?.end === scheduleDraft.bands[1]?.start &&
    scheduleDraft.bands[1]?.end === (scheduleDraft.closesAt === "00:00" ? "24:00" : scheduleDraft.closesAt) &&
    scheduleDraft.bands[0].start < scheduleDraft.bands[0].end &&
    scheduleDraft.bands[1].start < scheduleDraft.bands[1].end &&
    scheduleDraft.bands.every((band) => Number.isFinite(band.hourlyRate) && band.hourlyRate > 0),
  );
  const saveSchedule = () => {
    if (!scheduleDraft || !scheduleDraftIsValid) return;
    request({
      title: "Save the shared schedule?",
      detail: `Every day, ${scheduleDraft.opensAt}–${scheduleDraft.closesAt}; ${formatPeso(scheduleDraft.bands[0]!.hourlyRate)}/hour until ${scheduleDraft.bands[0]!.end}, then ${formatPeso(scheduleDraft.bands[1]!.hourlyRate)}/hour. This replaces hours and rates on every Dinktopia court atomically.`,
      confirmLabel: "Save shared schedule",
      actionType: "settings:schedule",
      payload: scheduleDraft,
    });
  };

  const saveBusiness = () => {
    if (!businessDraft || businessDraftError(businessDraft)) return;
    request({
      title: "Save business and payment settings?",
      detail: `${businessDraft.displayName.trim()} with ${businessDraft.paymentMethods.length} payment ${businessDraft.paymentMethods.length === 1 ? "method" : "methods"}. The payment-method list is replaced in full; platform billing, remittance, and public activation are not changed.`,
      confirmLabel: "Save business & payments",
      actionType: "business:update",
      payload: {
        expectedRevision: snapshot.configuration.businessPayments!.revision,
        displayName: businessDraft.displayName.trim(),
        contactPhone: businessDraft.contactPhone.trim() || null,
        facebookUrl: businessDraft.facebookUrl.trim() || null,
        tagline: businessDraft.tagline.trim() || null,
        eventBookingEnabled: businessDraft.eventBookingEnabled,
        venue: {
          replyToEmail: businessDraft.replyToEmail.trim() || null,
          emailEnabled: businessDraft.emailEnabled,
        },
        paymentMethods: businessDraft.paymentMethods.map((method) => ({
          methodCode: method.methodCode.trim().toLowerCase(),
          displayName: method.displayName.trim(),
          accountName: method.accountName.trim(),
          accountNumber: method.accountNumber.trim(),
          instructions: method.instructions?.trim() || null,
          qrUrl: method.qrUrl?.trim() || null,
          isActive: method.isActive,
          sortOrder: Number(method.sortOrder),
        })),
      },
    });
  };

  return (
    <section className={styles.settingsLayout}>
      <nav className={styles.settingsNav} aria-label="Venue settings sections">
        {(["courts", "schedule", "business", "rules"] as const).map((item, index) => (
          <button type="button" key={item} className={section === item ? styles.settingsActive : undefined} onClick={() => setSection(item)} aria-current={section === item ? "page" : undefined}>
            <span>0{index + 1}</span>{item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>
      <div className={styles.panel}>
        {section === "courts" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Live inventory</p><h2>Courts</h2></div><span className={styles.previewTag}>Server records</span></div>
            <p className={styles.sectionIntro}>Each save targets one server-returned court UUID. Tenant scope is still derived from the fixed Dinktopia slug and registered origin.</p>
            <div className={styles.courtSettingList}>
              {snapshot.courts.map((court, index) => {
                const draft = courtDrafts[court.id];
                if (!draft) return null;
                const draftError = courtDraftError(draft);
                const headingId = `court-${court.id}-title`;
                const errorId = `court-${court.id}-error`;
                return (
                  <form
                    key={court.id}
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (draftError) {
                        event.currentTarget.reportValidity();
                        return;
                      }
                      request({
                        title: `Save ${court.name}?`,
                        detail: `${draft.name.trim()} · ${draft.status}. Its internal address, order, schedule, pricing, and booking rules remain untouched.`,
                        confirmLabel: `Save ${court.name}`,
                        actionType: "court:update",
                        resourceId: court.id,
                        payload: {
                          name: draft.name,
                          description: draft.description || null,
                          status: draft.status,
                        },
                      });
                    }}
                  >
                    <article className={styles.courtEditorCard} aria-labelledby={headingId}>
                      <span className={styles.courtMarker}>{String(index + 1).padStart(2, "0")}</span>
                      <div className={styles.courtCardHeading}>
                        <h3 id={headingId}>{court.name}</h3>
                        <p>Live court record</p>
                      </div>
                      <label className={cx(styles.field, styles.courtNameField)}><span>Display name</span><input required aria-invalid={!draft.name.trim() || draft.name.trim().length > 120} aria-describedby={draftError ? errorId : undefined} value={draft.name} maxLength={120} onChange={(event) => setCourtField(court.id, "name", event.target.value)} /></label>
                      <label className={cx(styles.field, styles.courtDescriptionField)}><span>Description</span><input value={draft.description} onChange={(event) => setCourtField(court.id, "description", event.target.value)} /></label>
                      <label className={cx(styles.field, styles.courtStatusField)}><span>Status</span><select value={draft.status} onChange={(event) => setCourtField(court.id, "status", event.target.value as CourtDraft["status"])}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select></label>
                      <div className={styles.courtCardActions}>
                        {draftError && <p id={errorId} className={styles.fieldError} role="alert">{draftError}</p>}
                        <ActionButton type="submit" disabled={!can("settings:update")} ariaLabel={`Save ${court.name} court settings`}>Save court</ActionButton>
                        <ActionButton variant="danger" disabled={!can("settings:update")} ariaLabel={`Delete ${court.name} court`} onClick={() => request({ title: `Permanently delete ${court.name}?`, detail: "If no protected booking or open-play dependency blocks deletion, the court and its associated block records will be deleted. This cannot be undone.", confirmLabel: `Delete ${court.name}`, actionType: "court:delete", resourceId: court.id, tone: "danger" })}>Delete court</ActionButton>
                      </div>
                    </article>
                  </form>
                );
              })}
            </div>
            {!snapshot.courts.length && <div className={styles.inlineEmpty} role="status"><span aria-hidden="true">00</span><h3>No live courts configured</h3><p>Add the first court with its name, whole-hour schedule, and rates. Internal setup values are handled automatically.</p></div>}
            <div className={styles.addCourtRow}>
              <div><strong>Need another court?</strong><span>It takes only the venue details owners actually use.</span></div>
              <ActionButton disabled={!can("settings:update")} onClick={openNewCourtDialog}><span aria-hidden="true">＋</span> Add court</ActionButton>
            </div>
            <dialog
              ref={newCourtDialogRef}
              className={styles.courtDialog}
              aria-labelledby="add-court-title"
              aria-describedby="add-court-description"
              onCancel={(event) => {
                event.preventDefault();
                closeNewCourtDialog();
              }}
            >
              <div className={styles.courtDialogShell}>
                <header className={styles.courtDialogHeader}>
                  <div>
                    <p className={styles.eyebrow}>Live inventory</p>
                    <h2 id="add-court-title">Add court</h2>
                    <p id="add-court-description">Set the name, status, whole-hour schedule, and hourly rates.</p>
                  </div>
                  <button type="button" className={styles.dialogClose} aria-label="Close Add court" onClick={closeNewCourtDialog}>×</button>
                </header>
                <form
                  className={styles.newCourtForm}
                  onInvalid={() => setNewCourtAttempted(true)}
                  onSubmit={(event) => {
                    event.preventDefault();
                    setNewCourtAttempted(true);
                    const error = newCourtDraftError(newCourt);
                    if (error) {
                      event.currentTarget.reportValidity();
                      return;
                    }
                    const closingBandEnd = newCourt.closesAt === "00:00" ? "24:00" : newCourt.closesAt;
                    const generatedSlug = generatedCourtSlug(newCourt.name, snapshot);
                    const generatedSortOrder = nextCourtSortOrder(snapshot);
                    closeNewCourtDialog();
                    request({
                      title: `Create ${newCourt.name.trim()}?`,
                      detail: `${newCourt.status} · ${wholeHourLabel(newCourt.opensAt)}–${wholeHourLabel(newCourt.closesAt)} · ${formatPeso(Number(newCourt.dayRate))}/${formatPeso(Number(newCourt.peakRate))} per hour.`,
                      confirmLabel: `Create ${newCourt.name.trim()}`,
                      actionType: "court:create",
                      payload: {
                        name: newCourt.name.trim(),
                        slug: generatedSlug,
                        description: newCourt.description.trim() || null,
                        status: newCourt.status,
                        sortOrder: generatedSortOrder,
                        opensAt: newCourt.opensAt,
                        closesAt: newCourt.closesAt,
                        currency: snapshot.tenant.currency,
                        pricingConfig: { regular: {
                          minimumHours: 1,
                          maximumHours: 18,
                          bands: [
                            { start: newCourt.opensAt, end: newCourt.peakStartsAt, hourlyRate: Number(newCourt.dayRate) },
                            { start: newCourt.peakStartsAt, end: closingBandEnd, hourlyRate: Number(newCourt.peakRate) },
                          ],
                        } },
                        publicConfig: {
                          minimumLeadMinutes: 60,
                          maximumAdvanceDays: 30,
                        },
                      },
                      onSuccess: () => {
                        setNewCourt(newCourtDraftFor(snapshot));
                        setNewCourtAttempted(false);
                      },
                    });
                  }}
                >
                  <div className={styles.courtDialogBody}>
                    <div className={styles.courtBasicsGrid}>
                      <label className={cx(styles.field, styles.fieldWide)}><span>Court name</span><input data-new-court-name required maxLength={120} placeholder="e.g. Court Alpha" value={newCourt.name} onChange={(event) => setNewCourtField("name", event.target.value)} /></label>
                      <label className={cx(styles.field, styles.fieldWide)}><span>Description <small>Optional</small></span><textarea rows={2} maxLength={500} placeholder="e.g. Outdoor · Standard flooring" value={newCourt.description} onChange={(event) => setNewCourtField("description", event.target.value)} /></label>
                      <label className={styles.field}><span>Status</span><select required value={newCourt.status} onChange={(event) => setNewCourtField("status", event.target.value as NewCourtDraft["status"])}><option value="active">Active</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select><small>Active courts appear in live availability after setup is ready.</small></label>
                    </div>
                    <fieldset className={styles.courtScheduleCard}>
                      <legend>Hours &amp; pricing</legend>
                      <p>Choose whole hours only. The peak rate begins at the selected boundary.</p>
                      <div className={styles.courtTimeGrid}>
                        <label className={styles.field}><span>Opens</span><select required value={newCourt.opensAt} onChange={(event) => setNewCourtField("opensAt", event.target.value)}>{wholeHourOptions.map((option) => <option key={`open-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
                        <label className={styles.field}><span>Peak starts</span><select required value={newCourt.peakStartsAt} onChange={(event) => setNewCourtField("peakStartsAt", event.target.value)}>{wholeHourOptions.map((option) => <option key={`peak-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
                        <label className={styles.field}><span>Closes</span><select required value={newCourt.closesAt} onChange={(event) => setNewCourtField("closesAt", event.target.value)}>{wholeHourOptions.map((option) => <option key={`close-${option.value}`} value={option.value}>{option.label}{option.value === "00:00" ? " next day" : ""}</option>)}</select></label>
                      </div>
                      <div className={styles.courtRateGrid}>
                        <label className={styles.field}><span>Regular rate / hour</span><div className={styles.moneyInput}><span>₱</span><input required inputMode="decimal" type="number" min="0.01" step="0.01" value={newCourt.dayRate} onChange={(event) => setNewCourtField("dayRate", event.target.value)} /></div></label>
                        <label className={styles.field}><span>Peak rate / hour</span><div className={styles.moneyInput}><span>₱</span><input required inputMode="decimal" type="number" min="0.01" step="0.01" value={newCourt.peakRate} onChange={(event) => setNewCourtField("peakRate", event.target.value)} /></div></label>
                      </div>
                    </fieldset>
                    <p className={styles.systemDefaultsNote}>Court address, display order, booking guardrails, and advance rules are set automatically.</p>
                    {newCourtAttempted && newCourtDraftError(newCourt) && <p className={styles.inlineError} role="alert">{newCourtDraftError(newCourt)}</p>}
                  </div>
                  <footer className={styles.courtDialogActions}>
                    <ActionButton variant="quiet" onClick={closeNewCourtDialog}>Cancel</ActionButton>
                    <ActionButton type="submit" disabled={!can("settings:update")}>Save court</ActionButton>
                  </footer>
                </form>
              </div>
            </dialog>
          </div>
        )}
        {section === "schedule" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>PHP · Asia/Manila · Every court</p><h2>Shared schedule</h2></div><span className={styles.previewTag}>Atomic update</span></div>
            {scheduleDraft && twoBandSchedule ? (
              <div className={styles.sharedScheduleEditor}>
                <div className={styles.sharedScheduleRow}>
                  <div className={styles.scheduleDayLabel}><strong>Every day</strong><span>One shared daily window</span></div>
                  <label className={styles.field}><span>Opens</span><select required value={scheduleDraft.opensAt} onChange={(event) => setScheduleDraft({ ...scheduleDraft, opensAt: event.target.value, bands: [{ ...scheduleDraft.bands[0]!, start: event.target.value }, scheduleDraft.bands[1]!] })}>{wholeHourOptions.map((option) => <option key={`schedule-open-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
                  <label className={styles.field}><span>Rate boundary</span><select required value={scheduleDraft.bands[0]!.end} onChange={(event) => setScheduleDraft({ ...scheduleDraft, bands: [{ ...scheduleDraft.bands[0]!, end: event.target.value }, { ...scheduleDraft.bands[1]!, start: event.target.value }] })}>{wholeHourOptions.map((option) => <option key={`schedule-boundary-${option.value}`} value={option.value}>{option.label}</option>)}</select></label>
                  <label className={styles.field}><span>Closes</span><select required value={scheduleDraft.closesAt} onChange={(event) => setScheduleDraft({ ...scheduleDraft, closesAt: event.target.value, bands: [scheduleDraft.bands[0]!, { ...scheduleDraft.bands[1]!, end: event.target.value === "00:00" ? "24:00" : event.target.value }] })}>{wholeHourOptions.map((option) => <option key={`schedule-close-${option.value}`} value={option.value}>{option.label}{option.value === "00:00" ? " next day" : ""}</option>)}</select></label>
                  <label className={styles.field}><span>First rate / hour</span><div className={styles.moneyInput}><span>₱</span><input required type="number" min="0.01" step="0.01" value={scheduleDraft.bands[0]!.hourlyRate} onChange={(event) => setScheduleDraft({ ...scheduleDraft, bands: [{ ...scheduleDraft.bands[0]!, hourlyRate: Number(event.target.value) }, scheduleDraft.bands[1]!] })} /></div></label>
                  <label className={styles.field}><span>Second rate / hour</span><div className={styles.moneyInput}><span>₱</span><input required type="number" min="0.01" step="0.01" value={scheduleDraft.bands[1]!.hourlyRate} onChange={(event) => setScheduleDraft({ ...scheduleDraft, bands: [scheduleDraft.bands[0]!, { ...scheduleDraft.bands[1]!, hourlyRate: Number(event.target.value) }] })} /></div></label>
                </div>
                <div className={styles.businessBoundary}><h3>Booking durations are unchanged</h3><p>This shared-schedule contract changes only whole-hour operating windows and rate bands.</p></div>
                {!scheduleDraftIsValid && <p className={styles.inlineError} role="alert">Opening, boundary, closing, and both positive rates must form one continuous two-band day.</p>}
                <div className={styles.scheduleSaveRow}><span>Applies to all {snapshot.courts.length} live courts</span><ActionButton disabled={!can("settings:update") || !scheduleDraftIsValid} onClick={saveSchedule}>Save shared schedule</ActionButton></div>
              </div>
            ) : <div className={styles.statePanel} role="status"><p className={styles.eyebrow}>Shared editor unavailable</p><h3>No uniform two-band live schedule was returned.</h3><p>Create the first court or use the platform workspace for schedules with more than two bands. No preview values are substituted.</p></div>}
          </div>
        )}
        {section === "business" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Customer-facing configuration</p><h2>Business & payments</h2></div><span className={styles.previewTag}>Authoritative list</span></div>
            {businessDraft ? (
              <form onSubmit={(event) => { event.preventDefault(); if (!businessDraftError(businessDraft)) saveBusiness(); }}>
                <div className={styles.businessGrid}>
                  <label className={styles.field}><span>Business display name</span><input required minLength={2} maxLength={120} value={businessDraft.displayName} onChange={(event) => setBusinessField("displayName", event.target.value)} /></label>
                  <label className={styles.field}><span>Contact phone</span><input minLength={7} maxLength={40} pattern="[0-9+(). -]+" value={businessDraft.contactPhone} onChange={(event) => setBusinessField("contactPhone", event.target.value)} /></label>
                  <label className={styles.field}><span>Facebook URL</span><input type="url" maxLength={500} value={businessDraft.facebookUrl} onChange={(event) => setBusinessField("facebookUrl", event.target.value)} /></label>
                  <label className={styles.field}><span>Reply-To email</span><input type="email" required={businessDraft.emailEnabled} maxLength={254} value={businessDraft.replyToEmail} onChange={(event) => setBusinessField("replyToEmail", event.target.value)} /></label>
                  <label className={cx(styles.field, styles.fieldWide)}><span>Tagline</span><input maxLength={180} value={businessDraft.tagline} onChange={(event) => setBusinessField("tagline", event.target.value)} /></label>
                  <label className={styles.switchLabel}><input type="checkbox" checked={businessDraft.eventBookingEnabled} onChange={(event) => setBusinessField("eventBookingEnabled", event.target.checked)} /><span aria-hidden="true" />Event booking shown</label>
                  <label className={styles.switchLabel}><input type="checkbox" checked={businessDraft.emailEnabled} onChange={(event) => setBusinessField("emailEnabled", event.target.checked)} /><span aria-hidden="true" />Booking emails enabled</label>
                </div>
                <div className={styles.businessBoundary}><h3>Public activation and remittance stay separate</h3><p>Saving here does not change public booking, global/platform billing, platform remittance, or policy text.</p></div>
                <div className={styles.paymentMethodHeading}><h3>Customer payment methods</h3><ActionButton variant="secondary" disabled={businessDraft.paymentMethods.length >= 10} onClick={() => setBusinessDraft((current) => current ? { ...current, paymentMethods: [...current.paymentMethods, { methodCode: "", displayName: "", accountName: "", accountNumber: "", instructions: null, qrUrl: null, isActive: true, sortOrder: String(current.paymentMethods.length) }] } : current)}>Add payment method</ActionButton></div>
                <div className={styles.paymentMethodList}>
                  {businessDraft.paymentMethods.map((method, index) => (
                    <article className={styles.paymentMethodCard} key={`payment-method-${index}`} aria-label={`Payment method ${index + 1}`}>
                      <div className={styles.paymentMethodFields}>
                        <label className={styles.field}><span>Method code</span><input required pattern="[a-z][a-z0-9_-]{1,39}" value={method.methodCode} onChange={(event) => setPaymentField(index, "methodCode", event.target.value)} /></label>
                        <label className={styles.field}><span>Public name</span><input required minLength={2} maxLength={80} value={method.displayName} onChange={(event) => setPaymentField(index, "displayName", event.target.value)} /></label>
                        <label className={styles.field}><span>Account name</span><input required minLength={2} maxLength={120} value={method.accountName} onChange={(event) => setPaymentField(index, "accountName", event.target.value)} /></label>
                        <label className={styles.field}><span>Account number</span><input required minLength={3} maxLength={120} value={method.accountNumber} onChange={(event) => setPaymentField(index, "accountNumber", event.target.value)} /></label>
                        <label className={styles.field}><span>Instructions</span><input maxLength={1000} value={method.instructions ?? ""} onChange={(event) => setPaymentField(index, "instructions", event.target.value || null)} /></label>
                        <label className={styles.field}><span>QR image URL</span><input type="url" maxLength={500} value={method.qrUrl ?? ""} onChange={(event) => setPaymentField(index, "qrUrl", event.target.value || null)} /></label>
                        <label className={styles.field}><span>Sort order</span><input required type="number" min="0" max="1000" step="1" value={method.sortOrder} onChange={(event) => setPaymentField(index, "sortOrder", event.target.value)} /></label>
                        <label className={styles.switchLabel}><input type="checkbox" checked={method.isActive} onChange={(event) => setPaymentField(index, "isActive", event.target.checked)} /><span aria-hidden="true" />Active for customers</label>
                      </div>
                      <div className={styles.paymentMethodActions}><ActionButton variant="danger" ariaLabel={`Remove payment method ${index + 1} from this draft`} onClick={() => setBusinessDraft((current) => current ? { ...current, paymentMethods: current.paymentMethods.filter((_, methodIndex) => methodIndex !== index) } : current)}>Remove from draft</ActionButton></div>
                    </article>
                  ))}
                  {!businessDraft.paymentMethods.length && <p className={styles.sectionIntro}>No payment methods are configured. Add a verified customer payment destination before activation.</p>}
                </div>
                {businessDraftError(businessDraft) && <p className={styles.inlineError} role="alert">{businessDraftError(businessDraft)}</p>}
                <div className={styles.billingBoundary}><h3>Platform billing</h3><p>{snapshot.configuration.businessPayments?.platformBilling ? `${snapshot.configuration.businessPayments.platformBilling.feeMode.replaceAll("_", " ")} · ${snapshot.configuration.businessPayments.platformBilling.feeAmount} · ${snapshot.configuration.businessPayments.platformBilling.isConfigured ? "configured" : "not configured"}. Read-only here.` : "Not returned to this role. It is not editable here."}</p></div>
                <div className={styles.settingsFooter}><span>Payment methods are saved as one complete replacement list.</span><ActionButton type="submit" disabled={!can("settings:update") || Boolean(businessDraftError(businessDraft))}>Save business & payments</ActionButton></div>
              </form>
            ) : <div className={styles.statePanel} role="status"><p className={styles.eyebrow}>Editing unavailable</p><h3>Business and payment settings were not complete for this load.</h3><p>{snapshot.configuration.businessPaymentsStatus === "unavailable" ? "Refresh the workspace before retrying; no permission conclusion is inferred from a failed read." : "The response was missing fields required to round-trip the full payment-method list safely. Nothing is editable here."}</p></div>}
          </div>
        )}
        {section === "rules" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Customer policy</p><h2>Booking rules</h2></div><span className={styles.needsTag}>Write unavailable</span></div>
            <div className={styles.ruleList} aria-disabled="true">
              <label className={styles.field}><span>Advance notice</span><input disabled value="Configured per court; not editable in this section" readOnly /></label>
              <label className={styles.field}><span>Booking horizon</span><input disabled value="Configured per court; not editable in this section" readOnly /></label>
              <label className={styles.field}><span>Cancellation policy</span><textarea disabled value="Policy publishing is not connected on this page." readOnly rows={3} /></label>
              <label className={styles.field}><span>Rescheduling policy</span><textarea disabled value="Policy publishing is not connected on this page." readOnly rows={3} /></label>
            </div>
            <div className={styles.noticeBox}><span aria-hidden="true">!</span><p><strong>No live action is sent.</strong> The page has no server contract for publishing policy text, so these controls remain disabled.</p></div>
          </div>
        )}
      </div>
    </section>
  );
}

function SettingsView({
  snapshot,
  can,
  request,
}: {
  snapshot: ManagementSnapshot;
  can: (capability: ManagementCapability) => boolean;
  request: (action: ConfirmAction) => void;
}) {
  const [section, setSection] = useState<"courts" | "rates" | "hours" | "rules">("courts");
  if (snapshot.tenant.mode === "live") {
    return (
      <LiveSettingsView
        key={JSON.stringify([
          snapshot.courts,
          snapshot.configuration.sharedSchedule,
          snapshot.configuration.businessPayments,
        ])}
        snapshot={snapshot}
        can={can}
        request={request}
      />
    );
  }
  const save = (label: string) => request({
    title: `Save ${label.toLowerCase()}?`,
    detail: "These values are still preview configuration. Production writes will require a fresh authorized tenant session.",
    confirmLabel: "Save preview settings",
    actionType: "settings:update",
  });

  return (
    <section className={styles.settingsLayout}>
      <nav className={styles.settingsNav} aria-label="Venue settings sections">
        {(["courts", "rates", "hours", "rules"] as const).map((item, index) => (
          <button type="button" key={item} className={section === item ? styles.settingsActive : undefined} onClick={() => setSection(item)} aria-current={section === item ? "page" : undefined}>
            <span>0{index + 1}</span>{item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>
      <div className={styles.panel}>
        {section === "courts" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Inventory</p><h2>Courts</h2></div><span className={styles.previewTag}>Preview values</span></div>
            <p className={styles.sectionIntro}>Court names are customer-facing. Confirm the final venue inventory before activation.</p>
            <div className={styles.courtSettingList}>
              {snapshot.courts.map((court, index) => (
                <article key={court.id}>
                  <span className={styles.courtNumber}>0{index + 1}</span>
                  <label className={styles.field}><span>Display name</span><input defaultValue={court.name} /></label>
                  <label className={styles.field}><span>Surface</span><input defaultValue={court.surface} /></label>
                  <span className={styles.openTag}>Open</span>
                </article>
              ))}
            </div>
            <div className={styles.settingsFooter}><span>{snapshot.courts.length} preview courts</span><ActionButton disabled={!can("settings:update")} onClick={() => save("Courts")}>Save courts</ActionButton></div>
          </div>
        )}
        {section === "rates" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>PHP · Per court</p><h2>Rates & durations</h2></div><span className={styles.previewTag}>Preview values</span></div>
            <div className={styles.rateGrid}>
              <label className={styles.field}><span>Day rate / hour</span><div className={styles.moneyInput}><span>₱</span><input type="number" defaultValue="300" /></div><small>6:00 AM–3:59 PM</small></label>
              <label className={styles.field}><span>Peak rate / hour</span><div className={styles.moneyInput}><span>₱</span><input type="number" defaultValue="400" /></div><small>4:00 PM–10:00 PM</small></label>
              <label className={styles.field}><span>Minimum duration</span><select defaultValue="1"><option value="1">1 hour</option><option value="2">2 hours</option></select></label>
              <label className={styles.field}><span>Maximum duration</span><select defaultValue="3"><option value="2">2 hours</option><option value="3">3 hours</option></select></label>
            </div>
            <div className={styles.settingsFooter}><span>Applies to all {snapshot.courts.length} preview courts</span><ActionButton disabled={!can("settings:update")} onClick={() => save("Rates")}>Save rates</ActionButton></div>
          </div>
        )}
        {section === "hours" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Asia/Manila</p><h2>Operating hours</h2></div><span className={styles.previewTag}>Daily schedule</span></div>
            <div className={styles.hoursList}>
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                <div key={day}><label className={styles.switchLabel}><input type="checkbox" defaultChecked /><span aria-hidden="true" />{day}</label><input aria-label={`${day} opening time`} type="time" defaultValue="06:00" /><span>to</span><input aria-label={`${day} closing time`} type="time" defaultValue="22:00" /></div>
              ))}
            </div>
            <div className={styles.settingsFooter}><span>Customers see times in Manila time</span><ActionButton disabled={!can("settings:update")} onClick={() => save("Hours")}>Save hours</ActionButton></div>
          </div>
        )}
        {section === "rules" && (
          <div className={styles.settingsSection}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Customer policy</p><h2>Booking rules</h2></div><span className={styles.needsTag}>Needs approval</span></div>
            <div className={styles.ruleList}>
              <label className={styles.field}><span>Advance notice</span><select defaultValue="60"><option value="60">At least 60 minutes</option><option value="120">At least 2 hours</option></select></label>
              <label className={styles.field}><span>Booking horizon</span><select defaultValue="30"><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select></label>
              <label className={styles.field}><span>Cancellation policy</span><textarea defaultValue="Customers may cancel unpaid holds. Paid cancellations require owner assistance." rows={3} /></label>
              <label className={styles.field}><span>Rescheduling policy</span><textarea defaultValue="Rescheduling is owner/admin-assisted and subject to live availability." rows={3} /></label>
            </div>
            <div className={styles.noticeBox}><span aria-hidden="true">!</span><p><strong>Approval required.</strong> These rules are draft language and should be reviewed before customer booking is enabled.</p></div>
            <div className={styles.settingsFooter}><span>Last edited in preview</span><ActionButton disabled={!can("settings:update")} onClick={() => save("Booking rules")}>Save rules</ActionButton></div>
          </div>
        )}
      </div>
    </section>
  );
}

function AccessView({
  role,
  capabilities,
  isPreview,
  session,
}: {
  role: TenantRole;
  capabilities: ManagementCapability[];
  isPreview: boolean;
  session?: ManagementSnapshot["session"];
}) {
  return (
    <section className={styles.accessGrid}>
      <article className={styles.panel}>
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>{isPreview ? "Dinktopia team" : "Tenant memberships"}</p><h2>{isPreview ? "4 preview people" : "Membership details unavailable"}</h2></div><span className={styles.previewTag}>{isPreview ? "UI preview" : "Protected"}</span></div>
        {isPreview ? <div className={styles.teamList}>
          {ROLE_TEAM.map((member, index) => (
            <div className={styles.teamRow} key={member.name}>
              <Avatar initials={member.initials} tone={index} />
              <div><strong>{member.name}</strong><span>{member.activity}</span></div>
              <span className={styles.roleBadge}>{ROLE_LABEL[member.role]}</span>
              <button type="button" className={styles.moreButton} aria-label={`Open access options for ${member.name}`}>•••</button>
            </div>
          ))}
        </div> : <div className={styles.statePanel} role="status"><p className={styles.eyebrow}>Membership directory protected</p><h3>No membership records were returned.</h3><p>Invite and membership management will appear only when the shared platform returns an authorized tenant-scoped contract.</p></div>}
        {isPreview && <button type="button" className={styles.inviteButton} disabled>＋ Invite teammate <small>Preview control only</small></button>}
      </article>
      <aside className={cx(styles.panel, styles.capabilityPanel)}>
        <p className={styles.eyebrow}>{isPreview ? "Current preview session" : "Current authenticated session"}</p>
        <div className={styles.sessionRole}>
          <span>{ROLE_LABEL[role].slice(0, 2).toUpperCase()}</span>
          <div>
            <h2>{isPreview ? ROLE_LABEL[role] : session?.isSystemOwner ? "System Owner" : `Tenant ${ROLE_LABEL[role]}`}</h2>
            <p>{isPreview ? `${capabilities.length} preview capabilities` : session?.isSystemOwner ? `${capabilities.length} server capabilities · no tenant membership` : `${capabilities.length} server capabilities · ${session?.membershipRole ?? "no"} membership`}</p>
          </div>
        </div>
        <ul className={styles.capabilityList}>
          {(Object.keys(CAPABILITY_LABEL) as ManagementCapability[]).map((capability) => {
            const granted = capabilities.includes(capability);
            return <li key={capability} className={granted ? styles.granted : styles.notGranted}><span aria-hidden="true">{granted ? "✓" : "—"}</span>{CAPABILITY_LABEL[capability]}</li>;
          })}
        </ul>
        <p className={styles.authorityNote}><strong>{isPreview ? "Preview, not policy." : "Server policy is authoritative."}</strong> {isPreview ? "The production adapter uses capabilities from the authenticated tenant session. This UI does not grant access." : "Unavailable capabilities remain disabled; the browser cannot elevate its own role."}</p>
      </aside>
    </section>
  );
}

function SignInGate({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <main id="main-content" className={styles.signInShell} tabIndex={-1}>
      <section className={styles.signInCard} aria-labelledby="manager-sign-in-title">
        <div className={styles.signInBrand}>
          <span className={styles.logoPlate}>
            <Image
              className={styles.brandLogo}
              src="/dinktopia-logo.png"
              alt=""
              width={2046}
              height={769}
              sizes="180px"
              unoptimized
              priority
            />
          </span>
          <span className={styles.srOnly}>DINKTOPIA</span>
          <span className={styles.signInContext}>Secure tenant workspace</span>
        </div>
        <span className={styles.liveTag}>Live connection</span>
        <p className={styles.eyebrow}>Management access</p>
        <h1 id="manager-sign-in-title">Welcome back.</h1>
        <p className={styles.signInIntro}>Sign in with a System Owner account or an account authorized for Dinktopia. Access is verified by the shared platform.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            try {
              await signInOwner(email, password);
              await onSignedIn();
            } catch {
              setError("The account could not be verified for this workspace.");
            } finally {
              setPending(false);
            }
          }}
        >
          <label className={styles.field}><span>Email</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label className={styles.field}><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <p className={styles.signInError} role="alert">{error}</p>}
          <ActionButton type="submit" disabled={pending} className={styles.fullButton}>{pending ? "Verifying…" : "Sign in securely"}</ActionButton>
        </form>
        <p className={styles.signInFoot}>The browser sends the fixed <strong>dinktopia</strong> slug only. Tenant scope and role permissions are enforced by the server.</p>
      </section>
    </main>
  );
}

export default function ManagePage() {
  const runtimeMode = platformMode();
  const isPreview = runtimeMode === "preview";
  const [view, setView] = useState<View>("overview");
  const [role, setRole] = useState<TenantRole>("owner");
  const [previewState, setPreviewState] = useState<PreviewState>("ready");
  const [snapshot, setSnapshot] = useState<ManagementSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [accountPending, setAccountPending] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const context = useMemo<ManagementContext>(() => ({
    tenantSlug: activeTenant.identity.slug,
    role: isPreview ? role : snapshot?.session.role ?? "host",
    capabilities: isPreview
      ? previewRoleSessions[role]
      : snapshot?.session.capabilities ?? [],
  }), [isPreview, role, snapshot]);
  const sessionRole = context.role;

  const can = (capability: ManagementCapability) => context.capabilities.includes(capability);

  useEffect(() => {
    let active = true;
    managementAdapter.load(context).then((data) => {
      if (active) setSnapshot(data);
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof Error && error.message === "MANAGER_SIGN_IN_REQUIRED") {
        setAuthRequired(true);
      } else {
        setLoadError(true);
      }
    });
    return () => { active = false; };
    // Initial tenant load only; role changes swap the session-shaped capabilities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmAction && !dialog.open) dialog.showModal();
    if (!confirmAction && dialog.open) dialog.close();
  }, [confirmAction]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.tone === "success" ? 5_000 : 9_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const request = (action: ConfirmAction) => setConfirmAction(action);

  const switchAccount = async () => {
    if (isPreview || accountPending) return;
    setAccountPending(true);
    try {
      await signOutOwner();
      window.location.reload();
    } catch {
      setToast({ message: "The session could not be cleared. Refresh and try signing out again.", tone: "error" });
      setAccountPending(false);
    }
  };

  const performConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirmPending(true);
    try {
      const result = await managementAdapter.perform(context, {
        type: confirmAction.actionType,
        resourceId: confirmAction.resourceId,
        payload: confirmAction.payload,
      });
      confirmAction.onSuccess?.();
      if (!isPreview) {
        setRefreshPending(true);
        try {
          const refreshed = await managementAdapter.load(context);
          setSnapshot(refreshed);
        } catch {
          setToast({
            message: `${result.message} The follow-up refresh failed, so refresh the workspace before making another change.`,
            tone: "warning",
          });
          setConfirmAction(null);
          return;
        } finally {
          setRefreshPending(false);
        }
      }
      setToast({ message: result.message, tone: "success" });
      setConfirmAction(null);
    } catch (error) {
      if (error instanceof PlatformRequestError) {
        setToast({
          message: error.code === "SETTINGS_STALE_REFRESH_REQUIRED"
            ? error.message
            : `The server rejected this change: ${error.message}`,
          tone: error.code === "SETTINGS_STALE_REFRESH_REQUIRED"
            ? "warning"
            : "error",
        });
      } else if (error instanceof TypeError) {
        setToast({
          message: "We couldn't confirm the change because the connection ended. The server may have applied it; refresh before retrying.",
          tone: "warning",
        });
      } else {
        setToast({
          message: "The change was blocked before server confirmation. Refresh the authorized workspace and review the entered values.",
          tone: "error",
        });
      }
      setConfirmAction(null);
    } finally {
      setConfirmPending(false);
    }
  };

  const selectedCopy = isPreview ? VIEW_COPY[view] : LIVE_VIEW_COPY[view];
  const requiredCapability = VIEW_CAPABILITY[view];
  const viewPermitted = !requiredCapability || can(requiredCapability);
  const completedSetup = snapshot?.setup.filter((item) => item.complete).length ?? 0;
  const activationPrerequisitesReady = Boolean(
    snapshot?.setup.length && snapshot.setup
      .filter((item) => item.id !== "setup-status" && item.id !== "public-booking")
      .every((item) => item.complete),
  );

  const renderView = () => {
    if (!snapshot) return <DashboardSkeleton />;
    if (previewState === "loading") return <DashboardSkeleton />;
    if (previewState === "empty" || previewState === "error" || previewState === "restricted") {
      return <StatePanel kind={previewState} role={role} isPreview onRestore={() => setPreviewState("ready")} />;
    }
    if (!viewPermitted) return <PermissionPanel role={sessionRole} view={view} isPreview={isPreview} />;
    switch (view) {
      case "overview": return <OverviewView snapshot={snapshot} can={can} goTo={setView} request={request} />;
      case "bookings": return <BookingsView bookings={snapshot.bookings} can={can} request={request} goTo={setView} isPreview={isPreview} />;
      case "schedule": return <ScheduleView snapshot={snapshot} can={can} goTo={setView} />;
      case "blocks": return <BlocksView snapshot={snapshot} can={can} request={request} />;
      case "customers": return <CustomersView snapshot={snapshot} />;
      case "reports": return <ReportsView snapshot={snapshot} />;
      case "settings": return <SettingsView snapshot={snapshot} can={can} request={request} />;
      case "access": return <AccessView role={sessionRole} capabilities={context.capabilities} isPreview={isPreview} session={snapshot.session} />;
    }
  };

  if (authRequired && !isPreview) {
    return (
      <SignInGate
        onSignedIn={async () => {
          const data = await managementAdapter.load(context);
          setSnapshot(data);
          setAuthRequired(false);
        }}
      />
    );
  }

  if (loadError) {
    return <main id="main-content" className={styles.fatalState} tabIndex={-1}><div><StatePanel kind="error" role={role} isPreview={isPreview} onRestore={() => window.location.reload()} />{!isPreview && <ActionButton variant="secondary" disabled={accountPending} onClick={switchAccount}>{accountPending ? "Signing out…" : "Sign out and use another account"}</ActionButton>}</div></main>;
  }

  return (
    <div className={styles.manageShell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.logoPlate}>
            <Image
              className={styles.brandLogo}
              src="/dinktopia-logo.png"
              alt=""
              width={2046}
              height={769}
              sizes="180px"
              unoptimized
              priority
            />
          </span>
          <span className={styles.srOnly}>DINKTOPIA</span>
          <span className={styles.brandContext}>Court operations</span>
        </div>
        <div className={styles.tenantSwitcher}>
          <span>D</span><div><small>Current tenant</small><strong>Dinktopia</strong></div>
          {isPreview && <b aria-hidden="true">⌄</b>}
        </div>
        <nav className={styles.desktopNav} aria-label="Management navigation">
          <p>Workspace</p>
          {NAV_ITEMS.slice(0, 6).map((item) => (
            <button type="button" key={item.id} onClick={() => setView(item.id)} className={view === item.id ? styles.navActive : undefined} aria-current={view === item.id ? "page" : undefined}>
              <span aria-hidden="true">{item.short}</span>{item.label}
              {VIEW_CAPABILITY[item.id] && !can(VIEW_CAPABILITY[item.id]!) && <i aria-label="Limited by role">•</i>}
            </button>
          ))}
          <p>Manage</p>
          {NAV_ITEMS.slice(6).map((item) => (
            <button type="button" key={item.id} onClick={() => setView(item.id)} className={view === item.id ? styles.navActive : undefined} aria-current={view === item.id ? "page" : undefined}>
              <span aria-hidden="true">{item.short}</span>{item.label}
              {VIEW_CAPABILITY[item.id] && !can(VIEW_CAPABILITY[item.id]!) && <i aria-label="Limited by role">•</i>}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.modeCard}>
            <div><span className={styles.modeDot} aria-hidden="true" /><strong>{isPreview ? "Preview mode" : "Live connection"}</strong></div>
            {snapshot ? (
              <>
                <p>{completedSetup} of {snapshot.setup.length} setup checks ready</p>
                <span className={styles.miniProgress}><i style={{ width: `${snapshot.setup.length ? (completedSetup / snapshot.setup.length) * 100 : 0}%` }} /></span>
              </>
            ) : (
              <p>Setup checks loading</p>
            )}
          </div>
          <div className={styles.userCard}>
            <Avatar initials={isPreview ? "AR" : snapshot?.session.isSystemOwner ? "SO" : "TM"} tone={0} />
            <div><strong>{isPreview ? "Alex Rivera" : snapshot?.session.displayName ?? "Authenticated user"}</strong><span>{isPreview ? `${ROLE_LABEL[role]} preview session` : `${ROLE_LABEL[sessionRole]} server session`}</span></div>
            <button
              type="button"
              disabled={isPreview || accountPending}
              onClick={switchAccount}
              aria-label={isPreview ? "Preview account control unavailable" : "Sign out and use another account"}
              title={isPreview ? "Preview account" : "Sign out and switch account"}
            >
              {accountPending ? "…" : isPreview ? "•••" : "↪"}
            </button>
          </div>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.mobileBrand}>
          <div className={styles.brand}>
            <span className={styles.logoPlate}>
              <Image
                className={styles.brandLogo}
                src="/dinktopia-logo.png"
                alt=""
                width={2046}
                height={769}
                sizes="136px"
                unoptimized
                priority
              />
            </span>
            <span className={styles.srOnly}>DINKTOPIA</span>
            <span className={styles.brandContext}>Manage</span>
          </div>
          <span className={styles.previewTag}>{isPreview ? "Preview" : "Live"}</span>
          <button
            type="button"
            className={styles.mobileAvatar}
            disabled={isPreview || accountPending}
            onClick={switchAccount}
            aria-label={isPreview ? "Preview account control unavailable" : "Sign out and use another account"}
          >
            {accountPending ? "…" : isPreview ? "AR" : "↪"}
          </button>
        </header>
        <nav className={styles.mobileNav} aria-label="Mobile management navigation">
          {NAV_ITEMS.map((item) => (
            <button type="button" key={item.id} onClick={() => setView(item.id)} className={view === item.id ? styles.navActive : undefined} aria-current={view === item.id ? "page" : undefined}>
              <span aria-hidden="true">{item.short}</span>{item.label}
            </button>
          ))}
        </nav>

        <div className={styles.topbar}>
          <div className={styles.statusLine}>
            <span className={styles.previewMode}><i aria-hidden="true" /> {isPreview ? "Preview" : "Live"}</span>
            <span>{isPreview ? "Bookings are not public" : snapshot ? "Authenticated tenant data" : "Connecting to tenant data"}</span>
            <span className={styles.syncText}>{snapshot ? `Synced ${snapshot.tenant.lastSynced}` : "Sync pending"}</span>
          </div>
          {isPreview ? (
            <div className={styles.previewControls} aria-label="Non-authoritative preview controls">
              <span className={styles.previewControlsLabel}>UI preview only</span>
              <label><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value as TenantRole)}>{(Object.keys(ROLE_LABEL) as TenantRole[]).map((item) => <option value={item} key={item}>{ROLE_LABEL[item]}</option>)}</select></label>
              <label><span>State</span><select value={previewState} onChange={(event) => setPreviewState(event.target.value as PreviewState)}><option value="ready">Ready</option><option value="loading">Loading</option><option value="empty">Empty</option><option value="error">Error</option><option value="restricted">Restricted</option></select></label>
            </div>
          ) : <span className={styles.liveReadOnly}>Live · writes capability-gated</span>}
        </div>

        <main id="main-content" className={styles.main} tabIndex={-1}>
          <header className={styles.pageHeader}>
            <div>
              <p className={styles.eyebrow}>{selectedCopy.eyebrow}</p>
              <h1>{selectedCopy.title}</h1>
              <p>{selectedCopy.description}</p>
            </div>
            <div className={styles.pageActions}>
              {isPreview && <button type="button" className={styles.iconButton} aria-label="Preview search control">⌕</button>}
              {isPreview && <button type="button" className={styles.iconButton} aria-label="Preview notifications">◎<span>2</span></button>}
              {isPreview && view === "overview" && <ActionButton disabled={!can("booking:create")} onClick={() => setView("schedule")}><span aria-hidden="true">＋</span> New booking</ActionButton>}
              {view === "settings" && (
                <ActionButton
                  variant="secondary"
                  disabled={
                    !can("tenant:publish") || !activationPrerequisitesReady
                  }
                  onClick={() => request({ title: isPreview ? "Request live activation?" : "Activate public booking?", detail: isPreview ? "A final tenant, payment and policy review is required before public bookings can open." : "The platform will recheck every launch prerequisite atomically. Only the global System Owner can complete initial activation.", confirmLabel: isPreview ? "Request activation" : "Activate Dinktopia", actionType: "tenant:publish" })}
                >
                  Go live
                </ActionButton>
              )}
            </div>
          </header>

          {renderView()}
          <footer className={styles.pageFooter}>
            <span>Dinktopia tenant {isPreview ? "preview" : "workspace"}</span><span>Asia/Manila · PHP</span><span>Server policy remains authoritative</span>
          </footer>
        </main>
      </div>

      <dialog
        ref={dialogRef}
        className={cx(styles.confirmDialog, confirmPending && styles.dialogBusy)}
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
        aria-busy={confirmPending}
        onCancel={(event) => { event.preventDefault(); if (!confirmPending) setConfirmAction(null); }}
        onClose={() => { if (!confirmPending) setConfirmAction(null); }}
      >
        {confirmAction && (
          <div>
            <button type="button" className={styles.dialogClose} onClick={() => setConfirmAction(null)} disabled={confirmPending} aria-label="Close confirmation">×</button>
            <span className={cx(styles.dialogMark, confirmAction.tone === "danger" && styles.dialogDanger)} aria-hidden="true">{confirmAction.tone === "danger" ? "!" : "✓"}</span>
            <p className={styles.eyebrow}>Confirm before continuing</p>
            <h2 id="confirm-title">{confirmAction.title}</h2>
            <p id="confirm-description">{confirmAction.detail}</p>
            <div className={styles.dialogSummary}><span>Tenant</span><strong>Dinktopia</strong><span>Mode</span><strong>{isPreview ? "Preview · no live write" : "Live · server-authorized write"}</strong></div>
            <div className={styles.dialogActions}>
              <ActionButton variant="quiet" disabled={confirmPending} onClick={() => setConfirmAction(null)}>Go back</ActionButton>
              <ActionButton variant={confirmAction.tone === "danger" ? "danger" : "primary"} disabled={confirmPending} onClick={performConfirmedAction}>{refreshPending ? "Refreshing workspace…" : confirmPending ? "Saving…" : confirmAction.confirmLabel}</ActionButton>
            </div>
          </div>
        )}
      </dialog>

      <div
        className={cx(
          styles.toast,
          toast && styles.toastVisible,
          toast?.tone === "success" && styles.toastSuccess,
          toast?.tone === "error" && styles.toastError,
          toast?.tone === "warning" && styles.toastWarning,
        )}
        role={toast ? (toast.tone === "success" ? "status" : "alert") : undefined}
        aria-live={toast ? (toast.tone === "success" ? "polite" : "assertive") : "off"}
      >
        <span className={styles.toastIcon} aria-hidden="true">{toast?.tone === "success" ? "✓" : toast?.tone === "warning" ? "!" : "×"}</span>
        <span className={styles.toastMessage}>{toast?.message}</span>
      </div>
    </div>
  );
}
