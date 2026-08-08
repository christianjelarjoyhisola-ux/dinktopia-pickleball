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
  managementAdapter,
  previewRoleSessions,
  type Booking,
  type BookingStatus,
  type ManagementCapability,
  type ManagementContext,
  type ManagementSnapshot,
  type TenantRole,
} from "./management-adapter";
import { platformMode, signInOwner, signOutOwner } from "../lib/platform/client";
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
  tone?: "default" | "danger";
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
  blocks: "schedule:block",
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
    description: "Review the active reservations returned for the authenticated tenant session.",
  },
  schedule: {
    eyebrow: "Read-only operations",
    title: "Loaded schedule",
    description: "Review active bookings and court blocks without assuming unavailable inventory.",
  },
  blocks: {
    eyebrow: "Protected availability",
    title: "Court blocks",
    description: "Block data and controls appear only when authorized by the shared platform.",
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
    eyebrow: "Server-controlled setup",
    title: "Venue settings",
    description: "Live configuration stays locked until an authorized write contract is returned.",
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
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], className)}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-describedby={disabled ? "permission-note" : undefined}
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
  const nextBookings = snapshot.bookings.slice(0, 3);
  const isPreview = snapshot.tenant.mode === "preview";
  const readinessItems = isPreview ? snapshot.setup.slice(4) : snapshot.setup;
  const paidRevenue = snapshot.bookings
    .filter((booking) => booking.payment === "paid")
    .reduce((total, booking) => total + booking.amount, 0);
  const awaitingPayment = snapshot.bookings.find(
    (booking) => booking.status === "awaiting_payment",
  );

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
          <MetricCard label="Active blocks" value={String(snapshot.blocks.length)} note="Tenant-scoped blocks in the current result" />
        )}
        <MetricCard label="Bookings" value={String(snapshot.bookings.length)} note={`${snapshot.bookings.filter((booking) => booking.payment === "paid").length} paid · ${snapshot.bookings.filter((booking) => booking.payment === "unpaid").length} awaiting payment`} />
        <MetricCard label="Players" value={String(snapshot.customers.length)} note={isPreview ? "Preview customer profiles" : "Derived from the loaded bookings"} />
      </section>

      <section className={styles.overviewGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.eyebrow}>{isPreview ? "Preview court flow" : "Latest court flow"}</p>
              <h2>Next on court</h2>
            </div>
            <button className={styles.textButton} type="button" onClick={() => goTo("schedule")}>
              Full schedule <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className={styles.nextList}>
            {nextBookings.map((booking, index) => (
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
                    aria-describedby={!can("booking:check-in") ? "permission-note" : undefined}
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
            {nextBookings.length === 0 && (
              <div className={styles.statePanel} role="status">
                <p className={styles.eyebrow}>No active bookings</p>
                <h3>The next reservation will appear here.</h3>
              </div>
            )}
          </div>
          <div className={styles.flowFooter}>
            <span className={styles.livePulse} aria-hidden="true" />
            <span>
              {isPreview
                ? `${snapshot.courts.length} ${snapshot.courts.length === 1 ? "court" : "courts"} loaded`
                : `${snapshot.bookings.length} active ${snapshot.bookings.length === 1 ? "booking" : "bookings"} loaded`}
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
          <h2 id="focus-title">{awaitingPayment ? "A payment needs review" : "Setup remains protected"}</h2>
          <p>{awaitingPayment ? `${awaitingPayment.customer} has an unpaid ${awaitingPayment.duration} reservation.` : "Complete the remaining readiness checks before public booking is activated."}</p>
        </div>
        <ActionButton
          variant="secondary"
          disabled={!can("booking:update")}
          onClick={() => goTo("bookings")}
        >
          {awaitingPayment ? "Review payment" : "Review bookings"}
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
                      {booking.payment}
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
            <p className={styles.eyebrow}>Read-only tenant result</p>
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
                  <strong>{block.reason}</strong>
                  <span>{block.court} · {block.createdBy}</span>
                </div>
                <span className={styles.previewTag}>Block</span>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.inlineEmpty} role="status">
            <span aria-hidden="true">00</span>
            <h3>No active schedule entries were returned</h3>
            <p>The workspace does not substitute preview reservations or court blocks.</p>
          </div>
        )}
        <div className={styles.flowFooter}>
          <span className={styles.livePulse} aria-hidden="true" />
          <span>Tenant-scoped reads</span>
          <span>·</span>
          <span>Schedule writes remain locked</span>
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
  const [court, setCourt] = useState("Court 01");
  const [date, setDate] = useState("2026-08-10");
  const [from, setFrom] = useState("12:00");
  const [to, setTo] = useState("13:00");
  const [reason, setReason] = useState("Court maintenance");

  if (snapshot.tenant.mode === "live") {
    return (
      <section className={styles.panel} aria-labelledby="live-blocks-title">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>Read-only tenant result</p>
            <h2 id="live-blocks-title">Loaded court blocks</h2>
          </div>
          <span className={styles.countBadge}>{snapshot.blocks.length}</span>
        </div>
        {snapshot.blocks.length ? (
          <div className={styles.blockList}>
            {snapshot.blocks.map((block, index) => (
              <article className={styles.blockItem} key={block.id}>
                <Avatar initials="BL" tone={index} />
                <div className={styles.blockInfo}>
                  <strong>{block.reason}</strong>
                  <span>{block.court} · {block.date} · {block.time}</span>
                  <small>{block.createdBy}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.inlineEmpty} role="status">
            <span aria-hidden="true">00</span>
            <h3>No active court blocks were returned</h3>
            <p>No preview maintenance windows are shown in this live session.</p>
          </div>
        )}
        <div className={styles.noticeBox}>
          <span aria-hidden="true">i</span>
          <p>
            <strong>Writes are locked.</strong> Creating or removing blocks stays unavailable until
            the platform returns an authorized tenant mutation contract.
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
          request({
            title: `Block ${court}?`,
            detail: `${date}, ${from}–${to} for “${reason}”. The server will recheck conflicts before saving.`,
            confirmLabel: "Create block",
            actionType: "schedule:block",
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
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Court</span>
            <select value={court} onChange={(event) => setCourt(event.target.value)}>
              <option>Court 01</option>
              <option>Court 02</option>
              <option>Both courts</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Date</span>
            <input type="date" value={date} min="2026-08-08" onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>From</span>
            <input type="time" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>To</span>
            <input type="time" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className={cx(styles.field, styles.fieldWide)}>
            <span>Reason</span>
            <input value={reason} maxLength={80} onChange={(event) => setReason(event.target.value)} />
            <small>Visible to your operations team, not customers.</small>
          </label>
        </div>
        <div className={styles.noticeBox}>
          <span aria-hidden="true">i</span>
          <p><strong>Conflict-safe.</strong> A final availability check runs before the block is created. Existing paid bookings are never silently displaced.</p>
        </div>
        <ActionButton type="submit" disabled={!can("schedule:block")}>
          Review court block
        </ActionButton>
      </form>

      <aside className={styles.panel} aria-labelledby="active-blocks-title">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>Upcoming</p>
            <h2 id="active-blocks-title">Active blocks</h2>
          </div>
          <span className={styles.countBadge}>{snapshot.blocks.length}</span>
        </div>
        <div className={styles.blockList}>
          {snapshot.blocks.map((block) => (
            <article className={styles.blockItem} key={block.id}>
              <div className={styles.blockDate}>
                <span>AUG</span>
                <strong>{block.date.match(/\d+/)?.[0]}</strong>
              </div>
              <div className={styles.blockInfo}>
                <strong>{block.reason}</strong>
                <span>{block.court} · {block.time}</span>
                <small>{block.createdBy}</small>
              </div>
              <button
                type="button"
                className={styles.removeButton}
                disabled={!can("schedule:block")}
                aria-label={`Remove block ${block.id}`}
                onClick={() => request({
                  title: "Remove this court block?",
                  detail: `${block.court} will become bookable again on ${block.date}, ${block.time}.`,
                  confirmLabel: "Remove block",
                  actionType: "schedule:unblock",
                  resourceId: block.id,
                  tone: "danger",
                })}
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      </aside>
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
                <div><span className={styles.mobileLabel}>Value</span><strong>{formatPeso(customer.lifetimeValue)}</strong><small>lifetime</small></div>
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
    const unpaid = snapshot.bookings.filter((booking) => booking.payment === "unpaid");
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
              <div><span>Awaiting payment</span><strong>{unpaid.length}</strong><small>Requires owner review</small></div>
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
      <section className={styles.panel} aria-labelledby="live-settings-title">
        <div className={styles.panelHeading}><div><p className={styles.eyebrow}>Server-controlled setup</p><h2 id="live-settings-title">Live settings are write-locked</h2></div><span className={styles.needsTag}>Setup required</span></div>
        <p>Courts, rates, hours, payment details and public rules remain protected until an owner is provisioned and the shared platform returns an authorized write contract.</p>
        <ul className={styles.readinessList}>
          {snapshot.setup.map((item) => <li key={item.id}><span className={styles.todoMark} aria-hidden="true">{item.complete ? "✓" : ""}</span><div><strong>{item.label}</strong><span>{item.detail}</span></div></li>)}
        </ul>
      </section>
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
            <div className={styles.settingsFooter}><span>2 preview courts</span><ActionButton disabled={!can("settings:update")} onClick={() => save("Courts")}>Save courts</ActionButton></div>
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
            <div className={styles.settingsFooter}><span>Applies to both preview courts</span><ActionButton disabled={!can("settings:update")} onClick={() => save("Rates")}>Save rates</ActionButton></div>
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

function AccessView({ role, capabilities, isPreview }: { role: TenantRole; capabilities: ManagementCapability[]; isPreview: boolean }) {
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
          <span>{isPreview ? ROLE_LABEL[role].slice(0, 2).toUpperCase() : "—"}</span>
          <div>
            <h2>{isPreview ? ROLE_LABEL[role] : "Role not exposed"}</h2>
            <p>{isPreview ? `${capabilities.length} preview capabilities` : "No authoritative capabilities returned"}</p>
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
              priority
            />
          </span>
          <span className={styles.srOnly}>DINKTOPIA</span>
          <span className={styles.signInContext}>Secure tenant workspace</span>
        </div>
        <span className={styles.liveTag}>Live connection</span>
        <p className={styles.eyebrow}>Management access</p>
        <h1 id="manager-sign-in-title">Welcome back.</h1>
        <p className={styles.signInIntro}>Sign in with an account already assigned to the Dinktopia tenant. Access is verified by the shared platform.</p>
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
  const [accountPending, setAccountPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const context = useMemo<ManagementContext>(() => ({
    tenantSlug: activeTenant.identity.slug,
    role,
    capabilities: isPreview ? previewRoleSessions[role] : [],
  }), [isPreview, role]);

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
    const timer = window.setTimeout(() => setToast(null), 4200);
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
      setToast("The session could not be cleared. Refresh and try signing out again.");
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
      });
      setToast(result.message);
      setConfirmAction(null);
    } catch {
      setToast("This action was not sent. Refresh your authorized tenant session and try again.");
      setConfirmAction(null);
    } finally {
      setConfirmPending(false);
    }
  };

  const selectedCopy = isPreview ? VIEW_COPY[view] : LIVE_VIEW_COPY[view];
  const requiredCapability = VIEW_CAPABILITY[view];
  const viewPermitted = !requiredCapability || can(requiredCapability);
  const completedSetup = snapshot?.setup.filter((item) => item.complete).length ?? 0;

  const renderView = () => {
    if (!snapshot) return <DashboardSkeleton />;
    if (previewState === "loading") return <DashboardSkeleton />;
    if (previewState === "empty" || previewState === "error" || previewState === "restricted") {
      return <StatePanel kind={previewState} role={role} isPreview onRestore={() => setPreviewState("ready")} />;
    }
    if (!viewPermitted) return <PermissionPanel role={role} view={view} isPreview={isPreview} />;
    switch (view) {
      case "overview": return <OverviewView snapshot={snapshot} can={can} goTo={setView} request={request} />;
      case "bookings": return <BookingsView bookings={snapshot.bookings} can={can} request={request} goTo={setView} isPreview={isPreview} />;
      case "schedule": return <ScheduleView snapshot={snapshot} can={can} goTo={setView} />;
      case "blocks": return <BlocksView snapshot={snapshot} can={can} request={request} />;
      case "customers": return <CustomersView snapshot={snapshot} />;
      case "reports": return <ReportsView snapshot={snapshot} />;
      case "settings": return <SettingsView snapshot={snapshot} can={can} request={request} />;
      case "access": return <AccessView role={role} capabilities={context.capabilities} isPreview={isPreview} />;
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
            <Avatar initials={isPreview ? "AR" : "AU"} tone={0} />
            <div><strong>{isPreview ? "Alex Rivera" : "Authenticated user"}</strong><span>{isPreview ? `${ROLE_LABEL[role]} preview session` : "Switch account securely"}</span></div>
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
          ) : <span className={styles.liveReadOnly}>Live reads · writes gated</span>}
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
              {isPreview && view === "settings" && (
                <ActionButton
                  variant="secondary"
                  disabled={!can("tenant:publish") || completedSetup < 8}
                  onClick={() => request({ title: "Request live activation?", detail: "A final tenant, payment and policy review is required before public bookings can open.", confirmLabel: "Request activation", actionType: "tenant:publish" })}
                >
                  Go live
                </ActionButton>
              )}
            </div>
          </header>

          <p id="permission-note" className={styles.srOnly}>This action is unavailable for the current tenant session or setup status.</p>
          {renderView()}
          <footer className={styles.pageFooter}>
            <span>Dinktopia tenant {isPreview ? "preview" : "workspace"}</span><span>Asia/Manila · PHP</span><span>Server policy remains authoritative</span>
          </footer>
        </main>
      </div>

      <dialog
        ref={dialogRef}
        className={styles.confirmDialog}
        aria-labelledby="confirm-title"
        onCancel={(event) => { event.preventDefault(); if (!confirmPending) setConfirmAction(null); }}
        onClose={() => { if (!confirmPending) setConfirmAction(null); }}
      >
        {confirmAction && (
          <div>
            <button type="button" className={styles.dialogClose} onClick={() => setConfirmAction(null)} disabled={confirmPending} aria-label="Close confirmation">×</button>
            <span className={cx(styles.dialogMark, confirmAction.tone === "danger" && styles.dialogDanger)} aria-hidden="true">{confirmAction.tone === "danger" ? "!" : "✓"}</span>
            <p className={styles.eyebrow}>Confirm before continuing</p>
            <h2 id="confirm-title">{confirmAction.title}</h2>
            <p>{confirmAction.detail}</p>
            <div className={styles.dialogSummary}><span>Tenant</span><strong>Dinktopia</strong><span>Mode</span><strong>{isPreview ? "Preview · no live write" : "Live · write unavailable"}</strong></div>
            <div className={styles.dialogActions}>
              <ActionButton variant="quiet" disabled={confirmPending} onClick={() => setConfirmAction(null)}>Go back</ActionButton>
              <ActionButton variant={confirmAction.tone === "danger" ? "danger" : "primary"} disabled={confirmPending} onClick={performConfirmedAction}>{confirmPending ? "Working…" : confirmAction.confirmLabel}</ActionButton>
            </div>
          </div>
        )}
      </dialog>

      <div className={cx(styles.toast, toast && styles.toastVisible)} role="status" aria-live="polite">
        <span aria-hidden="true">✓</span>{toast}
      </div>
    </div>
  );
}
