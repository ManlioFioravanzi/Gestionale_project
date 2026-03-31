import type { DashboardSnapshot } from "@booking/core";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { useState } from "react";
import type { AppLanguage } from "../i18n";
import type { DesktopTheme } from "../theme";

type PerformancePeriod = "last7" | "last30" | "thisMonth" | "lastMonth";

function getPeriodRange(period: PerformancePeriod) {
  const now = new Date();

  if (period === "last7") {
    return {
      start: startOfDay(subDays(now, 6)),
      end: endOfDay(now),
    };
  }

  if (period === "thisMonth") {
    return {
      start: startOfMonth(now),
      end: endOfDay(now),
    };
  }

  if (period === "lastMonth") {
    const previousMonth = subMonths(now, 1);
    return {
      start: startOfMonth(previousMonth),
      end: endOfMonth(previousMonth),
    };
  }

  return {
    start: startOfDay(subDays(now, 29)),
    end: endOfDay(now),
  };
}

function weekdayIndex(date: Date) {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export function DashboardPerformance({
  snapshot,
  language,
  locale,
  theme,
}: {
  snapshot: DashboardSnapshot;
  language: AppLanguage;
  locale: string;
  theme: DesktopTheme;
}) {
  const [period, setPeriod] = useState<PerformancePeriod>("last30");
  const chartPalette = theme.chartPalette;
  const formatTooltipValue = (value: unknown) => Array.isArray(value) ? value[0] ?? 0 : value ?? 0;
  const currencyFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: snapshot.tenant.currency,
    maximumFractionDigits: 2,
  });
  const copy =
    language === "en"
      ? {
          period: "Period",
          headerTitle: "Performance",
          headerBody: "Operational and financial trends for the selected period.",
          revenueTitle: "Revenue trend",
          revenueBody: "Daily revenue in currency",
          bookingsTitle: "Bookings by weekday",
          bookingsBody: "How bookings are distributed across the week",
          depositsTitle: "Deposit conversion",
          depositsBody: "Paid vs pending vs refunded",
          methodsTitle: "Payment methods",
          methodsBody: "Processed volume in the selected period",
          volume: "Volume",
          dateLabel: (label: string) => `Date ${label}`,
          methodLabel: (label: string) => `Method ${label}`,
          periods: {
            last7: "Last 7 days",
            last30: "Last 30 days",
            thisMonth: "This month",
            lastMonth: "Last month",
          },
          weekdayLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
          depositLabels: {
            paid: "Paid",
            pending: "Pending",
            refunded: "Refunded",
          },
          bookingsTooltip: (value: unknown) => [`${formatTooltipValue(value)} bookings`, "Volume"],
          manualLabel: "Manual",
        }
      : {
          period: "Periodo",
          headerTitle: "Performance",
          headerBody: "Monitoraggio trend operativi e finanziari per il periodo selezionato.",
          revenueTitle: "Andamento fatturato",
          revenueBody: "Incassato giornaliero in euro",
          bookingsTitle: "Prenotazioni per giorno della settimana",
          bookingsBody: "Distribuzione dei picchi operativi",
          depositsTitle: "Tasso di conversione caparre",
          depositsBody: "Pagate vs in attesa vs rimborsate",
          methodsTitle: "Metodi di pagamento",
          methodsBody: "Volume transato nel periodo",
          volume: "Volume",
          dateLabel: (label: string) => `Data ${label}`,
          methodLabel: (label: string) => `Metodo ${label}`,
          periods: {
            last7: "Ultimi 7 giorni",
            last30: "Ultimi 30 giorni",
            thisMonth: "Questo mese",
            lastMonth: "Mese scorso",
          },
          weekdayLabels: ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"],
          depositLabels: {
            paid: "Pagate",
            pending: "In attesa",
            refunded: "Rimborsate",
          },
          bookingsTooltip: (value: unknown) => [`${formatTooltipValue(value)} prenotazioni`, "Volume"],
          manualLabel: "Manuale",
        };

  const range = getPeriodRange(period);
  const rangeDays = eachDayOfInterval({
    start: startOfDay(range.start),
    end: startOfDay(range.end),
  });

  const filteredPayments = snapshot.payments.filter((payment) => {
    const referenceDate = parseISO(payment.updatedAt);
    return referenceDate >= range.start && referenceDate <= range.end;
  });

  const filteredBookings = snapshot.bookings.filter((booking) => {
    const bookingDate = parseISO(booking.startsAt);
    return bookingDate >= range.start && bookingDate <= range.end;
  });

  const revenueByDay = new Map<string, number>();
  for (const payment of filteredPayments) {
    if (payment.status !== "paid") {
      continue;
    }

    const dayKey = format(parseISO(payment.updatedAt), "yyyy-MM-dd");
    revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + payment.amountCents);
  }

  const revenueData = rangeDays.map((day) => {
    const dayKey = format(day, "yyyy-MM-dd");
    const amountCents = revenueByDay.get(dayKey) ?? 0;

    return {
      date: format(day, "dd/MM"),
      amount: amountCents / 100,
      amountCents,
    };
  });

  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const booking of filteredBookings) {
    weekdayCounts[weekdayIndex(parseISO(booking.startsAt))] += 1;
  }
  const bookingsByWeekdayData = copy.weekdayLabels.map((day, index) => ({
    day,
    bookings: weekdayCounts[index],
  }));

  let paidDeposits = 0;
  let pendingDeposits = 0;
  let refundedDeposits = 0;

  for (const payment of filteredPayments) {
    if (payment.status === "paid") {
      paidDeposits += 1;
      continue;
    }

    if (payment.status === "refunded") {
      refundedDeposits += 1;
      continue;
    }

    pendingDeposits += 1;
  }

  const totalDeposits = paidDeposits + pendingDeposits + refundedDeposits;

  const depositsData = [
    { name: copy.depositLabels.paid, value: paidDeposits, color: chartPalette.green },
    { name: copy.depositLabels.pending, value: pendingDeposits, color: chartPalette.amber },
    { name: copy.depositLabels.refunded, value: refundedDeposits, color: chartPalette.orange },
  ];

  let stripeVolumeCents = 0;
  let manualVolumeCents = 0;
  for (const payment of filteredPayments) {
    if (payment.provider === "stripe") {
      stripeVolumeCents += payment.amountCents;
      continue;
    }
    manualVolumeCents += payment.amountCents;
  }

  const paymentMethodData = [
    { method: "Stripe", amount: stripeVolumeCents / 100, color: chartPalette.navy },
    { method: copy.manualLabel, amount: manualVolumeCents / 100, color: chartPalette.blue },
  ];

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{copy.headerTitle}</h3>
          <p className="mt-1 text-sm text-slate-500">{copy.headerBody}</p>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {copy.period}
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as PerformancePeriod)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {(["last7", "last30", "thisMonth", "lastMonth"] as PerformancePeriod[]).map((option) => (
              <option key={option} value={option}>
                {copy.periods[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">{copy.revenueTitle}</h4>
          <p className="mt-1 text-xs text-slate-500">{copy.revenueBody}</p>
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenue-area-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartPalette.blue} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={chartPalette.blue} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                <XAxis dataKey="date" tick={{ fill: chartPalette.slate, fontSize: 12 }} />
                <YAxis
                  tickFormatter={(value) => `€${Math.round(value)}`}
                  tick={{ fill: chartPalette.slate, fontSize: 12 }}
                  width={48}
                />
                <Tooltip
                  formatter={(value) => currencyFormatter.format(Number(value))}
                  labelFormatter={(label) => copy.dateLabel(String(label))}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: "#cbd5e1",
                    backgroundColor: "#ffffff",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke={chartPalette.blue}
                  strokeWidth={2.5}
                  fill="url(#revenue-area-fill)"
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">{copy.bookingsTitle}</h4>
          <p className="mt-1 text-xs text-slate-500">{copy.bookingsBody}</p>
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bookingsByWeekdayData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: chartPalette.slate, fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: chartPalette.slate, fontSize: 12 }} width={30} />
                <Tooltip
                  formatter={(value) => copy.bookingsTooltip(value ?? 0)}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: "#cbd5e1",
                    backgroundColor: "#ffffff",
                  }}
                />
                <Bar dataKey="bookings" radius={[8, 8, 0, 0]} fill={chartPalette.navy} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">{copy.depositsTitle}</h4>
          <p className="mt-1 text-xs text-slate-500">{copy.depositsBody}</p>
          <div className="mt-3 h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={depositsData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={56}
                  outerRadius={82}
                  paddingAngle={3}
                >
                  {depositsData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => {
                    const numericValue = Number(value);
                    const percentage = totalDeposits > 0 ? Math.round((numericValue / totalDeposits) * 100) : 0;
                    return [`${numericValue} (${percentage}%)`, name];
                  }}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: "#cbd5e1",
                    backgroundColor: "#ffffff",
                  }}
                />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <h4 className="text-sm font-semibold text-slate-900">{copy.methodsTitle}</h4>
          <p className="mt-1 text-xs text-slate-500">{copy.methodsBody}</p>
          <div className="mt-3 h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={paymentMethodData}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" horizontal={false} />
                <XAxis type="number" tick={{ fill: chartPalette.slate, fontSize: 12 }} />
                <YAxis
                  dataKey="method"
                  type="category"
                  tick={{ fill: chartPalette.slate, fontSize: 12 }}
                  width={60}
                />
                <Tooltip
                  formatter={(value) => currencyFormatter.format(Number(value))}
                  labelFormatter={(label) => copy.methodLabel(String(label))}
                  contentStyle={{
                    borderRadius: 10,
                    borderColor: "#cbd5e1",
                    backgroundColor: "#ffffff",
                  }}
                />
                <Bar dataKey="amount" radius={[0, 8, 8, 0]}>
                  {paymentMethodData.map((entry) => (
                    <Cell key={entry.method} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
    </section>
  );
}
